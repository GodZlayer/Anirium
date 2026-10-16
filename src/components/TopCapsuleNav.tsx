"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, Home, Compass, Calendar, Network, X } from "lucide-react";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";
import LolProfileBadge from "./LolProfileBadge";
import ThemeLanguageSelector from "./ThemeLanguageSelector";

interface TopCapsuleNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSearch: (query: string) => void;
  onOpenProfile: () => void;
  onOpenLevelSwitcher: () => void;
  isSearching: boolean;
  onClearSearch: () => void;
}

/**
 * Cápsula Flutuante de Comando Acrílica/Glassmorphism (~65 linhas)
 * Topo fixo ultra-discreto que mantém a viewport de 100vh desobstruída.
 */
export default function TopCapsuleNav({
  activeTab,
  onTabChange,
  onSearch,
  onOpenProfile,
  onOpenLevelSwitcher,
  isSearching,
  onClearSearch,
}: TopCapsuleNavProps) {
  const { tokens, strings } = useDesignTheme();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) inputRef.current?.focus();
  }, [showSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) onSearch(searchQuery.trim());
  };

  const navItems = [
    { id: "inicio", label: strings.navigation.home, icon: Home },
    { id: "explorar", label: strings.navigation.explore, icon: Compass },
    { id: "calendario", label: strings.navigation.calendar, icon: Calendar },
    { id: "franquias", label: strings.navigation.franchises, icon: Network },
  ];

  return (
    <header
      className="h-14 flex-none px-3 sm:px-6 flex items-center justify-between gap-3 backdrop-blur-xl border-b z-40 select-none transition-colors duration-500"
      style={{
        backgroundColor: "var(--color-bg-base)",
        borderColor: "var(--color-border-default)",
      }}
    >
      {/* Esquerda: Logo Oficial */}
      <div className="flex items-center flex-shrink-0">
        <Link href="/" className="flex items-center group">
          <img
            src="/assets/logos/Anirium-Textlogo.png"
            alt="Anirium"
            className="h-7 w-auto object-contain drop-shadow-[0_2px_8px_rgba(255,199,102,0.2)] group-hover:scale-105 transition-transform"
          />
        </Link>
      </div>

      {/* Centro: Cápsula Acrílica de Comando de Mundos */}
      <nav
        className="flex items-center backdrop-blur-md p-1 rounded-full border text-xs shadow-inner"
        style={{
          backgroundColor: "var(--color-bg-surface)",
          borderColor: "var(--color-border-default)",
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = !isSearching && activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full transition-all duration-300 font-semibold"
              style={{
                backgroundColor: isActive ? "var(--color-accent-gold)" : "transparent",
                color: isActive ? "#000000" : "var(--color-text-secondary)",
                boxShadow: isActive ? "0 4px 12px rgba(0,0,0,0.3)" : "none",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Direita: Busca Expansível, Controles de Tema/i18n e Avatar Estilo LoL */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Barra de Busca Expansível */}
        <div className="relative flex items-center">
          {showSearch ? (
            <form onSubmit={handleSearchSubmit} className="flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={strings.navigation.searchPlaceholder}
                className="w-40 sm:w-64 rounded-full py-1 pl-3 pr-7 text-xs focus:outline-none border shadow-inner transition-all"
                style={{
                  backgroundColor: "var(--color-bg-surface)",
                  borderColor: "var(--color-border-highlight)",
                  color: "var(--color-text-primary)",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                  if (isSearching) onClearSearch();
                }}
                className="absolute right-2 text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <Tooltip text={strings.navigation.searchPlaceholder} position="bottom">
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 rounded-full border transition"
                style={{
                  backgroundColor: "var(--color-bg-surface)",
                  borderColor: "var(--color-border-default)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Controles de Tema e Idioma (à esquerda do perfil) */}
        <ThemeLanguageSelector />

        {/* Perfil Estilo LoL (Avatar com anel de XP, moldura de nível e títulos) */}
        <LolProfileBadge onOpenProfile={onOpenProfile} onOpenLevelSwitcher={onOpenLevelSwitcher} />
      </div>
    </header>
  );
}
