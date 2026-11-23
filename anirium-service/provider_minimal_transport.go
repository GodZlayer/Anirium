package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"unicode"

	"github.com/anacrolix/torrent/metainfo"
)

func sourceTitleTokens(title string) string {
	folded := foldLatinDiacritics(title)
	return strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			return unicode.ToLower(r)
		}
		return ' '
	}, folded)), " ")
}

var compactSourceEpisode = regexp.MustCompile(`(?i)\bS(\d+)E(\d+)(?:v\d+)?\b`)
var explicitSourceSeason = regexp.MustCompile(`(?i)\b(?:Season|Temporada|S)\s*(\d+)\b`)
var sourceEpisodeRange = regexp.MustCompile(`(?:\[|\(|\s-\s)(\d{1,4})\s*[-~–]\s*(\d{1,4})(?:\]|\)|\s|$)`)

// This is release identity, not a claim about the file's codecs or track inventory.
func minimalSourceMatches(title string, query PlaybackPrepareRequest) bool {
	normalized := " " + sourceTitleTokens(title) + " "
	identity := false
	for _, variant := range expandGlobalTitleVariants(query) {
		tokens := sourceTitleTokens(variant)
		if tokens == "" {
			continue
		}
		if strings.Contains(normalized, " "+tokens+" ") {
			identity = true
			break
		}
		if containsCJKOrHangul(tokens) && len([]rune(tokens)) >= 2 && strings.Contains(normalized, tokens) {
			identity = true
			break
		}
	}
	if !identity || query.Season < 1 || query.Episode < 1 {
		return false
	}
	compact := compactSourceEpisode.FindAllStringSubmatch(title, -1)
	if len(compact) > 0 {
		for _, match := range compact {
			season, _ := strconv.Atoi(match[1])
			episode, _ := strconv.Atoi(match[2])
			if season != query.Season || episode != query.Episode {
				return false
			}
		}
		return true
	}
	for _, match := range explicitSourceSeason.FindAllStringSubmatch(title, -1) {
		season, _ := strconv.Atoi(match[1])
		if season != query.Season {
			return false
		}
	}
	ranges := sourceEpisodeRange.FindAllStringSubmatch(title, -1)
	if len(ranges) > 0 {
		for _, match := range ranges {
			first, _ := strconv.Atoi(match[1])
			last, _ := strconv.Atoi(match[2])
			if first <= query.Episode && query.Episode <= last {
				return true
			}
		}
		return false
	}
	pattern := regexp.MustCompile(fmt.Sprintf(`(?i)(?:\s-\s|\b(?:EP|Episode|Episodio)\s*|\[)0*%d(?:v\d+)?(?:\s|\]|\(|$)`, query.Episode))
	return pattern.MatchString(title)
}

func providerLinkMagnet(ctx context.Context, link string) (string, string, error) {
	if hash, ok := normalizedMagnetHash(link); ok {
		return link, hash, nil
	}
	u, err := url.Parse(link)
	if err != nil || u.User != nil || u.Fragment != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", "", fmt.Errorf("invalid source link")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, link, nil)
	if err != nil {
		return "", "", err
	}
	// The existing provider transport enforces public IPs, redirects and TLS.
	response, err := providerHTTPClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("torrent metadata unavailable")
	}
	const limit = 4 << 20
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || len(data) > limit {
		return "", "", fmt.Errorf("invalid torrent metadata size")
	}
	meta, err := metainfo.Load(bytes.NewReader(data))
	if err != nil {
		return "", "", err
	}
	info, err := meta.UnmarshalInfo()
	if err != nil || info.PieceLength <= 0 || len(info.Pieces) == 0 || len(info.Pieces)%20 != 0 {
		return "", "", fmt.Errorf("invalid torrent info")
	}
	hash := meta.HashInfoBytes()
	return meta.Magnet(&hash, &info).String(), hash.HexString(), nil
}

func searchMinimalProvider(ctx context.Context, endpoint string, id string, query PlaybackPrepareRequest) []ProviderSearchResult {
	texts := providerTextQueries(query)
	parts := make([][]MinimalProviderResult, len(texts))
	slots := make(chan struct{}, 8)
	var workers sync.WaitGroup
	for index, text := range texts {
		workers.Add(1)
		go func(index int, text string) {
			defer workers.Done()
			select {
			case slots <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-slots }()
			u, err := url.Parse(endpoint)
			if err != nil {
				return
			}
			u.RawQuery = url.Values{"q": {text}}.Encode()
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
			if err != nil {
				return
			}
			req.Header.Set("X-Search-Timeout-Ms", fmt.Sprint(providerSearchBudgetMS(ctx)))
			resp, err := providerHTTPClient.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return
			}
			var payload struct {
				Results []MinimalProviderResult `json:"results"`
			}
			if decodeProviderJSON(resp.Body, 4<<20, &payload) == nil {
				parts[index] = payload.Results
			}
		}(index, text)
	}
	workers.Wait()
	candidates := []MinimalProviderResult{}
	seenLinks := map[string]bool{}
	for _, part := range parts {
		for _, raw := range part {
			if seenLinks[raw.Link] || !minimalSourceMatches(raw.Title, query) {
				continue
			}
			seenLinks[raw.Link] = true
			candidates = append(candidates, raw)
		}
	}
	type resolvedCandidate struct {
		magnet string
		hash   string
		err    error
	}
	resolved := make([]resolvedCandidate, len(candidates))
	resolveSlots := make(chan struct{}, 8)
	var resolveWg sync.WaitGroup
	for index, raw := range candidates {
		resolveWg.Add(1)
		go func(index int, link string) {
			defer resolveWg.Done()
			select {
			case resolveSlots <- struct{}{}:
			case <-ctx.Done():
				resolved[index] = resolvedCandidate{err: ctx.Err()}
				return
			}
			defer func() { <-resolveSlots }()
			magnet, hash, err := providerLinkMagnet(ctx, link)
			resolved[index] = resolvedCandidate{magnet: magnet, hash: hash, err: err}
		}(index, raw.Link)
	}
	resolveWg.Wait()
	results := []ProviderSearchResult{}
	seenHashes := map[string]bool{}
	for index, raw := range candidates {
		res := resolved[index]
		if res.err != nil || res.magnet == "" || seenHashes[res.hash] {
			continue
		}
		seenHashes[res.hash] = true
		result := ProviderSearchResult{Provider: id, Title: raw.Title, Magnet: res.magnet, InfoHash: res.hash}
		if raw.Seeders != nil && *raw.Seeders >= 0 {
			result.Seeders = *raw.Seeders
		}
		if raw.Leechers != nil && *raw.Leechers >= 0 {
			result.Leechers = *raw.Leechers
		}
		results = append(results, result)
	}
	return results
}
