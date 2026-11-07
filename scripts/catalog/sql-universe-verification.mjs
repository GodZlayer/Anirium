import { registryConnection } from "./sql-registry-connection.mjs";
import { readUniverseState } from "./sql-universe-state.mjs";

export function assertSqlUniverseProjection(rows,database=process.env.CATALOG_IDENTITY_DATABASE) {
  const db=registryConnection(database);
  try {
    db.exec("BEGIN");
    const state=readUniverseState(db);
    for(const row of rows) {
      const known=[...(state.memberships.get(row.work_id) || [])].sort();
      const declared=JSON.parse(row.universe_ids_json || "null");
      if(row.universe_identity_version!==1 || !known.length || JSON.stringify(known)!==JSON.stringify(declared)
        || (row.universe_v2_id || null)!==(known.length===1 ? known[0] : null)
        || row.universe_component_key!=null || row.continuity_id!=null
        || !state.works.has(row.continuity_root_work_id)
        || ![...(state.memberships.get(row.continuity_root_work_id) || [])].some(id=>known.includes(id))) throw new Error("Publication universe identity differs from canonical SQL graph");
    }
    db.exec("COMMIT");
  } finally {db.close();}
}
