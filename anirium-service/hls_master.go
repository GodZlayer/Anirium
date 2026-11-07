package main

import (
	"fmt"
	"net/url"
	"strings"
)

func ticketURL(path, ticket string) string {
	return path + "?playbackTicket=" + url.QueryEscape(ticket)
}

func audioPlaybackReady(tracks []AudioTrack) bool {
	if len(tracks) == 0 {
		return true // The probed content can genuinely contain video only.
	}
	for _, track := range tracks {
		if track.Status == "ready" && track.PlaylistURL != "" {
			return true
		}
	}
	return false
}

func audioPreparationStatus(tracks []AudioTrack) string {
	if audioPlaybackReady(tracks) {
		return "ready"
	}
	for _, track := range tracks {
		if track.Status != "stalled" {
			return "preparing"
		}
	}
	return "stalled"
}

func masterPlaylist(videoID string, tracks []AudioTrack, ticket string, measured ...int64) string {
	var out strings.Builder
	out.WriteString("#EXTM3U\n#EXT-X-VERSION:3\n")
	ready := 0
	audioPeak := int64(0)
	for _, track := range tracks {
		if track.Status != "ready" || track.PlaylistURL == "" {
			continue
		}
		language := strings.NewReplacer("\"", "", "\r", "", "\n", "", "\\", "").Replace(track.Language)
		defaultTrack := "NO"
		if ready == 0 {
			defaultTrack = "YES"
		}
		fmt.Fprintf(&out, "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio\",NAME=\"%s\",LANGUAGE=\"%s\",DEFAULT=%s,AUTOSELECT=YES,URI=\"%s\"\n", language, language, defaultTrack, ticketURL(track.PlaylistURL, ticket))
		ready++
		if track.Bandwidth > audioPeak {
			audioPeak = track.Bandwidth
		}
	}
	bandwidth := int64(1)
	if len(measured) > 0 && measured[0] > 0 {
		bandwidth = measured[0]
	}
	fmt.Fprintf(&out, "#EXT-X-STREAM-INF:BANDWIDTH=%d", bandwidth+audioPeak)
	if ready > 0 {
		out.WriteString(",AUDIO=\"audio\"")
	}
	fmt.Fprintf(&out, "\n%s\n", ticketURL("/hls/"+videoID+"/index.m3u8", ticket))
	return out.String()
}
