import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readJson, writeJson } from "./mal-detail-cache.mjs";
import { sourceHttpError } from "./source-http-error.mjs";

export async function digestFile(file, algorithm = "sha256") {
  const hash = createHash(algorithm);
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function downloadSnapshot({ url, checksumUrl, publishedChecksum, destination, algorithm = "sha1", request = fetch }) {
  if (!["sha1", "sha256"].includes(algorithm)) throw new Error("Unsupported snapshot checksum algorithm");
  let expected = publishedChecksum;
  if (!expected) {
    const checksumResponse = await request(checksumUrl, { signal: AbortSignal.timeout(25000) });
    if (!checksumResponse.ok) throw sourceHttpError(checksumResponse, "Snapshot checksum");
    expected = (await checksumResponse.text()).trim().split(/\s+/)[0];
  }
  if (!new RegExp(`^[a-f0-9]{${algorithm === "sha1" ? 40 : 64}}$`).test(expected)) throw new Error("Invalid published checksum");
  if (fs.existsSync(destination) && await digestFile(destination, algorithm) === expected) {
    const stored = readJson(destination + ".source.json");
    const digest = "sha256:" + await digestFile(destination);
    if (stored?.digest === digest && stored.url === url && stored.expected === expected) return stored;
    const recovered = { url, checksumUrl, algorithm, expected, digest, bytes: fs.statSync(destination).size,
      importedAt: new Date().toISOString(), sourceUpdatedAt: null, provenanceRecovered: true };
    writeJson(destination + ".source.json", recovered);
    return recovered;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const partial = destination + ".partial", stateFile = partial + ".json", state = readJson(stateFile);
  let offset = fs.existsSync(partial) && state?.expected === expected && state?.url === url ? fs.statSync(partial).size : 0;
  const headers = offset ? { Range: `bytes=${offset}-`, ...(state.etag ? { "If-Range": state.etag } : {}) } : {};
  const response = await request(url, { headers, signal: AbortSignal.timeout(30 * 60000) });
  if (!response.ok) throw sourceHttpError(response, "Snapshot download");
  if (offset && response.status !== 206) offset = 0;
  if (offset && !response.headers.get("content-range")?.startsWith(`bytes ${offset}-`)) throw new Error("Invalid resumed snapshot range");
  writeJson(stateFile, { url, expected, etag: response.headers.get("etag") });
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: offset ? "a" : "w" }));
  if (await digestFile(partial, algorithm) !== expected) throw new Error("Downloaded snapshot checksum mismatch");
  const provenance = { url, checksumUrl, algorithm, expected, digest: "sha256:" + await digestFile(partial, "sha256"),
    importedAt: new Date().toISOString(), bytes: fs.statSync(partial).size, sourceUpdatedAt: response.headers.get("last-modified") };
  fs.renameSync(partial, destination); writeJson(destination + ".source.json", provenance);
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  return provenance;
}
