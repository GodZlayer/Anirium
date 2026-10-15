package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRuntimeJSONNeverExposesPrivateSourceIntervals(t *testing.T) {
	runtime := variantRuntime{
		MixVariant: MixVariant{ID: "video-1-720p", Quality: "720p", Status: "ready"},
		Dir:        "private-work-directory",
		provenance: []mediaSourceSpan{{start: 0, duration: 4, source: "magnet:?xt=urn:btih:private-source", inputStream: "0:V:0"}},
	}
	data, err := json.Marshal(runtime)
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{"private-work-directory", "magnet:", "private-source", "provenance", "inputStream", "\"Dir\""} {
		if strings.Contains(string(data), private) {
			t.Fatalf("private media state leaked: %s", data)
		}
	}
	if !strings.Contains(string(data), "video-1-720p") {
		t.Fatal("public variant identity lost")
	}
}
