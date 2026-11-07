import fs from "node:fs";
import path from "node:path";

export function createJsonlSink(file, { batchSize = 1000 } = {}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error("Invalid report batch size");
  let pending = [];
  const flush = () => {
    if (!pending.length) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, pending.join("\n") + "\n"); pending = [];
  };
  return { add(value) { pending.push(JSON.stringify(value)); if (pending.length >= batchSize) flush(); }, flush };
}
