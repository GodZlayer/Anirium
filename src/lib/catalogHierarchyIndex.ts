import type { PoolClient } from "pg";
import type { CatalogSourceNode, CatalogSourceRelation } from "@/types/anime";
import { ensureEntity, linkContentEntities } from "./entityIndex";
import { planCatalogHierarchy } from "./catalogHierarchyPlan";
import { createHash } from "node:crypto";

/** Materialize proven source topology in the caller's catalog transaction. */
export async function indexCatalogHierarchy(client: PoolClient, rootId: number, nodes: CatalogSourceNode[], relations: CatalogSourceRelation[], options: { reconcile?: boolean } = {}): Promise<void> {
  const plan = planCatalogHierarchy(nodes,relations);
  if (!nodes.some(node=>node.type === "ANIME" && node.id === String(rootId))) throw new Error("Catalog hierarchy missing root");
  // Graphs may overlap: serialize composition before acquiring entity locks.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:catalog:hierarchy',0))");
  const sourceKey = "anilist:source-topology:v1";
  const sourceSnapshot = JSON.stringify({
    nodes:nodes.map(node=>({namespace:node.namespace,id:node.id,type:node.type,...(node.format === undefined ? {} : {format:node.format}),...(node.episodes === undefined ? {} : {episodes:node.episodes})})).sort((a,b)=>JSON.stringify([a.type,a.id]).localeCompare(JSON.stringify([b.type,b.id]))),
    relations:relations.map(edge=>({namespace:edge.namespace,fromId:edge.fromId,fromType:edge.fromType,toId:edge.toId,toType:edge.toType,relationType:edge.relationType})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });
  const sourceHash = createHash("sha256").update(sourceSnapshot).digest("hex");
  const make = (namespace: string,value: string,kind: "UNIVERSE" | "WORK" | "SEASON") => ensureEntity({namespace,value,sourceKey},{kind},client);
  const parent = async (children: string[],kind: "WORK" | "UNIVERSE") => {
    const result = await client.query<{parent_id:string}>("SELECT DISTINCT parent_id FROM canonical_memberships WHERE child_id=ANY($1::text[]) AND parent_kind=$2 ORDER BY parent_id",[children,kind]);
    if (result.rows.length > 1 && options.reconcile !== true) throw new Error("Catalog hierarchy requires explicit historical reconciliation");
    return result.rows[0]?.parent_id;
  };
  const link = async (parentId: string,childId: string,kind: "WORK" | "UNIVERSE") => {
    const previous = (await client.query<{parent_id:string}>("SELECT parent_id FROM canonical_memberships WHERE child_id=$1 AND parent_kind=$2 ORDER BY parent_id FOR UPDATE",[childId,kind])).rows;
    if (kind === "UNIVERSE" && previous.length > 1) {
      // A work may legitimately participate in multiple universes (crossover).
      // A local provider graph is not proof that those contexts are equivalent.
      if (!previous.some(old=>old.parent_id === parentId)) throw new Error("Catalog crossover requires explicit universe reconciliation");
      return;
    }
    for (const old of previous) if (old.parent_id !== parentId) {
      if (options.reconcile !== true) throw new Error("Catalog hierarchy requires explicit historical reconciliation");
      await client.query("INSERT INTO canonical_membership_history(child_id,previous_parent_id,next_parent_id,source_key,source_hash,source_snapshot) VALUES($1,$2,$3,$4,$5,$6)",[childId,old.parent_id,parentId,sourceKey,sourceHash,sourceSnapshot]);
      await client.query("DELETE FROM canonical_memberships WHERE parent_id=$1 AND child_id=$2",[old.parent_id,childId]);
    }
    await linkContentEntities(client,parentId,childId,null,sourceKey);
  };
  const assignedWorks = new Map<string,string[]>();
  const seasonIds: Record<string,string> = {};
  const branchRelations = new Set(["SPIN_OFF","SIDE_STORY","ALTERNATIVE","SUMMARY","PARENT"]);
  const standaloneFormats = new Set(["MOVIE","OVA","SPECIAL"]);
  for (const group of plan.universes) {
    const assignments: {releaseId:string;seasonId:string;workId:string}[] = [];
    for (const releases of group.works) {
      const seasons = [];
      for (const releaseId of releases) seasons.push({releaseId,entity:await make("anilist:season",releaseId,"SEASON")});
      let workId = await parent(seasons.map(season=>season.entity.id),"WORK") ?? (await make("anirium:source-work",`anilist:${releases[0]}`,"WORK")).id;
      const alreadyAssigned = assignedWorks.get(workId);
      if (alreadyAssigned) {
        const provenBranch = relations.some(edge=>edge.fromType === "ANIME" && edge.toType === "ANIME" && branchRelations.has(edge.relationType) && ((releases.includes(edge.fromId) && alreadyAssigned.includes(edge.toId)) || (releases.includes(edge.toId) && alreadyAssigned.includes(edge.fromId))));
        const provenStandalone = nodes.some(node=>node.type === "ANIME" && standaloneFormats.has(node.format ?? "") && (releases.includes(node.id) || alreadyAssigned.includes(node.id)));
        if (options.reconcile !== true || (!provenBranch && !provenStandalone)) throw new Error("Catalog hierarchy split requires positive source evidence");
        workId = (await make("anirium:source-work-branch",JSON.stringify([seasons[0].entity.id,workId,sourceHash]),"WORK")).id;
      }
      assignedWorks.set(workId,releases);
      for (const season of seasons) {
        await link(workId,season.entity.id,"WORK");
        assignments.push({releaseId:season.releaseId,seasonId:season.entity.id,workId});
        seasonIds[season.releaseId] = season.entity.id;
        const observed = nodes.find(node=>node.type === "ANIME" && node.id === season.releaseId)!;
        await client.query(`INSERT INTO canonical_release_facts(season_id,episode_count,episodes_observed,source_key) VALUES($1,$2,$3,$4)
          ON CONFLICT(season_id) DO UPDATE SET episode_count=CASE WHEN EXCLUDED.episodes_observed THEN EXCLUDED.episode_count ELSE canonical_release_facts.episode_count END,
          episodes_observed=canonical_release_facts.episodes_observed OR EXCLUDED.episodes_observed,source_key=EXCLUDED.source_key`,[season.entity.id,observed.episodes ?? null,observed.episodes !== undefined,sourceKey]);
      }
    }
    const universeId = await parent(assignments.map(item=>item.workId),"UNIVERSE") ?? (await make("anirium:source-universe",`anilist:${group.releases[0]}`,"UNIVERSE")).id;
    for (const workId of new Set(assignments.map(item=>item.workId))) await link(universeId,workId,"UNIVERSE");
    for (const item of assignments) await client.query(`UPDATE anime_catalog SET composition_work_id=$2,composition_season_id=$3,composition_universe_id=$4 WHERE id_anilist=$1 OR composition_season_id=$3`,[Number(item.releaseId),item.workId,item.seasonId,universeId]);
    await client.query("UPDATE anime_catalog SET composition_universe_id=$2 WHERE composition_work_id=ANY($1::text[])",[assignments.map(item=>item.workId),universeId]);
  }
  await client.query("UPDATE anime_catalog SET composition_seasons_json=$2::jsonb WHERE id_anilist=$1",[rootId,JSON.stringify(seasonIds)]);
}
