package main

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httptrace"
	"strings"
	"testing"
)

func TestCoreAuthorizationTraceWriteFailureIsNotSuccessfulSend(t *testing.T) {
	var trace coreAuthorizationTrace
	trace.callbacks().WroteRequest(httptrace.WroteRequestInfo{Err: errors.New("private-device secret-token\nhttps://private")})
	result := trace.diagnostic()
	if !strings.Contains(result, "write_completed=false write_failed=true") {
		t.Fatalf("failed write reported as successful: %s", result)
	}
	for _, forbidden := range []string{"private", "secret", "https://", "\n"} {
		if strings.Contains(result, forbidden) {
			t.Fatalf("error leaked: %s", result)
		}
	}
}

func TestCoreAuthorizationTraceTLSFailureAndProtocolAllowlist(t *testing.T) {
	var trace coreAuthorizationTrace
	trace.callbacks().TLSHandshakeStart()
	trace.callbacks().TLSHandshakeDone(tls.ConnectionState{NegotiatedProtocol: "h2"}, errors.New("certificate error"))
	if result := trace.diagnostic(); !strings.Contains(result, "tls_failed=true") || !strings.Contains(result, "protocol=unknown") || !strings.Contains(result, "connection_stage=3") {
		t.Fatalf("failed TLS recorded as connection success: %s", result)
	}
	trace.callbacks().TLSHandshakeDone(tls.ConnectionState{NegotiatedProtocol: "private\nprotocol"}, nil)
	if result := trace.diagnostic(); !strings.HasSuffix(result, "protocol=unknown") || strings.Contains(result, "private") {
		t.Fatalf("unexpected protocol leaked: %s", result)
	}
}

func TestCoreAuthorizationTraceRealTLSProtocolsAndReuse(t *testing.T) {
	for _, http1 := range []bool{false, true} {
		t.Run(map[bool]string{false: "h2", true: "http1"}[http1], func(t *testing.T) {
			if http1 {
				t.Setenv("ANIRIUM_CORE_HTTP1", "1")
			} else {
				t.Setenv("ANIRIUM_CORE_HTTP1", "0")
			}
			server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") }))
			server.EnableHTTP2 = true
			server.StartTLS()
			defer server.Close()
			client := newCoreAuthorizationClient()
			transport, ok := client.Transport.(*http.Transport)
			if !ok {
				transport = http.DefaultTransport.(*http.Transport).Clone()
			}
			roots := x509.NewCertPool()
			roots.AddCert(server.Certificate())
			transport.TLSClientConfig = &tls.Config{RootCAs: roots}
			client.Transport = transport
			defer transport.CloseIdleConnections()
			for attempt := 0; attempt < 2; attempt++ {
				var trace coreAuthorizationTrace
				request, err := http.NewRequest(http.MethodGet, server.URL, nil)
				if err != nil {
					t.Fatal(err)
				}
				request = request.WithContext(httptrace.WithClientTrace(request.Context(), trace.callbacks()))
				response, err := client.Do(request)
				if err != nil {
					t.Fatal(err)
				}
				_, err = io.Copy(io.Discard, response.Body)
				response.Body.Close()
				if err != nil {
					t.Fatal(err)
				}
				result := trace.diagnostic()
				protocol := map[bool]string{false: "h2", true: "http1"}[http1]
				if !strings.HasSuffix(result, "protocol="+protocol) || !strings.Contains(result, "write_completed=true write_failed=false tls_failed=false first_byte=true") {
					t.Fatalf("incorrect real TLS trace: %s", result)
				}
				if attempt == 1 && !strings.Contains(result, "conn_reused=true") {
					t.Fatalf("reuse not observed: %s", result)
				}
			}
		})
	}
}
