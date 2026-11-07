import React from "react";
import { Info, MessageSquare, Heart, Bookmark, Star } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";

interface DribbbleVerticalActionDockProps {
  activeView: "content" | "discussion";
  onChangeView: (view: "content" | "discussion") => void;
  isLiked?: boolean;
  isBookmarked?: boolean;
  userRating?: number;
  isAuthenticated?: boolean;
  onToggleLike?: () => void;
  onToggleBookmark?: () => void;
  onRate?: (rating: number) => void;
}

/**
 * Switcher Vertical Fluido estilo Dribbble (~80 linhas)
 * Posicionado à direita em todas as telas (`universe`, `work`, `season`, `arc`, `episode`).
 * Alterna entre a visualização de Conteúdo/Informações e Discussões/Comentários,
 * além de abrigar as 3 micro-ações sociais (Curtir, Favoritar, Dar Nota).
 */
export function DribbbleVerticalActionDock({
  activeView,
  onChangeView,
  isLiked = false,
  isBookmarked = false,
  userRating = 0,
  isAuthenticated = false,
  onToggleLike,
  onToggleBookmark,
  onRate,
}: DribbbleVerticalActionDockProps) {
  const { tokens } = useDesignTheme();

  return (
    <div
      className="flex flex-col items-center gap-2.5 p-2 rounded-full border shadow-2xl backdrop-blur-xl select-none transition-all duration-300"
      style={{
        backgroundColor: tokens.colors.bgSurface,
        borderColor: tokens.colors.borderDefault,
      }}
    >
      {/* 1. Switcher de Palco: Conteúdo / Ficha Técnica do Nível */}
      <button
        onClick={() => onChangeView("content")}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer shadow-md"
        style={{
          backgroundColor: activeView === "content" ? tokens.colors.accentGold : tokens.colors.bgBase,
          color: activeView === "content" ? tokens.colors.bgBase : tokens.colors.textMuted,
        }}
        title="Ver Informações e Conteúdo do Nível Atual"
      >
        <Info className="w-4 h-4" />
      </button>

      {/* 2. Switcher de Palco: Conversas & Comentários do Nível */}
      <button
        onClick={() => onChangeView("discussion")}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer shadow-md"
        style={{
          backgroundColor: activeView === "discussion" ? tokens.colors.accentGold : tokens.colors.bgBase,
          color: activeView === "discussion" ? tokens.colors.bgBase : tokens.colors.textMuted,
        }}
        title="Trocar tela para o Feed de Discussão e Opiniões"
      >
        <MessageSquare className="w-4 h-4" />
      </button>

      {/* Divisor Delicado */}
      <div className="w-5 h-[1px] my-0.5 opacity-20" style={{ backgroundColor: tokens.colors.borderHighlight }} />

      {/* 3. Ação Social: Curtir (Like) */}
      <button
        onClick={() => isAuthenticated && onToggleLike?.()}
        disabled={!isAuthenticated}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
          isAuthenticated ? "hover:scale-110 active:scale-95 cursor-pointer" : "opacity-40 cursor-not-allowed"
        }`}
        style={{
          backgroundColor: tokens.colors.bgBase,
          color: isLiked ? "#FF6B6B" : tokens.colors.textMuted,
        }}
        title={isAuthenticated ? (isLiked ? "Descurtir este nível" : "Curtir este nível") : "Faça login com Google para curtir"}
      >
        <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
      </button>

      {/* 4. Ação Social: Favoritar (Bookmark) */}
      <button
        onClick={() => isAuthenticated && onToggleBookmark?.()}
        disabled={!isAuthenticated}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
          isAuthenticated ? "hover:scale-110 active:scale-95 cursor-pointer" : "opacity-40 cursor-not-allowed"
        }`}
        style={{
          backgroundColor: tokens.colors.bgBase,
          color: isBookmarked ? tokens.colors.accentGold : tokens.colors.textMuted,
        }}
        title={isAuthenticated ? (isBookmarked ? "Remover dos Favoritos" : "Adicionar aos Favoritos") : "Faça login com Google para favoritar"}
      >
        <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`} />
      </button>

      {/* 5. Ação Social: Avaliar (Dar Nota de 1 a 10) */}
      <button
        onClick={() => isAuthenticated && onRate?.(userRating >= 10 ? 1 : userRating + 1)}
        disabled={!isAuthenticated}
        className={`w-10 h-10 rounded-full flex flex-col items-center justify-center transition-all duration-200 ${
          isAuthenticated ? "hover:scale-110 active:scale-95 cursor-pointer" : "opacity-40 cursor-not-allowed"
        }`}
        style={{
          backgroundColor: tokens.colors.bgBase,
          color: userRating > 0 ? tokens.colors.accentGold : tokens.colors.textMuted,
        }}
        title={isAuthenticated ? `Avaliação: ${userRating || 0}/10 (Clique para alterar nota)` : "Faça login com Google para avaliar"}
      >
        <Star className={`w-3.5 h-3.5 ${userRating > 0 ? "fill-current" : ""}`} />
        <span className="font-mono text-[9px] font-bold mt-0.5 leading-none">{userRating || "—"}</span>
      </button>
    </div>
  );
}
