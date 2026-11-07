import { referenceKey, catalogIdentity } from "./catalogIdentity.mjs";
import { WORK_UUID } from "./catalogAliases.mjs";

const hexDigest = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
const hashPattern = /^[a-f0-9]{64}$/;

export function createCatalogGenerationClient({ request = fetch, decode, normalize = row => row, resolveReference, onChange = () => {} } = {}) {
  let active = null, lookup = null;
  let requestedRefresh = 0, appliedRefresh = 0;
  const pending = new Map();
  const loaded = new Map();
  async function checked(descriptor, generation) {
    const prefix = `/data/catalog/v2/${generation}/`;
    if (!descriptor?.url?.startsWith(prefix) || !/^[a-z0-9][a-z0-9._-]*\.(json|parquet)$/.test(descriptor.url.slice(prefix.length)) || !hashPattern.test(descriptor.sha256)) throw new Error("Invalid catalog asset descriptor");
    const response = await request(descriptor.url, { cache: "force-cache", signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Catalog asset HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (await hexDigest(bytes) !== descriptor.sha256) throw new Error("Catalog asset checksum mismatch");
    return bytes;
  }
  async function manifest({ signal } = {}) {
    const sequence = ++requestedRefresh;
    const requestSignal = signal || AbortSignal.timeout(20000);
    const response = await request("/data/catalog.manifest.json", { cache: "no-cache", signal: requestSignal });
    if (!response.ok) throw Object.assign(new Error(`Catalog manifest HTTP ${response.status}`), { code: "CATALOG_MANIFEST_UNAVAILABLE", status: response.status });
    const next = await response.json();
    if (next.schema !== 2 || !WORK_UUID.test(next.generation) || !Array.isArray(next.files) || !next.files.length || !hashPattern.test(next.revision)) throw new Error("Invalid catalog generation");
    if (next.files.some(file => !["anime", "manga", "novel"].includes(file.media) || !Number.isSafeInteger(file.rows) || file.rows < 1)
      || next.files.reduce((sum, file) => sum + file.rows, 0) !== next.works) throw new Error("Invalid catalog generation totals");
    if (next.identities && (next.identities.schema !== 1 || next.identities.authority !== "sql"
      || !Array.isArray(next.identities.roles) || next.identities.roles.length !== 2 || !["work", "universe"].every(role => next.identities.roles.includes(role)))) throw new Error("Invalid catalog identity authority");
    const revision = await hexDigest(new TextEncoder().encode(JSON.stringify({ files: next.files, lookup: next.lookup, ...(next.search ? { search: next.search } : {}), ...(next.identities ? { identities: next.identities } : {}) })));
    if (revision !== next.revision) throw new Error("Invalid catalog generation revision");
    requestSignal.throwIfAborted();
    if (sequence < appliedRefresh) return active;
    if (active?.generation === next.generation && active.revision !== next.revision) throw new Error("Immutable catalog generation changed");
    const changed = active && active.revision !== next.revision;
    if (active?.generation !== next.generation) { lookup = null; pending.clear(); loaded.clear(); }
    appliedRefresh = sequence;
    active = next;
    if (changed) onChange(next);
    return next;
  }
  async function partition(descriptor, generation) {
    const key = descriptor.url;
    if (loaded.has(key)) return loaded.get(key);
    if (!pending.has(key)) {
      const task = checked(descriptor, generation).then(decode).then(rows => {
        if (rows.length !== descriptor.rows || new Set(rows.map(row => catalogIdentity(row).catalog_key)).size !== rows.length) throw new Error("Invalid catalog partition identities");
        const entity = { anime: "WORK", manga: "MANGA", novel: "NOVEL" }[descriptor.media];
        if (rows.some(row => !row.work_id || row.entity_type !== entity)) throw new Error("Invalid catalog partition media");
        const items = rows.map(normalize);
        if (active?.generation === generation) {
          loaded.set(key, items);
          if (loaded.size > 1) loaded.delete(loaded.keys().next().value);
        }
        return items;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
    }
    return pending.get(key);
  }
  const client = {
    refresh: manifest,
    revision: () => active?.revision || null,
    async page(media, index = 0) {
      const snapshot = active || await manifest(), files = snapshot.files.filter(file => file.media === media);
      if (!Number.isSafeInteger(index) || index < 0) throw new Error("Invalid catalog page");
      return { items: files[index] ? await partition(files[index], snapshot.generation) : [], pages: files.length,
        total: files.reduce((sum, file) => sum + file.rows, 0), generation: snapshot.generation };
    },
    async resolve(reference, refreshed = false) {
      const key = referenceKey(reference);
      if (!key) return null;
      const snapshot = active || await manifest();
      if (resolveReference && snapshot.search?.schema >= 2) {
        const entry = await resolveReference(reference);
        if (!entry) return null;
        if (entry.generation !== snapshot.generation && !refreshed) { await manifest(); return client.resolve(reference, true); }
        const descriptor = snapshot.files.find(file => file.url === entry.url);
        if (!descriptor || entry.generation !== snapshot.generation || !WORK_UUID.test(entry.work_id)) throw new Error("Invalid work lookup response");
        return (await partition(descriptor, snapshot.generation)).find(row => row.work_id === entry.work_id) || null;
      }
      const index = lookup?.generation === snapshot.generation ? lookup.value : JSON.parse(new TextDecoder().decode(await checked(snapshot.lookup, snapshot.generation)));
      lookup = { generation: snapshot.generation, value: index };
      const entry = index[key];
      if (!entry) return null;
      const descriptor = snapshot.files.find(file => file.url === entry.url);
      if (!descriptor || !WORK_UUID.test(entry.work_id)) throw new Error("Invalid catalog lookup entry");
      return (await partition(descriptor, snapshot.generation)).find(row => row.work_id === entry.work_id) || null;
    },
  };
  return client;
}
