package main

import (
	"math"
	"testing"
)

func TestMediaReadaheadTracksCapacityWithinBounds(t *testing.T) {
	for _, item := range []struct {
		rate    float64
		samples int
		want    int64
	}{
		{0, 0, 256 << 10}, {1e6, 2, 256 << 10},
		{1000, 3, 64 << 10}, {100000, 3, 200000},
		{1e12, 3, 2 << 20}, {math.NaN(), 3, 256 << 10},
		{math.Inf(1), 3, 256 << 10},
	} {
		if got := mediaReadahead(transferCapacity{BytesPerSecond: item.rate, Samples: item.samples}); got != item.want {
			t.Errorf("rate=%v samples=%d: got=%d want=%d", item.rate, item.samples, got, item.want)
		}
	}
}
