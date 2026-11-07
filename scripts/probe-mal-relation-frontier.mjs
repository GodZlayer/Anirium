import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { refreshMalWorks } from "./catalog/mal-work-stage.mjs";
import { writeJson } from "./catalog/mal-detail-cache.mjs";

const id = Number(process.argv.find(arg => arg.startsWith("--mal="))?.slice(6) || 11757);
if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid MAL anime identity");
const directory = path.resolve("storage/app/catalog/myanimelist"), seedFile = path.join(directory, "details", `${id}.json`);
const before = fs.existsSync(seedFile) ? fs.readFileSync(seedFile) : null;
const result = await refreshMalWorks([{ entity_type: "WORK", mal_id: id, status: "COMPLETED" }],
  async () => { throw new Error("This cache-only probe must not make requests"); }, { directory, requestBudget: 0 });
const proof = { checkedAt: new Date().toISOString(), seed: `mal:anime:${id}`, seedCacheAvailable: Boolean(before),
  seedCacheUnchanged: before ? before.equals(fs.readFileSync(seedFile)) : !fs.existsSync(seedFile),
  seedSha256: before ? createHash("sha256").update(before).digest("hex") : null,
  networkRequests: 0, coverage: result.report, cachedWorks: result.records.length,
  exampleIdentities: result.records.slice(0, 10).map(row => ({ mal_id: row.mal_id, entity_type: row.entity_type })),
  scope: "Explicit cached relation frontier; no remote freshness or total universe completeness claim", publicCatalogModified: false };
writeJson(path.resolve("storage/app/catalog/probes", `mal-relation-frontier-${id}.json`), proof);
console.log(JSON.stringify(proof));
