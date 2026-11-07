import { usePresentation as __usePresentation } from "../lib/usePresentation";
import React, { useState, useRef, useEffect } from "react";
import { Shield, Sparkles, Zap, Award, LogOut, Settings, ShieldAlert, Flame, Trophy } from "lucide-react";
import { router } from "@inertiajs/react";
import { useDesignTheme } from "../context/ThemeContext";
import { TelemetryState, recalculateUserGamification } from "../lib/telemetryXpLoop";

interface UserProfileData {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  tier: number;
  adult_content_enabled?: boolean;
  custom_title?: string | null;
}

interface LolProfileBadgeProps {
  user?: UserProfileData | null;
  tier?: number; // 0: Guest, 1: Member, 2: Anirium+, 3: Admin
  level: number; // 1 a infinito
  xpPercentage: number; // 0 a 100
  title?: string;
  telemetryState?: TelemetryState;
  onOpenProfile?: () => void;
}

export function LolProfileBadge({
  user,
  tier = 0,
  level,
  xpPercentage,
  title,
  telemetryState,
  onOpenProfile,
}: LolProfileBadgeProps) {
  const __presentation = __usePresentation();
  const { tokens, strings, adultContentEnabled, setAdultContentEnabled } = useDesignTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    if (settingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [settingsOpen]);

  // Mapeamento Canônico de Tiers (Autorização / Privilégio)
  const tierConfig = [
    { label: strings.tiers.guest, color: "#8E8E93", border: "#3A3A43", icon: Shield },
    { label: strings.tiers.member, color: "#1E88E5", border: "#1E88E5", icon: Zap },
    { label: strings.tiers.plus, color: "#FFC766", border: "#FFC766", icon: Sparkles },
    { label: strings.tiers.admin, color: "#E53935", border: "#E53935", icon: Award },
  ];

  const effectiveTier = user ? user.tier : tier;
  const currentTier = tierConfig[effectiveTier] || tierConfig[1];
  const TierIcon = currentTier.icon;
  const clampedXp = Math.min(100, Math.max(0, xpPercentage));

  // Quando logado, o nome principal na moldura é SEMPRE o nome real da conta (user.name), nunca "Visitante"
  const cleanUserName =
    user?.name && user.name.trim()
      ? user.name.trim()
      : user?.email
      ? user.email.split("@")[0]
      : currentTier.label;

  const activeSubtitle =
    title && telemetryState?.titleId !== "achievement.guest" ? title : currentTier.label;
  const currentStreak = telemetryState?.currentStreak || 1;
  const totalXp = telemetryState?.totalXp || 0;
  const currentLevelXp = telemetryState?.currentLevelXp || 0;
  const nextLevelRequiredXp = telemetryState?.nextLevelRequiredXp || 10;
  const unlockedTitles = telemetryState?.unlockedTitles || [currentTier.label];

  const avatarUrl =
    user?.avatar ||
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
      body: JSON.stringify({ custom_title: selectedTitle }),
    }).catch(() => {});
  };

  // Se não estiver logado, exibe apenas o botão limpo de Login com o Google (redireciona para accounts.google.com e retorna para anirium.com.br)
  if (!user) {
    const handleGoogleRedirect = () => {
      const clientId = "785048410188-rl0jls0d0jjckrh5rso652unuk96qqa9.apps.googleusercontent.com";
      const redirectUri = window.location.hostname.includes("anirium.com.br")
        ? window.location.origin
        : "https://anirium.com.br";
      const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "token id_token",
        scope: "openid email profile",
        nonce: String(Date.now()),
        prompt: "select_account",
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
    };

    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGoogleRedirect}
          aria-label={strings.actions.loginWithGoogle}
          title={strings.actions.loginWithGoogle}
          className="group relative flex items-center gap-2.5 px-2 lg:px-4 py-2 rounded-full border shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer backdrop-blur-md"
          style={{
            backgroundColor: tokens.colors.bgSurface,
            borderColor: tokens.colors.accentGold,
          }}
        >
          {/* Ícone Oficial do Google */}
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>

          <span
            className="hidden lg:inline text-xs font-black tracking-wide whitespace-nowrap"
            style={{ color: tokens.colors.textPrimary }}
          >
            {strings.actions.loginWithGoogle}
          </span>
        </button>
      </div>
    );
  }

  // Usuário Autenticado: Moldura LoL Badge com Popover de Gamificação & Preferências Explícitas da Conta
  return (
    <div ref={containerRef} className="relative">
      <div
        className="relative flex items-center gap-3 px-3.5 py-1.5 rounded-full border transition-all duration-300"
        style={{
          backgroundColor: tokens.colors.bgSurface,
          borderColor: settingsOpen ? tokens.colors.accentGold : tokens.colors.borderDefault,
        }}
      >
        {/* Moldura Circular com Anel de XP */}
        <div
          onClick={() => {
            if (onOpenProfile) onOpenProfile();
            else setSettingsOpen((prev) => !prev);
          }}
          className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
          title={`Nível ${level} • ${currentLevelXp}/${nextLevelRequiredXp} XP (${totalXp} XP total) - Clique para abrir o Perfil Completo`}
        >
          <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 44 44">
            <circle
              cx="22"
              cy="22"
              r="19"
              fill="none"
              stroke={tokens.colors.borderDefault}
              strokeWidth="2.5"
            />
            <circle
              cx="22"
              cy="22"
              r="19"
              fill="none"
              stroke={tokens.colors.accentGold}
              strokeWidth="2.5"
              strokeDasharray={119.38}
              strokeDashoffset={119.38 - (119.38 * clampedXp) / 100}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>

          <img
            src={avatarUrl}
            alt={cleanUserName}
            className="w-8 h-8 rounded-full object-cover relative z-10"
          />

          {/* Nível do Usuário: 1 a Infinito */}
          <div
            className="absolute -bottom-1 -right-1 z-20 px-1.5 py-0.2 text-[10px] font-black rounded-full shadow-md border"
            style={{
              backgroundColor: tokens.colors.accentGold,
              color: tokens.colors.bgBase,
              borderColor: tokens.colors.bgBase,
            }}
          >
            {level}
          </div>
        </div>

        {/* Identificação de Nome Real, Título/Tier e Streak */}
        <div
          onClick={() => {
            if (onOpenProfile) onOpenProfile();
            else setSettingsOpen((prev) => !prev);
          }}
          className="flex flex-col pr-1 cursor-pointer"
          title="Abrir perfil de gamificação e preferências da conta"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="text-xs font-bold leading-tight tracking-wide max-w-[120px] truncate"
              style={{ color: tokens.colors.textPrimary }}
            >
              {cleanUserName}
            </span>
            <span
              className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold bg-[color:var(--wc-stateWarning)]/15 text-[color:var(--wc-stateWarning)] border border-[color:var(--wc-stateWarning)]/30"
              title={`Streak de presença: ${currentStreak} dia(s) consecutivo(s)`}
            >
              <Flame className="w-2.5 h-2.5 fill-[color:var(--wc-stateWarning)] text-[color:var(--wc-stateWarning)]" />
              {currentStreak}d
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider truncate max-w-[115px]"
              style={{ color: currentTier.color }}
              title={`${currentTier.label} • ${activeSubtitle}`}
            >
              <TierIcon className="w-3 h-3 shrink-0" />
              {activeSubtitle}
            </span>
            <span className="text-[10px] opacity-40" style={{ color: tokens.colors.textMuted }}>•</span>
            <span
              className="text-[10px] font-mono tracking-tight"
              style={{ color: tokens.colors.textMuted }}
            >
              {currentLevelXp}/{nextLevelRequiredXp} XP
            </span>
          </div>
        </div>

        {/* Botão de Configurações da Conta */}
        <button
          type="button"
          onClick={() => setSettingsOpen((prev) => !prev)}
          className="p-1 rounded-full opacity-70 hover:opacity-100 hover:scale-110 transition-all cursor-pointer"
          style={{ color: settingsOpen ? tokens.colors.accentGold : tokens.colors.textMuted }}
          title="Painel da Conta & Gamificação"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Botão de Logout Discreto */}
        <button
          type="button"
          onClick={() => router.post("/logout")}
          className="p-1 rounded-full opacity-60 hover:opacity-100 hover:scale-110 transition-all cursor-pointer"
          style={{ color: tokens.colors.textMuted }}
          title={strings.actions.logout}
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Popover de Gamificação, Títulos e Preferências Explícitas da Conta */}
      {settingsOpen && (
        <div
          className="absolute right-0 mt-2 w-84 p-4 rounded-2xl border backdrop-blur-2xl shadow-2xl z-50 flex flex-col gap-3 animate-in fade-in duration-150"
          style={{
            backgroundColor: "rgba(12, 13, 18, 0.96)",
            borderColor: tokens.colors.borderDefault,
          }}
        >
          {/* Cabeçalho da Conta */}
          <div className="flex items-center justify-between border-b border-[color:var(--wc-borderDefault)]/10 pb-2.5">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black tracking-wide text-[color:var(--wc-textPrimary)] truncate">
                {cleanUserName}
              </span>
              <span className="text-[10px] font-mono text-[color:var(--wc-textMuted)] truncate max-w-[200px]">
                {user.email}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    onOpenProfile();
                  }}
                  className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#FFC766]/20 text-[#FFC766] border border-[#FFC766]/40 hover:bg-[#FFC766]/30 transition-all cursor-pointer"
                >
                  Ver Perfil
                </button>
              )}
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border shrink-0"
                style={{
                  borderColor: currentTier.color,
                  color: currentTier.color,
                }}
              >
                {currentTier.label}
              </span>
            </div>
          </div>

          {/* Card de Progressão Matemática (RPG Curve + Streak Multi-Tier) */}
          <div className="flex flex-col gap-2 p-3 rounded-xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-[color:var(--wc-textPrimary)] flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-[#FFC766]" />{__presentation.text("I18N_DICTIONARY:labels.levelLabel")}{level}
              </span>
              <span className="text-[11px] text-[#FFC766] font-bold">
                {currentLevelXp} / {nextLevelRequiredXp} XP ({clampedXp}%)
              </span>
            </div>

            <div className="w-full h-1.5 rounded-full bg-[color:var(--wc-bgSurface)]/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${clampedXp}%`, backgroundColor: tokens.colors.accentGold }}
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono text-center">
              <div className="p-1.5 rounded-lg bg-[color:var(--wc-bgSurface)]/5 border border-[color:var(--wc-borderDefault)]/5">
                <span className="block text-[color:var(--wc-textMuted)]">Total XP</span>
                <strong className="text-[color:var(--wc-textPrimary)]">{totalXp}</strong>
              </div>
              <div className="p-1.5 rounded-lg bg-[color:var(--wc-bgSurface)]/5 border border-[color:var(--wc-borderDefault)]/5">
                <span className="block text-[color:var(--wc-textMuted)]">Streak</span>
                <strong className="text-[color:var(--wc-stateWarning)]">🔥 {currentStreak}d</strong>
              </div>
              <div className="p-1.5 rounded-lg bg-[color:var(--wc-bgSurface)]/5 border border-[color:var(--wc-borderDefault)]/5">
                <span className="block text-[color:var(--wc-textMuted)]">Ativo</span>
                <strong className="text-[color:var(--wc-stateSuccess)]">{telemetryState?.activeMinutes || 0}m</strong>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1 text-[9px] font-mono text-center text-[color:var(--wc-textMuted)] pt-0.5">
              <span>Eps: <strong className="text-[color:var(--wc-textPrimary)]">{telemetryState?.episodesCompleted || 0}</strong></span>
              <span>Arcos: <strong className="text-[color:var(--wc-textPrimary)]">{telemetryState?.arcsCompleted || 0}</strong></span>
              <span>Obras: <strong className="text-[color:var(--wc-textPrimary)]">{telemetryState?.worksCompleted || 0}</strong></span>
              <span>Univ: <strong className="text-[#FFC766]">{telemetryState?.universesCompleted || 0}</strong></span>
            </div>
          </div>

          {/* Seletor de Títulos Desbloqueados (incluindo Títulos de Universo 100% Completo) */}
          {unlockedTitles.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--wc-textMuted)]">
                Título Ativo ({unlockedTitles.length} desbloqueados)
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {unlockedTitles.map((t) => {
                  const isSelected = activeSubtitle === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleSelectTitle(t)}
                      className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer"
                      style={{
                        backgroundColor: isSelected ? "rgba(255, 199, 102, 0.16)" : "rgba(255,255,255,0.04)",
                        borderColor: isSelected ? tokens.colors.accentGold : "rgba(255,255,255,0.1)",
                        color: isSelected ? tokens.colors.accentGold : "#D4D4D8",
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Switcher Explícito de Conteúdo Adulto (+24 Anos) */}
          <div className="flex flex-col gap-2 p-3 rounded-xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-[color:var(--wc-stateWarning)] shrink-0" />
                <span className="text-xs font-bold text-[color:var(--wc-textPrimary)]">
                  Conteúdo Sensível (+24 Anos)
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={adultContentEnabled}
                onClick={() => setAdultContentEnabled(!adultContentEnabled)}
                className="w-10 h-5 rounded-full transition-colors duration-200 relative cursor-pointer border shrink-0"
                style={{
                  backgroundColor: adultContentEnabled ? tokens.colors.accentGold : "rgba(255,255,255,0.12)",
                  borderColor: adultContentEnabled ? tokens.colors.accentGold : "rgba(255,255,255,0.2)",
                }}
              >
                <span
                  className="block w-3.5 h-3.5 rounded-full transition-transform duration-200"
                  style={{
                    backgroundColor: adultContentEnabled ? tokens.colors.bgBase : "#FFFFFF",
                    transform: adultContentEnabled ? "translateX(20px)" : "translateX(2px)",
                  }}
                />
              </button>
            </div>
            <p className="text-[11px] text-[color:var(--wc-textMuted)] leading-relaxed">
              Obras de classificação adulta permanecem 100% ocultas por padrão e no modo sem conta. Ao ativar esta opção, você confirma ser titular de conta com mais de 24 anos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
