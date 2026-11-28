import React, { useState } from "react";
import { ShieldAlert, Laptop, LogOut, CheckCircle, FastForward, Sparkles, Download, Puzzle, QrCode, Copy } from "lucide-react";
import { router } from "@inertiajs/react";
import { useDesignTheme } from "../context/ThemeContext";
import { usePlayerProPrefs } from "../lib/playerProPreferences";

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
  const [playerProPrefs, updatePlayerProPrefs] = usePlayerProPrefs();
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialMessage, setTrialMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pixBusy, setPixBusy] = useState(false);
  const [pixCharge, setPixCharge] = useState<{ txid: string; amount_brl: number; pix_copy_paste: string; qrcode_image?: string | null } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  const handleCreatePix = async (plan: "monthly" | "annual" = "monthly") => {
    if (pixBusy) return;
    setPixBusy(true);
    setTrialMessage(null);
    try {
      const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || "";
      const res = await fetch("/api/anirium-plus/pix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-TOKEN": csrf,
        },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPixCharge({
          txid: data.txid,
          amount_brl: data.amount_brl,
          pix_copy_paste: data.pix_copy_paste,
          qrcode_image: data.qrcode_image,
        });
      } else {
        setTrialMessage({ kind: "error", text: data.message || "Não foi possível gerar o Pix Efí Bank." });
      }
    } catch {
      setTrialMessage({ kind: "error", text: "Erro de conexão ao gerar Pix Efí Bank." });
    } finally {
      setPixBusy(false);
    }
  };

  const handleActivateTrial = async () => {
    if (trialBusy) return;
    setTrialBusy(true);
    setTrialMessage(null);
    try {
      const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || "";
      const res = await fetch("/api/anirium-plus/trial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-TOKEN": csrf,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTrialMessage({ kind: "ok", text: data.message || "Anirium+ ativado por 15 dias!" });
        router.reload();
      } else {
        setTrialMessage({ kind: "error", text: data.message || "Não foi possível ativar o período grátis." });
      }
    } catch {
      setTrialMessage({ kind: "error", text: "Erro de conexão ao ativar o Anirium+." });
    } finally {
      setTrialBusy(false);
    }
  };

  const automationItems: Array<{
    key: "autoSkipIntro" | "autoSkipEnding" | "autoNextEpisode";
    title: string;
    description: string;
  }> = [
    {
      key: "autoSkipIntro",
      title: "Pular aberturas automaticamente",
      description: "Avança o trecho de abertura (OP) assim que ele começa, usando capítulos do vídeo ou AniSkip.",
    },
    {
      key: "autoSkipEnding",
      title: "Pular endings automaticamente",
      description: "Pula o encerramento (ED) para a cena pós-créditos ou para o final do episódio.",
    },
    {
      key: "autoNextEpisode",
      title: "Próximo episódio automático",
      description: "Inicia o próximo episódio automaticamente ao terminar o atual (quando disponível).",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Guia Rápido 3 Passos: Anirium+ (15 dias grátis / Pix Efí Bank) + Service + Add-ons */}
      {user && (
        <div className="p-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[color:var(--wc-textPrimary)]">
                Configuração Rápida Anirium+ (em menos de 5 min)
              </span>
              <span className="text-xs text-[color:var(--wc-textMuted)]">
                15 dias grátis (1 conta Google por IPv6) · depois US$ 0,99/mês via Pix Efí Bank.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {/* Passo 1: Ativar Teste ou Assinar via Pix Efí */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[color:var(--wc-bgBase)]/60 border border-[color:var(--wc-borderDefault)]/10">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[color:var(--wc-textPrimary)]">
                  1. {Number(user.tier || 1) >= 2 ? "Anirium+ Ativo ✓" : "Ativar Anirium+ (15 dias grátis)"}
                </span>
                <span className="text-[11px] text-[color:var(--wc-textMuted)]">
                  {Number(user.tier || 1) >= 2
                    ? "Você já tem acesso ao Player Pro e add-ons. Pode renovar +30 dias via Pix Efí."
                    : "Teste grátis sem cartão. Depois apenas US$ 0,99/mês via Pix Efí Bank."}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {Number(user.tier || 1) < 2 && (
                  <button
                    type="button"
                    disabled={trialBusy}
                    onClick={handleActivateTrial}
                    className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {trialBusy ? "Ativando..." : "15 dias grátis"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={pixBusy}
                  onClick={() => handleCreatePix("monthly")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {pixBusy ? "Gerando..." : "Pix $0.99/mês"}
                </button>
                <button
                  type="button"
                  disabled={pixBusy}
                  onClick={() => handleCreatePix("annual")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {pixBusy ? "Gerando..." : "Pix $9.99/ano"}
                </button>
              </div>
            </div>

            {/* Passo 2: Baixar Anirium Service */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[color:var(--wc-bgBase)]/60 border border-[color:var(--wc-borderDefault)]/10">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[color:var(--wc-textPrimary)]">
                  2. Baixar e abrir o Anirium Service
                </span>
                <span className="text-[11px] text-[color:var(--wc-textMuted)]">
                  Roda em segundo plano na porta 4004 (também funciona na rede local para o celular).
                </span>
              </div>
              <a
                href="/download/service"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[color:var(--wc-borderDefault)]/20 bg-[color:var(--wc-bgSurface)] text-[color:var(--wc-textPrimary)] hover:border-amber-400/50 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar Service
              </a>
            </div>

            {/* Passo 3: Adicionar Add-ons / RSS */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[color:var(--wc-bgBase)]/60 border border-[color:var(--wc-borderDefault)]/10">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[color:var(--wc-textPrimary)]">
                  3. Colar seus Add-ons (Stremio / RSS / Legendas)
                </span>
                <span className="text-[11px] text-[color:var(--wc-textMuted)]">
                  Na aba Add-ons, cole links Stremio, feeds RSS ({"{query}"}) ou buscadores de legenda ({"{subquery}"}).
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/20">
                <Puzzle className="w-3.5 h-3.5" />
                Aba Add-ons
              </span>
            </div>
          </div>

          {pixCharge && (
            <div className="p-3 rounded-xl border border-emerald-400/30 bg-emerald-950/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300">
                  Pix Efí Bank gerado — R$ {pixCharge.amount_brl.toFixed(2).replace(".", ",")} (+30 dias)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(pixCharge.pix_copy_paste);
                    setPixCopied(true);
                    setTimeout(() => setPixCopied(false), 2500);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  {pixCopied ? "Copiado!" : "Copiar Pix"}
                </button>
              </div>
              {pixCharge.qrcode_image && (
                <img src={pixCharge.qrcode_image} alt="QR Code Pix Efí Bank" className="w-36 h-36 rounded-lg bg-white p-1.5 self-center" />
              )}
              <code className="text-[10px] break-all text-emerald-100/80 bg-black/30 p-2 rounded-lg">
                {pixCharge.pix_copy_paste}
              </code>
            </div>
          )}

          {trialMessage && (
            <p className={`text-xs font-semibold ${trialMessage.kind === "ok" ? "text-emerald-300" : "text-rose-300"}`}>
              {trialMessage.text}
            </p>
          )}
        </div>
      )}

      {/* Automação do Player Pro */}
      <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[color:var(--wc-accentGold)]/10 border border-[color:var(--wc-accentGold)]/20 text-[color:var(--wc-accentGold)]">
            <FastForward className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-[color:var(--wc-textPrimary)]">
              Automação do Player Pro
            </span>
            <span className="text-xs text-[color:var(--wc-textMuted)]">
              Ações automáticas durante a reprodução de episódios
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 pt-2 border-t border-[color:var(--wc-borderDefault)]/5">
          {automationItems.map((item) => {
            const enabled = playerProPrefs[item.key];
            return (
              <div key={item.key} className="flex items-center justify-between gap-4 py-1">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-[color:var(--wc-textPrimary)]">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-[color:var(--wc-textMuted)]">
                    {item.description}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => updatePlayerProPrefs({ [item.key]: !enabled })}
                  className="w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer border shrink-0"
                  style={{
                    backgroundColor: enabled ? tokens.colors.accentGold : "rgba(255,255,255,0.12)",
                    borderColor: enabled ? tokens.colors.accentGold : "rgba(255,255,255,0.2)",
                  }}
                >
                  <span
                    className="block w-4 h-4 rounded-full transition-transform duration-200"
                    style={{
                      backgroundColor: enabled ? tokens.colors.bgBase : "#FFFFFF",
                      transform: enabled ? "translateX(22px)" : "translateX(3px)",
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {/* Switcher Explícito de Conteúdo Adulto (+18 Anos) */}
      <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)]/40 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[color:var(--wc-stateWarning)]/10 border border-[color:var(--wc-stateWarning)]/20 text-[color:var(--wc-stateWarning)]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[color:var(--wc-textPrimary)]">
                Filtro de Conteúdo Adulto (+18 Anos)
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
