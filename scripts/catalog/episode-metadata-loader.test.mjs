import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadEpisodeMetadata } from "../../resources/js/lib/episodeMetadataLoader.mjs";
import { normalizeAniZip } from "./anizip-record.mjs";
import { normalizeJikanEpisodes } from "./jikan-episode-record.mjs";

test("episode loading checks content and MAL identity before accepting and caching a document", async () => {
  const work = { mal_id: 42, episodes: 1 };
  const document = normalizeAniZip({ mappings: { mal_id: 42 }, episodes: { "1": { title: { en: "Verified title" } } } }, work, "2026-10-21T00:00:00Z");
  const text = JSON.stringify(document);
  const hash = createHash("sha256").update(text).digest("hex");
  work.episodes_metadata_url = `/data/episodes/anime/42/${hash}.json`;
  const accepted = await loadEpisodeMetadata(work, { request: async () => new Response(text) });
  assert.equal(accepted.episodes[0].titles.en, "Verified title");
  assert.deepEqual(await loadEpisodeMetadata(work, { request: () => { throw new Error("cached request"); } }), accepted);
  assert.equal(await loadEpisodeMetadata({ ...work, mal_id: 43 }), null);
  assert.equal(await loadEpisodeMetadata({ ...work, episodes_metadata_url: "https://example.com/metadata.json" }), null);
  const corrupted = { ...work, episodes_metadata_url: `/data/episodes/anime/42/${"0".repeat(64)}.json` };
  await assert.rejects(loadEpisodeMetadata(corrupted, { request: async () => new Response(text) }), /checksum/);
  const other = JSON.stringify({ ...document, mal_id: 43, catalog_key: "anime:43" });
  const otherHash = createHash("sha256").update(other).digest("hex");
  await assert.rejects(loadEpisodeMetadata({ ...work, episodes_metadata_url: `/data/episodes/anime/42/${otherHash}.json` }, { request: async () => new Response(other) }), /identity/);
});

test("the site loads Jikan episode documents using the same immutable checksum and identity validation", async () => {
  const work = { mal_id: 11757, episodes: 25 };
  const document = normalizeJikanEpisodes([{ mal_id: 1, title: "Published episode", aired: null, filler: false, recap: false }], work, "2026-10-22T00:00:00Z");
  const content = JSON.stringify(document), hash = createHash("sha256").update(content).digest("hex");
  work.episodes_metadata_url = `/data/episodes/anime/11757/${hash}.json`;
  const loaded = await loadEpisodeMetadata(work, { request: async () => new Response(content) });
  assert.equal(loaded.source, "jikan");
  assert.equal(loaded.episodes[0].titles.en, "Published episode");
  assert.equal(loaded.episodes[0].air_date_utc, null);
});
