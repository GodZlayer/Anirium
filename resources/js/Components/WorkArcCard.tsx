import React from "react";
import type { CanonicalArc } from "../lib/canonicalArcs";

interface Props {
  arc: CanonicalArc; image: string; accent: string; selected: boolean; onSelect: () => void;
  labels: { title: string; classification: string; range: string; count: string; action: string };
}

export function WorkArcCard({ arc, image, accent, selected, labels, onSelect }: Props) {
  return <button type="button" onClick={onSelect}
    aria-label={`${labels.title}. ${labels.range}. ${labels.classification}. ${labels.action}`}
    className="relative group w-full text-left p-4 sm:p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.01] active:scale-98 cursor-pointer backdrop-blur-2xl shadow-xl flex items-center justify-between gap-4 overflow-hidden shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
    style={{ backgroundColor: selected ? "rgba(255, 199, 102, 0.12)" : "rgba(15, 17, 23, 0.75)", borderColor: selected ? accent : "rgba(255, 255, 255, 0.08)", outlineColor: accent }}>
    <img src={image} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-15 filter blur-[1px] group-hover:opacity-25 transition-opacity" />
    <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to right, rgba(15, 17, 23, 0.95) 0%, rgba(10,10,15,0.7) 100%)" }} />
    <span className="relative z-10 flex-1 min-w-0">
      <span className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border backdrop-blur-md"
          style={{ backgroundColor: "rgba(10, 10, 15, 0.7)", borderColor: arc.isFiller ? "rgba(248, 113, 113, 0.4)" : accent, color: arc.isFiller ? "#F87171" : accent }}>
          {arc.name} • {labels.classification}
        </span>
        <span className="text-xs font-mono font-bold text-[color:var(--wc-textMuted)]">{labels.range}</span>
        <span className="text-[color:var(--wc-textMuted)]">•</span>
        <span className="text-xs font-mono text-[color:var(--wc-stateSuccess)] font-bold">{labels.count}</span>
      </span>
      <span className="block font-bold text-sm sm:text-base text-[color:var(--wc-textPrimary)] group-hover:text-[#FFC766] transition-colors truncate">{labels.title}</span>
      {arc.synopsis && <span className="block text-xs font-mono leading-relaxed line-clamp-1 text-[color:var(--wc-textSecondary)] mt-0.5">{arc.synopsis}</span>}
    </span>
    <span className="relative z-10 flex items-center gap-2 text-xs font-mono shrink-0 px-3.5 py-2 rounded-xl border border-[color:var(--wc-borderDefault)]/10 group-hover:border-[#FFC766] group-hover:bg-[#FFC766]/10 transition-all" style={{ color: accent }}>
      <span className="font-semibold hidden sm:inline">{labels.action}</span>
      <span aria-hidden="true" className="group-hover:translate-x-1 transition-transform font-bold">❯</span>
    </span>
  </button>;
}
