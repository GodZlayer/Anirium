package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
)

var (
	subTranslateMu               sync.Mutex
	subTranslateMem              = map[string]string{}
	subTranslateBaseURL          = "https://translate.googleapis.com/translate_a/single"
	subTranslateFallbackURL      = "https://clients5.google.com/translate_a/t"
	subTranslateClient           = &http.Client{Timeout: 10 * time.Second}
	subTranslateSepRe            = regexp.MustCompile(`(?i)\s*@{2,}\s*ANIRIUM[_\s-]*SEP\s*@{2,}\s*`)
	subTranslateThrottleMu       sync.Mutex
	subTranslateNextAllowed      time.Time
	subTranslateThrottleInterval = 350 * time.Millisecond
)

func waitSubtitleTranslateSlot(ctx context.Context) error {
	if testing.Testing() || subTranslateThrottleInterval <= 0 {
		return nil
	}
	subTranslateThrottleMu.Lock()
	now := time.Now()
	wait := time.Until(subTranslateNextAllowed)
	if wait > 0 {
		subTranslateNextAllowed = subTranslateNextAllowed.Add(subTranslateThrottleInterval)
	} else {
		subTranslateNextAllowed = now.Add(subTranslateThrottleInterval)
	}
	subTranslateThrottleMu.Unlock()

	if wait <= 0 {
		return nil
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

type vttCueBlock struct {
	header string
	timing string
	text   string
}

func parseTranslatedTrackID(trackID string) (string, string, bool) {
	if !strings.HasPrefix(trackID, "translated-") {
		return "", trackID, false
	}
	rest := strings.TrimPrefix(trackID, "translated-")
	colon := strings.IndexByte(rest, ':')
	if colon <= 0 || colon+1 >= len(rest) {
		return "", trackID, false
	}
	lang := strings.TrimSpace(rest[:colon])
	baseID := rest[colon+1:]
	if lang == "" || baseID == "" {
		return "", trackID, false
	}
	return normalizeTranslateLang(lang), baseID, true
}

func unwrapTranslatedTrackID(trackID string) string {
	_, baseID, ok := parseTranslatedTrackID(trackID)
	if ok {
		return baseID
	}
	return trackID
}

func normalizeTranslateLang(lang string) string {
	l := strings.ToLower(strings.TrimSpace(lang))
	switch l {
	case "", "por", "pob", "pt-br", "pt_br", "pt":
		return "pt"
	case "eng", "en-us", "en-gb", "en":
		return "en"
	case "spa", "es-la", "es-419", "es":
		return "es"
	case "fra", "fre", "fr":
		return "fr"
	case "deu", "ger", "de":
		return "de"
	case "ita", "it":
		return "it"
	case "jpn", "ja":
		return "ja"
	case "rus", "ru":
		return "ru"
	case "kor", "ko":
		return "ko"
	case "zho", "chi", "zh", "zh-cn", "zh_cn":
		return "zh-CN"
	case "zh-tw", "zh_tw":
		return "zh-TW"
	case "ara", "ar":
		return "ar"
	case "hin", "hi":
		return "hi"
	case "tur", "tr":
		return "tr"
	case "nld", "dut", "nl":
		return "nl"
	case "pol", "pl":
		return "pl"
	case "ukr", "uk":
		return "uk"
	case "tha", "th":
		return "th"
	case "vie", "vi":
		return "vi"
	case "ind", "id":
		return "id"
	default:
		if len(l) >= 2 {
			return l[:2]
		}
		return "pt"
	}
}

func subtitleTranslateCacheDir() string {
	if testing.Testing() || os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		return ""
	}
	base, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(base) == "" {
		return ""
	}
	dir := filepath.Join(base, "Anirium", "subtitle-translate-cache")
	_ = os.MkdirAll(dir, 0o700)
	return dir
}

func subtitleTranslateCacheKey(vtt, targetLang string) string {
	sum := sha256.Sum256([]byte(targetLang + "\n" + vtt))
	return hex.EncodeToString(sum[:16])
}

func readSubtitleTranslateCache(key string) (string, bool) {
	subTranslateMu.Lock()
	if cached, ok := subTranslateMem[key]; ok {
		subTranslateMu.Unlock()
		return cached, true
	}
	subTranslateMu.Unlock()

	if dir := subtitleTranslateCacheDir(); dir != "" {
		if raw, err := os.ReadFile(filepath.Join(dir, key+".vtt")); err == nil && len(raw) > 0 {
			text := string(raw)
			subTranslateMu.Lock()
			subTranslateMem[key] = text
			subTranslateMu.Unlock()
			return text, true
		}
	}
	return "", false
}

func writeSubtitleTranslateCache(key, translated string) {
	subTranslateMu.Lock()
	subTranslateMem[key] = translated
	subTranslateMu.Unlock()

	if dir := subtitleTranslateCacheDir(); dir != "" {
		_ = os.WriteFile(filepath.Join(dir, key+".vtt"), []byte(translated), 0o600)
	}
}

func translateTextBatch(ctx context.Context, texts []string, targetLang string) ([]string, error) {
	if len(texts) == 0 {
		return texts, nil
	}
	if err := waitSubtitleTranslateSlot(ctx); err != nil {
		return nil, err
	}
	const sep = "\n@@@ANIRIUM_SEP@@@\n"
	joined := strings.Join(texts, sep)

	full, err := requestPrimaryTranslate(ctx, joined, targetLang)
	if err != nil && strings.Contains(err.Error(), "429") && !testing.Testing() {
		if fb, fbErr := requestFallbackTranslate(ctx, joined, targetLang); fbErr == nil && fb != "" {
			full = fb
			err = nil
		}
	}
	if err != nil {
		return nil, err
	}
	parts := subTranslateSepRe.Split(full, -1)
	if len(parts) != len(texts) {
		// Fallback: subdivide batch so a single mangled separator never aborts the whole VTT.
		if len(texts) > 1 {
			mid := len(texts) / 2
			left, leftErr := translateTextBatch(ctx, texts[:mid], targetLang)
			if leftErr != nil {
				return nil, leftErr
			}
			right, rightErr := translateTextBatch(ctx, texts[mid:], targetLang)
			if rightErr != nil {
				return nil, rightErr
			}
			return append(left, right...), nil
		}
		return []string{strings.TrimSpace(full)}, nil
	}
	result := make([]string, len(parts))
	for i, p := range parts {
		result[i] = strings.TrimSpace(p)
	}
	return result, nil
}

func requestPrimaryTranslate(ctx context.Context, joined, targetLang string) (string, error) {
	form := url.Values{}
	form.Set("client", "gtx")
	form.Set("sl", "auto")
	form.Set("tl", targetLang)
	form.Set("dt", "t")
	form.Set("q", joined)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, subTranslateBaseURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := subTranslateClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("translate HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", err
	}

	var parsed []any
	if err := json.Unmarshal(body, &parsed); err != nil || len(parsed) == 0 {
		return "", fmt.Errorf("invalid translate response")
	}
	sentences, ok := parsed[0].([]any)
	if !ok {
		return "", fmt.Errorf("missing translated sentences")
	}
	var out strings.Builder
	for _, item := range sentences {
		pair, ok := item.([]any)
		if ok && len(pair) > 0 {
			if seg, ok := pair[0].(string); ok {
				out.WriteString(seg)
			}
		}
	}
	return out.String(), nil
}

func requestFallbackTranslate(ctx context.Context, joined, targetLang string) (string, error) {
	form := url.Values{}
	form.Set("client", "dict-chrome-ex")
	form.Set("sl", "auto")
	form.Set("tl", targetLang)
	form.Set("q", joined)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, subTranslateFallbackURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := subTranslateClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fallback translate HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", err
	}
	var parsed []any
	if err := json.Unmarshal(body, &parsed); err != nil || len(parsed) == 0 {
		return "", fmt.Errorf("invalid fallback translate response")
	}
	if first, ok := parsed[0].(string); ok {
		return first, nil
	}
	if pair, ok := parsed[0].([]any); ok && len(pair) > 0 {
		if first, ok := pair[0].(string); ok {
			return first, nil
		}
	}
	return "", fmt.Errorf("unexpected fallback translate shape")
}

