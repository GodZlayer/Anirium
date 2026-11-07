import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { downloadSnapshot } from "./download-snapshot.mjs";

test("snapshot download resumes a verified partial range and refuses corrupted bytes", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-download-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const destination = path.join(directory, "snapshot.gz"), url = "https://fixture.test/snapshot.gz", content = "complete snapshot bytes";
  const expected = createHash("sha1").update(content).digest("hex");
  fs.writeFileSync(destination + ".partial", content.slice(0, 5));
  fs.writeFileSync(destination + ".partial.json", JSON.stringify({ url, expected, etag: '"fixture"' }));
  const options = { destination, url, checksumUrl: url + ".sha1", request: async (target, config) => {
    if (target.endsWith(".sha1")) return new Response(expected + " snapshot.gz");
    assert.equal(config.headers.Range, "bytes=5-");
    return new Response(content.slice(5), { status: 206, headers: { "content-range": `bytes 5-${content.length - 1}/${content.length}` } });
  } };
  const result = await downloadSnapshot(options);
  assert.equal(fs.readFileSync(destination, "utf8"), content);
  assert.equal(result.expected, expected);
  fs.unlinkSync(destination + ".source.json");
  const recovered = await downloadSnapshot({ ...options, request: async target => {
    assert.ok(target.endsWith(".sha1"), "valid local snapshot must not be downloaded again");
    return new Response(expected);
  } });
  assert.equal(recovered.provenanceRecovered, true);
  assert.equal(recovered.sourceUpdatedAt, null);
  assert.equal(fs.existsSync(destination + ".partial"), false);
  fs.writeFileSync(destination, "invalid existing file");
  await assert.rejects(downloadSnapshot({ ...options, request: async target => new Response(target.endsWith(".sha1") ? expected : "corrupted new bytes") }), /checksum mismatch/);
  assert.equal(fs.readFileSync(destination, "utf8"), "invalid existing file");
});
