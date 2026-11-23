package main

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var stremioIMDbVideoID = regexp.MustCompile(`^tt[0-9]{1,12}(:[0-9]{1,4}:[0-9]{1,4})?$`)

// Require an exact video identity supplied by the catalog. Titles, franchise
// order and torrent hashes cannot be substituted for an IMDb episode identity.
func searchStremioSubtitles(ctx context.Context, base *url.URL, query PlaybackPrepareRequest) []ProviderSubtitle {
	subtitles, _ := searchStremioSubtitlesWithStatus(ctx, base, query)
	return subtitles
}

func searchStremioSubtitlesWithStatus(ctx context.Context, base *url.URL, query PlaybackPrepareRequest) ([]ProviderSubtitle, int) {
	hasVideoHash := strings.TrimSpace(query.VideoHash) != "" && query.VideoSize > 0
	videoID := strings.TrimSpace(query.VideoID)
	mediaType := strings.TrimSpace(query.MediaType)
	if hasVideoHash && !stremioIMDbVideoID.MatchString(videoID) {
		videoID = "tt0000000"
		mediaType = "movie"
	}
	if !stremioIMDbVideoID.MatchString(videoID) || (mediaType != "movie" && mediaType != "series") {
		return nil, 0
	}
	if (mediaType == "series") != (len(stremioIMDbVideoID.FindStringSubmatch(videoID)[1]) > 0) {
		return nil, 0
	}
	path := "subtitles/" + mediaType + "/" + videoID + ".json"
	if hasVideoHash {
		extras := []string{
			"videoHash=" + url.PathEscape(strings.TrimSpace(query.VideoHash)),
			"videoSize=" + strconv.FormatInt(query.VideoSize, 10),
		}
		if strings.TrimSpace(query.Filename) != "" {
			extras = append(extras, "filename="+url.PathEscape(strings.TrimSpace(query.Filename)))
		}
		path = "subtitles/" + mediaType + "/" + videoID + "/" + strings.Join(extras, "&") + ".json"
	}
	endpoint := base.ResolveReference(&url.URL{Path: path})
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, 0
	}
	response, err := providerHTTPClient.Do(request)
	if err != nil {
		return nil, 0
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
		return nil, response.StatusCode
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
	return result, response.StatusCode
}
