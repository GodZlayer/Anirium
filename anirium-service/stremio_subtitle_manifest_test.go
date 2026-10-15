package main

import (
	"encoding/json"
	"testing"
)

func TestStremioSubtitleManifestHonorsResourceFilters(t *testing.T) {
	for _, sample := range []struct {
		payload, mediaType, id string
		want                   bool
	}{
		{`{"resources":["subtitles"],"types":["series","movie"],"idPrefixes":["tt"]}`, "series", "tt123:1:2", true},
		{`{"resources":["subtitles"],"types":["series"],"idPrefixes":["tt"]}`, "series", "mal:123", false},
		{`{"resources":[{"name":"subtitles","types":["movie"]}],"types":["series"],"idPrefixes":["tt"]}`, "movie", "other:123", true},
		{`{"resources":[{"name":"subtitles","types":["movie"],"idPrefixes":["tt"]}]}`, "series", "tt123:1:2", false},
		{`{"resources":["stream"],"types":["movie"]}`, "movie", "tt123", false},
	} {
		var manifest ProviderManifest
		if err := json.Unmarshal([]byte(sample.payload), &manifest); err != nil {
			t.Fatal(err)
		}
		if got := supportsStremioSubtitleResource(manifest, sample.mediaType, sample.id); got != sample.want {
			t.Fatalf("resource filtering: %s got%v", sample.payload, got)
		}
		if len(manifest.Capabilities) != 0 {
			t.Fatal("SDK resource became native authority")
		}
	}
}
