import React from "react";

export function WorkSeasonSelector({ seasons, episodes, label, episodeLabel, accent, onOpen }: {
  seasons: Array<{ id: string; number: number }>;
  episodes: Array<{ season_id: string | null }>;
  label: string;
  episodeLabel: string;
  accent: string;
  onOpen: (id: string) => void;
}) {
  if (!seasons.length) return null;
  return <div role="group" aria-label={label} className="flex shrink-0 gap-2 overflow-x-auto py-2">
    {seasons.map(season => <button key={season.id} type="button" onClick={() => onOpen(season.id)}
      className="shrink-0 rounded-lg border border-[color:var(--wc-borderDefault)]/10 px-3 py-2 text-xs hover:border-current focus-visible:outline focus-visible:outline-2"
      style={{ color: accent }}>
      {label} {season.number}
      <span className="ml-2 text-[color:var(--wc-textMuted)]">{episodes.filter(episode => episode.season_id === season.id).length} {episodeLabel}</span>
    </button>)}
  </div>;
}
