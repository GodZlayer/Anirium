import assert from "node:assert/strict";
import test from "node:test";
import { classifyEpisode } from "../../resources/js/lib/episodeClassification.mjs";

const evidence = { source: "animefillerlist", source_url: "https://www.animefillerlist.com/shows/fixture", checked_at: "2026-10-21T00:00:00Z", mal_id: 269, filler: ["2"], mixed: ["3"], manga_canon: ["1"], anime_canon: ["4"] };
const work = (data = evidence) => ({ mal_id: 269, episodes_count: 12, format: "TV", filler_episodes_json: JSON.stringify(data) });

test("episodes are classified only inside explicit source coverage", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 13].map(number => classifyEpisode(work(), number)), ["canon", "filler", "mixed", "canon", "unknown", "unknown"]);
});

test("legacy unverified guides and mismatched identities remain unknown", () => {
  for (const data of [{ filler: ["2"] }, { ...evidence, mal_id: 20 }, { ...evidence, source_url: "https://untrusted.example/shows/fixture" }, { ...evidence, checked_at: "invalid" }]) {
    assert.equal(classifyEpisode(work(data), 2), "unknown");
  }
  assert.equal(classifyEpisode({ ...work(), format: "MUSIC" }, 2), "unknown");
  assert.equal(classifyEpisode({ ...work(), entity_type: "MANGA" }, 2), "unknown");
});

test("conflicting classifications and invalid ranges cannot imply canon or filler", () => {
  assert.equal(classifyEpisode(work({ ...evidence, manga_canon: ["2"] }), 2), "unknown");
  assert.equal(classifyEpisode(work({ ...evidence, filler: ["2oops", "0-999999"] }), 2), "unknown");
  assert.equal(classifyEpisode(work(), 1.5), "unknown");
});
