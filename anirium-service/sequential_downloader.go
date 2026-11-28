package main

import (
	"context"
	"sync"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/types"
)

var (
	seqPumpMu       sync.Mutex
	seqRegistered   = map[string]*torrent.File{}
	activeSeqKey    string
	activeSeqFile   *torrent.File
	activeSeqCancel context.CancelFunc
)

func registerSequentialFile(source string, file *torrent.File) {
	if source == "" || file == nil {
		return
	}
	seqPumpMu.Lock()
	seqRegistered[source] = file
	seqPumpMu.Unlock()
}

func stopAllSequentialDownloads() {
	seqPumpMu.Lock()
	if activeSeqCancel != nil {
		activeSeqCancel()
		activeSeqCancel = nil
	}
	activeSeqKey = ""
	activeSeqFile = nil
	for _, f := range seqRegistered {
		if f != nil {
			clearFilePriorities(f)
		}
	}
	seqRegistered = map[string]*torrent.File{}
	seqPumpMu.Unlock()
}

func clearFilePriorities(file *torrent.File) {
	if file == nil {
		return
	}
	tor := file.Torrent()
	if tor == nil || tor.Info() == nil {
		return
	}
	begin := file.BeginPieceIndex()
	end := file.EndPieceIndex()
	// Keep header (first 2 pieces) and tail (last piece) untouched so ffprobe
	// can still finish inspecting audio/subtitle tracks on secondary torrents
	// without downloading the video body.
	for i := begin + 2; i < end-1; i++ {
		if !tor.Piece(i).State().Complete {
			tor.Piece(i).SetPriority(types.PiecePriorityNone)
		}
	}
}

// applySequentialWindow prioritizes pieces of file strictly in sequential order
// starting from the first incomplete piece, while keeping header and tail pieces
// high-priority for instant probing and seeking.
func applySequentialWindow(file *torrent.File) (done bool) {
	if file == nil {
		return true
	}
	tor := file.Torrent()
	if tor == nil || tor.Info() == nil {
		return false
	}
	begin := file.BeginPieceIndex()
	end := file.EndPieceIndex()
	if end <= begin {
		return true
	}

	// Keep container header (first 2 pieces) and tail (last piece for MKV Cues)
	// prioritized so ffprobe and seeking never stall.
	for i := begin; i < begin+2 && i < end; i++ {
		if !tor.Piece(i).State().Complete {
			tor.Piece(i).SetPriority(types.PiecePriorityHigh)
		}
	}
	if end-1 >= begin && !tor.Piece(end-1).State().Complete {
		tor.Piece(end-1).SetPriority(types.PiecePriorityHigh)
	}

	// Find first incomplete piece in the file.
	firstIncomplete := -1
	for i := begin; i < end; i++ {
		if !tor.Piece(i).State().Complete {
			firstIncomplete = i
			break
		}
	}
	if firstIncomplete == -1 {
		return true
	}

	const (
		nowSpan       = 4
		readaheadSpan = 16
		nextSpan      = 40
	)
	for i := firstIncomplete; i < end; i++ {
		if i == end-1 || i < begin+2 {
			continue
		}
		if tor.Piece(i).State().Complete {
			continue
		}
		offset := i - firstIncomplete
		switch {
		case offset < nowSpan:
			tor.Piece(i).SetPriority(types.PiecePriorityNow)
		case offset < readaheadSpan:
			tor.Piece(i).SetPriority(types.PiecePriorityReadahead)
		case offset < nextSpan:
			tor.Piece(i).SetPriority(types.PiecePriorityNext)
		default:
			// Never downgrade pieces beyond nextSpan to PiecePriorityNone:
			// active ffmpeg/seek readers may have prioritized pieces near the
			// current seek position (e.g. 510s), and resetting them kills the seek.
		}
	}
	return false
}

// activateSequentialSource ensures ONLY the active playback source downloads
// sequentially, immediately pausing piece downloads on any previously probed
// or inactive source so 100% of bandwidth goes to the active player stream.
func activateSequentialSource(parent context.Context, source string) {
	if source == "" {
		return
	}
	seqPumpMu.Lock()
	file := seqRegistered[source]
	if file == nil {
		seqPumpMu.Unlock()
		return
	}
	if activeSeqKey == source && activeSeqCancel != nil {
		seqPumpMu.Unlock()
		return
	}
	if activeSeqCancel != nil {
		activeSeqCancel()
		activeSeqCancel = nil
	}
	// Pause every other registered source so only the active source downloads.
	for k, other := range seqRegistered {
		if k != source && other != nil && other != file {
			clearFilePriorities(other)
		}
	}
	ctx, cancel := context.WithCancel(parent)
	activeSeqKey = source
	activeSeqFile = file
	activeSeqCancel = cancel
	seqPumpMu.Unlock()

	go func() {
		defer func() {
			seqPumpMu.Lock()
			if activeSeqKey == source {
				activeSeqCancel = nil
			}
			seqPumpMu.Unlock()
		}()
		if applySequentialWindow(file) {
			return
		}
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if applySequentialWindow(file) {
					return
				}
			}
		}
	}()
}
