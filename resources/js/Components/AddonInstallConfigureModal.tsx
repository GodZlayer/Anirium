import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Link2,
  Loader2,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { requestAccountAddons } from "../lib/accountAddonClient";
import {
  AddonConfigSession,
  AddonDirectoryItem,
  AddonDirectorySourceStatus,
  AddonInspectionResult,
  StremioConfigField,
  closeAddonConfigSession,
  inspectAddon,
  onAddonConfigCaptured,
  searchAddonDirectories,
  startAddonConfigSession,
} from "../lib/addonServiceClient";

export interface AddonConfigureTarget {
  manifestUrl: string;
  replaceAddonId?: string;
  inspection?: AddonInspectionResult;
  displayName?: string;
}

export interface InstalledAddonMatchSource {
  id: string;
  manifestUrl: string;
  inspection?: AddonInspectionResult;
  displayName?: string;
}

interface AddonInstallConfigureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstalled: () => void;
  installedManifestUrls: string[];
  installedAddons?: InstalledAddonMatchSource[];
  initialTarget?: AddonConfigureTarget | null;
}

type ModalStep = "browse" | "native-config" | "page-config";
type BrowseTab = "explore" | "paste";

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "", label: "Todos" },
  { id: "subtitles", label: "Legendas" },
  { id: "anime", label: "Anime" },
  { id: "torrents", label: "Torrents & Streams" },
];

function canonicalComparableUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^stremio:\/\//i, "https://")
    .replace(/:(443|80)(?=\/|$)/, "")
    .toLowerCase();
}

