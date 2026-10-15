"use client";

import React, { useState, useEffect } from "react";
import { Clock, ChevronRight } from "lucide-react";
import { AiringSchedule, Anime } from "@/types/anime";

interface WeeklyScheduleProps {
  onSelectAnime?: (anime: Anime) => void;
  onPlayAnime?: (anime: Anime) => void;
}

const DAYS = [
  { index: 0, label: "Dom" },
  { index: 1, label: "Seg" },
  { index: 2, label: "Ter" },
  { index: 3, label: "Qua" },
  { index: 4, label: "Qui" },
  { index: 5, label: "Sex" },
  { index: 6, label: "Sáb" },
];

export default function WeeklySchedule({ onSelectAnime, onPlayAnime }: WeeklyScheduleProps) {
  const [schedule, setSchedule] = useState<AiringSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());

  useEffect(() => {
    fetch("/api/schedule")
      .then((res) => res.json())
      .then((data) => {
        if (data.schedule) setSchedule(data.schedule);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading schedule:");
        setLoading(false);
      });
  }, []);

  // Group items by weekday, sort each group by airing time
  const grouped = React.useMemo(() => {
    const map: Record<number, AiringSchedule[]> = {};
    for (const item of schedule) {
      const day = new Date(item.airingAt * 1000).getDay(); // 0=Sun
      if (!map[day]) map[day] = [];
      map[day].push(item);
    }
    for (const day of Object.keys(map)) {
      map[Number(day)].sort((a, b) => a.airingAt - b.airingAt);
    }
    return map;
  }, [schedule]);

  const dayItems = grouped[selectedDay] ?? [];

  const formatTime = (unix: number) =>
    new Date(unix * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="px-4 md:px-12 py-8">
      {/* Day selector */}
      <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800 w-fit mb-6">
        {DAYS.map((d) => (
          <button
            key={d.index}
            onClick={() => setSelectedDay(d.index)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              selectedDay === d.index
                ? "bg-red-600 text-white shadow-md"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 flex justify-center items-center gap-3 text-gray-400 text-sm">
          <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          <span>Sincronizando grade semanal...</span>
        </div>
      ) : dayItems.length === 0 ? (
        <div className="py-12 text-center bg-zinc-900/40 rounded-xl border border-zinc-800/80 p-6">
          <p className="text-sm text-gray-400">Nenhum lançamento para este dia.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {dayItems.map((item) => {
            const hasAired = item.airingAt * 1000 < Date.now();
            const cover =
              item.anime.images.webp?.large_image_url ||
              item.anime.images.jpg?.large_image_url ||
              item.anime.images.jpg?.image_url;

            return (
              <div
                key={item.id}
                onClick={() => onSelectAnime?.(item.anime)}
                className="group relative flex items-center gap-3 p-3 bg-zinc-900/80 hover:bg-zinc-800 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer shadow-lg"
              >
                {/* Poster */}
                <div className="relative w-16 aspect-[2/3] flex-none rounded-lg overflow-hidden bg-zinc-800">
                  <img
                    src={cover}
                    alt={item.anime.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        hasAired
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-950 text-amber-300 border border-amber-500/30"
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {formatTime(item.airingAt)}
                    </span>
                    <span className="text-[10px] font-bold text-red-500">
                      Ep {item.episode}
                    </span>
                  </div>

                  <h3 className="text-xs md:text-sm font-bold text-white truncate group-hover:text-red-500 transition-colors">
                    {item.anime.title_english || item.anime.title}
                  </h3>

                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {item.anime.genres.map((g) => g.name).slice(0, 2).join(" • ")}
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors flex-none" />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
