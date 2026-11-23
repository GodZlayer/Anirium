package main

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestMappedIMDbEpisodeUsesPublishedSeasonNotFranchiseOrder(t *testing.T) {
	previous := providerHTTPClient
	defer func() { providerHTTPClient = previous }()
	mapping := `{"mappings":{"mal_id":21881,"imdb_id":"tt2250192","thetvdb_id":259640},"episodes":{"1":{"episode":"1","seasonNumber":2,"episodeNumber":1,"tvdbShowId":259640}}}`
	providerHTTPClient = &http.Client{Transport: streamMappingTransport(func(r *http.Request) (*http.Response, error) {
		body := mapping
		if r.URL.Host == "v3-cinemeta.strem.io" {
			body = `{"meta":{"id":"tt2250192","type":"series","videos":[{"id":"tt2250192:2:1","season":2,"episode":1}]}}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}
	query := PlaybackPrepareRequest{MALID: 21881, Episode: 1, Season: 1, EpisodeCount: 24}
	mapped := mappedIMDbEpisode(context.Background(), query)
	if mapped.VideoID != "tt2250192:2:1" || mapped.Season != 1 {
		t.Fatal("mapping missing or local episode numbering changed")
	}
	mapping = strings.Replace(mapping, `"tvdbShowId":259640`, `"tvdbShowId":999`, 1)
	if mappedIMDbEpisode(context.Background(), query).VideoID != "" {
		t.Fatal("conflicting episode mapping accepted")
	}
}
