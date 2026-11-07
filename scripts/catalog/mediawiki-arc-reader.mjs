import { mediawikiArcRecords, wikidataAnimeIdentity } from "./mediawiki-arc-record.mjs";

export async function readMediawikiArcs(work, read, { now = Date.now } = {}) {
  const malId = Number(work?.mal_id);
  if (work?.entity_type !== "WORK" || !Number.isSafeInteger(malId) || malId < 1) throw new Error("Unsupported Wikipedia work identity");
  const query = `SELECT ?item ?article WHERE { ?item wdt:P4086 "${malId}" . ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }`;
  const result = await read("https://query.wikidata.org/sparql?" + new URLSearchParams({ query, format: "json" }));
  if (!Array.isArray(result?.results?.bindings)) throw new Error("Invalid Wikidata mapping response");
  const candidates = new Map();
  for (const binding of result.results.bindings) {
    const match = /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(binding.item?.value || "");
    if (binding.item?.type !== "uri" || binding.article?.type !== "uri" || !match) throw new Error("Invalid Wikidata mapping identity");
    candidates.set(`${match[1]}:${binding.article.value}`, { entity: match[1], article: binding.article.value });
  }
  if (!candidates.size) throw Object.assign(new Error("No exact Wikidata anime mapping"), { status: 404 });
  if (candidates.size !== 1) throw new Error("Ambiguous Wikidata anime mappings");
  const candidate = [...candidates.values()][0];
  const entities = await read(`https://www.wikidata.org/wiki/Special:EntityData/${candidate.entity}.json`);
  const entity = entities?.entities?.[candidate.entity], identity = wikidataAnimeIdentity(entity, malId);
  if (new URL(candidate.article).href !== new URL(entity.sitelinks.enwiki.url).href) throw new Error("Wikidata article mismatch");
  const page = await read("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ action: "parse", page: identity.title, prop: "wikitext|revid", format: "json", maxlag: "5" }));
  const checkedAt = new Date(now()).toISOString();
  const arcs = mediawikiArcRecords(work, page?.parse, entity, checkedAt);
  return { mal_id: malId, checkedAt, arcs, outcome: arcs.length ? "sourced-divisions" : "no-supported-evidence" };
}
