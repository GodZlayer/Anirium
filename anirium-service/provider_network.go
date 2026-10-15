package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"time"
)

// Configuration is local to the installed Service. Account manifests cannot
// grant access to private networks. Development exceptions are literal loopback
// origins with an exact port, never a hostname, wildcard or private subnet.
func trustedLocalProvider(address string) bool {
	for _, origin := range strings.Split(os.Getenv("ANIRIUM_PROVIDER_LOCAL_ORIGINS"), ",") {
		u, err := url.Parse(strings.TrimSpace(origin))
		if err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || u.Port() == "" {
			continue
		}
		ip, err := netip.ParseAddr(u.Hostname())
		if err == nil && ip.Zone() == "" && ip.IsLoopback() && net.JoinHostPort(ip.String(), u.Port()) == address {
			return true
		}
	}
	return false
}

var deniedProviderNetworks = func() []netip.Prefix {
	var prefixes []netip.Prefix
	for _, value := range []string{
		"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
		"168.63.129.16/32", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
		"2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20",
	} {
		prefixes = append(prefixes, netip.MustParsePrefix(value))
	}
	return prefixes
}()

func publicProviderIP(ip netip.Addr) bool {
	if !ip.IsValid() || ip.Zone() != "" {
		return false
	}
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	// Limit IPv6 to allocated global unicast; excludes NAT64, ULA, mapped
	// transition mechanisms and local zones without translating embedded IPs.
	if ip.Is6() && !netip.MustParsePrefix("2000::/3").Contains(ip) {
		return false
	}
	for _, prefix := range deniedProviderNetworks {
		if prefix.Contains(ip) {
			return false
		}
	}
	return true
}

type providerNetworkDialer struct {
	lookup func(context.Context, string) ([]netip.Addr, error)
	dial   func(context.Context, string, string) (net.Conn, error)
}

type localProviderContextKey struct{}

func (d providerNetworkDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	if network != "tcp" && network != "tcp4" && network != "tcp6" {
		return nil, fmt.Errorf("provider network not permitted")
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, fmt.Errorf("invalid provider address")
	}
	if ctx.Value(localProviderContextKey{}) == address && trustedLocalProvider(address) {
		return d.dial(ctx, network, address)
	}
	var ips []netip.Addr
	if ip, parseErr := netip.ParseAddr(host); parseErr == nil {
		ips = []netip.Addr{ip}
	} else {
		ips, err = d.lookup(ctx, host)
		if err != nil {
			return nil, fmt.Errorf("provider resolution failed")
		}
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("provider resolution empty")
	}
	// Validate the entire answer before opening any socket, including mixed A/AAAA.
	for _, ip := range ips {
		if !publicProviderIP(ip) {
			return nil, fmt.Errorf("provider address not permitted")
		}
	}
	for _, ip := range ips {
		conn, dialErr := d.dial(ctx, network, net.JoinHostPort(ip.Unmap().String(), port))
		if dialErr == nil {
			return conn, nil
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
	}
	return nil, fmt.Errorf("provider connection failed")
}

type providerTransport struct{ transport *http.Transport }

func (t providerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	u := req.URL
	if u == nil || u.Hostname() == "" || u.User != nil || u.Fragment != "" || u.Opaque != "" {
		return nil, fmt.Errorf("invalid provider URL")
	}
	if u.Scheme != "https" && !(u.Scheme == "http" && trustedLocalProvider(u.Host)) {
		return nil, fmt.Errorf("provider requires HTTPS")
	}
	if req.Host != "" && req.Host != u.Host {
		return nil, fmt.Errorf("provider Host override not permitted")
	}
	if u.Scheme == "http" {
		req = req.Clone(context.WithValue(req.Context(), localProviderContextKey{}, u.Host))
	}
	return t.transport.RoundTrip(req)
}

func newProviderHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	safeDialer := providerNetworkDialer{lookup: func(ctx context.Context, host string) ([]netip.Addr, error) {
		return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	}, dial: dialer.DialContext}
	transport := &http.Transport{Proxy: nil, DialContext: safeDialer.DialContext,
		TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}, TLSHandshakeTimeout: 5 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second, IdleConnTimeout: 30 * time.Second,
		MaxIdleConns: 16, MaxIdleConnsPerHost: 2, MaxConnsPerHost: 8, MaxResponseHeaderBytes: 32 * 1024,
	}
	return &http.Client{Transport: providerTransport{transport}, Timeout: 30 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}
