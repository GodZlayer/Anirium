import test from "node:test";
import assert from "node:assert/strict";
import { episodeReference, completedEpisodeIndex } from "../../resources/js/lib/progressReferences.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";

test("episode progress resolves legacy aliases and UUIDs without interpreting UUID suffixes as MAL IDs", () => {
  const registry = emptyRegistry(), work = assignIdentity({ mal_id: 123, title: "Anime" }, registry);
  const preferences = [`episode:123:ep-1`, `episode:work:${work.work_id}:ep-1`, `work:${work.work_id}:ep-2`]
    .map(target_id => ({ target_id, target_type: "episode", status: "completed" }));
  const index = completedEpisodeIndex(preferences, [work]);
  assert.equal(index.size, 1);
  assert.deepEqual([...index.get(work.catalog_key)], [1, 2]);
  assert.equal(episodeReference("garbage123:ep-1"), null);
  assert.equal(episodeReference("episode:manga:123:ep-1"), null);
});

test("canonical progress follows the current SQL episode number while retaining its UUID", () => {
  const work = assignIdentity({ mal_id: 269, title: "Anime" }, emptyRegistry());
  const preference = { target_type: "episode", target_id: "episode:269:ep-9", entity_id: "314f8bc9-7335-469c-9e42-4227242db37b",
    work_id: work.work_id, episode_number: 49, status: "completed" };
  assert.deepEqual([...completedEpisodeIndex([preference], [work]).get(work.catalog_key)], [49]);
  preference.target_id = preference.entity_id;
  assert.deepEqual([...completedEpisodeIndex([preference], [work]).get(work.catalog_key)], [49]);
});
