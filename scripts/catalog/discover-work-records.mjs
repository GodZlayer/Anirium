import path from "node:path";
import { discoverMalReleases } from "./mal-release-discovery.mjs";
import { discoverMalCatalog } from "./mal-discovery.mjs";
import { discoverSeasonalCatalog } from "./seasonal-discovery.mjs";
import { createJsonSourceClient } from "./json-source-client.mjs";
import { malWorkRecord } from "./mal-work-record.mjs";
import { jikanWorkRecord } from "./jikan-work-record.mjs";

export async function discoverWorkRecords({ malRead, directory = path.resolve("storage/app/catalog") } = {}) {
  const records = [], report = {}, rejected = [];
  if (malRead) {
    const releases = await discoverMalReleases(malRead, { directory: path.join(directory, "myanimelist/releases") });
    report.releases = releases.sources;
    for (const payload of releases.records) {
      try { records.push(malWorkRecord(payload, "anime", payload.source_checked_at)); }
      catch { rejected.push({ source: "mal-releases", id: payload.id }); }
    }
    try {
      const discovery = await discoverMalCatalog(malRead, path.join(directory, "myanimelist"));
      report.mal = { records: discovery.records.length, completedAt: discovery.completedAt, stale: Boolean(discovery.stale), error: discovery.error || null };
      for (const payload of discovery.records) {
        try { records.push(malWorkRecord(payload, "anime", discovery.completedAt)); }
        catch { rejected.push({ source: "mal", id: payload.id }); }
      }
    } catch (error) { report.mal = { unavailable: true, status: error.status || null }; }
  } else report.mal = { unavailable: true, reason: "Credentials not configured" };
  const read = createJsonSourceClient("https://api.jikan.moe", { cooldownFile: path.join(directory, "seasons/source-cooldown.json") });
  const seasons = await discoverSeasonalCatalog(read, { directory: path.join(directory, "seasons"), pause: async () => {} });
  report.seasons = seasons.sources;
  for (const payload of seasons.records) {
    try { records.push(jikanWorkRecord(payload)); }
    catch { rejected.push({ source: "jikan", id: payload.mal_id }); }
  }
  return { records, report, rejected };
}
