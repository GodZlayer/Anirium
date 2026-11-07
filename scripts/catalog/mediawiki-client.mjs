import path from "node:path";
import { createJsonSourceClient } from "./json-source-client.mjs";
import { sourceFailureKind } from "./source-readiness.mjs";

export function createMediawikiClient({ directory, request = fetch, now = Date.now, timeBudgetMs = 180000, pause = delay => new Promise(resolve => setTimeout(resolve, delay)) }) {
  let nextAt = 0, requests = 0, deadline = null, failure = null;
  const clients = new Map(["https://query.wikidata.org", "https://www.wikidata.org", "https://en.wikipedia.org"].map(origin => [origin,
    createJsonSourceClient(origin, { cooldownFile: path.join(directory, "http", new URL(origin).hostname + ".json"), minimumIntervalMs: 0, now, pause,
      request: async (url, options) => {
        const remaining = deadline - now();
        if (remaining <= 0) throw Object.assign(new Error("Wikimedia source time budget exhausted"), { name: "TimeoutError" });
        requests++;
        return request(url, { ...options, signal: AbortSignal.any([options.signal, AbortSignal.timeout(remaining)]), headers: { ...options.headers, "User-Agent": "AniriumCatalog/1.0 (https://anirium.com.br)" } });
      } })]));
  return { requests: () => requests, failure: () => failure, read: async value => {
    const url = new URL(value), client = clients.get(url.origin);
    if (!client) throw new Error("Untrusted Wikimedia origin");
    deadline ??= now() + timeBudgetMs;
    await pause(Math.max(0, nextAt - now())); nextAt = now() + 1500;
    try { return await client(url.href); }
    catch (error) {
      const kind = sourceFailureKind(error);
      if ([401, 403, 429, 500, 502, 503, 504].includes(error.status) || ["timeout", "network-error", "invalid-response"].includes(kind)) failure = { status: error.status || null, kind };
      throw error;
    }
  } };
}
