import fs from "node:fs";
import path from "node:path";

const base = new URL(process.argv.find(value => value.startsWith("--url="))?.slice(6) || "http://localhost:8080");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || !["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Use a local Anirium URL without credentials");
const proof = { observedAt: new Date().toISOString(), base: base.origin, guest: true, publicCatalogModified: false, checks: {}, requests: [] };
let activeRoute = null;
async function get(route, expected = 200) {
  activeRoute = route;
  const started = performance.now();
  const response = await fetch(new URL(route, base.origin), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(25000), redirect: "manual" });
  const observation = { route, status: response.status, expected };
  proof.requests.push(observation);
  if (response.status !== expected) throw Object.assign(new Error("Unexpected response"), { status: response.status });
  const data = await response.json();
  observation.milliseconds = Math.round(performance.now() - started);
  activeRoute = null;
  return data;
}
try {
  const first = await get("/api/catalog/search?media=anime&page=1"), second = await get("/api/catalog/search?media=anime&page=2");
  if (!Array.isArray(first.items) || !Array.isArray(second.items)) throw new Error("Invalid search response");
  const ids = new Set(first.items.map(work => work.work_id));
  proof.generation = first.generation;
  proof.checks.pagination = first.page === 1 && second.page === 2 && first.items.length > 0 && second.items.length > 0
    && ids.size === first.items.length && new Set(second.items.map(work => work.work_id)).size === second.items.length
    && !second.items.some(work => ids.has(work.work_id));
  proof.checks.sameGeneration = first.generation === second.generation;
  proof.checks.animeOnly = [...first.items, ...second.items].every(work => work.entity_type === "WORK");
  const empty = await get("/api/catalog/search?media=anime&q=zzzzaniriumsemresultado902341");
  proof.checks.emptySearch = empty.total === 0 && empty.items.length === 0;
  const filtered = await get("/api/catalog/search?media=anime&q=Sword%20Art&status=finished&format=TV&sort=year&facets=1");
  proof.checks.combinedFilters = filtered.items.length > 0 && filtered.items.every(work => work.format === "TV" && ["COMPLETED", "FINISHED", "FINISHED_AIRING"].includes(work.status));
  proof.checks.yearOrder = filtered.items.every((work, index, items) => !index || (items[index - 1].year ?? -Infinity) >= (work.year ?? -Infinity));
  proof.checks.facets = Array.isArray(filtered.facets?.formats) && filtered.facets.formats.every(value => typeof value === "string")
    && Array.isArray(filtered.facets?.genres) && filtered.facets.genres.every(value => typeof value === "string");
  await get("/api/catalog/search?sort=score%20DESC", 422);
  proof.checks.invalidSortRejected = true;
  const work = await get("/api/catalog/work/21881");
  const alias = await get("/api/catalog/work/" + encodeURIComponent("work:" + work.work_id));
  proof.checks.permanentAlias = Boolean(work.work_id) && work.work_id === alias.work_id && work.url === alias.url;
  await get("/api/catalog/work/2147483647", 404);
  proof.checks.missingWork = true;
  for (const route of ["/api/account/library?view=bookmarks", "/api/addons", "/api/service/session"]) await get(route, 401);
  proof.checks.privateAccessDenied = true;
} catch (error) {
  proof.failure = { kind: error.name === "TimeoutError" ? "timeout" : "request-or-assertion-failed", status: error.status || null, route: activeRoute };
}
proof.passed = !proof.failure && Object.values(proof.checks).every(value => value === true);
const output = path.resolve("storage/app/catalog/probes/tier-zero/backend.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof));
if (!proof.passed) process.exitCode = 1;
