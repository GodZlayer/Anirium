package main

import "testing"

func TestLanguageAliasesShareAudioAndSubtitleIdentity(t *testing.T) {
	for _, aliases := range [][]string{{"fr", "fra", "fre"}, {"de", "deu", "ger"}, {"zh", "zho", "chi"}, {"nl", "nld", "dut"}, {"ko", "kor"}, {"ar", "ara"}, {"uk", "ukr"}} {
		for _, alias := range aliases {
			if canonicalLanguage(alias) != aliases[1] || sidecarLanguage("Episode."+alias+".srt") != aliases[1] {
				t.Fatalf("language alias lost: %s", alias)
			}
		}
	}
	if sidecarLanguage("FrenchEpisode.srt") != "und" {
		t.Fatal("language guessed from title")
	}
}

func TestRegionalLanguageTagsShareIdentity(t *testing.T) {
	for input, expected := range map[string]string{
		"en-US": "eng", "EN_gb": "eng", "eng-US": "eng",
		"pt-PT": "por", "pt_BR": "por", "por-BR": "por",
		"fr-FR": "fra", "de-DE": "deu", "es-419": "spa",
		"zh-Hant-TW": "zho", "ja-JP": "jpn", "uk-UA": "ukr",
		"x-private": "x-private", "unknown_tag": "unknown_tag",
	} {
		if actual := canonicalLanguage(input); actual != expected {
			t.Errorf("canonicalLanguage(%q) = %q, want %q", input, actual, expected)
		}
	}
}

func TestRegionalAudioInventorySelectsOneBestTrack(t *testing.T) {
	first := ffprobeStream{Index: 1, CodecType: "audio", CodecName: "aac", Channels: 2, SampleRate: "48000", BitRate: "128000"}
	first.Tags.Language = "en-US"
	second := first
	second.Index, second.CodecName = 2, "flac"
	second.Tags.Language = "eng"
	tracks := selectAudioCandidates(audioCandidates([]string{"first", "second"}, map[string][]ffprobeStream{"first": {first}, "second": {second}}), AudioPolicy{})
	if len(tracks) != 1 || tracks[0].Language != "eng" || tracks[0].Source != "second" {
		t.Fatalf("regional aliases created duplicate or inferior audio: %+v", tracks)
	}
}

func TestRegionalExternalSubtitlesKeepAlternatives(t *testing.T) {
	swarmMu.Lock()
	defer swarmMu.Unlock()
	oldExternal, oldLinks := externalSubtitles, activeLinks
	defer func() { externalSubtitles, activeLinks = oldExternal, oldLinks }()
	activeLinks = nil
	externalSubtitles = []ProviderSubtitle{{Language: "en-US"}, {Language: "eng"}, {Language: ""}}
	tracks := subtitleTracksLocked()
	if len(tracks) != 3 || tracks[0].Language != "eng" || tracks[1].Language != "eng" || tracks[2].Language != "und" || tracks[0].ID == tracks[1].ID {
		t.Fatalf("subtitle alternatives lost or misgrouped: %+v", tracks)
	}
}
