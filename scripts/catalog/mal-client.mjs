const ORIGIN = "https://api.myanimelist.net";
import { sourceHttpError } from "./source-http-error.mjs";
import { createHash } from "node:crypto";
import { readJson, writeJson } from "./mal-detail-cache.mjs";

export function createMalClient(clientId, { request = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), cooldownFile, now = Date.now } = {}) {
  if (!clientId) throw new Error("MAL_CLIENT_ID is required for official catalog discovery");
  const credential = createHash("sha256").update(clientId).digest("hex");
  const persist = error => {
    if (cooldownFile && (error.retryAt || [401, 403, 429, 503].includes(error.status))) writeJson(cooldownFile, {
      credential, status: error.status, retryAt: Math.max(error.retryAt || 0, now() + ([401, 403].includes(error.status) ? 86400000 : 900000)),
    });
    return error;
  };
  return async function read(url) {
    const target = new URL(url);
    if (target.origin !== ORIGIN || target.username || target.password) throw new Error("Untrusted MAL API URL");
    const cooldown = cooldownFile && readJson(cooldownFile);
    if (cooldown?.credential === credential && cooldown.retryAt > now()) {
      const error = new Error("MAL source temporarily paused");
      throw Object.assign(error, { status: cooldown.status, retryAt: cooldown.retryAt });
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      await pause(attempt ? 2000 * 2 ** attempt : 1100);
      let response;
      try {
        response = await request(target, {
          headers: { "X-MAL-CLIENT-ID": clientId, Accept: "application/json" },
          signal: AbortSignal.timeout(25000), redirect: "manual",
        });
      } catch (error) {
        if (attempt === 3) throw error;
        continue;
      }
      if (response.ok) return response.json();
      const failure = sourceHttpError(response, `Official MAL API at ${target.pathname}`, now());
      if ((response.status === 307 || response.status === 429 || response.status >= 500) && attempt < 3) {
        await response.body?.cancel();
        if (failure.retryAt && failure.retryAt - now() > 30000) throw persist(failure);
        if (failure.retryAt) await pause(Math.max(0, failure.retryAt - now()));
        continue;
      }
      throw persist(failure);
    }
  };
}
