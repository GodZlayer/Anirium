package main

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var (
	htmlHrefRe       = regexp.MustCompile(`(?is)<a\s+[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>(.*?)</a>`)
	htmlTagStripRe   = regexp.MustCompile(`(?s)<[^>]+>`)
	subSeasonEpRe    = regexp.MustCompile(`(?i)(?:^|[\s._\-\[\(/])s0*(\d{1,2})\s*e0*(\d{1,4})(?:v\d)?(?:$|[\s._\-\]\),/])`)
	subSeasonOnlyRe  = regexp.MustCompile(`(?i)(?:^|[\s._\-\[\(/])(?:season|temp|temporada)[\s._\-]*0*(\d{1,2})(?:$|[\s._\-\]\),/])`)
	subEpisodeNumRe  = regexp.MustCompile(`(?i)(?:^|[\s._\-\[\(/])(?:ep?|episode|s\d{1,2}e)?0*(\d{1,4})(?:v\d)?(?:$|[\s._\-\]\),/])`)
	subNonWordRe     = regexp.MustCompile(`[^\p{L}\p{N}]+`)
)

var subtitleTitleStopwords = map[string]bool{
	"the": true, "a": true, "an": true, "of": true, "to": true, "in": true, "on": true, "and": true,
	"no": true, "wa": true, "ga": true, "wo": true, "ni": true, "de": true, "to2": true,
}

func subtitleCandidatePathText(raw string) string {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(strings.ToLower(s), "http://") || strings.HasPrefix(strings.ToLower(s), "https://") {
		if u, err := url.Parse(s); err == nil {
			s = u.Path
		}
	}
	if unescaped, err := url.PathUnescape(s); err == nil && unescaped != "" {
		s = unescaped
	}
	return s
}

func subtitleTokens(raw string) []string {
	cleaned := strings.ToLower(subNonWordRe.ReplaceAllString(raw, " "))
	fields := strings.Fields(cleaned)
	if len(fields) == 0 {
		return nil
	}
	var filtered []string
	for _, f := range fields {
		if len([]rune(f)) >= 2 && !subtitleTitleStopwords[f] {
			filtered = append(filtered, f)
		}
	}
	if len(filtered) > 0 {
		return filtered
	}
	return fields
}

func subtitleTextMatchesQueryTitle(text string, query PlaybackPrepareRequest) bool {
	var titles []string
	for _, t := range append([]string{query.Title, query.TitleEnglish, query.TitleRomaji}, query.Aliases...) {
		if strings.TrimSpace(t) != "" {
			titles = append(titles, t)
		}
	}
	if len(titles) == 0 {
		return true
	}
	candidateTokens := subtitleTokens(subtitleCandidatePathText(text))
	if len(candidateTokens) == 0 {
		return false
	}
	candSet := make(map[string]bool, len(candidateTokens))
	for _, tok := range candidateTokens {
		candSet[tok] = true
	}
	for _, title := range titles {
		tTokens := subtitleTokens(title)
		if len(tTokens) == 0 {
			continue
		}
		matched := 0
		for _, tok := range tTokens {
			if candSet[tok] {
				matched++
			}
		}
		if len(tTokens) <= 2 {
			if matched == len(tTokens) {
				return true
			}
		} else if matched >= 2 && matched*4 >= len(tTokens)*3 {
			return true
		}
	}
	return false
}

// subtitleTextMatchesEpisode prevents external search sites (e.g. SubtitleCat)
// from returning Episode 7's .srt when searching for Episode 8, or S12E02 when
// searching for Season 1 Episode 2.
func subtitleTextMatchesEpisode(text string, wantedSeason, wantedEp int) bool {
	pathText := subtitleCandidatePathText(text)
	if seMatches := subSeasonEpRe.FindAllStringSubmatch(pathText, -1); len(seMatches) > 0 {
		matchedSE := false
		for _, m := range seMatches {
			s, errS := strconv.Atoi(m[1])
			e, errE := strconv.Atoi(m[2])
			if errS != nil || errE != nil {
				continue
			}
			seasonOK := wantedSeason <= 0 || s == wantedSeason
			epOK := wantedEp <= 0 || e == wantedEp
			if seasonOK && epOK {
				matchedSE = true
			}
		}
		return matchedSE
	}
	if wantedSeason > 0 {
		if sMatches := subSeasonOnlyRe.FindAllStringSubmatch(pathText, -1); len(sMatches) > 0 {
			seasonOK := false
			for _, m := range sMatches {
				if s, err := strconv.Atoi(m[1]); err == nil && s == wantedSeason {
					seasonOK = true
				}
			}
			if !seasonOK {
				return false
			}
		}
	}
	if wantedEp <= 0 {
		return true
	}
	matches := subEpisodeNumRe.FindAllStringSubmatch(pathText, -1)
	if len(matches) == 0 {
		return false
	}
	foundWanted := false
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		n, err := strconv.Atoi(m[1])
		if err != nil || n == 0 {
			continue
		}
		// Ignore common video resolutions / years (e.g. 720, 1080, 2026)
		if n == 480 || n == 720 || n == 1080 || n == 2160 || (n >= 1990 && n <= 2035) {
			continue
		}
		if n == wantedEp {
			foundWanted = true
		}
	}
	return foundWanted
}

