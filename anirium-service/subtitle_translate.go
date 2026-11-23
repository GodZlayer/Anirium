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
	"strings"
	"sync"
	"testing"
	"time"
)

var (
	subTranslateMu      sync.Mutex
	subTranslateMem     = map[string]string{}
	subTranslateBaseURL = "https://translate.googleapis.com/translate_a/single"
	subTranslateClient  = &http.Client{Timeout: 6 * time.Second}
)

type vttCueBlock struct {
	header string
	timing string
	text   string
}

func normalizeTranslateLang(lang string) string {
	l := strings.ToLower(strings.TrimSpace(lang))
	switch l {
	case "", "por", "pt-br", "pt_br", "pt":
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
	const sep = "\n@@@ANIRIUM_SEP@@@\n"
	joined := strings.Join(texts, sep)

	form := url.Values{}
	form.Set("client", "gtx")
	form.Set("sl", "auto")
	form.Set("tl", targetLang)
	form.Set("dt", "t")
	form.Set("q", joined)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, subTranslateBaseURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := subTranslateClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("translate HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}

	var parsed []any
	if err := json.Unmarshal(body, &parsed); err != nil || len(parsed) == 0 {
		return nil, fmt.Errorf("invalid translate response")
	}
	sentences, ok := parsed[0].([]any)
	if !ok {
		return nil, fmt.Errorf("missing translated sentences")
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
	full := out.String()
	parts := strings.Split(full, "@@@ANIRIUM_SEP@@@")
	if len(parts) != len(texts) {
		return nil, fmt.Errorf("cue count mismatch: got %d want %d", len(parts), len(texts))
	}
	result := make([]string, len(parts))
	for i, p := range parts {
		result[i] = strings.TrimSpace(p)
	}
	return result, nil
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

	// Translate in chunks of up to 25 cues so requests stay fast (~200-400ms).
	const chunkSize = 25
	translated := make([]string, len(texts))
	for start := 0; start < len(texts); start += chunkSize {
		end := start + chunkSize
		if end > len(texts) {
			end = len(texts)
		}
		batch, err := translateTextBatch(ctx, texts[start:end], lang)
		if err != nil {
			return vtt, false, err
		}
		copy(translated[start:end], batch)
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
	writeSubtitleTranslateCache(key, finalVTT)
	return finalVTT, false, nil
}
