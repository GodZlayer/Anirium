/**
 * Fonte Única de Verdade no Cliente (IndexedDB + Delta Sync).
 * Mantém a tabela de obras sincronizada por revisão/blocos incrementais
 * e expõe seletores instantâneos para Grade, Hero, Explorar e Busca multi-título.
 */

export interface LocalCatalogWork {
  id: string;
  media: string;
  title: string;
  titles: string[];
  format: string;
  status: string;
  episode_count: number | null;
  is_adult: boolean;
  image: string | null;
  airing_day: string | null;
  airing_time: string | null;
  latest_episode_num: number | null;
  schedule_status: string | null;
  /** Campo pré-normalizado em memória para busca instantânea multi-título */
  _searchHaystack?: string;
}

export interface CatalogBootProgress {
  phase: "checking" | "downloading_snapshot" | "applying_delta" | "ready" | "error";
  message: string;
  revision?: number;
  count?: number;
}

const DB_NAME = "anirium_catalog_ssot_v1";
const DB_VERSION = 1;
const STORE_WORKS = "works";
const STORE_META = "meta";

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hydrateSearchHaystack(work: LocalCatalogWork): LocalCatalogWork {
  const all = Array.isArray(work.titles) && work.titles.length > 0 ? work.titles : [work.title];
  work._searchHaystack = normalizeSearch(all.join(" | "));
  return work;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_WORKS)) {
        db.createObjectStore(STORE_WORKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getMeta<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? (req.result.value as T) : null);
    req.onerror = () => reject(req.error);
  });
}

async function setMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllWorks(db: IDBDatabase): Promise<LocalCatalogWork[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, "readonly");
    const req = tx.objectStore(STORE_WORKS).getAll();
    req.onsuccess = () => resolve((req.result as LocalCatalogWork[]).map(hydrateSearchHaystack));
    req.onerror = () => reject(req.error);
  });
}

