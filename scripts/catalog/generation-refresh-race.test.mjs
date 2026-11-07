import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createCatalogGenerationClient } from "../../resources/js/lib/catalogGenerationClient.mjs";

function manifest(generation = randomUUID(), marker = "a") {
  const files = [{ media: "anime", url: `/data/catalog/v2/${generation}/anime-00000.parquet`, sha256: marker.repeat(64), rows: 1 }];
  const lookup = { url: `/data/catalog/v2/${generation}/lookup.json`, sha256: "c".repeat(64) };
  return { schema: 2, generation, works: 1, files, lookup, revision: createHash("sha256").update(JSON.stringify({ files, lookup })).digest("hex") };
}

test("a late older refresh cannot replace the newer validated generation or duplicate its change notification", async () => {
  const initial = manifest(), older = manifest(), newer = manifest(), releases = [], changed = [];
  let first = true;
  const client = createCatalogGenerationClient({ request: async () => first ? (first = false, Response.json(initial)) : new Promise(resolve => releases.push(resolve)), onChange: value => changed.push(value.generation) });
  await client.refresh();
  const late = client.refresh(), fast = client.refresh();
  releases[1](Response.json(newer)); await fast;
  releases[0](Response.json(older)); assert.equal((await late).generation, newer.generation);
  assert.equal(client.revision(), newer.revision); assert.deepEqual(changed, [newer.generation]);
  const rollback = client.refresh(); releases[2](Response.json(initial)); await rollback;
  assert.equal(client.revision(), initial.revision); assert.deepEqual(changed, [newer.generation, initial.generation]);
});

test("a newer failed refresh does not invalidate an older valid in-flight response", async () => {
  const valid = manifest(), releases = [];
  const client = createCatalogGenerationClient({ request: () => new Promise(resolve => releases.push(resolve)) });
  const oldRequest = client.refresh(), failed = client.refresh();
  releases[1](new Response(null, { status: 503 })); await assert.rejects(failed, /503/);
  releases[0](Response.json(valid)); await oldRequest;
  assert.equal(client.revision(), valid.revision);
});

test("a valid manifest cannot silently change the contents of an immutable generation", async () => {
  const original = manifest(), altered = manifest(original.generation, "b"); let next = original;
  const client = createCatalogGenerationClient({ request: async () => Response.json(next) });
  await client.refresh(); next = altered;
  await assert.rejects(client.refresh(), /Immutable/); assert.equal(client.revision(), original.revision);
});

test("a late old partition cannot evict the current generation cache or mix a pinned page", async () => {
  const work_id = randomUUID(), payload = title => JSON.stringify([{ work_id, mal_id: 42, entity_type: "WORK", title }]);
  const oldBytes = payload("Old"), newBytes = payload("New"), oldManifest = manifest(), newManifest = manifest();
  for (const [value, bytes] of [[oldManifest, oldBytes], [newManifest, newBytes]]) {
    value.files[0].sha256 = createHash("sha256").update(bytes).digest("hex");
    value.revision = createHash("sha256").update(JSON.stringify({ files: value.files, lookup: value.lookup })).digest("hex");
  }
  let next = oldManifest, releaseOld, enteredOld;
  const waiting = new Promise(resolve => { releaseOld = resolve; }), entered = new Promise(resolve => { enteredOld = resolve; }), calls = [];
  const client = createCatalogGenerationClient({ request: async url => {
    calls.push(url);
    return url.endsWith("manifest.json") ? Response.json(next) : new Response(url === oldManifest.files[0].url ? oldBytes : newBytes);
  }, decode: async bytes => {
    const rows = JSON.parse(new TextDecoder().decode(bytes));
    if (rows[0].title === "Old") { enteredOld(); await waiting; }
    return rows;
  } });
  await client.refresh(); const oldPage = client.page("anime"); await entered;
  next = newManifest; await client.refresh();
  assert.equal((await client.page("anime")).items[0].title, "New");
  releaseOld(); assert.equal((await oldPage).generation, oldManifest.generation);
  assert.equal((await client.page("anime")).items[0].title, "New");
  assert.equal(calls.filter(url => url === newManifest.files[0].url).length, 1);
});
