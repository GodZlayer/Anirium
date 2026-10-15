"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Calendar, Clock, Play, ChevronRight, Bell } from "lucide-react";
import { AiringSchedule, Anime } from "@/types/anime";

interface AnimeScheduleProps {
  onSelectAnime: (anime: Anime) => void;
  onPlayAnime: (anime: Anime) => void;
}

const DAYS_OF_WEEK = [
  { key: "today", label: "Hoje" },
  { key: "tomorrow", label: "Amanhã" },
  { key: "yesterday", label: "Ontem" },
  { key: "week", label: "Esta Semana" },
];

export default function AnimeSchedule({ onSelectAnime, onPlayAnime }: AnimeScheduleProps) {
  const [schedule, setSchedule] = useState<AiringSchedule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>("today");

  useEffect(() => {
    fetch("/api/schedule")
      .then((res) => res.json())
      .then((data) => {
        if (data.schedule) {
          setSchedule(data.schedule);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading schedule:");
        setLoading(false);
      });
  }, []);

  const filteredSchedule = React.useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const todayEnd = todayStart + 86400;
    const tomorrowEnd = todayEnd + 86400;
    const yesterdayStart = todayStart - 86400;

    return schedule.filter((item) => {
      const time = item.airingAt;
      if (activeTab === "today") {
        return time >= todayStart && time < todayEnd;
      }
      if (activeTab === "tomorrow") {
        return time >= todayEnd && time < tomorrowEnd;
      }
      if (activeTab === "yesterday") {
        return time >= yesterdayStart && time < todayStart;
      }
      return true; // week
    });
  }, [schedule, activeTab]);

  const formatAiringTime = (unixSeconds: number) => {
    const date = new Date(unixSeconds * 1000);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section id="calendar" className="px-4 md:px-12 py-8 border-t border-zinc-800/60">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-red-600" />
            <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Calendário de Lançamentos
            </h2>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Acompanhe o horário e a transmissão dos novos episódios da semana
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800 self-start md:self-auto">
          {DAYS_OF_WEEK.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === tab.key
                  ? "bg-red-600 text-white shadow-md"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center items-center gap-3 text-gray-400 text-sm">
          <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
          <span>Sincronizando grade semanal de transmissão...</span>
        </div>
      ) : filteredSchedule.length === 0 ? (
        <div className="py-12 text-center bg-zinc-900/40 rounded-xl border border-zinc-800/80 p-6">
          <p className="text-sm text-gray-400">
            Nenhum lançamento previsto para este filtro no momento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSchedule.map((item) => {
            const hasAired = item.airingAt * 1000 < Date.now();
            const cover =
              item.anime.images.webp?.large_image_url ||
              item.anime.images.jpg?.large_image_url ||
              item.anime.images.jpg?.image_url;

            return (
              <div
                key={item.id}
                onClick={() => onSelectAnime(item.anime)}
                className="group relative flex items-center gap-3 p-3 bg-zinc-900/80 hover:bg-zinc-850 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer shadow-lg hover:shadow-black/50"
              >
                {/* Poster Thumbnail */}
                <div className="relative w-16 aspect-[2/3] flex-none rounded-lg overflow-hidden bg-zinc-800">
                  {/* Poster Thumbnail */}
                  <img
                    src={cover}
                    alt={item.anime.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                </div>

                {/* Details */}
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
                      {formatAiringTime(item.airingAt)}
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

                    <div className="flex items-center gap-2 mt-2">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded transition-colors border border-zinc-700">
                        <span>Ver Detalhes & Franquia</span>
                      </span>
                    </div>
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
