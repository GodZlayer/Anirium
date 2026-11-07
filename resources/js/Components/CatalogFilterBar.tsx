import React from "react";
import { Search, X } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import {
  CatalogFilters,
  DEFAULT_CATALOG_FILTERS,
  SortKey,
  StatusFilter,
  isDefaultFilters,
} from "../lib/catalogFilters";

interface CatalogFilterBarProps {
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  genres: string[];
  formats: string[];
  resultCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

function FilterSelect({ label, value, onChange, options }: SelectProps) {
  const { tokens } = useDesignTheme();
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-mono" style={{ color: tokens.colors.textMuted }}>
      <span className="uppercase tracking-wider text-[10px]">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2.5 py-1.5 rounded-xl border bg-transparent text-xs font-semibold cursor-pointer outline-none transition-colors hover:border-[#FFC766]"
        style={{
          borderColor: value !== "all" && value !== "popularity" ? tokens.colors.accentGold : tokens.colors.borderDefault,
          color: value !== "all" && value !== "popularity" ? tokens.colors.accentGold : tokens.colors.textPrimary,
          backgroundColor: "rgba(10, 10, 15, 0.6)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ backgroundColor: tokens.colors.bgBase, color: "#FFFFFF" }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Barra de Busca e Filtros Unificada da tela Explorar / Catálogo */
export function CatalogFilterBar({
  filters,
  onChange,
  genres,
  formats,
  resultCount,
  searchQuery,
  onSearchChange,
}: CatalogFilterBarProps) {
  const { tokens, strings } = useDesignTheme();
  const l = strings.labels;
  const set = (patch: Partial<CatalogFilters>) => onChange({ ...filters, ...patch });

  const statusOptions: Array<{ id: StatusFilter; label: string }> = [
    { id: "all", label: l.filterAll },
    { id: "releasing", label: l.releasing },
    { id: "upcoming", label: l.upcoming },
    { id: "finished", label: l.completed },
  ];

  const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: "popularity", label: l.sortPopularity },
    { value: "score", label: l.sortScore },
    { value: "year", label: l.sortYear },
    { value: "title", label: l.sortTitle },
  ];

  const hasActiveFilters = !isDefaultFilters(filters) || searchQuery.trim().length > 0;

  return (
    <div
      className="p-3.5 rounded-3xl border backdrop-blur-xl shadow-xl flex flex-col gap-3 flex-none"
      style={{ backgroundColor: "rgba(15, 17, 23, 0.75)", borderColor: "rgba(255, 255, 255, 0.08)" }}
    >
      {/* LINHA 1: CAMPO DE BUSCA PRINCIPAL UNIFICADO COM FILTRO DE STATUS */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        {/* Campo de Busca Rápida Embutido no Catálogo */}
        <div
          className="flex-1 min-w-[280px] max-w-lg flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border transition-all duration-200 focus-within:border-[#FFC766]"
          style={{
            backgroundColor: "rgba(10, 10, 15, 0.7)",
            borderColor: searchQuery ? tokens.colors.accentGold : "rgba(255, 255, 255, 0.1)",
          }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: searchQuery ? tokens.colors.accentGold : tokens.colors.textMuted }} />
          <input
            type="text"
            placeholder="Pesquisar por título, estúdio, sinopse ou franquia..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-xs font-medium placeholder:text-[color:var(--wc-textMuted)]"
            style={{ color: tokens.colors.textPrimary }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="p-1 rounded-full hover:bg-[color:var(--wc-bgSurface)]/10 text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] transition-colors cursor-pointer"
              title="Limpar pesquisa"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Pílula de Status: Todos, Em Lançamento, Em Breve, Finalizado */}
        <div
          className="flex items-center p-1 rounded-2xl border gap-1"
          style={{ backgroundColor: "rgba(10, 10, 15, 0.6)", borderColor: "rgba(255, 255, 255, 0.08)" }}
        >
          {statusOptions.map((opt) => {
            const active = filters.status === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => set({ status: opt.id })}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  active ? "shadow-md scale-105" : "opacity-60 hover:opacity-100"
                }`}
                style={{
                  backgroundColor: active ? tokens.colors.accentGold : "transparent",
                  color: active ? tokens.colors.bgBase : tokens.colors.textSecondary,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* LINHA 2: CONTROLES DE FILTRAGEM AVANÇADA (FORMATO, GÊNERO, ORDENAÇÃO E CONTADOR) */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-[color:var(--wc-borderDefault)]/5">
        <div className="flex items-center gap-3 flex-wrap">
          <FilterSelect
            label={l.filterFormat}
            value={filters.format}
            onChange={(format) => set({ format })}
            options={[{ value: "all", label: l.filterAll }, ...formats.map((f) => ({ value: f, label: f }))]}
          />
          <FilterSelect
            label={l.filterGenre}
            value={filters.genre}
            onChange={(genre) => set({ genre })}
            options={[{ value: "all", label: l.filterAll }, ...genres.map((g) => ({ value: g, label: g }))]}
          />
          <FilterSelect
            label={l.filterSort}
            value={filters.sort}
            onChange={(sort) => set({ sort: sort as SortKey })}
            options={sortOptions}
          />
          {hasActiveFilters && (
            <button
              onClick={() => {
                onChange(DEFAULT_CATALOG_FILTERS);
                onSearchChange("");
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-mono cursor-pointer hover:border-[#FFC766] transition-colors"
              style={{
                backgroundColor: "rgba(255, 199, 102, 0.1)",
                borderColor: tokens.colors.accentGold,
                color: tokens.colors.accentGold,
              }}
              title={l.filterClear}
            >
              <X className="w-3 h-3" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-[color:var(--wc-textMuted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--wc-stateSuccess)]" />
          <span className="text-[color:var(--wc-textPrimary)] font-bold">{resultCount}</span>
          <span>{l.worksCount} encontradas</span>
        </div>
      </div>
    </div>
  );
}
