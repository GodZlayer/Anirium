import { useCallback, useEffect, useState } from "react";

export interface PlayerProAutomationPrefs {
  autoSkipIntro: boolean;
  autoSkipEnding: boolean;
  autoNextEpisode: boolean;
}

const STORAGE_KEY = "anirium.playerPro.automation.v1";
const CHANGE_EVENT = "anirium:player-pro-prefs-changed";

const DEFAULT_PREFS: PlayerProAutomationPrefs = {
  autoSkipIntro: false,
  autoSkipEnding: false,
  autoNextEpisode: false,
};

export function loadPlayerProPrefs(): PlayerProAutomationPrefs {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PREFS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFS };
    }
    const parsed = JSON.parse(raw);
    return {
      autoSkipIntro: parsed?.autoSkipIntro === true,
      autoSkipEnding: parsed?.autoSkipEnding === true,
      autoNextEpisode: parsed?.autoNextEpisode === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePlayerProPrefs(
  patch: Partial<PlayerProAutomationPrefs>
): PlayerProAutomationPrefs {
  const next: PlayerProAutomationPrefs = {
    ...loadPlayerProPrefs(),
    ...patch,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota / private mode errors.
    }
    window.dispatchEvent(
      new CustomEvent<PlayerProAutomationPrefs>(CHANGE_EVENT, { detail: next })
    );
  }
  return next;
}

export function usePlayerProPrefs(): [
  PlayerProAutomationPrefs,
  (patch: Partial<PlayerProAutomationPrefs>) => void
] {
  const [prefs, setPrefs] = useState<PlayerProAutomationPrefs>(() =>
    loadPlayerProPrefs()
  );

  useEffect(() => {
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<PlayerProAutomationPrefs>).detail;
      if (detail) {
        setPrefs(detail);
      } else {
        setPrefs(loadPlayerProPrefs());
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setPrefs(loadPlayerProPrefs());
      }
    };
    window.addEventListener(CHANGE_EVENT, handleCustom);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleCustom);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const updatePrefs = useCallback(
    (patch: Partial<PlayerProAutomationPrefs>) => {
      const next = savePlayerProPrefs(patch);
      setPrefs(next);
    },
    []
  );

  return [prefs, updatePrefs];
}
