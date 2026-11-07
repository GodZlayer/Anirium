import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { digestFile } from "./download-snapshot.mjs";
import { buildSearchIndex } from "./search-index.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";

test("the private search index contains real media and searchable aliases without heavy provenance fields", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-search-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const registry = emptyRegistry(), row = assignIdentity({ title: "Sword Art Online", entity_type: "NOVEL", mal_id: 21479, field_provenance_json: "heavy private provenance", synonyms_json: '["ソードアート・オンライン"]' }, registry);
  const descriptor = await buildSearchIndex([row], directory, row.work_id);
  const db = new DatabaseSync(path.join(directory, descriptor.generation + ".sqlite"), { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT count(*) AS total FROM search WHERE search MATCH ?").get('"sword"*').total, 1);
    const work = db.prepare("SELECT * FROM works").get();
    assert.equal(work.media, "novel");
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT count(*) FROM works WHERE media='anime' AND json_extract(summary, '$.status')='RELEASING' AND adult=0").all();
    assert.ok(plan.some(row => row.detail.includes("feed_release")));
    assert.equal(JSON.parse(work.summary).work_id, row.work_id);
    assert.equal(JSON.parse(work.summary).field_provenance_json, undefined);
    await assert.rejects(buildSearchIndex([row], directory, row.work_id), /Immutable search index/);
    assert.equal(await digestFile(path.join(directory, descriptor.generation + ".sqlite")), descriptor.sha256);
  } finally { db.close(); }
});
