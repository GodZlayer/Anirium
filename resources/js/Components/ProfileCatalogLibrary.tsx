import React, { useState } from "react";
import { Info } from "lucide-react";
import { ProfileLibraryTab } from "./ProfileLibraryTab";
import { useCatalogLibrary, type LibraryView } from "../lib/useCatalogLibrary";
import { useDesignTheme } from "../context/ThemeContext";
import { UNIFIED_CATALOG_STRINGS } from "../lib/unifiedCatalogStrings";
import { CATALOG_STRINGS } from "../lib/catalogStrings";
import type { AnimeRecord } from "./AnimeCard";

export function ProfileCatalogLibrary({ type, onSelectAnime, onPlayAnime }: { type: LibraryView; onSelectAnime: (work: AnimeRecord) => void; onPlayAnime: (work: AnimeRecord) => void }) {
  const [page, setPage] = useState(1);
  const { language, adultContentEnabled } = useDesignTheme();
  const labels = UNIFIED_CATALOG_STRINGS[language] || UNIFIED_CATALOG_STRINGS["pt-BR"];
  const catalogLabels = CATALOG_STRINGS[language] || CATALOG_STRINGS["pt-BR"];
  const result = useCatalogLibrary(type, page, adultContentEnabled);
  if (result.loading) return <p role="status">{labels.loading}</p>;
  if (result.error) return <p role="alert">{catalogLabels.unavailable}</p>;
  return <div className="flex min-h-0 flex-col gap-3">
    <ProfileLibraryTab type={type} universalCatalog={result.items} bookmarkedIds={result.bookmarks} completedWorkIds={result.completed} ratingsMap={result.ratings} onSelectAnime={onSelectAnime} onPlayAnime={onPlayAnime} />
    <div className="flex items-center justify-center gap-4 text-xs">
      <button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{labels.previous}</button>
      <span>{page} / {Math.max(1, result.pages)}</span>
      <button disabled={page >= result.pages} onClick={() => setPage(value => value + 1)}>{labels.next}</button>
      {result.unresolved > 0 && <span title={`${catalogLabels.evidencePending}: ${result.unresolved}`} aria-label={`${catalogLabels.evidencePending}: ${result.unresolved}`}><Info size={14} /></span>}
    </div>
  </div>;
}
