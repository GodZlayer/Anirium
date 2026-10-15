package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func writeMixedPlaylist(ctx context.Context, dir string, sources [][]hlsSegment) error {
	candidates := make([][]hlsSegment, len(sources))
	count := 0
	for index, source := range sources {
		candidates[index] = append([]hlsSegment(nil), source...)
		if len(source) > count {
			count = len(source)
		}
	}
	if count == 0 {
		return fmt.Errorf("no media segments")
	}
	var body strings.Builder
	targetDuration := 1
	for position := 0; position < count; position++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		best, found := chooseBestSegment(candidates, position)
		if !found {
			return fmt.Errorf("missing segment at position %d", position)
		}
		reference, _ := strconv.ParseFloat(best.duration, 64)
		name := fmt.Sprintf("segment-%06d.ts", position)
		for {
			duration, _ := strconv.ParseFloat(best.duration, 64)
			if math.Abs(duration-reference) <= 0.05 {
				if err := copyFile(best.path, filepath.Join(dir, name)); err == nil {
					if target := int(math.Ceil(duration)); target > targetDuration {
						targetDuration = target
					}
					fmt.Fprintf(&body, "#EXTINF:%s,\n%s\n", best.duration, name)
					break
				}
			}
			for index := range candidates {
				if position < len(candidates[index]) && candidates[index][position].path == best.path {
					candidates[index][position].size = 0
				}
			}
			best, found = chooseBestSegment(candidates, position)
			if !found {
				return fmt.Errorf("no readable compatible source for segment %d", position)
			}
		}
	}
	playlist := fmt.Sprintf("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:%d\n#EXT-X-MEDIA-SEQUENCE:0\n%s#EXT-X-ENDLIST\n", targetDuration, body.String())
	temporary := filepath.Join(dir, "index.m3u8.pending")
	if err := os.WriteFile(temporary, []byte(playlist), 0600); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return os.Rename(temporary, filepath.Join(dir, "index.m3u8"))
}
