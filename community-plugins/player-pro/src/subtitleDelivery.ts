// A 202 describes one ongoing Service job, never a partial subtitle body.
export async function fetchPreparedSubtitle(url: string, signal: AbortSignal): Promise<Response> {
  for (;;) {
    signal.throwIfAborted();
    const response = await fetch(url, { signal });
    if (response.status !== 202) return response;
    const delay = Number(response.headers.get('Retry-After'));
    const seconds = Number.isFinite(delay) && delay >= 1 && delay <= 10 ? delay : 2;
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, seconds * 1000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
}
