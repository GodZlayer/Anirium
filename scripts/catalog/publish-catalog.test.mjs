import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publishCatalog } from "./publish-catalog.mjs";
import { entityMapKey, catalogKey } from "./catalog-identity.mjs";

function target(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-publish-test-"));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), parent);
    fs.rmSync(directory, { recursive: true });
  });
  return path.join(directory, "catalog.parquet");
}

test("publication roundtrips sparse columns beyond inference window and preserves backup", async t => {
  const file = target(t);
  fs.writeFileSync(file, "previous snapshot");
  const rows = Array.from({ length: 1002 }, (_, index) => ({ mal_id: index + 1, entity_type: "WORK", title: `Work ${index}`, extra_localized_field: index === 1001 ? "日本語" : null, score: 9.45 }));
  const result = await publishCatalog(rows, rows.slice(0, 3), file);
  assert.equal(result.rows, 1002);
  assert.equal(fs.readFileSync(file + ".previous", "utf8"), "previous snapshot");
  assert.equal(fs.readFileSync(file).subarray(0, 4).toString(), "PAR1");
});

test("identity collision, disappearing works and invalid types leave published snapshot intact", async t => {
  const file = target(t);
  fs.writeFileSync(file, "valid snapshot");
  const row = { mal_id: 1, entity_type: "WORK" };
  await assert.rejects(publishCatalog([row, row], [], file), /Duplicate/);
  await assert.rejects(publishCatalog([row], [{ mal_id: 2 }], file), /remove existing/);
  await assert.rejects(publishCatalog([{ ...row, extra: NaN }], [], file), /Invalid catalog column/);
  assert.equal(fs.readFileSync(file, "utf8"), "valid snapshot");
});

test("anime and manga with the same MAL number survive as two records", async t => {
  const rows = [{ mal_id: 1, entity_type: "WORK" }, { mal_id: 1, entity_type: "MANGA" }];
  const entities = new Map(rows.map(row => [entityMapKey(row), row]));
  assert.equal(entities.size, 2);
  assert.deepEqual(rows.map(catalogKey), ["anime:1", "manga:1"]);
  assert.equal((await publishCatalog([...entities.values()], rows, target(t))).rows, 2);
});