func subtitleCandidateMatchesQuery(text string, query PlaybackPrepareRequest) bool {
	if !subtitleTextMatchesQueryTitle(text, query) {
		return false
	}
	return subtitleTextMatchesEpisode(text, query.Season, query.Episode)
}

func isSubtitleQueryProviderURL(raw string) bool {
	u := strings.ToLower(strings.TrimSpace(raw))
	if u == "" {
		return false
	}
	if strings.Contains(u, "{subquery}") || strings.Contains(u, "{malid}") {
		return true
	}
	if (strings.Contains(u, "{query}") || strings.Contains(u, "{episode}")) &&
		(strings.Contains(u, "sub") || strings.Contains(u, "legenda") || strings.Contains(u, "jimaku")) {
		return true
	}
	return false
}

func buildSubtitleQueryEndpoint(templateURL, term string, query PlaybackPrepareRequest) string {
	encoded := url.QueryEscape(term)
	ep := strconv.Itoa(max(1, query.Episode))
	season := strconv.Itoa(max(1, query.Season))
	mal := ""
	if query.MALID > 0 {
		mal = strconv.Itoa(query.MALID)
	}
	r := strings.NewReplacer(
		"{subquery}", encoded,
		"{query}", encoded,
		"{malId}", mal,
		"{malid}", mal,
		"{episode}", ep,
		"{season}", season,
	)
	return r.Replace(templateURL)
}

func inferSubtitleLangFromText(raw string) string {
	l := strings.ToLower(strings.TrimSpace(raw))
	switch {
	case strings.Contains(l, "pt-br") || strings.Contains(l, "pt_br") || strings.Contains(l, "portugues") || strings.Contains(l, "português") || strings.Contains(l, "brazil") || l == "por" || l == "pt":
		return "por"
	case strings.Contains(l, "eng") || strings.Contains(l, "english") || l == "en":
		return "eng"
	case strings.Contains(l, "spa") || strings.Contains(l, "espanol") || strings.Contains(l, "español") || l == "es":
		return "spa"
	case strings.Contains(l, "jpn") || strings.Contains(l, "japanese") || l == "ja":
		return "jpn"
	default:
		if l != "" && len(l) <= 3 {
			return canonicalLanguage(l)
		}
		return "und"
	}
}

func inferSubtitleFormatFromURL(raw string) string {
	u := strings.ToLower(strings.TrimSpace(raw))
	if idx := strings.IndexByte(u, '?'); idx >= 0 {
		u = u[:idx]
	}
	switch {
	case strings.HasSuffix(u, ".vtt"):
		return "vtt"
	case strings.HasSuffix(u, ".ass"):
		return "ass"
	case strings.HasSuffix(u, ".srt"):
		return "srt"
	default:
		return ""
	}
}

func inferSubtitleLangFromURLOrText(subURL, text string) string {
	lowerURL := strings.ToLower(subURL)
	switch {
	case strings.Contains(lowerURL, "-pt-br.") || strings.Contains(lowerURL, "-pt_br.") || strings.Contains(lowerURL, "-pt.") || strings.Contains(lowerURL, ".pt.") || strings.Contains(lowerURL, ".por."):
		return "por"
	case strings.Contains(lowerURL, "-en.") || strings.Contains(lowerURL, ".en.") || strings.Contains(lowerURL, ".eng."):
		return "eng"
	case strings.Contains(lowerURL, "-es.") || strings.Contains(lowerURL, ".es.") || strings.Contains(lowerURL, ".spa."):
		return "spa"
	case strings.Contains(lowerURL, "-ja.") || strings.Contains(lowerURL, ".ja.") || strings.Contains(lowerURL, ".jpn."):
		return "jpn"
	}
	return inferSubtitleLangFromText(text)
}

