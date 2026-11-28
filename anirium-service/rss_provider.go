package main

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
)

var (
	rssBracketRe  = regexp.MustCompile(`\[[^\]]*\]|\((?i:\s*(?:1080p|720p|480p|2160p|4k|web-?dl|webrip|bd|bdrip|bluray|dvdrip|hevc|x264|x265|h264|h265|10bit|8bit|aac|flac|opus|dual[\s-]*audio|multi[\s-]*sub|multisub|sub|dub|raws|batch|(?:19|20)\d{2})[^)]*)\)`)
	rssSeasonEpRe = regexp.MustCompile(`(?i)\bS(\d{1,2})\s*E(\d{1,4})\b`)
	rssEpDashRe   = regexp.MustCompile(`(?i)(?:^|[\s._-])(?:ep\.?\s*|e|-\s*)(\d{1,4})(?:v\d)?(?:\b|[\s._-]|$)`)
	rssNoiseRe    = regexp.MustCompile(`(?i)\b(1080p|720p|480p|2160p|4k|hevc|x264|x265|h264|h265|10bit|8bit|webrip|web-dl|webdl|bluray|bdrip|dvdrip|mkv|mp4|aac|flac|opus|multisub|multi-sub|multi|dual|audio|dub|sub|vostfr|pt-br|ptbr|eng|jpn|raws|batch)\b`)
	rssTokenRe    = regexp.MustCompile(`[\p{L}\p{N}]+`)
)

func rssTokenize(s string) []string {
	s = strings.ToLower(strings.NewReplacer("'", "", "’", "", "`", "", "-", " ", "_", " ", ".", " ", ":", " ", "!", " ", "?", " ").Replace(s))
	raw := rssTokenRe.FindAllString(s, -1)
	out := make([]string, 0, len(raw))
	for _, t := range raw {
		if t == "" || rssNoiseRe.MatchString(t) {
			continue
		}
		out = append(out, t)
	}
	return out
}

func rssExtractTitleAndEpisode(rawTitle string) (string, int, int) {
	cleaned := rssBracketRe.ReplaceAllString(rawTitle, " ")
	cleaned = strings.TrimSpace(cleaned)
	season := 0
	ep := 0
	titlePart := cleaned

	if loc := rssSeasonEpRe.FindStringSubmatchIndex(cleaned); loc != nil {
		season, _ = strconv.Atoi(cleaned[loc[2]:loc[3]])
		ep, _ = strconv.Atoi(cleaned[loc[4]:loc[5]])
		titlePart = strings.TrimSpace(cleaned[:loc[0]])
	} else {
		// Procura último padrão "- 01" ou "Ep 01" ou número isolado no final
		all := rssEpDashRe.FindAllStringSubmatchIndex(cleaned, -1)
		if len(all) > 0 {
			last := all[len(all)-1]
			ep, _ = strconv.Atoi(cleaned[last[2]:last[3]])
			titlePart = strings.TrimSpace(cleaned[:last[0]])
		}
	}
	titlePart = rssNoiseRe.ReplaceAllString(titlePart, " ")
	return strings.TrimSpace(titlePart), season, ep
}

