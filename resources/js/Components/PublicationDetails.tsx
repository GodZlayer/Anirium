import React from "react";
import { useDesignTheme } from "../context/ThemeContext";
import type { UnifiedCatalogWork } from "../lib/parquetCatalog";

const TEXT: Record<string, [string, string, string]> = {
  "pt-BR": ["Capítulos", "Volumes", "Índices detalhados ainda não disponíveis com fonte."],
  "en-US": ["Chapters", "Volumes", "Sourced detailed indices are not available yet."],
  "ja-JP": ["話数", "巻数", "出典付きの詳細な目次は未登録です。"],
  "es-ES": ["Capítulos", "Volúmenes", "Los índices detallados con fuente aún no están disponibles."],
  "fr-FR": ["Chapitres", "Volumes", "Les index détaillés sourcés ne sont pas encore disponibles."],
  "de-DE": ["Kapitel", "Bände", "Belegte Detailverzeichnisse sind noch nicht verfügbar."],
};

export function PublicationDetails({ work }: { work: UnifiedCatalogWork }) {
  const { language } = useDesignTheme(), labels = TEXT[language] || TEXT["pt-BR"];
  return <section className="lg:col-span-8 min-h-0 flex flex-col justify-center items-center gap-6 rounded-3xl border border-[color:var(--wc-borderDefault)]/10 p-5">
    <div className="flex gap-8">
      {[[labels[0], work.chapters_count], [labels[1], work.volumes_count]].map(([label, count]) => <div key={label} className="text-center">
        <strong className="block text-3xl">{count ?? "—"}</strong><span className="text-xs opacity-60">{label}</span>
      </div>)}
    </div>
    <p className="text-xs opacity-60 text-center">{labels[2]}</p>
  </section>;
}
