import React, { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';

/**
 * Episode status values returned by /api/progress
 */
type EpisodeStatus = 'completed' | 'in_progress' | 'not_started' | 'unreleased';

interface Episode {
  episode: number;
  status: EpisodeStatus;
}

/**
 * EpisodeGrid component
 * - Fetches episode progress data from /api/progress
 * - Applies colour classes based on status and PLUS user flag
 * - Responsive grid layout
 */
export default function EpisodeGrid() {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const { level } = useUser(); // level 2 = PLUS (as per existing logic)
  const isPlus = level === 2;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/progress');
        const data = await res.json();
        if (Array.isArray(data)) {
          setEpisodes(data);
        } else if (Array.isArray(data.episodes)) {
          setEpisodes(
            data.episodes.map((ep: any) => ({
              episode: ep.number ?? ep.episode,
              status: ep.status,
            }))
          );
        }
      } catch (e) {
        console.error('Failed to fetch episode progress');
      }
    }
    load();
  }, []);

  const getBgClass = (status: EpisodeStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-success'; // green
      case 'in_progress':
        return isPlus ? 'bg-warning' : 'bg-secondary'; // yellow for PLUS, else red
      case 'not_started':
        return 'bg-secondary'; // red
      case 'unreleased':
        return 'bg-muted'; // gray
      default:
        return '';
    }
  };

  return (
    <div className="my-10 p-5 rounded-3xl bg-[#1A1A1F] border border-[#3A3A43]/80 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-serif text-lg sm:text-xl font-bold text-[#FFF9F0] flex items-center gap-2">
            <span>Progresso da Temporada</span>
            {isPlus && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FFC766] text-[#0B0B0D]">
                PLUS ATIVO
              </span>
            )}
          </h2>
          <p className="text-xs text-[#EADCC8]/60 mt-0.5">
            Mapeamento cromático contínuo de episódios assistidos e pendentes.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#EADCC8]/80">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#43A047]" />
            <span>Completo</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FDD835]" />
            <span>Pausado</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E53935]" />
            <span>Não assistido</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#9E9E9E]" />
            <span>Não lançado</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
        {episodes.map((ep) => (
          <button
            key={ep.episode}
            className={`h-11 flex items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm hover:brightness-110 active:scale-95 transition-all ${getBgClass(
              ep.status
            )}`}
            aria-label={`Episódio ${ep.episode} – ${ep.status.replace('_', ' ')}`}
          >
            Episódio {ep.episode}
          </button>
        ))}
      </div>
    </div>
  );
}
