import { validateSourceRedirects } from "./source-redirects.mjs";
import { randomUUID } from "node:crypto";
import { externalKey, validateReferences } from "./external-identity.mjs";
import { WORK_UUID, validCatalogAlias } from "../../resources/js/lib/catalogAliases.mjs";
import { referenceKey } from "../../resources/js/lib/catalogIdentity.mjs";

export const emptyRegistry = () => ({ schema: 1, works: {}, references: {}, aliases: {} });

export function validateRegistry(registry) {
  if (registry?.schema !== 1 || !registry.works || !registry.references || !registry.aliases) throw new Error("Invalid catalog registry");
  for (const [uuid, work] of Object.entries(registry.works)) {
    if (!WORK_UUID.test(uuid) || !["WORK", "MANGA", "NOVEL"].includes(work.entity_type) || !Array.isArray(work.aliases)) throw new Error("Invalid registry work");
    if (work.media_history && (!Array.isArray(work.media_history) || work.media_history.some(change => change.from !== "MANGA" || change.to !== "NOVEL"
      || change.evidence?.source !== "myanimelist" || !["NOVEL", "LIGHT_NOVEL"].includes(change.evidence.value)))) throw new Error("Invalid work media history");
    const references = Array.isArray(work.references) && !work.references.length ? [] : validateReferences(work.references);
    for (const ref of references) if (registry.references[externalKey(ref)] !== uuid) throw new Error("Broken registry reference");
    for (const alias of work.aliases) if (!validCatalogAlias(alias) || registry.aliases[alias] !== uuid) throw new Error("Broken registry alias");
    if (work.account_reference != null) {
      const reference = referenceKey(work.account_reference);
      if (reference !== `work:${uuid}` && !work.aliases.includes(reference)) throw new Error("Invalid registry account reference");
    }
  }
  for (const [key, uuid] of Object.entries(registry.references)) {
    if (!registry.works[uuid]?.references.some(ref => externalKey(ref) === key)) throw new Error("Orphan registry reference");
  }
  for (const [alias, uuid] of Object.entries(registry.aliases)) if (!registry.works[uuid]?.aliases.includes(alias)) throw new Error("Orphan registry alias");
  return validateSourceRedirects(registry);
}

export function registerWork(registry, { entity_type = "WORK", references, work_id, aliases = [], media_evidence, title }, { uuid = randomUUID, now = Date.now } = {}) {
  if (!["WORK", "MANGA", "NOVEL"].includes(entity_type)) throw new Error("Invalid catalog media type");
  const refs = Array.isArray(references) && !references.length && work_id && registry.works[work_id] ? [] : validateReferences(references);
  if (refs.some(ref => (ref.media === "anime") !== (entity_type === "WORK"))) throw new Error("Cross-media external identity");
  const matches = new Set(refs.map(ref => registry.references[externalKey(ref)]).filter(Boolean));
  if (work_id) {
    if (!WORK_UUID.test(work_id)) throw new Error("Invalid requested work UUID");
    matches.add(work_id);
  }
  if (matches.size > 1) throw new Error("Conflicting established work identities");
  const id = [...matches][0] || uuid();
  if (!WORK_UUID.test(id)) throw new Error("Invalid generated work UUID");
  const previous = registry.works[id];
  const reclassification = previous?.entity_type === "MANGA" && entity_type === "NOVEL" && media_evidence?.source === "myanimelist"
    && media_evidence.field === "format" && ["NOVEL", "LIGHT_NOVEL"].includes(media_evidence.value)
    && previous.references.some(ref => ref.provider === "mal" && ref.media === "manga" && ref.id === media_evidence.mal_id);
  if (previous && previous.entity_type !== entity_type && !reclassification) throw new Error("Conflicting work media type");
  const incomingReferences = [...(previous?.references || []), ...refs];
  const combined = !incomingReferences.length && previous ? [] : validateReferences(incomingReferences);
  if (!Array.isArray(aliases) || aliases.some(alias => !validCatalogAlias(alias))) throw new Error("Invalid work aliases");
  const allAliases = [...new Set([...(previous?.aliases || []), ...aliases])];
  if (allAliases.some(alias => registry.aliases[alias] && registry.aliases[alias] !== id)) throw new Error("Conflicting work alias");
  const initialAlias = (previous?.aliases || aliases).find(alias => /^(anime|manga|novel):/.test(alias));
  const account_reference = previous?.account_reference || (initialAlias?.startsWith("anime:") ? initialAlias.slice(6) : initialAlias) || `work:${id}`;
  const media_history = [...(previous?.media_history || []), ...(reclassification ? [{ from: "MANGA", to: "NOVEL", evidence: media_evidence }] : [])];
  registry.works[id] = { entity_type, references: combined, aliases: allAliases, account_reference, ...(title || previous?.title ? {title:title || previous.title} : {}), ...(media_history.length ? { media_history } : {}), createdAt: previous?.createdAt || new Date(now()).toISOString() };
  for (const ref of combined) registry.references[externalKey(ref)] = id;
  for (const alias of allAliases) registry.aliases[alias] = id;
  return { work_id: id, ...registry.works[id] };
}
