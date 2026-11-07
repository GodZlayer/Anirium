import React, { useState } from "react";
import { X, User, Trophy, Bookmark, History, Settings, Flame, Shield, Sparkles, Award, Puzzle } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { TelemetryState, recalculateUserGamification } from "../lib/telemetryXpLoop";
import { AnimeRecord } from "./AnimeCard";
import { ProfileGamificationHub } from "./ProfileGamificationHub";
import { ProfileSettingsTab } from "./ProfileSettingsTab";
import { ProfileCatalogLibrary } from "./ProfileCatalogLibrary";
import { ProfileAddonsTab } from "./ProfileAddonsTab";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  telemetry: TelemetryState;
  universalCatalog: AnimeRecord[];
  bookmarkedIds: Array<number | string>;
  machineFingerprint: string;
  onSelectAnime: (anime: AnimeRecord) => void;
  onPlayAnime: (anime: AnimeRecord) => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  user,
  telemetry,
  universalCatalog,
  bookmarkedIds,
  machineFingerprint,
  onSelectAnime,
  onPlayAnime,
}: UserProfileModalProps) {
  const { tokens, strings, adultContentEnabled, setAdultContentEnabled } = useDesignTheme();
  const [activeTab, setActiveTab] = useState<"overview" | "bookmarks" | "history" | "addons" | "settings">("overview");

  if (!isOpen || !user) return null;

  // Mapeamento de Tiers
  const tierConfig = [
    { label: strings.tiers.guest, color: "#8E8E93", border: "#3A3A43", icon: Shield },
    { label: strings.tiers.member, color: "#1E88E5", border: "#1E88E5", icon: Sparkles },
    { label: strings.tiers.plus, color: "#FFC766", border: "#FFC766", icon: Sparkles },
    { label: strings.tiers.admin, color: "#E53935", border: "#E53935", icon: Award },
  ];

  const effectiveTier = user.tier;
  const currentTier = tierConfig[effectiveTier] || tierConfig[1];
  const TierIcon = currentTier.icon;

  const cleanUserName =
    user.name && user.name.trim()
      ? user.name.trim()
      : user.email?.split("@")[0] || currentTier.label;

  const avatarUrl =
    user.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanUserName)}&background=ef4444&color=fff&bold=true`;

  const handleSelectTitle = (selectedTitle: string) => {
    recalculateUserGamification(undefined, undefined, undefined, {
      customTitle: selectedTitle,
    });
    fetch("/api/account/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ custom_title_id: selectedTitle }),
    }).catch(() => {});
  };

  const handleToggleAdult = (enabled: boolean) => {
    setAdultContentEnabled(enabled);
    fetch("/api/account/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ adult_content_enabled: enabled }),
    }).catch(() => {});
  };

  // Mapear obras concluídas e notas a partir das preferências do usuário

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[color:var(--wc-bgBase)]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: tokens.colors.bgSurface,
          borderColor: tokens.colors.borderHighlight || tokens.colors.borderDefault,
        }}
      >
        {/* Cabeçalho do Perfil */}
        <div className="relative px-6 py-5 border-b border-[color:var(--wc-borderDefault)]/10 flex items-center justify-between bg-[color:var(--wc-bgBase)]/30">
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 p-0.5" style={{ borderColor: currentTier.color }}>
              <img src={avatarUrl} alt={cleanUserName} className="w-full h-full object-cover rounded-full" />
              <div
                className="absolute bottom-0 right-0 px-1.5 py-0.2 text-[9px] font-black rounded-full"
                style={{ backgroundColor: tokens.colors.accentGold, color: tokens.colors.bgBase }}
              >
                {telemetry.levelNumber}
              </div>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[color:var(--wc-textPrimary)]">{cleanUserName}</h2>
                <span
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border"
                  style={{ borderColor: currentTier.color, color: currentTier.color }}
                >
                  <TierIcon className="w-3 h-3" />
                  {currentTier.label}
                </span>
                <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[color:var(--wc-stateWarning)]/15 text-[color:var(--wc-stateWarning)] border border-[color:var(--wc-stateWarning)]/30">
                  <Flame className="w-3 h-3 fill-[color:var(--wc-stateWarning)] text-[color:var(--wc-stateWarning)]" />
                  {telemetry.currentStreak}d
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-[color:var(--wc-textMuted)]">{user.email}</span>
                <span className="text-xs opacity-40">•</span>
                <span className="text-xs font-semibold text-[#FFC766]">{telemetry.title}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] hover:bg-[color:var(--wc-bgSurface)]/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Navegação do Perfil */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-[color:var(--wc-borderDefault)]/5 bg-[color:var(--wc-bgBase)]/20">
          {[
            { id: "overview", label: "Visão Geral & XP", icon: Trophy },
            { id: "bookmarks", label: `Favoritos (${bookmarkedIds.length})`, icon: Bookmark },
            { id: "history", label: `Concluídos (${telemetry.worksCompleted})`, icon: History },
            { id: "addons", label: "Addons", icon: Puzzle },
            { id: "settings", label: "Configurações", icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer"
                style={{
                  borderColor: isActive ? tokens.colors.accentGold : "transparent",
                  color: isActive ? tokens.colors.accentGold : tokens.colors.textMuted,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo Dinâmico com Rolagem Interna Limpa */}
        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {activeTab === "overview" && (
            <ProfileGamificationHub
              telemetry={telemetry}
              onSelectTitle={handleSelectTitle}
              activeTitleId={telemetry.titleId}
            />
          )}

          {activeTab === "bookmarks" && (
            <ProfileCatalogLibrary
              key={`bookmarks:${user.id}`}
              type="bookmarks"
              onSelectAnime={(anime) => {
                onClose();
                onSelectAnime(anime);
              }}
              onPlayAnime={(anime) => {
                onClose();
                onPlayAnime(anime);
              }}
            />
          )}

          {activeTab === "history" && (
            <ProfileCatalogLibrary
              key={`history:${user.id}`}
              type="history"
              onSelectAnime={(anime) => {
                onClose();
                onSelectAnime(anime);
              }}
              onPlayAnime={(anime) => {
                onClose();
                onPlayAnime(anime);
              }}
            />
          )}

          {activeTab === "addons" && (
            <ProfileAddonsTab tier={effectiveTier} />
          )}

          {activeTab === "settings" && (
            <ProfileSettingsTab
              user={user}
              adultContentEnabled={adultContentEnabled}
              onToggleAdultContent={handleToggleAdult}
              machineFingerprint={machineFingerprint}
            />
          )}
        </div>
      </div>
    </div>
  );
}
