"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Network, Sparkles, ChevronRight, ExternalLink } from "lucide-react";
import { AiringSchedule, Anime } from "@/types/anime";

interface ScheduleFranchisePanelProps {
  onSelectAnime: (anime: Anime) => void;
  onPlayAnime: (anime: Anime) => void;
}

const POPULAR_FRANCHISES = [
  {
    rank: 1,
    title: "One Piece",
    years: "1999 • 15+ obras",
    image: "https://cdn.myanimelist.net/images/anime/6/73245l.jpg",
    mal_id: 21,
  },
  {
    rank: 2,
    title: "Naruto",
    years: "2002 • 12+ obras",
    image: "https://cdn.myanimelist.net/images/anime/13/17405l.jpg",
    mal_id: 20,
  },
  {
    rank: 3,
    title: "Bleach",
    years: "2004 • 10+ obras",
    image: "https://cdn.myanimelist.net/images/anime/3/40451l.jpg",
    mal_id: 269,
  },
  {
    rank: 4,
    title: "Attack on Titan",
    years: "2013 • 9+ obras",
    image: "https://cdn.myanimelist.net/images/anime/10/47347l.jpg",
    mal_id: 16498,
  },
  {
    rank: 5,
    title: "Demon Slayer",
    years: "2019 • 8+ obras",
    image: "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg",
    mal_id: 38000,
  },
];

import { aniriumFetch } from "@/lib/apiConfig";

export default function ScheduleFranchisePanel({ onSelectAnime, onPlayAnime }: ScheduleFranchisePanelProps) {
  const [schedule, setSchedule] = useState<AiringSchedule[]>([]);
  const [activeTab, setActiveTab] = useState<"today" | "tomorrow" | "after" | "week">("today");

  useEffect(() => {
    aniriumFetch("/api/schedule")
      .then((res) => res.json())
      .then((data) => {
        if (data.schedule) setSchedule(data.schedule);
      })
      .catch(() => {});
  }, []);

  const tabs = [
    { key: "today", label: "Hoje", sub: "12 de Set" },
    { key: "tomorrow", label: "Amanhã", sub: "13 de Set" },
    { key: "after", label: "Depois", sub: "14 de Set" },
    { key: "week", label: "Esta Semana", sub: "08 – 14 de Set" },
  ];

  return (
    <section id="calendario" className="max-w-7xl mx-auto px-4 md:px-10 mb-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Calendário de Transmissão (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-[#FFC766]" />
              <div>
                <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#FFF9F0]">
                  Calendário de Transmissão
                </h2>
                <p className="text-xs text-[#EADCC8]/60 mt-0.5">
                  Horários e simulcasts em distribuidores canônicos.
                </p>
              </div>
            </div>
            <a
              href="#destaques"
              className="text-xs text-[#FFC766] hover:underline font-mono"
            >
              Ver calendário completo &rarr;
            </a>
          </div>

          {/* Day Pills Bar */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-none px-4 py-2 rounded-2xl border text-left transition-all ${
                  activeTab === tab.key
                    ? "bg-[#FFC766] text-[#0B0B0D] border-[#FFC766] font-bold shadow-md shadow-[#FFC766]/20"
                    : "bg-[#1A1A1F] text-[#EADCC8] border-[#3A3A43] hover:border-[#FFC766]/40"
                }`}
              >
                <div className="text-xs">{tab.label}</div>
                <div className={`text-[10px] ${activeTab === tab.key ? "text-[#0B0B0D]/80" : "text-[#EADCC8]/50"}`}>
                  {tab.sub}
                </div>
              </button>
            ))}
          </div>

          {/* Schedule Anime List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {schedule.slice(0, 4).map((item, idx) => {
              const anime = item.anime;
              if (!anime) return null;
              const title = anime.title_portuguese || anime.title_english || anime.title;
              const date = new Date(item.airingAt * 1000);
              const timeStr = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

              return (
                <div
                  key={item.id || idx}
                  onClick={() => onSelectAnime(anime)}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] hover:border-[#FFC766]/50 transition-all cursor-pointer group shadow-sm"
                >
                  <div className="w-12 h-14 rounded-xl overflow-hidden bg-[#0B0B0D] flex-none relative">
                    <img
                      src={anime.images.webp?.large_image_url || anime.images.jpg?.large_image_url}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-[#FFF9F0] group-hover:text-[#FFC766] transition-colors truncate">
                      {title}
                    </h4>
                    <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                      Episódio {item.episode}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                      <span className="font-mono text-[#FFC766] font-bold">
                        {timeStr}
                      </span>
                      <span className="text-[#EADCC8]/40">•</span>
                      <span className="text-[#EADCC8]/70">Oficial</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#3A3A43] group-hover:text-[#FFC766] group-hover:translate-x-0.5 transition-all flex-none" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Franquias Populares + Card do Mascote (5 cols) */}
        <div id="franquias" className="lg:col-span-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Network className="w-5 h-5 text-[#FFC766]" />
              <h2 className="font-serif text-xl sm:text-2xl font-bold text-[#FFF9F0]">
                Franquias Populares
              </h2>
            </div>
            <button className="text-xs text-[#EADCC8]/60 hover:text-[#FFC766] transition">
              Ver todas
            </button>
          </div>

          {/* Franchise Ranking List */}
          <div className="space-y-2">
            {POPULAR_FRANCHISES.map((franchise) => (
              <div
                key={franchise.rank}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] hover:border-[#FFC766]/40 transition group cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold font-mono ${
                    franchise.rank === 1
                      ? "bg-[#FFC766] text-[#0B0B0D]"
                      : franchise.rank === 2
                      ? "bg-[#EADCC8] text-[#0B0B0D]"
                      : franchise.rank === 3
                      ? "bg-[#FFB347] text-[#0B0B0D]"
                      : "bg-[#23232A] text-[#EADCC8]"
                  }`}>
                    {franchise.rank}
                  </span>
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#0B0B0D] flex-none">
                    <img
                      src={franchise.image}
                      alt={franchise.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#FFF9F0] group-hover:text-[#FFC766] transition truncate">
                      {franchise.title}
                    </h4>
                    <p className="text-[10px] text-[#EADCC8]/50 font-mono">
                      {franchise.years}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#3A3A43] group-hover:text-[#FFC766] transition flex-none" />
              </div>
            ))}
          </div>

          {/* Mascote Orbital Card - Concept Highlight */}
          <div className="relative overflow-hidden rounded-2xl border border-[#FFC766]/30 bg-gradient-to-r from-[#1A1A1F] via-[#23232A] to-[#1A1A1F] p-4 flex items-center justify-between shadow-lg">
            <div className="space-y-1 z-10 max-w-[65%]">
              <span className="text-[10px] uppercase font-mono text-[#FFC766] tracking-wider font-bold">
                ✦ GENEALOGIA CANÔNICA
              </span>
              <p className="font-serif text-sm font-bold text-[#FFF9F0] leading-snug">
                "Cada obra faz parte de um algo maior."
              </p>
            </div>
            <div className="w-16 h-16 rounded-xl overflow-hidden flex-none border border-[#FFC766]/20 bg-[#0B0B0D]">
              <img
                src="/assets/logos/Anirium-favicon.png"
                alt="Mascote"
                className="w-full h-full object-contain p-1"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
