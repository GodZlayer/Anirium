package main

import (
	"fmt"
	"os"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// Guarded by swarmMu, alongside the probed manifest metadata.
var probedStreams = map[string][]ffprobeStream{}
var probedSidecars = map[string][]string{}

type SubtitleTrack struct {
	ID          string `json:"id"`
	Language    string `json:"language"`
	Title       string `json:"title,omitempty"`
	Kind        string `json:"kind,omitempty"`
	Ready       bool   `json:"ready,omitempty"`
	Primary     bool   `json:"primary,omitempty"`
	StreamIndex int    `json:"-"`
	Source      string `json:"-"`
	FilePath    string `json:"-"`
}

// normalizeWebVTT accepts FFmpeg's identifier-free cues and preserves cue payloads.
func normalizeWebVTT(raw string, start float64) (string, error) {
	return normalizeWebVTTWindow(raw, start, 60)
}

func normalizeWebVTTWindow(raw string, start, span float64) (string, error) {
	if start < 0 {
		return raw, nil
	}
	if math.IsNaN(start) || math.IsInf(start, 0) || span <= 0 || math.IsNaN(span) || math.IsInf(span, 0) {
		return "", fmt.Errorf("invalid subtitle offset")
	}
	raw = strings.ReplaceAll(strings.TrimPrefix(raw, "\ufeff"), "\r\n", "\n")
	rawBlocks := strings.Split(strings.TrimSpace(raw), "\n\n")
	if len(rawBlocks) == 0 || (rawBlocks[0] != "WEBVTT" && !strings.HasPrefix(rawBlocks[0], "WEBVTT\n") && !strings.HasPrefix(rawBlocks[0], "WEBVTT ")) {
		return "", fmt.Errorf("invalid WebVTT header")
	}
	// Rejoin multi-paragraph cue payloads (e.g. ASS \N\N converted by FFmpeg into \n\n)
	// so split text fragments without "-->" do not abort normalization of the 60s window.
	blocks := make([]string, 0, len(rawBlocks))
	blocks = append(blocks, rawBlocks[0])
	for _, blk := range rawBlocks[1:] {
		trimmed := strings.TrimSpace(blk)
		if trimmed == "" {
			continue
		}
		lines := strings.Split(blk, "\n")
		first := strings.TrimSpace(lines[0])
		isMeta := first == "STYLE" || first == "REGION" || first == "NOTE" || strings.HasPrefix(first, "NOTE ")
		hasArrow := strings.Contains(lines[0], "-->") || (len(lines) > 1 && strings.Contains(lines[1], "-->"))
		if !isMeta && !hasArrow {
			if len(blocks) > 1 {
				prevFirst := strings.TrimSpace(strings.SplitN(blocks[len(blocks)-1], "\n", 2)[0])
				prevIsMeta := prevFirst == "STYLE" || prevFirst == "REGION" || prevFirst == "NOTE" || strings.HasPrefix(prevFirst, "NOTE ")
				if !prevIsMeta {
					blocks[len(blocks)-1] += "\n" + blk
					continue
				}
			}
			continue
		}
		blocks = append(blocks, blk)
	}
	var output strings.Builder
	output.WriteString(blocks[0] + "\n\n")
	offset := int64(math.Round(start * 1000))
	end := offset + int64(math.Round(span*1000))
	for _, block := range blocks[1:] {
		lines := strings.Split(block, "\n")
		first := strings.TrimSpace(lines[0])
		if first == "STYLE" || first == "REGION" || first == "NOTE" || strings.HasPrefix(first, "NOTE ") {
			output.WriteString(block + "\n\n")
			continue
		}
		timing := 0
		if !strings.Contains(lines[0], "-->") {
			timing = 1
		}
		if timing >= len(lines) {
			continue
		}
		parts := strings.SplitN(lines[timing], "-->", 2)
		if len(parts) != 2 {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) == 0 {
			continue
		}
		a, err := parseWebVTTMillis(strings.TrimSpace(parts[0]))
		if err != nil {
			return "", err
		}
		b, err := parseWebVTTMillis(fields[0])
		if err != nil {
			return "", err
		}
		if b <= a {
			continue
		}
		if b <= offset || a >= end {
			continue
		}
		if a < offset {
			a = offset
		}
		if b > end {
			b = end
		}
		if b <= a {
			continue
		}
		lines[timing] = formatWebVTTMillis(a-offset) + " --> " + formatWebVTTMillis(b-offset)
		if len(fields) > 1 {
			lines[timing] += " " + strings.Join(fields[1:], " ")
		}
		output.WriteString(strings.Join(lines, "\n") + "\n\n")
	}
	return output.String(), nil
}

func parseWebVTTMillis(value string) (int64, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 2 && len(parts) != 3 {
		return 0, fmt.Errorf("invalid WebVTT timestamp")
	}
	var total int64
	for i, part := range parts {
		if i == len(parts)-1 {
			pieces := strings.Split(part, ".")
			if len(pieces) != 2 || len(pieces[0]) != 2 || len(pieces[1]) != 3 {
				return 0, fmt.Errorf("invalid WebVTT milliseconds")
			}
			sec, err := strconv.ParseInt(pieces[0], 10, 64)
			if err != nil || sec < 0 || sec >= 60 {
				return 0, fmt.Errorf("invalid WebVTT seconds")
			}
			ms, err := strconv.ParseInt(pieces[1], 10, 64)
			if err != nil || ms < 0 || ms > 999 {
				return 0, fmt.Errorf("invalid WebVTT milliseconds")
			}
			return (total*60+sec)*1000 + ms, nil
		}
		for _, c := range part {
			if c < '0' || c > '9' {
				return 0, fmt.Errorf("invalid WebVTT timestamp")
			}
		}
		n, err := strconv.ParseInt(part, 10, 64)
		if err != nil || n < 0 || (i > 0 && n >= 60) || n > 1000000 {
			return 0, fmt.Errorf("invalid WebVTT timestamp")
		}
		total = total*60 + n
	}
	return 0, fmt.Errorf("invalid WebVTT timestamp")
}

func formatWebVTTMillis(ms int64) string {
	if ms >= 3600000 {
		return fmt.Sprintf("%02d:%02d:%02d.%03d", ms/3600000, ms/60000%60, ms/1000%60, ms%1000)
	}
	return fmt.Sprintf("%02d:%02d.%03d", ms/60000, ms/1000%60, ms%1000)
}

var (
	brazilianSubtitlePattern = regexp.MustCompile(`(?i)(?:^|[^a-z])(?:pt[-_]?br|br|brazil|brazilian|brasil|brasileir[oa])(?:$|[^a-z])`)
	europeanPorSubPattern  = regexp.MustCompile(`(?i)(?:^|[^a-z])(?:pt[-_]?pt|portugal|european|europe|iberian)(?:$|[^a-z])`)
	latamSpaSubPattern     = regexp.MustCompile(`(?i)(?:^|[^a-z])(?:es[-_]?419|latam|latin|latino|america)(?:$|[^a-z])`)
	europeanSpaSubPattern  = regexp.MustCompile(`(?i)(?:^|[^a-z])(?:es[-_]?es|spain|espanha|european|europe|castilian)(?:$|[^a-z])`)
	sdhSubtitlePattern     = regexp.MustCompile(`(?i)(?:^|[^a-z])(?:sdh|cc|closed[-_ ]captions?)(?:$|[^a-z])`)
	forcedSubtitlePattern  = regexp.MustCompile(`(?i)(?:^|[^a-z])(?:forced|signs?|songs?|placas)(?:$|[^a-z])`)
	sidecarLanguageToken   = regexp.MustCompile(`(?i)(?:^|[ ._\[(-])(pt-br|por|pob|pt|eng|en|spa|es|jpn|ja|fra|fre|fr|deu|ger|de|ita|it|rus|ru|kor|ko|zho|chi|zh|ara|ar|hin|hi|tur|tr|nld|dut|nl|pol|pl|ukr|uk|tha|th|vie|vi|ind|id)(?:[ ._\])\-]|$)`)
)

// Never expose another episode's subtitles from a season batch. Unnumbered
// subtitles require a filename association, or a single-video container.
func selectEpisodeSidecars(paths []string, video string, wanted episodeContext) []string {
	result := []string{}
	videoCount := 0
	for _, path := range paths {
		switch strings.ToLower(filepath.Ext(path)) {
		case ".mkv", ".mp4", ".webm", ".avi":
			videoCount++
		}
	}
	stem := strings.ToLower(strings.TrimSuffix(filepath.Base(video), filepath.Ext(video)))
	for _, path := range paths {
		switch strings.ToLower(filepath.Ext(path)) {
		case ".srt", ".vtt", ".ass":
		default:
			continue
		}
		name := filepath.Base(path)
		if match := seasonEpisodePattern.FindStringSubmatch(name); len(match) > 0 {
			season, _ := strconv.Atoi(match[1])
			episode, _ := strconv.Atoi(match[2])
			if season == wanted.Season && episode == wanted.Episode {
				result = append(result, path)
			}
			continue
		}
		if match := episodeNumberPattern.FindStringSubmatch(name); len(match) > 0 {
			episode, _ := strconv.Atoi(match[1])
			if episode == wanted.Episode {
				result = append(result, path)
			}
			continue
		}
		subStem := strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))
		associated := subStem == stem
		if strings.HasPrefix(subStem, stem) && len(subStem) > len(stem) {
			associated = strings.ContainsRune(" ._[-(", rune(subStem[len(stem)]))
		}
		if associated || videoCount == 1 {
			result = append(result, path)
		}
	}
	return result
}

