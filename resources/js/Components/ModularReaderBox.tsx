import React, { useState, useEffect } from "react";
import { addonRegistry } from "../lib/addonRegistry";
import { injectExternalRenderer } from "../lib/addonPlayerLoader";
import { ACCOUNT_ADDONS_CHANGED, requestAccountAddons } from "../lib/accountAddonClient";
import type { AniriumAddonManifest, ResolvedMediaPayload } from "../lib/addonTypes";

interface ModularReaderBoxProps {
  title: string;
  chapterNumber?: number;
  resolvedPayload?: ResolvedMediaPayload;
  isAuthenticated?: boolean;
  tier?: number;
  onBack?: () => void;
}

function isMangaRendererAddon(addon: any): boolean {
  if (!addon?.enabled) return false;
  if (addon.category === "engine.renderer" && addon.mediaType === "manga") return true;
  const caps: string[] = Array.isArray(addon.capabilities) ? addon.capabilities : [];
  return caps.includes("ui.reader.render") || addon.id === "manga-reader-pro";
}

export function ModularReaderBox({
  title,
  chapterNumber = 1,
  resolvedPayload,
  isAuthenticated = false,
  tier = 0,
  onBack,
}: ModularReaderBoxProps) {
  const [activePlugin, setActivePlugin] = useState(() => addonRegistry.getActiveRendererPlugin("manga", tier));

  useEffect(() => {
    let mounted = true;
    let revision = 0;

    const syncMangaRendererAddons = async () => {
      if (!isAuthenticated) return;
      const current = ++revision;
      try {
        const data = await requestAccountAddons();
        if (!mounted || current !== revision) return;
        const addons: any[] = Array.isArray(data?.addons) ? data.addons : [];

        for (const addon of addons) {
          if (!isMangaRendererAddon(addon)) {
            if (addon?.id && addonRegistry.isAddonEnabled(addon.id) && (addon.mediaType === "manga" || addon.id === "manga-reader-pro")) {
              addonRegistry.disableAddon(addon.id);
            }
            continue;
          }

          const entryScriptUrl = addon.entryScriptUrl || addon.entry_script_url;
          const manifest: AniriumAddonManifest = {
            id: addon.id,
            name: addon.name || addon.id,
            version: addon.version || "1.0.0",
            description: addon.description || "",
            author: addon.author || "Comunidade",
            category: "engine.renderer",
            mediaType: "manga",
            type: addon.is_official ? "official-plus" : "community",
            origin: addon.is_official ? "official" : "community",
            capabilities: Array.isArray(addon.capabilities) ? addon.capabilities : ["ui.reader.render"],
            permissions: ["ui.reader.render"],
            entryScriptUrl,
            manifestUrl: addon.manifest_url,
            enabled: true,
          };

          addonRegistry.registerManifest(manifest);
          addonRegistry.enableAddon(manifest.id);

          if (entryScriptUrl && !addonRegistry.isPlayerPluginRegistered(manifest.id)) {
            void injectExternalRenderer(manifest);
          }
        }

        setActivePlugin(addonRegistry.getActiveRendererPlugin("manga", tier));
      } catch {
        if (mounted && current === revision) {
          setActivePlugin(addonRegistry.getActiveRendererPlugin("manga", tier));
        }
      }
    };

    if (isAuthenticated) void syncMangaRendererAddons();
    window.addEventListener(ACCOUNT_ADDONS_CHANGED, syncMangaRendererAddons);
    setActivePlugin(addonRegistry.getActiveRendererPlugin("manga", tier));

    const unsubscribe = addonRegistry.subscribe(() => {
      setActivePlugin(addonRegistry.getActiveRendererPlugin("manga", tier));
    });

    return () => {
      mounted = false;
      window.removeEventListener(ACCOUNT_ADDONS_CHANGED, syncMangaRendererAddons);
      unsubscribe();
    };
  }, [tier, isAuthenticated]);

  if (isAuthenticated && activePlugin && activePlugin.component) {
    const ReaderComponent = activePlugin.component;
    return (
      <div className="relative w-full min-h-[70vh] rounded-2xl overflow-hidden border border-[color:var(--wc-borderDefault)]/10 bg-[color:var(--wc-bgBase)] shadow-2xl">
        <ReaderComponent
          anime={{ title }}
          resolvedPayload={resolvedPayload}
          initialEpisode={chapterNumber}
          initialSeasonIdx={0}
          onBack={() => onBack?.()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 w-full min-h-[320px] rounded-2xl border border-[color:var(--wc-borderDefault)]/15 bg-[color:var(--wc-bgBase)] p-8 text-center">
      <p className="text-sm font-medium text-[color:var(--wc-textPrimary)]">
        Nenhum addon de leitura de mangá habilitado
      </p>
      <p className="text-xs text-[color:var(--wc-textSecondary)] max-w-md">
        Instale ou habilite um addon externo de leitura (<code className="font-mono">ui.reader.render</code>) nas configurações da sua conta para ler {title}.
      </p>
    </div>
  );
}
