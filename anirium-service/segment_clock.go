package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"
)

// One common positive transport origin for window encoders. Without explicit
// MPEG-TS timestamp preservation, independent muxers shift video B-frame DTS
// and AAC priming by different amounts, especially in the first window.
const windowTransportOffset = 1.4

func segmentPacketPTS(parent context.Context, path, stream string) (float64, error) {
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	data, err := mediaCommandContext(ctx, mediaTool("ffprobe"), "-v", "error", "-select_streams", stream,
		"-show_entries", "packet=pts_time,dts_time", "-of", "json", path).Output()
	if err != nil {
		return 0, err
	}
	var result struct {
		Packets []struct {
			PTS string `json:"pts_time"`
			DTS string `json:"dts_time"`
		} `json:"packets"`
	}
	if err := json.Unmarshal(data, &result); err != nil || len(result.Packets) == 0 {
		return 0, fmt.Errorf("segment has no valid clock packet")
	}
	pts, err := strconv.ParseFloat(result.Packets[0].PTS, 64)
	if err != nil || math.IsNaN(pts) || math.IsInf(pts, 0) {
		return 0, fmt.Errorf("invalid segment clock")
	}
	var previous float64
	for index, packet := range result.Packets {
		dts, err := strconv.ParseFloat(packet.DTS, 64)
		if err != nil || math.IsNaN(dts) || math.IsInf(dts, 0) {
			return 0, fmt.Errorf("invalid segment decode timestamp")
		}
		if index > 0 && (dts < previous-0.001 || dts-previous > 0.5) {
			return 0, fmt.Errorf("discontinuous segment decode timeline")
		}
		previous = dts
	}
	return pts, nil
}
