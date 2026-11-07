import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { collectCatalogPages } from "./paginated-catalog.mjs";

export const MAL_FIELDS = "id,title,main_picture,alternative_titles,start_date,end_date,synopsis,mean,popularity,media_type,status,genres,num_episodes,start_season,broadcast,studios,related_anime,related_manga";

export async function discoverMalCatalog(read, directory = path.resolve("storage/app/catalog/myanimelist"), { now = Date.now } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  const statePath = path.join(directory, "state.json");
  let state;
  try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  const completePath = path.join(directory, "last-complete.json");
  let previous;
  try { previous = JSON.parse(fs.readFileSync(completePath, "utf8")); } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  state ||= previous;
  const write = (target, value) => { fs.writeFileSync(target + ".tmp", JSON.stringify(value)); fs.renameSync(target + ".tmp", target); };
  const cachedRecords = async checkpoint => {
    if (checkpoint?.schema !== 1 || !/^[a-f0-9-]{36}$/.test(checkpoint.generation) || !Number.isFinite(Date.parse(checkpoint.completedAt))) throw new Error("Invalid completed MAL checkpoint");
    return collectCatalogPages(() => { throw new Error("Incomplete MAL checkpoint"); }, {
      cachedPage: page => {
        const payload = JSON.parse(fs.readFileSync(path.join(directory, checkpoint.generation, `${page}.json`), "utf8"));
        if (payload.data?.some(record => record.id !== record.mal_id)) throw new Error("Invalid cached MAL identity");
        return payload;
      },
    });
  };
  if (state?.completedAt) {
    const records = await cachedRecords(state);
    if (!records.length) throw new Error("Empty completed MAL checkpoint");
    previous = state;
    write(completePath, state);
  }
  if (!state || state.schema !== 1 || now() - Date.parse(state.startedAt) > 7 * 86400000
    || (state.completedAt && now() - Date.parse(state.completedAt) > 23 * 3600000)) {
    state = { schema: 1, generation: randomUUID(), startedAt: new Date(now()).toISOString(), completedAt: null };
  }
  if (!/^[a-f0-9-]{36}$/.test(state.generation)) throw new Error("Invalid MAL checkpoint");
  const folder = path.join(directory, state.generation);
  fs.mkdirSync(folder, { recursive: true });
  write(statePath, state);
  let records;
  try { records = await collectCatalogPages(async page => {
    const url = new URL("https://api.myanimelist.net/v2/anime/ranking");
    url.search = new URLSearchParams({ ranking_type: "bypopularity", limit: "500", offset: String((page - 1) * 500), fields: MAL_FIELDS, nsfw: "true" });
    const payload = await read(url.href);
    if (!Array.isArray(payload?.data) || !payload.paging || typeof payload.paging !== "object") throw new Error(`Invalid official MAL page ${page}`);
    if (payload.paging.next) {
      const next = new URL(payload.paging.next);
      if (next.origin !== url.origin || next.pathname !== url.pathname || Number(next.searchParams.get("offset")) !== page * 500) throw new Error("Invalid MAL next page");
    }
    return { data: payload.data.map(item => ({ ...item.node, mal_id: item.node?.id })), pagination: { has_next_page: Boolean(payload.paging.next) } };
  }, {
    cachedPage: page => { try { const payload = JSON.parse(fs.readFileSync(path.join(folder, `${page}.json`), "utf8")); if (payload.data?.some(record => record.id !== record.mal_id)) throw new Error("Invalid cached MAL identity"); return payload; } catch (error) { if (error.code !== "ENOENT") throw error; return null; } },
    savePage: (page, payload) => write(path.join(folder, `${page}.json`), payload),
    onProgress: ({ page, records, cached }) => { if (page === 1 || page % 10 === 0) console.log(`[MAL oficial] ${page} páginas, ${records} obras${cached ? " (cache)" : ""}`); },
  }); } catch (error) {
    if (!previous) throw error;
    const records = await cachedRecords(previous);
    if (!records.length) throw error;
    return { records, completedAt: previous.completedAt, stale: true, error: { status: Number.isInteger(error.status) ? error.status : null, code: "MAL_DISCOVERY_REFRESH_FAILED" } };
  }
  if (!records.length) throw new Error("Official MAL discovery returned no works");
  state.completedAt ||= new Date(now()).toISOString();
  write(statePath, state);
  write(completePath, state);
  return { records, completedAt: state.completedAt };
}
