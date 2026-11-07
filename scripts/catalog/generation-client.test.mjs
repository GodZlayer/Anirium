import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parquetRead } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { createCatalogGenerationClient } from "../../resources/js/lib/catalogGenerationClient.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { publishGeneration } from "./publish-generation.mjs";
import { registryStorage } from "./sql-registry-test-fixture.mjs";
import { syncSqlWorkGraph } from "./sql-work-graph.mjs";

test("generation reader loads only the requested partition and resolves legacy and source-only identities", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-reader-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const registry = emptyRegistry(), rows = [
    assignIdentity({ mal_id: 11757, title: "Sword Art Online" }, registry),
    assignIdentity({ entity_type: "NOVEL", title: "Independent", external_ids_json: JSON.stringify([{ provider: "mangabaka", media: "manga", id: "12" }]) }, registry),
  ];
  const manifest = await publishGeneration(rows, [], directory);
  const requested = [];
  let corrupt = false;
  const client = createCatalogGenerationClient({ request: async url => {
    requested.push(url);
    return new Response(corrupt && url.endsWith(".parquet") ? "corrupted" : fs.readFileSync(path.join(directory, url.slice(6))));
  }, decode: bytes => new Promise((resolve, reject) => {
    parquetRead({ file: bytes, compressors, rowFormat: "object", onComplete: resolve }).catch(reject);
  }) });
  assert.equal((await client.page("anime")).items[0].title, "Sword Art Online");
  assert.equal(requested.filter(url => url.endsWith(".parquet")).length, 1);
  assert.equal(requested.includes(manifest.files.find(file => file.media === "novel").url), false);
  assert.equal((await client.resolve("11757")).work_id, rows[0].work_id);
  assert.equal((await client.resolve(`work:${rows[1].work_id}`)).title, "Independent");
  assert.equal(await client.resolve("__proto__"), null);
  await client.page("anime");
  corrupt = true;
  await assert.rejects(client.page("novel"), /checksum mismatch/);
});

test("the browser reads a real SQL-sealed publication and rejects a tampered authority declaration", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-sql-reader-"));
  t.after(() => fs.rmSync(directory, { recursive: true }));
  const storage = registryStorage(directory), registry = emptyRegistry();
  const rows = [assignIdentity({ title: "Canonical anime", mal_id: 41 }, registry)];
  storage.saveRegistry(path.join(directory, "registry.json"), registry);
  syncSqlWorkGraph(rows, registry, { database: storage.database });
  const manifest = await publishGeneration(rows, [], directory, { identityDatabase: storage.database });
  let next = manifest;
  const client = createCatalogGenerationClient({ request: async url => url.endsWith("manifest.json") ? Response.json(next) : new Response(fs.readFileSync(path.join(directory, url.slice(6)))),
    decode: bytes => new Promise((resolve, reject) => parquetRead({ file: bytes, compressors, rowFormat: "object", onComplete: resolve }).catch(reject)) });
  assert.equal((await client.page("anime")).items[0].work_id, rows[0].work_id);
  assert.equal(client.revision(), manifest.revision);
  next = { ...manifest, identities: { ...manifest.identities, authority: "json" } };
  await assert.rejects(client.refresh(), /identity authority/);
  next = { ...manifest, identities: undefined };
  await assert.rejects(client.refresh(), /revision/);
});
