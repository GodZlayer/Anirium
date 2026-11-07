import test from "node:test";
import assert from "node:assert/strict";
import { applyFillerSnapshot } from "./filler-snapshot.mjs";
import { classifyEpisode } from "../../resources/js/lib/episodeClassification.mjs";

const generated = "2026-10-20T06:01:25Z";
const provenance = { url: "https://github.com/cedya77/anime-offline-database/releases/download/fillers/fillers.json", digest: "sha256:" + "a".repeat(64) };
const guide = { source: "https://www.animefillerlist.com/shows/sword-art-online", canon: [2, 3, 4, 5], episodes: 4 };

test("snapshot uses explicit MAL-local indices without mistaking indexed count for final total", () => {
  const row = { mal_id: 11757, format: "TV", episodes: 25 };
  const report = applyFillerSnapshot([row], { generated, shows: { 11757: guide } }, provenance);
  assert.equal(report.applied, 1);
  assert.equal(row.episodes, 25);
  assert.equal(classifyEpisode(row, 1), "unknown");
  assert.equal(classifyEpisode(row, 2), "canon");
  assert.equal(classifyEpisode(row, 6), "unknown");
  const evidence = JSON.parse(row.filler_episodes_json);
  assert.equal(evidence.via.digest, provenance.digest);
  assert.equal(evidence.via.observedAt, generated);
  assert.equal(evidence.via.repository_attribution.length, 2);
  assert.equal(evidence.via.upstream.license, null);
  assert.equal(evidence.checked_at, generated);
});

test("conflicting, out-of-range or untrusted classifications cannot enter the base", () => {
  for (const change of [{ filler: [2] }, { canon: [26] }, { canon: ["2"] }, { source: "https://example.com/shows/sword-art-online" }]) {
    const row = { mal_id: 11757, format: "TV", episodes: 25 };
    const result = applyFillerSnapshot([row], { generated, shows: { 11757: { ...guide, ...change } } }, provenance);
    assert.equal(result.applied, 0);
    assert.equal(row.filler_episodes_json, undefined);
  }
});

test("older snapshots cannot replace newer evidence and manga IDs remain distinct", () => {
  const evidence = JSON.stringify({ checked_at: "2026-10-21T00:00:00Z" });
  const anime = { mal_id: 11757, format: "TV", episodes: 25, filler_episodes_json: evidence };
  const manga = { mal_id: 11757, entity_type: "MANGA" };
  const result = applyFillerSnapshot([anime, manga], { generated, shows: { 11757: guide } }, provenance);
  assert.equal(result.newerExisting, 1);
  assert.equal(anime.filler_episodes_json, evidence);
  assert.equal(manga.filler_episodes_json, undefined);
});
