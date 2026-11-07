function titleKey(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function eligibleFillerWork(work) {
  return !["MANGA", "NOVEL"].includes(work.entity_type) && ["TV", "ONA"].includes(String(work.format || "").toUpperCase());
}

export function findFillerWork(entities, title) {
  const key = titleKey(title);
  if (!key) return null;
  const matches = [...entities.values()].filter(work => eligibleFillerWork(work)
    && [work.title, work.title_english, work.title_japanese].some(value => value && titleKey(value) === key));
  return matches.length === 1 ? matches[0] : null;
}

export function validFillerRanges(work, ...groups) {
  if (!eligibleFillerWork(work)) return false;
  const limit = Number(work.episodes || 0);
  return groups.every(ranges => Array.isArray(ranges) && ranges.every(range => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(String(range));
    if (!match) return false;
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0
      && end >= start && end - start <= 2000 && (!limit || end <= limit);
  }));
}
