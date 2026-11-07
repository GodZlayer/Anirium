package main

import (
	"math"
	"testing"
)

func TestTransferCapacityIgnoresIdleAndInvalidSamples(t *testing.T) {
	var capacity transferCapacity
	for _, seconds := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		capacity.observe(100, seconds)
	}
	capacity.observe(-100, 1)
	capacity.observe(0, 1)
	if capacity.Samples != 0 {
		t.Fatal("invalid measurement accepted")
	}
	capacity.observe(1000, 2)
	capacity.observe(0, 10)
	if capacity.BytesPerSecond != 500 || capacity.Samples != 1 {
		t.Fatalf("idle sample changed capacity: %+v", capacity)
	}
}

func TestTransferCapacityRespondsFasterToSlowdownThanRecovery(t *testing.T) {
	var capacity transferCapacity
	capacity.observe(1000, 1)
	capacity.observe(200, 1)
	if capacity.BytesPerSecond != 600 {
		t.Fatalf("slowdown ignored: %+v", capacity)
	}
	capacity.observe(1000, 1)
	if capacity.BytesPerSecond != 660 {
		t.Fatalf("recovery not smoothed: %+v", capacity)
	}
}

func TestTransferCapacityTracksOnlyCurrentSwarmDeltas(t *testing.T) {
	var capacity transferCapacity
	capacity.observeSwarms(map[string]int64{"first": 1000000}, 1)
	if capacity.Samples != 0 {
		t.Fatal("historical swarm bytes counted")
	}
	capacity.observeSwarms(map[string]int64{"first": 1001000, "new": 9000000}, 2)
	if capacity.BytesPerSecond != 500 {
		t.Fatalf("new swarm history polluted capacity: %+v", capacity)
	}
	capacity.observeSwarms(map[string]int64{"new": 9000000}, 1)
	capacity.observeSwarms(map[string]int64{"first": 2000000}, 1)
	if capacity.Samples != 1 {
		t.Fatal("removed and rejoined swarm history counted")
	}
	capacity = transferCapacity{}
	capacity.observeSwarms(map[string]int64{"first": 2000000}, 1)
	if capacity.Samples != 0 || capacity.BytesPerSecond != 0 {
		t.Fatal("episode reset retained throughput")
	}
}

func TestSwarmRatesDoNotBorrowAnotherSourcesSpeed(t *testing.T) {
	var capacity transferCapacity
	capacity.observeSwarms(map[string]int64{"fast": 1000, "slow": 1000}, 1)
	for i := int64(1); i <= 3; i++ {
		capacity.observeSwarms(map[string]int64{"fast": 1000 + i*10000, "slow": 1000 + i*100}, 1)
	}
	if capacity.SwarmRates["fast"].BytesPerSecond != 10000 || capacity.SwarmRates["slow"].BytesPerSecond != 100 || capacity.SwarmRates["slow"].Samples != 3 {
		t.Fatal("swarm throughput mixed")
	}
	capacity.observeSwarms(map[string]int64{"fast": 31000}, 1)
	capacity.observeSwarms(map[string]int64{"fast": 31000, "slow": 90000}, 1)
	if capacity.SwarmRates["slow"].Samples != 0 {
		t.Fatal("rejoined swarm inherited stale speed")
	}
}
