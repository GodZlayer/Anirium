import React, { createContext, useContext, useState, useEffect } from "react";
import { setGamificationLanguage } from "../lib/telemetryXpLoop";
import {
  THEME_PALETTES,
  I18N_DICTIONARY,
  DesignTokens,
  SupportedLanguage,
  LocaleStrings,
  getLocalizedTitle as resolveTitle,
  getLocalizedSynopsis as resolveSynopsis,
} from "../lib/designStrings";

interface ThemeContextType {
  theme: DesignTokens;
  tokens: DesignTokens;
  currentThemeId: string;
  setThemeId: (id: string) => void;
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  strings: LocaleStrings;
  getLocalizedTitle: (anime: any) => string;
  getLocalizedSynopsis: (anime: any) => string;
  adultContentEnabled: boolean;
  setAdultContentEnabled: (enabled: boolean) => void;
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
  getLocalizedSynopsis: (anime: any) => anime?.synopsis || "",
  adultContentEnabled: false,
  setAdultContentEnabled: () => {},
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

  const [adultContentEnabled, setAdultContentEnabledState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("anirium_account_adult_24") === "true";
    }
    return false;
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

  const setAdultContentEnabled = (enabled: boolean) => {
    setAdultContentEnabledState(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("anirium_account_adult_24", enabled ? "true" : "false");
      fetch("/api/account/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ adult_content_enabled: enabled }),
      }).catch(() => {});
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    setGamificationLanguage(language);
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(selectedTheme.colors)) root.style.setProperty(`--wc-${key}`, value);
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
  const getLocalizedSynopsis = (anime: any) => resolveSynopsis(anime, language);

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
        getLocalizedSynopsis,
        adultContentEnabled,
        setAdultContentEnabled,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useDesignTheme = () => useContext(ThemeContext);
