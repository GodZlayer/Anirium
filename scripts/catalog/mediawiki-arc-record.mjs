import { createHash } from "node:crypto";
import { wikitextTemplates } from "./wikitext-templates.mjs";

export function wikidataAnimeIdentity(entity, malId) {
  const claims = (entity?.claims?.P4086 || []).filter(claim => claim.rank !== "deprecated");
  if (!/^Q[1-9]\d*$/.test(entity?.id || "") || !Number.isSafeInteger(entity.lastrevid) || entity.lastrevid < 1
    || !claims.length || claims.some(claim => claim.mainsnak?.snaktype !== "value" || !/^[1-9]\d*$/.test(claim.mainsnak?.datavalue?.value || ""))) throw new Error("Unverified Wikidata anime identity");
  const values = new Set(claims.map(claim => claim.mainsnak.datavalue.value));
  if (values.size !== 1 || !values.has(String(malId))) throw new Error("Ambiguous Wikidata anime granularity");
  const link = entity.sitelinks?.enwiki;
  const url = new URL(link?.url);
  if (url.origin !== "https://en.wikipedia.org" || url.username || url.password || url.search || url.hash
    || decodeURIComponent(url.pathname) !== "/wiki/" + link.title.replaceAll(" ", "_")) throw new Error("Unverified Wikipedia sitelink");
  return { title: link.title, entity: entity.id, revision: entity.lastrevid, property: "P4086", value: String(malId), license: "CC0-1.0" };
}

export function mediawikiArcRecords(work, parsed, entity, checkedAt) {
  const malId = Number(work?.mal_id), total = Number(work?.episodes ?? work?.episodes_count);
  if (work.entity_type !== "WORK" || !Number.isSafeInteger(malId) || malId < 1 || !Number.isSafeInteger(total) || total < 1
    || !Number.isFinite(Date.parse(checkedAt))) throw new Error("Missing work boundaries for Wikipedia arcs");
  const identity = wikidataAnimeIdentity(entity, malId);
  if (parsed?.title !== identity.title || !Number.isSafeInteger(parsed.revid) || parsed.revid < 1) throw new Error("Wikipedia work mismatch");
  const nodes = wikitextTemplates(parsed.wikitext?.["*"]), candidates = [];
  for (const table of nodes.filter(node => node.name === "episode table")) {
    if (table.parameters.overallt !== "Story" || table.parameters.seriest !== "Episode") continue;
    const arcs = []; let active = null;
    for (const node of nodes.filter(node => node.parent === table.start)) {
      if (node.name === "episode table/part") {
        const label = node.parameters.subtitle || "", match = /^(Story arc|Side Story)\s+\d+\s*:\s*([^{}<>\[\]|]+)$/i.exec(label);
        if (!match) throw new Error("Unsupported narrative table division");
        active = { name: match[2].trim(), source_label: label, numbers: [] }; arcs.push(active);
      } else if (["episode list/sublist", "episode list"].includes(node.name)) {
        const number = node.parameters.episodenumber2;
        if (!active || !/^[1-9]\d*$/.test(number || "")) throw new Error("Unverified local episode numbering");
        active.numbers.push(Number(number));
      }
    }
    if (!arcs.length) continue;
    const numbers = arcs.flatMap(arc => arc.numbers);
    if (numbers.length !== total || numbers.some((number, index) => number !== index + 1) || arcs.some(arc => !arc.numbers.length)) throw new Error("Ambiguous narrative episode coverage");
    candidates.push(arcs);
  }
  if (!candidates.length) return [];
  if (candidates.length !== 1) throw new Error("Ambiguous Wikipedia episode tables");
  const source = new URL("https://en.wikipedia.org/w/index.php");
  source.search = new URLSearchParams({ title: identity.title, oldid: String(parsed.revid) });
  return candidates[0].map(arc => ({ arcId: "wiki-" + createHash("sha256").update(`${malId}:${identity.entity}:${arc.source_label}`).digest("hex").slice(0, 24),
    name: arc.name, source_label: arc.source_label, startEp: arc.numbers[0], endEp: arc.numbers.at(-1), synopsis: "", classification: "unknown", arcType: "TV_EPISODES",
    sourceWorkMalId: malId, source_url: source.href, source_revision: parsed.revid, identity_evidence: identity,
    verification: "source-matched", checked_at: checkedAt, source_provider: "mediawiki", license: "CC-BY-SA-4.0", attribution: "Wikipedia contributors", modified: true }));
}
