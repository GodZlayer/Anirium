import { WORK_UUID } from "./catalogAliases.mjs";
import { findCatalogWork } from "./catalogIdentity.mjs";
import { graphActionTarget, requestWorkGraph } from "./catalogEntityGraph.mjs";

export function readEntityContext(value, kind, id, preferredWork) {
  if (value?.schema !== 1 || value.entity?.kind !== kind || value.entity.id !== id.toLowerCase()
    || !WORK_UUID.test(value.work_id || "") || (preferredWork && value.work_id !== preferredWork.toLowerCase())
    || !value.selection || typeof value.selection !== "object" || Array.isArray(value.selection)) throw Error("Invalid entity context");
  const selected = value.selection;
  if (kind === "work" && value.work_id !== value.entity.id) throw Error("Invalid work context");
  if (["episode", "season", "arc"].includes(kind) && selected[`${kind}_id`] !== value.entity.id) throw Error("Invalid context selection");
  for (const key of ["episode_number", "season_number"]) {
    if (selected[key] != null && (!Number.isSafeInteger(selected[key]) || selected[key] < 1)) throw Error("Invalid context numbering");
  }
  if (kind === "episode" && selected.episode_number == null) throw Error("Missing episode number");
  if (kind === "season" && selected.season_number == null) throw Error("Missing season number");
  if (selected.season_id != null && !WORK_UUID.test(selected.season_id)) throw Error("Invalid season identity");
  if (selected.arc_reference != null && typeof selected.arc_reference !== "string") throw Error("Invalid arc reference");
  return value;
}

export async function requestEntityContext(kind, id, { preferredWork, signal } = {}, fetcher = fetch) {
  if (!["universe", "work", "episode", "season", "arc"].includes(kind) || !WORK_UUID.test(id)
    || (preferredWork && !WORK_UUID.test(preferredWork))) throw Error("Invalid entity identity");
  const query = preferredWork ? `?work_id=${preferredWork.toLowerCase()}` : "";
  const response = await fetcher(`/api/catalog/context/${kind}/${id.toLowerCase()}${query}`, { signal, credentials: "same-origin", headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw Object.assign(Error("Entity context unavailable"), { status: response.status });
  return readEntityContext(await response.json(), kind, id, preferredWork);
}

export async function prepareEntityNavigation({ graph, catalog, kind, reference, selection, signal, readGraph = requestWorkGraph }) {
  const id = String(reference);
  if (!graph) return { id, workId: undefined };
  const work = findCatalogWork(catalog, id);
  if (work?.work_id) {
    const targetGraph = work.work_id === graph.entity.id ? graph : await readGraph(work.work_id, signal);
    if (signal?.aborted) throw new DOMException("Navigation cancelled", "AbortError");
    const targetId = graphActionTarget(targetGraph, kind, selection);
    if (!targetId) throw Error("Unknown entity selection");
    return { id: targetId, workId: kind === "work" ? undefined : work.work_id };
  }
  if (!WORK_UUID.test(id)) throw Error("Unknown context identity");
  return { id, workId: kind === "universe" && graph.universe_ids.includes(id) ? graph.entity.id : undefined };
}
