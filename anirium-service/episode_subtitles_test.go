package main

import (
	"reflect"
	"testing"
)

func TestEpisodeSidecarsExcludeOtherEpisodesAndSeasons(t *testing.T) {
	paths := []string{"Show S01E01.mkv", "Show S01E02.mkv", "subs/Show S01E02.por.srt", "subs/Show S01E02.eng.ass", "subs/Show S01E01.por.srt", "subs/Show S02E02.por.srt", "subs/por.srt"}
	got := selectEpisodeSidecars(paths, paths[1], episodeContext{Episode: 2, Season: 1})
	want := []string{paths[2], paths[3]}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestUnnumberedSidecarsRequireAssociationInBatch(t *testing.T) {
	paths := []string{"First.mkv", "Second.mkv", "Second.por.srt", "SecondExtra.eng.vtt", "por.srt"}
	got := selectEpisodeSidecars(paths, paths[1], episodeContext{Episode: 2, Season: 1})
	if !reflect.DeepEqual(got, []string{paths[2]}) {
		t.Fatalf("unrelated subtitles: %v", got)
	}
	single := []string{"Release.mkv", "por.srt", "Show - 03.eng.srt"}
	got = selectEpisodeSidecars(single, single[0], episodeContext{Episode: 2, Season: 1})
	if !reflect.DeepEqual(got, []string{single[1]}) {
		t.Fatalf("single release: %v", got)
	}
}
