package main

import (
	"net"
	"strconv"
)

// The Player API is local IPC, not a LAN media server. This does not change
// BitTorrent's separate peer transports or replace account authorization.
func listenLocalPlayerHTTP(port int) (net.Listener, error) {
	return net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
}
