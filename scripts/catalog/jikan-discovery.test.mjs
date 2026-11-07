import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverJikanCatalog } from "./jikan-discovery.mjs";
import { jikanRecord } from "./jikan-record.mjs";

function workspace(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-discovery-test-"));
  t.after(() => {
    const target = fs.realpathSync(directory);
    assert.equal(path.dirname(target), parent);
    assert.ok(path.basename(target).startsWith("anirium-discovery-test-"));
    fs.rmSync(target, { recursive: true });
  });
  return directory;
}

const response = (mal_id, next) => ({ data: [{ mal_id }], pagination: { has_next_page: next } });

test("completed discovery is cached with a real completion timestamp", async t => {
  const directory = workspace(t);
  const result = await discoverJikanCatalog(async url => {
    assert.equal(new URL(url).searchParams.get("order_by"), "mal_id");
    return response(269, false);
  }, directory);
  assert.ok(Number.isFinite(Date.parse(result.completedAt)));
  const cached = await discoverJikanCatalog(() => { throw new Error("cached request reached network"); }, directory);
  assert.deepEqual(cached, result);
});

test("disk checkpoint survives interruption and only missing pages are fetched", async t => {
  const directory = workspace(t);
  await assert.rejects(discoverJikanCatalog(async url => {
    if (new URL(url).searchParams.get("page") === "2") throw new Error("fixture offline");
    return response(1, true);
  }, directory), /offline/);
  const state = JSON.parse(fs.readFileSync(path.join(directory, "state.json")));
  assert.equal(state.completedAt, null);
  state.startedAt = new Date(Date.now() - 48 * 3600000).toISOString();
  fs.writeFileSync(path.join(directory, "state.json"), JSON.stringify(state));
  const result = await discoverJikanCatalog(async url => {
    assert.equal(new URL(url).searchParams.get("page"), "2");
    return response(2, false);
  }, directory);
  assert.deepEqual(result.records.map(row => row.mal_id), [1, 2]);
});

test("MAL normalization preserves unknown dates and does not invent episode counts", () => {
  const result = jikanRecord({ mal_id: 269, title: "Fixture", status: "Not yet aired" });
  assert.equal(result.m.idMal, 269);
  assert.equal(result.m.seasonYear, null);
  assert.equal(result.m.episodes, undefined);
  assert.equal(result.mappedStatus, "NOT_YET_RELEASED");
});