func rssItemMatchesRequest(rawTitle string, query PlaybackPrepareRequest) bool {
	candidates := make([]string, 0, 4+len(query.Aliases))
	candidates = append(candidates, query.TitleRomaji, query.Title, query.TitleEnglish, query.TitleNative)
	candidates = append(candidates, query.Aliases...)

	expectedSets := make([][]string, 0, len(candidates))
	seenSig := make(map[string]struct{}, len(candidates))
	for _, c := range candidates {
		toks := rssTokenize(c)
		if len(toks) == 0 {
			continue
		}
		sig := strings.Join(toks, " ")
		if _, dup := seenSig[sig]; dup {
			continue
		}
		seenSig[sig] = struct{}{}
		expectedSets = append(expectedSets, toks)
	}
	if len(expectedSets) == 0 {
		return true
	}

	titlePart, season, ep := rssExtractTitleAndEpisode(rawTitle)

	// 1. Validação exata de episódio e temporada
	isMovie := query.Format == "MOVIE" && query.EpisodeCount == 1 && query.Episode <= 1
	if !isMovie && query.Episode > 0 {
		if ep <= 0 {
			return false
		}
		if ep != query.Episode && (query.AbsoluteEpisode <= 0 || ep != query.AbsoluteEpisode) {
			return false
		}
		reqSeason := query.Season
		if reqSeason < 1 {
			reqSeason = 1
		}
		if season > 0 && season != reqSeason {
			return false
		}
	}

	// 2. Validação estrita do título: exige correspondência 100% com uma das variações oficiais
	// (ou combinação exata de duas variações oficiais da mesma obra, ex: Romaji + English).
	gotTokens := rssTokenize(titlePart)
	if len(gotTokens) == 0 {
		return false
	}

	tokensEqual := func(a, b []string) bool {
		if len(a) != len(b) {
			return false
		}
		for i := range a {
			if a[i] != b[i] {
				return false
			}
		}
		return true
	}

	for _, exp := range expectedSets {
		if tokensEqual(gotTokens, exp) {
			return true
		}
	}
	for i := range expectedSets {
		for j := range expectedSets {
			if i == j {
				continue
			}
			if len(gotTokens) == len(expectedSets[i])+len(expectedSets[j]) {
				combined := make([]string, 0, len(gotTokens))
				combined = append(combined, expectedSets[i]...)
				combined = append(combined, expectedSets[j]...)
				if tokensEqual(gotTokens, combined) {
					return true
				}
			}
		}
	}
	return false
}

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
	addTitle(query.TitleRomaji)
	addTitle(query.Title)
	addTitle(query.TitleEnglish)
	addTitle(query.TitleNative)
	for _, alias := range query.Aliases {
		addTitle(alias)
	}
	if len(titles) == 0 {
		return nil
	}

	out := []string{}
	seenQuery := map[string]bool{}
	addQuery := func(q string) {
		q = strings.TrimSpace(q)
		if q == "" || seenQuery[q] {
			return
		}
		seenQuery[q] = true
		out = append(out, q)
	}
	isMovie := query.Format == "MOVIE" && query.EpisodeCount == 1 && query.Episode <= 1
	season := query.Season
	if season < 1 {
		season = 1
	}
	for _, title := range titles {
		if isMovie || query.Episode < 1 {
			addQuery(title)
			continue
		}
		addQuery(fmt.Sprintf("%s %02d", title, query.Episode))
		addQuery(fmt.Sprintf("%s S%02dE%02d", title, season, query.Episode))
		if query.AbsoluteEpisode > 0 && query.AbsoluteEpisode != query.Episode {
			addQuery(fmt.Sprintf("%s %02d", title, query.AbsoluteEpisode))
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

	ctx := parent
	if ctx == nil {
		ctx = context.Background()
	}

	type scored struct {
		result  ProviderSearchResult
		seeders int
	}
	var (
		mu     sync.Mutex
		byHash = map[string]scored{}
		wg     sync.WaitGroup
		sem    = make(chan struct{}, 4)
	)

	for _, term := range terms {
		if ctx.Err() != nil {
			break
		}
		wg.Add(1)
		go func(term string) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-sem }()

			endpoint := buildRSSEndpoint(server.ManifestURL, term)
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
			if err != nil {
				return
			}
			req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml")
			resp, err := providerHTTPClient.Do(req)
			if err != nil {
				return
			}
			body, readErr := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
			resp.Body.Close()
			if readErr != nil || resp.StatusCode != http.StatusOK {
				return
			}
			var doc rssDocument
			if err := xml.Unmarshal(body, &doc); err != nil {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			for _, item := range doc.Channel.Items {
				if !rssItemMatchesRequest(item.Title, query) {
					continue
				}
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
		}(term)
	}
	wg.Wait()

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
	results := make([]ProviderSearchResult, 0, len(list))
	for _, s := range list {
		results = append(results, s.result)
	}
	return results
}
