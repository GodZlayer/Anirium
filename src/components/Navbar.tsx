"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, Bell, Film, Puzzle, ShieldCheck, UserCheck, Zap, Terminal, Sparkles, Home, Compass, Calendar, Network, Activity } from "lucide-react";
import LevelSwitcher from "./LevelSwitcher";
import AddonDevStudio from "./AddonDevStudio";
import { useUser } from "@/context/UserContext";
import { useDesignTheme } from "@/context/ThemeContext";
import Tooltip from "./Tooltip";
import { redirectGoogleLogin } from "@/lib/googleLoginClient";

import UserProfileModal from "./UserProfileModal";

interface NavbarProps {
  onSearch?: (query: string) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onOpenProfile?: () => void;
  isSearching?: boolean;
  onClearSearch?: () => void;
}

export default function Navbar({
  onSearch,
  activeTab = "inicio",
  onTabChange,
  onOpenProfile,
  isSearching = false,
  onClearSearch,
}: NavbarProps) {
  const { user, level, isDevStudioOpen, setIsDevStudioOpen } = useUser();
  const { tokens, strings } = useDesignTheme();
  const [isScrolled, setIsScrolled] = useState(false);
  const [showSearchInput, setShowSearchInput] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (showSearchInput) searchInputRef.current?.focus(); }, [showSearchInput]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [searchVal, setSearchVal] = useState("");

  const handleGoogleLogin = redirectGoogleLogin;

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchVal);
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 h-14 transition-all duration-300 px-3 sm:px-6 md:px-8 flex items-center justify-between gap-2 select-none max-w-full ${showSearchInput ? "overflow-visible" : "overflow-hidden"} ${
        isScrolled
          ? "bg-[#0B0B0D]/95 backdrop-blur-md shadow-2xl border-b border-[#3A3A43]/50"
          : "bg-gradient-to-b from-[#0B0B0D]/95 via-[#0B0B0D]/70 to-transparent"
      }`}
    >
      {/* 1. Esquerda: Logo Oficial */}
      <div className="flex items-center flex-shrink-0">
        <Link href="/" className="flex items-center group">
          <img
            src="/assets/logos/Anirium-Textlogo.png"
            alt="Anirium"
            className="h-6 sm:h-7 md:h-8 w-auto object-contain drop-shadow-[0_2px_8px_rgba(255,199,102,0.25)] group-hover:scale-105 transition-transform"
          />
        </Link>
      </div>

      {/* 2. Centro: Cápsula de Navegação Canônica (Sem abas abertas ou poluídas) */}
      <nav 
        className="flex items-center backdrop-blur-md p-0.5 sm:p-1 rounded-full text-xs font-medium shadow-md flex-shrink min-w-0"
        style={{
          backgroundColor: tokens.colors.bgSurface,
          border: `1px solid ${tokens.colors.borderDefault}`,
          color: tokens.colors.textSecondary,
        }}
      >
        <Tooltip text="Visão principal da plataforma com lançamentos e recomendações" position="bottom">
          <button
            onClick={() => onTabChange && onTabChange("inicio")}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 md:px-4 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap"
            style={{
              backgroundColor: !isSearching && activeTab === "inicio" ? tokens.colors.accentGold : "transparent",
              color: !isSearching && activeTab === "inicio" ? tokens.colors.bgBase : tokens.colors.textSecondary,
              fontWeight: !isSearching && activeTab === "inicio" ? 700 : 500,
            }}
          >
            <Home className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">{strings.navigation.home}</span>
          </button>
        </Tooltip>

        <Tooltip text="Explorar catálogo completo particionado por fatias Parquet" position="bottom">
          <button
            onClick={() => onTabChange && onTabChange("explorar")}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 md:px-4 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap"
            style={{
              backgroundColor: !isSearching && activeTab === "explorar" ? tokens.colors.accentGold : "transparent",
              color: !isSearching && activeTab === "explorar" ? tokens.colors.bgBase : tokens.colors.textSecondary,
              fontWeight: !isSearching && activeTab === "explorar" ? 700 : 500,
            }}
          >
            <Compass className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">{strings.navigation.explore}</span>
          </button>
        </Tooltip>

        <Tooltip text="Agenda diária de transmissão e horários canônicos de exibição" position="bottom">
          <button
            onClick={() => onTabChange && onTabChange("calendario")}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 md:px-4 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap"
            style={{
              backgroundColor: !isSearching && activeTab === "calendario" ? tokens.colors.accentGold : "transparent",
              color: !isSearching && activeTab === "calendario" ? tokens.colors.bgBase : tokens.colors.textSecondary,
              fontWeight: !isSearching && activeTab === "calendario" ? 700 : 500,
            }}
          >
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden md:inline">{strings.navigation.calendar}</span>
          </button>
        </Tooltip>

        <Tooltip text="Genealogia e ordem cronológica estruturada de franquias" position="bottom">
          <button
            onClick={() => onTabChange && onTabChange("franquias")}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 md:px-4 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap"
            style={{
              backgroundColor: !isSearching && activeTab === "franquias" ? tokens.colors.accentGold : "transparent",
              color: !isSearching && activeTab === "franquias" ? tokens.colors.bgBase : tokens.colors.textSecondary,
              fontWeight: !isSearching && activeTab === "franquias" ? 700 : 500,
            }}
          >
            <Network className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden lg:inline">{strings.navigation.franchises}</span>
          </button>
        </Tooltip>

        {isSearching && (
          <Tooltip text="Encerrar filtro de busca e retornar ao lobby principal" position="bottom">
            <button
              onClick={() => onClearSearch && onClearSearch()}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 md:px-4 py-1.5 rounded-full transition-all duration-200 whitespace-nowrap shadow-sm font-bold animate-in fade-in zoom-in-95"
              style={{
                backgroundColor: tokens.colors.accentGold,
                color: tokens.colors.bgBase,
              }}
            >
              <Search className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Busca</span>
              <span className="ml-1 text-[10px] bg-black/20 px-1.5 py-0.2 rounded-full font-mono">×</span>
            </button>
          </Tooltip>
        )}
      </nav>

      {/* 3. Direita: Busca & Perfil do Usuário Funcional */}
      <div className="flex items-center gap-2 sm:gap-3 text-[#FFF9F0] flex-shrink-0">
        {/* Search Bar */}
        <form id="navbar-search-form" onSubmit={handleSearchSubmit} className={`${showSearchInput ? "absolute top-full left-4 right-4 mt-2 flex" : "hidden"} lg:relative lg:inset-auto lg:mt-0 lg:flex items-center`}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar obra ou franquia..."
            aria-label="Buscar obra ou franquia"
            value={searchVal}
            onChange={(e) => {
              setSearchVal(e.target.value);
              if (onSearch) onSearch(e.target.value);
            }}
            onKeyDown={(event) => { if (event.key === "Escape") setShowSearchInput(false); }}
            className="bg-[#1A1A1F]/90 border border-[#3A3A43] focus:border-[#FFC766] rounded-full pl-7 pr-3 py-1 text-xs text-[#FFF9F0] placeholder-[#EADCC8]/50 focus:outline-none w-full lg:w-48 xl:w-56 transition-all duration-200 shadow-inner"
          />
          <Search className="w-3.5 h-3.5 text-[#EADCC8]/60 absolute left-2 pointer-events-none" />
        </form>

        {/* Mobile Search Button */}
        <button
          type="button"
          onClick={() => setShowSearchInput(!showSearchInput)}
          aria-expanded={showSearchInput}
          aria-controls="navbar-search-form"
          className="lg:hidden p-1.5 text-[#EADCC8] hover:text-[#FFC766] transition"
          title="Buscar anime"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Usuário Deslogado vs Logado */}
        {!user ? (
          <button
            onClick={handleGoogleLogin}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#FFC766]/50 bg-[#1A1A1F] hover:bg-[#FFC766]/10 text-[#FFC766] text-xs font-semibold shadow-sm transition active:scale-95"
            title="Entrar com Conta Google"
          >
            <span className="font-bold text-[11px] w-4 h-4 rounded-full bg-[#FFC766] text-[#0B0B0D] flex items-center justify-center">
              G
            </span>
            <span>Entrar</span>
          </button>
        ) : (
          <button
            onClick={() => {
              if (onOpenProfile) onOpenProfile();
              else setShowProfileModal(true);
            }}
            className="flex items-center gap-2 rounded-full p-1 sm:px-2.5 sm:py-1 transition border border-[#3A3A43] bg-[#1A1A1F] hover:border-[#FFC766]/60 shadow-md active:scale-95 text-[#FFF9F0]"
            title="Perfil"
          >
            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center font-bold text-[9px] text-[#0B0B0D] bg-[#FFC766] shadow relative flex-none">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
              ) : (
                <span>L{level}</span>
              )}
            </div>
            <span className="text-xs font-semibold hidden md:inline text-[#EADCC8] truncate max-w-[120px]">
              {user?.display_name || "Perfil"}
            </span>
          </button>
        )}
      </div>

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      <AddonDevStudio
        isOpen={isDevStudioOpen}
        onClose={() => setIsDevStudioOpen(false)}
      />
    </header>
  );
}
