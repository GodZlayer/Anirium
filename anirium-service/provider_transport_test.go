package main

import (
	"encoding/base32"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProviderCannotRedirectSearchToAnotherServer(t *testing.T) {
	contacted := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { contacted = true }))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, http.StatusFound) }))
	defer redirect.Close()
	allowLocalProviderForTest(t, redirect.URL)
	response, err := providerHTTPClient.Get(redirect.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if contacted || response.StatusCode != http.StatusFound {
		t.Fatal("redirect escaped declared endpoint")
	}
}

func TestMagnetRejectsConflictingIdentitiesAndMalformedQuery(t *testing.T) {
	hash := strings.Repeat("ab", 20)
	for _, input := range []string{
		"magnet:?xt=urn:btih:" + hash + "&xt=urn:btih:" + strings.Repeat("cd", 20),
		"magnet:?xt=urn:btih:" + hash + "&xt=urn:btih:invalid",
		"magnet:?xt=urn:btih:" + hash + "&tr=%zz",
		"magnet://unapproved/?xt=urn:btih:" + hash,
		"magnet:?xt=urn:btih:" + hash + "#hidden",
	} {
		if _, valid := normalizedMagnetHash(input); valid {
			t.Fatalf("ambiguous magnet accepted: %s", input)
		}
	}
	if actual, valid := normalizedMagnetHash("magnet:?xt=urn:btih:" + hash + "&xt=urn:btih:" + strings.ToUpper(hash)); !valid || actual != hash {
		t.Fatal("equivalent repeated identity rejected")
	}
}

func TestProviderJSONRejectsOversizeAndTrailingPayload(t *testing.T) {
	var payload map[string]any
	for _, input := range []string{`{"ok":true} extra`, strings.Repeat(" ", 33) + `{}`} {
		if err := decodeProviderJSON(strings.NewReader(input), 32, &payload); err == nil {
			t.Fatal("invalid response accepted")
		}
	}
	if err := decodeProviderJSON(strings.NewReader(`{"ok":true}`), 32, &payload); err != nil {
		t.Fatal(err)
	}
}

func TestMagnetDeduplicationUsesActualCanonicalHash(t *testing.T) {
	expected := strings.Repeat("ab", 20)
	raw, _ := hex.DecodeString(expected)
	for _, encoded := range []string{strings.ToUpper(expected), base32.StdEncoding.EncodeToString(raw)} {
		actual, valid := normalizedMagnetHash("magnet:?xt=urn:btih:" + encoded)
		if !valid || actual != expected {
			t.Fatalf("hash %s %v", actual, valid)
		}
	}
	for _, input := range []string{"magnet:?xt=urn:btih:abc", "https://example.com/file", "magnet:?dn=anything"} {
		if _, valid := normalizedMagnetHash(input); valid {
			t.Fatal("invalid magnet accepted")
		}
	}
}
