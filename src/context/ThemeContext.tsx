"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  THEME_PALETTES,
  I18N_DICTIONARY,
  DesignTokens,
  SupportedLanguage,
  LocaleStrings,
  getLocalizedTitle as resolveTitle,
} from "@/lib/designStrings";

interface ThemeContextType {
  theme: DesignTokens;
  tokens: DesignTokens;
  currentThemeId: string;
  setThemeId: (id: string) => void;
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  strings: LocaleStrings;
  getLocalizedTitle: (anime: any) => string;
}

const defaultTheme = THEME_PALETTES.black;
const defaultStrings = I18N_DICTIONARY["pt-BR"];

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
  tokens: defaultTheme,
  currentThemeId: "black",
  setThemeId: () => {},
  language: "pt-BR",
  setLanguage: () => {},
  strings: defaultStrings,
  getLocalizedTitle: (anime: any) => anime?.title || "",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("anirium_theme_id") || "black";
    }
    return "black";
  });

  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("anirium_lang") as SupportedLanguage) || "pt-BR";
    }
    return "pt-BR";
  });

  const selectedTheme = THEME_PALETTES[themeId] || THEME_PALETTES.black;
  const selectedStrings = I18N_DICTIONARY[language] || I18N_DICTIONARY["pt-BR"];

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("anirium_lang", lang);
    }
  };

  const handleSetTheme = (id: string) => {
    setThemeId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("anirium_theme_id", id);
    }
  };

  useEffect(() => {
    // Aplica tokens CSS globais em :root com aceleração de hardware
    const root = document.documentElement;
    root.style.setProperty("--color-bg-base", selectedTheme.colors.bgBase);
    root.style.setProperty("--color-bg-surface", selectedTheme.colors.bgSurface);
    root.style.setProperty("--color-bg-raised", selectedTheme.colors.bgRaised);
    root.style.setProperty("--color-border-default", selectedTheme.colors.borderDefault);
    root.style.setProperty("--color-border-highlight", selectedTheme.colors.borderHighlight);
    root.style.setProperty("--color-text-primary", selectedTheme.colors.textPrimary);
    root.style.setProperty("--color-text-secondary", selectedTheme.colors.textSecondary);
    root.style.setProperty("--color-text-muted", selectedTheme.colors.textMuted);
    root.style.setProperty("--color-accent-gold", selectedTheme.colors.accentGold);
    root.style.setProperty("--color-accent-amber", selectedTheme.colors.accentAmber);
  }, [selectedTheme]);

  const getLocalizedTitle = (anime: any) => resolveTitle(anime, language);

  return (
    <ThemeContext.Provider
      value={{
        theme: selectedTheme,
        tokens: selectedTheme,
        currentThemeId: themeId,
        setThemeId: handleSetTheme,
        language,
        setLanguage,
        strings: selectedStrings,
        getLocalizedTitle,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useDesignTheme = () => useContext(ThemeContext);
