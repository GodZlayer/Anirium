"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { UserProfile, ExperienceLevel, WatchHistoryItem, BookmarkItem } from "@/lib/userProfiles";
import { loadAccountPlugins } from "@/lib/extensions/pluginLoader";
import { addonRegistry } from "@/lib/extensions/addonRegistry";
import { themeCssProperties } from "@/lib/themeTokens";
import { resolveApiUrl } from "@/lib/apiConfig";

interface UserContextType {
  user: UserProfile | null;
  level: ExperienceLevel;
  watchHistory: WatchHistoryItem[];
  bookmarks: number[];
  bookmarkItems: BookmarkItem[];
  activeTheme: any;
  hasPlayerAddon: boolean;
  isLoading: boolean;
  isDevStudioOpen: boolean;
  setIsDevStudioOpen: (open: boolean) => void;
  switchLevel: (level: ExperienceLevel) => Promise<boolean>;
  levelChangeError: boolean;
  switchUser: (userId: string) => Promise<void>;
  saveProgress: (
    animeId: number,
    seasonIdx: number,
    episode: number,
    progressSeconds: number,
    durationSeconds: number,
    seasonEntityId: string
  ) => Promise<void>;
  toggleEntityBookmark: (
    entityType: "UNIVERSE" | "SERIES" | "SEASON" | "EPISODE",
    entityId: string,
    parentSeriesId?: number,
    seasonIdx?: number,
    episodeNumber?: number,
    seasonEntityId?: string
  ) => Promise<boolean>;
  removeEntityBookmark: (entityType: "UNIVERSE" | "ARC" | "SERIES" | "SEASON" | "EPISODE", entityId: string) => Promise<boolean>;
  toggleAddon: (addonId: string, enabled: boolean) => Promise<void>;
  loginWithGoogle: (
    googleData:
      | { credential: string }
      | { googleId: string; email: string; name: string; avatarUrl?: string }
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; avatarUrl?: string; settings?: any }) => Promise<void>;
  activateSubscription: (plan?: string) => Promise<void>;
  refreshUser: () => Promise<boolean>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("anirium_device_session");
  }
  const url = typeof input === "string" ? resolveApiUrl(input) : input;
  return fetch(url, {
    ...init,
    credentials: "include",
  });
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  useEffect(() => {
    const properties = themeCssProperties(user?.settings?.theme);
    for (const [key,value] of Object.entries(properties)) document.documentElement.style.setProperty(key,value);
    return () => { for (const key of Object.keys(properties)) document.documentElement.style.removeProperty(key); };
  },[user?.settings?.theme]);
  const [level, setLevel] = useState<ExperienceLevel>(0);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [bookmarkItems, setBookmarkItems] = useState<BookmarkItem[]>([]);
  const [activeTheme, setActiveTheme] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDevStudioOpen, setIsDevStudioOpen] = useState<boolean>(false);
  const [registryVersion, setRegistryVersion] = useState<number>(0);
  const [levelChangeError, setLevelChangeError] = useState(false);

  // Inscreve no AddonRegistry para re-renderizar imediatamente quando um plugin carregar
  useEffect(() => {
    return addonRegistry.subscribe(() => {
      setRegistryVersion((v) => v + 1);
    });
  }, []);

  const userReadSequence = React.useRef(0);
  const userIdentityRef = React.useRef(user?.id ?? "");
  userIdentityRef.current = user?.id ?? "";

  const fetchUserData = useCallback(async () => {
    const sequence = ++userReadSequence.current;
    const identity = userIdentityRef.current;
    try {
      const res = await apiFetch("/api/user");
      const data = await res.json();
      if (sequence !== userReadSequence.current || identity !== userIdentityRef.current) return false;
      if (!res.ok) return false;
      if (data.success === true && data.user) {
        setUser(data.user);
        setLevel(data.user.level_tier);
        setWatchHistory(data.history || []);
        setBookmarks(data.bookmarks || []);
        setBookmarkItems(data.bookmarkItems || []);
        setActiveTheme(data.activeTheme || null);
        return true;
      } else {
        setUser(null);
        setLevel(0);
        setWatchHistory([]);
        setBookmarks([]);
        setBookmarkItems([]);
        setActiveTheme(null);
        return false;
      }
    } catch (err) {
      console.error("[UserContext] Erro ao carregar dados do usuário:");
      return false;
    } finally {
      if (sequence === userReadSequence.current && identity === userIdentityRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Processar id_token retornado no hash da URL em caso de OAuth redirect
    if (typeof window !== "undefined" && window.location.hash.includes("id_token=")) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const idToken = params.get("id_token");
      if (idToken) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        loginWithGoogle({ credential: idToken });
        return;
      }
    }
    fetchUserData();
  }, [fetchUserData]);

  // Carregar dinamicamente os componentes dos plugins ativos da conta
  useEffect(() => {
    loadAccountPlugins(user?.enabledAddons || [], level);
  }, [user?.enabledAddons, level]);

  const switchLevel = async (newLevel: ExperienceLevel) => {
    setIsLoading(true);
    setLevelChangeError(false);
    try {
      const res = await apiFetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch_level", level: newLevel }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.user) throw new Error("Level change unavailable");
      if (data.success && data.user) {
        setUser(data.user);
        setLevel(data.user.level_tier);
        setActiveTheme(data.activeTheme || null);
        // Recarregar histórico e favoritos do novo perfil
        await fetchUserData();
        return true;
      }
      return false;
    } catch (err) {
      console.error("[UserContext] Falha ao alternar nível:");
      setLevelChangeError(true);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const switchUser = async (userId: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch_user", userId }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        setLevel(data.user.level_tier);
        setActiveTheme(data.activeTheme || null);
        await fetchUserData();
      }
    } catch (err) {
      console.error("[UserContext] Falha ao alternar usuário:");
    } finally {
      setIsLoading(false);
    }
  };

  const saveProgress = async (
    animeId: number,
    seasonIdx: number,
    episode: number,
    progressSeconds: number,
    durationSeconds: number,
    seasonEntityId: string
  ) => {
    // Apenas persistir histórico se for nível 1, 2 ou 3 (Nível 0 é puramente anônimo/canônico)
    if (level === 0) return;

    try {
      await apiFetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_progress",
          animeId,
          seasonIdx,
          episode,
          progressSeconds,
          durationSeconds,
          seasonEntityId,
        }),
      });
    } catch (err) {
      console.error("[UserContext] Erro ao salvar progresso:");
    }
  };

  const toggleEntityBookmark = async (
    entityType: "UNIVERSE" | "SERIES" | "SEASON" | "EPISODE",
    entityId: string,
    parentSeriesId?: number,
    seasonIdx?: number,
    episodeNumber?: number,
    seasonEntityId?: string
  ): Promise<boolean> => {
    try {
      const res = await apiFetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_bookmark",
          entityType,
          ...(entityType === "EPISODE" ? {} : {entityId}),
          parentSeriesId,
          seasonIdx,
            episodeNumber,
            seasonEntityId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBookmarks(data.bookmarks || []);
        if (data.bookmarkItems) setBookmarkItems(data.bookmarkItems);
        fetchUserData();
        return data.isBookmarked;
      }
      return false;
    } catch (err) {
      console.error("[UserContext] Erro ao alterar favorito da entidade:");
      return false;
    }
  };

  const removeEntityBookmark = async (entityType: "UNIVERSE" | "ARC" | "SERIES" | "SEASON" | "EPISODE", entityId: string): Promise<boolean> => {
    const identity = userIdentityRef.current;
    userReadSequence.current++;
    try {
      const res = await apiFetch("/api/user", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_bookmark", entityType, entityId }),
      });
      const data = await res.json();
      if (identity !== userIdentityRef.current || !res.ok || data.success !== true || data.isBookmarked !== false || !Array.isArray(data.bookmarks) || !Array.isArray(data.bookmarkItems)) return false;
      setBookmarks(data.bookmarks); setBookmarkItems(data.bookmarkItems);
      return true;
    } catch { return false; }
  };

  const toggleAddon = async (addonId: string, enabled: boolean) => {
    try {
      const res = await apiFetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_addon", addonId, enabled }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        setActiveTheme(data.activeTheme || null);
      }
    } catch (err) {
      console.error("[UserContext] Erro ao alterar addon:");
    }
  };

  const loginWithGoogle = async (
    googleData:
      | { credential: string }
      | { googleId: string; email: string; name: string; avatarUrl?: string }
  ) => {
    setIsLoading(true);
    try {
      if ("credential" in googleData) {
        const res = await apiFetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: googleData.credential }),
        });
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          setLevel(data.user.level_tier);
          setActiveTheme(data.activeTheme || null);
          await fetchUserData();
        }
      } else {
        const res = await apiFetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "google_login",
            ...googleData,
          }),
        });
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          setLevel(data.user.level_tier);
          setActiveTheme(data.activeTheme || null);
          await fetchUserData();
        }
      }
    } catch (err) {
      console.error("[UserContext] Falha no login Google:");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await apiFetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setUser(null);
      setLevel(0);
      setWatchHistory([]);
      setBookmarks([]);
      setActiveTheme(null);
    } catch (err) {
      console.error("[UserContext] Falha no logout:");
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (data: { displayName?: string; avatarUrl?: string; settings?: any }) => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profile",
          ...data,
        }),
      });
      const resData = await res.json();
      if (!res.ok || !resData.success || !resData.user) throw new Error("Não foi possível salvar o perfil");
      if (resData.success && resData.user) {
        setUser(resData.user);
        await fetchUserData();
      }
    } catch (err) {
      console.error("[UserContext] Falha ao atualizar perfil:");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const activateSubscription = async (plan: string = "trial_1d") => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_anirium_plus", plan }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        setLevel(data.user.level_tier);
        await fetchUserData();
      }
    } catch (err) {
      console.error("[UserContext] Falha ao ativar Anirium+:");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    return fetchUserData();
  };

  const hasPlayerAddon = Boolean(
    level >= 2 ||
    Boolean(addonRegistry.getActivePlayerPlugin()) ||
    user?.enabledAddons?.some((id) => {
      if (id === "player-pro") return true;
      const manifest = addonRegistry.getInstalledAddons().find((m) => m.id === id);
      return manifest?.capabilities?.includes("ui.player.render") || id.includes("player");
    })
  );

  return (
    <UserContext.Provider
      value={{
        user,
        level,
        watchHistory,
        bookmarks,
        bookmarkItems,
        activeTheme,
        hasPlayerAddon,
        isLoading,
        isDevStudioOpen,
        setIsDevStudioOpen,
        switchLevel,
        levelChangeError,
        switchUser,
        saveProgress,
        toggleEntityBookmark,
        removeEntityBookmark,
        toggleAddon,
        loginWithGoogle,
        logout,
        updateProfile,
        activateSubscription,
        refreshUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

const defaultUserContext: UserContextType = {
  user: null,
  level: 0,
  watchHistory: [],
  bookmarks: [],
  bookmarkItems: [],
  activeTheme: null,
  hasPlayerAddon: false,
  isLoading: false,
  isDevStudioOpen: false,
  setIsDevStudioOpen: () => {},
  switchLevel: async () => false,
    levelChangeError: false,
  switchUser: async () => {},
  saveProgress: async () => {},
  toggleEntityBookmark: async () => false,
  removeEntityBookmark: async () => false,
  toggleAddon: async () => {},
  loginWithGoogle: async () => {},
  logout: async () => {},
  updateProfile: async () => {},
  activateSubscription: async () => {},
  refreshUser: async () => false,
};

export function useUser() {
  const context = useContext(UserContext);
  return context || defaultUserContext;
}