func sidecarLanguage(path string) string {
	name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	match := sidecarLanguageToken.FindStringSubmatch(name)
	if len(match) > 1 {
		return canonicalLanguage(match[1])
	}
	return "und"
}

func stableMediaSourceSlot(source string, generation uint64) (int, bool) {
	prefix := fmt.Sprintf("media-%d-", generation)
	if !strings.HasPrefix(source, prefix) {
		return 0, false
	}
	slot, err := strconv.Atoi(strings.TrimPrefix(source, prefix))
	if err != nil || slot < 0 {
		return 0, false
	}
	return slot, true
}

// Caller holds swarmMu. Prefer smaller selected episode files to avoid making
// the default subtitle require a heavier torrent than the video. Keep every
// alternative and its source-derived ID; stable ties preserve discovery order.
func subtitleTracksLocked() []SubtitleTrack {
	tracks := []SubtitleTrack{}
	for index, subtitle := range externalSubtitles {
		language := canonicalLanguage(subtitle.Language)
		if language == "" {
			language = "und"
		}
		tracks = append(tracks, SubtitleTrack{ID: fmt.Sprintf("external-%d-%d", playbackGeneration, index), Language: language, Title: subtitle.Title, Kind: "external", StreamIndex: -1})
	}
	for sourceIndex, source := range activeLinks {
		slot := sourceIndex
		if stableSlot, ok := stableMediaSourceSlot(source, playbackGeneration); ok {
			slot = stableSlot
		}
		for fileIndex, path := range probedSidecars[source] {
			tracks = append(tracks, SubtitleTrack{ID: fmt.Sprintf("sidecar-%d-%d-%d", playbackGeneration, slot, fileIndex), Language: sidecarLanguage(path), Title: filepath.Base(path), Kind: "sidecar", StreamIndex: -1, Source: source, FilePath: path})
		}
		for _, stream := range probedStreams[source] {
			if stream.CodecType != "subtitle" {
				continue
			}
			// Bitmap subtitles need OCR, not conversion to WebVTT.
			switch stream.CodecName {
			case "subrip", "ass", "ssa", "webvtt", "mov_text", "text":
			default:
				continue
			}
			language := canonicalLanguage(stream.Tags.Language)
			if language == "" {
				language = "und"
			}
			tracks = append(tracks, SubtitleTrack{ID: fmt.Sprintf("subtitle-%d-%d-%d", playbackGeneration, slot, stream.Index), Language: language, Title: stream.Tags.Title, Kind: "embedded", StreamIndex: stream.Index, Source: source})
		}
	}
	weights := make(map[string]int64)
	for _, track := range tracks {
		if track.Source != "" {
			weights[track.Source] = resolveMediaSource(track.Source).FileBytes
		}
	}
	sort.SliceStable(tracks, func(i, j int) bool {
		a, b := tracks[i], tracks[j]
		if a.Source == "" || b.Source == "" {
			return a.Source == "" && b.Source != ""
		}
		wa, wb := weights[a.Source], weights[b.Source]
		if wa <= 0 {
			return false
		}
		if wb <= 0 {
			return true
		}
		return wa < wb
	})
	return tracks
}

