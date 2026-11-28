export type TimedSubtitleCue = {
  start: number;
  end: number;
  text: string;
};

const MIN_BASE_DURATION_SECONDS = 0.85;
const MIN_ABSOLUTE_DURATION_SECONDS = 1.2;
const READING_SPEED_CPS = 17;
const MAX_SAFE_DURATION_SECONDS = 6.5;
const MAX_EXTRA_EXTENSION_SECONDS = 2.5;

export function calculateSafeCueDuration(text: string): number {
  const visibleChars = text.replace(/\s+/g, ' ').trim().length;
  if (visibleChars === 0) return 0;

  const readingDuration = MIN_BASE_DURATION_SECONDS + visibleChars / READING_SPEED_CPS;
  return Math.min(
    MAX_SAFE_DURATION_SECONDS,
    Math.max(MIN_ABSOLUTE_DURATION_SECONDS, readingDuration),
  );
}

/**
 * Extends overly short subtitle cues based on character count so they remain
 * readable, while guaranteeing:
 * 1. Finite bounded duration (never infinite).
 * 2. Never overlaps or merges with a subsequent cue that was not already
 *    overlapping in the original subtitle track.
 * 3. Preserves original simultaneous/overlapping cues from the subtitle itself.
 */
export function applySafeCueDurations<T extends TimedSubtitleCue>(cues: T[]): T[] {
  if (cues.length === 0) return cues;

  const sorted = cues
    .map((cue, index) => ({ cue, index }))
    .sort((a, b) => a.cue.start - b.cue.start || a.cue.end - b.cue.end || a.index - b.index);

  const adjusted = new Array<T>(cues.length);

  for (let i = 0; i < sorted.length; i++) {
    const { cue, index } = sorted[i];
    if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) {
      adjusted[index] = cue;
      continue;
    }

    const safeDuration = calculateSafeCueDuration(cue.text);
    const currentDuration = cue.end - cue.start;

    if (safeDuration <= currentDuration) {
      adjusted[index] = cue;
      continue;
    }

    let desiredEnd = Math.min(
      cue.start + safeDuration,
      cue.end + MAX_EXTRA_EXTENSION_SECONDS,
    );

    // Clamp to the first subsequent cue that did not originally overlap this cue.
    for (let j = i + 1; j < sorted.length; j++) {
      const nextStart = sorted[j].cue.start;
      if (nextStart >= cue.end) {
        if (desiredEnd > nextStart) {
          desiredEnd = nextStart;
        }
        break;
      }
    }

    adjusted[index] = desiredEnd > cue.end ? { ...cue, end: desiredEnd } : cue;
  }

  return adjusted;
}
