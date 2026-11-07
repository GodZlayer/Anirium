import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enrichMalDetails } from "./mal-details.mjs";

test("detail backfill resumes from per-work cache after failure and rejects wrong identities", async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-mal-details-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const records = [{ id: 1, status: "finished_airing" }, { id: 2, status: "not_yet_aired" }];
  await assert.rejects(enrichMalDetails(records, async url => {
    if (url.includes("/2?")) throw new Error("offline");
    return { id: 1, title: "One", related_anime: [{ node: { id: 2 }, relation_type: "sequel" }] };
  }, directory), /offline/);
  const result = await enrichMalDetails(records, async url => {
    assert.ok(url.includes("/2?"));
    return { id: 2, title: "Two", related_anime: [] };
  }, directory);
  assert.equal(result[0].related_anime[0].node.id, 2);
  assert.ok(result.every(row => Number.isFinite(Date.parse(row.source_checked_at))));
  await assert.rejects(enrichMalDetails([{ id: 3 }], async () => ({ id: 4, title: "Wrong", related_anime: [] }), directory), /Invalid official MAL details/);
});
