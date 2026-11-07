import { kitsuWorkRecord } from "./kitsu-work-record.mjs";
import { kitsuIdentity } from "./kitsu-evidence.mjs";

const origin = "https://kitsu.app";
async function collection(read, pathname, include, maxPages) {
  const first = new URL(pathname, origin);
  first.searchParams.set("page[limit]", "20");
  first.searchParams.set("page[offset]", "0");
  if (include) first.searchParams.set("include", include);
  let next = first.href, offset = -1;
  const items = [], seen = new Set();
  for (let page = 0; next; page++) {
    if (page >= maxPages) throw new Error("Kitsu pagination budget exhausted");
    const url = new URL(next), parameters = [...url.searchParams.keys()];
    const current = Number(url.searchParams.get("page[offset]")), limit = Number(url.searchParams.get("page[limit]"));
    if (url.origin !== origin || url.username || url.password || url.hash || url.pathname !== pathname
      || parameters.some(key => !["page[offset]", "page[limit]", "include"].includes(key))
      || parameters.length !== new Set(parameters).size || url.searchParams.get("include") !== (include || null)
      || !Number.isSafeInteger(current) || current < 0 || current <= offset || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error("Unsafe Kitsu pagination link");
    const payload = await read(url.href);
    if (!Array.isArray(payload?.data) || (payload.included !== undefined && !Array.isArray(payload.included))) throw new Error("Invalid Kitsu collection");
    for (const item of payload.data) {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) throw new Error("Repeated Kitsu collection identity");
      seen.add(key); items.push(item);
    }
    offset = current;
    if (payload.links?.next !== undefined && payload.links.next !== null && typeof payload.links.next !== "string") throw new Error("Invalid Kitsu next link");
    next = payload.links?.next || null;
  }
  return { items };
}

export async function readKitsuWork(read, media, id, { now = Date.now, maxPages = 100 } = {}) {
  kitsuIdentity({ type: media, id: String(id) });
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 1000) throw new Error("Invalid Kitsu page budget");
  const pathname = `/api/edge/${media}/${id}`, payload = await read(origin + pathname);
  if (payload?.data?.type !== media || payload.data.id !== String(id)) throw new Error("Kitsu response identity mismatch");
  // Separate paginated collections prevent an included-resource limit from looking complete.
  const mappings = await collection(read, pathname + "/mappings", null, maxPages);
  const relations = await collection(read, pathname + "/media-relationships", "destination", maxPages);
  const resource = { ...payload.data, relationships: { ...payload.data.relationships,
    mappings: { data: mappings.items.map(({ type, id }) => ({ type, id })) },
    mediaRelationships: { data: relations.items.map(({ type, id }) => ({ type, id })) } } };
  return kitsuWorkRecord({ data: resource, included: [...mappings.items, ...relations.items] }, new Date(now()).toISOString());
}
