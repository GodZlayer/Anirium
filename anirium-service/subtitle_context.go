package main

import "context"

// A subtitle request belongs to both the HTTP request and its playback generation.
func subtitleRequestContext(request, playback context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(request)
	if playback == nil {
		cancel()
		return ctx, cancel
	}
	stop := context.AfterFunc(playback, cancel)
	if playback.Err() != nil {
		cancel()
	}
	return ctx, func() { stop(); cancel() }
}
