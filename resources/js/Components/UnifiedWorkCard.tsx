import React from "react";
import type { UnifiedCatalogWork } from "../lib/parquetCatalog";

export function UnifiedWorkCard({ work, onOpen }: { work: UnifiedCatalogWork; onOpen: (work: UnifiedCatalogWork) => void }) {
  return <button onClick={() => onOpen(work)} title={work.title} className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgSurface)]/5 text-left flex md:flex-col focus-visible:outline-2 focus-visible:outline-amber-300">
    <img src={work.cover_image} alt="" loading="lazy" className="w-12 md:w-full h-full md:h-[72%] object-cover shrink-0" />
    <span className="p-2 min-w-0 flex flex-col justify-center gap-1">
      <strong className="text-xs line-clamp-2">{work.title}</strong>
      <span className="text-[11px] opacity-60">{[work.format, work.year].filter(Boolean).join(" · ")}</span>
    </span>
  </button>;
}
