export function newerSameSource(current, incoming) {
  if (!current?.provider || incoming?.provider !== current.provider) return false;
  const before = Date.parse(current.observed_at), after = Date.parse(incoming.observed_at);
  return Number.isFinite(before) && Number.isFinite(after) && after > before;
}

export function preferIncomingField(current, incoming) {
  if (newerSameSource(current, incoming)) return true;
  const after = Date.parse(incoming?.observed_at), before = Date.parse(current?.observed_at);
  return ["mal", "myanimelist"].includes(incoming?.provider) && !["mal", "myanimelist"].includes(current?.provider)
    && Number.isFinite(after) && (!Number.isFinite(before) || after >= before);
}

export function mergeRawRelations(current, incoming) {
  const previous = JSON.parse(current || "[]"), next = JSON.parse(incoming || "[]");
  if (!Array.isArray(previous) || !Array.isArray(next)) throw new Error("Invalid source relations");
  return JSON.stringify([...new Map([...previous, ...next].map(edge => [JSON.stringify(edge), edge])).values()]);
}
