import test from "node:test";
import assert from "node:assert/strict";
import { malMetadataPatch } from "./mal-metadata.mjs";

test("source metadata replaces stale genres, studios and fabricated totals without invented IDs", () => {
  const patch = malMetadataPatch({ id: 1, title: "New title", details_checked_at: "2026-10-21T00:00:00Z", num_episodes: 0, mean: 0,
    status: "not_yet_aired", genres: [{ id: 14, name: "Horror" }], studios: [], main_picture: { medium: "https://cdn.myanimelist.net/fixture.jpg" } });
  assert.equal(patch.title, "New title");
  assert.equal(patch.episodes, null);
  assert.equal(patch.latest_episode_num, null);
  assert.equal(patch.score, null);
  assert.equal(patch.year, null);
  assert.deepEqual(JSON.parse(patch.genres_json), [{ mal_id: 14, name: "Horror" }]);
  assert.equal(patch.studios_json, "[]");
});

test("an incomplete listing does not erase fields the source has not supplied", () => {
  const patch = malMetadataPatch({ id: 1, title: "Listed title" });
  assert.deepEqual(patch, { title: "Listed title" });
});
