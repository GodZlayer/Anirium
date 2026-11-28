package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

type ffprobeChapter struct {
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Tags      struct {
		Title string `json:"title"`
	} `json:"tags"`
}

type SkipInterval struct {
	Start  float64 `json:"start"`
	End    float64 `json:"end"`
	Source string  `json:"source"`
}

type SkipTimes struct {
	OP *SkipInterval `json:"op,omitempty"`
	ED *SkipInterval `json:"ed,omitempty"`
}

var (
	// Guarded by swarmMu alongside currentCatalogIdentity.
	currentSkipMALID   int
	currentSkipEpisode int

	aniSkipMu       sync.Mutex
	aniSkipCache    = map[string]*SkipTimes{}
	aniSkipInFlight = map[string]bool{}
	aniSkipBaseURL  = "https://api.aniskip.com/v2/skip-times"
	aniSkipClient   = &http.Client{Timeout: 4 * time.Second}
)

func mergeMeshSkipTimes(malID, ep int, st *SkipTimes) bool {
	if malID <= 0 || ep <= 0 || !validateMeshSkipTimes(st) {
		return false
	}
	key := fmt.Sprintf("%d:%d", malID, ep)
	aniSkipMu.Lock()
	defer aniSkipMu.Unlock()
	if existing := aniSkipCache[key]; existing != nil && (existing.OP != nil || existing.ED != nil) {
		return false
	}
	aniSkipCache[key] = st
	return true
}

func setCurrentSkipTarget(malID, episode int) {
	if malID <= 0 || episode <= 0 {
		return
	}
	swarmMu.Lock()
	currentSkipMALID = malID
	currentSkipEpisode = episode
	swarmMu.Unlock()
	prefetchAniSkipTimes(context.Background(), malID, episode)
}

func aniSkipKey(malID, episode int) string {
	return fmt.Sprintf("%d:%d", malID, episode)
}

func isOpeningChapterTitle(title string) bool {
	t := strings.ToLower(strings.TrimSpace(title))
	if t == "" {
		return false
	}
	switch t {
	case "op", "opening", "intro", "abertura", "op theme", "opening theme", "opening credits":
		return true
	}
	return strings.HasPrefix(t, "op ") || strings.HasPrefix(t, "opening ") || strings.HasPrefix(t, "op:")
}

func isEndingChapterTitle(title string) bool {
	t := strings.ToLower(strings.TrimSpace(title))
	if t == "" {
		return false
	}
	switch t {
	case "ed", "ending", "outro", "credits", "encerramento", "ed theme", "ending theme", "ending credits":
		return true
	}
	return strings.HasPrefix(t, "ed ") || strings.HasPrefix(t, "ending ") || strings.HasPrefix(t, "ed:")
}

func validSkipInterval(start, end float64) bool {
	if start < 0 || end <= start {
		return false
	}
	length := end - start
	return length >= 15 && length <= 210
}

func extractSkipTimesFromChapters(chapters []ffprobeChapter) *SkipTimes {
	if len(chapters) == 0 {
		return nil
	}
	var out SkipTimes
	for _, ch := range chapters {
		start, err1 := strconv.ParseFloat(strings.TrimSpace(ch.StartTime), 64)
		end, err2 := strconv.ParseFloat(strings.TrimSpace(ch.EndTime), 64)
		if err1 != nil || err2 != nil || !validSkipInterval(start, end) {
			continue
		}
		if out.OP == nil && isOpeningChapterTitle(ch.Tags.Title) {
			out.OP = &SkipInterval{Start: start, End: end, Source: "chapter"}
		} else if out.ED == nil && isEndingChapterTitle(ch.Tags.Title) {
			out.ED = &SkipInterval{Start: start, End: end, Source: "chapter"}
		}
	}
	if out.OP == nil && out.ED == nil {
		return nil
	}
	return &out
}

type aniSkipResponse struct {
	Found   bool `json:"found"`
	Results []struct {
		Interval struct {
			StartTime float64 `json:"startTime"`
			EndTime   float64 `json:"endTime"`
		} `json:"interval"`
		SkipType string `json:"skipType"`
	} `json:"results"`
}

func fetchAniSkipTimes(ctx context.Context, malID, episode int) *SkipTimes {
	if malID <= 0 || episode <= 0 {
		return nil
	}
	url := fmt.Sprintf("%s/%d/%d?types=op&types=ed&types=mixed-op&types=mixed-ed", strings.TrimRight(aniSkipBaseURL, "/"), malID, episode)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Accept", "application/json")
	resp, err := aniSkipClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	var parsed aniSkipResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil || !parsed.Found {
		return nil
	}
	var out SkipTimes
	for _, r := range parsed.Results {
		start := r.Interval.StartTime
		end := r.Interval.EndTime
		if !validSkipInterval(start, end) {
			continue
		}
		switch r.SkipType {
		case "op", "mixed-op":
			if out.OP == nil {
				out.OP = &SkipInterval{Start: start, End: end, Source: "aniskip"}
			}
		case "ed", "mixed-ed":
			if out.ED == nil {
				out.ED = &SkipInterval{Start: start, End: end, Source: "aniskip"}
			}
		}
	}
	if out.OP == nil && out.ED == nil {
		return nil
	}
	return &out
}

func prefetchAniSkipTimes(parent context.Context, malID, episode int) {
	if malID <= 0 || episode <= 0 {
		return
	}
	if testing.Testing() || os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		return
	}
	key := aniSkipKey(malID, episode)
	aniSkipMu.Lock()
	if _, cached := aniSkipCache[key]; cached || aniSkipInFlight[key] {
		aniSkipMu.Unlock()
		return
	}
	aniSkipInFlight[key] = true
	aniSkipMu.Unlock()

	go func() {
		ctx, cancel := context.WithTimeout(parent, 4*time.Second)
		defer cancel()
		result := fetchAniSkipTimes(ctx, malID, episode)
		aniSkipMu.Lock()
		delete(aniSkipInFlight, key)
		aniSkipCache[key] = result
		aniSkipMu.Unlock()
	}()
}

func resolveCurrentSkipTimesLocked(malID, episode int) *SkipTimes {
	var merged SkipTimes
	for _, probe := range probedFormats {
		if ch := extractSkipTimesFromChapters(probe.Chapters); ch != nil {
			if merged.OP == nil && ch.OP != nil {
				merged.OP = ch.OP
			}
			if merged.ED == nil && ch.ED != nil {
				merged.ED = ch.ED
			}
			if merged.OP != nil && merged.ED != nil {
				break
			}
		}
	}
	if (merged.OP == nil || merged.ED == nil) && malID > 0 && episode > 0 {
		key := aniSkipKey(malID, episode)
		aniSkipMu.Lock()
		cached := aniSkipCache[key]
		aniSkipMu.Unlock()
		if cached != nil {
			if merged.OP == nil && cached.OP != nil {
				merged.OP = cached.OP
			}
			if merged.ED == nil && cached.ED != nil {
				merged.ED = cached.ED
			}
		}
	}
	if merged.OP == nil && merged.ED == nil {
		return nil
	}
	return &merged
}
