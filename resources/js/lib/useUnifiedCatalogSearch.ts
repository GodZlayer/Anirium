import { useEffect, useRef, useState } from "react";
import { DEFAULT_CATALOG_FILTERS, type CatalogFilters } from "./catalogFilters";
import { normalizeCatalogWork, type UnifiedCatalogWork } from "./parquetCatalog";
import { requestCatalogSearch } from "./catalogSearchRequest.mjs";

export function useUnifiedCatalogSearch(query: string, media: string, page: number, adult: boolean, filters: CatalogFilters = DEFAULT_CATALOG_FILTERS) {
  const [result, setResult] = useState({ phase: "loading", items: [] as UnifiedCatalogWork[], pages: 0, total: 0 });
  const [revision, setRevision] = useState(0);
  const facets = useRef({ key: "", formats: [] as string[], genres: [] as string[] });
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("anirium_generation_updated", refresh);
    return () => window.removeEventListener("anirium_generation_updated", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult(previous => ({ ...previous, phase: "loading" }));
    const timer = setTimeout(async () => {
      try {
        const parameters = new URLSearchParams({ q: query, media, page: String(page), adult: adult ? "1" : "0" });
        const facetKey = `${media}:${adult}:${revision}`;
        const needsFacets = facets.current.key !== facetKey;
        if (needsFacets) parameters.set("facets", "1");
        for (const [key, value] of Object.entries(filters)) if (value !== "all") parameters.set(key, value);
        const data = await requestCatalogSearch(parameters, controller.signal);
        if (needsFacets && data.facets && Array.isArray(data.facets.formats) && Array.isArray(data.facets.genres)) {
          facets.current = { key: facetKey, formats: data.facets.formats.filter((v: unknown) => typeof v === "string"), genres: data.facets.genres.filter((v: unknown) => typeof v === "string") };
        }
        setResult({ phase: "ready", items: data.items.map(normalizeCatalogWork), pages: data.pages, total: data.total });
      } catch (error: any) {
        if (!controller.signal.aborted) setResult(previous => ({ ...previous, phase: error.message === "unavailable" ? "unavailable" : "error" }));
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, media, page, adult, revision, filters.status, filters.format, filters.genre, filters.sort]);
  return { ...result, facets: facets.current };
}
