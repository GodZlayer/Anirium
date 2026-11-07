import { WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";

export function readUniverseState(db) {
  const works=new Map(), universes=new Set(), memberships=new Map(), aliases=new Map();
  for (const row of db.prepare("SELECT w.id,w.format,w.status,w.episode_count,e.kind FROM catalog_works w JOIN catalog_entities e ON e.id=w.id").iterate()) {
    if (row.kind!=="work" || !WORK_UUID.test(row.id)) throw new Error("SQL work role mismatch");
    works.set(row.id,row);
  }
  for (const row of db.prepare("SELECT u.id,e.kind FROM catalog_universes u JOIN catalog_entities e ON e.id=u.id").iterate()) {
    if (row.kind!=="universe" || !WORK_UUID.test(row.id)) throw new Error("SQL universe role mismatch");
    universes.add(row.id);
  }
  for (const row of db.prepare("SELECT * FROM catalog_universe_works").iterate()) {
    if (!works.has(row.work_id) || !universes.has(row.universe_id)) throw new Error("Invalid SQL universe membership");
    if (!memberships.has(row.work_id)) memberships.set(row.work_id,new Set());
    memberships.get(row.work_id).add(row.universe_id);
  }
  for (const row of db.prepare("SELECT alias,entity_id FROM catalog_entity_aliases WHERE kind='universe'").iterate()) {
    if (!universes.has(row.entity_id)) throw new Error("Invalid SQL universe alias");
    aliases.set(row.alias,row.entity_id);
  }
  return {works,universes,memberships,aliases};
}
