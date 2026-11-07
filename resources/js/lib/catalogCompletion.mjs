const kinds = ["episodes", "seasons", "arcs", "works", "universes"];

export function readCatalogCompletion(value) {
  if (value?.schema !== 1 || value.authority !== "sql" || !value.counts
    || kinds.some(kind => !Number.isSafeInteger(value.counts[kind]) || value.counts[kind] < 0)
    || !Array.isArray(value.completed_universe_ids)
    || value.completed_universe_ids.length !== value.counts.universes
    || new Set(value.completed_universe_ids).size !== value.completed_universe_ids.length
    || value.completed_universe_ids.some(id => typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))) return null;
  return { ...value, counts: { ...value.counts }, completed_universe_ids: [...value.completed_universe_ids] };
}

export function emptyCatalogCompletion() {
  return { schema: 1, authority: "sql", counts: Object.fromEntries(kinds.map(kind => [kind, 0])), completed_universe_ids: [] };
}
