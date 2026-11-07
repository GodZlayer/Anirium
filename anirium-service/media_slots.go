package main

import "context"

// Separate queues reserve capacity for audio while all actual video qualities
// remain available. Cancellation removes queued work without launching FFmpeg.
var videoTranscodeSlots = make(chan struct{}, 4)
var audioTranscodeSlots = make(chan struct{}, 2)

// Decoder options precede the input; encoder options precede the output.
// Keep both explicit: limiting only one side leaves automatic thread pools.
func boundedTranscodeArgs(args []string, threads string) []string {
	bounded := append([]string{"-threads", threads, "-filter_threads", "1"}, args[:len(args)-1]...)
	return append(bounded, "-threads", threads, args[len(args)-1])
}

func acquireMediaSlot(ctx context.Context, slots chan struct{}) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	select {
	case slots <- struct{}{}:
		if err := ctx.Err(); err != nil {
			<-slots
			return nil, err
		}
		return func() { <-slots }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
