import { createHash } from "node:crypto";
import { readEpisodeMetadata } from "../../resources/js/lib/episodeMetadata.mjs";
import { episodeFields, validEpisodeField, setEpisodeField } from "../../resources/js/lib/episodeFieldEvidence.mjs";

const priority = { anizip: 2, jikan: 1 };
export function composeEpisodeDocuments(previous, incoming, work) {
  if (!readEpisodeMetadata(incoming, work) || previous && !readEpisodeMetadata(previous, work)) throw new Error("Invalid episode composition input");
  if (!previous || JSON.stringify(previous) === JSON.stringify(incoming)) return incoming;
  const choices = new Map();
  const add = (episode, field, value, origin) => {
    if (!validEpisodeField(field, value, episode === 0)) throw new Error("Unsupported episode field evidence");
    const evidence = { provider: origin.provider, source_url: origin.source_url, observed_at: new Date(origin.observed_at).toISOString(), ...(origin.upstream ? { upstream: origin.upstream } : {}) };
    const identity = `${episode}:${field}`;
    if (!choices.has(identity)) choices.set(identity, { episode, field, providers: new Map() });
    const providers = choices.get(identity).providers, prior = providers.get(evidence.provider);
    if (prior && Date.parse(prior.evidence.observed_at) > Date.parse(evidence.observed_at)) return;
    if (prior && prior.evidence.observed_at === evidence.observed_at && JSON.stringify(prior.value) !== JSON.stringify(value)) throw new Error("Contradictory same-observation episode evidence");
    providers.set(evidence.provider, { value, evidence });
  };
  for (const document of [previous, incoming]) {
    for (const [episode, item] of [[0, document], ...document.episodes.map(item => [item.number, item])]) {
      for (const [field, value] of episodeFields(item, episode === 0)) {
        const evidence = document.source === "anirium" ? document.evidence[item.field_provenance[field]]
          : { provider: document.source, source_url: document.source_url, observed_at: item.checked_at || document.checked_at, ...(document.upstream ? { upstream: document.upstream } : {}) };
        add(episode, field, value, evidence);
      }
    }
    if (document.source === "anirium") for (const conflict of document.conflicts) add(conflict.episode, conflict.field, conflict.alternative_value, document.evidence[conflict.alternative_evidence]);
  }
  if (!choices.size) return Date.parse(incoming.checked_at) >= Date.parse(previous.checked_at) ? incoming : previous;
  const id = Number(work.mal_id ?? work.id), records = new Map(), selectedDates = [], evidence = {}, conflicts = [];
  const output = { schema: 2, mal_id: id, catalog_key: `anime:${id}`, source: "anirium", source_url: null,
    mal_episode_count: Number(work.episodes ?? work.episodes_count ?? 0) || null,
    work_titles: {}, external_ids: {}, specials: [], rejected_numbers: [], field_provenance: {}, episodes: [] };
  const register = origin => { const key = createHash("sha256").update(JSON.stringify(origin)).digest("hex"); evidence[key] = origin; return key; };
  for (const { episode, field, providers } of [...choices.values()].sort((a, b) => a.episode - b.episode || a.field.localeCompare(b.field, "en"))) {
    const values = [...providers.values()].sort((a, b) => priority[b.evidence.provider] - priority[a.evidence.provider]);
    const chosen = values[0], selected = register(chosen.evidence);
    if (episode && !records.has(episode)) records.set(episode, { number: episode, titles: {}, field_provenance: {} });
    const target = episode ? records.get(episode) : output;
    setEpisodeField(target, field, chosen.value); target.field_provenance[field] = selected;
    selectedDates.push(Date.parse(chosen.evidence.observed_at));
    for (const alternative of values.slice(1)) if (JSON.stringify(chosen.value) !== JSON.stringify(alternative.value)) conflicts.push({ episode, field,
      selected_evidence: selected, selected_value: chosen.value, alternative_evidence: register(alternative.evidence), alternative_value: alternative.value });
  }
  output.episodes = [...records.values()].map(item => ({ ...item, checked_at: new Date(Object.values(item.field_provenance)
    .reduce((minimum, key) => Math.min(minimum, Date.parse(evidence[key].observed_at)), Infinity)).toISOString() }));
  output.evidence = Object.fromEntries(Object.entries(evidence).sort(([a], [b]) => a.localeCompare(b, "en")));
  output.conflicts = conflicts;
  output.checked_at = new Date(selectedDates.reduce((a, b) => Math.min(a, b), Infinity)).toISOString();
  if (!readEpisodeMetadata(output, work)) throw new Error("Invalid derived episode document");
  return output;
}
