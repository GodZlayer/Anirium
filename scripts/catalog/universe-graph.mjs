const FRANCHISE_RELATIONS = new Set([
  "PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "MAIN_STORY",
  "ALTERNATIVE_VERSION", "ALTERNATIVE_SETTING", "SPIN_OFF", "SUMMARY", "COMPILATION",
]);

export function aniListRelations(media) {
  return (media.relations?.edges || []).flatMap(edge => {
    const malId = edge.node?.idMal;
    return edge.node?.type === "ANIME" && Number.isSafeInteger(malId) && malId > 0
      ? [{ mal_id: malId, type: edge.relationType, source: "anilist" }] : [];
  });
}

export function reconcileUniverses(entities) {
  const parents = new Map([...entities].filter(([id, row]) => Number.isSafeInteger(id) && row.entity_type !== "MANGA").map(([id]) => [id, id]));
  const verified = new Set();
  const root = id => {
    let current = id;
    while (parents.get(current) !== current) current = parents.get(current);
    while (parents.get(id) !== id) { const next = parents.get(id); parents.set(id, current); id = next; }
    return current;
  };
  for (const [id, row] of entities) {
    if (!parents.has(id)) continue;
    let relations;
    try { relations = JSON.parse(row.relations_json || "[]"); } catch { continue; }
    if (!Array.isArray(relations)) continue;
    for (const edge of relations) {
      if (!FRANCHISE_RELATIONS.has(edge?.type) || !parents.has(edge.mal_id) || edge.mal_id === id || !["anilist", "myanimelist"].includes(edge.source)) continue;
      const a = root(id), b = root(edge.mal_id);
      parents.set(Math.max(a, b), Math.min(a, b));
      verified.add(id); verified.add(edge.mal_id);
    }
  }
  for (const [id, row] of entities) {
    row.universe_source = verified.has(id) ? "relations" : "unverified";
    if (verified.has(id)) {
      row.universe_id = `univ-${root(id)}`;
      row.parent_id = row.universe_id;
    }
  }
}
