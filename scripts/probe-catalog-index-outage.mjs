import fs from "node:fs";
import path from "node:path";
import { WORK_UUID } from "../resources/js/lib/catalogAliases.mjs";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";
import { digestFile } from "./catalog/download-snapshot.mjs";

const action = process.argv[2], root = fs.realpathSync("storage/app/catalog/recovery-refresh-verification");
if (!["disable", "restore"].includes(action) || path.dirname(root) !== fs.realpathSync("storage/app/catalog")) throw new Error("Only the isolated recovery probe can be changed");
const restoreSeconds = Number(process.argv.find(arg => arg.startsWith("--restore-after="))?.slice(16) || 120);
if (!Number.isSafeInteger(restoreSeconds) || restoreSeconds < 30 || restoreSeconds > 600) throw new Error("Invalid automatic restoration deadline");
const manifest = readJson(path.join(root, "data/catalog.manifest.json")), receipt = readJson(path.join(root, "probe.json"));
if (!WORK_UUID.test(manifest?.generation || "") || receipt?.phase !== "updated" || manifest.generation !== receipt.generation) throw new Error("Expected audited recovery candidate");
const file = path.join(root, "indexes", `${manifest.generation}.sqlite`), offline = file + ".offline-probe";
if (fs.realpathSync(path.dirname(file)) !== path.join(root, "indexes")) throw new Error("Index directory must remain inside the isolated candidate");
const source = action === "disable" ? file : offline, destination = action === "disable" ? offline : file;
if (!fs.existsSync(source) || fs.existsSync(destination)) throw new Error("Unexpected index availability; refusing overwrite");
if (await digestFile(source) !== manifest.search.sha256) throw new Error("Index integrity changed");
fs.renameSync(source, destination);
const proof = { checkedAt: new Date().toISOString(), generation: manifest.generation, state: action === "disable" ? "unavailable" : "available", sha256: manifest.search.sha256,
  ...(action === "disable" ? { autoRestoreAt: new Date(Date.now() + restoreSeconds * 1000).toISOString() } : {}), publicCatalogModified: false };
writeJson(path.join(root, `index-${action}.json`), proof);
console.log(JSON.stringify(proof));
if (action === "disable") {
  await new Promise(resolve => setTimeout(resolve, restoreSeconds * 1000));
  if (fs.existsSync(offline)) {
    if (fs.existsSync(file) || await digestFile(offline) !== manifest.search.sha256) throw new Error("Unexpected recovery state; refusing overwrite");
    fs.renameSync(offline, file);
  }
  if (await digestFile(file) !== manifest.search.sha256) throw new Error("Restored index integrity mismatch");
  const restored = { checkedAt: new Date().toISOString(), generation: manifest.generation, state: "available", automatic: true, sha256: manifest.search.sha256, publicCatalogModified: false };
  writeJson(path.join(root, "index-restore.json"), restored); console.log(JSON.stringify(restored));
}
