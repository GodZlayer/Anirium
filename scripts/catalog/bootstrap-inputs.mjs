import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./mal-detail-cache.mjs";

export function ensureBootstrapInputs(output, { registryWorks, retainedWorks, now = Date.now } = {}) {
  if (![registryWorks, retainedWorks].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("Invalid bootstrap input counts");
  const file = path.join(output, "bootstrap-inputs.json"), sourceDirectory = path.resolve(output, "sources");
  if (fs.existsSync(file)) {
    const original = readJson(file);
    if (!original || ![undefined, 1].includes(original.schema) || original.registryWorks !== 0 || original.retainedWorks !== 0 || original.legacyImported !== false
      || typeof original.sourceCachePreexisting !== "boolean" || typeof original.observedAt !== "string" || !Number.isFinite(Date.parse(original.observedAt))
      || typeof original.sourceDirectory !== "string" || !path.isAbsolute(original.sourceDirectory) || path.resolve(original.sourceDirectory) !== sourceDirectory) {
      throw new Error("Invalid original empty-bootstrap evidence; refusing to relabel existing data");
    }
    return { resumed: true, original };
  }
  if (registryWorks || retainedWorks) throw new Error("Bootstrap requires empty storage or valid evidence of its original empty start; use sync for existing data");
  const original = { schema: 1, observedAt: new Date(now()).toISOString(), registryWorks: 0, retainedWorks: 0,
    legacyImported: false, sourceDirectory, sourceCachePreexisting: fs.existsSync(sourceDirectory) };
  writeJson(file, original);
  return { resumed: false, original };
}
