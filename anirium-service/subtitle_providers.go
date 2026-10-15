package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type ProviderSubtitle struct {
	stremio  bool
	InfoHash string `json:"infoHash,omitempty"`
	Season   int    `json:"season,omitempty"`
	Episode  int    `json:"episode,omitempty"`
	Language string `json:"language"`
	Title    string `json:"title"`
	URL      string `json:"url"`
	Format   string `json:"format"`
}

var externalSubtitles []ProviderSubtitle // protected by swarmMu

func supportsSubtitleSearch(capabilities []string) bool {
	return containsString(capabilities, "subtitles.search") || containsString(capabilities, "subtitle.search")
}

func sameProviderOrigin(base, target *url.URL) bool {
	return (base.Scheme == "http" || base.Scheme == "https") && target.Scheme == base.Scheme && target.Host == base.Host && base.User == nil && target.User == nil
}

func searchSubtitleProvidersSubset(query PlaybackPrepareRequest, parent context.Context, servers []ProviderServer) []ProviderSubtitle {
	result := []ProviderSubtitle{}
	seen := map[string]bool{}
	if query.ManifestSnapshots == nil {
		query.ManifestSnapshots = newProviderSnapshotStore()
	}
	for _, server := range servers {
		if parent.Err() != nil {
			break
		}
		if !server.Enabled || !containsString(query.AuthorizedAddonIDs, server.ID) {
			continue
		}
		base, err := url.Parse(server.ManifestURL)
		if err != nil || !sameProviderOrigin(base, base) {
			continue
		}
		func() {
			ctx, cancel := context.WithTimeout(parent, 20*time.Second)
			defer cancel()
			manifest, snapshotStatus := query.ManifestSnapshots.manifest(parent, server)
			if snapshotStatus != "ok" || !manifestIdentityAcceptsServer(server, manifest) {
				return
			}
			sdkQuery := query
			if query.VideoID == "" && (supportsStremioSubtitleResource(manifest, "series", "tt0:1:1") || supportsStremioSubtitleResource(manifest, "movie", "tt0")) {
				sdkQuery = resolveSubtitleEpisodeIdentity(ctx, query)
			}
			if supportsStremioSubtitleResource(manifest, sdkQuery.MediaType, sdkQuery.VideoID) {
				for _, subtitle := range searchStremioSubtitles(ctx, base, sdkQuery) {
					if !seen[subtitle.URL] {
						seen[subtitle.URL] = true
						result = append(result, subtitle)
					}
				}
				return
			}
			if !supportsSubtitleSearch(manifest.Capabilities) {
				return
			}
			declared := manifest.Endpoints["subtitleSearch"]
			if declared == "" {
				return
			}
			relative, err := url.Parse(declared)
			if err != nil {
				return
			}
			endpoint := base.ResolveReference(relative)
			if !sameProviderOrigin(base, endpoint) {
				return
			}
			params := endpoint.Query()
			params.Set("title", query.Title)
			params.Set("titleEnglish", query.TitleEnglish)
			params.Set("titleRomaji", query.TitleRomaji)
			params.Set("season", fmt.Sprint(query.Season))
			params.Set("ep", fmt.Sprint(query.Episode))
			endpoint.RawQuery = params.Encode()
			request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
			if err != nil {
				return
			}
			response, err := providerHTTPClient.Do(request)
			if err != nil {
				return
			}
			var payload struct {
				Subtitles []ProviderSubtitle `json:"subtitles"`
			}
			decodeErr := decodeProviderJSON(response.Body, 4<<20, &payload)
			response.Body.Close()
			if response.StatusCode != 200 || decodeErr != nil {
				return
			}
			for _, subtitle := range payload.Subtitles {
				if !subtitleMatchesEpisode(subtitle, query) {
					continue
				}
				subtitle.Format = strings.ToLower(subtitle.Format)
				if subtitle.Format != "srt" && subtitle.Format != "vtt" && subtitle.Format != "ass" {
					continue
				}
				uri, err := url.Parse(subtitle.URL)
				if err != nil {
					continue
				}
				resolved := base.ResolveReference(uri)
				if !sameProviderOrigin(base, resolved) || seen[resolved.String()] {
					continue
				}
				subtitle.URL = resolved.String()
				subtitle.Language = canonicalLanguage(subtitle.Language)
				if subtitle.Language == "" {
					subtitle.Language = "und"
				}
				seen[subtitle.URL] = true
				result = append(result, subtitle)
			}
		}()
	}
	return result
}

func subtitleMatchesEpisode(subtitle ProviderSubtitle, query PlaybackPrepareRequest) bool {
	// Legacy providers may omit the fields: their episode-scoped search is the
	// contract. Explicit metadata must never contradict that request.
	return subtitle.Season >= 0 && subtitle.Episode >= 0 &&
		(subtitle.Season == 0 || subtitle.Season == query.Season) &&
		(subtitle.Episode == 0 || subtitle.Episode == query.Episode)
}

func externalSubtitleVTT(ctx context.Context, subtitle ProviderSubtitle) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, subtitle.URL, nil)
	if err != nil {
		return "", err
	}
	response, err := providerHTTPClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return "", fmt.Errorf("subtitle provider returned %d", response.StatusCode)
	}
	const limit = 16 << 20
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || len(data) > limit {
		return "", fmt.Errorf("subtitle payload unreadable or too large")
	}
	format := strings.ToLower(subtitle.Format)
	if subtitle.stremio {
		text := strings.TrimSpace(strings.TrimPrefix(string(data), "\ufeff"))
		switch {
		case strings.HasPrefix(text, "WEBVTT"):
			format = "vtt"
		case strings.HasPrefix(text, "[Script Info]"):
			format = "ass"
		case strings.Contains(text, " --> "):
			format = "srt"
		default:
			return "", fmt.Errorf("unsupported subtitle content")
		}
	}
	return convertSidecarVTT(ctx, data, "."+format)
}
