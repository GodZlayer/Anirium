import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { digestFile } from "./download-snapshot.mjs";
import { writeJson, readJson } from "./mal-detail-cache.mjs";
import { jsonRecordStream } from "./json-record-stream.mjs";

export async function saveImportCheckpoint(directory, signature, result, metadata) {
  const name = `import-${randomUUID()}.jsonl`, file = path.join(directory, name);
  fs.mkdirSync(directory, { recursive: true });
  const handle = fs.openSync(file, "wx");
  try {
    for (let offset = 0; offset < result.rows.length; offset += 1000) fs.writeSync(handle, result.rows.slice(offset, offset + 1000).map(row => JSON.stringify(row)).join("\n") + "\n");
    fs.fsyncSync(handle);
  } finally { fs.closeSync(handle); }
  writeJson(path.join(directory, "import-checkpoint.json"), { schema: 1, signature, name, sha256: await digestFile(file), count: result.rows.length, report: result.report, metadata });
}

export async function loadImportCheckpoint(directory, signature) {
  const state = readJson(path.join(directory, "import-checkpoint.json"));
  if (!state || state.signature !== signature) return null;
  if (state.schema !== 1 || !/^import-[a-f0-9-]+\.jsonl$/.test(state.name)) throw new Error("Invalid import checkpoint descriptor");
  const file = path.join(directory, state.name);
  if (await digestFile(file) !== state.sha256) throw new Error("Import checkpoint checksum mismatch");
  const rows = [];
  for await (const record of jsonRecordStream(fs.createReadStream(file, { encoding: "utf8" }))) rows.push(record.value);
  if (rows.length !== state.count) throw new Error("Import checkpoint row count mismatch");
  return { result: { rows, report: state.report }, metadata: state.metadata };
}
