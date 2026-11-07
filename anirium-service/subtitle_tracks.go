package main

import (
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Guarded by swarmMu, alongside the probed manifest metadata.
var probedStreams = map[string][]ffprobeStream{}
var probedSidecars = map[string][]string{}

type SubtitleTrack struct {
	ID          string `json:"id"`
	Language    string `json:"language"`
	Title       string `json:"title,omitempty"`
	StreamIndex int    `json:"-"`
	Source      string `json:"-"`
	FilePath    string `json:"-"`
}

// normalizeWebVTT accepts FFmpeg's identifier-free cues and preserves cue payloads.
func normalizeWebVTT(raw string, start float64) (string, error) {
	if start < 0 {
		return raw, nil
	}
	if math.IsNaN(start) || math.IsInf(start, 0) {
		return "", fmt.Errorf("invalid subtitle offset")
	}
	raw = strings.ReplaceAll(strings.TrimPrefix(raw, "\ufeff"), "\r\n", "\n")
	blocks := strings.Split(strings.TrimSpace(raw), "\n\n")
	if len(blocks) == 0 || (blocks[0] != "WEBVTT" && !strings.HasPrefix(blocks[0], "WEBVTT\n") && !strings.HasPrefix(blocks[0], "WEBVTT ")) {
		return "", fmt.Errorf("invalid WebVTT header")
	}
	var output strings.Builder
	output.WriteString(blocks[0] + "\n\n")
	offset := int64(math.Round(start * 1000))
	end := offset + 60000
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
			return "", fmt.Errorf("missing cue timing")
		}
		parts := strings.SplitN(lines[timing], "-->", 2)
		if len(parts) != 2 {
			return "", fmt.Errorf("invalid cue timing")
		}
		fields := strings.Fields(parts[1])
		if len(fields) == 0 {
			return "", fmt.Errorf("missing cue end")
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
			return "", fmt.Errorf("invalid cue duration")
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

var sidecarLanguageToken = regexp.MustCompile(`(?i)(?:^|[ ._\[(-])(pt-br|por|pob|pt|eng|en|spa|es|jpn|ja|fra|fre|fr|deu|ger|de|ita|it|rus|ru|kor|ko|zho|chi|zh|ara|ar|hin|hi|tur|tr|nld|dut|nl|pol|pl|ukr|uk|tha|th|vie|vi|ind|id)(?:[ ._\])\-]|$)`)

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
		tracks = append(tracks, SubtitleTrack{ID: fmt.Sprintf("external-%d-%d", playbackGeneration, index), Language: language, Title: subtitle.Title, StreamIndex: -1})
	}
	for sourceIndex, source := range activeLinks {
		for fileIndex, path := range probedSidecars[source] {
			tracks = append(tracks, SubtitleTrack{ID: fmt.Sprintf("sidecar-%d-%d-%d", playbackGeneration, sourceIndex, fileIndex), Language: sidecarLanguage(path), Title: filepath.Base(path), StreamIndex: -1, Source: source, FilePath: path})
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
			tracks = append(tracks, SubtitleTrack{ID: fmt.Sprintf("subtitle-%d-%d-%d", playbackGeneration, sourceIndex, stream.Index), Language: language, Title: stream.Tags.Title, StreamIndex: stream.Index, Source: source})
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
	// -ss before -i enables faster progressive seeking.
	// -copyts preserves input timestamps so output is deterministic.
	return []string{"-hide_banner", "-loglevel", "error", "-copyts", "-ss", fmt.Sprintf("%.3f", start), "-i", input, "-map", fmt.Sprintf("0:%d", index), "-to", fmt.Sprintf("%.3f", start+60), "-c:s", "webvtt", "-f", "webvtt", "pipe:1"}
}
