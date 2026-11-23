package main

import (
	"context"
	"fmt"
	"strconv"
)

// Use explicitly published episode numbering, never the anime's franchise order.
func mappedIMDbEpisode(ctx context.Context, query PlaybackPrepareRequest) PlaybackPrepareRequest {
	if query.MALID < 1 || query.Episode < 1 || query.EpisodeCount < query.Episode {
		return query
	}
	var data struct {
		Mappings struct {
			MAL  int    `json:"mal_id"`
			IMDb string `json:"imdb_id"`
			TVDB int    `json:"thetvdb_id"`
		} `json:"mappings"`
		Episodes map[string]struct {
			Episode string `json:"episode"`
			Season  int    `json:"seasonNumber"`
			Number  int    `json:"episodeNumber"`
			TVDB    int    `json:"tvdbShowId"`
		} `json:"episodes"`
	}
	key := strconv.Itoa(query.Episode)
	if !identityJSON(ctx, "https://api.ani.zip/mappings?mal_id="+strconv.Itoa(query.MALID), &data) || data.Mappings.MAL != query.MALID || !stremioIMDbVideoID.MatchString(data.Mappings.IMDb) {
		return query
	}
	episode, ok := data.Episodes[key]
	if !ok || episode.Episode != key || episode.Season < 1 || episode.Number < 1 || data.Mappings.TVDB < 1 || episode.TVDB != data.Mappings.TVDB {
		return query
	}
	expected := fmt.Sprintf("%s:%d:%d", data.Mappings.IMDb, episode.Season, episode.Number)
	var metadata struct {
		Meta struct {
			ID     string            `json:"id"`
			Type   string            `json:"type"`
			Videos []identityEpisode `json:"videos"`
		} `json:"meta"`
	}
	if !identityJSON(ctx, "https://v3-cinemeta.strem.io/meta/series/"+data.Mappings.IMDb+".json", &metadata) || metadata.Meta.ID != data.Mappings.IMDb || metadata.Meta.Type != "series" {
		return query
	}
	for _, video := range metadata.Meta.Videos {
		if video.ID == expected && video.Season == episode.Season && video.Episode == episode.Number {
			query.VideoID, query.MediaType = expected, "series"
			return query
		}
	}
	return query
}
