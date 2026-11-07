import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { useUnifiedCatalogSearch } from "../lib/useUnifiedCatalogSearch";
import { UNIFIED_CATALOG_STRINGS } from "../lib/unifiedCatalogStrings";
import type { UnifiedCatalogWork } from "../lib/parquetCatalog";
import { UnifiedWorkCard } from "./UnifiedWorkCard";
import { CatalogCredits } from "./CatalogCredits";
import { UnifiedCatalogFilters } from "./UnifiedCatalogFilters";
import { DEFAULT_CATALOG_FILTERS } from "../lib/catalogFilters";

export function UnifiedCatalogExplorer({ onOpen, fallback, adult }: { onOpen: (work: UnifiedCatalogWork) => void; fallback: React.ReactNode; adult: boolean }) {
  const { language, tokens } = useDesignTheme();
  const labels = UNIFIED_CATALOG_STRINGS[language] || UNIFIED_CATALOG_STRINGS["pt-BR"];
  const [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [filters, setFilters] = useState(DEFAULT_CATALOG_FILTERS);
  const result = useUnifiedCatalogSearch(query, "anime", page, adult, filters);
  return <section className="h-full min-h-0 flex flex-col gap-3 p-4" style={{ color: tokens.colors.textPrimary }}>
    <div className="flex gap-2 flex-wrap items-center">
      <input aria-label={labels.search} placeholder={labels.search} value={query} maxLength={160} onChange={event => { setQuery(event.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-xl bg-[color:var(--wc-bgSurface)]/5 border border-[color:var(--wc-borderDefault)]/10 p-2 text-sm" />
    </div>
    <UnifiedCatalogFilters filters={filters} facets={result.facets} onChange={next => { setFilters(next); setPage(1); }} onClear={() => { setFilters(DEFAULT_CATALOG_FILTERS); setQuery(""); setPage(1); }} />
    <div role="status" className="text-xs opacity-70">{result.phase === "loading" ? labels.loading : result.phase === "error" || result.phase === "unavailable" ? labels.error : result.total.toLocaleString(language)}</div>
    <div className="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 auto-rows-fr gap-3" aria-busy={result.phase === "loading"}>
      {result.phase === "ready" && result.items.map(work => <UnifiedWorkCard key={work.work_id} work={work} onOpen={onOpen} />)}
      {result.phase === "ready" && !result.items.length && <p className="text-sm col-span-full">{labels.empty}</p>}
    </div>
    <nav className="flex justify-center items-center gap-4 shrink-0">
      <button aria-label={labels.previous} disabled={page <= 1 || result.phase === "loading"} onClick={() => setPage(value => value - 1)}><ChevronLeft /></button>
      <span className="text-xs">{page} / {Math.max(1, result.pages)}</span>
      <button aria-label={labels.next} disabled={page >= result.pages || result.phase === "loading"} onClick={() => setPage(value => value + 1)}><ChevronRight /></button>
      <CatalogCredits />
    </nav>
  </section>;
}
