import React, { useState, useEffect } from "react";
import { Puzzle, Plus, Sparkles, Trash2, Globe, AlertCircle, SlidersHorizontal, Loader2 } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { requestAccountAddons } from "../lib/accountAddonClient";
import { AddonInspectionResult, inspectAddons } from "../lib/addonServiceClient";
import { AddonConfigureTarget, AddonInstallConfigureModal } from "./AddonInstallConfigureModal";

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

function CommunityAddonLogo({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="p-2.5 rounded-xl bg-[color:var(--wc-statePrimary)]/10 border border-[color:var(--wc-statePrimary)]/20 text-[color:var(--wc-statePrimary)] shrink-0">
        <Globe className="w-5 h-5" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="w-10 h-10 rounded-xl object-cover bg-black/30 border border-white/10 shrink-0"
    />
  );
}

function hostLabelFromUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

function displayAddonName(addon: AddonItem, inspection?: AddonInspectionResult): string {
  if (inspection?.name) return inspection.name;
  if (addon.name && !addon.name.startsWith("remote-")) return addon.name;
  return hostLabelFromUrl(addon.manifest_url) || addon.id;
}

function renderStatusBadge(status?: AddonInspectionResult["status"]) {
  switch (status) {
    case "ready":
      return (
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
          Pronto
        </span>
      );
    case "configuration_required":
      return (
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-md bg-[#FFC766]/20 text-[#FFC766] border border-[#FFC766]/40 font-bold">
          Configuração pendente
        </span>
      );
    case "offline":
      return (
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-md bg-red-500/15 text-red-300 border border-red-500/30 font-bold">
          Offline
        </span>
      );
    case "unsupported":
      return (
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-md bg-white/10 text-[color:var(--wc-textMuted)] border border-white/15 font-bold">
          Somente catálogo
        </span>
      );
    case "invalid_manifest":
    case "invalid_ref":
      return (
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-md bg-red-500/15 text-red-300 border border-red-500/30 font-bold">
          Manifesto inválido
        </span>
      );
    default:
      return null;
  }
}

export function ProfileAddonsTab({ tier }: ProfileAddonsTabProps) {
  const { tokens } = useDesignTheme();
  const [addons, setAddons] = useState<AddonItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionsByUrl, setInspectionsByUrl] = useState<Record<string, AddonInspectionResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [configureTarget, setConfigureTarget] = useState<AddonConfigureTarget | null>(null);

  const inspectCommunityUrls = async (items: AddonItem[]) => {
    const urls = items
      .filter((a) => !a.is_official && a.type !== "official-plus" && !!a.manifest_url)
      .map((a) => a.manifest_url as string);
    if (urls.length === 0) {
      setInspectionsByUrl({});
      return;
    }

    setIsInspecting(true);
    try {
      const results = await inspectAddons(urls);
      const map: Record<string, AddonInspectionResult> = {};
      for (const res of results) {
        if (res.inputUrl) map[res.inputUrl] = res;
        if (res.manifestUrl) map[res.manifestUrl] = res;
      }
      setInspectionsByUrl(map);
    } catch {
      // Service local offline: mantém cartões normais sem quebrar a lista da conta
    } finally {
      setIsInspecting(false);
    }
  };

  const fetchAddons = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestAccountAddons();
      if (data && data.success && Array.isArray(data.addons)) {
        setAddons(data.addons);
        void inspectCommunityUrls(data.addons);
      }
    } catch {
      setError("Não foi possível carregar a lista de addons.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAddons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setAddons((prev) =>
        prev.map((a) => (a.id === addonId ? { ...a, enabled: currentEnabled } : a))
      );
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
  const installedUrls = communityAddons
    .map((a) => a.manifest_url || "")
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho de Ações e Informação */}
      <div className="flex items-center justify-between pb-3 border-b border-[color:var(--wc-borderDefault)]/10 gap-3">
        <div>
          <h3 className="text-sm font-bold text-[color:var(--wc-textPrimary)] flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-[#FFC766]" />
            Gerenciador de Addons & Extensões
          </h3>
          <p className="text-xs text-[color:var(--wc-textMuted)] mt-0.5">
            O Anirium opera como casca neutra. Addons fornecem players, fontes de vídeo e legendas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setConfigureTarget(null);
            setShowInstallModal(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#FFC766] text-[color:var(--wc-bgBase)] hover:bg-[#FFC766]/90 transition-all cursor-pointer shadow-md shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Explorar / Adicionar Add-on
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

          {(isLoading || isInspecting) && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[color:var(--wc-textMuted)]">
              <Loader2 className="w-3 h-3 animate-spin" />
              {isLoading ? "Carregando..." : "Verificando status..."}
            </span>
          )}
        </div>

        {communityAddons.length === 0 ? (
          <div className="p-6 rounded-2xl border border-[color:var(--wc-borderDefault)]/5 bg-[color:var(--wc-bgBase)]/20 text-center flex flex-col items-center justify-center gap-2">
            <Puzzle className="w-8 h-8 text-[color:var(--wc-textMuted)] mb-1" />
            <span className="text-xs text-[color:var(--wc-textMuted)]">
              Você ainda não instalou nenhum addon comunitário.
            </span>
            <span className="text-[11px] text-[color:var(--wc-textMuted)] max-w-sm">
              Compatível com URLs de manifesto no padrão Stremio para obter links e legendas de fontes externas.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {communityAddons.map((addon) => {
              const inspection = addon.manifest_url ? inspectionsByUrl[addon.manifest_url] : undefined;
              const name = displayAddonName(addon, inspection);
              const version = inspection?.version || addon.version;
              const needsConfig = inspection?.status === "configuration_required";
              const canConfigure = !!addon.manifest_url && (needsConfig || inspection?.configurable);

              return (
                <div
                  key={addon.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                    needsConfig
                      ? "bg-[color:var(--wc-bgBase)]/40 border-[#FFC766]/45 shadow-md"
                      : addon.enabled
                      ? "bg-[color:var(--wc-bgBase)]/40 border-[color:var(--wc-statePrimary)]/30 shadow-md"
                      : "bg-[color:var(--wc-bgBase)]/20 border-[color:var(--wc-borderDefault)]/5 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CommunityAddonLogo src={inspection?.logo} />
                    <div className="flex flex-col min-w-0 gap-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[color:var(--wc-textPrimary)] truncate">{name}</span>
                        {version && (
                          <span className="text-[9px] font-mono text-[color:var(--wc-textMuted)]">v{version}</span>
                        )}
                        {renderStatusBadge(inspection?.status)}
                        {inspection?.supportsStreams && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25">
                            Streams
                          </span>
                        )}
                        {inspection?.supportsSubtitles && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                            Legendas
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[color:var(--wc-textMuted)] truncate max-w-[400px]">
                        {inspection?.description || addon.manifest_url || addon.description}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {canConfigure && addon.manifest_url && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfigureTarget({
                            manifestUrl: addon.manifest_url as string,
                            replaceAddonId: addon.id,
                            inspection,
                            displayName: name,
                          });
                          setShowInstallModal(true);
                        }}
                        className={
                          needsConfig
                            ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#FFC766] text-[#0B0B0D] hover:bg-[#FFC766]/90 transition-colors cursor-pointer"
                            : "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-medium bg-white/5 text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] border border-white/10 transition-colors cursor-pointer"
                        }
                        title={needsConfig ? "Finalizar configuração do add-on" : "Reconfigurar add-on"}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>{needsConfig ? "Configurar add-on" : "Reconfigurar"}</span>
                      </button>
                    )}

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
              );
            })}
          </div>
        )}
      </div>

      {/* Modal unificado de exploração, instalação e configuração */}
      <AddonInstallConfigureModal
        isOpen={showInstallModal}
        onClose={() => {
          setShowInstallModal(false);
          setConfigureTarget(null);
        }}
        onInstalled={() => void fetchAddons()}
        installedManifestUrls={installedUrls}
        installedAddons={communityAddons
          .filter((a) => !!a.manifest_url)
          .map((a) => {
            const url = a.manifest_url as string;
            const insp = inspectionsByUrl[url];
            return {
              id: a.id,
              manifestUrl: url,
              inspection: insp,
              displayName: displayAddonName(a, insp),
            };
          })}
        initialTarget={configureTarget}
      />
    </div>
  );
}
