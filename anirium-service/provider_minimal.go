package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
)

// Only Service turns catalogue context into index queries. Providers receive
// plain text and return index facts, not episode/media decisions.
type MinimalProviderSearch struct {
	Parameter string   `json:"parameter"`
	Response  string   `json:"response"`
	Fields    []string `json:"fields"`
}

type MinimalProviderResult struct {
	Title    string `json:"title"`
	Link     string `json:"link"`
	Seeders  *int   `json:"seeders"`
	Leechers *int   `json:"leechers"`
}

type malTitleMetadata struct {
	English  string
	Romaji   string
	Native   string
	Synonyms []string
}

var (
	malTitleCacheMu sync.Mutex
	malTitleCache   = map[int]malTitleMetadata{}

	seasonSuffixRegex   = regexp.MustCompile(`(?i)\b(?:\d+(?:st|nd|rd|th)\s+season|season\s*\d+|temporada\s*\d+|part\s*\d+|cour\s*\d+|s\d+)\b`)
	titleSplitDelimRe   = regexp.MustCompile(`(?:\s*:\s*|\s+[-–—~]\s+)`)
	pinyinCompoundPairs = [][2]string{
		{"xiongmao", "xiong mao"},
		{"xianwang", "xian wang"},
		{"doupo", "dou po"},
		{"cangqiong", "cang qiong"},
		{"tunshi", "tun shi"},
		{"xingkong", "xing kong"},
		{"fanren", "fan ren"},
		{"xiuxian", "xiu xian"},
		{"richang", "ri chang"},
		{"shenghuo", "sheng huo"},
	}
	diacriticReplacer = strings.NewReplacer(
		"ō", "o", "Ō", "O",
		"ū", "u", "Ū", "U",
		"ā", "a", "Ā", "A",
		"ī", "i", "Ī", "I",
		"ē", "e", "Ē", "E",
		"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
		"Á", "A", "À", "A", "Â", "A", "Ã", "A", "Ä", "A",
		"é", "e", "è", "e", "ê", "e", "ë", "e",
		"É", "E", "È", "E", "Ê", "E", "Ë", "E",
		"í", "i", "ì", "i", "î", "i", "ï", "i",
		"Í", "I", "Ì", "I", "Î", "I", "Ï", "I",
		"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
		"Ó", "O", "Ò", "O", "Ô", "O", "Õ", "O", "Ö", "O",
		"ú", "u", "ù", "u", "û", "u", "ü", "u",
		"Ú", "U", "Ù", "U", "Û", "U", "Ü", "U",
		"ç", "c", "Ç", "C",
		"ñ", "n", "Ñ", "N",
	)
	macronToDigraphReplacer = strings.NewReplacer(
		"ō", "ou", "Ō", "Ou",
		"ū", "uu", "Ū", "Uu",
	)
	digraphToShortReplacer = strings.NewReplacer(
		"ou", "o", "Ou", "O",
		"uu", "u", "Uu", "U",
	)
)

func foldLatinDiacritics(s string) string {
	return diacriticReplacer.Replace(s)
}

func containsCJKOrHangul(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) || unicode.Is(unicode.Hangul, r) {
			return true
		}
	}
	return false
}

// enrichPlaybackTitlesFromMAL fills missing English, Native, and Synonym titles
// for MAL-identified anime via AniList GraphQL so torrent/subtitle queries cover global scripts.
func enrichPlaybackTitlesFromMAL(ctx context.Context, query PlaybackPrepareRequest) PlaybackPrepareRequest {
	if query.MALID < 1 || os.Getenv("ANIRIUM_E2E_CHILD") == "1" {
		return query
	}
	if query.TitleEnglish != "" && query.TitleNative != "" && len(query.Aliases) > 0 {
		return query
	}
	malTitleCacheMu.Lock()
	meta, cached := malTitleCache[query.MALID]
	malTitleCacheMu.Unlock()

	if !cached {
		body, err := json.Marshal(map[string]any{
			"query":     "query($idMal:Int){Media(idMal:$idMal,type:ANIME){title{romaji english native} synonyms}}",
			"variables": map[string]int{"idMal": query.MALID},
		})
		if err != nil {
			return query
		}
		reqCtx, cancel := context.WithTimeout(ctx, 1200*time.Millisecond)
		defer cancel()
		req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, "https://graphql.anilist.co", bytes.NewReader(body))
		if err != nil {
			return query
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "AniriumIntegration/2.3")
		resp, err := providerHTTPClient.Do(req)
		if err != nil {
			return query
		}
		var payload struct {
			Data struct {
				Media *struct {
					Title struct {
						Romaji  string `json:"romaji"`
						English string `json:"english"`
						Native  string `json:"native"`
					} `json:"title"`
					Synonyms []string `json:"synonyms"`
				} `json:"media"`
			} `json:"data"`
		}
		decodeErr := decodeProviderJSON(resp.Body, 512<<10, &payload)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK || decodeErr != nil || payload.Data.Media == nil {
			return query
		}
		media := payload.Data.Media
		meta = malTitleMetadata{
			English:  strings.TrimSpace(media.Title.English),
			Romaji:   strings.TrimSpace(media.Title.Romaji),
			Native:   strings.TrimSpace(media.Title.Native),
			Synonyms: media.Synonyms,
		}
		malTitleCacheMu.Lock()
		if len(malTitleCache) >= 512 {
			malTitleCache = map[int]malTitleMetadata{}
		}
		malTitleCache[query.MALID] = meta
		malTitleCacheMu.Unlock()
	}

	if query.TitleEnglish == "" && meta.English != "" {
		query.TitleEnglish = meta.English
	}
	if query.TitleRomaji == "" && meta.Romaji != "" {
		query.TitleRomaji = meta.Romaji
	}
	if query.TitleNative == "" && meta.Native != "" {
		query.TitleNative = meta.Native
	}
	seenAlias := map[string]bool{}
	for _, existing := range []string{query.Title, query.TitleEnglish, query.TitleRomaji, query.TitleNative} {
		if existing != "" {
			seenAlias[strings.ToLower(strings.TrimSpace(existing))] = true
		}
	}
	for _, existing := range query.Aliases {
		if existing != "" {
			seenAlias[strings.ToLower(strings.TrimSpace(existing))] = true
		}
	}
	for _, candidate := range append([]string{meta.English, meta.Romaji, meta.Native}, meta.Synonyms...) {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" || len([]rune(candidate)) > 250 || len(query.Aliases) >= 12 {
			continue
		}
		key := strings.ToLower(candidate)
		if !seenAlias[key] {
			seenAlias[key] = true
			query.Aliases = append(query.Aliases, candidate)
		}
	}
	return query
}

