import assert from "node:assert/strict";
import test from "node:test";
import { findFillerWork, validFillerRanges } from "./filler-identity.mjs";

test("music videos and parenthetical qualifiers do not collapse into a TV series", () => {
  const works = new Map([[1, { mal_id: 1, title: "Berserk (Music)", format: "MUSIC", episodes: 1 }],
    [2, { mal_id: 2, title: "Berserk (2016)", format: "TV", episodes: 12 }]]);
  assert.equal(findFillerWork(works, "Berserk"), null);
  assert.equal(findFillerWork(works, "Berserk (2016)").mal_id, 2);
});

test("ambiguous titles stay unresolved rather than selecting whichever appeared first", () => {
  const works = new Map([[1, { title: "Remake", format: "TV" }], [2, { title: "Remake", format: "TV" }]]);
  assert.equal(findFillerWork(works, "Remake"), null);
});

test("range from a franchise-wide guide cannot be assigned to a shorter cour", () => {
  const cour = { format: "TV", episodes: 13 };
  assert.equal(validFillerRanges(cour, ["1-4"], ["13"]), true);
  for (const ranges of [["14"], ["0"], ["9-2"], ["1-no"], ["1-99999"]]) {
    assert.equal(validFillerRanges(cour, ranges), false);
  }
  assert.equal(validFillerRanges({ format: "MUSIC", episodes: 1 }, ["1"]), false);
  assert.equal(validFillerRanges({ format: "TV", entity_type: "MANGA", episodes: 12 }, ["1"]), false);
});
