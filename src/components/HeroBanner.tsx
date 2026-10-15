"use client";

import React from "react";
import { ChevronRight, Calendar, Sparkles, Orbit, Layers } from "lucide-react";
import { Anime } from "@/types/anime";

interface HeroBannerProps {
  anime: Anime | null;
  onPlay: (anime: Anime) => void;
  onMoreInfo: (anime: Anime) => void;
}

export default function HeroBanner({ anime, onPlay, onMoreInfo }: HeroBannerProps) {
  return (
    <section className="relative w-full pt-28 pb-12 md:pt-36 md:pb-16 px-4 md:px-10 overflow-hidden select-none">
      {/* Background Ambience & Orbital Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-[#FFC766]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[450px] h-[450px] bg-[#FFB347]/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container - Dual Column Concept Layout */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Brand Statement & Typography */}
        <div className="lg:col-span-6 space-y-6 z-10 text-left">
          {/* Welcome Tag */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1A1A1F] border border-[#3A3A43] text-xs font-mono tracking-wider text-[#FFC766]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FFC766] animate-pulse" />
            <span>BEM-VINDO AO ANIRIUM</span>
          </div>

          {/* Hero Typography - Concept Style */}
          <div className="space-y-1">
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#FFF9F0] leading-[1.1]">
              Descubra <br />
              Conecte <br />
              <span className="text-[#FFC766] italic">Acompanhe.</span>
            </h1>
          </div>

          <p className="text-sm sm:text-base text-[#EADCC8]/80 max-w-xl font-normal leading-relaxed">
            Sua plataforma canônica de descoberta, organização e genealogia de franquias de anime.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={() => {
                if (anime) onMoreInfo(anime);
                else {
                  const dest = document.getElementById("destaques");
                  dest?.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-gradient-to-r from-[#FFC766] to-[#FFB347] text-[#0B0B0D] font-bold text-sm shadow-lg shadow-[#FFC766]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <span>Explorar Animes</span>
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>

            <a
              href="#calendario"
              className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-[#1A1A1F] hover:bg-[#23232A] text-[#FFF9F0] border border-[#3A3A43] font-semibold text-sm transition-all active:scale-95"
            >
              <Calendar className="w-4 h-4 text-[#FFC766]" />
              <span>Ver Calendário</span>
            </a>
          </div>
        </div>

        {/* Right Column: Mascote Artístico & Floating Cards */}
        <div className="lg:col-span-6 relative flex items-center justify-center">
          <div className="relative w-full max-w-lg aspect-square flex items-center justify-center">
            {/* Orbital Rings & Flourishes */}
            <img
              src="/assets/dividers/genealogy_orbit.png"
              alt="Orbital"
              className="absolute inset-0 w-full h-full object-contain opacity-40 animate-[spin_60s_linear_infinite] pointer-events-none"
            />
            
            {/* Mascote Hero Image */}
            <div className="relative z-10 w-[88%] h-[88%] rounded-3xl overflow-hidden border border-[#FFC766]/30 bg-gradient-to-b from-[#1A1A1F] to-[#0B0B0D] p-3 shadow-2xl shadow-[#FFC766]/10">
              <img
                src="/assets/logos/Anirium-Persona-LogoArtistica.png"
                alt="Anirium Mascote"
                className="w-full h-full object-cover rounded-2xl transform hover:scale-102 transition-transform duration-700"
              />
            </div>

            {/* Floating Tag Card - As in Concept Image */}
            <div className="absolute -bottom-3 right-4 sm:right-8 z-20 bg-[#1A1A1F]/95 backdrop-blur-md border border-[#3A3A43] px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#23232A] flex items-center justify-center text-[#FFC766]">
                <Sparkles className="w-4 h-4 text-[#FFC766]" />
              </div>
              <div className="text-left">
                <p className="text-[11px] font-bold text-[#FFF9F0]">Mais que uma lista.</p>
                <p className="text-[10px] text-[#FFC766]">Um universo conectado.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
