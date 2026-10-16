"use client";
import { isReleaseUuid } from "../lib/profilePlaybackIdentity";
import ResumeEpisodeButton from "./ResumeEpisodeButton";

import ModalDialog from "./ModalDialog";
import StatusRecord, { isStatusPage, type EntityStatusRecord } from "./StatusRecord";

import React, { useState } from "react";
import {
  X,
  User,
  Settings,
  Heart,
  Clock,
  ShieldCheck,
  Zap,
  Terminal,
  Check,
  Play,
  Trash2,
  Edit3,
  ExternalLink,
  Sliders,
  LogOut,
  Sparkles,
  ChevronRight,
  Tv,
  Puzzle,
  Activity,
  Award,
  Users,
  Shield,
  Plus,
  AlertCircle,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { ExperienceLevel } from "@/lib/userProfileTypes";
import LevelSwitcher from "./LevelSwitcher";
import { resolveApiUrl, aniriumFetch } from "@/lib/apiConfig";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAnime?: (animeId: number) => void;
  onPlayEpisode?: (animeId: number, seasonIdx: number, epNum: number, seasonEntityId: string, episodeEntityId: string) => boolean | Promise<boolean>;
}

type ProfileTab = "conta" | "status_pro" | "favoritos" | "plugins" | "preferencias" | "admin";

