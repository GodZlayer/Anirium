package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

type identityEpisode struct {
	ID      string `json:"id"`
	Season  int    `json:"season"`
	Episode int    `json:"episode"`
}

// Franchise order is never an IMDb season. Accept only a complete, unique
// regular season belonging to an explicitly cross-referenced catalog work.
func exactSingleSeasonEpisode(imdb string, episodes []identityEpisode, count, number int) string {
	if !stremioIMDbVideoID.MatchString(imdb) || strings.Contains(imdb, ":") || count < 1 || count > 2000 || number < 1 || number > count {
		return ""
	}
	season := 0
	seen := map[int]string{}
	for _, video := range episodes {
		if video.Season == 0 {
			continue
		}
		if video.Season < 1 || (season != 0 && season != video.Season) || video.Episode < 1 || video.Episode > count {
			return ""
		}
		season = video.Season
		expected := fmt.Sprintf("%s:%d:%d", imdb, season, video.Episode)
		if video.ID != expected || seen[video.Episode] != "" {
			return ""
		}
		seen[video.Episode] = video.ID
	}
	if len(seen) != count {
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

func resolveSubtitleEpisodeIdentity(ctx context.Context, query PlaybackPrepareRequest) PlaybackPrepareRequest {
	if query.VideoID != "" || query.MALID < 1 || query.MALID > 1000000000 || query.EpisodeCount < 1 {
		return query
	}
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
	if !identityJSON(ctx, "https://query.wikidata.org/sparql?format=json&query="+url.QueryEscape(sparql), &mappings) || len(mappings.Results.Bindings) != 1 {
		return query
	}
	imdb := mappings.Results.Bindings[0].IMDb.Value
	if !stremioIMDbVideoID.MatchString(imdb) || strings.Contains(imdb, ":") {
		return query
	}
	mediaType := "series"
	if query.Format == "MOVIE" && query.EpisodeCount == 1 && query.Episode == 1 {
		mediaType = "movie"
	}
	var metadata struct {
		Meta struct {
			ID     string            `json:"id"`
			Type   string            `json:"type"`
			Videos []identityEpisode `json:"videos"`
		} `json:"meta"`
	}
	if !identityJSON(ctx, "https://v3-cinemeta.strem.io/meta/"+mediaType+"/"+imdb+".json", &metadata) || metadata.Meta.ID != imdb || metadata.Meta.Type != mediaType {
		return query
	}
	videoID := imdb
	if mediaType == "series" {
		videoID = exactSingleSeasonEpisode(imdb, metadata.Meta.Videos, query.EpisodeCount, query.Episode)
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
