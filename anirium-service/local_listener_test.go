package main

import (
	"net"
	"testing"
	"time"
)

func TestPlayerHTTPListenerIsLoopbackOnly(t *testing.T) {
	listener, err := listenLocalPlayerHTTP(0)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || !address.IP.Equal(net.IPv4(127, 0, 0, 1)) || address.Port == 0 {
		t.Fatalf("Player API must bind explicitly to IPv4 loopback: %v", listener.Addr())
	}
	connection, err := net.DialTimeout("tcp4", listener.Addr().String(), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	connection.Close()
}

func TestPlayerHTTPListenerRejectsInvalidPort(t *testing.T) {
	for _, port := range []int{-1, 65536} {
		listener, err := listenLocalPlayerHTTP(port)
		if listener != nil {
			listener.Close()
		}
		if err == nil {
			t.Fatalf("invalid port accepted: %d", port)
		}
	}
}
