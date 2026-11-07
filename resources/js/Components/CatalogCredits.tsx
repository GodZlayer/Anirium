import React from "react";
import { SOURCE_CONTRACTS } from "../../../scripts/catalog/source-contracts.mjs";
import { useDesignTheme } from "../context/ThemeContext";
import { UNIFIED_CATALOG_STRINGS } from "../lib/unifiedCatalogStrings";

export function CatalogCredits() {
  const { language } = useDesignTheme();
  const label = (UNIFIED_CATALOG_STRINGS[language] || UNIFIED_CATALOG_STRINGS["pt-BR"]).sources;
  const sources = Object.entries(SOURCE_CONTRACTS).filter(([, source]: any) => source.enabled !== false && source.documentation);
  return <details className="relative ml-auto text-xs">
    <summary className="cursor-pointer opacity-70 focus-visible:outline-2">{label}</summary>
    <div className="absolute right-0 bottom-full mb-2 w-72 rounded-xl border border-[color:var(--wc-borderDefault)]/15 bg-[color:var(--wc-bgRaised)] p-3 shadow-xl z-30 flex flex-col gap-3">
      {sources.map(([name, source]: any) => <div key={name}>
        <a href={source.documentation} target="_blank" rel="noreferrer" className="underline">{name}</a>
        {source.license && <span className="block opacity-60 text-[11px]">{source.license}</span>}
      </div>)}
    </div>
  </details>;
}
