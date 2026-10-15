import type { PoolClient } from "pg";
import type { CanonicalKind } from "./entityIndex";

export type ContentRelation = "parent" | "children" | "arcs" | "episodes";
export interface ContentRelationItem { id:string; kind:CanonicalKind; displayOrder:number|null; sourceKey:string; }

/** Keyset pagination is by stable identity; display order remains explicit data. */
export async function readContentRelations(client: PoolClient, entityId: string,
  input: { relation:ContentRelation; after?:string; limit?:number }) {
  const limit=input.limit ?? 50, after=input.after ?? null;
  if (typeof entityId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId) ||
    !Number.isSafeInteger(limit) || limit<1 || limit>100 ||
    (after!==null && (typeof after!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after)))) throw new Error("Invalid content relation page");
  const entity=(await client.query<{kind:CanonicalKind}>("SELECT kind FROM canonical_entities WHERE id=$1 AND visibility='public'",[entityId])).rows[0];
  if (!entity || !["UNIVERSE","ARC","WORK","SEASON","EPISODE"].includes(entity.kind)) return null;
  let edges:string;
  if(input.relation==='children' && ['UNIVERSE','WORK','SEASON'].includes(entity.kind)) {
    edges="SELECT child_id AS id,display_order,source_key FROM canonical_memberships WHERE parent_id=$1";
  } else if(input.relation==='parent' && ['WORK','SEASON','EPISODE'].includes(entity.kind)) {
    edges="SELECT parent_id AS id,display_order,source_key FROM canonical_memberships WHERE child_id=$1";
  } else if(input.relation==='parent' && entity.kind==='ARC') {
    edges="SELECT universe_id AS id,NULL::integer AS display_order,source_key FROM canonical_arcs WHERE arc_id=$1";
  } else if(input.relation==='arcs' && entity.kind==='UNIVERSE') {
    edges="SELECT arc_id AS id,NULL::integer AS display_order,source_key FROM canonical_arcs WHERE universe_id=$1";
  } else if(input.relation==='arcs' && entity.kind==='EPISODE') {
    edges="SELECT arc_id AS id,display_order,source_key FROM canonical_arc_episodes WHERE episode_id=$1";
  } else if(input.relation==='episodes' && entity.kind==='ARC') {
    edges="SELECT episode_id AS id,display_order,source_key FROM canonical_arc_episodes WHERE arc_id=$1";
  } else throw new Error("Unavailable content relation");
  const rows=(await client.query<ContentRelationItem>(`SELECT e.id,e.kind,r.display_order AS "displayOrder",r.source_key AS "sourceKey"
    FROM (${edges}) r JOIN canonical_entities e ON e.id=r.id AND e.visibility='public'
    WHERE ($2::text IS NULL OR e.id>$2) ORDER BY e.id LIMIT $3`,[entityId,after,limit+1])).rows;
  const items=rows.slice(0,limit),hasMore=rows.length>limit;
  return {entityId,relation:input.relation,items,hasMore,nextCursor:hasMore ? items[items.length-1].id : null};
}
