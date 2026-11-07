import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createJsonlSink } from "./jsonl-sink.mjs";

test("batched reports retain complete lines and flush the final partial batch", t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-report-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const file = path.join(directory, "report.jsonl"), sink = createJsonlSink(file, { batchSize: 2 });
  sink.add({ id: 1 }); assert.equal(fs.existsSync(file), false);
  sink.add({ id: 2 }); sink.add({ id: 3 }); sink.flush(); sink.flush();
  assert.deepEqual(fs.readFileSync(file, "utf8").trim().split("\n").map(line => JSON.parse(line)), [{ id: 1 }, { id: 2 }, { id: 3 }]);
});
