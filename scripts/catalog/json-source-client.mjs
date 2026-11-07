import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { sourceHttpError } from "./source-http-error.mjs";

export function createJsonSourceClient(origin, { cooldownFile, minimumIntervalMs = 1100, request = fetch, now = Date.now,
  pause = delay => new Promise(resolve => setTimeout(resolve, delay)) } = {}) {
  let nextAt = 0;
  return async url => {
    const target = new URL(url);
    if (target.origin !== origin || target.protocol !== "https:" || target.username || target.password) throw new Error("Untrusted source URL");
    const stored = cooldownFile && readJson(cooldownFile);
    if (stored?.retryAt > now()) throw Object.assign(new Error("Source temporarily paused"), stored);
    await pause(Math.max(0, nextAt - now()));
    nextAt = now() + minimumIntervalMs;
    const response = await request(target, { signal: AbortSignal.timeout(25000), redirect: "manual", headers: { Accept: "application/json" } });
    if (!response.ok) {
      const error = sourceHttpError(response, "Catalog source", now());
      if (cooldownFile && (error.retryAt || [429, 503].includes(error.status))) writeJson(cooldownFile, { status: error.status, retryAt: Math.max(error.retryAt || 0, now() + 900000) });
      throw error;
    }
    return response.json();
  };
}
