package main

import (
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/anacrolix/torrent"
)

func TestDuplicateMagnetsPreserveAllUniqueTrackers(t *testing.T) {
	hash := strings.Repeat("ab", 20)
	results := []ProviderSearchResult{
		{InfoHash: "untrusted", Magnet: "magnet:?xt=urn:btih:" + hash + "&tr=" + url.QueryEscape("udp://tracker-one.invalid:80/announce")},
		{InfoHash: "different-claim", Magnet: "magnet:?xt=urn:btih:" + strings.ToUpper(hash) + "&tr=" + url.QueryEscape("udp://tracker-one.invalid:80/announce") + "&tr=" + url.QueryEscape("https://tracker-two.invalid/announce")},
		{Magnet: "not-a-magnet"},
	}
	magnets := pooledMagnets(results)
	if len(magnets) != 1 {
		t.Fatalf("pool: %v", magnets)
	}
	uri, err := url.Parse(magnets[0])
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(uri.Query()["tr"], []string{"udp://tracker-one.invalid:80/announce", "https://tracker-two.invalid/announce"}) {
		t.Fatalf("lost or duplicate trackers: %v", uri.Query()["tr"])
	}
	if actual, valid := normalizedMagnetHash(magnets[0]); !valid || actual != hash {
		t.Fatal("canonical identity lost")
	}
}

func TestDuplicateMagnetsPreservePeerAndWebSeedDiscovery(t *testing.T) {
	hash := strings.Repeat("cd", 20)
	results := []ProviderSearchResult{
		{Magnet: "magnet:?xt=urn:btih:" + hash + "&x.pe=127.0.0.1:5000&ws=https://seed.invalid/a"},
		{Magnet: "magnet:?xt=urn:btih:" + hash + "&x.pe=127.0.0.1:5000&x.pe=127.0.0.1:5001&ws=https://seed.invalid/b"},
	}
	pool := pooledMagnets(results)
	if len(pool) != 1 {
		t.Fatal("duplicate torrent not consolidated")
	}
	uri, _ := url.Parse(pool[0])
	if !reflect.DeepEqual(uri.Query()["x.pe"], []string{"127.0.0.1:5000", "127.0.0.1:5001"}) || !reflect.DeepEqual(uri.Query()["ws"], []string{"https://seed.invalid/a", "https://seed.invalid/b"}) {
		t.Fatalf("discovery hints lost: %v", uri.Query())
	}
	spec, err := torrent.TorrentSpecFromMagnetUri(pool[0])
	if err != nil || !reflect.DeepEqual(spec.PeerAddrs, uri.Query()["x.pe"]) || !reflect.DeepEqual(spec.Webseeds, uri.Query()["ws"]) {
		t.Fatalf("torrent engine did not receive discovery hints: %+v %v", spec, err)
	}
}
