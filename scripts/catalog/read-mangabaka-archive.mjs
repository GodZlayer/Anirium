import { spawn } from "node:child_process";
import { once } from "node:events";
import { jsonRecordStream } from "./json-record-stream.mjs";

export async function* readMangaBakaArchive(file, { onNormalization = () => {} } = {}) {
  const listing = spawn("tar", ["-tzf", file], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let names = "", error = "";
  listing.stdout.setEncoding("utf8"); listing.stderr.setEncoding("utf8");
  listing.stdout.on("data", chunk => { names += chunk; }); listing.stderr.on("data", chunk => { error += chunk; });
  const [listed] = await once(listing, "close");
  if (listed !== 0) throw new Error(`Snapshot archive listing failed: ${error.slice(0, 200)}`);
  const entries = names.split(/\r?\n/).filter(name => name.endsWith(".jsonl"));
  if (entries.length !== 1) throw new Error("Expected exactly one JSONL dataset in archive");
  if (!/^(?:\.\/)?[A-Za-z0-9][A-Za-z0-9_./-]*\.jsonl$/.test(entries[0])) throw new Error("Invalid archive dataset member");
  const reader = spawn("tar", ["-xzOf", file, "--", entries[0]], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let stderr = "";
  reader.stderr.setEncoding("utf8"); reader.stderr.on("data", chunk => { stderr += chunk; });
  const completion = once(reader, "close");
  reader.stdout.setEncoding("utf8");
  try {
    for await (const { value, normalizedControls } of jsonRecordStream(reader.stdout)) {
      if (normalizedControls) onNormalization({ id: value.id, normalizedControls });
      yield value;
    }
    const [code] = await completion;
    if (code !== 0) throw new Error(`Snapshot archive read failed: ${stderr.slice(0, 200)}`);
  } finally { if (reader.exitCode === null) reader.kill(); }
}
