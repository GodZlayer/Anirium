import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJson } from "./mal-detail-cache.mjs";
import { sourceReadiness } from "./source-readiness.mjs";

function processStart(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19] || null;
  } catch { return null; }
}
export function captureCatalogRuntime() {
  return { hostname: os.hostname(), pid: process.pid, processStart: processStart(process.pid) };
}
export function observeCatalogRuntime(runtime, { hostname = os.hostname(), start = processStart, alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } } } = {}) {
  if (!runtime || runtime.hostname !== hostname || !Number.isSafeInteger(runtime.pid) || runtime.pid < 1) return "not-observed";
  if (!alive(runtime.pid)) return "stopped";
  const current = start(runtime.pid);
  if (runtime.processStart && current) return runtime.processStart === current ? "running" : "stopped";
  return "alive-unverified";
}
export function catalogRuntimeStatus(output, { publishedDirectory = path.resolve("public/data"), privateDirectory = path.resolve("storage/app/catalog/published"), now = Date.now } = {}) {
  const candidate = readJson(path.join(output, "data/catalog.manifest.json")), automation = readJson(path.join(output, "automation.json"));
  const checkpoint = readJson(path.join(output, "progress.json")), report = readJson(path.join(output, "report.json"));
  const published = readJson(path.join(publishedDirectory, "catalog.manifest.json"));
  const observation = observeCatalogRuntime(automation?.runtime);
  const running = automation?.state === "running";
  const currentCheckpoint = !running || (Number.isFinite(Date.parse(automation?.startedAt)) && Number.isFinite(Date.parse(checkpoint?.observedAt))
    && Date.parse(checkpoint.observedAt) >= Date.parse(automation.startedAt)) ? checkpoint : null;
  const state = running ? observation === "running" ? "running" : observation === "stopped" ? "interrupted" : "run-unverified" : automation?.state || "not-run";
  const audit = published && /^[a-f0-9-]{36}$/.test(published.generation) ? readJson(path.join(privateDirectory, "audits", published.generation + ".json")) : null;
  const publishedAge = now() - Date.parse(published?.publishedAt);
  const coverage = Object.fromEntries(Object.entries(report?.enrichment?.report || {}).map(([media, value]) => [media,
    Object.fromEntries(["total", "fresh", "stale", "missing", "pending", "attempted", "updated", "discoveredReferences", "deferredCrossMedia", "checkedAt", "complete", "sourceError"].filter(key => value[key] !== undefined).map(key => [key, value[key]]))]));
  return { state, observation, catalogComplete: false, output, checkpoint: currentCheckpoint, lastRun: automation,
    candidate: candidate ? { generation: candidate.generation, works: candidate.works, publishedAt: candidate.publishedAt } : null,
    published: published ? { generation: published.generation, works: published.works, publishedAt: published.publishedAt,
      overdue: Number.isFinite(publishedAge) && publishedAge > 5 * 3600000,
      lastAudit: audit?.generation === published.generation && audit.revision === published.revision ? { checkedAt: audit.checkedAt, state: "passed-at-publication" } : null } : null,
    coverage, sources: report?.availability || null, sourceReadiness: sourceReadiness(report), discovery: report?.discovery || null, assets: report?.assets || null };
}
