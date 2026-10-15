package main

import (
	"encoding/json"
	"strings"
)

// SDK resources have their own type/ID filters. Recognizing a resource never
// grants a native capability or invents a media identity for an anime episode.
func supportsStremioSubtitleResource(manifest ProviderManifest, mediaType, videoID string) bool {
	if videoID == "" || (mediaType != "movie" && mediaType != "series") {
		return false
	}
	for _, raw := range manifest.Resources {
		var name string
		types, prefixes := manifest.Types, manifest.IDPrefixes
		if json.Unmarshal(raw, &name) != nil {
			var resource struct {
				Name       string   `json:"name"`
				Types      []string `json:"types"`
				IDPrefixes []string `json:"idPrefixes"`
			}
			if json.Unmarshal(raw, &resource) != nil {
				continue
			}
			name, types, prefixes = resource.Name, resource.Types, resource.IDPrefixes
		}
		if name != "subtitles" || !containsString(types, mediaType) {
			continue
		}
		if len(prefixes) == 0 {
			return true
		}
		for _, prefix := range prefixes {
			if prefix != "" && strings.HasPrefix(videoID, prefix) {
				return true
			}
		}
	}
	return false
}
