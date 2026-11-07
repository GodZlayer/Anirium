import fs from "node:fs";
import path from "node:path";
import { parquetRead } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { parquetWriteFile } from "hyparquet-writer";
import { catalogKey } from "./catalog-identity.mjs";
import { catalogAliases } from "../../resources/js/lib/catalogAliases.mjs";

function indexRows(rows) {
  const indexed = new Map();
  for (const row of rows) {
    const key = catalogKey(row);
    if (indexed.has(key)) throw new Error(`Duplicate catalog identity: ${key}`);
    indexed.set(key, row);
  }
  return indexed;
}

export function validatePublicationIdentities(rows, previousRows) {
  if (!rows.length) throw new Error("Refusing to publish empty catalog");
  const indexed = indexRows(rows);
  const aliases = new Map();
  for (const row of rows) for (const alias of [catalogKey(row), ...catalogAliases(row)]) {
    if (aliases.has(alias) && aliases.get(alias) !== catalogKey(row)) throw new Error(`Duplicate catalog alias: ${alias}`);
    aliases.set(alias, catalogKey(row));
  }
  for (const key of indexRows(previousRows).keys()) {
    if (!aliases.has(key)) throw new Error(`Publication would remove existing work: ${key}`);
  }
  return indexed;
}

export async function publishCatalog(rows, previousRows, destination, { preservePrevious = false } = {}) {
  const indexed = validatePublicationIdentities(rows, previousRows);
  const names = new Set();
  for (const row of rows) for (const column of Object.keys(row)) names.add(column);
  const columns = [...names];
  const columnData = columns.map(name => {
    const data = rows.map(row => row[name] ?? null);
    const types = new Set(data.filter(value => value !== null).map(value => typeof value));
    if (types.size > 1) throw new Error(`Mixed catalog column types: ${name}`);
    const kind = [...types][0] || "string";
    const type = { string: "STRING", number: "DOUBLE", bigint: "INT64", boolean: "BOOLEAN" }[kind];
    if (!type || (kind === "number" && data.some(value => value !== null && !Number.isFinite(value)))) throw new Error(`Invalid catalog column: ${name}`);
    return { name, data, type };
  });
  const temporary = destination + ".tmp";
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  try {
    parquetWriteFile({ filename: temporary, columnData });
    const buffer = fs.readFileSync(temporary);
    const decoded = await new Promise((resolve, reject) => {
      parquetRead({ file: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), compressors, rowFormat: "object", onComplete: resolve }).catch(reject);
    });
    const readBack = indexRows(decoded);
    if (readBack.size !== indexed.size) throw new Error("Catalog readback count mismatch");
    for (const [key, expected] of indexed) {
      const actual = readBack.get(key);
      for (const column of columns) {
        if ((actual?.[column] ?? null) !== (expected[column] ?? null)) throw new Error(`Catalog readback mismatch: ${key}/${column}`);
      }
    }
    if (!preservePrevious && fs.existsSync(destination)) fs.copyFileSync(destination, destination + ".previous");
    fs.renameSync(temporary, destination);
    return { rows: rows.length, columns: columns.length, bytes: fs.statSync(destination).size };
  } catch (error) {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}
