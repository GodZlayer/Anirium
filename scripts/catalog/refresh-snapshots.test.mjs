import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { refreshSnapshots } from "./refresh-snapshots.mjs";

test("snapshot sources refresh independently and a cached version retains its original observation time", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-sources-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const content = "fixture archive", checksum = createHash("sha1").update(content).digest("hex");
  let calls = 0;
  const request = async url => {
    calls++;
    if (url.includes("github")) return new Response("maintenance", { status: 503 });
    return new Response(url.endsWith(".sha1") ? checksum : content, { headers: { "last-modified": "Mon, 19 Oct 2026 00:00:00 GMT" } });
  };
  const now = Date.parse("2026-10-21T00:00:00Z");
  const first = await refreshSnapshots(directory, { request, now: () => now });
  assert.equal(first.anime.state, "unavailable");
  assert.equal(first.publications.state, "available");
  calls = 0;
  const next = await refreshSnapshots(directory, { request, now: () => now + 3600000 });
  assert.equal(calls, 1);
  assert.equal(next.publications.provenance.sourceUpdatedAt, "Mon, 19 Oct 2026 00:00:00 GMT");
  assert.equal(next.publications.checkedAt, first.publications.checkedAt);
  const failure = await refreshSnapshots(directory, { request: async () => { throw new Error("offline"); }, now: () => now + 86400000 });
  assert.equal(failure.publications.state, "unavailable");
  assert.equal(failure.publications.lastGood, first.publications.checkedAt);
  assert.equal(failure.publications.provenance.digest, first.publications.provenance.digest);
});
