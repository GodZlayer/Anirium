package main

import (
	"context"
	"fmt"
	"sync"
)

// Protected by swarmMu. Old workers may finish disk work but cannot publish
// tracks or variants into a newer playback's manifest.
var playbackGeneration uint64
var preparePlaybackMu sync.Mutex

// Protected by preparePlaybackMu. Once shutdown starts, queued preparations
// must not reopen workers against a closed torrent client.
var playbackShuttingDown bool
var playbackContext = context.Background()
var cancelPlayback context.CancelFunc
var continuousPlaybackContext context.Context // protected by swarmMu
var continuousPlaybackParent context.Context
var cancelContinuousPlayback context.CancelFunc
var playbackInputs *mediaInputCache
var playbackWorkers = &sync.WaitGroup{}
var playbackMagnets []string // original ownership, unaffected by source filtering

type retiringPlayback struct {
	workers *sync.WaitGroup
	inputs  *mediaInputCache
	magnets []string
}

var retiringPlaybacks = map[uint64]*retiringPlayback{}

func (job *retiringPlayback) wait() {
	if job.workers != nil {
		job.workers.Wait()
	}
	if job.inputs != nil && job.inputs.waitRetired != nil {
		job.inputs.waitRetired()
	}
}

// Never wait while holding swarmMu: canceled workers may need it to exit.
func stopPlaybackWorkers() {
	swarmMu.RLock()
	cancel := cancelPlayback
	jobs := []*retiringPlayback{{workers: playbackWorkers, inputs: playbackInputs}}
	for _, job := range retiringPlaybacks {
		jobs = append(jobs, job)
	}
	swarmMu.RUnlock()
	if cancel != nil {
		cancel()
	}
	for _, job := range jobs {
		job.wait()
	}
}

func playbackVariantID(generation uint64, quality string) string {
	return fmt.Sprintf("playback-%d-%s", generation, quality)
}

// Caller holds swarmMu exclusively; lock order is swarmMu then variantMu.
func resetPlaybackLocked() uint64 {
	cancelPlaybackWindowLocked()
	if cancelPlayback != nil {
		cancelPlayback()
		id := playbackGeneration
		job := &retiringPlayback{workers: playbackWorkers, inputs: playbackInputs, magnets: append([]string(nil), playbackMagnets...)}
		retiringPlaybacks[id] = job
		go func() {
			job.wait()
			swarmMu.Lock()
			if retiringPlaybacks[id] == job {
				delete(retiringPlaybacks, id)
				retained := requiredCurrentPlaybackMagnetsLocked()
				for _, other := range retiringPlaybacks {
					retained = append(retained, other.magnets...)
				}
				// Serialize dropping against guarded torrent opening and reset.
				dropPlaybackTorrents(torrentClient, unretainedMagnets(job.magnets, retained))
			}
			swarmMu.Unlock()
		}()
	}
	playbackContext, cancelPlayback = context.WithCancel(context.Background())
	playbackContext = context.WithValue(playbackContext, episodeContextKey{}, requestedEpisode)
	continuousPlaybackContext, cancelContinuousPlayback = context.WithCancel(playbackContext)
	continuousPlaybackParent = playbackContext
	playbackInputs = newProgressiveMediaInputCache(playbackContext)
	playbackWorkers = &sync.WaitGroup{}
	playbackGeneration++
	sessionPreparationStarted = false
	currentPlaybackSession = playbackSessionState{Generation: playbackGeneration, BufferSeconds: 30}
	requestedVariants = map[string]bool{}
	playbackDiscoveryComplete = false
	observedTransferCapacity = transferCapacity{}
	activeLinks = nil
	playbackMagnets = nil
	probedStreams = map[string][]ffprobeStream{}
	probedFormats = map[string]ffprobeOutput{}
	probedSidecars = map[string][]string{}
	selectedAudioCandidates = nil
	selectedAudioPolicy = AudioPolicy{}
	audioSelectionFrozen = false
	externalSubtitles = nil
	mediaSourceMu.Lock()
	mediaSources = map[string]mediaSource{}
	mediaSourceMu.Unlock()
	variantMu.Lock()
	variantRuntimes = map[string]*variantRuntime{}
	variantMu.Unlock()
	grantMu.Lock()
	grants = map[string]playbackGrant{}
	grantMu.Unlock()
	return playbackGeneration
}

// Caller holds swarmMu. Continuous encoders are background work once explicit
// window demand exists. Cancellation releases their encoder slots, but does not
// revoke the session, shared torrent inputs or immutable prefixes already served.
func stopContinuousPlaybackLocked() {
	if cancelContinuousPlayback != nil && continuousPlaybackParent == playbackContext {
		cancelContinuousPlayback()
	}
}

func continuousContextLocked() context.Context {
	if continuousPlaybackContext != nil && continuousPlaybackParent == playbackContext {
		return continuousPlaybackContext
	}
	return playbackContext
}