func isDirectSubtitleURL(raw string) bool {
	u := strings.ToLower(strings.TrimSpace(raw))
	if idx := strings.IndexByte(u, '?'); idx >= 0 {
		u = u[:idx]
	}
	return strings.HasSuffix(u, ".srt") || strings.HasSuffix(u, ".vtt") || strings.HasSuffix(u, ".ass")
}

func parseSubtitleHTMLResponse(baseURL string, body []byte) ([]ProviderSubtitle, []string) {
	base, err := url.Parse(baseURL)
	if err != nil {
		return nil, nil
	}
	matches := htmlHrefRe.FindAllSubmatch(body, 256)
	var subs []ProviderSubtitle
	var detailPages []string
	seenSub := map[string]bool{}
	seenDetail := map[string]bool{}

	for _, m := range matches {
		if len(m) < 3 {
			continue
		}
		href := strings.TrimSpace(string(m[1]))
		if href == "" || strings.HasPrefix(strings.ToLower(href), "javascript:") || strings.HasPrefix(strings.ToLower(href), "mailto:") {
			continue
		}
		ref, parseErr := url.Parse(href)
		if parseErr != nil {
			continue
		}
		resolved := base.ResolveReference(ref)
		if resolved.Scheme != "http" && resolved.Scheme != "https" {
			continue
		}
		fullURL := resolved.String()
		label := strings.TrimSpace(htmlTagStripRe.ReplaceAllString(string(m[2]), " "))
		label = strings.Join(strings.Fields(label), " ")

		if isDirectSubtitleURL(fullURL) {
			if seenSub[fullURL] {
				continue
			}
			seenSub[fullURL] = true
			lang := inferSubtitleLangFromURLOrText(fullURL, label)
			title := label
			lowerLabel := strings.ToLower(strings.TrimSpace(label))
			if title == "" || lowerLabel == "download" || lowerLabel == "baixar" {
				baseName := resolved.Path
				if slash := strings.LastIndexByte(baseName, '/'); slash >= 0 {
					baseName = baseName[slash+1:]
				}
				if decoded, decErr := url.PathUnescape(baseName); decErr == nil && decoded != "" {
					baseName = decoded
				}
				title = strings.TrimSpace(baseName)
			}
			subs = append(subs, ProviderSubtitle{
				Language: lang,
				Title:    title,
				URL:      fullURL,
				Format:   inferSubtitleFormatFromURL(fullURL),
			})
			continue
		}

		// Two-step HTML subtitle search pages (e.g. subtitlecat.com /subs/<id>/<name>.html)
		lowerPath := strings.ToLower(resolved.Path)
		if strings.EqualFold(resolved.Host, base.Host) &&
			(strings.Contains(lowerPath, "/subs/") || strings.Contains(lowerPath, "/subtitle/")) &&
			strings.HasSuffix(lowerPath, ".html") &&
			!seenDetail[fullURL] {
			seenDetail[fullURL] = true
			detailPages = append(detailPages, fullURL)
		}
	}
	return subs, detailPages
}

