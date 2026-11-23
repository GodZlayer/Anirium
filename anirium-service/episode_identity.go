package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"
)

type identityEpisode struct {
	ID      string `json:"id"`
	Season  int    `json:"season"`
	Episode int    `json:"episode"`
}

func collectSingleSeasonEpisodes(imdb string, episodes []identityEpisode, maxAllowedEpisode, count, number int) (map[int]string, int, bool) {
	if !stremioIMDbVideoID.MatchString(imdb) || strings.Contains(imdb, ":") || count < 1 || count > 2000 || number < 1 || number > count {
		return nil, 0, false
	}
	season := 0
	maxEpisode := 0
	seen := map[int]string{}
	for _, video := range episodes {
		if video.Season == 0 {
			continue
		}
		if video.Season < 1 || (season != 0 && season != video.Season) || video.Episode < 1 || video.Episode > maxAllowedEpisode {
			return nil, 0, false
		}
		season = video.Season
		expected := fmt.Sprintf("%s:%d:%d", imdb, season, video.Episode)
		if video.ID != expected || seen[video.Episode] != "" {
			return nil, 0, false
		}
		seen[video.Episode] = video.ID
		if video.Episode > maxEpisode {
			maxEpisode = video.Episode
		}
	}
	return seen, maxEpisode, true
}

// Franchise order is never an IMDb season. Accept only a complete, unique
// regular season belonging to an explicitly cross-referenced catalog work.
func exactSingleSeasonEpisode(imdb string, episodes []identityEpisode, count, number int) string {
	seen, _, ok := collectSingleSeasonEpisodes(imdb, episodes, count, count, number)
	if !ok || len(seen) != count {
		return ""
	}
	return seen[number]
}

// exactAiringSingleSeasonEpisode handles single-season ongoing anime where
// Cinemeta lists the full scheduled season (e.g. 26 episodes) while only
// `count` aired episodes are cataloged so far. Requires contiguous 1..maxEp.
func exactAiringSingleSeasonEpisode(imdb string, episodes []identityEpisode, count, number int) string {
	seen, maxEp, ok := collectSingleSeasonEpisodes(imdb, episodes, 2000, count, number)
	if !ok || maxEp < count || len(seen) != maxEp {
		return ""
	}
	return seen[number]
}

func identityJSON(ctx context.Context, endpoint string, value any) bool {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return false
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "AniriumIntegration/2.3")
	response, err := providerHTTPClient.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode == http.StatusOK && decodeProviderJSON(response.Body, 4<<20, value) == nil
}

