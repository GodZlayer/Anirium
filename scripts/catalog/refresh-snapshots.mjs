import fs from "node:fs";
import path from "node:path";
import { downloadSnapshot } from "./download-snapshot.mjs";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { sourceHttpError } from "./source-http-error.mjs";

export async function refreshSnapshots(directory, { request = fetch, now = Date.now } = {}) {
  const stateFile = path.join(directory, "sources.json"), previous = readJson(stateFile) || {};
  const sources = {};
  for (const source of ["anime", "publications"]) {
    const cached = previous[source], age = now() - Date.parse(cached?.checkedAt);
    if (Date.parse(cached?.retryAt) > now()) { sources[source] = cached; continue; }
    if (cached?.state === "available" && age >= 0 && age < 6 * 3600000 && fs.existsSync(path.join(directory, cached.filename))) {
      sources[source] = cached; continue;
    }
    try {
      let filename, provenance;
      if (source === "anime") {
        const response = await request("https://api.github.com/repos/cedya77/anime-offline-database/releases/latest", { signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw sourceHttpError(response, "GitHub release", now());
        const release = await response.json(), asset = release.assets?.find(item => item.name === "anime-offline-database-minified.json");
        if (!/^[\w.-]+$/.test(release.tag_name) || !/^sha256:[a-f0-9]{64}$/.test(asset?.digest)
          || !asset.browser_download_url?.startsWith("https://github.com/cedya77/anime-offline-database/releases/download/")) throw new Error("Invalid anime release contract");
        filename = `${release.tag_name}-anime-offline-database-minified.json`;
        provenance = await downloadSnapshot({ url: asset.browser_download_url, publishedChecksum: asset.digest.slice(7), algorithm: "sha256", destination: path.join(directory, filename), request });
        if (provenance.bytes !== asset.size) throw new Error("Anime release size mismatch");
        provenance = { ...provenance, tag: release.tag_name, publishedAt: release.published_at, downloadedAt: provenance.importedAt };
        writeJson(path.join(directory, filename + ".source.json"), provenance);
      } else {
        filename = "mangabaka-series.jsonl.tar.gz";
        const url = "https://api.mangabaka.org/v1/database/series.jsonl.tar.gz";
        provenance = await downloadSnapshot({ url, checksumUrl: url + ".sha1", destination: path.join(directory, filename), request });
      }
      sources[source] = { state: "available", filename, checkedAt: new Date(now()).toISOString(), provenance };
    } catch (error) {
      const failures = Math.min((cached?.failures || 0) + 1, 10);
      const delay = [401, 403].includes(error.status) ? 86400000 : Math.min(86400000, 60000 * 2 ** (failures - 1));
      sources[source] = { ...cached, state: "unavailable", failedAt: new Date(now()).toISOString(), error: error.message, status: error.status || null,
        retryAt: new Date(Math.max(now() + delay, error.retryAt || 0)).toISOString(), failures, lastGood: cached?.checkedAt || null };
    }
    writeJson(stateFile, { ...previous, ...sources });
  }
  writeJson(stateFile, sources);
  return sources;
}
