/**
 * Micro-Módulo Puro (~60 linhas): Addon Dynamic Injector (TGCode Standard)
 * Injeta módulos externos de renderização (Player Pro, Players da Comunidade, Leitores de Mangá)
 * no DOM da Casca Branca através de um protocolo universal window.__ANIRIUM_REGISTER_RENDERER__
 */

import { AniriumAddonManifest, AniriumPlayerPlugin, AniriumPlayerProps } from "./addonTypes";
import { addonRegistry } from "./addonRegistry";

// Interface exposta globalmente para qualquer script externo se auto-registrar
declare global {
  interface Window {
    __ANIRIUM_REGISTER_RENDERER__?: (
      addonId: string,
      rendererComponent: React.ComponentType<AniriumPlayerProps>
    ) => void;
    __ANIRIUM_LOADED_SCRIPTS__?: Set<string>;
  }
}

// Inicializa a ponte global uma única vez
if (typeof window !== "undefined") {
  if (!window.__ANIRIUM_LOADED_SCRIPTS__) {
    window.__ANIRIUM_LOADED_SCRIPTS__ = new Set();
  }

  if (!window.__ANIRIUM_REGISTER_RENDERER__) {
    window.__ANIRIUM_REGISTER_RENDERER__ = (addonId, rendererComponent) => {
      const manifest = addonRegistry.getInstalledAddons().find((a) => a.id === addonId);
      if (manifest) {
        addonRegistry.registerPlayerPlugin({
          manifest,
          component: rendererComponent,
        });
        window.dispatchEvent(new CustomEvent("anirium_renderer_registered", { detail: { addonId } }));
      }
    };
  }
}

/**
 * Carrega e injeta dinamicamente o código do tocador externo (Player Pro ou Addon da Comunidade)
 */
export async function injectExternalRenderer(manifest: AniriumAddonManifest): Promise<boolean> {
  if (typeof window === "undefined" || !manifest.entryScriptUrl) return false;

  // Se já está registrado no registro interno, sucesso imediato
  if (addonRegistry.isPlayerPluginRegistered(manifest.id)) {
    return true;
  }

  // Se o script já foi injetado na página
  if (window.__ANIRIUM_LOADED_SCRIPTS__?.has(manifest.id)) {
    return true;
  }

  return new Promise((resolve) => {
    try {
      const script = document.createElement("script");
      script.id = `anirium-addon-${manifest.id}`;
      script.src = manifest.entryScriptUrl!;
      script.async = true;

      const onRegistered = (event: any) => {
        if (event.detail?.addonId === manifest.id) {
          window.removeEventListener("anirium_renderer_registered", onRegistered);
          resolve(true);
        }
      };
      window.addEventListener("anirium_renderer_registered", onRegistered);

      script.onload = () => {
        window.__ANIRIUM_LOADED_SCRIPTS__?.add(manifest.id);
        // Timeout de segurança se o script não emitir registro em 3s
        setTimeout(() => resolve(addonRegistry.isPlayerPluginRegistered(manifest.id)), 3000);
      };

      script.onerror = () => {
        console.warn(`[Addon Injector] Falha ao carregar script externo (${manifest.entryScriptUrl}).`);
        window.removeEventListener("anirium_renderer_registered", onRegistered);
        resolve(false);
      };

      document.head.appendChild(script);
    } catch {
      resolve(false);
    }
  });
}
