package main

import (
	"crypto/tls"
	"fmt"
	"net/http/httptrace"
	"sync/atomic"
)

// Trace callbacks may run concurrently with the request returning. Only fixed
// protocol labels and flags are retained; errors and connection addresses are not.
type coreAuthorizationTrace struct {
	stage          atomic.Int32
	protocol       atomic.Int32
	writeCompleted atomic.Bool
	writeFailed    atomic.Bool
	tlsFailed      atomic.Bool
	firstByte      atomic.Bool
	reused         atomic.Bool
}

func (t *coreAuthorizationTrace) recordProtocol(state tls.ConnectionState) {
	switch state.NegotiatedProtocol {
	case "h2":
		t.protocol.Store(2)
	case "", "http/1.1":
		t.protocol.Store(1)
	default:
		t.protocol.Store(0)
	}
}

func (t *coreAuthorizationTrace) callbacks() *httptrace.ClientTrace {
	return &httptrace.ClientTrace{
		DNSStart:          func(httptrace.DNSStartInfo) { t.stage.Store(1) },
		ConnectStart:      func(string, string) { t.stage.Store(2) },
		TLSHandshakeStart: func() { t.stage.Store(3) },
		TLSHandshakeDone: func(state tls.ConnectionState, err error) {
			t.tlsFailed.Store(err != nil)
			if err == nil {
				t.recordProtocol(state)
				t.stage.Store(4)
			}
		},
		GotConn: func(info httptrace.GotConnInfo) {
			t.reused.Store(info.Reused)
			if conn, ok := info.Conn.(*tls.Conn); ok {
				t.recordProtocol(conn.ConnectionState())
			}
			t.stage.Store(4)
		},
		WroteRequest: func(info httptrace.WroteRequestInfo) {
			t.writeFailed.Store(info.Err != nil)
			t.writeCompleted.Store(info.Err == nil)
			t.stage.Store(5)
		},
		GotFirstResponseByte: func() {
			t.firstByte.Store(true)
			t.stage.Store(6)
		},
	}
}

func (t *coreAuthorizationTrace) diagnostic() string {
	protocol := "unknown"
	switch t.protocol.Load() {
	case 1:
		protocol = "http1"
	case 2:
		protocol = "h2"
	}
	return fmt.Sprintf("connection_stage=%d write_completed=%t write_failed=%t tls_failed=%t first_byte=%t conn_reused=%t protocol=%s",
		t.stage.Load(), t.writeCompleted.Load(), t.writeFailed.Load(), t.tlsFailed.Load(), t.firstByte.Load(), t.reused.Load(), protocol)
}
