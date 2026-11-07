package main

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestServiceOwnsProviderTextQueries(t *testing.T) {
	queries := providerTextQueries(PlaybackPrepareRequest{Title: "Native", TitleRomaji: "Native", TitleEnglish: "English", Season: 2, Episode: 3})
	if len(queries) != 8 || queries[0] != "Native S02E03" || queries[4] != "English S02E03" {
		t.Fatalf("queries: %v", queries)
	}
	if providerTextQueries(PlaybackPrepareRequest{Title: "Native", Episode: 0, Season: 1}) != nil {
		t.Fatal("invalid episode accepted")
	}
}

func TestMinimalProviderContractKeepsUnknownCounts(t *testing.T) {
	var data struct {
		Results []MinimalProviderResult `json:"results"`
	}
	if err := json.Unmarshal([]byte(`{"results":[{"title":"Raw [1080p]","link":"magnet:?xt=urn:btih:abc","seeders":null,"leechers":0}]}`), &data); err != nil {
		t.Fatal(err)
	}
	if data.Results[0].Seeders != nil || data.Results[0].Leechers == nil || *data.Results[0].Leechers != 0 {
		t.Fatal("unknown and zero counts conflated")
	}
	contract := MinimalProviderSearch{Parameter: "q", Response: "results", Fields: []string{"title", "link", "seeders", "leechers"}}
	if !contract.supported() {
		t.Fatal("minimal contract rejected")
	}
	contract.Parameter = "title"
	if contract.supported() {
		t.Fatal("legacy contract accepted as minimal")
	}
	if !reflect.DeepEqual(data.Results[0].Title, "Raw [1080p]") {
		t.Fatal("provider title interpreted prematurely")
	}
}
