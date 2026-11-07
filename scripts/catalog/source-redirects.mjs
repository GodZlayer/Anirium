import { createHash } from "node:crypto";
import { externalKey } from "./external-identity.mjs";

const positive = value => Number.isSafeInteger(value) && value > 0;
function checkedKey(key) {
  const [provider, media, id, extra] = String(key).split(":");
  if (extra !== undefined || externalKey({ provider, media, id }) !== key) throw new Error("Invalid redirect reference");
  return { provider, media, id };
}
export function addMangaBakaRedirect(registry, record, provenance) {
  if (!positive(record?.id) || !positive(record.merged_with) || record.id === record.merged_with) throw new Error("Invalid MangaBaka merged identity");
  if (!/^sha256:[a-f0-9]{64}$/.test(provenance?.digest || "")) throw new Error("Missing redirect snapshot evidence");
  const from = `mangabaka:manga:${record.id}`, to = `mangabaka:manga:${record.merged_with}`;
  const evidence = { provider: "mangabaka", source_url: provenance.url, digest: provenance.digest, observed_at: provenance.sourceUpdatedAt || null };
  const proof = createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 24);
  registry.source_redirects ||= {}; registry.source_redirect_evidence ||= {};
  const previous = registry.source_redirects[from];
  if (previous && previous.to !== to) {
    const before = registry.source_redirect_evidence[previous.evidence];
    if (!(Date.parse(evidence.observed_at) > Date.parse(before?.observed_at))) throw new Error("Contradictory source redirect without newer evidence");
  }
  const visited = new Set([from]);
  let cursor = to;
  while (true) {
    if (visited.has(cursor)) throw new Error("Cyclic source redirects");
    visited.add(cursor);
    if (!registry.source_redirects[cursor]) break;
    cursor = registry.source_redirects[cursor].to;
  }
  registry.source_redirect_evidence[proof] = evidence;
  registry.source_redirects[from] = { to, evidence: proof };
}
export function validateSourceRedirects(registry) {
  const redirects = registry.source_redirects || {}, validated = new Set();
  for (const key of Object.keys(redirects)) {
    const trail = new Set();
    let cursor = key;
    while (redirects[cursor] && !validated.has(cursor)) {
      if (trail.has(cursor)) throw new Error("Cyclic source redirects");
      trail.add(cursor);
      const from = checkedKey(cursor), to = checkedKey(redirects[cursor].to), evidence = registry.source_redirect_evidence?.[redirects[cursor].evidence];
      if (from.provider !== "mangabaka" || to.provider !== from.provider || from.media !== "manga" || to.media !== from.media
        || !/^[1-9]\d*$/.test(from.id) || !/^[1-9]\d*$/.test(to.id) || evidence?.provider !== from.provider
        || !/^sha256:[a-f0-9]{64}$/.test(evidence.digest || "")) throw new Error("Invalid source redirect evidence or namespace");
      cursor = redirects[cursor].to;
    }
    for (const item of trail) validated.add(item);
  }
  return registry;
}
export function resolveExternalReference(registry, reference) {
  let key = typeof reference === "string" ? reference : externalKey(reference);
  checkedKey(key);
  const trail = new Set(), owners = new Set();
  while (true) {
    if (trail.has(key)) throw new Error("Cyclic source redirects");
    trail.add(key);
    if (registry.references[key]) owners.add(registry.references[key]);
    if (!registry.source_redirects?.[key]) break;
    key = registry.source_redirects[key].to;
  }
  if (owners.size > 1) throw new Error("Conflicting established source redirect identities");
  return { key, work_id: registry.references[key] || null, redirected: trail.size > 1 };
}