async function replaceAllWorks(db: IDBDatabase, items: LocalCatalogWork[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, "readwrite");
    const store = tx.objectStore(STORE_WORKS);
    store.clear();
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function applyDelta(
  db: IDBDatabase,
  upserts: LocalCatalogWork[],
  deletes: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WORKS, "readwrite");
    const store = tx.objectStore(STORE_WORKS);
    for (const id of deletes) {
      store.delete(id);
    }
    for (const item of upserts) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let memoryWorks: LocalCatalogWork[] = [];
let currentRevision = 0;

/**
 * Inicializa o cache local (IndexedDB) na tela de loading:
 * - Se já está na revisão atual: abre instantaneamente sem baixar nada.
 * - Se há revisão mais nova: baixa apenas o bloco de delta (?since=rev).
 * - Se é o 1º acesso: baixa o snapshot completo e salva em IndexedDB.
 */
export async function bootCatalogLocalStore(
  onProgress?: (progress: CatalogBootProgress) => void
): Promise<{ revision: number; count: number }> {
  onProgress?.({ phase: "checking", message: "Verificando atualizações do catálogo..." });

  const db = await openDb();
  const localRev = (await getMeta<number>(db, "revision")) ?? 0;
  const localScope = (await getMeta<string>(db, "scope")) ?? "";

  const versionRes = await fetch("/api/catalog/version", { headers: { Accept: "application/json" } });
  if (!versionRes.ok) {
    throw new Error(`Catalog version HTTP ${versionRes.status}`);
  }
  const versionData = await versionRes.json();
  const serverRev = Number(versionData.revision ?? 1);
  const serverScope = String(versionData.scope ?? "safe");

  if (localRev > 0 && localRev === serverRev && localScope === serverScope) {
    memoryWorks = await getAllWorks(db);
    currentRevision = localRev;
    onProgress?.({
      phase: "ready",
      message: "Catálogo carregado do cache local.",
      revision: currentRevision,
      count: memoryWorks.length,
    });
    return { revision: currentRevision, count: memoryWorks.length };
  }

  if (localRev > 0 && localRev < serverRev && localScope === serverScope) {
    onProgress?.({ phase: "applying_delta", message: "Aplicando bloco de atualizações..." });
    const deltaRes = await fetch(`/api/catalog/delta?since=${localRev}`, {
      headers: { Accept: "application/json" },
    });
    if (deltaRes.ok) {
      const deltaData = await deltaRes.json();
      await applyDelta(db, deltaData.upserts ?? [], deltaData.deletes ?? []);
      await setMeta(db, "revision", Number(deltaData.revision ?? serverRev));
      memoryWorks = await getAllWorks(db);
      currentRevision = Number(deltaData.revision ?? serverRev);
      onProgress?.({
        phase: "ready",
        message: "Atualizações aplicadas.",
        revision: currentRevision,
        count: memoryWorks.length,
      });
      return { revision: currentRevision, count: memoryWorks.length };
    }
  }

  onProgress?.({ phase: "downloading_snapshot", message: "Baixando base inicial do catálogo..." });
  const snapRes = await fetch("/api/catalog/snapshot", { headers: { Accept: "application/json" } });
  if (!snapRes.ok) {
    throw new Error(`Catalog snapshot HTTP ${snapRes.status}`);
  }
  const snapData = await snapRes.json();
  const items: LocalCatalogWork[] = Array.isArray(snapData.items) ? snapData.items : [];
  await replaceAllWorks(db, items);
  await setMeta(db, "revision", Number(snapData.revision ?? serverRev));
  await setMeta(db, "scope", String(snapData.scope ?? serverScope));

  memoryWorks = items.map(hydrateSearchHaystack);
  currentRevision = Number(snapData.revision ?? serverRev);

  onProgress?.({
    phase: "ready",
    message: "Catálogo pronto.",
    revision: currentRevision,
    count: memoryWorks.length,
  });

  return { revision: currentRevision, count: memoryWorks.length };
}

/**
 * Pesquisa e filtragem instantânea (~1ms) no Explorar e na Topbar
 * usando todas as variações de título (romaji, inglês, nativo, pt-BR e sinônimos).
 */
export function queryLocalExplore(params: {
  query?: string;
  media?: string;
  format?: string;
  status?: string;
  sort?: "title" | "episodes";
  page?: number;
  perPage?: number;
}): { items: LocalCatalogWork[]; total: number; page: number; lastPage: number } {
  const q = normalizeSearch(params.query ?? "");
  const media = (params.media ?? "all").toLowerCase();
  const format = (params.format ?? "all").toUpperCase();
  const status = (params.status ?? "all").toUpperCase();
  const page = Math.max(1, params.page ?? 1);
  const perPage = Math.max(1, params.perPage ?? 24);

  let filtered = memoryWorks.filter((w) => {
    if (media !== "all" && w.media.toLowerCase() !== media) return false;
    if (format !== "ALL" && w.format.toUpperCase() !== format) return false;
    if (status !== "ALL" && w.status.toUpperCase() !== status) return false;
    if (q && !(w._searchHaystack ?? "").includes(q)) return false;
    return true;
  });

  if (params.sort === "episodes") {
    filtered = [...filtered].sort((a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0));
  } else {
    filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
  }

  const total = filtered.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const offset = (page - 1) * perPage;

  return {
    items: filtered.slice(offset, offset + perPage),
    total,
    page,
    lastPage,
  };
}

/**
 * Filtra a Grade de Lançamentos diretamente da mesma base única local (SSOT).
 */
export function getLocalCalendarByDay(): Record<string, LocalCatalogWork[]> {
  const dayMap: Record<string, string> = {
    monday: "mondays",
    tuesday: "tuesdays",
    wednesday: "wednesdays",
    thursday: "thursdays",
    friday: "fridays",
    saturday: "saturdays",
    sunday: "sundays",
  };

  const cal: Record<string, LocalCatalogWork[]> = {
    mondays: [],
    tuesdays: [],
    wednesdays: [],
    thursdays: [],
    fridays: [],
    saturdays: [],
    sundays: [],
  };

  for (const w of memoryWorks) {
    if (!["RELEASING", "PUBLISHING", "CURRENT"].includes(w.status)) continue;
    if (!w.airing_day || !w.image) continue;
    if (w.media !== "anime" && (!w.airing_time || w.airing_time === "00:00")) continue;
    const key = dayMap[w.airing_day.toLowerCase()];
    if (!key) continue;
    cal[key].push(w);
  }

  for (const key of Object.keys(cal)) {
    cal[key].sort((a, b) => (a.airing_time ?? "99:99").localeCompare(b.airing_time ?? "99:99"));
  }

  return cal;
}

export function getLocalCatalogRevision(): number {
  return currentRevision;
}