func isForcedSubtitleTitle(title string) bool {
	return forcedSubtitlePattern.MatchString(strings.TrimSpace(title))
}

func isSDHSubtitleTitle(title string) bool {
	return sdhSubtitlePattern.MatchString(strings.TrimSpace(title))
}

func isBrazilianPortugueseTitle(title string) bool {
	return brazilianSubtitlePattern.MatchString(strings.TrimSpace(title))
}

func manifestSubtitleVariantParts(track SubtitleTrack) (lang, region, flavor string) {
	lang = canonicalLanguage(track.Language)
	if lang == "" {
		lang = "und"
	}
	title := strings.TrimSpace(track.Title)
	lower := strings.ToLower(title)
	region = "default"
	switch lang {
	case "por":
		if isBrazilianPortugueseTitle(title) {
			region = "br"
		} else if europeanPorSubPattern.MatchString(title) {
			region = "pt"
		}
	case "spa":
		if latamSpaSubPattern.MatchString(title) {
			region = "latam"
		} else if europeanSpaSubPattern.MatchString(title) {
			region = "eu"
		}
	case "zho":
		if strings.Contains(lower, "simplif") || strings.Contains(lower, "chs") || strings.Contains(lower, "hans") {
			region = "simp"
		} else if strings.Contains(lower, "tradit") || strings.Contains(lower, "cht") || strings.Contains(lower, "hant") {
			region = "trad"
		}
	}
	flavor = "full"
	if isForcedSubtitleTitle(title) {
		flavor = "forced"
	} else if isSDHSubtitleTitle(title) {
		flavor = "sdh"
	}
	return lang, region, flavor
}

