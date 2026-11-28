"use client";

import { useEffect, useRef, useState } from 'react';
import { requestPlaybackBuffer, type PlaybackBufferState } from './playbackBuffer';

export function usePlaybackBuffer(options: { enabled: boolean; endpoint: string; ticket: string; timeline: string; position: number; playing?: boolean; audio: string; subtitle: string }) {
  const position = useRef(options.position);
  position.current = options.position;
	const playing = useRef(options.playing);
	playing.current = options.playing;
  const [state, setState] = useState<PlaybackBufferState | null>(null);
  const stateSelection = useRef('');
  const selectionKey = JSON.stringify([options.ticket, options.timeline, options.audio, options.subtitle]);
  const [error, setError] = useState('');
  useEffect(() => {
    setState(null);
    stateSelection.current = '';
    setError('');
    if (!options.enabled || !options.ticket) return;
    const lifecycle = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const request = new AbortController();
      const abort = () => request.abort();
      lifecycle.signal.addEventListener('abort', abort, { once: true });
      const deadline = setTimeout(abort, 10000);
      try {
        const next = await requestPlaybackBuffer(options.endpoint, options.ticket, { position: position.current, playing: playing.current, audio: options.audio, subtitle: options.subtitle, timeline: options.timeline }, request.signal);
        if (!lifecycle.signal.aborted) { stateSelection.current = selectionKey; setState(next); setError(''); }
      } catch (failure) {
        if (!lifecycle.signal.aborted) {
          // A stale ready verdict must never survive a failed authorization or
          // unavailable snapshot. No credentials/URLs are printed to console.
          setState(null);
          setError(request.signal.aborted ? 'O Service demorou a responder. Tentando novamente…' : failure instanceof Error ? failure.message : 'Buffer indisponível.');
        }
      } finally {
        clearTimeout(deadline);
        lifecycle.signal.removeEventListener('abort', abort);
        if (!lifecycle.signal.aborted) timer = setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => { lifecycle.abort(); if (timer) clearTimeout(timer); };
  }, [options.enabled, options.endpoint, options.ticket, options.timeline, options.audio, options.subtitle]);
  return { state: options.enabled && stateSelection.current === selectionKey ? state : null, error };
}
