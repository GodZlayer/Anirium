import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshMalDetailStage } from "./mal-detail-stage.mjs";

function config(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-mal-stage-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  return { directory, requestBudget: 3 };
}
const records = [1, 2, 3].map(id => ({ id, title: `Work ${id}`, status: "finished_airing" }));

test("access denial preserves partial progress and stops only MAL requests", async t => {
  let calls = 0;
  const options = config(t);
  const result = await refreshMalDetailStage(records, async url => {
    calls++;
    const id = Number(new URL(url).pathname.split("/").pop());
    if (id === 2) throw Object.assign(new Error("private response"), { status: 401 });
    return { id, title: `Verified ${id}`, related_anime: [] };
  }, options);
  assert.equal(calls, 2);
  assert.equal(result.records.length, 3);
  assert.equal(result.records[0].title, "Verified 1");
  assert.equal(result.coverage.fresh, 1);
  assert.equal(result.coverage.missing, 2);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.attempted, 2);
  assert.equal(result.coverage.updated, 1);
  assert.deepEqual(result.coverage.sourceError, { status: 401, code: "MAL_ACCESS_DENIED" });
  assert.equal(JSON.stringify(result).includes("private response"), false);
  const next = await refreshMalDetailStage(records, async () => { throw Object.assign(new Error("forbidden"), { status: 403 }); }, options);
  assert.equal(next.coverage.fresh, 1);
  assert.equal(next.coverage.sourceError.status, 403);
});

test("source identity failures remain fatal and cannot be hidden as auth failures", async t => {
  await assert.rejects(refreshMalDetailStage(records, async () => ({ id: 999, title: "Wrong", related_anime: [] }), config(t)), /Invalid official MAL details/);
});
