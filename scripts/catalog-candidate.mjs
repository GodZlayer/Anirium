import { captureCatalogRuntime, catalogRuntimeStatus } from "./catalog/catalog-runtime-status.mjs";
import { pruneCatalogGenerations, pruneImportCheckpoints } from "./catalog/catalog-retention.mjs";
import { rollbackPublication } from "./catalog/rollback-publication.mjs";
import { readJson, writeJson } from "./catalog/mal-detail-cache.mjs";
import { promoteCandidate } from "./catalog/promote-candidate.mjs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { auditGeneration } from "./catalog/audit-generation.mjs";
import { loadRegistry } from "./catalog/registry-store.mjs";
import { refreshSnapshots } from "./catalog/refresh-snapshots.mjs";

const [action, ...args] = process.argv.slice(2);
const output = path.resolve(args.find(arg => arg.startsWith("--output="))?.slice(9) || "storage/app/catalog/unified-candidate");
if (["bootstrap", "sync", "auto", "repair"].includes(action)) {
  // Validate SQL authority before any provider request or snapshot mutation.
  loadRegistry(path.join(output, "registry.json"));
  const automationFile = path.join(output, "automation.json"), startedAt = new Date().toISOString(), runtime = captureCatalogRuntime();
  writeJson(automationFile, { action, state: "running", startedAt, runtime });
  writeJson(path.join(output, "progress.json"), { action, phase: action === "repair" ? "preparing-repair" : "refreshing-snapshots", observedAt: startedAt });
  process.on("uncaughtExceptionMonitor", error => writeJson(automationFile, {
    action, state: "failed", startedAt, runtime, finishedAt: new Date().toISOString(), error: error.message,
  }));
  if (action !== "repair") console.log(JSON.stringify({ snapshots: await refreshSnapshots(path.resolve("storage/app/catalog/snapshots")) }));
  const heap = Number(process.env.CATALOG_HEAP_MB || 6144);
  if (!Number.isSafeInteger(heap) || heap < 1024 || heap > 16384) throw new Error("Invalid catalog heap budget");
  const child = spawn(process.execPath, [`--max-old-space-size=${heap}`, action === "repair" ? "scripts/migrate-catalog-candidate.mjs" : "scripts/build-unified-catalog.mjs", `--output=${output}`, ...(action === "bootstrap" ? ["--empty"] : [])], { stdio: "inherit", windowsHide: true });
  const [code] = await once(child, "exit");
  process.exitCode = code ?? 1;
  if (code !== 0) writeJson(automationFile, { action, state: "failed", startedAt, runtime, finishedAt: new Date().toISOString(), exitCode: code });
  if (code === 0) {
    const progress = detail => writeJson(path.join(output, "progress.json"), { action, ...detail, observedAt: new Date().toISOString() });
    progress({ phase: "loading-registry" });
    const { registry } = loadRegistry(path.join(output, "registry.json"));
    const auditReceipt = await auditGeneration(path.join(output, "data"), { registry, indexDirectory: path.join(output, "indexes"),
      onProgress: detail => progress({ phase: "auditing-candidate", ...detail }) });
    console.log(JSON.stringify(auditReceipt));
    if (["auto", "repair"].includes(action)) console.log(JSON.stringify(await promoteCandidate(output, {
      registry, auditReceipt, dataDirectory: path.resolve("public/data"), privateDirectory: path.resolve("storage/app/catalog/published"), onProgress: progress,
    })));
    progress({ phase: "retaining-generations" });
    const retention = {
      candidate: pruneCatalogGenerations(path.join(output, "data"), { indexDirectory: path.join(output, "indexes") }),
      checkpoints: pruneImportCheckpoints(output),
      ...(["auto", "repair"].includes(action) ? { published: pruneCatalogGenerations(path.resolve("public/data"), {
        indexDirectory: path.resolve("storage/app/catalog/published/indexes"), registryDirectory: path.resolve("storage/app/catalog/published/registries"),
      }) } : {}),
    };
    console.log(JSON.stringify({ retention }));
    progress({ phase: ["auto", "repair"].includes(action) ? "published" : "candidate-ready", generation: auditReceipt.generation, works: auditReceipt.works });
    writeJson(automationFile, { action, state: ["auto", "repair"].includes(action) ? "published" : "candidate-ready", startedAt, runtime,
      finishedAt: new Date().toISOString(), generation: readJson(path.join(output, "data/catalog.manifest.json"))?.generation });
  }
} else if (action === "rollback") {
  console.log(JSON.stringify(await rollbackPublication({ dataDirectory: path.resolve("public/data"), privateDirectory: path.resolve("storage/app/catalog/published") })));
} else if (action === "audit") {
  const { registry } = loadRegistry(path.join(output, "registry.json"));
  console.log(JSON.stringify(await auditGeneration(path.join(output, "data"), { registry, indexDirectory: path.join(output, "indexes") })));
} else if (action === "status") {
  console.log(JSON.stringify(catalogRuntimeStatus(output)));
} else throw new Error("Expected bootstrap, sync, auto, repair, audit, rollback or status");
