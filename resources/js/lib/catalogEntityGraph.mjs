import { WORK_UUID } from "./catalogAliases.mjs";

export function readWorkGraph(value, expectedWorkId) {
  if (value?.schema !== 1 || value.entity?.kind !== "work" || value.entity.id !== expectedWorkId || !WORK_UUID.test(expectedWorkId)) throw Error("Invalid work graph");
  for (const key of ["universe_ids", "seasons", "episodes", "arcs", "relations"]) if (!Array.isArray(value[key])) throw Error("Invalid graph collection");
  const universes = new Set(value.universe_ids), seasons = new Set(), episodes = new Set(), positions = new Set();
  if (universes.size !== value.universe_ids.length || value.universe_ids.some(id => !WORK_UUID.test(id) || id === expectedWorkId)) throw Error("Invalid universe identities");
  const all = new Set([expectedWorkId, ...universes]);
  const register = id => { if (!WORK_UUID.test(id) || all.has(id)) throw Error("Duplicate entity identity"); all.add(id); };
  for (const season of value.seasons) {
    register(season.id);
    if (season.work_id !== expectedWorkId || !Number.isSafeInteger(season.number) || season.number < 1) throw Error("Invalid season membership");
    seasons.add(season.id);
  }
  for (const episode of value.episodes) {
    register(episode.id);
    const position = `${episode.numbering_scheme}:${episode.number}`;
    if (episode.work_id !== expectedWorkId || (episode.season_id != null && !seasons.has(episode.season_id))
      || !Number.isSafeInteger(episode.number) || episode.number < 1 || positions.has(position)) throw Error("Invalid episode membership");
    positions.add(position); episodes.add(episode.id);
  }
  for (const arc of value.arcs) {
    register(arc.id);
    if ((arc.start_number != null || arc.end_number != null)
      && (!Number.isSafeInteger(arc.start_number) || arc.start_number < 1 || !Number.isSafeInteger(arc.end_number) || arc.end_number < arc.start_number)) throw Error("Invalid arc source interval");
    if (!universes.has(arc.universe_id) || !Array.isArray(arc.episode_ids) || arc.episode_ids.some(id => !episodes.has(id))
      || !Array.isArray(arc.aliases) || arc.aliases.some(alias => typeof alias !== "string")) throw Error("Invalid arc membership");
  }
  if (value.relations.some(edge => !WORK_UUID.test(edge.to_work_id) || typeof edge.relation_type !== "string" || typeof edge.provider !== "string")) throw Error("Invalid work relation");
  return value;
}

export function graphActionTarget(graph, kind, selection = {}) {
  if (!graph) return null;
  if (kind === "work") return graph.entity.id;
  if (kind === "universe") return graph.universe_ids.length === 1 ? graph.universe_ids[0] : null;
  if (kind === "episode") return graph.episodes.find(episode => episode.numbering_scheme === "original" && episode.number === selection.episode)?.id ?? null;
  if (kind === "season") return graph.seasons.find(season => season.number === selection.season)?.id ?? null;
  if (kind === "arc" && typeof selection.arc === "string") {
    if (graph.arcs.some(arc => arc.id === selection.arc)) return selection.arc;
    const alias = `work:${graph.entity.id}:source-arc:${selection.arc}`;
    return graph.arcs.find(arc => arc.aliases.includes(alias))?.id ?? null;
  }
  return null;
}

export function graphCanonicalArcs(graph) {
  if (!graph) return [];
  return graph.arcs.map(arc => ({ arcId: arc.id, name: arc.title, startEp: arc.start_number ?? null, endEp: arc.end_number ?? null,
    classification: arc.classification || "unknown", isFiller: arc.classification === "filler", source_url: arc.source_url,
    episodesCount: arc.start_number != null && arc.end_number != null ? arc.end_number - arc.start_number + 1 : arc.episode_ids.length,
    synopsis: "" })).sort((a, b) => (a.startEp ?? Infinity) - (b.startEp ?? Infinity) || a.arcId.localeCompare(b.arcId));
}

export function contextEpisodeNumbers(graph, kind, entityId) {
  if (!graph) return [];
  const arc = kind === "arc" ? graph.arcs.find(arc => arc.id === entityId) : null;
  return graph.episodes.filter(episode => episode.numbering_scheme === "original"
    && (kind !== "season" || episode.season_id === entityId)
    && (kind !== "arc" || arc?.episode_ids.includes(episode.id)))
    .map(episode => episode.number).sort((a, b) => a - b);
}

export async function requestWorkGraph(id, signal, fetcher = fetch) {
  if (!WORK_UUID.test(id)) throw Error("Invalid work UUID");
  const response = await fetcher(`/api/catalog/graph/work/${id}`, { signal, credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!response.ok) throw Object.assign(Error("Catalog graph unavailable"), { status: response.status });
  return readWorkGraph(await response.json(), id);
}
