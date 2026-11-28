export type BundleCue = { start: number; end: number; text: string };
export type BundlePart = { start: number; end: number; cues: BundleCue[]; failed?: boolean };
export type BundleTrack = { id: string; language: string; title?: string; status: string; alignment: string; complete: boolean; embedded: boolean; parts: BundlePart[] };
export type SubtitleBundleState = { epoch: number; revision: number; source: string; tracks: Record<string, BundleTrack>; history: Record<string, Record<string, BundleTrack>> };
export const emptySubtitleBundle = (): SubtitleBundleState => ({ epoch: 0, revision: 0, source: '', tracks: {}, history: {} });

// Delivery is independent of selection. Replace intervals atomically and merge
// deltas by their owned episode range, never by the last dialogue timestamp.
export function mergeSubtitleBundle(previous: SubtitleBundleState, input: any): SubtitleBundleState {
  if (input?.version !== 1 || !Number.isSafeInteger(input.epoch) || input.epoch < 0 || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.source !== 'string' || !Array.isArray(input.tracks) || input.tracks.length > 256) throw new Error('Resposta de legendas inválida.');
  if (input.epoch === previous.epoch && input.revision < previous.revision) throw new Error('Revisão de legendas inválida.');
  const reset = input.reset || input.epoch !== previous.epoch;
  const history = { ...previous.history };
  if (reset && previous.source && previous.source !== input.source) {
    delete history[previous.source];
    history[previous.source] = Object.fromEntries(Object.entries(previous.tracks).filter(([, track]) => track.embedded));
    for (const source of Object.keys(history).slice(0, -2)) delete history[source];
  }
  const tracks = { ...(reset ? {} : previous.tracks) };
  for (const track of input.tracks) {
    if (!track || typeof track.id !== 'string' || !track.id || typeof track.language !== 'string' || !['preparing', 'ready', 'failed'].includes(track.status) || typeof track.complete !== 'boolean' || typeof track.embedded !== 'boolean' || !Array.isArray(track.parts)) throw new Error('Faixa de legenda inválida.');
    const parts = new Map((tracks[track.id]?.parts || []).map(part => [part.start, part]));
    for (const part of track.parts) {
      if (!Number.isFinite(part.start) || !Number.isFinite(part.end) || part.start < 0 || part.end <= part.start || part.end > 86400 || !Array.isArray(part.cues) || part.cues.length > 100000) throw new Error('Intervalo de legenda inválido.');
      const cues = part.cues.map((cue: BundleCue) => {
        if (!Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < part.start || cue.end > part.end + 0.001 || cue.end <= cue.start || typeof cue.text !== 'string') throw new Error('Fala de legenda inválida.');
        return { ...cue, text: cue.text.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim() };
      });
      parts.set(part.start, { ...part, cues });
    }
    tracks[track.id] = { ...track, parts: [...parts.values()].sort((a, b) => a.start - b.start) };
  }
  if (Object.keys(tracks).length > 256) throw new Error('Limite de faixas excedido.');
  return { epoch: input.epoch, revision: input.revision, source: input.source, tracks, history };
}

export function subtitleTracksForSource(state: SubtitleBundleState, source: string): Record<string, BundleTrack> {
  if (!source || source === state.source) return state.tracks;
  return { ...(state.history[source] || {}), ...Object.fromEntries(Object.entries(state.tracks).filter(([, track]) => !track.embedded)) };
}

export function selectBundledSubtitle(state: SubtitleBundleState, id: string, position: number, source: string) {
  const track = subtitleTracksForSource(state, source)[id];
  if (!track) return { cues: [] as BundleCue[], status: 'loading', coverageEnd: 0, unverified: false };
  const part = track.parts.find(part => position >= part.start && position < part.end);
  const failed = part?.failed || (!part && track.status === 'failed');
  return { cues: track.parts.filter(part => !part.failed).flatMap(part => part.cues),
    status: failed ? 'failed' : part ? 'ready' : 'loading', coverageEnd: part && !part.failed ? part.end : 0,
    unverified: track.alignment !== 'verified' };
}

export function bundledSubtitleAhead(state: SubtitleBundleState, position: number, source: string): number {
  if (state.source !== source && !state.history[source]) return 0;
  let ahead = 86400 - position;
  for (const track of Object.values(subtitleTracksForSource(state, source))) {
    if (!track.embedded) continue;
    let end = position;
    for (const part of track.parts) {
      if (part.end <= end) continue;
      if (part.start > end) break;
      end = part.end;
    }
    ahead = Math.min(ahead, end - position);
  }
  return ahead;
}
