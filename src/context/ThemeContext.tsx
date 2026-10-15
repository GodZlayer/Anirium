"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { THEME_PALETTES, UI_STRINGS, DesignTokens } from "@/lib/designStrings";

interface ThemeContextType {
  theme: DesignTokens;
  tokens: DesignTokens;
  currentThemeId: string;
  setThemeId: (id: string) => void;
  strings: typeof UI_STRINGS;
}

const defaultTheme = THEME_PALETTES.black;

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
  tokens: defaultTheme,
  currentThemeId: "black",
  setThemeId: () => {},
  strings: UI_STRINGS,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<string>("black");

  const selected = THEME_PALETTES[themeId] || THEME_PALETTES.black;

  useEffect(() => {
    // Aplica as variáveis CSS globais no :root para que Tailwind e componentes herdem os tokens
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
  }, [selected]);

  return (
    <ThemeContext.Provider
      value={{
        theme: selected,
        tokens: selected,
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
