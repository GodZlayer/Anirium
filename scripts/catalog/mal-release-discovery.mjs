import fs from "node:fs";
import path from "node:path";
import { collectCatalogPages } from "./paginated-catalog.mjs";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { MAL_FIELDS } from "./mal-discovery.mjs";

export function releaseScopes(instant) {
  const date = new Date(instant), quarter = Math.floor(date.getUTCMonth() / 3), year = date.getUTCFullYear();
  const seasons = ["winter", "spring", "summer", "fall"];
  return [
    { key: `${year}-${seasons[quarter]}`, pathname: `/v2/anime/season/${year}/${seasons[quarter]}` },
    { key: `${year + (quarter === 3 ? 1 : 0)}-${seasons[(quarter + 1) % 4]}`, pathname: `/v2/anime/season/${year + (quarter === 3 ? 1 : 0)}/${seasons[(quarter + 1) % 4]}` },
    { key: "upcoming", pathname: "/v2/anime/ranking", ranking_type: "upcoming" },
  ];
}
const valid = record => Number.isSafeInteger(record?.id) && record.id > 0 && record.mal_id === record.id && typeof record.title === "string" && record.title.trim();

export async function discoverMalReleases(read, { directory, now = Date.now } = {}) {
  const records = new Map(), sources = {};
  for (const scope of releaseScopes(now())) {
    const folder = path.join(directory, scope.key), file = path.join(folder, "complete.json"), saved = readJson(file);
    const cache = saved?.scope === scope.key && Number.isFinite(Date.parse(saved.checkedAt)) && Array.isArray(saved.records) && saved.records.every(valid) ? saved : null;
    let result = cache;
    const age = now() - Date.parse(cache?.checkedAt);
    if (!(age >= 0 && age < 6 * 3600000)) {
      let state = readJson(path.join(folder, "state.json"));
      if (!state || !Number.isFinite(Date.parse(state.startedAt)) || now() - Date.parse(state.startedAt) > 6 * 3600000) {
        state = { startedAt: new Date(now()).toISOString(), pages: {} };
      }
      try {
        const found = await collectCatalogPages(async page => {
          const url = new URL(scope.pathname, "https://api.myanimelist.net");
          url.search = new URLSearchParams({ limit: "500", offset: String((page - 1) * 500), fields: MAL_FIELDS, nsfw: "true", ...(scope.ranking_type ? { ranking_type: scope.ranking_type } : {}) });
          const payload = await read(url.href);
          if (!Array.isArray(payload?.data) || !payload.paging || payload.data.some(item => !valid({ ...item.node, mal_id: item.node?.id }))) throw new Error("Invalid MAL release page");
          if (payload.paging.next) {
            const next = new URL(payload.paging.next);
            if (next.origin !== url.origin || next.pathname !== url.pathname || Number(next.searchParams.get("offset")) !== page * 500) throw new Error("Invalid MAL release pagination");
          }
          return { data: payload.data.map(item => ({ ...item.node, mal_id: item.node.id })), pagination: { has_next_page: Boolean(payload.paging.next) } };
        }, {
          cachedPage: page => state.pages?.[page] || null,
          savePage: (page, payload) => { state.pages[page] = payload; writeJson(path.join(folder, "state.json"), state); },
        });
        if (!found.length || !found.every(valid)) throw new Error("Empty or invalid MAL release scope");
        result = { scope: scope.key, checkedAt: state.startedAt, records: found };
        writeJson(file, result);
        if (fs.existsSync(path.join(folder, "state.json"))) fs.unlinkSync(path.join(folder, "state.json"));
      } catch (error) {
        sources[scope.key] = { checkedAt: cache?.checkedAt || null, stale: true, error: { status: error.status || null, code: "MAL_RELEASE_DISCOVERY_FAILED" } };
      }
    }
    sources[scope.key] ||= { checkedAt: result.checkedAt, stale: false, records: result.records.length, error: null };
    for (const record of result?.records || []) records.set(record.id, { ...record, source_checked_at: result.checkedAt });
  }
  return { records: [...records.values()], sources };
}
