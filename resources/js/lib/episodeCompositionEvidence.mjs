import { episodeFields, validEpisodeField, validEpisodeEvidence } from "./episodeFieldEvidence.mjs";

export function validEpisodeComposition(document, id) {
  const evidence = document?.evidence, conflicts = document?.conflicts;
  if (document?.schema !== 2 || document.source_url !== null || !evidence || typeof evidence !== "object" || Array.isArray(evidence)
    || !Object.entries(evidence).length || Object.entries(evidence).some(([key, value]) => !/^[a-f0-9]{64}$/.test(key) || !validEpisodeEvidence(value, id))
    || !Array.isArray(document.episodes) || !Array.isArray(conflicts)) return false;
  const selected = new Map(), dates = [];
  for (const [number, item] of [[0, document], ...document.episodes.map(episode => [episode.number, episode])]) {
    const fields = episodeFields(item, number === 0), provenance = item.field_provenance;
    if (!provenance || typeof provenance !== "object" || Array.isArray(provenance) || Object.keys(provenance).length !== fields.length) return false;
    const observed = [];
    for (const [field, value] of fields) {
      const key = provenance[field];
      if (!validEpisodeField(field, value, number === 0) || !evidence[key]) return false;
      selected.set(`${number}:${field}`, { key, value }); observed.push(Date.parse(evidence[key].observed_at));
    }
    dates.push(...observed);
    if (number && (!observed.length || Date.parse(item.checked_at) !== Math.min(...observed))) return false;
  }
  const seen = new Set();
  for (const conflict of conflicts) {
    if (!conflict || typeof conflict !== "object" || Array.isArray(conflict)) return false;
    const choice = selected.get(`${conflict.episode}:${conflict.field}`), alternative = evidence[conflict.alternative_evidence];
    const key = `${conflict.episode}:${conflict.field}:${alternative?.provider}`;
    if (!choice || !alternative || choice.key !== conflict.selected_evidence || seen.has(key) || alternative.provider === evidence[choice.key].provider
      || !validEpisodeField(conflict.field, conflict.alternative_value, conflict.episode === 0)
      || JSON.stringify(choice.value) !== JSON.stringify(conflict.selected_value)
      || JSON.stringify(choice.value) === JSON.stringify(conflict.alternative_value)) return false;
    seen.add(key);
  }
  return dates.length > 0 && Date.parse(document.checked_at) === dates.reduce((a, b) => Math.min(a, b), Infinity);
}
