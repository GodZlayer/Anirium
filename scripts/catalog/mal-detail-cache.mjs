import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAL_FIELDS } from "./mal-discovery.mjs";

export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(value)); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

export function validDetail(payload, id) {
  return payload?.id === id && typeof payload.title === "string" && payload.title.trim() && Array.isArray(payload.related_anime);
}

export function readDetail(directory, id) {
  const cache = readJson(path.join(directory, `${id}.json`));
  return cache && Number.isFinite(Date.parse(cache.checkedAt)) && validDetail(cache.payload, id) ? cache : null;
}

export function detailFresh(record, cache, now) {
  const ttl = record.status === "finished_airing" ? 7 * 86400000 : 12 * 3600000;
  const age = now - Date.parse(cache?.checkedAt);
  return age >= 0 && age < ttl;
}

export async function fetchDetail(record, read, directory, now = Date.now) {
  const payload = await read(`https://api.myanimelist.net/v2/anime/${record.id}?fields=${MAL_FIELDS}`);
  if (!validDetail(payload, record.id)) throw new Error(`Invalid official MAL details: ${record.id}`);
  const cache = { checkedAt: new Date(now()).toISOString(), payload };
  writeJson(path.join(directory, `${record.id}.json`), cache);
  return cache;
}
