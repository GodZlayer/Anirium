import React from "react";
import { X } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { DEFAULT_CATALOG_FILTERS, type CatalogFilters } from "../lib/catalogFilters";

export function UnifiedCatalogFilters({ filters, facets, onChange, onClear }: {
  filters: CatalogFilters; facets: { formats: string[]; genres: string[] };
  onChange: (filters: CatalogFilters) => void; onClear: () => void;
}) {
  const { strings, tokens } = useDesignTheme();
  const l = strings.labels;
  const fields = [
    { key: "status", label: l.filterAll, options: [["all", l.filterAll], ["releasing", l.releasing], ["upcoming", l.upcoming], ["finished", l.completed]] },
    { key: "format", label: l.filterFormat, options: [["all", l.filterAll], ...facets.formats.map(v => [v, v])] },
    { key: "genre", label: l.filterGenre, options: [["all", l.filterAll], ...facets.genres.map(v => [v, v])] },
    { key: "sort", label: l.filterSort, options: [["popularity", l.sortPopularity], ["score", l.sortScore], ["year", l.sortYear], ["title", l.sortTitle]] },
  ];
  return <div className="grid grid-cols-2 sm:flex gap-2 items-center">
    {fields.map(field => <select key={field.key} aria-label={field.label} value={filters[field.key as keyof CatalogFilters]}
      onChange={event => onChange({ ...filters, [field.key]: event.target.value })}
      className="min-w-0 sm:max-w-48 rounded-lg border border-[color:var(--wc-borderDefault)]/10 p-1.5 text-xs"
      style={{ backgroundColor: tokens.colors.bgBase, color: tokens.colors.textPrimary }}>
      {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>)}
    <button aria-label={l.filterClear} title={l.filterClear} onClick={onClear} className="justify-self-end p-1.5"><X size={16} /></button>
  </div>;
}