func parseSubtitleQueryResponse(providerID string, body []byte) []ProviderSubtitle {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return nil
	}
	var out []ProviderSubtitle
	seen := map[string]bool{}
	add := func(subURL, lang, title string) {
		subURL = strings.TrimSpace(subURL)
		if subURL == "" || seen[subURL] {
			return
		}
		if !strings.HasPrefix(strings.ToLower(subURL), "http://") && !strings.HasPrefix(strings.ToLower(subURL), "https://") {
			return
		}
		seen[subURL] = true
		resolvedLang := inferSubtitleLangFromText(lang)
		if lang == "" {
			resolvedLang = inferSubtitleLangFromText(title)
		}
		out = append(out, ProviderSubtitle{
			Language: resolvedLang,
			Title:    strings.TrimSpace(title),
			URL:      subURL,
			Format:   inferSubtitleFormatFromURL(subURL),
		})
	}

	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		type jsonSub struct {
			URL      string `json:"url"`
			Lang     string `json:"lang"`
			Language string `json:"language"`
			Title    string `json:"title"`
			Name     string `json:"name"`
		}
		var wrapper struct {
			Subtitles []jsonSub `json:"subtitles"`
			Results   []jsonSub `json:"results"`
			Files     []jsonSub `json:"files"`
		}
		if json.Unmarshal(body, &wrapper) == nil {
			for _, list := range [][]jsonSub{wrapper.Subtitles, wrapper.Results, wrapper.Files} {
				for _, item := range list {
					lang := item.Lang
					if lang == "" {
						lang = item.Language
					}
					title := item.Title
					if title == "" {
						title = item.Name
					}
					add(item.URL, lang, title)
				}
			}
		}
		if len(out) == 0 {
			var arr []jsonSub
			if json.Unmarshal(body, &arr) == nil {
				for _, item := range arr {
					lang := item.Lang
					if lang == "" {
						lang = item.Language
					}
					title := item.Title
					if title == "" {
						title = item.Name
					}
					add(item.URL, lang, title)
				}
			}
		}
		return out
	}

	// XML / RSS fallback
	var doc rssDocument
	if xml.Unmarshal(body, &doc) == nil {
		for _, item := range doc.Channel.Items {
			subURL := strings.TrimSpace(item.Enclosure.URL)
			if subURL == "" {
				subURL = strings.TrimSpace(item.Link)
			}
			add(subURL, "", item.Title)
		}
	}
	return out
}

func searchSubtitleQueryProvider(parent context.Context, server ProviderServer, query PlaybackPrepareRequest) []ProviderSubtitle {
	terms := buildRSSSearchQueries(query)
	if len(terms) == 0 && query.MALID > 0 {
		terms = []string{strconv.Itoa(query.MALID)}
	}
	if len(terms) == 0 {
		return nil
	}

	ctx := parent
	if ctx == nil {
		ctx = context.Background()
	}

	var all []ProviderSubtitle
	seen := map[string]bool{}
	usesQuery := strings.Contains(strings.ToLower(server.ManifestURL), "{query}") ||
		strings.Contains(strings.ToLower(server.ManifestURL), "{subquery}")
	if !usesQuery {
		terms = terms[:1]
	}

	for _, term := range terms {
		if ctx.Err() != nil {
			break
		}
		endpoint := buildSubtitleQueryEndpoint(server.ManifestURL, term, query)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			continue
		}
		req.Header.Set("Accept", "text/html, application/json, application/rss+xml, application/xml, text/xml")
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Anirium/1.0")
		resp, err := providerHTTPClient.Do(req)
		if err != nil {
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		resp.Body.Close()
		if readErr != nil || resp.StatusCode != http.StatusOK {
			continue
		}
		found := parseSubtitleQueryResponse(server.ID, body)
		if len(found) > 0 && usesQuery {
			var filtered []ProviderSubtitle
			for _, sub := range found {
				if subtitleCandidateMatchesQuery(sub.Title+" "+sub.URL, query) {
					filtered = append(filtered, sub)
				}
			}
			found = filtered
		}
		if len(found) == 0 {
			htmlSubs, detailPages := parseSubtitleHTMLResponse(endpoint, body)
			for _, sub := range htmlSubs {
				if !usesQuery || subtitleCandidateMatchesQuery(sub.Title+" "+sub.URL, query) {
					found = append(found, sub)
				}
			}
			if len(found) == 0 && len(detailPages) > 0 {
				var filteredPages []string
				for _, detailURL := range detailPages {
					if subtitleCandidateMatchesQuery(detailURL, query) {
						filteredPages = append(filteredPages, detailURL)
					}
				}
				for _, detailURL := range filteredPages {
					if ctx.Err() != nil {
						break
					}
					dReq, dErr := http.NewRequestWithContext(ctx, http.MethodGet, detailURL, nil)
					if dErr != nil {
						continue
					}
					dReq.Header.Set("Accept", "text/html")
					dReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Anirium/1.0")
					dResp, dErr := providerHTTPClient.Do(dReq)
					if dErr != nil {
						continue
					}
					dBody, dReadErr := io.ReadAll(io.LimitReader(dResp.Body, 2<<20))
					dResp.Body.Close()
					if dReadErr != nil || dResp.StatusCode != http.StatusOK {
						continue
					}
					detailSubs, _ := parseSubtitleHTMLResponse(detailURL, dBody)
					found = append(found, detailSubs...)
				}
			}
		}
		for _, sub := range found {
			if seen[sub.URL] {
				continue
			}
			seen[sub.URL] = true
			all = append(all, sub)
		}
	}
	return all
}
