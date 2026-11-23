package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

var (
	kitsuLookupMu    sync.Mutex
	kitsuLookupCache = map[int]int{}
)

func resolveKitsuIDByTitle(ctx context.Context, query PlaybackPrepareRequest) int {
	if testing.Testing() {
		return 0
	}
	if query.MALID > 0 {
		kitsuLookupMu.Lock()
		if cached, ok := kitsuLookupCache[query.MALID]; ok {
			kitsuLookupMu.Unlock()
			return cached
		}
		kitsuLookupMu.Unlock()
	}

	candidates := []string{}
	wanted := map[string]bool{}
	seen := map[string]bool{}
	add := func(raw string) {
		raw = strings.NewReplacer("`", "'", "’", "'", "‘", "'").Replace(strings.TrimSpace(raw))
		if raw == "" || len([]rune(raw)) < 2 || len([]rune(raw)) > 200 {
			return
		}
		norm := normalizeIdentityTitle(raw)
		if norm == "" {
			return
		}
		wanted[norm] = true
		if !seen[norm] && len(candidates) < 6 {
			seen[norm] = true
			candidates = append(candidates, raw)
		}
	}
	add(query.Title)
	add(query.TitleEnglish)
	add(query.TitleRomaji)
	for _, alias := range query.Aliases {
		add(alias)
	}

	foundID := 0
	lookupCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	for _, title := range candidates {
		if lookupCtx.Err() != nil {
			break
		}
		var resp struct {
			Data []struct {
				ID         string `json:"id"`
				Attributes struct {
					CanonicalTitle    string            `json:"canonicalTitle"`
					Titles            map[string]string `json:"titles"`
					AbbreviatedTitles []string          `json:"abbreviatedTitles"`
				} `json:"attributes"`
			} `json:"data"`
		}
		endpoint := "https://kitsu.io/api/edge/anime?filter[text]=" + url.QueryEscape(title) + "&page[limit]=5"
		if !identityJSON(lookupCtx, endpoint, &resp) {
			continue
		}
		for _, item := range resp.Data {
			idNum, err := strconv.Atoi(strings.TrimSpace(item.ID))
			if err != nil || idNum < 1 {
				continue
			}
			matched := wanted[normalizeIdentityTitle(item.Attributes.CanonicalTitle)]
			if !matched {
				for _, t := range item.Attributes.Titles {
					if wanted[normalizeIdentityTitle(t)] {
						matched = true
						break
					}
				}
			}
			if !matched {
				for _, t := range item.Attributes.AbbreviatedTitles {
					if wanted[normalizeIdentityTitle(t)] {
						matched = true
						break
					}
				}
			}
			if matched {
				foundID = idNum
				break
			}
		}
		if foundID > 0 {
			break
		}
	}

	if query.MALID > 0 {
		kitsuLookupMu.Lock()
		kitsuLookupCache[query.MALID] = foundID
		kitsuLookupMu.Unlock()
	}
	return foundID
}

func hasStremioStreams(manifest ProviderManifest) bool {
	for _, media := range []string{"anime", "series", "movie"} {
		for _, id := range []string{"kitsu:1:1", "mal:1:1", "tt1:1:1"} {
			if supportsStremioResource(manifest, "stream", media, id) {
				return true
			}
		}
	}
	return false
}

type stremioStreamIdentity struct{ Media, ID string }

