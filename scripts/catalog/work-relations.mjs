import { resolveExternalReference } from "./source-redirects.mjs";
import { externalKey } from "./external-identity.mjs";
import { mangaBakaRelation } from "./mangabaka-relations.mjs";

const UNIVERSE = new Set(["prequel", "sequel", "parent_story", "side_story", "full_story", "adaptation", "alternative", "alternative_version", "alternative_setting", "spin_off", "summary", "compilation"]);
const TYPED_SOURCES = ["myanimelist", "mal", "jikan", "kitsu", "mangabaka"];
const KNOWN_RELATIONS = new Set([...UNIVERSE, "other", "character", "characters", "crossover", "parody"]);
const CONTINUITY = new Set(["prequel", "sequel", "parent_story", "side_story", "full_story", "summary", "compilation"]);
function graph(ids) {
  const parents = new Map(ids.map(id => [id, id]));
  const root = id => { let next = id; while (parents.get(next) !== next) next = parents.get(next); while (id !== next) { const old = parents.get(id); parents.set(id, next); id = old; } return next; };
  return { root, join(a, b) { const x = root(a), y = root(b); if (x !== y) parents.set(x < y ? y : x, x < y ? x : y); } };
}

export function resolveWorkRelations(rows, registry, { onPending = () => {} } = {}) {
  const byId = new Map(rows.map(row => [row.work_id, row])), universes = graph([...byId.keys()]), continuities = graph([...byId.keys()]);
  const report = { resolved: 0, pending: 0, invalid: 0, unknown: 0, other: 0, conflicts: 0 };
  for (const row of rows) {
    const stored = JSON.parse(row.source_relations_json || "[]");
    const raw = Array.isArray(stored) ? stored.map(edge => edge.source === "mangabaka" && edge.raw ? mangaBakaRelation(edge.raw) : edge) : stored;
    if (!Array.isArray(raw)) throw new Error("Invalid raw work relations");
    const types = new Map();
    for (const edge of raw) {
      if (!edge.target || !TYPED_SOURCES.includes(edge.source)) continue;
      try {
        const { key } = resolveExternalReference(registry, edge.target);
        if (!types.has(key)) types.set(key, new Set());
        types.get(key).add(edge.relation_type || "unknown");
      } catch { /* Invalid references are counted in the validation loop. */ }
    }
    const edges = [];
    for (const edge of raw) {
      const relation = String(edge.relation_type || "unknown"), unknownType = !KNOWN_RELATIONS.has(relation);
      if (unknownType) report.unknown++;
      if (relation === "other") report.other++;
      if (!edge.target) { if (!unknownType) report.unknown++; continue; }
      let key;
      try { key = externalKey(edge.target); } catch { report.invalid++; continue; }
      let target;
      try { const resolved = resolveExternalReference(registry, key); target = resolved.work_id; key = resolved.key; }
      catch { report.conflicts++; report.pending++; onPending({ from_work_id: row.work_id, reference: edge.target, source: edge.source, relation_type: relation, reason: "source-redirect-conflict" }); continue; }
      if (!target || !byId.has(target)) { report.pending++; onPending({ from_work_id: row.work_id, reference: edge.target, source: edge.source, relation_type: relation }); continue; }
      if (target === row.work_id) { report.invalid++; continue; }
      edges.push({ target_work_id: target, relation_type: relation, source: edge.source || "unknown" });
      report.resolved++;
      // Untyped snapshot references and crossovers do not establish a universe.
      if (!TYPED_SOURCES.includes(edge.source)) continue;
      if (types.get(key)?.size > 1) { report.conflicts++; continue; }
      if (UNIVERSE.has(relation)) universes.join(row.work_id, target);
      if (CONTINUITY.has(relation) && row.entity_type === byId.get(target).entity_type) continuities.join(row.work_id, target);
    }
    row.relations_v2_json = JSON.stringify([...new Map(edges.map(edge => [JSON.stringify(edge), edge])).values()]);
  }
  for (const row of rows) {
    row.universe_component_key = universes.root(row.work_id);
    row.continuity_root_work_id = continuities.root(row.work_id);
    delete row.universe_v2_id; delete row.continuity_id;
  }
  return report;
}
