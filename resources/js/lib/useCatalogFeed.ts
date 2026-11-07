import { useEffect, useState } from "react";
import { normalizeCatalogWork, type UnifiedCatalogWork } from "./parquetCatalog";
import { catalogFetch } from "./catalogTransport.mjs";
import { feedRefreshDelay } from "./feedRefreshClock.mjs";
import { validateHomeReleases } from "./catalogRelease.mjs";

export function useCatalogFeed(view: "home" | "calendar", adult: boolean, enabled = true) {
  const [result, setResult] = useState({ ready: false, phase: "loading", items: [] as UnifiedCatalogWork[] });
  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | null = null, stopped = false, timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      if (timer) clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal, items: UnifiedCatalogWork[] = [];
      let generation: string | null = null, nextRelease: string | null = null;
      try {
        for (let page = 1; ; page++) {
          const parameters = new URLSearchParams({ view, page: String(page), adult: adult ? "1" : "0" });
          const response = await catalogFetch(`/api/catalog/feed?${parameters}`, { signal, cache: "no-store" });
          if (!response.ok) throw new Error(`Catalog feed HTTP ${response.status}`);
          const data = await response.json();
          if (!Array.isArray(data.items) || !Number.isSafeInteger(data.pages) || (generation && generation !== data.generation)) throw new Error("Invalid catalog feed generation");
          generation = data.generation;
          nextRelease = data.next_release_at || null;
          items.push(...data.items.map(normalizeCatalogWork));
          if (view === "home" || page >= data.pages) break;
        }
        if (view === "home") validateHomeReleases(items);
        if (!stopped && !signal.aborted) setResult({ ready: true, phase: "ready", items });
      } catch (error) { if (!stopped && !signal.aborted) { setResult({ ready:false, phase:"error", items:[] }); console.warn("[Catalog feed]", error); } }
      finally { if (!stopped && !signal.aborted && view === "home") timer = setTimeout(refresh, feedRefreshDelay(nextRelease)); }
    };
    void refresh();
    window.addEventListener("anirium_generation_updated", refresh);
    window.addEventListener("focus", refresh);
    return () => { stopped = true; if (timer) clearTimeout(timer); controller?.abort(); window.removeEventListener("anirium_generation_updated", refresh); window.removeEventListener("focus", refresh); };
  }, [view, adult, enabled]);
  return result;
}
