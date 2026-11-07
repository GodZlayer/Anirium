import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { collectCatalogPages } from "./paginated-catalog.mjs";

export async function discoverJikanCatalog(fetchJson, directory = path.resolve("storage/app/catalog/jikan")) {
  fs.mkdirSync(directory, { recursive: true });
  const statePath = path.join(directory, "state.json");
  let state;
  try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!state || Date.now() - Date.parse(state.startedAt) > 7 * 24 * 3600000
    || (state.completedAt && Date.now() - Date.parse(state.completedAt) > 23 * 3600000)) {
    state = { generation: randomUUID(), startedAt: new Date().toISOString(), completedAt: null };
  }
  if (!/^[a-f0-9-]{36}$/.test(state.generation)) throw new Error("Invalid discovery checkpoint");
  const pagesPath = path.join(directory, state.generation);
  fs.mkdirSync(pagesPath, { recursive: true });
  const persistState = () => {
    fs.writeFileSync(statePath + ".tmp", JSON.stringify(state));
    fs.renameSync(statePath + ".tmp", statePath);
  };
  persistState();
  const records = await collectCatalogPages(async page => {
    await new Promise(resolve => setTimeout(resolve, 1100));
    return fetchJson(`https://api.jikan.moe/v4/anime?order_by=mal_id&sort=asc&limit=25&page=${page}`);
  }, {
    cachedPage: page => {
      try { return JSON.parse(fs.readFileSync(path.join(pagesPath, `${page}.json`), "utf8")); }
      catch (error) { if (error.code === "ENOENT") return null; throw error; }
    },
    savePage: (page, payload) => {
      const target = path.join(pagesPath, `${page}.json`);
      fs.writeFileSync(target + ".tmp", JSON.stringify(payload));
      fs.renameSync(target + ".tmp", target);
    },
    onProgress: ({ page, records }) => { if (page === 1 || page % 50 === 0) console.log(`[MAL/Jikan] ${page} páginas, ${records} obras`); },
  });
  state.completedAt ||= new Date().toISOString();
  persistState();
  return { records, completedAt: state.completedAt };
}
