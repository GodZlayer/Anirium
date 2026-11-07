import fs from "node:fs";
import { parquetRead } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { catalogKey } from "./catalog-identity.mjs";

async function readSnapshot(file) {
  const buffer = fs.readFileSync(file);
  let rows;
  await parquetRead({ file: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    compressors, rowFormat: "object", onComplete: result => { rows = result; } });
  if (!rows?.length) throw new Error("Empty catalog snapshot");
  const identities = new Set();
  for (const row of rows) {
    const identity = catalogKey(row);
    if (identities.has(identity)) throw new Error("Duplicate catalog identity");
    identities.add(identity);
  }
  return rows;
}

export async function loadCatalog(file) {
  const failures = [];
  for (const candidate of [file, file + ".previous"]) {
    if (!fs.existsSync(candidate)) continue;
    try { return { rows: await readSnapshot(candidate), recovered: candidate !== file, bootstrap: false }; }
    catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "No valid catalog snapshot; refusing to discard existing data");
  return { rows: [], recovered: false, bootstrap: true };
}
