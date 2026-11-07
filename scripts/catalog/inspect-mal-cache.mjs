import { readDetail } from "./mal-detail-cache.mjs";
import { malRecord } from "./mal-record.mjs";

const TRAVERSE = new Set(["prequel", "sequel", "parent_story", "side_story", "full_story", "alternative_version", "alternative_setting", "spin_off", "summary", "compilation"]);

export function inspectMalCache(root, directory) {
  const queue = [root], visited = new Set(), nodes = [], edges = [], missing = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const cache = readDetail(directory, id);
    if (!cache) { missing.add(id); continue; }
    const payload = cache.payload, normalized = malRecord(payload).m.officialRelations;
    nodes.push({ id, title: payload.title, checkedAt: cache.checkedAt, returnedFields: Object.keys(payload),
      droppedRelations: payload.related_anime.filter(edge => !normalized.some(item => item.mal_id === edge.node?.id))
        .map(edge => ({ id: edge.node?.id, title: edge.node?.title, type: edge.relation_type })) });
    for (const edge of payload.related_anime) {
      edges.push({ from: id, to: edge.node?.id, title: edge.node?.title, type: edge.relation_type });
      if (Number.isSafeInteger(edge.node?.id) && edge.node.id > 0 && TRAVERSE.has(edge.relation_type) && !visited.has(edge.node.id)) queue.push(edge.node.id);
    }
  }
  return { root, origin: "local-cache", liveVerified: false, nodes, edges, missingDetails: [...missing], traversedRelationTypes: [...TRAVERSE] };
}
