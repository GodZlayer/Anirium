package main

import "regexp"

var catalogUUID = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)

type catalogPlaybackIdentity struct {
	WorkID    string `json:"workId"`
	EpisodeID string `json:"episodeId,omitempty"`
	SeasonID  string `json:"seasonId,omitempty"`
}

type catalogExternalReference struct {
	Provider  string `json:"provider"`
	Namespace string `json:"namespace"`
	ID        string `json:"id"`
}

type corePlaybackContext struct {
	Schema          int                        `json:"schema"`
	WorkID          string                     `json:"workId"`
	EpisodeID       string                     `json:"episodeId"`
	SeasonID        string                     `json:"seasonId"`
	AccountID       string                     `json:"accountId"`
	PlayerSessionID string                     `json:"playerSessionId"`
	Title           string                     `json:"title"`
	TitleEnglish    string                     `json:"titleEnglish"`
	TitleRomaji     string                     `json:"titleRomaji,omitempty"`
	TitleNative     string                     `json:"titleNative,omitempty"`
	Aliases         []string                   `json:"aliases,omitempty"`
	Episode         int                        `json:"episode"`
	AbsoluteEpisode int                        `json:"absoluteEpisode,omitempty"`
	Season          int                        `json:"season"`
	EpisodeCount    int                        `json:"episodeCount"`
	Format          string                     `json:"format"`
	References      []catalogExternalReference `json:"references"`
}
