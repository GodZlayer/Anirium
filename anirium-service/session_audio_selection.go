package main

// Prefer the desired language embedded in the selected video source. Another
// source is used only when that source lacks the requested role/language, or
// its producer fails and the compatible fallback pool takes over.
func preferVideoSourceAudio(selected, inventory []AudioCandidate, source string) []AudioCandidate {
	result := append([]AudioCandidate(nil), selected...)
	for index, choice := range result {
		var embedded []AudioCandidate
		for _, candidate := range inventory {
			if candidate.Source == source && candidate.Language == choice.Language && candidate.Commentary == choice.Commentary {
				embedded = append(embedded, candidate)
			}
		}
		best := selectConnectionAudioCandidates(embedded, AudioPolicy{})
		if len(best) > 0 {
			result[index] = best[0]
		}
	}
	return result
}
