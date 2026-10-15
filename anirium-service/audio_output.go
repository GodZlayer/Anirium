package main

type audioOutputConfig struct {
	BitRate    int64
	SampleRate int64
	Channels   int
}

func audioOutputFor(candidate AudioCandidate, policy AudioPolicy) audioOutputConfig {
	channels := candidate.Channels
	if channels <= 0 {
		channels = 2
	}
	if channels > 8 {
		channels = 8
	}
	if policy.MaxChannels > 0 && channels > policy.MaxChannels {
		channels = policy.MaxChannels
	}
	// Browser-compatible AAC output. Keep the selected layout rather than
	// producing incompatible channel layouts from alternative pool members.
	bitrate := int64(channels) * 160000
	if !losslessAudio(candidate.Codec) && candidate.BitRate > 0 && candidate.BitRate < bitrate {
		bitrate = candidate.BitRate
	}
	if bitrate < 32000 {
		bitrate = 32000
	}
	// Never silently override a measured connection budget with a quality floor.
	if policy.MaxBitRate > 0 && policy.MaxBitRate < bitrate {
		bitrate = policy.MaxBitRate
	}
	rate := candidate.SampleRate
	if rate <= 0 || rate > 48000 {
		rate = 48000
	}
	if policy.MaxSampleRate > 0 && rate > policy.MaxSampleRate {
		rate = policy.MaxSampleRate
	}
	// AAC accepts discrete sampling frequencies, not arbitrary probe values.
	for _, supported := range []int64{48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350} {
		if supported <= rate {
			rate = supported
			break
		}
	}
	if rate < 7350 {
		rate = 7350
	}
	return audioOutputConfig{BitRate: bitrate, SampleRate: rate, Channels: channels}
}
