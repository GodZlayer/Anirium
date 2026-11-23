package main

import (
	"crypto/tls"
	"net/http"
	"os"
)

// Authorization is low-volume and must remain reliable behind the Core tunnel.
// Use HTTP/1.1 by default; TLS validation and redirect denial stay mandatory.
func newCoreAuthorizationClient() *http.Client {
	client := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	if os.Getenv("ANIRIUM_CORE_HTTP1") != "0" {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.ForceAttemptHTTP2 = false
		transport.DisableKeepAlives = true
		transport.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
		transport.Protocols = new(http.Protocols)
		transport.Protocols.SetHTTP1(true)
		if transport.TLSClientConfig == nil {
			transport.TLSClientConfig = &tls.Config{}
		} else {
			transport.TLSClientConfig = transport.TLSClientConfig.Clone()
		}
		transport.TLSClientConfig.NextProtos = []string{"http/1.1"}
		client.Transport = transport
	}
	return client
}
