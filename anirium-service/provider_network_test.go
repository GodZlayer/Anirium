package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"strings"
	"testing"
)

func allowLocalProviderForTest(t *testing.T, origin string) {
	t.Helper()
	previous := os.Getenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS")
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", strings.Trim(previous+","+origin, ","))
}

func TestProviderNetworkRejectsSpecialAddresses(t *testing.T) {
	for _, raw := range []string{"0.0.0.0", "127.1.2.3", "10.1.2.3", "100.100.100.200", "169.254.169.254", "172.31.0.1", "192.168.1.1", "192.0.0.8", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1%eth0", "ff02::1", "64:ff9b::a00:1", "2001::1", "2001:db8::1", "2002:7f00:1::", "3fff::1"} {
		if publicProviderIP(netip.MustParseAddr(raw)) {
			t.Errorf("special address allowed: %s", raw)
		}
	}
	for _, raw := range []string{"8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"} {
		if !publicProviderIP(netip.MustParseAddr(raw)) {
			t.Errorf("public address denied: %s", raw)
		}
	}
}

func TestProviderDNSMixedAnswersNeverDial(t *testing.T) {
	for _, private := range []string{"127.0.0.1", "169.254.169.254", "168.63.129.16", "::ffff:10.0.0.1", "fc00::1"} {
		calls := 0
		d := providerNetworkDialer{lookup: func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("8.8.8.8"), netip.MustParseAddr(private)}, nil
		}, dial: func(context.Context, string, string) (net.Conn, error) { calls++; return nil, fmt.Errorf("unexpected") }}
		if _, err := d.DialContext(context.Background(), "tcp", "provider.example:443"); err == nil || calls != 0 {
			t.Fatal("mixed DNS answer reached a socket")
		}
	}
}

func TestProviderDNSIsResolvedOnceAndPinned(t *testing.T) {
	lookups := 0
	var addresses []string
	clientSide, peer := net.Pipe()
	defer clientSide.Close()
	defer peer.Close()
	d := providerNetworkDialer{lookup: func(context.Context, string) ([]netip.Addr, error) {
		lookups++
		if lookups > 1 {
			return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
		}
		return []netip.Addr{netip.MustParseAddr("8.8.8.8"), netip.MustParseAddr("1.1.1.1")}, nil
	}, dial: func(_ context.Context, _ string, address string) (net.Conn, error) {
		addresses = append(addresses, address)
		if len(addresses) == 1 {
			return nil, fmt.Errorf("first IP unavailable")
		}
		return clientSide, nil
	}}
	if _, err := d.DialContext(context.Background(), "tcp", "provider.example:443"); err != nil {
		t.Fatal(err)
	}
	if lookups != 1 || strings.Join(addresses, ",") != "8.8.8.8:443,1.1.1.1:443" {
		t.Fatalf("resolution not pinned: %d %v", lookups, addresses)
	}
}

func TestProviderLocalExceptionIsExactAndLocalOnly(t *testing.T) {
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", "http://127.0.0.1:12345,http://[::1]:54321,http://localhost:7777,http://10.0.0.1:80,http://127.0.0.1:99/path")
	for _, address := range []string{"127.0.0.1:12345", "[::1]:54321"} {
		if !trustedLocalProvider(address) {
			t.Fatal("explicit loopback denied")
		}
	}
	for _, address := range []string{"127.0.0.1:12346", "localhost:7777", "10.0.0.1:80", "127.0.0.1:99"} {
		if trustedLocalProvider(address) {
			t.Fatal("exception widened")
		}
	}
	calls := 0
	d := providerNetworkDialer{dial: func(context.Context, string, string) (net.Conn, error) { calls++; return nil, fmt.Errorf("unexpected") }}
	// A configured HTTP exception must not grant HTTPS or direct dial callers.
	if _, err := d.DialContext(context.Background(), "tcp", "127.0.0.1:12345"); err == nil || calls != 0 {
		t.Fatal("HTTP exception escaped request context")
	}
}

