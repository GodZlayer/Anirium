import React from "react";
import { BookOpen } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { CATALOG_STRINGS } from "../lib/catalogStrings";
import { UNIFIED_CATALOG_STRINGS } from "../lib/unifiedCatalogStrings";
import type { CanonicalArc } from "../lib/canonicalArcs";

export function ArcSourceCredit({ arcs }: { arcs: CanonicalArc[] }) {
  const { language } = useDesignTheme();
  const labels = CATALOG_STRINGS[language] || CATALOG_STRINGS["pt-BR"];
  const sourcesLabel = (UNIFIED_CATALOG_STRINGS[language] || UNIFIED_CATALOG_STRINGS["pt-BR"]).sources;
  const sources = [...new Map(arcs.filter(arc => arc.source_url).map(arc => [arc.source_url, arc])).values()];
  return <span className="inline-flex shrink-0 items-center gap-2">
    {sources.map(arc => {
      const credit = [arc.attribution || new URL(arc.source_url!).hostname, arc.license, arc.modified ? labels.derivedArcData : null].filter(Boolean).join(" · ");
      return <a key={arc.source_url} href={arc.source_url} target="_blank" rel="noopener noreferrer" title={`${sourcesLabel}: ${credit}`} aria-label={`${sourcesLabel}: ${credit}`} onClick={event => event.stopPropagation()} className="text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-stateWarning)]">
        <BookOpen size={14} />
      </a>;
    })}
  </span>;
}