export default function UserProfileModal({
  isOpen,
  onClose,
  onSelectAnime,
  onPlayEpisode,
}: UserProfileModalProps) {
  const { user, level, watchHistory, bookmarks, bookmarkItems, updateProfile, switchLevel, levelChangeError, removeEntityBookmark, logout, loginWithGoogle, hasPlayerAddon, activateSubscription, refreshUser } = useUser();
  const [activeTab, setActiveTab] = useState<ProfileTab>("conta");
  const [accountSection, setAccountSection] = useState<"name" | "access" | "renew">("name");
  React.useEffect(() => { setAccountSection("name"); }, [user?.id, level, user?.subscriptionPlan]);
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [preferenceSection, setPreferenceSection] = useState<"languages" | "behavior" | "player">("languages");
  const [preferenceState, setPreferenceState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const preferencePending = React.useRef(false);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [favoritePage, setFavoritePage] = useState(0);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState(false);
  const favoritePendingRef = React.useRef(false);
  const favoriteIdentityRef = React.useRef(user?.id ?? "");
  favoriteIdentityRef.current = user?.id ?? "";
  const favoriteItems = bookmarkItems;
  React.useEffect(() => { setFavoritePage(page => Math.min(page, Math.max(0, favoriteItems.length - 1))); }, [favoriteItems.length]);
  React.useEffect(() => { setFavoritePage(0); setFavoriteError(false); }, [user?.id]);
  const removeFavorite = async (entityType: "UNIVERSE" | "ARC" | "SERIES" | "SEASON" | "EPISODE", entityId: string) => {
    if (favoritePendingRef.current) return;
    const identity = favoriteIdentityRef.current;
    favoritePendingRef.current = true; setFavoritePending(true); setFavoriteError(false);
    try {
      const confirmed = await removeEntityBookmark(entityType, entityId);
      if (identity === favoriteIdentityRef.current && !confirmed) setFavoriteError(true);
    } catch { if (identity === favoriteIdentityRef.current) setFavoriteError(true); }
    finally { favoritePendingRef.current = false; setFavoritePending(false); }
  };

  const [selectedPlan, setSelectedPlan] = useState<string>("trial_1d");
  const [isActivatingPlan, setIsActivatingPlan] = useState(false);

  // Relógio ao vivo atualizado a cada 1 segundo para precisão absoluta do tempo de Anirium+
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Estados do Status Pro (4 Graus Canônicos do Anirium)
  const [entityStatuses, setEntityStatuses] = useState<EntityStatusRecord[]>([]);
  const [statusProDegree, setStatusProDegree] = useState<"ALL" | "UNIVERSE" | "SERIES" | "SEASON" | "EPISODE">("ALL");
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [statusCursors, setStatusCursors] = useState<Array<string | null>>([null]);
  const [statusPage, setStatusPage] = useState(0);
  const [nextStatusCursor, setNextStatusCursor] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);
  const statusRequestSequence = React.useRef(0);
  const statusCursor = statusCursors[statusPage] ?? null;
  const [statusLoaded, setStatusLoaded] = useState(false);
  const statusIdentity = `${user?.id ?? ""}:${level}`;
  const statusIdentityRef = React.useRef(statusIdentity);
  statusIdentityRef.current = statusIdentity;
  React.useEffect(() => {
    statusRequestSequence.current++;
    setStatusCursors([null]); setStatusPage(0); setNextStatusCursor(null); setEntityStatuses([]);
    setStatusLoaded(false); setStatusError(false); setIsLoadingStatuses(false);
    return () => { statusRequestSequence.current++; };
  }, [statusIdentity]);

  // Estados dos Plugins do Usuário
  const [userAddons, setUserAddons] = useState<any[]>([]);
  const [isLoadingAddons, setIsLoadingAddons] = useState(false);
  const [changingAddon, setChangingAddon] = useState<string | null>(null);
  const [addonActionError, setAddonActionError] = useState<string | null>(null);
  const [showAddManifestModal, setShowAddManifestModal] = useState(false);
  const [manifestInput, setManifestInput] = useState("");
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [isInstallingManifest, setIsInstallingManifest] = useState(false);
  const [addonListLoaded, setAddonListLoaded] = useState(false);
  const [addonListError, setAddonListError] = useState(false);
  const [addonPage, setAddonPage] = useState(0);
  const [addonDetailPage, setAddonDetailPage] = useState(0);
  const [addonSection, setAddonSection] = useState<"access" | "details">("access");
  const addonMutationPending = React.useRef(false);
  const addonRequestSequence = React.useRef(0);
  const addonIdentity = `${user?.id ?? ""}:${level}`;
  const addonIdentityRef = React.useRef(addonIdentity);
  addonIdentityRef.current = addonIdentity;
  React.useEffect(() => {
    addonRequestSequence.current++;
    setUserAddons([]); setAddonPage(0); setAddonSection("access"); setAddonDetailPage(0);
    setAddonListLoaded(false); setAddonListError(false); setAddonActionError(null); setIsLoadingAddons(false);
    setShowAddManifestModal(false); setManifestInput(""); setManifestError(null);
    return () => { addonRequestSequence.current++; };
  }, [addonIdentity]);


  // Sincronizar dados quando usuário mudar
  React.useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
    }
  }, [user]);

  // Uma entidade por página, usando o cursor nativo do Core.
  const fetchEntityStatuses = React.useCallback(async () => {
    if (level < 2) return;
    const sequence = ++statusRequestSequence.current;
    const identity = statusIdentity;
    setIsLoadingStatuses(true); setStatusError(false);
    try {
      const param = statusProDegree !== "ALL" ? `&entity_type=${statusProDegree}` : "";
      const cursor = statusCursor ? `&cursor=${encodeURIComponent(statusCursor)}` : "";
      const res = await aniriumFetch(`/api/user?action=get_all_statuses&limit=1${param}${cursor}`);
      const data = await res.json();
      if (!res.ok || !isStatusPage(data) || (statusCursor && data.nextCursor === statusCursor)) throw new Error("Status unavailable");
      if (sequence !== statusRequestSequence.current || identity !== statusIdentityRef.current) return;
      setEntityStatuses(data.statuses); setNextStatusCursor(data.nextCursor); setStatusLoaded(true);
    } catch {
      if (sequence === statusRequestSequence.current && identity === statusIdentityRef.current) {
        setEntityStatuses([]); setStatusLoaded(false); setStatusError(true); setNextStatusCursor(null);
      }
    } finally {
      if (sequence === statusRequestSequence.current && identity === statusIdentityRef.current) setIsLoadingStatuses(false);
    }
  }, [statusProDegree, statusCursor, statusIdentity, level]);

  // A conta é a fonte do registry; esta lista apresenta apenas registros confirmados.
  const fetchUserAddons = React.useCallback(async () => {
    const identity = addonIdentity;
    const sequence = ++addonRequestSequence.current;
    setIsLoadingAddons(true); setAddonListError(false);
    try {
      const res = await aniriumFetch("/api/sources?action=list_addons");
      const data = await res.json();
      if (!res.ok || data.success !== true || !Array.isArray(data.addons)) throw new Error("Addon list rejected");
      if (sequence !== addonRequestSequence.current || identity !== addonIdentityRef.current) return false;
      setUserAddons(data.addons); setAddonListLoaded(true); setAddonDetailPage(0);
      setAddonPage(page => Math.min(page, Math.max(0, data.addons.length - 1)));
      return true;
    } catch {
      if (sequence === addonRequestSequence.current && identity === addonIdentityRef.current) {
        setUserAddons([]); setAddonListLoaded(false); setAddonListError(true);
      }
      return false;
    } finally {
      if (sequence === addonRequestSequence.current && identity === addonIdentityRef.current) setIsLoadingAddons(false);
    }
  }, [addonIdentity]);

  const performAddonAction = async (payload: Record<string, unknown>, target: string) => {
    if (addonMutationPending.current || isLoadingAddons) return false;
    const identity = addonIdentity;
    addonMutationPending.current = true;
    addonRequestSequence.current++;
    setChangingAddon(target); setAddonActionError(null);
    try {
      const response = await aniriumFetch(payload.action === "toggle_addon" ? "/api/user" : "/api/sources", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) throw new Error("Addon action rejected");
      if (identity !== addonIdentityRef.current) return false;
      const refreshed = await refreshUser();
      if (identity !== addonIdentityRef.current) return false;
      const listed = await fetchUserAddons();
      if (identity !== addonIdentityRef.current) return false;
      if (!refreshed || !listed) {
        setAddonActionError("Alteração recebida. Não foi possível atualizar a conta e a lista; atualize antes de tentar novamente.");
        return false;
      }
      return true;
    } catch {
      if (identity === addonIdentityRef.current) setAddonActionError("Não foi possível alterar o plugin. Atualize antes de tentar novamente.");
      return false;
    } finally {
      addonMutationPending.current = false;
      setChangingAddon(null);
    }
  };

  const handleInstallManifest = async () => {
    if (addonMutationPending.current || isInstallingManifest) return;
    setManifestError(null);
    const trimmed = manifestInput.trim();
    if (!trimmed) { setManifestError("Insira o código JSON ou link do manifesto."); return; }
    let payload: Record<string, unknown>;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      payload = { action: "install_manifest", manifestUrl: trimmed };
    } else {
      let manifest;
      try { manifest = JSON.parse(trimmed); }
      catch { setManifestError("JSON inválido."); return; }
      if (!manifest || !manifest.id || !manifest.name) {
        setManifestError("Manifesto inválido: os campos 'id' e 'name' são obrigatórios."); return;
      }
      payload = { action: "install_manifest", manifest };
    }
    const identity = addonIdentity;
    setIsInstallingManifest(true);
    try {
      if (await performAddonAction(payload, "install")) {
        if (identity !== addonIdentityRef.current) return;
        setManifestInput(""); setShowAddManifestModal(false);
      } else if (identity === addonIdentityRef.current) {
        setManifestError("Registro não confirmado. Feche e atualize a lista antes de tentar novamente.");
      }
    } finally { setIsInstallingManifest(false); }
  };

  const handleUninstallAddon = async (addonId: string) => {
    await performAddonAction({ action: "uninstall_addon", addonId }, addonId);
  };

  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminPendingUser, setAdminPendingUser] = useState<string | null>(null);
  const [adminPage, setAdminPage] = useState(0);
  const adminRequestSequence = React.useRef(0);
  const adminMutationPending = React.useRef(false);
  const adminIdentity = `${user?.id ?? ""}:${level}`;
  const adminIdentityRef = React.useRef(adminIdentity);
  adminIdentityRef.current = adminIdentity;

  React.useEffect(() => {
    adminRequestSequence.current++;
    setAdminUsers([]); setAdminPage(0); setAdminError(""); setIsLoadingAdmin(false);
    return () => { adminRequestSequence.current++; };
  }, [adminIdentity]);

  const fetchAdminUsers = React.useCallback(async () => {
    if (level !== 3 || adminMutationPending.current) return;
    const identity = adminIdentity;
    const sequence = ++adminRequestSequence.current;
    setIsLoadingAdmin(true); setAdminError("");
    try {
      const res = await aniriumFetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok || data.success !== true || !Array.isArray(data.users)) throw new Error("Admin list rejected");
      if (identity !== adminIdentityRef.current || sequence !== adminRequestSequence.current) return;
      setAdminUsers(data.users); setAdminPage(0);
    } catch {
      if (identity === adminIdentityRef.current && sequence === adminRequestSequence.current) {
        setAdminUsers([]); setAdminError("Não foi possível carregar as contas.");
      }
    } finally {
      if (identity === adminIdentityRef.current && sequence === adminRequestSequence.current) setIsLoadingAdmin(false);
    }
  }, [level, adminIdentity]);

  const toggleUserAniriumPlus = async (targetUserId: string, currentTier: number, plan: string = "trial_1d") => {
    if (level !== 3 || adminMutationPending.current || isLoadingAdmin) return;
    const identity = adminIdentity;
    const newTier = currentTier === 2 ? 1 : 2;
    adminMutationPending.current = true;
    adminRequestSequence.current++;
    setAdminPendingUser(targetUserId); setAdminError("");
    try {
      const res = await aniriumFetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_anirium_plus", targetUserId, newTier, plan }),
      });
      const data = await res.json();
      if (!res.ok || data.success !== true || data.targetUserId !== targetUserId || data.levelTier !== newTier) throw new Error("Admin update rejected");
      if (identity !== adminIdentityRef.current) return;
      setAdminUsers(previous => previous.map(account => account.id === targetUserId ? {
        ...account, levelTier: data.levelTier, isPro: data.levelTier === 2,
        badgeLabel: data.badgeLabel, subscriptionPlan: data.subscriptionPlan,
        subscriptionExpiresAt: data.subscriptionExpiresAt,
      } : account));
    } catch {
      if (identity === adminIdentityRef.current) setAdminError("Não foi possível alterar o acesso. Atualize a lista antes de tentar novamente.");
    } finally {
      adminMutationPending.current = false;
      setAdminPendingUser(null);
    }
  };

  React.useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "status_pro") {
      fetchEntityStatuses();
    } else if (activeTab === "plugins") {
      fetchUserAddons();
    } else if (activeTab === "admin") {
      fetchAdminUsers();
    }
  }, [isOpen, activeTab, fetchEntityStatuses, fetchUserAddons, fetchAdminUsers]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);
    setSaveError(false);
    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim() || user?.display_name,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Falha ao salvar perfil:");
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePref = async (key: string, value: any) => {
    if (preferencePending.current) return;
    preferencePending.current = true;
    setPreferenceState("saving");
    try {
      await updateProfile({ settings: { [key]: value } });
      setPreferenceState("saved");
    } catch { setPreferenceState("error"); }
    finally { preferencePending.current = false; }
  };

  const getLevelBadge = (lvl: ExperienceLevel) => {
    switch (lvl) {
      case 0:
        return { label: "Canônico", color: "text-zinc-300 bg-zinc-800 border-zinc-700", icon: ShieldCheck };
      case 1:
        return { label: "Membro", color: "text-blue-400 bg-blue-950/60 border-blue-800/40", icon: User };
      case 2:
        return { label: "Anirium+", color: "text-[#FFC766] bg-[#FFC766]/15 border-[#FFC766]/30", icon: Zap };
      case 3:
        return { label: "Admin", color: "text-emerald-400 bg-emerald-950/60 border-emerald-800/40", icon: Shield };
      default:
        return { label: "Usuário", color: "text-zinc-400 bg-zinc-800 border-zinc-700", icon: User };
    }
  };

  const levelInfo = getLevelBadge(level);
  const LevelIcon = levelInfo.icon;

  return (
    <ModalDialog
      label={"Perfil do Anirium"}
      onClose={onClose}
      className="p-0 fixed inset-0 z-50 w-screen h-screen bg-[#0B0B0D] text-[#FFF9F0] flex flex-col overflow-hidden select-none animate-in fade-in duration-150"
    >
      <div className="relative w-full h-full flex flex-col overflow-hidden">
        {levelChangeError && <p role="alert" className="flex-none p-2 text-sm text-rose-400">Não foi possível alterar o nível. Tente novamente.</p>}
        {/* Header Nobre com Perfil Resumido */}
        <div className="flex-none px-4 sm:px-6 py-3 bg-[#141418] border-b border-[#3A3A43]/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            {/* Avatar Principal */}
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-[#0B0B0D] border-2 border-[#FFC766]/50 shadow-xl flex-none">
              <img
                src={user?.avatar_url || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80"}
                alt={user?.display_name || "Avatar"}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 bg-black/80 py-0.5 text-[8px] font-mono text-center text-[#FFC766] font-bold">
                L{level}
              </div>
            </div>

            {/* Informações Primárias */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-serif text-lg sm:text-xl font-bold text-[#FFF9F0] truncate">
                  {user?.display_name || "Membro Anirium"}
                </h2>
                <span className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${levelInfo.color}`}>
                  <LevelIcon className="w-3 h-3" />
                  <span>{levelInfo.label}</span>
                </span>
              </div>
              <p className="text-xs text-[#EADCC8]/60 mt-0.5 truncate font-mono">
                @{user?.username || "usuario"} • {user?.id.startsWith("google-") ? "Conta Google Sincronizada" : "Perfil Canônico Local"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => setShowLevelModal(true)}
              className="px-3.5 py-1.5 rounded-full bg-[#1A1A1F] hover:bg-[#23232A] border border-[#FFC766]/40 text-[#FFC766] text-xs font-semibold flex items-center gap-1.5 shadow transition"
              title="Matriz de Níveis"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Níveis</span>
            </button>

            {user && (
              <button
                onClick={async () => {
                  await logout();
                  onClose();
                }}
                className="w-9 h-9 rounded-full bg-[#1A1A1F]/80 hover:bg-rose-950/40 border border-[#3A3A43] hover:border-rose-500/50 flex items-center justify-center text-[#EADCC8] hover:text-rose-400 transition"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-[#1A1A1F]/80 hover:bg-[#23232A] border border-[#3A3A43] flex items-center justify-center text-[#EADCC8] hover:text-[#FFF9F0] transition"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Abas Superiores de Navegação do Perfil */}
        <div className="flex-none px-6 pt-3 border-b border-[#3A3A43]/60 bg-[#131317] flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("conta")}
            title="Dados e identidade da conta"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold border-b-2 transition-all ${
              activeTab === "conta"
                ? "border-[#FFC766] text-[#FFC766] bg-[#1A1A1F]/60"
                : "border-transparent text-[#EADCC8]/70 hover:text-white"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Conta</span>
          </button>

          <button
            onClick={() => setActiveTab("status_pro")}
            title="Status Pro: Controle dinâmico dos 4 graus (Franquia, Obra, Temporada e Episódio) e histórico integrado (Exclusivo Anirium+)"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold border-b-2 transition-all ${
              activeTab === "status_pro"
                ? "border-[#FFC766] text-[#FFC766] bg-[#1A1A1F]/60"
                : "border-transparent text-[#EADCC8]/70 hover:text-white"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Status Pro {level >= 2 && watchHistory.length > 0 && `(${watchHistory.length})`}</span>
            {level < 2 && (
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#FFC766]/20 text-[#FFC766] border border-[#FFC766]/40">
                PRO
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("favoritos")}
            title="Lista de favoritos nos 4 graus (Exclusivo Anirium+)"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold border-b-2 transition-all ${
              activeTab === "favoritos"
                ? "border-[#FFC766] text-[#FFC766] bg-[#1A1A1F]/60"
                : "border-transparent text-[#EADCC8]/70 hover:text-white"
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Favoritos {level >= 2 && `(${bookmarkItems?.length || bookmarks.length})`}</span>
            {level < 2 && (
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#FFC766]/20 text-[#FFC766] border border-[#FFC766]/40">
                PRO
              </span>
            )}
          </button>

          {level >= 1 && (
            <button
              onClick={() => setActiveTab("plugins")}
              title="Extensões e Plugins instalados"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold border-b-2 transition-all ${
                activeTab === "plugins"
                  ? "border-[#FFC766] text-[#FFC766] bg-[#1A1A1F]/60"
                  : "border-transparent text-[#EADCC8]/70 hover:text-white"
              }`}
            >
              <Puzzle className="w-3.5 h-3.5" />
              <span>Plugins</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab("preferencias")}
            title="Preferências de áudio, legendas e reprodução"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold border-b-2 transition-all ${
              activeTab === "preferencias"
                ? "border-[#FFC766] text-[#FFC766] bg-[#1A1A1F]/60"
                : "border-transparent text-[#EADCC8]/70 hover:text-white"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Preferências</span>
          </button>

          {level === 3 && (
            <button
              onClick={() => setActiveTab("admin")}
              title="Painel de Administração e Gestão de Contas"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold border-b-2 transition-all ${
                activeTab === "admin"
                  ? "border-emerald-400 text-emerald-400 bg-emerald-950/30"
                  : "border-transparent text-emerald-400/70 hover:text-emerald-300"
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Painel Admin</span>
            </button>
          )}
        </div>

        {/* Viewport de Conteúdo da Aba Ativa */}
        <div className={(activeTab === "conta" || activeTab === "preferencias" || activeTab === "admin" || activeTab === "plugins" || activeTab === "favoritos" || activeTab === "status_pro") ? "flex-1 min-h-0 p-3 sm:p-4" : "flex-1 overflow-y-auto no-scrollbar p-6"}>
          {/* ==================== ABA 1: DADOS DA CONTA ==================== */}
          {activeTab === "conta" && (
            <div className="max-w-xl mx-auto flex flex-col gap-3 animate-in fade-in duration-200">
              <nav aria-label="Contextos da conta" className="flex gap-2 flex-wrap">
                {([{id:"name", label:"Nome"}, {id:"access", label:"Acesso"}, ...(level >= 2 && user?.subscriptionPlan !== "open_beta" ? [{id:"renew", label:"Renovação"}] : [])] as const).map(section => (
                  <button key={section.id} type="button" aria-pressed={accountSection === section.id}
                    onClick={() => setAccountSection(section.id as "name" | "access" | "renew")}
                    className="px-3 py-1.5 rounded-full border border-[#3A3A43] text-xs text-[#FFF9F0] aria-pressed:border-[#FFC766] aria-pressed:text-[#FFC766] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFC766]">
                    {section.label}
                  </button>
                ))}
              </nav>
              <form onSubmit={handleSaveProfile} className="space-y-3">
                {/* Nome de Exibição Apenas */}
                {accountSection === "name" && <div className="p-5 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] shadow-md space-y-3">
                  <label htmlFor="profile-display-name" className="block text-xs font-bold uppercase tracking-wider text-[#FFC766]">
                    Nome de Exibição
                  </label>
                  <p className="text-[11px] text-[#EADCC8]/60">
                    Defina como você deseja ser chamado e identificado na plataforma Anirium.
                  </p>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    id="profile-display-name"
                    placeholder="Seu nome ou apelido"
                    className="w-full bg-[#0B0B0D] border border-[#3A3A43] focus:border-[#FFC766] rounded-xl px-4 py-2.5 text-sm text-[#FFF9F0] placeholder-[#EADCC8]/40 focus:outline-none transition shadow-inner font-medium"
                  />
                </div>}

                {/* Status Anirium+ & Assinatura */}
                {accountSection !== "name" && <div className="p-3 rounded-2xl bg-[#1A1A1F] border border-[#FFC766]/30 shadow-md space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-[#FFC766]/15 border border-[#FFC766]/30 text-[#FFC766] flex items-center justify-center">
                        <Zap className="w-4 h-4 fill-[#FFC766]" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#FFF9F0] uppercase tracking-wider flex items-center gap-2">
                          <span>Status Anirium+</span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                              level >= 2
                                ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/40"
                                : "bg-zinc-800 text-zinc-400 border-zinc-700"
                            }`}
                          >
                            {level === 3 ? "Ativo (Admin)" : level === 2 ? "Assinatura Ativa" : "Inativo / Membro"}
                          </span>
                        </h4>
                        <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                          {level >= 2
                            ? "Acesso a Favoritos Canônicos, plugins Pro e autorização do Service local."
                            : "Tenha recursos exclusivos nos 4 graus canônicos e reprodução sem limites."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Detalhes de Expiração e Tempo Restante com Ticker em Tempo Real */}
                  {level >= 2 ? (
                    <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#3A3A43] space-y-2.5">
                      {accountSection === "access" && <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#EADCC8]/60">Plano Atual:</span>
                        <span className="font-mono font-bold text-[#FFC766]">
                          {user?.subscriptionPlan === "open_beta"
                            ? "Beta aberto gratuito"
                            : user?.subscriptionPlan === "trial_1d"
                            ? "Trial de 1 Dia (24 horas)"
                            : user?.subscriptionPlan === "1w"
                            ? "Semanal (7 Dias)"
                            : user?.subscriptionPlan === "1m"
                            ? "Mensal (30 Dias)"
                            : user?.subscriptionPlan === "1y"
                            ? "Anual (365 Dias)"
                            : user?.subscriptionPlan === "10y"
                            ? "Vitalício"
                            : level === 3
                            ? "Acesso Geral Administrador"
                            : "Anirium+ Pro"}
                        </span>
                      </div>

                      {user?.subscriptionExpiresAt ? (
                        (() => {
                          const diff = Number(user.subscriptionExpiresAt) - currentTime;
                          const isExpired = diff <= 0;
                          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                          const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                          let countdownStr = "";
                          if (isExpired) {
                            countdownStr = "Expirado";
                          } else if (days > 0) {
                            countdownStr = `${days}d ${hours}h ${minutes}m ${seconds}s restantes`;
                          } else if (hours > 0) {
                            countdownStr = `${hours}h ${minutes}min ${seconds}s restantes`;
                          } else {
                            countdownStr = `${minutes}min ${seconds}s restantes`;
                          }

                          return (
                            <div className="space-y-1.5 pt-1.5 border-t border-[#23232A]">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[#EADCC8]/60">Expira em:</span>
                                <span className="font-mono text-[#FFF9F0]">
                                  {new Date(Number(user.subscriptionExpiresAt)).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[#EADCC8]/60">Tempo Restante:</span>
                                <span className={`font-mono font-bold tracking-wide ${isExpired ? "text-rose-400" : "text-emerald-400"}`}>
                                  {countdownStr}
                                </span>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="text-xs text-[#EADCC8]/60 pt-1 border-t border-[#23232A] flex items-center justify-between">
                          <span>Duração:</span>
                          <span className="font-mono text-emerald-400 font-semibold">{user?.subscriptionPlan === "open_beta" ? "Durante o beta aberto" : "Sem expiração definida / Permanente"}</span>
                        </div>
                      )}

                      </>}
                      {/* O beta não exige renovação nem pagamento. */}
                      {accountSection === "renew" && user?.subscriptionPlan !== "open_beta" && (
                      <div className="pt-2 border-t border-[#23232A] flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                        <span className="text-[11px] text-[#EADCC8]/60">Renovar / Estender:</span>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label="Período de renovação"
                            value={selectedPlan}
                            onChange={(e) => setSelectedPlan(e.target.value)}
                            className="bg-[#141418] border border-[#3A3A43] text-[11px] text-[#FFF9F0] rounded-lg px-2.5 py-1 focus:outline-none focus:border-[#FFC766]"
                          >
                            <option value="trial_1d">Trial (+1 dia)</option>
                            <option value="1w">Semanal (+7 dias)</option>
                            <option value="1m">Mensal (+30 dias)</option>
                            <option value="1y">Anual (+1 ano)</option>
                          </select>
                          <button
                            type="button"
                            disabled={isActivatingPlan}
                            onClick={async () => {
                              setIsActivatingPlan(true);
                              try {
                                await activateSubscription(selectedPlan);
                              } finally {
                                setIsActivatingPlan(false);
                              }
                            }}
                            className="px-3 py-1 rounded-lg bg-[#FFC766]/15 hover:bg-[#FFC766]/25 border border-[#FFC766]/40 text-[#FFC766] font-semibold text-[11px] transition disabled:opacity-50"
                          >
                            {isActivatingPlan ? "Renovando..." : "Renovar"}
                          </button>
                        </div>
                      </div>)}
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#3A3A43] space-y-3">
                      <p className="text-xs text-[#EADCC8]/70">
                        Durante o beta aberto, você pode ativar o Anirium+ gratuitamente no seu perfil. Não é necessário pagamento.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <button
                          type="button"
                          disabled={isActivatingPlan}
                          onClick={async () => {
                            setIsActivatingPlan(true);
                            try {
                              await activateSubscription("open_beta");
                            } finally {
                              setIsActivatingPlan(false);
                            }
                          }}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFC766] to-[#FFB347] text-[#0B0B0D] font-bold text-xs shadow hover:brightness-110 active:scale-95 transition disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>{isActivatingPlan ? "Ativando..." : "Ativar Anirium+"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>}

                {accountSection === "name" && saveError && <p role="alert" className="text-sm text-rose-400">Não foi possível salvar o nome. Tente novamente.</p>}
                {/* Ações de Salvar */}
                {accountSection === "name" && <div className="flex items-center justify-between pt-2">
                  {saveSuccess && (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 animate-in fade-in">
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Nome atualizado com sucesso!</span>
                    </span>
                  )}
                  {!saveSuccess && <span />}

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#FFC766] to-[#FFB347] text-[#0B0B0D] font-bold text-xs shadow-lg shadow-[#FFC766]/20 hover:brightness-110 active:scale-95 transition disabled:opacity-50"
                  >
                    {isSaving ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>}
              </form>
            </div>
          )}

          {/* ==================== ABA 2: FAVORITOS (4 GRAUS CANÔNICOS) ==================== */}
          {activeTab === "favoritos" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {level < 2 ? (
                <div className="p-8 rounded-3xl bg-gradient-to-b from-[#1A1A1F] to-[#141418] border border-[#FFC766]/30 text-center space-y-4 max-w-lg mx-auto shadow-2xl">
                  <div className="w-14 h-14 rounded-2xl bg-[#FFC766]/10 border border-[#FFC766]/30 flex items-center justify-center text-[#FFC766] mx-auto shadow">
                    <Heart className="w-7 h-7 fill-[#FFC766]" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="font-serif text-lg font-bold text-[#FFF9F0]">
                      Recurso Exclusivo Anirium+
                    </h3>
                    <p className="text-xs text-[#EADCC8]/70 leading-relaxed">
                      O sistema unificado de Favoritos nos 4 graus (Episódios, Temporadas, Obras e Franquias) e sincronização na nuvem é restrito ao Anirium+. Quando a assinatura expira ou é suspensa, as funções cessam imediatamente.
                    </p>
                  </div>
                  <button
                    onClick={() => switchLevel(2)}
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#FFC766] to-[#FFB347] text-[#0B0B0D] font-bold text-xs shadow-lg shadow-[#FFC766]/20 hover:brightness-110 active:scale-95 transition inline-flex items-center gap-2"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>Ativar Anirium+</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#3A3A43]/60">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFC766] flex items-center gap-2">
                        <Heart className="w-4 h-4 fill-[#FFC766]" />
                        <span>Favoritos Canônicos nos 4 Graus</span>
                      </h3>
                      <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                        Franquias, Séries, Temporadas e Episódios marcados com prioridade máxima.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-[#EADCC8]/60">
                      {bookmarkItems && bookmarkItems.length > 0 ? bookmarkItems.length : bookmarks.length} itens marcados
                    </span>
                  </div>

                  {favoriteError && <p role="alert" className="text-xs text-amber-300">Não foi possível confirmar a remoção. Atualize a conta antes de tentar novamente.</p>}
                  {favoriteItems.length > 0 ? (
                    <>
                      {favoriteItems.slice(favoritePage, favoritePage + 1).map(item => {
                        const episode = "episodeNumber" in item ? item.episodeNumber : undefined;
                        const season = "seasonIdx" in item ? item.seasonIdx : undefined;
                        const canPlay = item.entityType === "EPISODE" && isReleaseUuid(item.seasonEntityId) && isReleaseUuid(item.entityId) && Number.isSafeInteger(episode) && Number(episode) > 0 && Number.isSafeInteger(season) && Number(season) >= 0 && Boolean(onPlayEpisode && item.animeId);
                        return <article key={`${item.entityType}:${item.entityId}`} className="p-3 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] space-y-3">
                          <div className="flex gap-3 items-center">
                            {"animeImage" in item && item.animeImage && <img src={item.animeImage} alt="" className="w-12 h-16 object-cover rounded-lg flex-none"/>}
                            <div className="min-w-0"><h4 className="text-sm font-bold break-words">{item.animeTitle || `Entidade #${item.entityId}`}</h4><p className="text-xs text-[#EADCC8]/60">{item.entityType}{season != null ? ` • Temporada ${season + 1}` : ""}{episode != null ? ` • Episódio ${episode}` : ""}</p></div>
                          </div>
                          <div className="flex gap-3 flex-wrap">
                            {canPlay && onPlayEpisode && <ResumeEpisodeButton key={`${user?.id}:${item.entityId}`} label="Reproduzir episódio" onResume={() => onPlayEpisode(item.animeId, Number(season), Number(episode), item.seasonEntityId!, item.entityId)} onConfirmed={onClose}/>}
                            {item.animeId && onSelectAnime && <button onClick={() => { onSelectAnime(item.animeId); onClose(); }} className="text-xs text-[#FFC766] underline">Ver obra</button>}
                            <button disabled={favoritePending} aria-busy={favoritePending} aria-label={`Remover ${item.animeTitle || item.entityId} dos favoritos`} onClick={() => removeFavorite(item.entityType, item.entityId)} className="text-xs text-rose-300 underline disabled:opacity-40">Remover favorito</button>
                          </div>
                        </article>;
                      })}
                      <nav aria-label="Páginas de favoritos" className="flex justify-between gap-2 text-xs">
                        <button disabled={favoritePage === 0 || favoritePending} onClick={() => setFavoritePage(page => page - 1)}>Favorito anterior</button>
                        <span aria-live="polite">{favoritePage + 1} / {favoriteItems.length}</span>
                        <button disabled={favoritePage + 1 >= favoriteItems.length || favoritePending} onClick={() => setFavoritePage(page => page + 1)}>Próximo favorito</button>
                      </nav>
                    </>
                  ) : (
                    <div className="py-12 text-center text-[#EADCC8]/50 space-y-2">
                      <Heart className="w-10 h-10 mx-auto text-[#3A3A43]" />
                      <p className="text-sm font-semibold text-[#FFF9F0]">Nenhum favorito encontrado</p>
                      <p className="text-xs">Favorite obras, temporadas ou episódios para que eles apareçam aqui.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ==================== ABA 4: PREFERÊNCIAS DE REPRODUÇÃO ==================== */}
          {activeTab === "preferencias" && (
            <div className="max-w-2xl mx-auto space-y-3 animate-in fade-in duration-200">
              <nav aria-label="Contextos de preferências" className="flex gap-2 flex-wrap">
                {([{id:"languages",label:"Idiomas"},{id:"behavior",label:"Reprodução"}, ...(hasPlayerAddon ? [{id:"player",label:"Player"}] : [])] as const).map(item => <button type="button" key={item.id} aria-pressed={preferenceSection === item.id}
                  onClick={() => setPreferenceSection(item.id as "languages" | "behavior" | "player")}
                  className="px-3 py-1.5 text-xs rounded-full border border-[#3A3A43] aria-pressed:border-[#FFC766] aria-pressed:text-[#FFC766]">{item.label}</button>)}
              </nav>
              {preferenceState === "saving" && <p role="status" className="text-xs text-[#EADCC8]">Salvando preferência…</p>}
              {preferenceState === "saved" && <p role="status" className="text-xs text-emerald-400">Preferência salva.</p>}
              {preferenceState === "error" && <p role="alert" className="text-sm text-rose-400">Não foi possível salvar a preferência. Tente novamente.</p>}
              <div className="pb-2 border-b border-[#3A3A43]/60">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFC766] flex items-center gap-2">
                  <Sliders className="w-4 h-4" />
                  <span>Configurações Pessoais do Core</span>
                </h3>
              </div>

              <div className="space-y-3">
                {preferenceSection === "languages" && <>
                {/* Áudio Preferido */}
                <div className="p-4 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-[#FFF9F0]">Áudio Preferencial</h4>
                      <span
                        className="text-[10px] text-[#FFC766] cursor-help bg-[#FFC766]/10 px-1.5 py-0.5 rounded border border-[#FFC766]/30 font-mono"
                        title="Preferencial: Se a mídia possuir essa faixa, ela será ativada automaticamente. Caso não exista, será mantido o áudio original."
                      >
                        Preferencial
                      </span>
                    </div>
                    <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                      Idioma prioritário ao iniciar reproduções (aplicado quando disponível na mídia).
                    </p>
                  </div>
                  <select
                    aria-label="Áudio preferencial"
                    disabled={preferenceState === "saving"}
                    value={user?.settings?.preferredAudio || "Japonês (Original)"}
                    onChange={(e) => handleTogglePref("preferredAudio", e.target.value)}
                    className="bg-[#23232A] border border-[#3A3A43] text-xs font-semibold text-[#FFF9F0] rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#FFC766]"
                  >
                    <option value="Japonês (Original)">Japonês (Original)</option>
                    <option value="Português (Brasil)">Português (Brasil)</option>
                    <option value="English">English</option>
                  </select>
                </div>

                {/* Legendas Preferidas */}
                <div className="p-4 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-[#FFF9F0]">Legendas Preferenciais</h4>
                      <span
                        className="text-[10px] text-[#FFC766] cursor-help bg-[#FFC766]/10 px-1.5 py-0.5 rounded border border-[#FFC766]/30 font-mono"
                        title="Preferencial: Se a mídia ou add-on disponibilizar legenda neste idioma, ela será selecionada automaticamente. Não impede a reprodução se não estiver presente."
                      >
                        Preferencial
                      </span>
                    </div>
                    <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                      Legenda sincronizada prioritária pré-carregada quando existente.
                    </p>
                  </div>
                  <select
                    aria-label="Legendas preferenciais"
                    disabled={preferenceState === "saving"}
                    value={user?.settings?.preferredSubtitles || "Português (Brasil)"}
                    onChange={(e) => handleTogglePref("preferredSubtitles", e.target.value)}
                    className="bg-[#23232A] border border-[#3A3A43] text-xs font-semibold text-[#FFF9F0] rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#FFC766]"
                  >
                    <option value="Português (Brasil)">Português (Brasil)</option>
                    <option value="English">English</option>
                    <option value="Desativado">Desativado</option>
                  </select>
                </div>

                </>}
                {preferenceSection === "behavior" && <>
                {/* Auto Próximo Episódio */}
                <div className="p-4 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-[#FFF9F0]">Auto Próximo Episódio</h4>
                    <p className="text-[11px] text-[#EADCC8]/60">Avançar automaticamente ao terminar um episódio.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Auto próximo episódio"
                    aria-checked={Boolean(user?.settings?.autoNextEpisode)}
                    disabled={preferenceState === "saving"}
                    onClick={() => handleTogglePref("autoNextEpisode", !user?.settings?.autoNextEpisode)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      user?.settings?.autoNextEpisode ? "bg-[#FFC766]" : "bg-[#23232A]"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-[#0B0B0D] absolute top-1 transition-transform ${
                        user?.settings?.autoNextEpisode ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Pular Abertura Automaticamente */}
                <div className="p-4 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-[#FFF9F0]">Pular Introdução / Abertura</h4>
                    <p className="text-[11px] text-[#EADCC8]/60">Avança os 85s canônicos de abertura.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Pular introdução ou abertura"
                    aria-checked={Boolean(user?.settings?.autoSkipIntro)}
                    disabled={preferenceState === "saving"}
                    onClick={() => handleTogglePref("autoSkipIntro", !user?.settings?.autoSkipIntro)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${
                      user?.settings?.autoSkipIntro ? "bg-[#FFC766]" : "bg-[#23232A]"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-[#0B0B0D] absolute top-1 transition-transform ${
                        user?.settings?.autoSkipIntro ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                </>}
                {/* Switch Soberano: Ativar modo reprodutor nos botões de episódios */}
                {hasPlayerAddon && preferenceSection === "player" && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-[#1A1A1F] to-[#23232A] border border-[#FFC766]/40 shadow-lg flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-[#FFC766] fill-current" />
                        <h4 className="text-xs font-bold text-[#FFF9F0]">Usar Reprodutor nos Episódios</h4>
                      </div>
                      <p className="text-[11px] text-[#EADCC8]/70 leading-relaxed">
                        Habilita trocar os botões de cada episódio na lista para acionar diretamente o player ativo ao invés de redirecionar para distribuidores oficiais.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                    aria-label="Usar reprodutor nos episódios"
                    aria-checked={Boolean(user?.settings?.usePlayerOnEpisodes)}
                    disabled={preferenceState === "saving"}
                    onClick={() => handleTogglePref("usePlayerOnEpisodes", !user?.settings?.usePlayerOnEpisodes)}
                      className={`w-11 h-6 rounded-full transition-colors relative flex-none ${
                        user?.settings?.usePlayerOnEpisodes ? "bg-[#FFC766]" : "bg-[#23232A] border border-[#3A3A43]"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-[#0B0B0D] absolute top-1 transition-transform ${
                          user?.settings?.usePlayerOnEpisodes ? "left-6" : "left-1"
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "status_pro" && <div className="space-y-3">
            {level < 2 ? <div className="rounded-2xl border border-[#FFC766]/30 p-4 space-y-3">
              <h3 className="text-sm font-bold">Status Pro</h3><p className="text-xs">Registros de progresso e avaliações disponíveis com acesso Anirium+.</p>
              <button type="button" onClick={() => setShowLevelModal(true)} className="text-xs text-[#FFC766] underline">Consultar níveis</button>
            </div> : <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-bold">Status Pro</h3>
                <select aria-label="Grau do registro" disabled={isLoadingStatuses} value={statusProDegree}
                  onChange={event => { if (event.target.value === statusProDegree) return; setIsLoadingStatuses(true); statusRequestSequence.current++; setStatusCursors([null]); setStatusPage(0); setNextStatusCursor(null); setEntityStatuses([]); setStatusLoaded(false); setStatusError(false); setStatusProDegree(event.target.value as typeof statusProDegree); }} className="text-xs rounded-lg bg-[#1A1A1F] p-2 border border-[#3A3A43]">
                  <option value="ALL">Todos os graus</option><option value="UNIVERSE">Franquias</option><option value="SERIES">Obras</option><option value="SEASON">Temporadas</option><option value="EPISODE">Episódios</option>
                </select>
                <button type="button" disabled={isLoadingStatuses} onClick={fetchEntityStatuses} className="text-xs underline">Atualizar registros</button>
              </div>
              <nav aria-label="Páginas de registros" className="flex justify-between gap-2 text-xs">
                <button type="button" disabled={isLoadingStatuses || statusPage === 0} onClick={() => { setIsLoadingStatuses(true); statusRequestSequence.current++; setStatusPage(page => Math.max(0, page - 1)); setEntityStatuses([]); setStatusLoaded(false); }} className="px-3 py-1 border rounded disabled:opacity-40">Registro anterior</button>
                <span aria-live="polite">{statusPage + 1}</span>
                <button type="button" disabled={isLoadingStatuses || !nextStatusCursor} onClick={() => { setIsLoadingStatuses(true); statusRequestSequence.current++; setStatusCursors(previous => [...previous.slice(0, statusPage + 1), nextStatusCursor]); setStatusPage(statusPage + 1); setEntityStatuses([]); setStatusLoaded(false); }} className="px-3 py-1 border rounded disabled:opacity-40">Próximo registro</button>
              </nav>
              {statusError ? <p role="alert" className="text-xs text-amber-300">Não foi possível carregar os registros. Use Atualizar registros para tentar novamente.</p>
                : isLoadingStatuses || !statusLoaded ? <p role="status" className="text-xs">Carregando registros…</p>
                : entityStatuses.length ? entityStatuses.map(record => <StatusRecord key={record.id} record={record} onSelectAnime={onSelectAnime} onPlayEpisode={onPlayEpisode} onClose={onClose}/>)
                : <p className="text-xs">Nenhum registro encontrado neste grau.</p>}
            </>}
          </div>}

          {/* ==================== ABA 6: MEUS PLUGINS (CONFIGURAÇÃO PRÓPRIA DO USUÁRIO) ==================== */}
          {activeTab === "plugins" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-[#3A3A43]/60">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#FFC766] flex items-center gap-2">
                    <Puzzle className="w-4 h-4 text-[#FFC766]" />
                    <span>Plugins & Extensões</span>
                  </h3>

                </div>
                <button
                  type="button"
                  disabled={changingAddon !== null || isLoadingAddons}
                  onClick={() => {
                    setManifestError(null);
                    setManifestInput("");
                    setShowAddManifestModal(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#FFC766] hover:bg-[#e6b358] text-[#0B0B0D] font-bold text-xs flex items-center gap-1.5 shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Manifesto</span>
                </button>
              </div>

              <button type="button" disabled={isLoadingAddons || changingAddon !== null} onClick={async () => { const synced = await refreshUser(); await fetchUserAddons(); setAddonActionError(synced ? null : "Não foi possível atualizar a conta."); }} className="text-xs underline">Atualizar plugins</button>
              {addonListError && <p role="alert" className="text-xs text-amber-300">Não foi possível carregar os plugins.</p>}
              {addonActionError && <p role="alert" className="text-xs text-rose-300">{addonActionError}</p>}
              {isLoadingAddons || (!addonListLoaded && !addonListError) ? (
                <div role="status" className="py-3 text-center text-[#EADCC8]/50 text-xs">
                  Carregando lista de plugins...
                </div>
              ) : userAddons.length > 0 ? (
                <div className="flex flex-col gap-3.5 w-full">
                  {userAddons.slice(addonPage, addonPage + 1).map((addon) => {
                    const isOfficialPlus = addon.type === "official-plus" || addon.id === "player-pro";
                    return (
                      <div
                        key={addon.id}
                        className={`w-full p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                          addon.enabled
                            ? "bg-[#1A1A1F] border-[#FFC766]/40 shadow-md"
                            : "bg-[#141418] border-[#3A3A43]/60 opacity-75"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl border flex-none ${
                              addon.enabled ? "bg-[#FFC766]/10 border-[#FFC766]/30 text-[#FFC766]" : "bg-[#23232A] border-[#3A3A43] text-zinc-400"
                            }`}>
                              <Puzzle className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-[#FFF9F0]">{addon.name}</h4>
                                {isOfficialPlus && (
                                  <span className="text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded-full bg-[#FFC766]/15 text-[#FFC766] border border-[#FFC766]/30 flex items-center gap-1">
                                    <Zap className="w-2.5 h-2.5 fill-current" />
                                    <span>Nativo Anirium+</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-mono text-[#EADCC8]/60">{addon.kind === "remote-manifest" ? "Manifesto remoto (URL)" : `v${addon.version} • ${addon.author || "Comunidade"}`}</span>
                            </div>
                          </div>

                          {addonSection === "access" && <div className="flex items-center gap-2">
                            <>
                            {!isOfficialPlus && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUninstallAddon(addon.id)}
                                  className="p-1.5 rounded-lg text-[#EADCC8]/40 hover:text-rose-400 hover:bg-rose-950/30 transition"
                                  aria-label={`Remover ${addon.name}`} disabled={changingAddon !== null}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                                <button
                                  type="button"
                                  aria-label={`${addon.enabled ? 'Desativar' : 'Ativar'} ${addon.name}`}
                                  aria-pressed={Boolean(addon.enabled)}
                                  disabled={changingAddon !== null}
                                  onClick={() => performAddonAction({ action: "toggle_addon", addonId: addon.id, enabled: !addon.enabled }, addon.id)}
                                  aria-busy={changingAddon === addon.id}
                                  className={`w-11 h-6 rounded-full transition-colors relative flex-none ${
                                    addon.enabled ? "bg-[#FFC766]" : "bg-[#23232A]"
                                  }`}
                                >
                                  <div
                                    className={`w-4 h-4 rounded-full bg-[#0B0B0D] absolute top-1 transition-transform ${
                                      addon.enabled ? "left-6" : "left-1"
                                    }`}
                                  />
                                </button>
                            </>
                          </div>}
                        </div>

                        <nav aria-label="Contextos do plugin" className="flex gap-2">
                          <button type="button" aria-pressed={addonSection === "access"} onClick={() => setAddonSection("access")} className="text-xs px-2 py-1 border rounded">Acesso</button>
                          <button type="button" aria-pressed={addonSection === "details"} onClick={() => setAddonSection("details")} className="text-xs px-2 py-1 border rounded">Detalhes</button>
                        </nav>
                        {addonSection === "details" && <div className="space-y-2">
                          <p className="text-xs text-[#EADCC8]/75 leading-relaxed break-words">{(addon.description || "Sem descrição registrada.").slice(addonDetailPage * 240, (addonDetailPage + 1) * 240)}</p>
                          {(addon.description?.length || 0) > 240 && <nav aria-label="Páginas dos detalhes" className="flex justify-between text-xs">
                            <button disabled={addonDetailPage === 0} onClick={() => setAddonDetailPage(page => Math.max(0, page - 1))}>Trecho anterior</button>
                            <span>{addonDetailPage + 1} / {Math.ceil(addon.description.length / 240)}</span>
                            <button disabled={(addonDetailPage + 1) * 240 >= addon.description.length} onClick={() => setAddonDetailPage(page => page + 1)}>Próximo trecho</button>
                          </nav>}
                        </div>}

                        {addonSection === "access" && <div className="flex items-center justify-between text-[10px] font-mono text-[#EADCC8]/50 pt-2 border-t border-[#3A3A43]/40">
                          <span>{isOfficialPlus ? "Player Oficial Opcional" : "Extensão Externa da Comunidade"}</span>
                          <span className={addon.enabled ? "text-emerald-400" : "text-zinc-500"}>
                            {addon.enabled ? "Ativado na conta" : "Desativado"}
                          </span>
                        </div>}
                      </div>
                    );
                  })}
                </div>
              ) : !addonListError ? (
                <div className="py-3 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43] flex items-center justify-center mx-auto text-[#EADCC8]/40">
                    <Puzzle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#FFF9F0]">Nenhum plugin instalado</p>
                    <p className="text-xs text-[#EADCC8]/50 mt-1 max-w-sm mx-auto">
                      Sua conta não possui plugins instalados. Você pode adicionar extensões colando o código de um manifesto.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManifestError(null);
                      setManifestInput("");
                      setShowAddManifestModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#FFC766] hover:bg-[#e6b358] text-[#0B0B0D] font-bold text-xs inline-flex items-center gap-1.5 shadow transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Manifesto</span>
                  </button>
                </div>
              ) : null}
              {userAddons.length > 0 && !isLoadingAddons && <nav aria-label="Páginas de plugins" className="flex justify-between gap-2 text-xs">
                <button disabled={addonPage === 0 || changingAddon !== null} onClick={() => { setAddonPage(page => page - 1); setAddonDetailPage(0); }} className="px-3 py-2 border rounded">Plugin anterior</button>
                <span aria-live="polite">{addonPage + 1} / {userAddons.length}</span>
                <button disabled={addonPage + 1 >= userAddons.length || changingAddon !== null} onClick={() => { setAddonPage(page => page + 1); setAddonDetailPage(0); }} className="px-3 py-2 border rounded">Próximo plugin</button>
              </nav>}

              {/* Modal de Adicionar Manifesto */}
              {showAddManifestModal && (
                <ModalDialog label="Adicionar manifesto" onClose={() => { if (!addonMutationPending.current) setShowAddManifestModal(false); }} className="fixed inset-0 z-50 w-screen h-screen bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="w-full max-w-lg bg-[#141418] border border-[#3A3A43] rounded-2xl p-5 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-[#3A3A43]/60 pb-3">
                      <div className="flex items-center gap-2">
                        <Puzzle className="w-4 h-4 text-[#FFC766]" />
                        <h4 className="text-sm font-bold text-[#FFF9F0]">Adicionar Manifesto do Plugin</h4>
                      </div>
                      <button
                        type="button"
                        disabled={isInstallingManifest}
                        onClick={() => setShowAddManifestModal(false)}
                        aria-label="Fechar manifesto"
                        className="p-1 rounded-lg text-[#EADCC8]/60 hover:text-white hover:bg-[#23232A]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="plugin-manifest-input" className="text-[11px] font-mono text-[#EADCC8]/70 block">
                        URL ou JSON do manifesto:
                      </label>
                      <textarea
                        id="plugin-manifest-input" disabled={isInstallingManifest}
                        value={manifestInput}
                        onChange={(e) => setManifestInput(e.target.value)}
                        placeholder="https://servidor.example/manifest"
                        rows={2}
                        className="w-full p-3 rounded-xl bg-[#0B0B0D] border border-[#3A3A43] text-xs font-mono text-[#FFF9F0] placeholder:text-[#EADCC8]/30 focus:outline-none focus:border-[#FFC766] resize-none"
                      />
                      {manifestError && (
                        <div role="alert" className="flex items-center gap-1.5 text-rose-400 text-[11px] font-medium">
                          <AlertCircle className="w-3.5 h-3.5 flex-none" />
                          <span>{manifestError}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        disabled={isInstallingManifest}
                        onClick={() => setShowAddManifestModal(false)}
                        className="px-4 py-2 rounded-xl bg-[#1A1A1F] hover:bg-[#23232A] text-xs text-[#EADCC8]/70 hover:text-white transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={isInstallingManifest}
                        onClick={handleInstallManifest}
                        className="px-4 py-2 rounded-xl bg-[#FFC766] hover:bg-[#e6b358] text-[#0B0B0D] text-xs font-bold transition disabled:opacity-50"
                      >
                        {isInstallingManifest ? "Instalando..." : "Instalar Plugin"}
                      </button>
                    </div>
                  </div>
                </ModalDialog>
              )}
            </div>
          )}

          {/* ==================== ABA 7: PAINEL ADMIN (CONTROLE DE CONTAS E ANIRIUM+) ==================== */}
          {activeTab === "admin" && level === 3 && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#3A3A43]/60">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <span>Gestão de contas</span>
                  </h3>
                  <p className="text-[11px] text-[#EADCC8]/60 mt-0.5">
                    Acesso e assinatura por conta.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#EADCC8]/60 bg-[#1A1A1F] px-3 py-1 rounded-lg border border-[#3A3A43]">
                    {isLoadingAdmin ? "Atualizando…" : adminError && adminUsers.length === 0 ? "Contagem indisponível" : `${adminUsers.length} contas`}
                  </span>
                  <button
                    onClick={fetchAdminUsers}
                    aria-label="Atualizar contas" disabled={isLoadingAdmin || adminPendingUser !== null}
                    className="p-1.5 rounded-lg bg-[#1A1A1F] hover:bg-[#23232A] border border-[#3A3A43] text-emerald-400 transition"
                    title="Atualizar lista"
                  >
                    <Activity className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {adminError && <p role="alert" className="text-xs text-amber-300">{adminError}</p>}
              {isLoadingAdmin ? (
                <div role="status" className="py-4 text-center text-[#EADCC8]/50 text-xs">
                  Carregando lista de contas...
                </div>
              ) : adminUsers.length > 0 ? (
                <div className="space-y-2.5">
                  {adminUsers.slice(adminPage, adminPage + 1).map((u) => {
                    const isSelf = u.id === user?.id;
                    const tierName = u.levelTier === 3 ? "Admin" : u.levelTier === 2 ? "Anirium+" : u.levelTier === 1 ? "Membro" : "Visitante";
                    const isTier2 = u.levelTier === 2;

                    return (
                      <div
                        key={u.id}
                        className="p-3.5 rounded-2xl bg-[#1A1A1F] border border-[#3A3A43]/80 hover:border-[#3A3A43] flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#0B0B0D] border border-[#3A3A43] flex-none relative">
                            <img
                              src={u.avatarUrl || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80"}
                              alt={u.displayName}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-0 inset-x-0 bg-black/80 text-[7px] font-mono text-center text-[#FFC766]">
                              L{u.levelTier}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-[#FFF9F0] truncate">
                                {u.displayName}
                              </h4>
                              {isSelf && (
                                <span className="text-[9px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.2 rounded-full">
                                  Você
                                </span>
                              )}
                              <span
                                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                                  u.levelTier === 3
                                    ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/40"
                                    : u.levelTier === 2
                                    ? "bg-[#FFC766]/15 text-[#FFC766] border-[#FFC766]/30"
                                    : "bg-blue-950/40 text-blue-400 border-blue-800/30"
                                }`}
                              >
                                {tierName}
                              </span>
                            </div>
                            <p className="text-[10px] text-[#EADCC8]/60 font-mono truncate">
                              @{u.username} • ID: {u.id}
                            </p>
                            {isTier2 && u.subscriptionExpiresAt && (
                              <p className="text-[9px] text-[#FFC766]/80 font-mono mt-0.5">
                                Expira em: {new Date(u.subscriptionExpiresAt).toLocaleString("pt-BR")}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Controles de Nível / Assinatura Anirium+ */}
                        <div className="flex items-center gap-3 self-end sm:self-auto flex-none">
                          {u.levelTier === 3 ? (
                            <span className="text-[11px] font-mono text-emerald-400/80 px-3 py-1 bg-emerald-950/30 rounded-lg border border-emerald-500/30">
                              Administrador
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono text-[#EADCC8]/70">
                                {isTier2 ? "Anirium+ Ativo" : "Trial 1d:"}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleUserAniriumPlus(u.id, u.levelTier, "trial_1d")}
                                className={`w-11 h-6 rounded-full transition-colors relative ${
                                  isTier2 ? "bg-[#FFC766]" : "bg-[#23232A]"
                                }`}
                                role="switch" aria-checked={isTier2} aria-busy={adminPendingUser === u.id}
                                disabled={adminPendingUser !== null}
                                aria-label={isTier2 ? "Revogar Anirium+" : "Ativar Trial de 1 dia do Anirium+"}
                              >
                                <div
                                  className={`w-4 h-4 rounded-full bg-[#0B0B0D] absolute top-1 transition-transform ${
                                    isTier2 ? "left-6" : "left-1"
                                  }`}
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !adminError ? (
                <div className="py-4 text-center text-[#EADCC8]/50 space-y-2">
                  <Users className="w-10 h-10 mx-auto text-[#3A3A43]" />
                  <p className="text-sm font-semibold text-[#FFF9F0]">Nenhuma conta encontrada</p>
                </div>
              ) : null}
              {adminUsers.length > 0 && !isLoadingAdmin && <nav aria-label="Páginas de contas" className="flex items-center justify-between gap-2">
                <button type="button" disabled={adminPage === 0 || adminPendingUser !== null} onClick={() => setAdminPage(page => Math.max(0, page - 1))} className="text-xs px-3 py-2 rounded-lg border border-[#3A3A43] disabled:opacity-40">Conta anterior</button>
                <span aria-live="polite" className="text-xs">{adminPage + 1} / {adminUsers.length}</span>
                <button type="button" disabled={adminPage + 1 >= adminUsers.length || adminPendingUser !== null} onClick={() => setAdminPage(page => Math.min(adminUsers.length - 1, page + 1))} className="text-xs px-3 py-2 rounded-lg border border-[#3A3A43] disabled:opacity-40">Próxima conta</button>
              </nav>}
            </div>
          )}
        </div>
      </div>

      {/* Sub-Modal de Alternância de Nível */}
      <LevelSwitcher
        isOpen={showLevelModal}
        onClose={() => setShowLevelModal(false)}
      />
    </ModalDialog>
  );
}
