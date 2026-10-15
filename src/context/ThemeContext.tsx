"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { THEME_PALETTES, UI_STRINGS, DesignTokens } from "./designStrings";

interface ThemeContextType {
  theme: DesignTokens;
  currentThemeId: string;
  setThemeId: (id: string) => void;
  strings: typeof UI_STRINGS;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: THEME_PALETTES.black,
  currentThemeId: "black",
  setThemeId: () => {},
  strings: UI_STRINGS,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<string>("black");

  useEffect(() => {
    // Aplica as variáveis CSS globais no :root para que Tailwind e componentes herdem os tokens
    const selected = THEME_PALETTES[themeId] || THEME_PALETTES.black;
    const root = document.documentElement;

    root.style.setProperty("--color-bg-base", selected.colors.bgBase);
    root.style.setProperty("--color-bg-surface", selected.colors.bgSurface);
    root.style.setProperty("--color-bg-raised", selected.colors.bgRaised);
    root.style.setProperty("--color-border-default", selected.colors.borderDefault);
    root.style.setProperty("--color-border-highlight", selected.colors.borderHighlight);
    root.style.setProperty("--color-text-primary", selected.colors.textPrimary);
    root.style.setProperty("--color-text-secondary", selected.colors.textSecondary);
    root.style.setProperty("--color-accent-gold", selected.colors.accentGold);
    root.style.setProperty("--color-accent-amber", selected.colors.accentAmber);
  }, [themeId]);

  return (
    <ThemeContext.Provider
      value={{
        theme: THEME_PALETTES[themeId] || THEME_PALETTES.black,
        currentThemeId: themeId,
        setThemeId,
        strings: UI_STRINGS,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useDesignTheme = () => useContext(ThemeContext);
