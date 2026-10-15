package main

import (
	"reflect"
	"testing"
)

func TestEpisodeInventoryRetainsAllMatchingVersions(t *testing.T) {
	paths := []string{"Show S01E03 [720p].mkv", "Show S01E03 [1080p].mp4", "Show S02E03.mkv", "Show S01E04.mkv", "Show S01E03.por.srt"}
	if got := matchingEpisodePaths(paths, 3, 1); !reflect.DeepEqual(got, []int{0, 1}) {
		t.Fatalf("lost versions or wrong episode: %v", got)
	}
	if got := matchingEpisodePaths([]string{"release.mkv", "unknown.mp4"}, 3, 1); len(got) != 0 {
		t.Fatalf("unidentified batch included: %v", got)
	}
	if got := matchingEpisodePaths(paths, 0, 1); len(got) != 0 {
		t.Fatal("invalid episode inventoried")
	}
}

func TestEpisodeFileSelectionDoesNotChooseLargestOrAmbiguousVideo(t *testing.T) {
	cases := []struct {
		paths                  []string
		episode, season, index int
		valid                  bool
	}{
		{[]string{"Example S01E01.mkv", "Example S01E03.mkv", "Example S02E03.mkv"}, 3, 1, 1, true},
		{[]string{"Example - 02.mkv", "Example - 03 [1080p].mkv"}, 3, 1, 1, true},
		{[]string{"Example S02E03.mkv"}, 3, 1, 0, false},
		{[]string{"Example - 04.mkv"}, 3, 1, 0, false},
		{[]string{"video.mkv", "other.mp4"}, 3, 1, 0, false},
		{[]string{"Example - 03.mkv", "Example EP03.mp4"}, 3, 1, 0, false},
		{[]string{"subtitle.srt", "episode.mkv"}, 3, 1, 1, true},
	}
	for _, item := range cases {
		index, valid := selectEpisodePath(item.paths, item.episode, item.season)
		if valid != item.valid || (valid && index != item.index) {
			t.Fatalf("%v -> %d %v", item.paths, index, valid)
		}
	}
}
