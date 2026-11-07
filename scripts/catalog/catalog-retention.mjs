import fs from "node:fs";
import path from "node:path";
import { readJson } from "./mal-detail-cache.mjs";
import { WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";

function removeOwned(root, file, recursive = false) {
  const parent = fs.realpathSync(root), target = path.resolve(file);
  if (!target.startsWith(parent + path.sep) || fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== target) throw new Error("Unsafe catalog retention path");
  fs.rmSync(target, { recursive });
}
export function pruneCatalogGenerations(dataDirectory, { indexDirectory, registryDirectory, extraGenerations = 1 } = {}) {
  const manifest = readJson(path.join(dataDirectory, "catalog.manifest.json"));
  if (manifest?.schema !== 2 || !WORK_UUID.test(manifest.generation)) return { removed: [] };
  const root = path.resolve(dataDirectory, "catalog/v2"), previous = readJson(path.join(dataDirectory, "catalog.manifest.json.previous"));
  const protectedIds = new Set([manifest.generation, previous?.generation].filter(id => WORK_UUID.test(id || "")));
  const owned = folder => fs.readdirSync(folder, { withFileTypes: true }).every(file => file.isFile() && /^(?:(?:anime|manga|novel)-\d{5}\.parquet(?:\.previous)?|lookup\.json)$/.test(file.name));
  const entries = fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && WORK_UUID.test(entry.name))
    .map(entry => ({ name: entry.name, time: fs.statSync(path.join(root, entry.name)).mtimeMs, owned: owned(path.join(root, entry.name)) })).sort((a, b) => b.time - a.time);
  for (const entry of entries.filter(entry => entry.owned && !protectedIds.has(entry.name)).slice(0, extraGenerations)) protectedIds.add(entry.name);
  const removed = [];
  for (const entry of entries) {
    if (!entry.owned || protectedIds.has(entry.name)) continue;
    const directory = path.join(root, entry.name);
    if (fs.readdirSync(directory, { withFileTypes: true }).some(file => !file.isFile() || !/^(?:(?:anime|manga|novel)-\d{5}\.parquet(?:\.previous)?|lookup\.json)$/.test(file.name))) continue;
    removeOwned(root, directory, true);
    for (const [folder, suffix] of [[indexDirectory, ".sqlite"], [registryDirectory, ".json"]]) {
      if (folder && fs.existsSync(path.join(folder, entry.name + suffix))) removeOwned(folder, path.join(folder, entry.name + suffix));
    }
    removed.push(entry.name);
  }
  return { removed, protected: [...protectedIds] };
}
export function pruneImportCheckpoints(directory) {
  const current = readJson(path.join(directory, "import-checkpoint.json"))?.name;
  const files = fs.readdirSync(directory).filter(name => /^import-[a-f0-9-]{36}\.jsonl$/.test(name))
    .sort((a, b) => fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs);
  const keep = new Set([current, ...files.slice(0, 2)]), removed = [];
  for (const file of files) if (!keep.has(file)) { removeOwned(directory, path.join(directory, file)); removed.push(file); }
  return { removed };
}
