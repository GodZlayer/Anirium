import { validateReferences } from "./external-identity.mjs";

const idPattern = /^[1-9]\d*$/;
export function kitsuIdentity(resource) {
  if (!["anime", "manga"].includes(resource?.type) || !idPattern.test(resource?.id || "")) throw new Error("Invalid Kitsu resource identity");
  return { provider: "kitsu", media: resource.type, id: resource.id };
}

function linkedResources(resource, included, name, type) {
  const relationship = resource.relationships?.[name];
  if (!Array.isArray(relationship?.data) || relationship.links?.next) throw new Error(`Incomplete Kitsu ${name} evidence`);
  const byId = new Map();
  for (const item of included) {
    const key = `${item.type}:${item.id}`;
    if (byId.has(key)) throw new Error("Duplicate Kitsu included identity");
    byId.set(key, item);
  }
  return relationship.data.map(link => {
    const item = byId.get(`${link.type}:${link.id}`);
    if (link.type !== type || !idPattern.test(link.id || "") || !item) throw new Error(`Missing Kitsu ${name} evidence`);
    return item;
  });
}

export function kitsuReferences(resource, included) {
  const own = kitsuIdentity(resource), references = [own];
  for (const mapping of linkedResources(resource, included, "mappings", "mappings")) {
    const item = mapping.relationships?.item?.data;
    if (item && (item.type !== resource.type || item.id !== resource.id)) throw new Error("Kitsu mapping ownership mismatch");
    const { externalSite: site, externalId: id } = mapping.attributes || {};
    const match = /^(myanimelist|anilist)\/(anime|manga)$/.exec(site || "");
    if (match) {
      if (match[2] !== own.media || !idPattern.test(String(id))) throw new Error("Kitsu mapping namespace mismatch");
      references.push({ provider: match[1] === "myanimelist" ? "mal" : "anilist", media: own.media, id: String(id) });
    } else if (site === "anidb" && own.media === "anime" && idPattern.test(String(id))) {
      references.push({ provider: "anidb", media: "anime", id: String(id) });
    }
    // TVDB season/series and other granularities require their own validated mapping contract.
  }
  return validateReferences(references);
}

export function kitsuRelations(resource, included, observedAt) {
  return linkedResources(resource, included, "mediaRelationships", "mediaRelationships").map(item => {
    const source = item.relationships?.source?.data;
    if (source && (source.type !== resource.type || source.id !== resource.id)) throw new Error("Kitsu relation ownership mismatch");
    const target = kitsuIdentity(item.relationships?.destination?.data);
    const role = item.attributes?.role;
    if (typeof role !== "string" || !role.trim()) throw new Error("Missing Kitsu relation role");
    return { source: "kitsu", relation_type: role === "spinoff" ? "spin_off" : role, raw_type: role, target,
      source_url: `https://kitsu.app/api/edge/media-relationships/${item.id}`, observed_at: observedAt, raw: item };
  });
}
