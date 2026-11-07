import React from "react";
import type { UnifiedCatalogWork } from "../lib/parquetCatalog";
import { useDesignTheme } from "../context/ThemeContext";

interface CalendarWorkCardProps {
  work: UnifiedCatalogWork;
  airingLabel?: string;
  onOpen: (work: UnifiedCatalogWork) => void;
}

export function CalendarWorkCard({ work, airingLabel, onOpen }: CalendarWorkCardProps) {
  const { getLocalizedTitle } = useDesignTheme();
  const title = getLocalizedTitle ? getLocalizedTitle(work) : work.title;

  return (
    <button
      type="button"
      onClick={() => onOpen(work)}
      title={title}
      className="group relative min-h-0 min-w-0 overflow-hidden rounded-xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgSurface)]/5 text-left flex md:flex-col focus-visible:outline-2 focus-visible:outline-amber-300 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative w-16 md:w-full h-full md:h-[68%] overflow-hidden shrink-0 bg-black/20">
        <img
          src={work.cover_image || work.banner_image || ""}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {airingLabel && (
          <div className="absolute top-1.5 left-1.5 hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-black/75 backdrop-blur-md text-amber-300 border border-amber-300/20 shadow-sm">
            <span>{airingLabel}</span>
          </div>
        )}
      </div>
      <span className="p-2 min-w-0 flex flex-col justify-between flex-1 gap-1">
        <div>
          <strong className="text-xs line-clamp-1 block group-hover:text-amber-400 transition-colors">
            {title}
          </strong>
          {airingLabel && (
            <span className="md:hidden text-[10px] font-mono font-medium text-amber-300 block">
              {airingLabel}
            </span>
          )}
        </div>
        <span className="text-[11px] opacity-60">
          {[work.format, work.year].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  );
}
