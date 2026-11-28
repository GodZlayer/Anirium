package main

import "testing"

func TestRSSItemMatchesRequestRejectsSubtitlesAndWrongEpisodes(t *testing.T) {
	bleach := PlaybackPrepareRequest{
		Title:        "Bleach",
		TitleRomaji:  "Bleach",
		TitleEnglish: "Bleach",
		Episode:      1,
		Season:       1,
	}

	if !rssItemMatchesRequest("[HorribleSubs] Bleach - 01 [720p].mkv", bleach) {
		t.Fatalf("expected Bleach Ep 1 to match")
	}
	if !rssItemMatchesRequest("Bleach S01E01 1080p Dual Audio.mkv", bleach) {
		t.Fatalf("expected Bleach S01E01 to match")
	}
	if rssItemMatchesRequest("[SubsPlease] Bleach - Thousand-Year Blood War - 01 (1080p).mkv", bleach) {
		t.Fatalf("expected Bleach TYBW Ep 1 to be REJECTED for base Bleach")
	}
	if rssItemMatchesRequest("[Erai-raws] Bleach - Sennen Kessen-hen - 01 [1080p].mkv", bleach) {
		t.Fatalf("expected Bleach Sennen Kessen-hen Ep 1 to be REJECTED for base Bleach")
	}
	if rssItemMatchesRequest("[HorribleSubs] Bleach - 02 [720p].mkv", bleach) {
		t.Fatalf("expected Bleach Ep 2 to be REJECTED when Ep 1 requested")
	}

	monster := PlaybackPrepareRequest{
		Title:        "Monster",
		TitleRomaji:  "Monster",
		TitleEnglish: "Monster",
		Episode:      1,
		Season:       1,
	}

	if !rssItemMatchesRequest("[Judas] Monster - 01 [1080p][HEVC].mkv", monster) {
		t.Fatalf("expected Monster Ep 1 to match")
	}
	if rssItemMatchesRequest("[SubsPlease] Monster Musume - 01 (1080p).mkv", monster) {
		t.Fatalf("expected Monster Musume Ep 1 to be REJECTED for Monster")
	}
	if rssItemMatchesRequest("[SubsPlease] Monster Girl Doctor - 01 (1080p).mkv", monster) {
		t.Fatalf("expected Monster Girl Doctor Ep 1 to be REJECTED for Monster")
	}
}
