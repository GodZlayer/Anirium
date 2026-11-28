import { AniriumAddonManifest, AniriumPlayerPlugin, RenderMediaType } from "./addonTypes";

class AddonRegistry {
  private static instance: AddonRegistry;
  private manifests: Map<string, AniriumAddonManifest> = new Map();
  private playerPlugins: Map<string, AniriumPlayerPlugin> = new Map();
  private enabledAddons: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();

  private constructor() {
    // Core nasce limpo
  }

  public static getInstance(): AddonRegistry {
    if (!AddonRegistry.instance) {
      AddonRegistry.instance = new AddonRegistry();
    }
    return AddonRegistry.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[AddonRegistry] Erro ao notificar listener:", err);
      }
    }
  }

  public registerManifest(manifest: AniriumAddonManifest) {
    this.manifests.set(manifest.id, manifest);
    if (manifest.enabled) {
      this.enabledAddons.add(manifest.id);
    }
    this.notifyListeners();
  }

  public registerPlayerPlugin(plugin: AniriumPlayerPlugin) {
    this.playerPlugins.set(plugin.manifest.id, plugin);
    this.registerManifest(plugin.manifest);
    this.enabledAddons.add(plugin.manifest.id);
    this.notifyListeners();
  }

  public isPlayerPluginRegistered(pluginId: string): boolean {
    return this.playerPlugins.has(pluginId);
  }

  public unregisterPlayerPlugin(pluginId: string) {
    this.playerPlugins.delete(pluginId);
    this.manifests.delete(pluginId);
    this.enabledAddons.delete(pluginId);
    this.notifyListeners();
  }

  /**
   * Obtém o plugin renderizador ativo (video, manga ou audio) com base no Tier da conta:
   * - Tier 0: Não tem renderizador ativo.
   * - Tier 1: Addons comunitários da conta (se houver).
   * - Tier 2 e Tier 3: Addon oficial Anirium+ (player-pro / manga-reader-pro) ou comunitário se habilitado.
   */
  public getActiveRendererPlugin(mediaType: RenderMediaType = "video", tier: number = 0): AniriumPlayerPlugin | null {
    if (tier === 0) return null;

    const officialId = mediaType === "manga" ? "manga-reader-pro" : mediaType === "video" ? "player-pro" : null;

    if (tier >= 2 && officialId) {
      const officialPlugin = this.playerPlugins.get(officialId);
      if (officialPlugin && this.enabledAddons.has(officialId)) {
        return officialPlugin;
      }
    }

    for (const [id, plugin] of this.playerPlugins.entries()) {
      const pluginMedia = plugin.manifest.mediaType || "video";
      if (id !== officialId && pluginMedia === mediaType && this.enabledAddons.has(id)) {
        return plugin;
      }
    }

    return null;
  }

  public getActivePlayerPlugin(tier: number = 0): AniriumPlayerPlugin | null {
    return this.getActiveRendererPlugin("video", tier);
  }

  public enableAddon(addonId: string) {
    if (this.manifests.has(addonId)) {
      this.enabledAddons.add(addonId);
      this.notifyListeners();
    }
  }

  public disableAddon(addonId: string) {
    this.enabledAddons.delete(addonId);
    this.notifyListeners();
  }

  public getInstalledAddons(): AniriumAddonManifest[] {
    return Array.from(this.manifests.values());
  }

  public isAddonEnabled(addonId: string): boolean {
    return this.enabledAddons.has(addonId);
  }
}

export const addonRegistry = AddonRegistry.getInstance();