func TestProductionProviderClientBlocksLoopbackBeforeContact(t *testing.T) {
	calls := 0
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { calls++ }))
	defer target.Close()
	t.Setenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS", "")
	for _, address := range []string{target.URL, strings.Replace(target.URL, "http:", "https:", 1), "http://user:pass@127.0.0.1:80", "file:///etc/passwd"} {
		if response, err := providerHTTPClient.Get(address); err == nil {
			response.Body.Close()
			t.Fatalf("unsafe endpoint accepted: %s", address)
		}
	}
	if calls != 0 {
		t.Fatal("loopback target contacted")
	}
}

func TestProviderTransportDoesNotUseEnvironmentProxy(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:9999")
	client := newProviderHTTPClient()
	transport := client.Transport.(providerTransport).transport
	if transport.Proxy != nil || transport.DialTLSContext != nil || transport.TLSClientConfig.InsecureSkipVerify || transport.TLSClientConfig.MinVersion < 0x0303 {
		t.Fatal("transport bypasses network/TLS policy")
	}
}

func TestProviderPinnedTLSVerifiesCertificateAndPreservesHostname(t *testing.T) {
	var receivedHost string
	target := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { receivedHost = r.Host; fmt.Fprint(w, "ok") }))
	defer target.Close()
	host := target.Certificate().DNSNames[0]
	_, port, _ := net.SplitHostPort(target.Listener.Addr().String())
	endpoint := "https://" + net.JoinHostPort(host, port)
	client := newProviderHTTPClient()
	transport := client.Transport.(providerTransport).transport
	d := providerNetworkDialer{lookup: func(context.Context, string) ([]netip.Addr, error) {
		return []netip.Addr{netip.MustParseAddr("8.8.8.8")}, nil
	},
		dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			if address != net.JoinHostPort("8.8.8.8", port) {
				t.Errorf("not pinned: %s", address)
			}
			return (&net.Dialer{}).DialContext(ctx, network, target.Listener.Addr().String())
		}}
	transport.DialContext = d.DialContext
	defer transport.CloseIdleConnections()
	if response, err := client.Get(endpoint); err == nil {
		response.Body.Close()
		t.Fatal("untrusted certificate accepted")
	}
	roots := x509.NewCertPool()
	roots.AddCert(target.Certificate())
	transport.TLSClientConfig.RootCAs = roots
	response, err := client.Get(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, response.Body)
	response.Body.Close()
	if receivedHost != net.JoinHostPort(host, port) {
		t.Fatal("TLS pinning lost original Host")
	}
	if response, err = client.Get("https://" + net.JoinHostPort("mismatch.invalid", port)); err == nil {
		response.Body.Close()
		t.Fatal("hostname mismatch accepted")
	}
}

func TestProviderTLSRejectsLegacyProtocol(t *testing.T) {
	target := httptest.NewUnstartedServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("legacy TLS request reached handler") }))
	target.TLS = &tls.Config{MinVersion: tls.VersionTLS10, MaxVersion: tls.VersionTLS11}
	target.StartTLS()
	defer target.Close()
	client := newProviderHTTPClient()
	transport := client.Transport.(providerTransport).transport
	roots := x509.NewCertPool()
	roots.AddCert(target.Certificate())
	transport.TLSClientConfig.RootCAs = roots
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, target.Listener.Addr().String())
	}
	host := target.Certificate().DNSNames[0]
	if response, err := client.Get("https://" + host); err == nil {
		response.Body.Close()
		t.Fatal("TLS below1.2 accepted")
	}
	transport.CloseIdleConnections()
}

func TestProviderPublicNyaaManifestLive(t *testing.T) {
	if os.Getenv("ANIRIUM_PROVIDER_LIVE_TEST") != "1" {
		t.Skip("explicit read-only network check")
	}
	response, err := providerHTTPClient.Get("https://n.anirium.com.br/manifest")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("manifest HTTP%d", response.StatusCode)
	}
	var manifest ProviderManifest
	if err := decodeProviderJSON(response.Body, 64*1024, &manifest); err != nil || manifest.ID == "" {
		t.Fatalf("manifest invalid: %v", err)
	}
}
