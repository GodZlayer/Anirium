const SOURCE_HOSTS = { animefillerlist: "www.animefillerlist.com", myanimelist: "myanimelist.net" };

export function episodeEvidence(work) {
  if (["MANGA", "NOVEL"].includes(work?.entity_type)) return null;
  try {
    const evidence = JSON.parse(work?.filler_episodes_json || "null");
    const id = Number(work?.mal_id || work?.id);
    const source = new URL(evidence.source_url);
    if (evidence.mal_id !== id || !Number.isSafeInteger(id) || id < 1
      || source.protocol !== "https:" || source.username || source.password
      || source.hostname !== SOURCE_HOSTS[evidence.source] || !Number.isFinite(Date.parse(evidence.checked_at))) return null;
    if (["MUSIC", "PV", "CM"].includes(work?.format)) return null;
    return evidence;
  } catch { return null; }
}

export function rangeContains(ranges, episode) {
  if (!Array.isArray(ranges)) return false;
  return ranges.some(range => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(String(range));
    if (!match) return false;
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    return start > 0 && end >= start && end - start <= 2000 && episode >= start && episode <= end;
  });
}

export function classifyEpisode(work, episode) {
  if (!Number.isSafeInteger(episode) || episode < 1) return "unknown";
  const limit = Number(work?.episodes_count || work?.episodes || 0);
  if (limit > 0 && episode > limit) return "unknown";
  const evidence = episodeEvidence(work);
  if (!evidence) return "unknown";
  if (rangeContains(evidence.mixed, episode)) return "mixed";
  const filler = rangeContains(evidence.filler, episode);
  const canon = rangeContains(evidence.canon, episode) || rangeContains(evidence.manga_canon, episode) || rangeContains(evidence.anime_canon, episode);
  if (filler && canon) return "unknown";
  return filler ? "filler" : canon ? "canon" : "unknown";
}
