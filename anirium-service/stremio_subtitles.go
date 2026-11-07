package main

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
)

var stremioIMDbVideoID = regexp.MustCompile(`^tt[0-9]{1,12}(:[0-9]{1,4}:[0-9]{1,4})?$`)

// Require an exact video identity supplied by the catalog. Titles, franchise
// order and torrent hashes cannot be substituted for an IMDb episode identity.
func searchStremioSubtitles(ctx context.Context, base *url.URL, query PlaybackPrepareRequest) []ProviderSubtitle {
	if !stremioIMDbVideoID.MatchString(query.VideoID) || (query.MediaType != "movie" && query.MediaType != "series") {
		return nil
	}
	if (query.MediaType == "series") != (len(stremioIMDbVideoID.FindStringSubmatch(query.VideoID)[1]) > 0) {
		return nil
	}
	endpoint := base.ResolveReference(&url.URL{Path: "subtitles/" + query.MediaType + "/" + query.VideoID + ".json"})
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
		Subtitles []struct {
			ID   string `json:"id"`
			Lang string `json:"lang"`
			URL  string `json:"url"`
		} `json:"subtitles"`
	}
	if response.StatusCode != http.StatusOK || decodeProviderJSON(response.Body, 4<<20, &payload) != nil {
		return nil
	}
	result := []ProviderSubtitle{}
	for _, item := range payload.Subtitles {
		uri, parseErr := url.Parse(item.URL)
		if parseErr != nil || uri.User != nil || uri.Fragment != "" {
			continue
		}
		uri = base.ResolveReference(uri)
		// SDK download hosts may differ from the manifest. The existing guarded
		// transport validates public addresses on every request; no credentials
		// from Core or the manifest are copied onto these URLs.
		if uri.Scheme != "https" && !sameProviderOrigin(base, uri) {
			continue
		}
		language := canonicalLanguage(item.Lang)
		if language == "" {
			continue
		}
		result = append(result, ProviderSubtitle{Language: language, URL: uri.String(), Season: query.Season, Episode: query.Episode, stremio: true})
		if len(result) >= 128 {
			break
		}
	}
	return result
}
