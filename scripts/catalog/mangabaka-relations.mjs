export function mangaBakaRelation(raw) {
  const valid = Number.isSafeInteger(raw?.to_series_id) && raw.to_series_id > 0 && typeof raw.relation_type === "string" && raw.relation_type.trim();
  return { source: "mangabaka", raw, ...(valid ? { target: { provider: "mangabaka", media: "manga", id: String(raw.to_series_id) }, relation_type: raw.relation_type } : {}) };
}
