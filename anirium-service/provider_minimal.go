package main

import (
	"fmt"
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
	for _, alias := range []string{query.Title, query.TitleEnglish, query.TitleRomaji} {
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