func streamIdentity(ctx context.Context, manifest ProviderManifest, query PlaybackPrepareRequest) stremioStreamIdentity {
	if query.VideoID != "" && supportsStremioResource(manifest, "stream", query.MediaType, query.VideoID) {
		return stremioStreamIdentity{query.MediaType, query.VideoID}
	}
	if query.KitsuID > 0 && query.Episode > 0 {
		id := fmt.Sprintf("kitsu:%d:%d", query.KitsuID, query.Episode)
		mediaTypes := []string{"anime", "series"}
		if query.Format == "MOVIE" && query.EpisodeCount == 1 {
			id, mediaTypes = fmt.Sprintf("kitsu:%d", query.KitsuID), []string{"movie"}
		}
		for _, media := range mediaTypes {
			if supportsStremioResource(manifest, "stream", media, id) {
				return stremioStreamIdentity{media, id}
			}
		}
	}
	if query.MALID < 1 || query.Episode < 1 {
		return stremioStreamIdentity{}
	}
	movie := query.Format == "MOVIE" && query.EpisodeCount == 1 && query.Episode == 1
	if movie {
		id := fmt.Sprintf("mal:%d", query.MALID)
		if supportsStremioResource(manifest, "stream", "movie", id) {
			return stremioStreamIdentity{"movie", id}
		}
	}
	// A provider declaring MAL accepts this exact work identity without title matching.
	mal := fmt.Sprintf("mal:%d:%d", query.MALID, query.Episode)
	for _, media := range []string{"anime", "series"} {
		if supportsStremioResource(manifest, "stream", media, mal) {
			return stremioStreamIdentity{media, mal}
		}
	}
	if supportsStremioResource(manifest, "stream", "anime", "kitsu:1:1") ||
		supportsStremioResource(manifest, "stream", "series", "kitsu:1:1") ||
		(movie && supportsStremioResource(manifest, "stream", "movie", "kitsu:1")) {
		var mapping struct {
			Mappings struct {
				MAL   int `json:"mal_id"`
				Kitsu int `json:"kitsu_id"`
			} `json:"mappings"`
			Episodes map[string]struct {
				Episode string `json:"episode"`
			} `json:"episodes"`
		}
		kitsuID := 0
		if identityJSON(ctx, "https://api.ani.zip/mappings?mal_id="+strconv.Itoa(query.MALID), &mapping) &&
			mapping.Mappings.MAL == query.MALID &&
			mapping.Mappings.Kitsu >= 1 {
			if len(mapping.Episodes) == 0 || mapping.Episodes[strconv.Itoa(query.Episode)].Episode == strconv.Itoa(query.Episode) {
				kitsuID = mapping.Mappings.Kitsu
			}
		}
		if kitsuID == 0 {
			kitsuID = resolveKitsuIDByTitle(ctx, query)
		}
		if kitsuID >= 1 {
			if movie {
				id := fmt.Sprintf("kitsu:%d", kitsuID)
				if supportsStremioResource(manifest, "stream", "movie", id) {
					return stremioStreamIdentity{"movie", id}
				}
			}
			kitsu := fmt.Sprintf("kitsu:%d:%d", kitsuID, query.Episode)
			for _, media := range []string{"anime", "series"} {
				if supportsStremioResource(manifest, "stream", media, kitsu) {
					return stremioStreamIdentity{media, kitsu}
				}
			}
		}
	}
	if query.VideoID == "" &&
		(supportsStremioResource(manifest, "stream", "series", "tt0:1:1") ||
			(movie && supportsStremioResource(manifest, "stream", "movie", "tt0"))) {
		resolved := query.ManifestSnapshots.episodeIdentity(ctx, query)
		if resolved.VideoID != "" && supportsStremioResource(manifest, "stream", resolved.MediaType, resolved.VideoID) {
			return stremioStreamIdentity{resolved.MediaType, resolved.VideoID}
		}
	}
	return stremioStreamIdentity{}
}

func searchStremioStreams(ctx context.Context, server ProviderServer, manifest ProviderManifest, query PlaybackPrepareRequest) []ProviderSearchResult {
	identity := streamIdentity(ctx, manifest, query)
	if identity.ID == "" {
		return nil
	}
	base, err := url.Parse(server.ManifestURL)
	if err != nil {
		return nil
	}
	endpoint := base.ResolveReference(&url.URL{Path: "stream/" + identity.Media + "/" + identity.ID + ".json"})
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil
	}
	response, err := providerHTTPClient.Do(request)
	if err != nil {
		return nil
	}
	defer response.Body.Close()
	var payload struct {
		Streams []struct {
			InfoHash string   `json:"infoHash"`
			FileIdx  *int     `json:"fileIdx"`
			Title    string   `json:"title"`
			Name     string   `json:"name"`
			Sources  []string `json:"sources"`
		} `json:"streams"`
	}
	if response.StatusCode != 200 || decodeProviderJSON(response.Body, 4<<20, &payload) != nil {
		return nil
	}
	results := []ProviderSearchResult{}
	for _, stream := range payload.Streams {
		values := url.Values{"xt": []string{"urn:btih:" + stream.InfoHash}}
		if stream.FileIdx != nil {
			if *stream.FileIdx < 0 {
				continue
			}
			values.Set("so", strconv.Itoa(*stream.FileIdx))
		}
		for _, source := range stream.Sources {
			if strings.HasPrefix(source, "tracker:") {
				values.Add("tr", strings.TrimPrefix(source, "tracker:"))
			}
		}
		magnet := "magnet:?" + values.Encode()
		hash, valid := normalizedMagnetHash(magnet)
		if !valid {
			continue
		}
		results = append(results, ProviderSearchResult{Provider: manifest.ID, Title: stream.Title, Magnet: magnet, InfoHash: hash})
		if len(results) >= 128 {
			break
		}
	}
	return results
}
