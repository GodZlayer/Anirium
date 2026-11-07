import { AniriumAddonManifest, AniriumPlayerPlugin } from "./addonTypes";

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
   * Obtém o plugin de player ativo com base no Tier da conta:
   * - Tier 0: Não tem player addon ativo.
   * - Tier 1: Addons de player comunitários da conta (se houver).
   * - Tier 2 e Tier 3: Addon oficial Anirium+ (Player Pro) ou comunitário se habilitado.
   */
  public getActivePlayerPlugin(tier: number = 0): AniriumPlayerPlugin | null {
    if (tier === 0) return null;

    // Se a conta for Tier 2 (Anirium+) ou Tier 3 (Admin), ela tem autorização para o Player Pro oficial
    if (tier >= 2) {
      const officialPro = this.playerPlugins.get("player-pro");
      if (officialPro && this.enabledAddons.has("player-pro")) {
        return officialPro;
      }
    }

    // Plugins comunitários de reprodução instalados pela conta
    for (const [id, plugin] of this.playerPlugins.entries()) {
      if (id !== "player-pro" && this.enabledAddons.has(id)) {
        return plugin;
      }
    }

    return null;
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
