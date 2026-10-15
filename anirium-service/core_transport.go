package main

import (
	"crypto/tls"
	"net/http"
	"os"
)

// Controlled transport diagnostic. Authentication, TLS validation, destination
// and request deadlines remain identical; only HTTP multiplexing changes.
func newCoreAuthorizationClient() *http.Client {
	client := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	if os.Getenv("ANIRIUM_CORE_HTTP1") == "1" {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.ForceAttemptHTTP2 = false
		transport.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
		client.Transport = transport
	}
	return client
}
