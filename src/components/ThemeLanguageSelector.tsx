"use client";

import React, { useState } from "react";
import { Palette, Globe, Check } from "lucide-react";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";

/**
 * Micro-componente puro (Casca Branca ~50 linhas)
 * Seletor de Tema e Idioma alojado exatamente à esquerda do perfil.
 * Chaveamento instantâneo em milissegundos sem recarregar a tela.
 */
export default function ThemeLanguageSelector() {
  const { currentThemeId, setThemeId, strings } = useDesignTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState("pt-BR");

  const themes = [
    { id: "black", label: "Dark Clássico", color: "#FFC766" },
    { id: "amoled", label: "AMOLED Puro", color: "#38BDF8" },
    { id: "cyberpunk", label: "Cyberpunk", color: "#00FFCC" },
  ];

  return (
    <div className="relative select-none">
      <Tooltip text="Personalizar Tema e Idioma do Sistema" position="bottom">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#1A1A1F]/80 hover:bg-[#23232A] border border-[#3A3A43] text-zinc-300 hover:text-white transition shadow-sm"
          aria-label="Personalizar Tema e Idioma"
        >
          <Palette className="w-3.5 h-3.5 text-[#FFC766]" />
          <span className="text-[10px] font-mono font-bold uppercase">{language.toUpperCase()}</span>
        </button>
      </Tooltip>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-48 bg-[#141418]/95 backdrop-blur-xl border border-[#3A3A43] rounded-2xl p-2.5 shadow-2xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <p className="text-[10px] font-mono text-zinc-400 px-2 py-1 uppercase tracking-wider">Temas</p>
              <div className="space-y-1">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setThemeId(t.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition ${
                      currentThemeId === t.id ? "bg-[#23232A] text-white font-bold" : "text-zinc-300 hover:bg-[#1A1A1F]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      <span>{t.label}</span>
                    </div>
                    {currentThemeId === t.id && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800">
              <p className="text-[10px] font-mono text-zinc-400 px-2 py-1 uppercase tracking-wider">Idioma</p>
              <div className="flex gap-1.5 px-1">
                <button
                  onClick={() => {
                    setLanguage("pt-BR");
                    setIsOpen(false);
                  }}
                  className={`flex-1 py-1 rounded-lg text-xs font-mono font-semibold transition ${
                    language === "pt-BR" ? "bg-amber-400 text-black font-bold" : "bg-[#1A1A1F] text-zinc-300 hover:text-white"
                  }`}
                >
                  pt-BR
                </button>
                <button
                  onClick={() => {
                    setLanguage("en-US");
                    setIsOpen(false);
                  }}
                  className={`flex-1 py-1 rounded-lg text-xs font-mono font-semibold transition ${
                    language === "en-US" ? "bg-amber-400 text-black font-bold" : "bg-[#1A1A1F] text-zinc-300 hover:text-white"
                  }`}
                >
                  en-US
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