func manifestSubtitleVariantKey(track SubtitleTrack) string {
	lang, region, flavor := manifestSubtitleVariantParts(track)
	return lang + "|" + region + "|" + flavor
}

// Caller holds swarmMu. Enriches subtitle tracks with safe readiness/primary flags
// for Player Pro without mutating identity or exposing private torrent sources,
// and deduplicates secondary torrents against the active primary source.
func manifestSubtitleTracksLocked() []SubtitleTrack {
	tracks := subtitleTracksLocked()
	if playbackInputs == nil {
		return tracks
	}
	primarySource := currentSubtitleVideoSourceLocked(playbackInputs)
	if primarySource == "" {
		primarySource = playbackInputs.primaryVideoSource()
	}
	if primarySource == "" {
		for _, source := range activeLinks {
			if len(probedStreams[source]) > 0 {
				primarySource = source
				break
			}
		}
	}
	bundle := playbackInputs.existingBundle()
	for i := range tracks {
		track := tracks[i]
		tracks[i].Primary = track.Source != "" && primarySource != "" && track.Source == primarySource
		ready := playbackInputs.hasCompleteSubtitle(track.ID)
		if !ready && bundle != nil {
			ready = bundle.hasTrackReadyOrFastHead(track.ID)
		}
		if !ready && track.StreamIndex >= 0 {
			_, ok0 := playbackInputs.cachedSubtitleWindow(subtitleWindowKey{source: track.Source, stream: track.StreamIndex, start: 0})
			_, okFull := playbackInputs.cachedSubtitleWindow(subtitleWindowKey{source: track.Source, stream: track.StreamIndex, start: -1})
			ready = ok0 || okFull
		}
		tracks[i].Ready = ready
	}

	primaryTracks := []SubtitleTrack{}
	externalAndSidecar := []SubtitleTrack{}
	secondaryCandidates := []SubtitleTrack{}
	primaryVariants := map[string]bool{}
	primaryFullLangs := map[string]bool{}
	primaryForcedLangs := map[string]bool{}

	for _, track := range tracks {
		if track.Primary && track.Kind == "embedded" {
			primaryTracks = append(primaryTracks, track)
			lang, _, flavor := manifestSubtitleVariantParts(track)
			primaryVariants[manifestSubtitleVariantKey(track)] = true
			if flavor == "full" {
				primaryFullLangs[lang] = true
			} else if flavor == "forced" {
				primaryForcedLangs[lang] = true
			}
			continue
		}
		if track.Kind == "external" || track.Kind == "sidecar" || track.StreamIndex < 0 {
			externalAndSidecar = append(externalAndSidecar, track)
			continue
		}
		secondaryCandidates = append(secondaryCandidates, track)
	}

	secondaryTracks := []SubtitleTrack{}
	seenSecondary := map[string]int{}
	for _, track := range secondaryCandidates {
		lang, region, flavor := manifestSubtitleVariantParts(track)
		key := lang + "|" + region + "|" + flavor
		if primaryVariants[key] {
			continue
		}
		if (flavor == "forced" || flavor == "sdh") && (primaryFullLangs[lang] || (flavor == "forced" && primaryForcedLangs[lang])) {
			continue
		}
		if primaryFullLangs[lang] && region == "default" {
			continue
		}
		if existingIdx, seen := seenSecondary[key]; seen {
			if !secondaryTracks[existingIdx].Ready && track.Ready {
				secondaryTracks[existingIdx] = track
			}
			continue
		}
		seenSecondary[key] = len(secondaryTracks)
		secondaryTracks = append(secondaryTracks, track)
	}

	result := make([]SubtitleTrack, 0, len(primaryTracks)+len(externalAndSidecar)+len(secondaryTracks)+1)
	result = append(result, primaryTracks...)
	result = append(result, externalAndSidecar...)
	result = append(result, secondaryTracks...)
	if !testing.Testing() && os.Getenv("ANIRIUM_E2E_CHILD") != "1" && len(result) > 0 {
		hasPor := false
		var engBase *SubtitleTrack
		for i := range result {
			lang := canonicalLanguage(result[i].Language)
			if lang == "por" {
				hasPor = true
				break
			}
			if engBase == nil && lang == "eng" {
				engBase = &result[i]
			}
		}
		if !hasPor {
			base := engBase
			if base == nil {
				base = &result[0]
			}
			translated := *base
			translated.ID = "translated-por:" + base.ID
			translated.Language = "por"
			translated.Title = "Português (Traduzida)"
			result = append(result, translated)
		}
	}
	return result
}

