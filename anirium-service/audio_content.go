package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"time"
)

func audioContentSignature(parent context.Context, path string) ([]byte, error) {
	release, err := acquireMediaSlot(parent, videoSignatureSlots)
	if err != nil {
		return nil, err
	}
	defer release()
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	data, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-threads", "1", "-filter_threads", "1", "-i", path, "-map", "0:a:0", "-vn", "-t", "6", "-ac", "1", "-ar", "8000", "-f", "s16le", "-").Output()
	if err != nil {
		return nil, err
	}
	if len(data) < 1600 || len(data) > 96000 || len(data)%2 != 0 {
		return nil, fmt.Errorf("invalid audio signature")
	}
	return data, nil
}

// Compare each 100 ms window, normalized for mastering gain. This is a
// conservative content gate, not an offset estimator or full edit alignment.
func matchingAudioContent(a, b []byte) bool {
	if len(a) != len(b) || len(a) < 1600 || len(a)%2 != 0 {
		return false
	}
	for start := 0; start < len(a); start += 1600 {
		end := min(start+1600, len(a))
		var aa, bb, ab, sumA, sumB float64
		for index := start; index < end; index += 2 {
			x := float64(int16(binary.LittleEndian.Uint16(a[index:])))
			y := float64(int16(binary.LittleEndian.Uint16(b[index:])))
			aa += x * x
			bb += y * y
			ab += x * y
			sumA += x
			sumB += y
		}
		samples := float64((end - start) / 2)
		if aa < samples*25 && bb < samples*25 {
			continue
		}
		// DC/mastering bias is not shared content. Without mean removal a
		// strong constant offset can hide completely unrelated waveforms.
		varianceA := max(0, aa-sumA*sumA/samples)
		varianceB := max(0, bb-sumB*sumB/samples)
		covariance := ab - sumA*sumB/samples
		if varianceA == 0 && varianceB == 0 {
			// Preserve literal constant-window compatibility without allowing
			// opposite-polarity or different constants to certify a transition.
			if math.Abs(sumA/samples-sumB/samples) > 5 {
				return false
			}
			continue
		}
		if varianceA == 0 || varianceB == 0 || covariance/math.Sqrt(varianceA*varianceB) < 0.9 {
			return false
		}
	}
	return true
}
