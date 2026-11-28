package main

import "testing"

func TestSubtitleCandidateMatchesQuery(t *testing.T) {
	tankChair := PlaybackPrepareRequest{
		Title:       "Tank Chair",
		TitleRomaji: "Sensha Isu",
		Season:      1,
		Episode:     2,
	}

	rejected := []string{
		"https://www.subtitlecat.com/subs/12345/Shark.Tank.S12E02.720p.WEB.h264-CAKES.html",
		"https://www.subtitlecat.com/subs/67890/Shark.Tank.S15E02.720p.WEB.h264-EDITH.html",
		"https://www.subtitlecat.com/subs/11111/Tank.Chair.S02E02.1080p.html",
		"https://www.subtitlecat.com/subs/22222/Tank.Chair.S01E03.1080p.html",
		"https://www.subtitlecat.com/subs/33333/Tank.Chair.Season.2.Episode.02.html",
		"https://www.subtitlecat.com/subs/44444/Unrelated.Anime.02.1080p.html",
	}
	for _, url := range rejected {
		if subtitleCandidateMatchesQuery(url, tankChair) {
			t.Errorf("expected candidate to be rejected for Tank Chair S1E2, got accepted: %s", url)
		}
	}

	accepted := []string{
		"https://www.subtitlecat.com/subs/55555/Tank.Chair.S01E02.1080p.WEB.html",
		"https://www.subtitlecat.com/subs/55556/%5BSubsPlease%5D%20Tank%20Chair%20-%2002%20(1080p).html",
		"https://www.subtitlecat.com/subs/55557/Sensha.Isu.02.1080p.html",
	}
	for _, url := range accepted {
		if !subtitleCandidateMatchesQuery(url, tankChair) {
			t.Errorf("expected candidate to be accepted for Tank Chair S1E2, got rejected: %s", url)
		}
	}

	frieren := PlaybackPrepareRequest{
		Title:        "Frieren: Beyond Journey's End",
		TitleRomaji:  "Sousou no Frieren",
		TitleEnglish: "Frieren: Beyond Journey's End",
		Season:       1,
		Episode:      8,
	}
	if !subtitleCandidateMatchesQuery("https://www.subtitlecat.com/subs/999/Sousou.no.Frieren.08.1080p.html", frieren) {
		t.Errorf("expected Romaji title match to be accepted")
	}
	if subtitleCandidateMatchesQuery("https://www.subtitlecat.com/subs/999/Sousou.no.Frieren.07.1080p.html", frieren) {
		t.Errorf("expected wrong episode to be rejected")
	}
}
