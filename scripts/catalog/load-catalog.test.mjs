import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCatalog } from "./load-catalog.mjs";
import { publishCatalog } from "./publish-catalog.mjs";

function target(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-load-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  return path.join(directory, "nested", "catalog.parquet");
}

test("missing snapshots bootstrap and first publication creates output directory", async t => {
  const file = target(t);
  assert.deepEqual(await loadCatalog(file), { rows: [], recovered: false, bootstrap: true });
  const rows = [{ mal_id: 1, entity_type: "WORK", title: "Fixture" }];
  await publishCatalog(rows, [], file);
  assert.deepEqual(await loadCatalog(file), { rows, recovered: false, bootstrap: false });
});

test("recovery republishes valid backup without replacing it with corrupt primary", async t => {
  const file = target(t);
  const rows = [{ mal_id: 1, entity_type: "WORK" }, { mal_id: 1, entity_type: "MANGA" }];
  await publishCatalog(rows, [], file + ".previous");
  const backup = fs.readFileSync(file + ".previous");
  fs.writeFileSync(file, "broken primary");
  const snapshot = await loadCatalog(file);
  assert.equal(snapshot.recovered, true);
  assert.deepEqual(snapshot.rows, rows);
  await publishCatalog([...rows, { mal_id: 2 }], snapshot.rows, file, { preservePrevious: true });
  assert.deepEqual(fs.readFileSync(file + ".previous"), backup);
  assert.equal((await loadCatalog(file)).rows.length, 3);
  fs.unlinkSync(file);
  assert.equal((await loadCatalog(file)).recovered, true);
});

test("unrecoverable existing snapshots fail without silently bootstrapping", async t => {
  const file = target(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "broken");
  await assert.rejects(loadCatalog(file), /No valid catalog snapshot/);
  fs.writeFileSync(file + ".previous", "also broken");
  await assert.rejects(loadCatalog(file), /No valid catalog snapshot/);
  assert.equal(fs.readFileSync(file, "utf8"), "broken");
});
