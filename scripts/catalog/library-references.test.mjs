import test from "node:test";
import assert from "node:assert/strict";
import { libraryReference, libraryMatches, libraryRating, libraryPreferences } from "../../resources/js/lib/libraryReferences.mjs";

const uuid = "314f8bc9-7335-469c-9e42-4227242db37b";
const work = { entity_type: "WORK", work_id: uuid, id: 20, mal_id: 20, aliases_json: '["anime:10"]' };
test("library references preserve UUIDs and unwrap old work wrappers without suffix guessing", () => {
  for (const value of [uuid, `work:${uuid}`, `work:work:${uuid}`]) assert.equal(libraryReference(value), `work:${uuid}`);
  assert.equal(libraryReference("work:20"), "anime:20");
  assert.equal(libraryReference("work:manga:20"), "manga:20");
  for (const value of [`episode:20:ep-1`, "universe:20", "garbage123"]) assert.equal(libraryReference(value), null);
});
test("aliases retain bookmarks and ratings after external IDs arrive without crossing media", () => {
  assert.equal(libraryMatches(work, [`work:${uuid}`]), true);
  assert.equal(libraryMatches(work, ["work:10"]), true);
  assert.equal(libraryMatches(work, ["manga:20"]), false);
  assert.equal(libraryRating(work, { [`work:work:${uuid}`]: 8 }), 8);
  assert.equal(libraryRating(work, { "manga:20": 9 }), undefined);
});
test("episode and universe completion never become completed works in the library", () => {
  const preferences = [{ target_type: "work", target_id: `work:work:${uuid}`, bookmarked: true, status: "completed", user_score: 8 },
    { target_type: "episode", target_id: "episode:20:ep-3", status: "completed", user_score: 10 },
    { target_type: "universe", target_id: "20", status: "completed" }];
  assert.deepEqual(libraryPreferences(preferences), { bookmarks: [`work:${uuid}`], completed: [`work:${uuid}`], ratings: { [`work:${uuid}`]: 8 } });
});

test("a newer unbookmark on the same normalized identity overrides an old wrapped reference", () => {
  const old = { target_type: "work", target_id: "work:20", bookmarked: true, status: "completed", user_score: 9, updated_at: "2026-10-01T00:00:00Z" };
  const recent = { target_type: "work", target_id: "anime:20", bookmarked: false, status: "watching", user_score: null, updated_at: "2026-10-22T00:00:00Z" };
  for (const preferences of [[old, recent], [recent, old]]) assert.deepEqual(libraryPreferences(preferences), { bookmarks: [], completed: [], ratings: {} });
});
