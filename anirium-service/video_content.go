package main

import (
	"context"
	"fmt"
	"time"
)

const videoSignatureFrameBytes = 16 * 16 * 3

var videoSignatureSlots = make(chan struct{}, 2)

// A bounded decoded-video signature, independent of compressed bytes and
// resolution. This checks one aligned segment, not whole-release equivalence.
func videoContentSignature(parent context.Context, path string) ([]byte, error) {
	if err := parent.Err(); err != nil {
		return nil, err
	}
	select {
	case videoSignatureSlots <- struct{}{}:
	case <-parent.Done():
		return nil, parent.Err()
	}
	defer func() { <-videoSignatureSlots }()
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	data, err := mediaCommandContext(ctx, mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-threads", "1", "-filter_threads", "1",
		"-i", path, "-map", "0:v:0", "-an", "-t", "6", "-vf", "fps=2,scale=16:16", "-pix_fmt", "rgb24", "-threads", "1", "-f", "rawvideo", "-").Output()
	if err != nil {
		return nil, err
	}
	if len(data) < videoSignatureFrameBytes || len(data) > 12*videoSignatureFrameBytes || len(data)%videoSignatureFrameBytes != 0 {
		return nil, fmt.Errorf("invalid video content signature")
	}
	return data, nil
}

func matchingVideoContent(a, b []byte) bool {
	if len(a) == 0 || len(a) != len(b) {
		return false
	}
	// Require every sampled frame to match, so an opening/recap difference
	// cannot disappear into an episode-wide average. Encoding noise is allowed.
	for start := 0; start < len(a); start += videoSignatureFrameBytes {
		if start+videoSignatureFrameBytes > len(a) {
			return false
		}
		difference := 0
		for index := start; index < start+videoSignatureFrameBytes; index++ {
			delta := int(a[index]) - int(b[index])
			if delta < 0 {
				delta = -delta
			}
			difference += delta
		}
		if difference > videoSignatureFrameBytes*12 {
			return false
		}
	}
	return true
}
