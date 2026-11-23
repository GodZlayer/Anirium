import { WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";
import { READ_PAGE_SIZE, forEachKeysetPage } from "./sql-registry-connection.mjs";

export function readUniverseState(db) {
  const works=new Map(), universes=new Set(), memberships=new Map(), aliases=new Map();
  forEachKeysetPage(
    db,
    `SELECT w.rowid AS _cursor,w.id,w.format,w.status,w.episode_count,e.kind FROM catalog_works w JOIN catalog_entities e ON e.id=w.id ORDER BY w.rowid LIMIT ${READ_PAGE_SIZE}`,
    `SELECT w.rowid AS _cursor,w.id,w.format,w.status,w.episode_count,e.kind FROM catalog_works w JOIN catalog_entities e ON e.id=w.id WHERE w.rowid>? ORDER BY w.rowid LIMIT ${READ_PAGE_SIZE}`,
    "_cursor",
    row => {
      if (row.kind!=="work" || !WORK_UUID.test(row.id)) throw new Error("SQL work role mismatch");
      works.set(row.id,row);
    }
  );
  forEachKeysetPage(
    db,
    `SELECT u.rowid AS _cursor,u.id,e.kind FROM catalog_universes u JOIN catalog_entities e ON e.id=u.id ORDER BY u.rowid LIMIT ${READ_PAGE_SIZE}`,
    `SELECT u.rowid AS _cursor,u.id,e.kind FROM catalog_universes u JOIN catalog_entities e ON e.id=u.id WHERE u.rowid>? ORDER BY u.rowid LIMIT ${READ_PAGE_SIZE}`,
    "_cursor",
    row => {
      if (row.kind!=="universe" || !WORK_UUID.test(row.id)) throw new Error("SQL universe role mismatch");
      universes.add(row.id);
    }
  );
  forEachKeysetPage(
    db,
    `SELECT rowid AS _cursor,* FROM catalog_universe_works ORDER BY rowid LIMIT ${READ_PAGE_SIZE}`,
    `SELECT rowid AS _cursor,* FROM catalog_universe_works WHERE rowid>? ORDER BY rowid LIMIT ${READ_PAGE_SIZE}`,
    "_cursor",
    row => {
      if (!works.has(row.work_id) || !universes.has(row.universe_id)) throw new Error("Invalid SQL universe membership");
      if (!memberships.has(row.work_id)) memberships.set(row.work_id,new Set());
      memberships.get(row.work_id).add(row.universe_id);
    }
  );
  forEachKeysetPage(
    db,
    `SELECT alias,entity_id FROM catalog_entity_aliases WHERE kind='universe' ORDER BY alias LIMIT ${READ_PAGE_SIZE}`,
    `SELECT alias,entity_id FROM catalog_entity_aliases WHERE kind='universe' AND alias>? ORDER BY alias LIMIT ${READ_PAGE_SIZE}`,
    "alias",
    row => {
      if (!universes.has(row.entity_id)) throw new Error("Invalid SQL universe alias");
      aliases.set(row.alias,row.entity_id);
    }
  );
  return {works,universes,memberships,aliases};
}