func normalizeIdentityTitle(value string) string {
	value = strings.ToLower(strings.TrimSpace(foldLatinDiacritics(value)))
	if value == "" {
		return ""
	}
	var b strings.Builder
	lastSpace := false
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			lastSpace = false
		} else if !lastSpace {
			b.WriteByte(' ')
			lastSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

func cinemetaIMDbByTitle(ctx context.Context, mediaType string, query PlaybackPrepareRequest) string {
	candidates := []string{}
	seenRaw := map[string]bool{}
	normalizedWanted := map[string]bool{}
	addCandidate := func(raw string) {
		raw = strings.NewReplacer("`", "'", "’", "'", "‘", "'").Replace(strings.TrimSpace(raw))
		if raw == "" || len([]rune(raw)) < 2 || len([]rune(raw)) > 200 {
			return
		}
		norm := normalizeIdentityTitle(raw)
		if norm == "" {
			return
		}
		normalizedWanted[norm] = true
		if !seenRaw[norm] && len(candidates) < 10 {
			seenRaw[norm] = true
			candidates = append(candidates, raw)
		}
	}
	addCandidate(query.TitleEnglish)
	addCandidate(query.Title)
	addCandidate(query.TitleRomaji)
	if query.MALID >= 1 && query.MALID <= 1000000000 {
		var aniZipTitles struct {
			Titles map[string]string `json:"titles"`
		}
		if identityJSON(ctx, "https://api.ani.zip/mappings?mal_id="+strconv.Itoa(query.MALID), &aniZipTitles) {
			addCandidate(aniZipTitles.Titles["en"])
			addCandidate(aniZipTitles.Titles["x-jat"])
		}
	}
	for _, alias := range query.Aliases {
		addCandidate(alias)
	}
	if len(candidates) == 0 {
		return ""
	}
	matched := map[string]bool{}
	for _, title := range candidates {
		if ctx.Err() != nil {
			break
		}
		var searchResp struct {
			Metas []struct {
				ID      string   `json:"id"`
				IMDbID  string   `json:"imdb_id"`
				Type    string   `json:"type"`
				Name    string   `json:"name"`
				Aliases []string `json:"aliases"`
			} `json:"metas"`
		}
		endpoint := "https://v3-cinemeta.strem.io/catalog/" + mediaType + "/top/search=" + url.PathEscape(title) + ".json"
		if !identityJSON(ctx, endpoint, &searchResp) {
			continue
		}
		for _, meta := range searchResp.Metas {
			if meta.Type != "" && meta.Type != mediaType {
				continue
			}
			imdb := strings.TrimSpace(meta.IMDbID)
			if imdb == "" {
				imdb = strings.TrimSpace(meta.ID)
			}
			if !stremioIMDbVideoID.MatchString(imdb) || strings.Contains(imdb, ":") {
				continue
			}
			titleMatch := normalizedWanted[normalizeIdentityTitle(meta.Name)]
			if !titleMatch {
				for _, alias := range meta.Aliases {
					if normalizedWanted[normalizeIdentityTitle(alias)] {
						titleMatch = true
						break
					}
				}
			}
			if titleMatch {
				matched[imdb] = true
			}
		}
		if len(matched) == 1 {
			for imdb := range matched {
				return imdb
			}
		}
		if len(matched) > 1 {
			return ""
		}
	}
	if len(matched) == 1 {
		for imdb := range matched {
			return imdb
		}
	}
	return ""
}

func resolveSubtitleEpisodeIdentity(ctx context.Context, query PlaybackPrepareRequest) PlaybackPrepareRequest {
	if query.VideoID != "" || query.Episode < 1 {
		return query
	}
	if query.MALID >= 1 && query.MALID <= 1000000000 && query.EpisodeCount >= 1 {
		if mapped := mappedIMDbEpisode(ctx, query); mapped.VideoID != "" {
			return mapped
		}
	}
	mediaType := "series"
	if query.Format == "MOVIE" && query.EpisodeCount == 1 && query.Episode == 1 {
		mediaType = "movie"
	}
	imdb := ""
	if query.MALID >= 1 && query.MALID <= 1000000000 && query.EpisodeCount >= 1 {
		// Reject a work associated with other MAL entries: a split season/cour needs
		// an explicit episode mapping, even when its IMDb series ID is the same.
		id := strconv.Itoa(query.MALID)
		sparql := `SELECT DISTINCT ?imdb WHERE { ?item wdt:P4086 "` + id + `"; wdt:P345 ?imdb. FILTER NOT EXISTS { ?item wdt:P4086 ?other. FILTER (?other != "` + id + `") } } LIMIT 2`
		var mappings struct {
			Results struct {
				Bindings []struct {
					IMDb struct {
						Value string `json:"value"`
					} `json:"imdb"`
				} `json:"bindings"`
			} `json:"results"`
		}
		wikiCtx, wikiCancel := context.WithTimeout(ctx, 2*time.Second)
		wikiOK := identityJSON(wikiCtx, "https://query.wikidata.org/sparql?format=json&query="+url.QueryEscape(sparql), &mappings)
		wikiCancel()
		if wikiOK && len(mappings.Results.Bindings) == 1 {
			candidate := mappings.Results.Bindings[0].IMDb.Value
			if stremioIMDbVideoID.MatchString(candidate) && !strings.Contains(candidate, ":") {
				imdb = candidate
			}
		}
	}
	if imdb == "" {
		imdb = cinemetaIMDbByTitle(ctx, mediaType, query)
	}
	if imdb == "" {
		return query
	}
	var metadata struct {
		Meta struct {
			ID     string            `json:"id"`
			Type   string            `json:"type"`
			Videos []identityEpisode `json:"videos"`
		} `json:"meta"`
	}
	metaOK := identityJSON(ctx, "https://v3-cinemeta.strem.io/meta/"+mediaType+"/"+imdb+".json", &metadata) && metadata.Meta.ID == imdb && metadata.Meta.Type == mediaType
	videoID := imdb
	if mediaType == "series" {
		videoID = ""
		if metaOK && query.EpisodeCount >= 1 {
			videoID = exactSingleSeasonEpisode(imdb, metadata.Meta.Videos, query.EpisodeCount, query.Episode)
			if videoID == "" {
				videoID = exactAiringSingleSeasonEpisode(imdb, metadata.Meta.Videos, query.EpisodeCount, query.Episode)
			}
		}
		if videoID == "" && query.Episode >= 1 {
			season := query.Season
			if season < 1 {
				season = 1
			}
			videoID = fmt.Sprintf("%s:%d:%d", imdb, season, query.Episode)
		}
	}
	if videoID != "" {
		query.VideoID, query.MediaType = videoID, mediaType
		if mediaType == "series" {
			parts := strings.Split(videoID, ":")
			query.Season, _ = strconv.Atoi(parts[1])
		}
	}
	return query
}