func expandGlobalTitleVariants(query PlaybackPrepareRequest) []string {
	rawInputs := []string{query.Title, query.TitleEnglish, query.TitleRomaji, query.TitleNative}
	rawInputs = append(rawInputs, query.Aliases...)

	variants := []string{}
	seen := map[string]bool{}
	addVariant := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" || len([]rune(value)) < 2 || len([]rune(value)) > 250 {
			return
		}
		key := strings.ToLower(value)
		if !seen[key] {
			seen[key] = true
			variants = append(variants, value)
		}
	}

	baseSeeds := []string{}
	addSeed := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" || len([]rune(value)) > 250 {
			return
		}
		baseSeeds = append(baseSeeds, value)
		addVariant(value)

		stripped := strings.TrimSpace(seasonSuffixRegex.ReplaceAllString(value, ""))
		if stripped != "" && stripped != value {
			baseSeeds = append(baseSeeds, stripped)
			addVariant(stripped)
		}
	}

	for _, raw := range rawInputs {
		raw = strings.TrimSpace(raw)
		if raw == "" || len([]rune(raw)) > 250 {
			continue
		}
		addSeed(raw)
		if start := strings.Index(raw, "("); start != -1 {
			if end := strings.Index(raw[start:], ")"); end != -1 {
				inside := strings.TrimSpace(raw[start+1 : start+end])
				outside := strings.TrimSpace(raw[:start] + raw[start+end+1:])
				if len([]rune(inside)) >= 2 {
					addSeed(inside)
				}
				if len([]rune(outside)) >= 2 {
					addSeed(outside)
				}
			}
		}
	}

	// Expand derived forms (colon/dash parts, macron folding, Pinyin spacing)
	// in a secondary pass so primary canonical titles preserve priority order.
	for _, seed := range baseSeeds {
		if titleSplitDelimRe.MatchString(seed) {
			for _, part := range titleSplitDelimRe.Split(seed, -1) {
				part = strings.TrimSpace(part)
				if len([]rune(part)) >= 3 {
					addVariant(part)
					if stripped := strings.TrimSpace(seasonSuffixRegex.ReplaceAllString(part, "")); len([]rune(stripped)) >= 3 {
						addVariant(stripped)
					}
				}
			}
		}
		folded := foldLatinDiacritics(seed)
		if folded != seed {
			addVariant(folded)
		}
		digraph := macronToDigraphReplacer.Replace(seed)
		if digraph != seed {
			addVariant(foldLatinDiacritics(digraph))
		}
		if strings.Contains(seed, " ") {
			shortVowel := digraphToShortReplacer.Replace(seed)
			if shortVowel != seed {
				addVariant(foldLatinDiacritics(shortVowel))
			}
		}
		lower := strings.ToLower(seed)
		for _, pair := range pinyinCompoundPairs {
			if strings.Contains(lower, pair[0]) {
				addVariant(strings.ReplaceAll(lower, pair[0], pair[1]))
			}
			if strings.Contains(lower, pair[1]) {
				addVariant(strings.ReplaceAll(lower, pair[1], pair[0]))
			}
		}
	}
	return variants
}

func providerTextQueries(query PlaybackPrepareRequest) []string {
	if query.Season < 1 || query.Episode < 1 {
		return nil
	}
	queries := []string{}
	seen := map[string]bool{}
	const maxProviderQueries = 16

	for _, alias := range expandGlobalTitleVariants(query) {
		var templates []string
		if containsCJKOrHangul(alias) {
			templates = []string{
				fmt.Sprintf("%s %02d", alias, query.Episode),
				alias,
			}
		} else {
			templates = []string{
				fmt.Sprintf("%s S%02dE%02d", alias, query.Season, query.Episode),
				fmt.Sprintf("%s - %02d", alias, query.Episode),
				fmt.Sprintf("%s %02d", alias, query.Episode),
				alias,
			}
		}
		for _, text := range templates {
			if !seen[text] {
				seen[text] = true
				queries = append(queries, text)
				if len(queries) >= maxProviderQueries {
					return queries
				}
			}
		}
	}
	return queries
}

func (contract MinimalProviderSearch) supported() bool {
	if contract.Parameter != "q" || contract.Response != "results" {
		return false
	}
	for _, field := range []string{"title", "link", "seeders", "leechers"} {
		if !containsString(contract.Fields, field) {
			return false
		}
	}
	return true
}
