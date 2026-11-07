import test from "node:test";
import assert from "node:assert/strict";
import { emptyRegistry } from "./work-registry.mjs";
import { consolidateSnapshot } from "./consolidate-snapshot.mjs";
import { offlineAnimeRecord } from "./offline-anime-record.mjs";
import { mangabakaRecord } from "./mangabaka-record.mjs";
import { workCapabilities } from "./work-capabilities.mjs";
import { malRecord } from "./mal-record.mjs";

const provenance = { version: "fixture", sourceUpdatedAt: "2026-10-19", importedAt: "2026-10-21T00:00:00Z", url: "https://example.com/snapshot", digest: "sha256:" + "a".repeat(64), license: "ODbL-1.0" };
test("bulk import supplements by explicit identity while preserving canonical MAL fields and ratings", () => {
  const incoming = offlineAnimeRecord({ title: "Aggregate title", type: "TV", status: "FINISHED", sources: ["https://myanimelist.net/anime/11757", "https://kitsu.app/anime/6589"], episodes: 25, score: { median: 9 }, relatedAnime: ["https://myanimelist.net/anime/21881"] }, provenance);
  const result = consolidateSnapshot([{ mal_id: 11757, title: "Sword Art Online", score: 7.23 }], [incoming], emptyRegistry());
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].title, "Sword Art Online");
  assert.equal(result.rows[0].score, 7.23);
  assert.equal(result.rows[0].episodes, 25);
  assert.equal(JSON.parse(result.rows[0].external_ids_json).length, 2);
  assert.equal(JSON.parse(result.rows[0].source_relations_json)[0].relation_type, "unspecified");
  assert.equal(workCapabilities(result.rows[0]).arcs, false);
  const refreshed = consolidateSnapshot(result.rows, [{ mal_id: 11757, title: "Older legacy title" }], emptyRegistry());
  assert.equal(refreshed.rows[0].title, "Sword Art Online");
  assert.equal(refreshed.rows[0].episodes, 25);
  assert.throws(() => offlineAnimeRecord({ title: "Bad merge", type: "TV", status: "FINISHED", sources: ["https://myanimelist.net/anime/1", "https://myanimelist.net/anime/2"] }, provenance), /granularity/);
});

test("novels without MAL retain written counts without manufacturing episodes or chapter indices", () => {
  const row = mangabakaRecord({ id: 15, title: "Novel", type: "novel", state: "active", status: "ongoing", total_chapters: "42", final_volume: null, source: {} }, provenance);
  const result = consolidateSnapshot([], [row], emptyRegistry()).rows[0];
  assert.equal(result.entity_type, "NOVEL"); assert.equal(result.mal_id, null);
  assert.equal(result.chapters_count, 42); assert.equal(result.episodes, undefined);
  assert.deepEqual(workCapabilities(result), { episodes: false, chapters: false, volumes: false, arcs: false, classification: false });
});

test("an ongoing offline snapshot count cannot cap episodes documented after the snapshot", () => {
  const record = { title: "Ongoing", type: "ONA", status: "ONGOING", sources: ["https://myanimelist.net/anime/59410"], episodes: 224 };
  const row = offlineAnimeRecord(record, provenance);
  const result = consolidateSnapshot([{ mal_id: 59410, episodes: null, episodes_indexed_count: 228 }], [row], emptyRegistry()).rows[0];
  assert.equal(result.episodes, null);
  assert.equal(result.observed_episode_count, 224);
  assert.equal(result.episodes_indexed_count, 228);
});

test("ANN-only anime and long explicit Anime-Planet references remain discoverable without MAL", () => {
  const row = offlineAnimeRecord({ title: "ANN only", type: "ONA", status: "UNKNOWN", sources: ["https://animenewsnetwork.com/encyclopedia/anime.php?id=36229"] }, provenance);
  assert.equal(row.mal_id, null);
  assert.equal(consolidateSnapshot([], [row], emptyRegistry()).rows.length, 1);
  const written = mangabakaRecord({ id: 12, title: "Written", type: "novel", state: "active", source: { anime_planet: { id: "long-title-".repeat(20) } } }, provenance);
  assert.equal(consolidateSnapshot([], [written], emptyRegistry()).rows.length, 1);
});

test("MAL raw relations preserve other, unknown types and cross-media targets without inventing canon or arcs", () => {
  const row = malRecord({ id: 11757, related_anime: [{ node: { id: 16099 }, relation_type: "other" }, { node: { id: 2 }, relation_type: "new-type" }], related_manga: [{ node: { id: 21479 }, relation_type: "adaptation" }] });
  const raw = JSON.parse(row.m.officialPatch.source_relations_json);
  assert.deepEqual(raw.map(edge => edge.relation_type), ["other", "new-type", "adaptation"]);
  assert.equal(raw[2].target.media, "manga");
  assert.equal(row.m.officialRelations[0].type, "OTHER");
  assert.equal(row.m.officialPatch.arcs_json, undefined);
  assert.equal(row.m.officialPatch.filler_episodes_json, undefined);
});
