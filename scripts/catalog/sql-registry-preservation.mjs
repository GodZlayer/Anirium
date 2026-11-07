export function assertRegistryPreserved(previous, next) {
  for (const [id,work] of Object.entries(previous.works)) {
    const retained = next.works[id];
    if (!retained) throw new Error("Cannot remove an established SQL work identity");
    if (work.entity_type !== retained.entity_type) {
      const proof = retained.media_history?.find(change => change.from === "MANGA" && change.to === "NOVEL"
        && change.evidence?.source === "myanimelist" && change.evidence.field === "format"
        && ["NOVEL","LIGHT_NOVEL"].includes(change.evidence.value)
        && work.references.some(ref => ref.provider === "mal" && ref.media === "manga" && ref.id === change.evidence.mal_id));
      if (work.entity_type !== "MANGA" || retained.entity_type !== "NOVEL" || !proof) throw new Error("Cannot reclassify SQL work without provider evidence");
    }
    for (const change of work.media_history || []) {
      if (!retained.media_history?.some(value => JSON.stringify(value) === JSON.stringify(change))) throw new Error("Cannot discard SQL media evidence");
    }
  }
  for (const field of ["references","aliases"]) {
    for (const [key,id] of Object.entries(previous[field])) {
      if (next[field][key] !== id) throw new Error(`Cannot reassign or discard SQL ${field}`);
    }
  }
  for (const [key,value] of Object.entries(previous.source_redirects || {})) {
    const update = next.source_redirects?.[key];
    if (!update) throw new Error("Cannot discard SQL source redirects");
    if (update.to !== value.to) {
      const before = previous.source_redirect_evidence[value.evidence], after = next.source_redirect_evidence?.[update.evidence];
      if (!(Date.parse(after?.observed_at) > Date.parse(before?.observed_at))) throw new Error("Contradictory SQL redirect without newer evidence");
    }
  }
}
