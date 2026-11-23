package main

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

func isRSSProviderURL(raw string) bool {
	u := strings.ToLower(strings.TrimSpace(raw))
	if u == "" {
		return false
	}
	return strings.Contains(u, "{query}") ||
		strings.Contains(u, "page=rss") ||
		strings.HasSuffix(u, ".rss") ||
		strings.Contains(u, "/rss?")
}

type rssDocument struct {
	Channel struct {
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}

type rssItem struct {
	Title     string `xml:"title"`
	Link      string `xml:"link"`
	GUID      string `xml:"guid"`
	InfoHash  string `xml:"infoHash"`
	Seeders   string `xml:"seeders"`
	Enclosure struct {
		URL string `xml:"url,attr"`
	} `xml:"enclosure"`
}

func rssItemMagnet(item rssItem) string {
	for _, candidate := range []string{item.Link, item.Enclosure.URL, item.GUID} {
		c := strings.TrimSpace(candidate)
		if strings.HasPrefix(strings.ToLower(c), "magnet:?") {
			if _, ok := normalizedMagnetHash(c); ok {
				return c
			}
		}
	}
	hash := strings.ToLower(strings.TrimSpace(item.InfoHash))
	if len(hash) == 40 {
		magnet := "magnet:?xt=urn:btih:" + hash
		if title := strings.TrimSpace(item.Title); title != "" {
			magnet += "&dn=" + url.QueryEscape(title)
		}
		if _, ok := normalizedMagnetHash(magnet); ok {
			return magnet
		}
	}
	return ""
}

func buildRSSSearchQueries(query PlaybackPrepareRequest) []string {
	seen := map[string]bool{}
	titles := []string{}
	addTitle := func(raw string) {
		clean := strings.NewReplacer("`", "'", "’", "'", "‘", "'").Replace(strings.TrimSpace(raw))
		if clean == "" || len([]rune(clean)) < 2 || len([]rune(clean)) > 140 {
			return
		}
		norm := normalizeIdentityTitle(clean)
		if norm == "" || seen[norm] {
			return
		}
		seen[norm] = true
		titles = append(titles, clean)
	}
	addTitle(query.Title)
	addTitle(query.TitleRomaji)
	addTitle(query.TitleEnglish)
	for _, alias := range query.Aliases {
		addTitle(alias)
	}
	if len(titles) == 0 {
		return nil
	}
	if len(titles) > 4 {
		titles = titles[:4]
	}

	out := []string{}
	isMovie := query.Format == "MOVIE" && query.EpisodeCount == 1 && query.Episode <= 1
	for _, title := range titles {
		if isMovie || query.Episode < 1 {
			out = append(out, title)
		} else {
			out = append(out, fmt.Sprintf("%s %02d", title, query.Episode))
		}
	}
	return out
}

func buildRSSEndpoint(templateURL, searchTerm string) string {
	encoded := url.QueryEscape(searchTerm)
	if strings.Contains(templateURL, "{query}") {
		return strings.ReplaceAll(templateURL, "{query}", encoded)
	}
	if strings.Contains(templateURL, "?") {
		return templateURL + "&q=" + encoded
	}
	return templateURL + "?q=" + encoded
}

func rssTitleVarietyBonus(title string) int {
	t := strings.ToLower(title)
	bonus := 0
	for _, kw := range []string{"multi", "pt-br", "ptbr", "portugues", "dual", "dub", "subsplease", "erai-raws", "toonshub", "varyg", "sub"} {
		if strings.Contains(t, kw) {
			bonus += 500
		}
	}
	if strings.Contains(t, "raw") && !strings.Contains(t, "erai-raws") {
		bonus -= 200
	}
	return bonus
}

func searchRSSProvider(parent context.Context, server ProviderServer, query PlaybackPrepareRequest) []ProviderSearchResult {
	terms := buildRSSSearchQueries(query)
	if len(terms) == 0 {
		return nil
	}

	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()

	type scored struct {
		result  ProviderSearchResult
		seeders int
	}
	byHash := map[string]scored{}

	for _, term := range terms {
		if ctx.Err() != nil {
			break
		}
		endpoint := buildRSSEndpoint(server.ManifestURL, term)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			continue
		}
		req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml")
		resp, err := providerHTTPClient.Do(req)
		if err != nil {
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		resp.Body.Close()
		if readErr != nil || resp.StatusCode != http.StatusOK {
			continue
		}
		var doc rssDocument
		if err := xml.Unmarshal(body, &doc); err != nil {
			continue
		}
		for _, item := range doc.Channel.Items {
			magnet := rssItemMagnet(item)
			if magnet == "" {
				continue
			}
			hash, ok := normalizedMagnetHash(magnet)
			if !ok {
				continue
			}
			seeders, _ := strconv.Atoi(strings.TrimSpace(item.Seeders))
			if existing, exists := byHash[hash]; exists && existing.seeders >= seeders {
				continue
			}
			byHash[hash] = scored{
				result: ProviderSearchResult{
					Provider: server.ID,
					Title:    strings.TrimSpace(item.Title),
					Magnet:   magnet,
					Seeders:  seeders,
				},
				seeders: seeders,
			}
		}
		// Continue across title variants to maximize subtitle/audio/quality variety.
		if len(byHash) >= 40 {
			break
		}
	}

	list := make([]scored, 0, len(byHash))
	for _, s := range byHash {
		list = append(list, s)
	}
	sort.Slice(list, func(i, j int) bool {
		si := list[i].seeders + rssTitleVarietyBonus(list[i].result.Title)
		sj := list[j].seeders + rssTitleVarietyBonus(list[j].result.Title)
		if si != sj {
			return si > sj
		}
		return list[i].seeders > list[j].seeders
	})
	if len(list) > 40 {
		list = list[:40]
	}
	results := make([]ProviderSearchResult, 0, len(list))
	for _, s := range list {
		results = append(results, s.result)
	}
	return results
}
