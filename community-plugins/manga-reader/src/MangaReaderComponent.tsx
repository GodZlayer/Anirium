import React, { useState } from "react";

interface MangaReaderProps {
  anime?: { title?: string };
  resolvedPayload?: {
    title?: string;
    chapterNumber?: number;
    pages?: string[];
  };
  initialEpisode?: number;
  onBack?: () => void;
}

export default function MangaReaderComponent({
  anime,
  resolvedPayload,
  initialEpisode = 1,
  onBack,
}: MangaReaderProps) {
  const pages = resolvedPayload?.pages ?? [];
  const [mode, setMode] = useState<"vertical" | "single">("vertical");
  const [pageIndex, setPageIndex] = useState(0);
  const title = resolvedPayload?.title || anime?.title || "Mangá";
  const chapter = resolvedPayload?.chapterNumber ?? initialEpisode;

  return (
    <div className="flex flex-col w-full h-full min-h-[70vh] bg-neutral-950 text-neutral-100">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-neutral-900/90">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-2.5 py-1 rounded-lg text-xs bg-white/10 hover:bg-white/20"
            >
              Voltar
            </button>
          )}
          <span className="text-sm font-medium truncate">
            {title} — Cap. {chapter}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode(mode === "vertical" ? "single" : "vertical")}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20"
          >
            {mode === "vertical" ? "Modo: Webtoon" : "Modo: Página única"}
          </button>
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-sm text-neutral-400">
          Nenhuma página carregada para este capítulo.
        </div>
      ) : mode === "vertical" ? (
        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-2 p-4">
          {pages.map((src, idx) => (
            <img
              key={`${idx}-${src}`}
              src={src}
              alt={`Página ${idx + 1}`}
              loading="lazy"
              className="max-w-3xl w-full h-auto rounded"
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
          <img
            src={pages[pageIndex]}
            alt={`Página ${pageIndex + 1}`}
            className="max-h-[75vh] w-auto object-contain rounded"
          />
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              className="px-3 py-1 rounded-lg bg-white/10 disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              {pageIndex + 1} / {pages.length}
            </span>
            <button
              type="button"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
              className="px-3 py-1 rounded-lg bg-white/10 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
