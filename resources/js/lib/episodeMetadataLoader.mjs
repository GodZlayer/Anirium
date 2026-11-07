import { readEpisodeMetadata } from "./episodeMetadata.mjs";
import { catalogFetch } from "./catalogTransport.mjs";

const cache = new Map();

export async function loadEpisodeMetadata(work, { signal, request = catalogFetch } = {}) {
  const id = Number(work?.mal_id ?? work?.id);
  const url = work?.episodes_metadata_url;
  const match = new RegExp(`^/data/episodes/anime/${id}/([a-f0-9]{64})\\.json$`).exec(url || "");
  if (["MANGA", "NOVEL"].includes(work?.entity_type) || !Number.isSafeInteger(id) || !match) return null;
  if (cache.has(url)) return readEpisodeMetadata(cache.get(url), work);
  const response = await request(url, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error(`Episode metadata HTTP ${response.status}`);
  const text = await response.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  if (hash !== match[1]) throw new Error("Episode metadata checksum mismatch");
  const document = readEpisodeMetadata(JSON.parse(text), work);
  if (!document) throw new Error("Episode metadata identity or schema mismatch");
  cache.set(url, document);
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return document;
}
