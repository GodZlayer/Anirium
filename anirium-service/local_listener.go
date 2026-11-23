package main

import (
	"net"
	"strconv"
)

// Listen on all local interfaces so devices on the same LAN (e.g. phone -> PC)
// can connect, while secureLocalHTTP enforces private/LAN-only IP and host checks.
func listenLocalPlayerHTTP(port int) (net.Listener, error) {
	return net.Listen("tcp4", net.JoinHostPort("0.0.0.0", strconv.Itoa(port)))
}
