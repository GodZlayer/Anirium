import { useEffect, useState } from "react";
import { normalizeCatalogWork, type UnifiedCatalogWork } from "./parquetCatalog";

export type LibraryView = "bookmarks" | "history" | "ratings";
export function useCatalogLibrary(view: LibraryView, page: number, adult: boolean) {
  const [result, setResult] = useState({ loading: true, error: false, pages: 0, unresolved: 0, items: [] as UnifiedCatalogWork[], bookmarks: [] as string[], completed: [] as string[], ratings: {} as Record<string, number> });
  useEffect(() => {
    let controller: AbortController | null = null;
    const refresh = async () => {
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      setResult(previous => ({ ...previous, loading: true, error: false }));
      try {
        const response = await fetch(`/api/account/library?${new URLSearchParams({ view, page: String(page), adult: adult ? "1" : "0" })}`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Library HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.items) || !Number.isSafeInteger(data.pages) || !Number.isSafeInteger(data.unresolved)) throw new Error("Invalid library response");
        const bookmarks: string[] = [], completed: string[] = [], ratings: Record<string, number> = {};
        for (const row of data.items) {
          const reference = `work:${row.work_id}`;
          if (row.library?.bookmarked) bookmarks.push(reference);
          if (row.library?.status === "completed") completed.push(reference);
          if (row.library?.user_score != null) ratings[reference] = Number(row.library.user_score);
        }
        if (!signal.aborted) setResult({ loading: false, error: false, pages: data.pages, unresolved: data.unresolved, items: data.items.map(normalizeCatalogWork), bookmarks, completed, ratings });
      } catch { if (!signal.aborted) setResult(previous => ({ ...previous, loading: false, error: true })); }
    };
    void refresh();
    window.addEventListener("anirium_generation_updated", refresh);
    return () => { controller?.abort(); window.removeEventListener("anirium_generation_updated", refresh); };
  }, [view, page, adult]);
  return result;
}
