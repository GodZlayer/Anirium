import { AniriumAddonManifest, AniriumPlayerPlugin } from './types';

class AddonRegistry {
  private static instance: AddonRegistry;
  private manifests: Map<string, AniriumAddonManifest> = new Map();
  private playerPlugins: Map<string, AniriumPlayerPlugin> = new Map();
  private enabledAddons: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();

  private constructor() {
    // O Core nasce 100% puro e sem nenhum componente de player embutido.
    // Os componentes de front-end dos plugins são carregados sob demanda
    // quando a conta do usuário é carregada com o respectivo plugin ativo.
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
        console.error("[AddonRegistry] Erro ao notificar listener:");
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

  public getActivePlayerPlugin(): AniriumPlayerPlugin | null {
    // 1. Plugins comunitários alternativos de reprodução habilitados na conta do usuário
    for (const [id, plugin] of this.playerPlugins.entries()) {
      if (id !== "player-pro" && this.enabledAddons.has(id)) {
        return plugin;
      }
    }

    // 2. Player Pro do Anirium+ (se registrado dinamicamente e ativo na conta)
    const officialPro = this.playerPlugins.get("player-pro");
    if (officialPro && this.enabledAddons.has("player-pro")) {
      return officialPro;
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

  public enableAllAddons() {
    for (const id of Array.from(this.manifests.keys())) {
      this.enabledAddons.add(id);
    }
    this.notifyListeners();
  }

  public disableAllAddons() {
    this.enabledAddons.clear();
    this.notifyListeners();
  }

  public syncUserAddons(enabledIds: string[]) {
    this.enabledAddons.clear();
    for (const id of enabledIds) {
      if (this.manifests.has(id)) {
        this.enabledAddons.add(id);
      }
    }
    this.notifyListeners();
  }

  public registerExternalManifest(manifest: AniriumAddonManifest) {
    this.registerManifest(manifest);
  }

  public isAddonEnabled(addonId: string): boolean {
    return this.enabledAddons.has(addonId);
  }

  public getInstalledAddons(): AniriumAddonManifest[] {
    return Array.from(this.manifests.values()).map(m => ({
      ...m,
      enabled: this.enabledAddons.has(m.id)
    }));
  }

  public getActiveTheme(): AniriumAddonManifest | null {
    // Tema canônico padrão exclusivo: todos os temas extras desativados
    return null;
  }

  public getAddonsByCapability(capability: string): AniriumAddonManifest[] {
    return Array.from(this.manifests.values())
      .filter(m => this.enabledAddons.has(m.id) && m.capabilities.includes(capability as any));
  }

  public getAddonsByUiEdit(uiEdit: string): AniriumAddonManifest[] {
    return Array.from(this.manifests.values())
      .filter(m => this.enabledAddons.has(m.id) && (m.uiEdits || []).includes(uiEdit));
  }

  public getAddonsByDisplay(display: string): AniriumAddonManifest[] {
    return Array.from(this.manifests.values())
      .filter(m => this.enabledAddons.has(m.id) && (m.display || []).includes(display));
  }
}

export const addonRegistry = AddonRegistry.getInstance();
