package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"strings"
)

func decodeVariantQuality(values url.Values) (string, error) {
	for key := range values {
		if key != "quality" && key != "playbackTicket" {
			return "", fmt.Errorf("unknown variant parameter")
		}
	}
	qualities := values["quality"]
	if len(qualities) != 1 || qualities[0] == "" || len(qualities[0]) > 32 || strings.TrimSpace(qualities[0]) != qualities[0] || len(values["playbackTicket"]) > 1 {
		return "", fmt.Errorf("one explicit quality required")
	}
	return qualities[0], nil
}

func decodePlaybackPrepare(body io.Reader) (PlaybackPrepareRequest, error) {
	var input PlaybackPrepareRequest
	const limit = 32 << 10
	payload, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil || len(payload) > limit {
		return input, fmt.Errorf("invalid playback payload size")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return input, err
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return input, fmt.Errorf("unexpected trailing playback payload")
	}
	input.Title = strings.TrimSpace(input.Title)
	input.TitleEnglish = strings.TrimSpace(input.TitleEnglish)
	input.TitleRomaji = strings.TrimSpace(input.TitleRomaji)
	if input.Episode < 1 || input.Season < 1 {
		return input, fmt.Errorf("positive episode and season required")
	}
	if input.Title == "" && input.TitleEnglish == "" && input.TitleRomaji == "" {
		return input, fmt.Errorf("title required")
	}
	for _, title := range []string{input.Title, input.TitleEnglish, input.TitleRomaji} {
		if len([]rune(title)) > 300 || strings.ContainsAny(title, "\x00\r\n") {
			return input, fmt.Errorf("invalid title")
		}
	}
	if len(input.Token) > 8192 || len(input.DeviceID) > 256 {
		return input, fmt.Errorf("invalid credential size")
	}
	return input, nil
}
