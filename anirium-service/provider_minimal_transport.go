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
	return strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			return unicode.ToLower(r)
		}
		return ' '
	}, title)), " ")
}

var compactSourceEpisode = regexp.MustCompile(`(?i)\bS(\d+)E(\d+)(?:v\d+)?\b`)
var explicitSourceSeason = regexp.MustCompile(`(?i)\b(?:Season|Temporada|S)\s*(\d+)\b`)
var sourceEpisodeRange = regexp.MustCompile(`(?:\[|\(|\s-\s)(\d{1,4})\s*[-~–]\s*(\d{1,4})(?:\]|\)|\s|$)`)

// This is release identity, not a claim about the file's codecs or track inventory.
func minimalSourceMatches(title string, query PlaybackPrepareRequest) bool {
	normalized := " " + sourceTitleTokens(title) + " "
	identity := false
	for _, alias := range []string{query.Title, query.TitleEnglish, query.TitleRomaji} {
		alias = sourceTitleTokens(alias)
		if alias != "" && strings.Contains(normalized, " "+alias+" ") {
			identity = true
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
	slots := make(chan struct{}, 4)
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
	results := []ProviderSearchResult{}
	seenLinks := map[string]bool{}
	seenHashes := map[string]bool{}
	for _, part := range parts {
		for _, raw := range part {
			if ctx.Err() != nil {
				return results
			}
			if seenLinks[raw.Link] || !minimalSourceMatches(raw.Title, query) {
				continue
			}
			seenLinks[raw.Link] = true
			magnet, hash, err := providerLinkMagnet(ctx, raw.Link)
			if err != nil || seenHashes[hash] {
				continue
			}
			seenHashes[hash] = true
			result := ProviderSearchResult{Provider: id, Title: raw.Title, Magnet: magnet, InfoHash: hash}
			if raw.Seeders != nil && *raw.Seeders >= 0 {
				result.Seeders = *raw.Seeders
			}
			if raw.Leechers != nil && *raw.Leechers >= 0 {
				result.Leechers = *raw.Leechers
			}
			results = append(results, result)
		}
	}
	return results
}
