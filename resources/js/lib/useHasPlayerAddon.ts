import { useEffect, useState } from "react";
import { ACCOUNT_ADDONS_CHANGED, requestAccountAddons } from "./accountAddonClient";

export function isEnabledVideoPlayerAddon(addon: any): boolean {
  if (!addon?.enabled) return false;
  if (addon.category === "engine.renderer" && (addon.mediaType === "video" || !addon.mediaType)) {
    return true;
  }
  const caps: string[] = Array.isArray(addon.capabilities) ? addon.capabilities : [];
  return caps.includes("ui.player.render") || addon.id === "player-pro";
}

export function useHasPlayerAddon(isAuthenticated: boolean, initialValue = false): boolean {
  const [hasPlayerAddon, setHasPlayerAddon] = useState<boolean>(Boolean(isAuthenticated && initialValue));

  useEffect(() => {
    if (!isAuthenticated) {
      setHasPlayerAddon(false);
      return;
    }

    setHasPlayerAddon(Boolean(initialValue));
    let mounted = true;

    const refresh = async () => {
      try {
        const data = await requestAccountAddons();
        if (!mounted) return;
        const addons: any[] = Array.isArray(data?.addons) ? data.addons : [];
        setHasPlayerAddon(addons.some(isEnabledVideoPlayerAddon));
      } catch {
        // Keep last known state on transient failure.
      }
    };

    void refresh();
    window.addEventListener(ACCOUNT_ADDONS_CHANGED, refresh);
    return () => {
      mounted = false;
      window.removeEventListener(ACCOUNT_ADDONS_CHANGED, refresh);
    };
  }, [isAuthenticated, initialValue]);

  return hasPlayerAddon;
}
