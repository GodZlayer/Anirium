import React from "react";
import { MessageSquare, ListFilter, Heart, Bookmark, Star } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";

interface RightActionDockProps {
  activeTab: "episodes" | "discussion";
  onChangeTab: (tab: "episodes" | "discussion") => void;
  isLiked?: boolean;
  isBookmarked?: boolean;
  userRating?: number;
  isAuthenticated?: boolean;
  onToggleLike?: () => void;
  onToggleBookmark?: () => void;
  onRate?: (rating: number) => void;
}

export function RightActionDock({
  activeTab,
  onChangeTab,
  isLiked = false,
  isBookmarked = false,
  userRating = 0,
  isAuthenticated = false,
  onToggleLike,
  onToggleBookmark,
  onRate,
}: RightActionDockProps) {
  const { tokens } = useDesignTheme();

  return (
    <div
      className="flex flex-col items-center gap-3 p-2 rounded-full border backdrop-blur-md shadow-2xl select-none"
      style={{
        backgroundColor: tokens.colors.bgSurface,
        borderColor: tokens.colors.borderDefault,
      }}
    >
      {/* 1. Alternador: Lista de Episódios / Arcos */}
      <button
        onClick={() => onChangeTab("episodes")}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer shadow-sm"
        style={{
          backgroundColor: activeTab === "episodes" ? tokens.colors.accentGold : tokens.colors.bgBase,
          color: activeTab === "episodes" ? tokens.colors.bgBase : tokens.colors.textMuted,
        }}
        title="Ver Lista de Episódios e Arcos"
      >
        <ListFilter className="w-4 h-4" />
      </button>

      {/* 2. Alternador: Feed de Conversa e Opinião */}
      <button
        onClick={() => onChangeTab("discussion")}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer shadow-sm"
        style={{
          backgroundColor: activeTab === "discussion" ? tokens.colors.accentGold : tokens.colors.bgBase,
          color: activeTab === "discussion" ? tokens.colors.bgBase : tokens.colors.textMuted,
        }}
        title="Ver Conversas e Comentários sobre o Episódio"
      >
        <MessageSquare className="w-4 h-4" />
      </button>

      <div className="w-5 h-[1px] bg-[color:var(--wc-bgSurface)]/10 my-1" />

      {/* 3. Ação Social: Curtir (Desabilitado visualmente para guests sem conta) */}
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
        title={isAuthenticated ? (isLiked ? "Descurtir" : "Curtir obra") : "Faça login com o Google para curtir"}
      >
        <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
      </button>

      {/* 4. Ação Social: Favoritar */}
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
        title={isAuthenticated ? (isBookmarked ? "Remover dos Favoritos" : "Favoritar Obra") : "Faça login com o Google para favoritar"}
      >
        <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-current" : ""}`} />
      </button>

      {/* 5. Ação Social: Avaliar (Nota) */}
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
        title={isAuthenticated ? `Nota: ${userRating || 0}/10 (Clique para alterar)` : "Faça login com o Google para dar nota"}
      >
        <Star className={`w-3.5 h-3.5 ${userRating > 0 ? "fill-current" : ""}`} />
        <span className="font-mono text-[9px] font-bold mt-0.5 leading-none">{userRating || "—"}</span>
      </button>
    </div>
  );
}
