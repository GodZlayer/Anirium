package main

import (
	"context"
	"fmt"
	"github.com/anacrolix/torrent"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type episodeContextKey struct{}
type episodeContext struct{ Episode, Season int }

var requestedEpisode = episodeContext{Episode: 1, Season: 1} // guarded by swarmMu
var seasonEpisodePattern = regexp.MustCompile(`(?i)\bS(\d+)E(\d+)\b`)
var episodeNumberPattern = regexp.MustCompile(`(?i)(?:\b(?:EP|Episode|E)\s*|\s-\s*)(\d+)(?:v\d+)?(?:\b|_)`)

func matchingEpisodePaths(paths []string, episode, season int) []int {
	if episode < 1 || season < 1 {
		return nil
	}
	videos := []int{}
	matches := []int{}
	for index, path := range paths {
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".mkv" && ext != ".mp4" && ext != ".webm" && ext != ".avi" {
			continue
		}
		videos = append(videos, index)
		name := filepath.Base(path)
		if match := seasonEpisodePattern.FindStringSubmatch(name); len(match) > 0 {
			s, _ := strconv.Atoi(match[1])
			e, _ := strconv.Atoi(match[2])
			if s == season && e == episode {
				matches = append(matches, index)
			}
			continue
		}
		if match := episodeNumberPattern.FindStringSubmatch(name); len(match) > 0 {
			e, _ := strconv.Atoi(match[1])
			if e == episode {
				matches = append(matches, index)
			}
		}
	}
	if len(matches) > 0 {
		return matches
	}
	if len(matches) == 0 && len(videos) == 1 {
		// The provider validates single-file release context. Explicit conflicting
		// episode metadata must still fail instead of relying on file size.
		name := filepath.Base(paths[videos[0]])
		if seasonEpisodePattern.MatchString(name) || episodeNumberPattern.MatchString(name) {
			return nil
		}
		return []int{videos[0]}
	}
	return nil
}

func selectEpisodePath(paths []string, episode, season int) (int, bool) {
	matches := matchingEpisodePaths(paths, episode, season)
	if len(matches) == 1 {
		return matches[0], true
	}
	return 0, false
}

func matchingTorrentVideos(ctx context.Context, files []*torrent.File) []*torrent.File {
	wanted, _ := ctx.Value(episodeContextKey{}).(episodeContext)
	paths := make([]string, len(files))
	for index, file := range files {
		paths[index] = file.DisplayPath()
	}
	selected := []*torrent.File{}
	for _, index := range matchingEpisodePaths(paths, wanted.Episode, wanted.Season) {
		selected = append(selected, files[index])
	}
	return selected
}

func selectTorrentVideo(ctx context.Context, files []*torrent.File) (*torrent.File, error) {
	matches := matchingTorrentVideos(ctx, files)
	if len(matches) == 1 {
		return matches[0], nil
	}
	return nil, fmt.Errorf("episode file missing or ambiguous")
}