func translateWebVTT(ctx context.Context, vtt string, targetLang string) (string, bool, error) {
	lang := normalizeTranslateLang(targetLang)
	if !strings.Contains(vtt, "-->") {
		return vtt, true, nil
	}
	key := subtitleTranslateCacheKey(vtt, lang)
	if cached, ok := readSubtitleTranslateCache(key); ok {
		return cached, true, nil
	}

	normalized := strings.ReplaceAll(vtt, "\r\n", "\n")
	rawBlocks := strings.Split(normalized, "\n\n")
	var cues []vttCueBlock
	var cueIndices []int
	var texts []string

	for idx, block := range rawBlocks {
		lines := strings.Split(strings.TrimSpace(block), "\n")
		timingIdx := -1
		for i, line := range lines {
			if strings.Contains(line, "-->") {
				timingIdx = i
				break
			}
		}
		if timingIdx < 0 || timingIdx+1 >= len(lines) {
			continue
		}
		header := strings.Join(lines[:timingIdx], "\n")
		timing := lines[timingIdx]
		text := strings.TrimSpace(strings.Join(lines[timingIdx+1:], "\n"))
		if text == "" {
			continue
		}
		cues = append(cues, vttCueBlock{header: header, timing: timing, text: text})
		cueIndices = append(cueIndices, idx)
		texts = append(texts, text)
	}

	if len(texts) == 0 {
		return vtt, true, nil
	}

	// Translate sequentially in ~30s blocks (up to 15 cues per request), paced at 1 request every 5s
	// so playback stays well ahead (~3 min translated per 30s) without triggering HTTP 429 bursts.
	const chunkSize = 15
	translated := make([]string, len(texts))
	copy(translated, texts)

	var firstErr error
	translatedCount := 0

	for start := 0; start < len(texts); start += chunkSize {
		end := start + chunkSize
		if end > len(texts) {
			end = len(texts)
		}
		batch, err := translateTextBatch(ctx, texts[start:end], lang)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		copy(translated[start:end], batch)
		translatedCount += len(batch)
	}

	if translatedCount == 0 && firstErr != nil {
		return vtt, false, firstErr
	}

	for i, blockIdx := range cueIndices {
		cue := cues[i]
		var rebuilt strings.Builder
		if cue.header != "" {
			rebuilt.WriteString(cue.header)
			rebuilt.WriteByte('\n')
		}
		rebuilt.WriteString(cue.timing)
		rebuilt.WriteByte('\n')
		rebuilt.WriteString(translated[i])
		rawBlocks[blockIdx] = rebuilt.String()
	}

	finalVTT := strings.Join(rawBlocks, "\n\n")
	if firstErr == nil {
		writeSubtitleTranslateCache(key, finalVTT)
	}
	return finalVTT, false, firstErr
}
