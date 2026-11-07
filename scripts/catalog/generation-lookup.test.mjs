import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parquetRead } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { createCatalogGenerationClient } from "../../resources/js/lib/catalogGenerationClient.mjs";
import { publishGeneration } from "./publish-generation.mjs";
import { assignIdentity } from "./assign-identities.mjs";
import { emptyRegistry } from "./work-registry.mjs";

test("indexed work resolution avoids downloading the global alias document", async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, "anirium-lookup-"));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(directory)), parent); fs.rmSync(directory, { recursive: true }); });
  const row = assignIdentity({ mal_id: 11757, title: "Sword Art Online" }, emptyRegistry());
  const manifest = await publishGeneration([row], [], directory, { indexDirectory: path.join(directory, "indexes") });
  const client = createCatalogGenerationClient({ request: async url => {
    assert.ok(!url.endsWith("lookup.json"), "large global lookup must stay on the server");
    return new Response(fs.readFileSync(path.join(directory, url.slice(6))));
  }, resolveReference: async reference => {
    assert.equal(reference, "11757");
    return { generation: manifest.generation, work_id: row.work_id, url: manifest.files[0].url };
  }, decode: bytes => new Promise((resolve, reject) => parquetRead({ file: bytes, compressors, rowFormat: "object", onComplete: resolve }).catch(reject)) });
  assert.equal((await client.resolve("11757")).title, row.title);
});
