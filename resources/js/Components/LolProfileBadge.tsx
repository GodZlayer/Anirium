import React from "react";
import { Shield, Sparkles, Zap, Award, LogIn, LogOut } from "lucide-react";
import { router } from "@inertiajs/react";
import { useDesignTheme } from "../context/ThemeContext";

interface UserProfileData {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  tier: number;
}

interface LolProfileBadgeProps {
  user?: UserProfileData | null;
  tier?: number; // 0: Guest, 1: Member, 2: Anirium+, 3: Admin
  level: number; // 1 a infinito
  xpPercentage: number; // 0 a 100
  title?: string;
}

export function LolProfileBadge({
  user,
  tier = 0,
  level,
  xpPercentage,
  title,
}: LolProfileBadgeProps) {
  const { tokens, strings } = useDesignTheme();

  // Mapeamento Canônico de Tiers (Autorização / Privilégio)
  const tierConfig = [
    { label: strings.tiers.guest, color: "#8E8E93", border: "#3A3A43", icon: Shield },
    { label: strings.tiers.member, color: "#1E88E5", border: "#1E88E5", icon: Zap },
    { label: strings.tiers.plus, color: "#FFC766", border: "#FFC766", icon: Sparkles },
    { label: strings.tiers.admin, color: "#E53935", border: "#E53935", icon: Award },
  ];

  const effectiveTier = user ? user.tier : tier;
  const currentTier = tierConfig[effectiveTier] || tierConfig[0];
  const TierIcon = currentTier.icon;
  const clampedXp = Math.min(100, Math.max(0, xpPercentage));
  const activeTitle = title || (user ? user.name : currentTier.label);
  const avatarUrl = user?.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80";

  // Se não estiver logado, exibe botão de Login com o Google em moldura gamer
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <a
          href="/auth/google"
          className="group relative flex items-center gap-2.5 px-4 py-2 rounded-full border shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer backdrop-blur-md"
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
            className="text-xs font-black tracking-wide"
            style={{ color: tokens.colors.textPrimary }}
          >
            Entrar com Google
          </span>

          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: `${tokens.colors.accentGold}20`,
              color: tokens.colors.accentGold,
            }}
          >
            Lvl {level}
          </span>
        </a>
      </div>
    );
  }

  // Usuário Autenticado: Moldura LoL Badge completa com Logout
  return (
    <div
      className="relative flex items-center gap-3 px-3.5 py-1.5 rounded-full border transition-all duration-300"
      style={{
        backgroundColor: tokens.colors.bgSurface,
        borderColor: tokens.colors.borderDefault,
      }}
    >
      {/* Moldura Circular com Anel de XP */}
      <div className="relative w-11 h-11 flex-shrink-0 flex items-center justify-center">
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
          alt={user.name}
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

      {/* Identificação de Título e Tier */}
      <div className="flex flex-col pr-1">
        <span
          className="text-xs font-bold leading-tight tracking-wide max-w-[120px] truncate"
          style={{ color: tokens.colors.textPrimary }}
          title={user.name}
        >
          {activeTitle}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: currentTier.color }}
          >
            <TierIcon className="w-3 h-3" />
            {currentTier.label}
          </span>
          <span className="text-[10px] opacity-40" style={{ color: tokens.colors.textMuted }}>•</span>
          <span
            className="text-[10px] font-mono tracking-tight"
            style={{ color: tokens.colors.textMuted }}
          >
            {clampedXp}%
          </span>
        </div>
      </div>

      {/* Botão de Logout Discreto */}
      <button
        onClick={() => router.post("/logout")}
        className="p-1 rounded-full opacity-60 hover:opacity-100 hover:scale-110 transition-all cursor-pointer"
        style={{ color: tokens.colors.textMuted }}
        title="Sair da Conta"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
