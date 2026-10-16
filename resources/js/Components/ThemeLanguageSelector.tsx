import React, { useState, useRef, useEffect } from "react";
import { Palette, ChevronDown } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { SupportedLanguage, THEME_PALETTES } from "../lib/designStrings";

// Mapeamento de bandeiras canônicas e rótulos
const LANGUAGE_CONFIG: Record<SupportedLanguage, { flag: string; label: string; nativeName: string }> = {
  "pt-BR": { flag: "🇧🇷", label: "PT-BR", nativeName: "Português" },
  "en-US": { flag: "🇺🇸", label: "EN-US", nativeName: "English" },
  "ja-JP": { flag: "🇯🇵", label: "JA-JP", nativeName: "日本語" },
  "es-ES": { flag: "🇪🇸", label: "ES-ES", nativeName: "Español" },
  "fr-FR": { flag: "🇫🇷", label: "FR-FR", nativeName: "Français" },
  "de-DE": { flag: "🇩🇪", label: "DE-DE", nativeName: "Deutsch" },
};

export function ThemeLanguageSelector() {
  const { currentThemeId, setThemeId, language, setLanguage, tokens, strings } = useDesignTheme();

  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);

  const langRef = useRef<HTMLDivElement>(null);
  const themeRef = useRef<HTMLDivElement>(null);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
        setIsThemeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentFlag = LANGUAGE_CONFIG[language]?.flag || "🌐";
  const activePalette = THEME_PALETTES[currentThemeId] || THEME_PALETTES.black;

  return (
    <div className="flex items-center gap-2 relative">
      {/* 1. SELETOR DE IDIOMAS (Apenas a bandeira antes de abrir) */}
      <div ref={langRef} className="relative">
        <button
          onClick={() => {
            setIsLangOpen(!isLangOpen);
            setIsThemeOpen(false);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-200 hover:scale-105 cursor-pointer backdrop-blur-md"
          style={{
            backgroundColor: tokens.colors.bgSurface,
            borderColor: isLangOpen ? tokens.colors.accentGold : tokens.colors.borderDefault,
          }}
          title={strings.labels.languagesLabel}
        >
          <span className="text-base leading-none select-none">{currentFlag}</span>
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-200 ${isLangOpen ? "rotate-180" : ""}`}
            style={{ color: tokens.colors.textMuted }}
          />
        </button>

        {/* Menu Dropdown de Idiomas */}
        {isLangOpen && (
          <div
            className="absolute right-0 mt-2 w-44 rounded-2xl border shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
            style={{
              backgroundColor: tokens.colors.bgOverlay,
              borderColor: tokens.colors.borderDefault,
            }}
          >
            {(Object.keys(LANGUAGE_CONFIG) as SupportedLanguage[]).map((langKey) => {
              const item = LANGUAGE_CONFIG[langKey];
              const isSelected = language === langKey;
              return (
                <button
                  key={langKey}
                  onClick={() => {
                    setLanguage(langKey);
                    setIsLangOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    isSelected ? "shadow-sm" : "hover:bg-white/5"
                  }`}
                  style={{
                    backgroundColor: isSelected ? `${tokens.colors.accentGold}25` : "transparent",
                    color: isSelected ? tokens.colors.accentGold : tokens.colors.textPrimary,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none">{item.flag}</span>
                    <span>{item.nativeName}</span>
                  </span>
                  <span className="text-[10px] font-mono opacity-60 uppercase">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. SELETOR DE TEMAS (Apenas ícone de seletor antes de abrir) */}
      <div ref={themeRef} className="relative">
        <button
          onClick={() => {
            setIsThemeOpen(!isThemeOpen);
            setIsLangOpen(false);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-200 hover:scale-105 cursor-pointer backdrop-blur-md"
          style={{
            backgroundColor: tokens.colors.bgSurface,
            borderColor: isThemeOpen ? tokens.colors.accentGold : tokens.colors.borderDefault,
          }}
          title={strings.labels.themesLabel}
        >
          <Palette className="w-3.5 h-3.5" style={{ color: tokens.colors.accentGold }} />
          <span
            className="w-2.5 h-2.5 rounded-full border"
            style={{
              backgroundColor: activePalette.colors.accentGold,
              borderColor: activePalette.colors.borderHighlight,
            }}
          />
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-200 ${isThemeOpen ? "rotate-180" : ""}`}
            style={{ color: tokens.colors.textMuted }}
          />
        </button>

        {/* Menu Dropdown de Temas */}
        {isThemeOpen && (
          <div
            className="absolute right-0 mt-2 w-48 rounded-2xl border shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
            style={{
              backgroundColor: tokens.colors.bgOverlay,
              borderColor: tokens.colors.borderDefault,
            }}
          >
            {Object.values(THEME_PALETTES).map((pal) => {
              const isSelected = currentThemeId === pal.themeId;
              return (
                <button
                  key={pal.themeId}
                  onClick={() => {
                    setThemeId(pal.themeId);
                    setIsThemeOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                    isSelected ? "shadow-sm" : "hover:bg-white/5"
                  }`}
                  style={{
                    backgroundColor: isSelected ? `${pal.colors.accentGold}25` : "transparent",
                    color: isSelected ? pal.colors.accentGold : tokens.colors.textPrimary,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full border flex-shrink-0"
                      style={{
                        backgroundColor: pal.colors.bgBase,
                        borderColor: pal.colors.accentGold,
                      }}
                    />
                    <span>{pal.name}</span>
                  </span>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: pal.colors.accentGold }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
