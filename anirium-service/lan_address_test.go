package main

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFormatLANServiceURL(t *testing.T) {
	if got := formatLANServiceURL("192.168.1.50", 4004); got != "http://192.168.1.50:4004" {
		t.Fatalf("expected http://192.168.1.50:4004, got %q", got)
	}
	if got := formatLANServiceURL("", 4004); got != "" {
		t.Fatalf("expected empty url for empty ip, got %q", got)
	}
	if got := formatLANServiceURL("192.168.1.50", 0); got != "" {
		t.Fatalf("expected empty url for invalid port, got %q", got)
	}
}

func TestDetectPrimaryLANIPv4IsPrivateOrEmpty(t *testing.T) {
	ipStr := detectPrimaryLANIPv4()
	if ipStr == "" {
		return
	}
	ip := net.ParseIP(ipStr)
	if ip == nil || ip.To4() == nil || !ip.IsPrivate() || ip.IsLoopback() {
		t.Fatalf("expected private non-loopback IPv4, got %q", ipStr)
	}
}

func TestHealthResponseIncludesValidLANFieldsWhenPresent(t *testing.T) {
	handler := newServiceHTTPHandler(4004)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:4004/health", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var resp HealthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}
	if resp.LanIP != "" {
		ip := net.ParseIP(resp.LanIP)
		if ip == nil || !ip.IsPrivate() || ip.IsLoopback() {
			t.Fatalf("unexpected lanIp %q", resp.LanIP)
		}
		if expected := formatLANServiceURL(resp.LanIP, 4004); resp.LanURL != expected {
			t.Fatalf("expected lanUrl %q, got %q", expected, resp.LanURL)
		}
	}
}
