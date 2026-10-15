import type { CatalogSourceRelation, CatalogSourceNode } from "@/types/anime";

interface SourceNode { id: number; type: string; format?: string | null; episodes?: number | null; relations?: { edges?: { relationType: string; node: SourceNode }[] }; }

/** Preserve source edges; editorial relationships do not imply containment. */
export function collectCatalogSourceRelations(root: SourceNode): CatalogSourceRelation[] {
  return collectCatalogSourceSnapshot(root).relations;
}

export function collectCatalogSourceSnapshot(root: SourceNode): { nodes: CatalogSourceNode[]; relations: CatalogSourceRelation[] } {
  const visited = new WeakSet<object>(), edges = new Map<string,CatalogSourceRelation>();
  const identities = new Map<string,CatalogSourceNode>();
  let nodes = 0;
  const visit = (node: SourceNode) => {
    if (!node || !Number.isSafeInteger(node.id) || node.id < 1 || node.id > 2147483647 || typeof node.type !== "string" || !node.type || node.type.length > 40) throw new Error("Invalid catalog source node");
    if (visited.has(node)) return;
    visited.add(node);
    if (++nodes > 1000) throw new Error("Catalog source graph exceeds limit");
    if (node.format != null && (typeof node.format !== "string" || !node.format || node.format.length > 40)) throw new Error("Invalid catalog source format");
    if (node.episodes != null && (!Number.isSafeInteger(node.episodes) || node.episodes < 0 || node.episodes > 2147483647)) throw new Error("Invalid catalog source count");
    const key = JSON.stringify([node.type,node.id]);
    const observed: CatalogSourceNode = {namespace:"anilist:media",id:String(node.id),type:node.type};
    if (node.format != null) observed.format = node.format;
    if (node.episodes !== undefined) observed.episodes = node.episodes;
    const previous = identities.get(key);
    if (previous) {
      for (const field of ["format","episodes"] as const) {
        if (previous[field] != null && observed[field] != null && previous[field] !== observed[field]) throw new Error("Conflicting catalog source metadata");
      }
      observed.format ??= previous.format;
      if (observed.episodes == null && previous.episodes !== undefined) observed.episodes = previous.episodes;
    }
    identities.set(key,observed);
    for (const edge of node.relations?.edges ?? []) {
      if (typeof edge.relationType !== "string" || !edge.relationType || edge.relationType.length > 60 || !edge.node) throw new Error("Invalid catalog source relation");
      const target = edge.node;
      visit(target);
      const relation: CatalogSourceRelation = { namespace:"anilist:media",fromId:String(node.id),fromType:node.type,toId:String(target.id),toType:target.type,relationType:edge.relationType };
      edges.set(JSON.stringify([relation.fromType,relation.fromId,relation.toType,relation.toId,relation.relationType]),relation);
      if (edges.size > 2000) throw new Error("Catalog source graph exceeds limit");
    }
  };
  visit(root);
  return {nodes:[...identities.values()],relations:[...edges.values()]};
}
