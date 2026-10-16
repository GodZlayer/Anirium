"use client";

import React, { useState } from "react";
import { Palette, Check } from "lucide-react";
import { useDesignTheme } from "@/context/ThemeContext";
import { THEME_PALETTES, SupportedLanguage } from "@/lib/designStrings";
import Tooltip from "./Tooltip";

/**
 * Micro-componente puro (Casca Branca ~50 linhas)
 * Seletor de Tema e Idioma alojado exatamente à esquerda do perfil.
 * Chaveamento instantâneo em milissegundos com 100% de persistência.
 */
export default function ThemeLanguageSelector() {
  const { currentThemeId, setThemeId, language, setLanguage, strings, tokens } = useDesignTheme();
  const [isOpen, setIsOpen] = useState(false);

  const themeList = Object.values(THEME_PALETTES).map((t) => ({
    id: t.themeId,
    label: t.name,
    color: t.colors.borderHighlight,
  }));

  const languages: Array<{ code: SupportedLanguage; label: string }> = [
    { code: "pt-BR", label: "Português" },
    { code: "en-US", label: "English" },
    { code: "ja-JP", label: "日本語" },
    { code: "es-ES", label: "Español" },
    { code: "fr-FR", label: "Français" },
    { code: "de-DE", label: "Deutsch" },
  ];

  return (
    <div className="relative select-none">
      <Tooltip text={`${strings.labels.themesLabel} & ${strings.labels.languagesLabel}`} position="bottom">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition shadow-sm border"
          style={{
            backgroundColor: "var(--color-bg-surface)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-secondary)",
          }}
          aria-label="Personalizar Tema e Idioma"
        >
          <Palette className="w-3.5 h-3.5" style={{ color: "var(--color-accent-gold)" }} />
          <span className="text-[10px] font-mono font-bold uppercase">{language}</span>
        </button>
      </Tooltip>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className="absolute right-0 top-11 z-50 w-56 rounded-2xl p-3 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-150 border"
            style={{
              backgroundColor: "var(--color-bg-surface)",
              borderColor: "var(--color-border-default)",
            }}
          >
            {/* Seção de Temas */}
            <div>
              <p
                className="text-[10px] font-mono px-1 py-1 uppercase tracking-wider font-bold"
                style={{ color: "var(--color-text-muted)" }}
              >
                {strings.labels.themesLabel}
              </p>
              <div className="space-y-1">
                {themeList.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setThemeId(t.id);
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition"
                    style={{
                      backgroundColor: currentThemeId === t.id ? "var(--color-bg-raised)" : "transparent",
                      color: currentThemeId === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      fontWeight: currentThemeId === t.id ? "bold" : "normal",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      <span>{t.label}</span>
                    </div>
                    {currentThemeId === t.id && (
                      <Check className="w-3.5 h-3.5" style={{ color: "var(--color-accent-gold)" }} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Seção de 6 Idiomas */}
            <div className="pt-2 border-t" style={{ borderColor: "var(--color-border-default)" }}>
              <p
                className="text-[10px] font-mono px-1 py-1 uppercase tracking-wider font-bold"
                style={{ color: "var(--color-text-muted)" }}
              >
                {strings.labels.languagesLabel}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => {
                      setLanguage(l.code);
                      setIsOpen(false);
                    }}
                    className="px-2 py-1.5 rounded-lg text-xs font-mono transition text-center"
                    style={{
                      backgroundColor:
                        language === l.code ? "var(--color-accent-gold)" : "var(--color-bg-raised)",
                      color: language === l.code ? "#000000" : "var(--color-text-secondary)",
                      fontWeight: language === l.code ? "bold" : "normal",
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
