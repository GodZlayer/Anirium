const episodeEpoch = Date.UTC(2000, 0, 1);

// The Service publishes this fixed epoch as episode time at each HLS window.
// Hls.js resolves it against the currently decoded fragment, including its
// timestamp adjustments across discontinuities.
export function episodeTimeFromProgramDate(date: Date | null): number | null {
  if (!date) return null;
  const position = (date.getTime() - episodeEpoch) / 1000;
  return Number.isFinite(position) && position >= 0 && position <= 86400 ? position : null;
}
