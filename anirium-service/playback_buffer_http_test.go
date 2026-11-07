package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPlaybackBufferRejectsAnonymousAndMalformedSelections(t *testing.T) {
	guard := restrictLegacyPlayback(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Fatal("anonymous reached buffer scheduler") }))
	for _, method := range []string{"GET", "POST"} {
		response := httptest.NewRecorder()
		guard.ServeHTTP(response, httptest.NewRequest(method, "/playback/buffer?position=0", nil))
		if response.Code != 401 {
			t.Fatalf("anonymous%s accepted: %d", method, response.Code)
		}
	}
	for _, query := range []string{"position=NaN", "position=-1", "position=0&position=4", "position=0&magnet=anything", "position=Inf"} {
		response := httptest.NewRecorder()
		handlePlaybackBuffer(response, httptest.NewRequest("POST", "/playback/buffer?"+query, nil))
		if response.Code != 400 {
			t.Fatalf("invalid request accepted: %s %d", query, response.Code)
		}
	}
}
