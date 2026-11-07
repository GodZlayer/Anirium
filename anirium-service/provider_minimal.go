package main

import (
	"fmt"
	"regexp"
	"strings"
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

func providerTextQueries(query PlaybackPrepareRequest) []string {
	if query.Season < 1 || query.Episode < 1 {
		return nil
	}
	queries := []string{}
	seen := map[string]bool{}

	rawAliases := []string{query.Title, query.TitleEnglish, query.TitleRomaji}
	aliases := []string{}
	seasonSuffixRegex := regexp.MustCompile(`(?i)\b(?:\d+(?:st|nd|rd|th)\s+season|season\s*\d+|s\d+)\b`)

	for _, raw := range rawAliases {
		raw = strings.TrimSpace(raw)
		if raw == "" || len([]rune(raw)) > 250 {
			continue
		}
		aliases = append(aliases, raw)

		// Stripped season variant: "Tensei Kizoku, Kantei Skill de Nariagaru 3rd Season" -> "Tensei Kizoku, Kantei Skill de Nariagaru"
		stripped := strings.TrimSpace(seasonSuffixRegex.ReplaceAllString(raw, ""))
		if stripped != "" && stripped != raw && len([]rune(stripped)) >= 2 {
			aliases = append(aliases, stripped)
		}

		// Extract inside parentheses, e.g. "Tempal: Item no Chikara (Overgeared)" -> "Overgeared" and "Tempal: Item no Chikara"
		if start := strings.Index(raw, "("); start != -1 {
			if end := strings.Index(raw[start:], ")"); end != -1 {
				inside := strings.TrimSpace(raw[start+1 : start+end])
				outside := strings.TrimSpace(raw[:start] + raw[start+end+1:])
				if len(inside) >= 2 {
					aliases = append(aliases, inside)
					strippedInside := strings.TrimSpace(seasonSuffixRegex.ReplaceAllString(inside, ""))
					if strippedInside != "" && strippedInside != inside {
						aliases = append(aliases, strippedInside)
					}
				}
				if len(outside) >= 2 {
					aliases = append(aliases, outside)
					strippedOutside := strings.TrimSpace(seasonSuffixRegex.ReplaceAllString(outside, ""))
					if strippedOutside != "" && strippedOutside != outside {
						aliases = append(aliases, strippedOutside)
					}
				}
			}
		}
	}

	for _, alias := range aliases {
		alias = strings.TrimSpace(alias)
		if alias == "" || len([]rune(alias)) > 250 {
			continue
		}
		for _, text := range []string{
			fmt.Sprintf("%s S%02dE%02d", alias, query.Season, query.Episode),
			fmt.Sprintf("%s - %02d", alias, query.Episode),
			fmt.Sprintf("%s %02d", alias, query.Episode),
			alias,
		} {
			if !seen[text] {
				seen[text] = true
				queries = append(queries, text)
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
