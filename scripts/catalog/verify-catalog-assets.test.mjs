import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeAniZip } from "./anizip-record.mjs";
import { verifyCatalogAssets } from "./verify-catalog-assets.mjs";

test("publication automatically verifies local assets and rejects missing, modified or mismatched documents", t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "anirium-assets-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const row = { mal_id: 1, episodes: 1, entity_type: "WORK" };
  const document = normalizeAniZip({ mappings: { mal_id: 1 }, episodes: { "1": { title: { en: "Fixture" } } } }, row, new Date().toISOString());
  const content = JSON.stringify(document);
  const hash = createHash("sha256").update(content).digest("hex");
  row.episodes_metadata_url = `/data/episodes/anime/1/${hash}.json`;
  const file = path.join(directory, "episodes/anime/1", `${hash}.json`);
  assert.throws(() => verifyCatalogAssets([row], directory), /ENOENT/);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  assert.deepEqual(verifyCatalogAssets([row, { mal_id: 2 }], directory), { episodeDocuments: 1, indexedEpisodes: 1 });
  assert.throws(() => verifyCatalogAssets([{ ...row, mal_id: 2 }], directory), /Invalid episode document reference/);
  assert.throws(() => verifyCatalogAssets([{ ...row, episodes_metadata_url: "https://example.com/1.json" }], directory), /Invalid episode document reference/);
  fs.writeFileSync(file, content + " ");
  assert.throws(() => verifyCatalogAssets([row], directory), /checksum mismatch/);
});
