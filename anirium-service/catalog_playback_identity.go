package main

import (
	"fmt"
	"strconv"
	"strings"
)

var currentCatalogIdentity catalogPlaybackIdentity

func applyCatalogPlaybackContext(input PlaybackPrepareRequest, data corePlaybackContext, auth serviceAuthorization) (PlaybackPrepareRequest, error) {
	if data.Schema != 1 || data.WorkID != input.WorkID || data.EpisodeID != input.EpisodeID || data.AccountID != auth.AccountID || data.PlayerSessionID != auth.PlayerSessionID ||
		!catalogUUID.MatchString(data.WorkID) || (data.EpisodeID != "" && (!catalogUUID.MatchString(data.EpisodeID) || data.EpisodeID == data.WorkID)) ||
		(data.SeasonID != "" && (!catalogUUID.MatchString(data.SeasonID) || data.SeasonID == data.WorkID || data.SeasonID == data.EpisodeID || data.Season < 1)) || data.Episode < 1 || data.Title == "" ||
		(data.EpisodeID == "" && data.Format != "MOVIE") {
		return input, fmt.Errorf("catalog context mismatch")
	}
	input.CatalogIdentity = catalogPlaybackIdentity{data.WorkID, data.EpisodeID, data.SeasonID}
	input.Title, input.TitleEnglish = data.Title, data.TitleEnglish
	input.TitleRomaji = data.TitleRomaji
	if input.TitleRomaji == "" {
		input.TitleRomaji = data.Title
	}
	input.TitleNative = data.TitleNative
	input.Aliases = append([]string(nil), data.Aliases...)
	input.Episode, input.Season, input.EpisodeCount, input.Format = data.Episode, data.Season, data.EpisodeCount, data.Format
	if input.Season < 1 {
		input.Season = 1
	}
	input.MALID, input.KitsuID, input.VideoID, input.MediaType = 0, 0, "", ""
	if data.Format == "MOVIE" && data.EpisodeID == "" {
		input.EpisodeCount = 1
	}
	if number, err := strconv.Atoi(singleCatalogReference(data.References, "mal")); err == nil && number > 0 && number <= 1000000000 {
		input.MALID = number
	}
	if number, err := strconv.Atoi(singleCatalogReference(data.References, "kitsu")); err == nil && number > 0 && number <= 1000000000 {
		input.KitsuID = number
	}
	imdb := singleCatalogReference(data.References, "imdb")
	if data.Format == "MOVIE" && stremioIMDbVideoID.MatchString(imdb) && !strings.Contains(imdb, ":") {
		input.VideoID, input.MediaType = imdb, "movie"
	}
	return input, nil
}

func singleCatalogReference(references []catalogExternalReference, provider string) string {
	value := ""
	for _, ref := range references {
		if ref.Provider != provider || ref.Namespace != "anime:work" {
			continue
		}
		if value != "" && value != ref.ID {
			return ""
		}
		value = ref.ID
	}
	return value
}
