import { usePresentation as __usePresentation } from "../lib/usePresentation";
import React, { useState, useEffect } from "react";
import { Puzzle, Plus, Sparkles, Trash2, Globe, Shield, ExternalLink, AlertCircle, Check } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { requestAccountAddons } from "../lib/accountAddonClient";

interface AddonItem {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  type: "official-plus" | "community";
  origin: "official" | "community";
  manifest_url?: string;
  enabled: boolean;
  is_official?: boolean;
}

interface ProfileAddonsTabProps {
  tier: number;
}

export function ProfileAddonsTab({ tier }: ProfileAddonsTabProps) {
  const __presentation = __usePresentation();
  const { tokens } = useDesignTheme();
  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [manifestInput, setManifestInput] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);

  const fetchAddons = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestAccountAddons();
      if (data && data.success && Array.isArray(data.addons)) {
        setAddons(data.addons);
      }
    } catch {
      setError("Não foi possível carregar a lista de addons.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAddons();
  }, [tier]);

  const handleToggleAddon = async (addonId: string, currentEnabled: boolean) => {
    const nextState = !currentEnabled;
    setAddons((prev) =>
      prev.map((a) => (a.id === addonId ? { ...a, enabled: nextState } : a))
    );

    try {
      await requestAccountAddons("/api/addons/toggle", { addon_id: addonId, enabled: nextState });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "HTTP error");
      // Reverter se falhar
      setAddons((prev) =>
        prev.map((a) => (a.id === addonId ? { ...a, enabled: currentEnabled } : a))
      );
    }
  };

  const handleInstallManifest = async () => {
    const trimmed = manifestInput.trim();
    if (!trimmed) return;

    setIsInstalling(true);
    setError(null);
    try {
      let body: any = {};
      if (/^(https?|stremio):\/\//i.test(trimmed)) {
        body = { manifest_url: trimmed };
      } else {
        body = { manifest: JSON.parse(trimmed) };
      }

      const data = await requestAccountAddons("/api/addons/install", body);
      if (data && data.success) {
        setShowInstallModal(false);
        setManifestInput("");
        fetchAddons();
      } else {
        setError(data.error || "Falha ao instalar o addon.");
      }
    } catch {
      setError("Manifesto ou URL inválida.");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async (addonId: string) => {
    try {
      await requestAccountAddons("/api/addons/uninstall", { addon_id: addonId });
      setAddons((prev) => prev.filter((a) => a.id !== addonId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "HTTP error");
    }
  };

  const officialAddons = addons.filter((a) => a.is_official || a.type === "official-plus");
  const communityAddons = addons.filter((a) => !a.is_official && a.type !== "official-plus");

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho de Ações e Informação */}
      <div className="flex items-center justify-between pb-3 border-b border-[color:var(--wc-borderDefault)]/10">
        <div>
          <h3 className="text-sm font-bold text-[color:var(--wc-textPrimary)] flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-[#FFC766]" />
            Gerenciador de Addons & Extensões
          </h3>
          <p className="text-xs text-[color:var(--wc-textMuted)] mt-0.5">
            O Anirium opera como casca neutra. Addons fornecem players e metadados de streaming.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowInstallModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#FFC766] text-[color:var(--wc-bgBase)] hover:bg-[#FFC766]/90 transition-all cursor-pointer shadow-md"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Addon
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-[color:var(--wc-stateError)]/10 border border-[color:var(--wc-stateError)]/20 text-[color:var(--wc-stateError)] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SEÇÃO 1: ADDONS ANIRIUM+ (Exclusivos para Tier 2 e 3) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#FFC766]" />
          <h4 className="text-xs font-black uppercase tracking-wider text-[#FFC766]">
            Addons Exclusivos Anirium+
          </h4>
          {tier >= 2 ? (
            <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-[color:var(--wc-stateWarning)]/15 text-[color:var(--wc-stateWarning)] border border-[color:var(--wc-stateWarning)]/30 font-bold">
              Ativo no seu plano
            </span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-[color:var(--wc-bgRaised)] text-[color:var(--wc-textMuted)] border border-[color:var(--wc-borderDefault)]">
              Requer Tier 2 (Anirium+) ou Tier 3 (Admin)
            </span>
          )}
        </div>

        {tier < 2 ? (
          <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/5 bg-[color:var(--wc-bgBase)]/20 text-center flex flex-col items-center justify-center gap-1">
            <span className="text-xs text-[color:var(--wc-textMuted)]">
              Addons oficiais como o <strong>Anirium Player Pro</strong> só aparecem e ficam disponíveis para contas Anirium+ (Tier 2 ou 3).
            </span>
          </div>
        ) : officialAddons.length === 0 ? (
          <div className="p-4 rounded-2xl border border-[color:var(--wc-borderDefault)]/5 bg-[color:var(--wc-bgBase)]/20 text-center text-xs text-[color:var(--wc-textMuted)]">
            Nenhum addon oficial carregado.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {officialAddons.map((addon) => (
              <div
                key={addon.id}
                className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                  addon.enabled ? "bg-[color:var(--wc-bgBase)]/40 border-[#FFC766]/40 shadow-lg" : "bg-[color:var(--wc-bgBase)]/20 border-[color:var(--wc-borderDefault)]/5 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-[#FFC766]/10 border border-[#FFC766]/20 text-[#FFC766] shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[color:var(--wc-textPrimary)] truncate">{addon.name}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-md bg-[#FFC766]/20 text-[#FFC766] border border-[#FFC766]/30 font-bold">
                        Oficial Anirium+
                      </span>
                    </div>
                    <p className="text-[11px] text-[color:var(--wc-textMuted)] truncate max-w-[420px] mt-0.5">
                      {addon.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="/download/service"
                    download="anirium-service.exe"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold bg-[#FFC766]/15 text-[#FFC766] border border-[#FFC766]/30 hover:bg-[#FFC766]/25 transition-all cursor-pointer"
                    title="Baixar executável anirium-service.exe (Daemon P2P local)"
                  >
                    <span>Baixar Service (.exe)</span>
                  </a>

                  {/* Switch de Ativação */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={addon.enabled}
                    onClick={() => handleToggleAddon(addon.id, addon.enabled)}
                    className="w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer border shrink-0"
                    style={{
                      backgroundColor: addon.enabled ? tokens.colors.accentGold : "rgba(255,255,255,0.12)",
                      borderColor: addon.enabled ? tokens.colors.accentGold : "rgba(255,255,255,0.2)",
                    }}
                  >
                    <span
                      className="block w-4 h-4 rounded-full transition-transform duration-200"
                      style={{
                        backgroundColor: addon.enabled ? tokens.colors.bgBase : "#FFFFFF",
                        transform: addon.enabled ? "translateX(22px)" : "translateX(2px)",
                      }}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SEÇÃO 2: ADDONS DA COMUNIDADE (Compatibilidade Stremio & Custom) */}
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[color:var(--wc-statePrimary)]" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[color:var(--wc-statePrimary)]">
              Addons da Comunidade
            </h4>
            <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-[color:var(--wc-statePrimary)]/15 text-[color:var(--wc-statePrimary)] border border-[color:var(--wc-statePrimary)]/30">
              Tier 1, 2 e 3 (Padrão Stremio)
            </span>
          </div>
        </div>

        {communityAddons.length === 0 ? (
          <div className="p-6 rounded-2xl border border-[color:var(--wc-borderDefault)]/5 bg-[color:var(--wc-bgBase)]/20 text-center flex flex-col items-center justify-center gap-2">
            <Puzzle className="w-8 h-8 text-[color:var(--wc-textMuted)] mb-1" />
            <span className="text-xs text-[color:var(--wc-textMuted)]">
              Você ainda não instalou nenhum addon comunitário.
            </span>
            <span className="text-[11px] text-[color:var(--wc-textMuted)] max-w-sm">
              Compatível com URLs de manifesto no padrão Stremio para obter links e metadados de fontes externas.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {communityAddons.map((addon) => (
              <div
                key={addon.id}
                className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                  addon.enabled ? "bg-[color:var(--wc-bgBase)]/40 border-[color:var(--wc-statePrimary)]/30 shadow-md" : "bg-[color:var(--wc-bgBase)]/20 border-[color:var(--wc-borderDefault)]/5 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-xl bg-[color:var(--wc-statePrimary)]/10 border border-[color:var(--wc-statePrimary)]/20 text-[color:var(--wc-statePrimary)] shrink-0">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[color:var(--wc-textPrimary)] truncate">{addon.name}</span>
                      <span className="text-[9px] font-mono text-[color:var(--wc-textMuted)]">v{addon.version}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[color:var(--wc-textMuted)] truncate max-w-[400px]">
                      {addon.manifest_url || addon.description}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleUninstall(addon.id)}
                    className="p-1.5 rounded-lg text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-stateError)] hover:bg-[color:var(--wc-stateError)]/10 transition-colors cursor-pointer"
                    title="Remover addon"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={addon.enabled}
                    onClick={() => handleToggleAddon(addon.id, addon.enabled)}
                    className="w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer border shrink-0"
                    style={{
                      backgroundColor: addon.enabled ? "#38BDF8" : "rgba(255,255,255,0.12)",
                      borderColor: addon.enabled ? "#38BDF8" : "rgba(255,255,255,0.2)",
                    }}
                  >
                    <span
                      className="block w-4 h-4 rounded-full transition-transform duration-200"
                      style={{
                        backgroundColor: addon.enabled ? "#0B0B0D" : "#FFFFFF",
                        transform: addon.enabled ? "translateX(22px)" : "translateX(2px)",
                      }}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal / Dialog de Instalação de Manifesto */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[color:var(--wc-bgBase)]/80 backdrop-blur-md">
          <div className="w-full max-w-md p-5 rounded-2xl border border-[color:var(--wc-borderDefault)]/10 bg-[#141418] flex flex-col gap-4 shadow-2xl">
            <h3 className="text-sm font-bold text-[color:var(--wc-textPrimary)] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#FFC766]" />
              Instalar Addon Comunitário
            </h3>
            <p className="text-xs text-[color:var(--wc-textMuted)] leading-relaxed">
              Cole a URL do manifesto (ex.: <code>https://.../manifest.json</code> no formato Stremio) ou um JSON de manifesto válido.
            </p>

            <textarea
              value={manifestInput}
              onChange={(e) => setManifestInput(e.target.value)}
              placeholder="https://addon.exemplo.com/manifest.json ou { 'id': '...', 'name': '...' }"
              rows={4}
              className="w-full p-3 rounded-xl bg-[color:var(--wc-bgBase)]/50 border border-[color:var(--wc-borderDefault)]/10 text-xs text-[color:var(--wc-textPrimary)] placeholder-[color:var(--wc-textMuted)] font-mono focus:outline-none focus:border-[#FFC766]"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowInstallModal(false);
                  setManifestInput("");
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] transition-colors cursor-pointer"
              >{__presentation.text("I18N_DICTIONARY:actions.cancel")}</button>
              <button
                type="button"
                disabled={isInstalling || !manifestInput.trim()}
                onClick={handleInstallManifest}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#FFC766] text-[color:var(--wc-bgBase)] hover:bg-[#FFC766]/90 transition-all cursor-pointer disabled:opacity-40"
              >
                {isInstalling ? "Instalando..." : "Instalar Addon"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
