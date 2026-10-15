package main

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func playlistBandwidth(dir string) (int64, error) {
	data, err := os.ReadFile(filepath.Join(dir, "index.m3u8"))
	if err != nil {
		return 0, err
	}
	duration := 0.0
	peak := int64(0)
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#EXTINF:") {
			duration, err = strconv.ParseFloat(strings.TrimSuffix(strings.TrimPrefix(line, "#EXTINF:"), ","), 64)
			if err != nil || duration <= 0 || math.IsNaN(duration) || math.IsInf(duration, 0) {
				return 0, fmt.Errorf("invalid segment duration")
			}
		} else if line != "" && !strings.HasPrefix(line, "#") {
			if duration <= 0 || filepath.Base(line) != line {
				return 0, fmt.Errorf("invalid segment reference")
			}
			info, err := os.Stat(filepath.Join(dir, line))
			if err != nil {
				return 0, err
			}
			rate := int64(math.Ceil(float64(info.Size()) * 8 / duration))
			if rate > peak {
				peak = rate
			}
			duration = 0
		}
	}
	if peak <= 0 {
		return 0, fmt.Errorf("no measured segments")
	}
	return peak, nil
}
