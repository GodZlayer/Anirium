import { registryConnection } from "./sql-registry-connection.mjs";
import { readUniverseState } from "./sql-universe-state.mjs";
import { planUniverseProjection } from "./sql-universe-plan.mjs";
import { planWorkRelations } from "./sql-relation-plan.mjs";
import { resolveWorkRelations } from "./work-relations.mjs";
import { planWorkMetadata } from "./sql-work-metadata-plan.mjs";

export function syncSqlWorkGraph(rows,registry,{database=process.env.CATALOG_IDENTITY_DATABASE,onPending=()=>{},onConflict=()=>{}}={}) {
  const report=resolveWorkRelations(rows,registry,{onPending}), db=registryConnection(database);
  try {
    let plan, edges, metadata;
    db.exec("BEGIN");
    try {
      const state=readUniverseState(db);
      plan=planUniverseProjection(rows,state);edges=planWorkRelations(db,rows,state.works);
      metadata=planWorkMetadata(rows,state.works);
      db.exec("COMMIT");
    } catch(error) {db.exec("ROLLBACK");throw error;}
    const commit=(items,apply)=>{
      for(let offset=0;offset<items.length;offset+=250) {
        db.exec("BEGIN IMMEDIATE");
        try {for(const item of items.slice(offset,offset+250)) apply(item);db.exec("COMMIT");}
        catch(error) {db.exec("ROLLBACK");throw error;}
      }
    };
    const entity=db.prepare("INSERT INTO catalog_entities(id,kind,resolution_status,created_at,updated_at) VALUES(?,'universe','verified',?,?)");
    const universe=db.prepare("INSERT INTO catalog_universes(id) VALUES(?)");
    const alias=db.prepare("INSERT INTO catalog_entity_aliases(kind,alias,entity_id) VALUES('universe',?,?) ON CONFLICT(kind,alias) DO NOTHING");
    const owner=db.prepare("SELECT entity_id FROM catalog_entity_aliases WHERE kind='universe' AND alias=?");
    const attach=value=>{alias.run(value.alias,value.id);if(owner.get(value.alias)?.entity_id!==value.id) throw new Error("SQL universe alias owner changed");};
    commit(plan.creations,value=>{const now=new Date().toISOString();entity.run(value.id,now,now);universe.run(value.id);attach(value);});
    commit(plan.aliases,attach);
    const link=db.prepare("INSERT INTO catalog_universe_works(universe_id,work_id) VALUES(?,?) ON CONFLICT(universe_id,work_id) DO NOTHING");
    commit(plan.links,value=>link.run(value.universe_id,value.work_id));
    const relation=db.prepare("INSERT INTO catalog_work_relations(from_work_id,to_work_id,relation_type,provider) VALUES(?,?,?,?) ON CONFLICT DO NOTHING");
    commit(edges,value=>relation.run(value.from_work_id,value.to_work_id,value.relation_type,value.provider));
    const update=db.prepare("UPDATE catalog_works SET format=?,status=?,episode_count=? WHERE id=?");
    commit(metadata,value=>update.run(value.format,value.status,value.episode_count,value.id));
    for(const row of rows) {
      const assignment=plan.assignments.get(row.work_id);
      row.universe_ids_json=JSON.stringify(assignment.ids);
      row.universe_v2_id=assignment.ids.length===1 ? assignment.ids[0] : null;
      row.universe_identity_version=1;row.universe_reconciliation_pending=assignment.pending;
      const root=plan.assignments.get(row.continuity_root_work_id);
      if (!root?.ids.some(id=>assignment.ids.includes(id))) row.continuity_root_work_id=row.work_id;
      delete row.universe_component_key;
    }
    for(const conflict of plan.conflicts) onConflict(conflict);
    return {...report,organization:{universesCreated:plan.creations.length,membershipsAdded:plan.links.length,relationsAdded:edges.length,conflicts:plan.conflicts.length}};
  } finally {db.close();}
}
