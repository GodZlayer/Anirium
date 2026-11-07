import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { registryConnection } from "./catalog/sql-registry-connection.mjs";
import { adoptRegistryMetadata } from "./catalog/adopt-registry-metadata.mjs";
import { WORK_UUID } from "../resources/js/lib/catalogAliases.mjs";

const file=process.argv[2], generation=path.basename(file || "", ".json");
if (!WORK_UUID.test(generation)) throw new Error("A versioned legacy registry snapshot is required");
const db=registryConnection();
try {
  const state=db.prepare("SELECT records FROM catalog_identity_imports WHERE generation=? AND complete=1").get(generation);
  if (!state) throw new Error("Registry metadata adoption requires a completed SQL graph import");
  const bytes=fs.readFileSync(file), digest=createHash("sha256").update(bytes).digest("hex");
  const previous=db.prepare("SELECT * FROM catalog_registry_adoptions WHERE generation=?").get(generation);
  if (previous && previous.registry_sha256!==digest) throw new Error("Immutable legacy registry snapshot changed");
  const legacy=JSON.parse(bytes);
  if (Object.keys(legacy.works || {}).length!==state.records) throw new Error("Legacy snapshot differs from completed graph generation");
  const result=adoptRegistryMetadata(db,legacy);
  db.prepare("INSERT INTO catalog_registry_adoptions(generation,registry_sha256,works,redirects,created_at) VALUES(?,?,?,?,?) ON CONFLICT(generation) DO NOTHING")
    .run(generation,digest,result.works,result.redirects,new Date().toISOString());
  console.log(JSON.stringify(result));
} finally { db.close(); }
