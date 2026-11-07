import fs from "node:fs";
import path from "node:path";
import { loadFillerSnapshot } from "./filler-snapshot-source.mjs";
import { applyFillerSnapshot } from "./filler-snapshot.mjs";
import { refreshAniZipBatch, applyAniZipEpisodes } from "./anizip-batch.mjs";
import { createJsonSourceClient } from "./json-source-client.mjs";
import { verifyCatalogAssets } from "./verify-catalog-assets.mjs";
import { attachFieldEvidence } from "./field-provenance.mjs";
import { refreshMediawikiArcs } from "./mediawiki-batch.mjs";
import { SOURCE_CONTRACTS } from "./source-contracts.mjs";
import { supplementJikanEpisodes } from "./jikan-episode-batch.mjs";

export async function supplementCatalog(rows, { dataDirectory, publicDirectory = path.resolve("public/data"), sourceDirectory = path.resolve("storage/app/catalog"), episodeBudget = 100, arcBudget = Number(process.env.MEDIAWIKI_WORK_BUDGET || 10), request = fetch } = {}) {
  for (const row of rows) {
    if (!row.episodes_metadata_url) continue;
    const match = /^\/data\/(episodes\/anime\/[1-9]\d*\/[a-f0-9]{64}\.json)$/.exec(row.episodes_metadata_url);
    if (!match) throw new Error("Invalid retained episode asset");
    const destination = path.join(dataDirectory, match[1]);
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(publicDirectory, match[1]), destination);
    }
  }
  const filler = await loadFillerSnapshot({ directory: path.join(sourceDirectory, "snapshots"), request });
  const classification = { stale: filler.stale, error: filler.error || null, provenance: filler.provenance || null,
    coverage: filler.snapshot ? applyFillerSnapshot(rows, filler.snapshot, filler.provenance) : null };
  const cacheDirectory = path.join(sourceDirectory, "anizip/cache");
  const read = createJsonSourceClient("https://api.ani.zip", { cooldownFile: path.join(cacheDirectory, "source-cooldown.json"), request });
  const batch = await refreshAniZipBatch(rows, read, { directory: cacheDirectory, requestBudget: episodeBudget, timeBudgetMs: 180000 });
  const byId = new Map(rows.filter(row => row.entity_type === "WORK").map(row => [row.mal_id, row]));
  const episodes = applyAniZipEpisodes(byId, batch, path.join(dataDirectory, "episodes/anime"));
  const jikanEpisodes = await supplementJikanEpisodes(rows, { directory: path.join(sourceDirectory, "jikan/episodes"), dataDirectory,
    cooldownFile: path.join(sourceDirectory, "seasons/source-cooldown.json"), request, requestBudget: Math.min(20, episodeBudget) });
  for (const row of rows) {
    if (row.filler_episodes_json) {
      const guide = JSON.parse(row.filler_episodes_json);
      attachFieldEvidence(row, ["filler_episodes_json"], { provider: guide.source, source_url: guide.source_url, observed_at: guide.checked_at,
        imported_at: new Date().toISOString(), via: guide.via || null });
    }
  }
  const mediawiki = SOURCE_CONTRACTS.mediawiki.enabled ? await refreshMediawikiArcs(rows, { directory: path.join(sourceDirectory, "mediawiki/cache"), requestBudget: arcBudget, request })
    : { state: "disabled", reason: SOURCE_CONTRACTS.mediawiki.reason };
  return { classification, episodes, jikanEpisodes, mediawiki, assets: verifyCatalogAssets(rows, dataDirectory) };
}
