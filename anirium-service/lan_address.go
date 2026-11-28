package main

import (
	"fmt"
	"net"
)

// detectPrimaryLANIPv4 returns the machine's primary private IPv4 address on the
// local network (e.g. 192.168.x.x, 10.x.x.x, 172.16-31.x.x), or "" if none is
// available. It never returns a loopback (127.0.0.1) or link-local address.
func detectPrimaryLANIPv4() string {
	// Ask the OS routing table which local IPv4 address would reach the internet.
	// UDP dial does not transmit packets on the wire.
	if conn, err := net.Dial("udp4", "8.8.8.8:80"); err == nil {
		defer conn.Close()
		if udpAddr, ok := conn.LocalAddr().(*net.UDPAddr); ok {
			if ip := udpAddr.IP.To4(); ip != nil && ip.IsPrivate() && !ip.IsLoopback() {
				return ip.String()
			}
		}
	}

	interfaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip4 := ip.To4(); ip4 != nil && ip4.IsPrivate() && !ip4.IsLoopback() {
				return ip4.String()
			}
		}
	}
	return ""
}

func formatLANServiceURL(lanIP string, port int) string {
	if lanIP == "" || port <= 0 {
		return ""
	}
	return fmt.Sprintf("http://%s:%d", lanIP, port)
}
