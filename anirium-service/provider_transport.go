package main

import (
	"encoding/base32"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"strings"
)

var providerHTTPClient = newProviderHTTPClient()

func decodeProviderJSON(reader io.Reader, limit int64, destination any) error {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return err
	}
	if int64(len(data)) > limit {
		return fmt.Errorf("provider response exceeds limit")
	}
	return json.Unmarshal(data, destination)
}

func normalizedMagnetHash(magnet string) (string, bool) {
	uri, err := url.Parse(magnet)
	if err != nil || uri.Scheme != "magnet" || uri.Host != "" || uri.User != nil || uri.Fragment != "" || len(magnet) > 32768 {
		return "", false
	}
	params, err := url.ParseQuery(uri.RawQuery)
	if err != nil {
		return "", false
	}
	canonical := ""
	for _, exactTopic := range params["xt"] {
		if !strings.HasPrefix(strings.ToLower(exactTopic), "urn:btih:") {
			continue
		}
		encoded := exactTopic[len("urn:btih:"):]
		var hash []byte
		if len(encoded) == 40 {
			hash, err = hex.DecodeString(encoded)
		} else if len(encoded) == 32 {
			hash, err = base32.StdEncoding.DecodeString(strings.ToUpper(encoded))
		} else {
			return "", false
		}
		if err == nil && len(hash) == 20 {
			decoded := hex.EncodeToString(hash)
			if canonical != "" && canonical != decoded {
				return "", false
			}
			canonical = decoded
		} else {
			return "", false
		}
	}
	return canonical, canonical != ""
}
