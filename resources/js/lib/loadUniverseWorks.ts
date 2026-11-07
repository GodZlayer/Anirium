import { catalogFetch } from "./catalogTransport.mjs";
import { normalizeCatalogWork, type UnifiedCatalogWork } from "./parquetCatalog";
import { loadSqlUniverseWorks } from "./loadSqlUniverseWorks.mjs";

export function loadUniverseWorks(work: UnifiedCatalogWork, adult: boolean, signal: AbortSignal, universeId?: string): Promise<UnifiedCatalogWork[]> {
  return loadSqlUniverseWorks(work,{adult,signal,universeId,fetcher:catalogFetch,normalize:normalizeCatalogWork});
}
