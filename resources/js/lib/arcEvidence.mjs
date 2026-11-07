export function readArcEvidence(work) {
  if (!work || ["MANGA", "NOVEL"].includes(work.entity_type)) return [];
  let records;
  try { records = JSON.parse(work?.arcs_json || "[]"); } catch { return []; }
  if (!Array.isArray(records)) return [];
  const id = Number(work.mal_id || work.id);
  const total = Number(work.episodes_count || work.episodes || 0);
  const accepted = records.filter(arc => {
    try {
      const source = new URL(arc.source_url);
      return Number.isSafeInteger(id) && id > 0 && arc.sourceWorkMalId === id
        && arc.verification === "source-matched" && source.protocol === "https:"
        && !source.username && !source.password && Number.isFinite(Date.parse(arc.checked_at))
        && typeof arc.arcId === "string" && arc.arcId.length > 0 && typeof arc.name === "string" && arc.name.trim()
        && Number.isSafeInteger(arc.startEp) && Number.isSafeInteger(arc.endEp)
        && arc.startEp > 0 && arc.endEp >= arc.startEp && (!total || arc.endEp <= total);
    } catch { return false; }
  }).sort((a, b) => a.startEp - b.startEp);
  if (new Set(accepted.map(arc => arc.arcId)).size !== accepted.length) return [];
  if (accepted.some((arc, index) => index > 0 && arc.startEp <= accepted[index - 1].endEp)) return [];
  return accepted.map(arc => ({ ...arc, episodesCount: arc.endEp - arc.startEp + 1, isFiller: arc.classification === "filler" }));
}