function parseUrlOriginAndPath(raw: string): { origin: string; pathname: string } | null {
  if (!raw) return null;
  try {
    const normalized = raw.trim().replace(/^stremio:\/\//i, "https://");
    const u = new URL(normalized);
    return {
      origin: `${u.protocol.toLowerCase()}//${u.host.toLowerCase().replace(/:(443|80)$/, "")}`,
      pathname: u.pathname || "/",
    };
  } catch {
    return null;
  }
}

function buildNativeConfiguredUrl(baseManifestUrl: string, values: Record<string, string>, fields: StremioConfigField[]): string {
  const cleanBase = baseManifestUrl.trim().replace(/^stremio:\/\//i, "https://");
  const urlObj = new URL(cleanBase);
  let basePath = urlObj.pathname.replace(/\/manifest(?:\.json)?$/i, "");
  const segments = basePath.split("/").filter(Boolean);
  if (segments.length > 0) {
    const tail = segments[segments.length - 1];
    try {
      const decodedTail = decodeURIComponent(tail);
      if (decodedTail.trim().startsWith("{")) {
        segments.pop();
        basePath = segments.length > 0 ? "/" + segments.join("/") : "";
      }
    } catch {
      // keep existing segments
    }
  }

  const payload: Record<string, string | boolean | number> = {};
  for (const field of fields) {
    if (!field.key) continue;
    const rawVal = values[field.key] ?? "";
    if (field.type === "checkbox") {
      payload[field.key] = rawVal === "true";
    } else if (rawVal !== "") {
      payload[field.key] = rawVal;
    }
  }

  const encoded = encodeURIComponent(JSON.stringify(payload));
  urlObj.pathname = `${basePath.replace(/\/$/, "")}/${encoded}/manifest.json`;
  urlObj.search = "";
  urlObj.hash = "";
  return urlObj.toString();
}

function initializeNativeValues(fields: StremioConfigField[], existing?: Record<string, string>): Record<string, string> {
  const init: Record<string, string> = {};
  for (const field of fields) {
    if (!field.key) continue;
    if (existing && existing[field.key] !== undefined) {
      init[field.key] = existing[field.key];
      continue;
    }
    if (field.default !== undefined && field.default !== "") {
      init[field.key] = String(field.default);
      continue;
    }
    if (field.type === "checkbox") {
      init[field.key] = "false";
    } else if (field.type === "select" && Array.isArray(field.options) && field.options.length > 0) {
      init[field.key] = field.options[0];
    } else {
      init[field.key] = "";
    }
  }
  return init;
}

function AddonLogo({ src, size = "md" }: { src?: string; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const dim = size === "sm" ? "w-8 h-8 rounded-lg" : "w-10 h-10 rounded-xl";
  if (!src || failed) {
    return (
      <div className={`${dim} bg-[color:var(--wc-statePrimary)]/10 border border-[color:var(--wc-statePrimary)]/25 text-[color:var(--wc-statePrimary)] flex items-center justify-center shrink-0`}>
        <Globe className={size === "sm" ? "w-4 h-4" : "w-5 h-5"} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`${dim} object-cover bg-black/30 border border-white/10 shrink-0`}
    />
  );
}

export function AddonInstallConfigureModal({
  isOpen,
  onClose,
  onInstalled,
  installedManifestUrls,
  installedAddons,
  initialTarget,
}: AddonInstallConfigureModalProps) {
  const { tokens } = useDesignTheme();

  const [step, setStep] = useState<ModalStep>("browse");
  const [browseTab, setBrowseTab] = useState<BrowseTab>("explore");
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [directoryItems, setDirectoryItems] = useState<AddonDirectoryItem[]>([]);
  const [directorySources, setDirectorySources] = useState<AddonDirectorySourceStatus[]>([]);
  const [serviceOffline, setServiceOffline] = useState(false);

  const [pasteInput, setPasteInput] = useState("");
  const [showJsonPaste, setShowJsonPaste] = useState(false);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupportedCandidate, setUnsupportedCandidate] = useState<AddonInspectionResult | null>(null);

  const [activeTarget, setActiveTarget] = useState<AddonInspectionResult | null>(null);
  const [replaceAddonId, setReplaceAddonId] = useState<string | undefined>(undefined);

  // Native manifest.config state
  const [nativeValues, setNativeValues] = useState<Record<string, string>>({});
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Page proxy session state
  const [configSession, setConfigSession] = useState<AddonConfigSession | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [validatingCapture, setValidatingCapture] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualConfiguredUrl, setManualConfiguredUrl] = useState("");

  const sessionRef = useRef<AddonConfigSession | null>(null);
  const captureLockRef = useRef(false);

  const findInstalledMatch = (item: AddonDirectoryItem): InstalledAddonMatchSource | null => {
    const targetCanonical = canonicalComparableUrl(item.manifestUrl);
    const targetId = (item.id || "").trim().toLowerCase();
    const targetParts = parseUrlOriginAndPath(item.manifestUrl);
    const targetIsRootManifest = !!(targetParts && /^\/manifest(?:\.json)?$/i.test(targetParts.pathname));

    const sources: InstalledAddonMatchSource[] =
      installedAddons && installedAddons.length > 0
        ? installedAddons
        : installedManifestUrls.map((url) => ({ id: "", manifestUrl: url }));

    for (const src of sources) {
      const instUrl = (src.manifestUrl || "").trim();
      if (!instUrl) continue;
      if (canonicalComparableUrl(instUrl) === targetCanonical) {
        return src;
      }
      const inspId = (src.inspection?.id || "").trim().toLowerCase();
      if (targetId && inspId && inspId === targetId) {
        return src;
      }
      if (targetIsRootManifest && targetParts) {
        const instParts = parseUrlOriginAndPath(instUrl);
        if (instParts && instParts.origin === targetParts.origin) {
          return src;
        }
      }
    }
    return null;
  };

  const teardownActiveSession = () => {
    const active = sessionRef.current;
    sessionRef.current = null;
    setConfigSession(null);
    if (active) {
      void closeAddonConfigSession(active.sessionId);
    }
  };

  // Reset & initialize when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      teardownActiveSession();
      captureLockRef.current = false;
      setError(null);
      setUnsupportedCandidate(null);
      setValidatingCapture(false);
      setShowManualFallback(false);
      setManualConfiguredUrl("");
      return;
    }

    setError(null);
    setUnsupportedCandidate(null);
    setValidatingCapture(false);
    setShowManualFallback(false);
    setManualConfiguredUrl("");
    captureLockRef.current = false;

    if (initialTarget) {
      setReplaceAddonId(initialTarget.replaceAddonId);
      void openConfigurationForTarget(initialTarget);
    } else {
      setReplaceAddonId(undefined);
      setActiveTarget(null);
      setStep("browse");
      setBrowseTab("explore");
      setPasteInput("");
      setShowJsonPaste(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTarget]);

  // Cleanup ephemeral proxy listener on unmount
  useEffect(() => {
    return () => {
      teardownActiveSession();
    };
  }, []);

  // Directory live search when in "browse" -> "explore"
  useEffect(() => {
    if (!isOpen || step !== "browse" || browseTab !== "explore") {
      return;
    }

    let cancelled = false;
    const delay = searchQuery.trim() ? 320 : 0;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchAddonDirectories({
          query: searchQuery.trim(),
          category,
          limit: 40,
        });
        if (!cancelled) {
          setDirectoryItems(res.items);
          setDirectorySources(res.sources);
          setServiceOffline(false);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "";
          setServiceOffline(msg === "service_offline" || msg === "service_timeout");
          setDirectoryItems([]);
          setDirectorySources([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, step, browseTab, searchQuery, category]);

  const persistInstalledManifest = async (manifestUrl: string, overrideReplaceId?: string) => {
    const body: Record<string, unknown> = { manifest_url: manifestUrl };
    const effectiveReplace = overrideReplaceId ?? replaceAddonId;
    if (effectiveReplace) {
      body.replace_addon_id = effectiveReplace;
    }
    await requestAccountAddons("/api/addons/install", body);
    teardownActiveSession();
    onInstalled();
    onClose();
  };

  const enterNativeStep = (inspected: AddonInspectionResult) => {
    teardownActiveSession();
    setActiveTarget(inspected);
    setNativeValues(initializeNativeValues(inspected.configFields ?? [], inspected.existingConfigValues));
    setRevealedPasswords({});
    setError(null);
    setStep("native-config");
  };

  const enterPageStep = async (inspected: AddonInspectionResult) => {
    teardownActiveSession();
    captureLockRef.current = false;
    setActiveTarget(inspected);
    setError(null);
    setValidatingCapture(false);
    setShowManualFallback(false);
    setStep("page-config");
    setIsStartingSession(true);
    try {
      const session = await startAddonConfigSession(inspected.manifestUrl);
      sessionRef.current = session;
      setConfigSession(session);
    } catch (err) {
      setShowManualFallback(true);
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível abrir o configurador integrado. Use o link manual abaixo."
      );
    } finally {
      setIsStartingSession(false);
    }
  };

  const openConfigurationForTarget = async (target: AddonConfigureTarget) => {
    setBusyUrl(target.manifestUrl);
    setError(null);
    try {
      let inspected = target.inspection;
      if (!inspected || (inspected.configMode === "native" && (!inspected.configFields || inspected.configFields.length === 0))) {
        inspected = await inspectAddon(target.manifestUrl);
      }
      if (inspected.status === "offline" || inspected.status === "invalid_manifest" || inspected.status === "invalid_ref") {
        setActiveTarget(inspected);
        setShowManualFallback(true);
        setStep("page-config");
        setError(inspected.error || "Este add-on está temporariamente offline.");
        return;
      }
      if (inspected.configMode === "native" && (inspected.configFields?.length ?? 0) > 0) {
        enterNativeStep(inspected);
      } else {
        await enterPageStep(inspected);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "service_offline" || msg === "service_timeout") {
        setServiceOffline(true);
      }
      setActiveTarget({
        inputUrl: target.manifestUrl,
        manifestUrl: target.manifestUrl,
        configureUrl: target.manifestUrl.replace(/\/manifest(?:\.json)?$/i, "/configure"),
        name: target.displayName || target.manifestUrl,
        status: "configuration_required",
        supportsStreams: false,
        supportsSubtitles: false,
        configurable: true,
        configurationRequired: true,
        configMode: "page",
      });
      setShowManualFallback(true);
      setStep("page-config");
      setError("Anirium Service offline no momento. Abra o configurador em nova aba e cole o link gerado abaixo.");
    } finally {
      setBusyUrl(null);
    }
  };

  const handleInstallOrConfigureUrl = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed) return;
    setBusyUrl(trimmed);
    setIsSubmitting(true);
    setError(null);
    setUnsupportedCandidate(null);

    try {
      if (!/^(https?|stremio):\/\//i.test(trimmed)) {
        // Advanced raw JSON manifest install fallback
        const parsedJson = JSON.parse(trimmed);
        await requestAccountAddons("/api/addons/install", { manifest: parsedJson });
        onInstalled();
        onClose();
        return;
      }

      try {
        const inspected = await inspectAddon(trimmed);
        if (inspected.status === "ready") {
          await persistInstalledManifest(inspected.manifestUrl);
          return;
        }
        if (inspected.configMode === "native" && (inspected.configFields?.length ?? 0) > 0) {
          enterNativeStep(inspected);
          return;
        }
        if (inspected.status === "configuration_required" || inspected.configMode === "page") {
          await enterPageStep(inspected);
          return;
        }
        if (inspected.status === "unsupported") {
          setUnsupportedCandidate(inspected);
          setError("Este add-on oferece apenas catálogo (não fornece streams nem legendas).");
          return;
        }
        setError(inspected.error || "Não foi possível validar o manifesto deste add-on.");
      } catch (wsErr) {
        const msg = wsErr instanceof Error ? wsErr.message : "";
        if (msg === "service_offline" || msg === "service_timeout") {
          // Allow direct URL install if local service is not running right now
          await persistInstalledManifest(trimmed);
          return;
        }
        throw wsErr;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL ou manifesto inválido.");
    } finally {
      setBusyUrl(null);
      setIsSubmitting(false);
    }
  };

  const handleCapturedManifestUrl = async (capturedUrl: string) => {
    if (captureLockRef.current) return;
    captureLockRef.current = true;
    setValidatingCapture(true);
    setError(null);

    try {
      const inspected = await inspectAddon(capturedUrl);
      if (inspected.status === "offline" || inspected.status === "invalid_manifest" || inspected.status === "invalid_ref") {
        captureLockRef.current = false;
        setValidatingCapture(false);
        setError(inspected.error || "A URL gerada não respondeu com um manifesto válido.");
        return;
      }
      if (inspected.configurationRequired && !inspected.supportsStreams && !inspected.supportsSubtitles) {
        captureLockRef.current = false;
        setValidatingCapture(false);
        setError("O add-on ainda indica configuração pendente. Revise os campos e tente novamente.");
        return;
      }
      await persistInstalledManifest(inspected.manifestUrl);
    } catch (err) {
      captureLockRef.current = false;
      setValidatingCapture(false);
      setError(err instanceof Error ? err.message : "Falha ao salvar o add-on configurado.");
    }
  };

  // Subscribe to BOTH iframe postMessage bridge and WS addon_config_captured event
  useEffect(() => {
    if (!isOpen || step !== "page-config" || !configSession) {
      return;
    }

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.origin !== configSession.proxyOrigin) return;
      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        data.type !== "anirium:addon-configured" ||
        data.sessionId !== configSession.sessionId ||
        data.token !== configSession.token ||
        typeof data.manifestUrl !== "string"
      ) {
        return;
      }
      void handleCapturedManifestUrl(data.manifestUrl);
    };

    window.addEventListener("message", handleWindowMessage);
    const unsubscribeWS = onAddonConfigCaptured((payload) => {
      if (payload.sessionId === configSession.sessionId && payload.manifestUrl) {
        void handleCapturedManifestUrl(payload.manifestUrl);
      }
    });

    return () => {
      window.removeEventListener("message", handleWindowMessage);
      unsubscribeWS();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step, configSession?.sessionId, configSession?.token, configSession?.proxyOrigin]);

  const handleSubmitNativeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTarget) return;
    const fields = activeTarget.configFields ?? [];
    for (const field of fields) {
      if (field.required && !String(nativeValues[field.key] ?? "").trim()) {
        setError(`Preencha o campo obrigatório "${field.title || field.key}".`);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const configuredUrl = buildNativeConfiguredUrl(activeTarget.manifestUrl, nativeValues, fields);
      const inspected = await inspectAddon(configuredUrl);
      if (inspected.status === "offline" || inspected.status === "invalid_manifest" || inspected.status === "invalid_ref") {
        setError(inspected.error || "O add-on recusou a configuração informada.");
        return;
      }
      if (inspected.status === "configuration_required" && !inspected.supportsStreams && !inspected.supportsSubtitles) {
        setError("A configuração ainda parece incompleta segundo o add-on. Verifique os valores.");
        return;
      }
      await persistInstalledManifest(inspected.manifestUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aplicar a configuração.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyManualConfiguredUrl = async () => {
    const trimmed = manualConfiguredUrl.trim();
    if (!trimmed) return;
    setValidatingCapture(true);
    setError(null);
    try {
      let finalUrl = trimmed;
      try {
        const inspected = await inspectAddon(trimmed);
        if (inspected.status === "offline" || inspected.status === "invalid_manifest" || inspected.status === "invalid_ref") {
          setError(inspected.error || "Link inválido ou add-on offline.");
          setValidatingCapture(false);
          return;
        }
        if (inspected.status === "configuration_required") {
          setError("Esse link ainda aponta para o add-on sem configuração. Copie o link gerado após clicar em Configurar/Install.");
          setValidatingCapture(false);
          return;
        }
        finalUrl = inspected.manifestUrl;
      } catch {
        // Fallback when local service is offline
      }
      await persistInstalledManifest(finalUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL inválida.");
      setValidatingCapture(false);
    }
  };

  if (!isOpen) return null;

  const isWide = step === "browse" || step === "page-config";
  const backAction = () => {
    teardownActiveSession();
    captureLockRef.current = false;
    setError(null);
    if (initialTarget) {
      onClose();
    } else {
      setStep("browse");
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${
          step === "page-config"
            ? "max-w-4xl h-[min(88vh,46rem)]"
            : isWide
            ? "max-w-3xl max-h-[88vh]"
            : "max-w-lg max-h-[88vh]"
        } flex flex-col rounded-2xl border border-white/10 shadow-2xl overflow-hidden`}
        style={{ backgroundColor: tokens.colors.bgSurface || "#141418" }}
      >
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 bg-black/25 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {step !== "browse" && (
              <button
                type="button"
                onClick={backAction}
                className="p-1.5 rounded-lg text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] hover:bg-white/5 transition-colors cursor-pointer"
                title={initialTarget ? "Fechar" : "Voltar"}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {step !== "browse" && activeTarget && <AddonLogo src={activeTarget.logo} size="sm" />}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[color:var(--wc-textPrimary)] truncate flex items-center gap-2">
                {step === "browse" && (
                  <>
                    <Sparkles className="w-4 h-4 text-[#FFC766] shrink-0" />
                    <span>Explorar & Instalar Add-on Stremio</span>
                  </>
                )}
                {step === "native-config" && (
                  <span>Configurar {activeTarget?.name || "Add-on"}</span>
                )}
                {step === "page-config" && (
                  <span>Configurar {activeTarget?.name || initialTarget?.displayName || "Add-on"}</span>
                )}
              </h3>
              {step === "page-config" && (
                <p className="text-[11px] text-[color:var(--wc-textMuted)] truncate">
                  Preencha as opções abaixo e clique em Instalar na página — o Anirium aplica automaticamente.
                </p>
              )}
              {step === "native-config" && (
                <p className="text-[11px] text-[color:var(--wc-textMuted)] truncate">
                  Preencha os campos exigidos pelo add-on e clique em Aplicar.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              teardownActiveSession();
              onClose();
            }}
            className="p-1.5 rounded-lg text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Erro global */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-[color:var(--wc-stateError)]/10 border border-[color:var(--wc-stateError)]/25 text-[color:var(--wc-stateError)] text-xs flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            {unsupportedCandidate && (
              <button
                type="button"
                onClick={() => void persistInstalledManifest(unsupportedCandidate.manifestUrl)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 text-[color:var(--wc-textPrimary)] hover:bg-white/20 transition-colors cursor-pointer shrink-0"
              >
                Instalar mesmo assim
              </button>
            )}
          </div>
        )}

        {/* PASSO 1: EXPLORAR DIRETÓRIOS OU COLAR LINK */}
        {step === "browse" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Abas */}
            <div className="px-5 pt-3 pb-2 flex items-center gap-2 border-b border-white/5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setBrowseTab("explore");
                  setError(null);
                  setUnsupportedCandidate(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  browseTab === "explore"
                    ? "bg-[#FFC766] text-[#0B0B0D]"
                    : "text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] hover:bg-white/5"
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                Explorar Add-ons
              </button>
              <button
                type="button"
                onClick={() => {
                  setBrowseTab("paste");
                  setError(null);
                  setUnsupportedCandidate(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  browseTab === "paste"
                    ? "bg-[#FFC766] text-[#0B0B0D]"
                    : "text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] hover:bg-white/5"
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Colar Link
              </button>
            </div>

            {browseTab === "explore" ? (
              <div className="flex flex-col flex-1 min-h-0 p-5 gap-3">
                {/* Busca + Categorias */}
                <div className="flex flex-col gap-2.5 shrink-0">
                  <div className="relative">
                    <Search className="w-4 h-4 text-[color:var(--wc-textMuted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar em vários diretórios Stremio (ex: opensubtitles, subdl, torrentio, anime)..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-black/35 border border-white/10 text-xs text-[color:var(--wc-textPrimary)] placeholder-[color:var(--wc-textMuted)] focus:outline-none focus:border-[#FFC766]"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.id || "all"}
                          type="button"
                          onClick={() => setCategory(cat.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                            category === cat.id
                              ? "bg-[color:var(--wc-statePrimary)]/20 text-[color:var(--wc-statePrimary)] border-[color:var(--wc-statePrimary)]/40"
                              : "bg-white/5 text-[color:var(--wc-textMuted)] border-transparent hover:text-[color:var(--wc-textPrimary)]"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    {directorySources.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-[color:var(--wc-textMuted)]">
                        {directorySources.map((src) => (
                          <span
                            key={src.name}
                            className={`px-1.5 py-0.5 rounded border ${
                              src.ok
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                                : "bg-red-500/10 text-red-300 border-red-500/20"
                            }`}
                          >
                            {src.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lista de resultados */}
                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
                  {serviceOffline ? (
                    <div className="p-6 rounded-2xl border border-[#FFC766]/30 bg-[#FFC766]/5 flex flex-col items-center text-center gap-3">
                      <AlertCircle className="w-7 h-7 text-[#FFC766]" />
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-[color:var(--wc-textPrimary)]">
                          Anirium Service local não conectado
                        </span>
                        <span className="text-[11px] text-[color:var(--wc-textMuted)] max-w-md">
                          A busca ao vivo em diretórios Stremio roda localmente pelo Anirium Service para manter o site neutro. Inicie o serviço ou cole o link direto do manifesto.
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setBrowseTab("paste")}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#FFC766] text-[#0B0B0D] cursor-pointer"
                        >
                          Colar Link Manualmente
                        </button>
                        <a
                          href="/download/service"
                          download="anirium-service.exe"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 text-[color:var(--wc-textPrimary)] hover:bg-white/15"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Baixar Service
                        </a>
                      </div>
                    </div>
                  ) : isSearching ? (
                    <div className="flex flex-col gap-2.5">
                      {[1, 2, 3, 4].map((idx) => (
                        <div
                          key={idx}
                          className="h-20 rounded-xl bg-white/5 animate-pulse border border-white/5"
                        />
                      ))}
                    </div>
                  ) : directoryItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[color:var(--wc-textMuted)] flex flex-col items-center gap-2">
                      <Globe className="w-7 h-7 opacity-50" />
                      <span>Nenhum add-on encontrado para esse filtro. Tente outro termo ou cole o link direto.</span>
                    </div>
                  ) : (
                    directoryItems.map((item) => {
                      const matchedInstalled = findInstalledMatch(item);
                      const isBusy = busyUrl === item.manifestUrl;
                      const needsConfigFirst =
                        item.configurationRequired ||
                        ((item.configMode === "native" || item.configMode === "page") &&
                          !item.supportsStreams &&
                          !item.supportsSubtitles);
                      const matchedNeedsConfig =
                        matchedInstalled?.inspection?.status === "configuration_required" && !!matchedInstalled.id;

                      return (
                        <div
                          key={item.manifestUrl}
                          className="p-3.5 rounded-xl border border-white/10 bg-black/25 hover:border-white/20 transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <AddonLogo src={item.logo} />
                            <div className="flex flex-col min-w-0 gap-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-[color:var(--wc-textPrimary)] truncate">
                                  {item.name}
                                </span>
                                {item.version && (
                                  <span className="text-[10px] font-mono text-[color:var(--wc-textMuted)]">
                                    v{item.version}
                                  </span>
                                )}
                                {item.supportsStreams && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25">
                                    Streams
                                  </span>
                                )}
                                {item.supportsSubtitles && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                    Legendas
                                  </span>
                                )}
                                {item.configurable && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                                    Configurável
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-[11px] text-[color:var(--wc-textMuted)] line-clamp-1">
                                  {item.description}
                                </p>
                              )}
                              <span className="text-[10px] font-mono text-[color:var(--wc-textMuted)]/70 truncate">
                                via {item.directories.join(" + ")}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {matchedInstalled ? (
                              matchedNeedsConfig ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplaceAddonId(matchedInstalled.id);
                                    void openConfigurationForTarget({
                                      manifestUrl: matchedInstalled.manifestUrl,
                                      replaceAddonId: matchedInstalled.id,
                                      inspection: matchedInstalled.inspection,
                                      displayName: matchedInstalled.displayName || item.name,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-[#FFC766]/20 text-[#FFC766] border border-[#FFC766]/40 hover:bg-[#FFC766]/30 transition-colors cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Instalado • Configurar
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                                  <Check className="w-3.5 h-3.5" />
                                  Já instalado
                                </span>
                              )
                            ) : (
                              <button
                                type="button"
                                disabled={isSubmitting || isBusy}
                                onClick={() => void handleInstallOrConfigureUrl(item.manifestUrl)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                                  needsConfigFirst
                                    ? "bg-[#FFC766]/20 text-[#FFC766] border border-[#FFC766]/40 hover:bg-[#FFC766]/30"
                                    : "bg-[#FFC766] text-[#0B0B0D] hover:bg-[#FFC766]/90"
                                }`}
                              >
                                {isBusy ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : needsConfigFirst ? (
                                  <SlidersHorizontal className="w-3.5 h-3.5" />
                                ) : null}
                                {needsConfigFirst ? "Configurar e Instalar" : "Instalar"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-4">
                <p className="text-xs text-[color:var(--wc-textMuted)] leading-relaxed">
                  Digite ou cole o endereço do add-on (<code>https://.../manifest.json</code> ou <code>stremio://...</code>). Se o add-on precisar de configuração, o Anirium abrirá automaticamente os campos aqui dentro.
                </p>

                {!showJsonPaste ? (
                  <input
                    type="text"
                    value={pasteInput}
                    onChange={(e) => setPasteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && pasteInput.trim()) {
                        e.preventDefault();
                        void handleInstallOrConfigureUrl(pasteInput);
                      }
                    }}
                    placeholder="https://addon.exemplo.com/manifest.json"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-[color:var(--wc-textPrimary)] placeholder-[color:var(--wc-textMuted)] font-mono focus:outline-none focus:border-[#FFC766]"
                  />
                ) : (
                  <textarea
                    value={pasteInput}
                    onChange={(e) => setPasteInput(e.target.value)}
                    placeholder='{ "id": "...", "name": "...", "manifestUrl": "https://.../manifest.json" }'
                    rows={4}
                    className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-[color:var(--wc-textPrimary)] placeholder-[color:var(--wc-textMuted)] font-mono focus:outline-none focus:border-[#FFC766]"
                  />
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowJsonPaste((v) => !v);
                      setPasteInput("");
                    }}
                    className="text-[11px] text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] underline cursor-pointer"
                  >
                    {showJsonPaste ? "Colar URL simples" : "Colar JSON manualmente"}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-1.5 rounded-xl text-xs text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting || !pasteInput.trim()}
                      onClick={() => void handleInstallOrConfigureUrl(pasteInput)}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-[#FFC766] text-[#0B0B0D] hover:bg-[#FFC766]/90 transition-all cursor-pointer disabled:opacity-40"
                    >
                      {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASSO 2A: MODAL NATIVO (manifest.config) */}
        {step === "native-config" && activeTarget && (
          <form onSubmit={handleSubmitNativeConfig} className="p-5 flex flex-col gap-4 overflow-y-auto">
            {activeTarget.description && (
              <p className="text-xs text-[color:var(--wc-textMuted)] leading-relaxed bg-black/25 p-3 rounded-xl border border-white/5">
                {activeTarget.description}
              </p>
            )}

            <div className="flex flex-col gap-3">
              {(activeTarget.configFields ?? []).map((field) => {
                const label = field.title || field.key;
                const val = nativeValues[field.key] ?? "";
                const fieldType = (field.type || "text").toLowerCase();

                if (fieldType === "checkbox") {
                  const checked = val === "true";
                  return (
                    <label
                      key={field.key}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-black/30 border border-white/10 cursor-pointer"
                    >
                      <span className="text-xs font-medium text-[color:var(--wc-textPrimary)]">
                        {label}
                        {field.required && <span className="text-[#FFC766] ml-1">*</span>}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() =>
                          setNativeValues((prev) => ({
                            ...prev,
                            [field.key]: checked ? "false" : "true",
                          }))
                        }
                        className="w-10 h-5.5 rounded-full transition-colors relative border shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: checked ? "#FFC766" : "rgba(255,255,255,0.12)",
                          borderColor: checked ? "#FFC766" : "rgba(255,255,255,0.2)",
                        }}
                      >
                        <span
                          className="block w-3.5 h-3.5 rounded-full transition-transform"
                          style={{
                            backgroundColor: checked ? "#0B0B0D" : "#FFFFFF",
                            transform: checked ? "translateX(20px)" : "translateX(2px)",
                          }}
                        />
                      </button>
                    </label>
                  );
                }

                if (fieldType === "select" && Array.isArray(field.options) && field.options.length > 0) {
                  return (
                    <div key={field.key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-[color:var(--wc-textPrimary)]">
                        {label}
                        {field.required && <span className="text-[#FFC766] ml-1">*</span>}
                      </label>
                      <select
                        value={val}
                        onChange={(e) => setNativeValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-[color:var(--wc-textPrimary)] focus:outline-none focus:border-[#FFC766]"
                      >
                        {field.options.map((opt) => (
                          <option key={opt} value={opt} className="bg-[#141418] text-white">
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                const isPassword = fieldType === "password";
                const revealed = !!revealedPasswords[field.key];
                const htmlType = isPassword ? (revealed ? "text" : "password") : fieldType === "number" ? "number" : "text";

                return (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[color:var(--wc-textPrimary)]">
                      {label}
                      {field.required && <span className="text-[#FFC766] ml-1">*</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={htmlType}
                        required={field.required}
                        value={val}
                        onChange={(e) => setNativeValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-[color:var(--wc-textPrimary)] focus:outline-none focus:border-[#FFC766] pr-9"
                      />
                      {isPassword && (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedPasswords((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                          }
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] cursor-pointer"
                        >
                          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={backAction}
                className="px-3.5 py-1.5 rounded-xl text-xs text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] cursor-pointer"
              >
                {initialTarget ? "Cancelar" : "Voltar"}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-[#FFC766] text-[#0B0B0D] hover:bg-[#FFC766]/90 transition-all cursor-pointer disabled:opacity-40"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Aplicar e Instalar
              </button>
            </div>
          </form>
        )}

        {/* PASSO 2B: MODAL DE PÁGINA COM INJEÇÃO LOCAL (/configure) */}
        {step === "page-config" && (
          <div className="flex flex-col flex-1 min-h-0 p-4 gap-3">
            <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-white/10 bg-[#0d0d11]">
              {isStartingSession ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[color:var(--wc-textMuted)]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#FFC766]" />
                  <span>Abrindo configurador do add-on com ponte Anirium...</span>
                </div>
              ) : configSession ? (
                <iframe
                  src={configSession.frameUrl}
                  title={`Configurar ${activeTarget?.name || "Add-on"}`}
                  className="w-full h-full bg-white"
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3 text-xs text-[color:var(--wc-textMuted)]">
                  <Settings2 className="w-7 h-7 text-[#FFC766]" />
                  <span>Não foi possível carregar o configurador embutido.</span>
                  {(activeTarget?.configureUrl || activeTarget?.manifestUrl) && (
                    <a
                      href={activeTarget?.configureUrl || activeTarget?.manifestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#FFC766] text-[#0B0B0D]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir configurador em nova aba
                    </a>
                  )}
                </div>
              )}

              {validatingCapture && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-xs text-[color:var(--wc-textPrimary)] z-10">
                  <Loader2 className="w-6 h-6 animate-spin text-[#FFC766]" />
                  <span className="font-bold">Validando configuração aplicada...</span>
                </div>
              )}
            </div>

            {/* Rodapé discreto + fallback manual */}
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-[color:var(--wc-textMuted)]">
                  Se clicar em Copiar ou Instalar dentro da página, o Anirium captura o link sozinho.
                </span>
                <div className="flex items-center gap-2">
                  {(configSession?.configureUrl || activeTarget?.configureUrl) && (
                    <a
                      href={configSession?.configureUrl || activeTarget?.configureUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] border border-white/10"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Abrir em nova aba
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowManualFallback((v) => !v)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 text-[color:var(--wc-textMuted)] hover:text-[color:var(--wc-textPrimary)] border border-white/10 cursor-pointer"
                  >
                    {showManualFallback ? "Ocultar campo manual" : "Colar link manualmente"}
                  </button>
                </div>
              </div>

              {showManualFallback && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={manualConfiguredUrl}
                    onChange={(e) => setManualConfiguredUrl(e.target.value)}
                    placeholder="Cole aqui o link final gerado pelo configurador..."
                    className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-[color:var(--wc-textPrimary)] font-mono focus:outline-none focus:border-[#FFC766]"
                  />
                  <button
                    type="button"
                    disabled={!manualConfiguredUrl.trim() || validatingCapture}
                    onClick={() => void handleApplyManualConfiguredUrl()}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#FFC766] text-[#0B0B0D] disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    Aplicar link
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modalContent, document.body) : null;
}
