// Stream fragments commonly start at a small positive timestamp (one fMP4
// frame is 0.083334s) while the decoder sits at 0. That initial offset is
// contiguous media, not a gap; a genuinely future range still is not.
const START_TOLERANCE_SECONDS = 0.5;

// Only media contiguous with the decoder position can prevent a stall.
export function bufferedAhead(ranges: Pick<TimeRanges, "length" | "start" | "end">, position: number): number {
  if (!Number.isFinite(position) || position < 0) return 0;
  for (let index = 0; index < ranges.length; index++) {
    const start = ranges.start(index);
    const end = ranges.end(index);
    if (Number.isFinite(start) && Number.isFinite(end) && start - position <= START_TOLERANCE_SECONDS && position < end) {
      return end - position;
    }
  }
  return 0;
}
