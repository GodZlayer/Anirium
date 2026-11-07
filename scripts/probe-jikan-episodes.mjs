import path from "node:path";
import { writeJson } from "./catalog/mal-detail-cache.mjs";
import { supplementJikanEpisodes } from "./catalog/jikan-episode-batch.mjs";
import { verifyCatalogAssets } from "./catalog/verify-catalog-assets.mjs";

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split("=")[1];
const id = Number(option("mal")), episodes = Number(option("episodes"));
if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(episodes) || episodes < 1) throw new Error("Provide --mal=<positive ID> --episodes=<known total>");
const directory = path.resolve("storage/app/catalog/probes/jikan-episodes", String(id));
const work = { mal_id: id, entity_type: "WORK", episodes, status: "COMPLETED" };
const report = await supplementJikanEpisodes([work], { directory: path.join(directory, "cache"), dataDirectory: path.join(directory, "data"),
  cooldownFile: path.join(directory, "source-cooldown.json"), requestBudget: 2 });
const proof = { checkedAt: new Date().toISOString(), mal_id: id, report,
  assets: verifyCatalogAssets([work], path.join(directory, "data")), document: work.episodes_metadata_url || null,
  publicCatalogModified: false };
writeJson(path.join(directory, "proof.json"), proof);
console.log(JSON.stringify(proof));
