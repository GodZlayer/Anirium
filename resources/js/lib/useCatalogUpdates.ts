import { useEffect } from "react";
import { getCatalogRevision, getUniversalCatalog, refreshUnifiedCatalog } from "./parquetCatalog";
import { refreshCatalogSources } from "./catalogSourceRefresh.mjs";
import { catalogPreviewSelected } from "./catalogLocation.mjs";

export function useCatalogUpdates() {
  useEffect(() => {
    let stopped = false, busy = false;
    const controller = new AbortController();
    const check = async () => {
      if (stopped || busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        await refreshCatalogSources({ refreshUnified: refreshUnifiedCatalog, legacyRevision: getCatalogRevision, loadLegacy: getUniversalCatalog,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), allowLegacy: !catalogPreviewSelected() });
      } catch (error) {
        if (!controller.signal.aborted) console.warn("[Catalog refresh]", error);
      } finally {
        busy = false;
        if (!stopped) window.dispatchEvent(new Event("anirium_catalog_check_finished"));
      }
    };
    const timer = window.setInterval(check, 60000);
    window.addEventListener("focus", check);
    void check();
    return () => { stopped = true; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, []);
}
