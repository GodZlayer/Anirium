import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveImportCheckpoint, loadImportCheckpoint } from "./import-checkpoint.mjs";

test("normalized imports survive a restart without trusting changed input or corrupted checkpoint bytes", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-import-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const result = { rows: [{ work_id: "fixture", title: "Título\ncom linhas" }], report: { inserted: 1 } };
  await saveImportCheckpoint(directory, "input-and-code-hash", result, { sources: {} });
  assert.deepEqual((await loadImportCheckpoint(directory, "input-and-code-hash")).result, result);
  assert.equal(await loadImportCheckpoint(directory, "changed-source-or-code"), null);
  const descriptor = JSON.parse(fs.readFileSync(path.join(directory, "import-checkpoint.json")));
  fs.appendFileSync(path.join(directory, descriptor.name), "corrupt");
  await assert.rejects(loadImportCheckpoint(directory, "input-and-code-hash"), /checksum mismatch/);
});
