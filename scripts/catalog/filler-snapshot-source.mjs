import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { fillerProvenance } from "./filler-provenance.mjs";

const RELEASE = "https://api.github.com/repos/cedya77/anime-offline-database/releases/tags/fillers";
export async function loadFillerSnapshot({ directory = path.resolve("storage/app/catalog/snapshots"), request = fetch, now = Date.now } = {}) {
  const pointer = path.join(directory, "filler-source.json");
  const saved = readJson(pointer);
  let cached;
  try {
    if (/^sha256:[a-f0-9]{64}$/.test(saved?.digest)) {
      const buffer = fs.readFileSync(path.join(directory, `${saved.digest.slice(7)}.json`));
      if ("sha256:" + createHash("sha256").update(buffer).digest("hex") === saved.digest) {
        const snapshot = JSON.parse(buffer);
        cached = { snapshot, provenance: fillerProvenance(saved, snapshot) };
      }
    }
  } catch {}
  if (cached && now() - Date.parse(saved.checkedAt) >= 0 && now() - Date.parse(saved.checkedAt) < 6 * 3600000) return { ...cached, stale: false };
  try {
    const response = await request(RELEASE, { headers: { "User-Agent": "Anirium-catalog-sync" }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw Object.assign(new Error("Snapshot release unavailable"), { status: response.status });
    const release = await response.json();
    const asset = release.assets?.find(item => item.name === "fillers.json");
    if (!/^sha256:[a-f0-9]{64}$/.test(asset?.digest) || asset.browser_download_url !== "https://github.com/cedya77/anime-offline-database/releases/download/fillers/fillers.json") throw new Error("Invalid snapshot asset");
    let snapshot;
    if (cached && cached.provenance.digest === asset.digest) snapshot = cached.snapshot;
    else {
      const download = await request(asset.browser_download_url, { signal: AbortSignal.timeout(25000) });
      if (!download.ok) throw Object.assign(new Error("Snapshot download unavailable"), { status: download.status });
      const buffer = Buffer.from(await download.arrayBuffer());
      if (buffer.length !== asset.size || "sha256:" + createHash("sha256").update(buffer).digest("hex") !== asset.digest) throw new Error("Snapshot checksum mismatch");
      snapshot = JSON.parse(buffer);
      if (!Number.isFinite(Date.parse(snapshot.generated)) || !snapshot.shows || typeof snapshot.shows !== "object" || Array.isArray(snapshot.shows)) throw new Error("Invalid snapshot payload");
      fs.mkdirSync(directory, { recursive: true });
      const target = path.join(directory, `${asset.digest.slice(7)}.json`), temporary = `${target}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(temporary, buffer); fs.renameSync(temporary, target); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
    const provenance = fillerProvenance({ digest: asset.digest, checkedAt: new Date(now()).toISOString() }, snapshot);
    writeJson(pointer, provenance);
    return { snapshot, provenance, stale: false };
  } catch (error) {
    return { ...(cached || {}), stale: true, error: { status: Number.isInteger(error.status) ? error.status : null, code: "FILLER_SNAPSHOT_UNAVAILABLE" } };
  }
}
