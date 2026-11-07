package main

import (
	"crypto/x509"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCoreHTTP1DiagnosticPreservesTLSAndRedirectDenial(t *testing.T) {
	t.Setenv("ANIRIUM_CORE_HTTP1", "1")
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ProtoMajor != 1 {
			t.Error("diagnostic transport negotiated HTTP/2")
		}
		http.Redirect(w, r, "/must-not-follow", http.StatusFound)
	}))
	server.EnableHTTP2 = true
	server.StartTLS()
	defer server.Close()
	client := newCoreAuthorizationClient()
	transport := client.Transport.(*http.Transport)
	if transport.TLSClientConfig != nil && transport.TLSClientConfig.InsecureSkipVerify {
		t.Fatal("TLS verification disabled")
	}
	if response, err := client.Get(server.URL); err == nil {
		response.Body.Close()
		t.Fatal("untrusted certificate accepted")
	}
	roots := x509.NewCertPool()
	roots.AddCert(server.Certificate())
	transport.TLSClientConfig = server.Client().Transport.(*http.Transport).TLSClientConfig.Clone()
	transport.TLSClientConfig.RootCAs = roots
	transport.TLSClientConfig.InsecureSkipVerify = false
	response, err := client.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusFound {
		t.Fatal("authorization redirect was followed")
	}
}
