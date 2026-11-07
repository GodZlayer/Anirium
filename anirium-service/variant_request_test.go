package main

import (
	"net/url"
	"testing"
)

func TestVariantRequestRejectsAmbiguousOrForeignInputs(t *testing.T) {
	for _, query := range []string{"", "quality=", "quality=720p&quality=1080p", "quality=720p&magnet=x", "quality=720p&provider=x", "quality=+720p", "quality=720p&playbackTicket=a&playbackTicket=b"} {
		values, _ := url.ParseQuery(query)
		if _, err := decodeVariantQuality(values); err == nil {
			t.Fatalf("ambiguous request accepted: %s", query)
		}
	}
	values, _ := url.ParseQuery("quality=720p&playbackTicket=opaque")
	if quality, err := decodeVariantQuality(values); err != nil || quality != "720p" {
		t.Fatalf("valid quality rejected: %s %v", quality, err)
	}
}
