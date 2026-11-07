import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { writeJson } from "./mal-detail-cache.mjs";
import { pruneCatalogGenerations, pruneImportCheckpoints } from "./catalog-retention.mjs";
test("retention preserves current and previous generations and refuses unrelated content", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-retention-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const data = path.join(root, "data"), indexes = path.join(root, "indexes"), ids = Array.from({ length: 5 }, randomUUID);
  for (const [i, id] of ids.entries()) {
    const folder = path.join(data, "catalog/v2", id);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "lookup.json"), "{}");
    fs.utimesSync(folder, i + 1, i + 1);
    fs.mkdirSync(indexes, { recursive: true }); fs.writeFileSync(path.join(indexes, `${id}.sqlite`), "owned fixture");
  }
  writeJson(path.join(data, "catalog.manifest.json"), { schema: 2, generation: ids[0] });
  writeJson(path.join(data, "catalog.manifest.json.previous"), { schema: 2, generation: ids[1] });
  fs.writeFileSync(path.join(data, "catalog/v2", ids[2], "user-note.txt"), "keep");
  const result = pruneCatalogGenerations(data, { indexDirectory: indexes });
  assert.deepEqual(result.removed, [ids[3]]);
  for (const id of [ids[0], ids[1], ids[2], ids[4]]) assert.equal(fs.existsSync(path.join(data, "catalog/v2", id)), true);
  assert.equal(fs.existsSync(path.join(indexes, `${ids[3]}.sqlite`)), false);
});
test("the referenced import checkpoint survives even if it is older than retained recent files", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-checkpoints-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const names = Array.from({ length: 4 }, () => `import-${randomUUID()}.jsonl`);
  for (const [i, name] of names.entries()) { fs.writeFileSync(path.join(root, name), "{}\n"); fs.utimesSync(path.join(root, name), i + 1, i + 1); }
  writeJson(path.join(root, "import-checkpoint.json"), { name: names[0] });
  assert.deepEqual(pruneImportCheckpoints(root).removed, [names[1]]);
  assert.equal(fs.existsSync(path.join(root, names[0])), true);
});
