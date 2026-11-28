export type PlaybackBufferState = {
  position?: number;
  endOfEpisode?: boolean;
  subtitleUnverified?: boolean;
  coverage: { videoAhead: number; audioAhead: number; subtitleAhead: number; audioRequired: boolean; subtitleRequired: boolean };
  buffer: { targetSeconds: number; commonAhead: number; ready: boolean; continueSeconds?: number; continueReady?: boolean };
  playlistUrl: string;
};

export function parsePlaybackBuffer(value: unknown): PlaybackBufferState {
  const state = value as PlaybackBufferState;
  const coverage = state?.coverage;
  const buffer = state?.buffer;
  if (state?.subtitleUnverified !== undefined && typeof state.subtitleUnverified !== 'boolean') throw new Error('Alinhamento de legenda inválido.');
  if ((state?.position !== undefined && (!Number.isFinite(state.position) || state.position < 0 || state.position > 86400)) || (state?.endOfEpisode !== undefined && typeof state.endOfEpisode !== 'boolean')) throw new Error('Posição de buffer inválida.');
  if (!coverage || !buffer || ![coverage.videoAhead, coverage.audioAhead, coverage.subtitleAhead, buffer.targetSeconds, buffer.commonAhead].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 86400) || typeof coverage.audioRequired !== 'boolean' || typeof coverage.subtitleRequired !== 'boolean' || typeof buffer.ready !== 'boolean' || buffer.targetSeconds > 60 || !/^\/hls\/window-\d+-\d+-video\/continuous-master\.m3u8$/.test(state.playlistUrl)) {
    throw new Error('Estado de buffer inválido entregue pelo Service.');
  }
  const common = Math.min(coverage.videoAhead, coverage.audioRequired ? coverage.audioAhead : Infinity, coverage.subtitleRequired ? coverage.subtitleAhead : Infinity);
  if (Math.abs(common - buffer.commonAhead) > 0.001 || buffer.ready !== (common >= buffer.targetSeconds)) throw new Error('Cobertura de buffer inconsistente.');
  if (buffer.continueSeconds !== undefined || buffer.continueReady !== undefined) {
    if (!Number.isFinite(buffer.continueSeconds) || buffer.continueSeconds! < 0 || buffer.continueSeconds! > buffer.targetSeconds || typeof buffer.continueReady !== 'boolean' || buffer.continueReady !== (common >= buffer.continueSeconds!)) throw new Error('Cobertura de continuidade inconsistente.');
  }
  return state;
}

// Service readiness is not browser readiness. Silence counts when its subtitle
// interval is loaded; cue presence is intentionally not part of this gate.
export function canStartBufferedPlayback(state: PlaybackBufferState, browserAhead: number, subtitleBufferedAhead: number, position?: number, playing = false): boolean {
  // A completed episode cannot replenish its tail. Account for media already
  // consumed since the Service snapshot instead of pausing until the next poll.
  const consumed = state.endOfEpisode === true && Number.isFinite(state.position) && Number.isFinite(position) ? Math.max(0, position! - state.position!) : 0;
  const continuing = playing && state.buffer.continueSeconds !== undefined && state.buffer.continueReady !== undefined;
  const target = Math.max(0, (continuing ? state.buffer.continueSeconds! : state.buffer.targetSeconds) - consumed);
  const prepared = continuing ? state.buffer.continueReady : state.buffer.ready;
  return prepared === true && Number.isFinite(browserAhead) && browserAhead >= target && (!state.coverage.subtitleRequired || (Number.isFinite(subtitleBufferedAhead) && subtitleBufferedAhead >= target));
}

export async function requestPlaybackBuffer(endpoint: string, ticket: string, selection: { position: number; audio: string; subtitle: string; timeline?: string; playing?: boolean }, signal: AbortSignal): Promise<PlaybackBufferState> {
  if (!ticket || !Number.isFinite(selection.position) || selection.position < 0 || selection.position > 86400) throw new Error('Seleção de buffer inválida.');
  const query = new URLSearchParams({ playbackTicket: ticket });
  const response = await fetch(`${endpoint}/playback/session?${query}`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'progress', position: selection.position, audio: selection.audio, subtitle: selection.subtitle, timeline: selection.timeline || '', playing: selection.playing === true }) });
  if (!response.ok) throw new Error(response.status === 401 ? 'Sessão expirada.' : 'Não foi possível preparar o buffer.');
  return parsePlaybackBuffer((await response.json()).bufferState);
}
