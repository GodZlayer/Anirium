import test from "node:test";
import assert from "node:assert/strict";
import { workCapabilities } from "./work-capabilities.mjs";

test("unavailable resources stay disabled and validated evidence enables only its own resource", () => {
  assert.deepEqual(workCapabilities(null), { episodes: false, chapters: false, volumes: false, arcs: false, classification: false });
  const work = { mal_id: 1, entity_type: "WORK", episodes_metadata_url: `/data/episodes/anime/1/${"a".repeat(64)}.json` };
  assert.equal(workCapabilities(work).episodes, true);
  assert.equal(workCapabilities({ ...work, mal_id: 2 }).episodes, false);
  assert.equal(workCapabilities({ ...work, entity_type: "NOVEL" }).episodes, false);
  const classified = { ...work, filler_episodes_json: JSON.stringify({ mal_id: 1, source: "animefillerlist", source_url: "https://www.animefillerlist.com/shows/fixture", checked_at: "2026-10-21", filler: ["1"] }) };
  assert.equal(workCapabilities(classified).classification, true);
  assert.equal(workCapabilities({ ...classified, entity_type: "NOVEL" }).classification, false);
  assert.equal(workCapabilities({ ...work, chapters_metadata_url: "https://unverified.test" }).chapters, false);
});
