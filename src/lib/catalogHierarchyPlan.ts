import type { CatalogSourceNode, CatalogSourceRelation } from "@/types/anime";

export interface CatalogHierarchyPlan {
  universes: { releases: string[]; works: string[][] }[];
  unresolved: { releaseId: string; reason: "unknown-format" | "non-tv-format" }[];
}

const universeRelations = new Set(["PREQUEL","SEQUEL","SIDE_STORY","SPIN_OFF","ALTERNATIVE","SUMMARY","PARENT"]);
const mainlineRelations = new Set(["PREQUEL","SEQUEL"]);
const serialFormats = new Set(["TV","TV_SHORT"]);
const nodeKey = (type: string, id: string) => JSON.stringify([type,id]);

/** Source topology only. Returned groups are proposals, never permanent IDs. */
export function planCatalogHierarchy(nodes: CatalogSourceNode[], relations: CatalogSourceRelation[]): CatalogHierarchyPlan {
  if (nodes.length > 1000 || relations.length > 2000) throw new Error("Catalog hierarchy exceeds limit");
  const observed = new Map<string,CatalogSourceNode>();
  for (const node of nodes) {
    if (node.namespace !== "anilist:media" || !/^[1-9][0-9]*$/.test(node.id) || Number(node.id) > 2147483647 || typeof node.type !== "string" || !node.type || node.type.length > 40) throw new Error("Invalid hierarchy source identity");
    if (node.format !== undefined && (typeof node.format !== "string" || !node.format || node.format.length > 40)) throw new Error("Invalid hierarchy source format");
    if (node.episodes != null && (!Number.isSafeInteger(node.episodes) || node.episodes < 0 || node.episodes > 2147483647)) throw new Error("Invalid hierarchy source count");
    const key = nodeKey(node.type,node.id);
    if (observed.has(key)) throw new Error("Duplicate hierarchy source identity");
    observed.set(key,node);
  }
  const releases = nodes.filter(node => node.type === "ANIME").map(node => node.id).sort();
  const universe = new Map(releases.map(id => [id,id]));
  const work = new Map(universe);
  const find = (parents: Map<string,string>, id: string): string => {
    let root = id;
    while (parents.get(root) !== root) root = parents.get(root)!;
    return root;
  };
  const join = (parents: Map<string,string>, left: string, right: string) => {
    const a = find(parents,left), b = find(parents,right);
    if (a !== b) parents.set(a < b ? b : a,a < b ? a : b);
  };
  for (const relation of relations) {
    if (relation.namespace !== "anilist:media" || typeof relation.relationType !== "string" || !relation.relationType || relation.relationType.length > 60) throw new Error("Invalid hierarchy source relation");
    const from = observed.get(nodeKey(relation.fromType,relation.fromId));
    const to = observed.get(nodeKey(relation.toType,relation.toId));
    if (!from || !to) throw new Error("Hierarchy relation missing source node");
    if (from.type !== "ANIME" || to.type !== "ANIME") continue;
    if (universeRelations.has(relation.relationType)) join(universe,from.id,to.id);
    if (mainlineRelations.has(relation.relationType) && serialFormats.has(from.format ?? "") && serialFormats.has(to.format ?? "")) join(work,from.id,to.id);
  }
  const groups = new Map<string,Map<string,string[]>>();
  for (const id of releases) {
    const universeId = find(universe,id), workId = find(work,id);
    const works = groups.get(universeId) ?? new Map<string,string[]>();
    works.set(workId,[...(works.get(workId) ?? []),id]);
    groups.set(universeId,works);
  }
  return {
    universes:[...groups.values()].map(works => ({releases:[...works.values()].flat().sort(),works:[...works.values()].sort((a,b)=>a[0].localeCompare(b[0]))})).sort((a,b)=>a.releases[0].localeCompare(b.releases[0])),
    unresolved:nodes.filter(node=>node.type === "ANIME" && !serialFormats.has(node.format ?? "")).map(node=>({releaseId:node.id,reason:node.format === undefined ? "unknown-format" as const : "non-tv-format" as const})).sort((a,b)=>a.releaseId.localeCompare(b.releaseId)),
  };
}
