import { useEffect, useRef, useState } from 'react';
import { emptySubtitleBundle, mergeSubtitleBundle, type SubtitleBundleState } from './subtitleBundle';

export function useSubtitleBundle(options: { enabled: boolean; endpoint: string; ticket: string }) {
  const [state, setState] = useState<SubtitleBundleState>(emptySubtitleBundle);
  const [error, setError] = useState('');
  const owner = useRef('');
  const key = `${options.endpoint}:${options.ticket}`;
  useEffect(() => {
    const controller = new AbortController();
    let snapshot = emptySubtitleBundle();
    let timer: ReturnType<typeof setTimeout> | undefined;
    owner.current = key; setState(snapshot); setError('');
    if (!options.enabled || !options.ticket) return () => controller.abort();
    const poll = async () => {
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener('abort', abort, { once: true });
      const deadline = setTimeout(abort, 10000);
      try {
        const query = new URLSearchParams({ playbackTicket: options.ticket, epoch: String(snapshot.epoch), since: String(snapshot.revision) });
        const response = await fetch(`${options.endpoint}/playback/subtitles?${query}`, { signal: request.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Não foi possível atualizar as legendas do Service.');
        const text = await response.text();
        if (text.length > 64 * 1024 * 1024) throw new Error('Limite de legendas excedido.');
        const next = mergeSubtitleBundle(snapshot, JSON.parse(text));
        if (!controller.signal.aborted && (next.revision !== snapshot.revision || next.epoch !== snapshot.epoch)) console.info('[PlayerPro][Legendas] Lote atualizado', JSON.stringify({ epoch: next.epoch, revision: next.revision, tracks: Object.keys(next.tracks).length, ready: Object.values(next.tracks).filter(track => track.status === 'ready').length, failed: Object.values(next.tracks).filter(track => track.status === 'failed').length }));
        if (!controller.signal.aborted) { snapshot = next; setState(next); setError(''); }
      } catch (failure) {
        if (!controller.signal.aborted) { snapshot = emptySubtitleBundle(); setState(snapshot); setError(failure instanceof Error ? failure.message : 'Legendas indisponíveis.'); }
      } finally {
        clearTimeout(deadline); controller.signal.removeEventListener('abort', abort);
        if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [options.enabled, options.endpoint, options.ticket]);
  return { state: owner.current === key && options.enabled ? state : emptySubtitleBundle(), error };
}
