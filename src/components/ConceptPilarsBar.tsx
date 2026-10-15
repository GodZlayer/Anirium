"use client";

import React from "react";
import { Network, Calendar, Compass, Users } from "lucide-react";

export default function ConceptPilarsBar() {
  const pilares = [
    {
      icon: Network,
      title: "Franquias",
      desc: "completas e conectadas",
      href: "#franquias",
    },
    {
      icon: Calendar,
      title: "Calendário",
      desc: "sempre atualizado",
      href: "#calendario",
    },
    {
      icon: Compass,
      title: "Descoberta",
      desc: "por relações e gêneros",
      href: "#generos",
    },
    {
      icon: Users,
      title: "Comunidade",
      desc: "que compartilha o mesmo universo",
      href: "#comunidade",
    },
  ];

  return (
    <section id="pilares" className="max-w-7xl mx-auto px-4 md:px-10 -mt-2 mb-12">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 p-2 rounded-3xl bg-[#1A1A1F]/60 backdrop-blur-md border border-[#3A3A43]/60 shadow-lg">
        {pilares.map((pilar, idx) => {
          const Icon = pilar.icon;
          return (
            <a
              key={idx}
              href={pilar.href}
              className="flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-[#1A1A1F] hover:bg-[#23232A] border border-transparent hover:border-[#FFC766]/30 transition-all duration-300 group"
            >
              <div className="w-10 h-10 rounded-xl bg-[#23232A] group-hover:bg-[#FFC766]/10 border border-[#3A3A43] group-hover:border-[#FFC766]/40 flex items-center justify-center flex-none transition-colors">
                <Icon className="w-5 h-5 text-[#FFC766] transition-transform group-hover:scale-110" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-[#FFF9F0] group-hover:text-[#FFC766] transition-colors truncate">
                  {pilar.title}
                </h4>
                <p className="text-[11px] text-[#EADCC8]/60 truncate font-normal">
                  {pilar.desc}
                </p>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