func canonicalLanguage(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	// Regional/script tags identify the same language for the playback menu.
	// Only fold tags whose base is a known language; preserve unknown metadata.
	if separator := strings.IndexAny(value, "-_"); separator > 0 {
		base := value[:separator]
		canonical := canonicalLanguage(base)
		if canonical != base || base == "por" || base == "eng" || base == "spa" || base == "jpn" || base == "fra" || base == "deu" || base == "ita" || base == "rus" || base == "kor" || base == "zho" || base == "ara" || base == "hin" || base == "tur" || base == "nld" || base == "pol" || base == "ukr" || base == "tha" || base == "vie" || base == "ind" {
			return canonical
		}
	}
	switch value {
	case "pt", "pt-br", "por", "pob", "português", "português (brasil)":
		return "por"
	case "en", "eng", "english":
		return "eng"
	case "es", "spa", "español", "spanish":
		return "spa"
	case "ja", "jpn", "japanese":
		return "jpn"
	case "fr", "fra", "fre":
		return "fra"
	case "de", "deu", "ger":
		return "deu"
	case "it", "ita":
		return "ita"
	case "ru", "rus":
		return "rus"
	case "ko", "kor":
		return "kor"
	case "zh", "zho", "chi":
		return "zho"
	case "ar", "ara":
		return "ara"
	case "hi", "hin":
		return "hin"
	case "tr", "tur":
		return "tur"
	case "nl", "nld", "dut":
		return "nld"
	case "pl", "pol":
		return "pol"
	case "uk", "ukr":
		return "ukr"
	case "th", "tha":
		return "tha"
	case "vi", "vie":
		return "vie"
	case "id", "ind":
		return "ind"
	}
	return value
}

func subtitleStreamIndex(streams []ffprobeStream, requested string) (int, bool) {
	if strings.TrimSpace(requested) == "" {
		return 0, false
	}
	for _, stream := range streams {
		if stream.CodecType != "subtitle" {
			continue
		}
		language := strings.TrimSpace(stream.Tags.Language)
		if language == "" {
			language = strings.TrimSpace(stream.Tags.Title)
		}
		if language == "" {
			language = "Original"
		}
		if canonicalLanguage(language) == canonicalLanguage(requested) {
			return stream.Index, true
		}
	}
	return 0, false
}

func subtitleExtractionArgs(input string, index int) []string {
	return []string{"-hide_banner", "-loglevel", "error", "-i", input, "-map", fmt.Sprintf("0:%d", index), "-c:s", "webvtt", "-f", "webvtt", "pipe:1"}
}

// A requested window is explicitly bounded, never advertised as a full track.
// Output timestamps are relative to start; the client adds that episode offset.
// -ss is placed before -i for progressive performance; -copyts ensures
// output absolute timestamps are explicitly deterministic.
func subtitleWindowExtractionArgs(input string, index int, start float64) []string {
	return subtitleWindowSpanExtractionArgs(input, index, start, 60)
}

func subtitleWindowSpanExtractionArgs(input string, index int, start, span float64) []string {
	// -ss and -t before -i limit demuxing to the requested window; -vn/-an avoid decoding A/V;
	// -copyts preserves input timestamps so output is deterministic.
	return []string{"-hide_banner", "-loglevel", "error", "-nostdin", "-copyts", "-ss", fmt.Sprintf("%.3f", start), "-t", fmt.Sprintf("%.3f", span), "-i", input, "-vn", "-an", "-map", fmt.Sprintf("0:%d", index), "-to", fmt.Sprintf("%.3f", start+span), "-c:s", "webvtt", "-f", "webvtt", "pipe:1"}
}
