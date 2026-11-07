import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sourceHttpError } from "./source-http-error.mjs";
import { createMalClient } from "./mal-client.mjs";

test("Retry-After accepts both seconds and HTTP dates without shortening the provider pause", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  assert.equal(sourceHttpError(new Response(null, { status: 429, headers: { "retry-after": "3600" } }), "source", now).retryAt, now + 3600000);
  assert.equal(sourceHttpError(new Response(null, { status: 503, headers: { "retry-after": "Wed, 21 Oct 2026 14:00:00 GMT" } }), "source", now).retryAt, now + 7200000);
});

test("a long MAL pause persists across clients and prevents further network requests", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-cooldown-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  let calls = 0, instant = Date.parse("2026-10-21T12:00:00Z");
  const options = { cooldownFile: path.join(directory, "cooldown.json"), now: () => instant, pause: async () => {}, request: async () => {
    calls++;
    return new Response(null, { status: 429, headers: { "retry-after": "7200" } });
  } };
  const endpoint = "https://api.myanimelist.net/v2/anime/11757";
  await assert.rejects(createMalClient("fixture", options)(endpoint), error => error.status === 429 && error.retryAt === instant + 7200000);
  await assert.rejects(createMalClient("fixture", options)(endpoint), /temporarily paused/);
  assert.equal(calls, 1);
  instant += 7200001;
  await assert.rejects(createMalClient("fixture", options)(endpoint), /HTTP 429/);
  assert.equal(calls, 2);
});
