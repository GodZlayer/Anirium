import React from "react";
import { ShieldAlert, Laptop, LogOut, CheckCircle, Shield } from "lucide-react";
import { router } from "@inertiajs/react";
import { useDesignTheme } from "../context/ThemeContext";

interface ProfileSettingsTabProps {
  user: any;
  adultContentEnabled: boolean;
  onToggleAdultContent: (enabled: boolean) => void;
  machineFingerprint: string;
}

export function ProfileSettingsTab({
  user,
  adultContentEnabled,
  onToggleAdultContent,
  machineFingerprint,
}: ProfileSettingsTabProps) {
  const { tokens, strings } = useDesignTheme();

  return (
    <div className="flex flex-col gap-4">
      {/* Switcher Explícito de Conteúdo Adulto (+24 Anos) */}
      <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[color:var(--wc-stateWarning)]/10 border border-[color:var(--wc-stateWarning)]/20 text-[color:var(--wc-stateWarning)]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[color:var(--wc-textPrimary)]">
                Filtro de Conteúdo Adulto (+24 Anos)
              </span>
              <span className="text-xs text-[color:var(--wc-textMuted)]">
                Obras de classificação sensível e Hentai
              </span>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={adultContentEnabled}
            onClick={() => onToggleAdultContent(!adultContentEnabled)}
            className="w-12 h-6 rounded-full transition-colors duration-200 relative cursor-pointer border shrink-0"
            style={{
              backgroundColor: adultContentEnabled ? tokens.colors.accentGold : "rgba(255,255,255,0.12)",
              borderColor: adultContentEnabled ? tokens.colors.accentGold : "rgba(255,255,255,0.2)",
            }}
          >
            <span
              className="block w-4 h-4 rounded-full transition-transform duration-200"
              style={{
                backgroundColor: adultContentEnabled ? tokens.colors.bgBase : "#FFFFFF",
                transform: adultContentEnabled ? "translateX(26px)" : "translateX(3px)",
              }}
            />
          </button>
        </div>

        <p className="text-xs text-[color:var(--wc-textMuted)] leading-relaxed pt-1 border-t border-[color:var(--wc-borderDefault)]/5">
          Obras com restrição etária permanecem 100% ocultas de todo o catálogo por padrão e quando não há conta conectada.
          Ao ativar esta opção, sua preferência fica gravada de forma persistente e protegida em sua conta.
        </p>
      </div>

      {/* Dispositivo e Sessão Única (Trava Anti-Concorrência) */}
      <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[color:var(--wc-statePrimary)]/10 border border-[color:var(--wc-statePrimary)]/20 text-[color:var(--wc-statePrimary)]">
            <Laptop className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-[color:var(--wc-textPrimary)]">Sessão e Segurança do Dispositivo</span>
            <span className="text-xs text-[color:var(--wc-textMuted)]">Trava determinística de 1 dispositivo por conta</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-white/[0.03] border border-[color:var(--wc-borderDefault)]/5 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-mono text-[color:var(--wc-textSecondary)]">ID da Máquina / Fingerprint</span>
            <span className="text-[11px] font-mono text-[color:var(--wc-textMuted)] truncate max-w-[280px]">
              {machineFingerprint || "Carregando..."}
            </span>
          </div>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-[color:var(--wc-stateSuccess)]/15 text-[color:var(--wc-stateSuccess)] border border-[color:var(--wc-stateSuccess)]/30">
            <CheckCircle className="w-3 h-3" /> Ativa
          </span>
        </div>
      </div>

      {/* Resumo da Conta e Botão de Logout */}
      <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs text-[color:var(--wc-textMuted)]">Conectado como</span>
          <span className="text-sm font-bold text-[color:var(--wc-textPrimary)]">{user.name}</span>
          <span className="text-xs font-mono text-[color:var(--wc-textMuted)]">{user.email}</span>
        </div>

        <button
          type="button"
          onClick={() => router.post("/logout")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[color:var(--wc-stateError)] border border-[color:var(--wc-stateError)]/30 bg-[color:var(--wc-stateError)]/10 hover:bg-[color:var(--wc-stateError)]/20 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          {strings.actions.logout}
        </button>
      </div>
    </div>
  );
}
