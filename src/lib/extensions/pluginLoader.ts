import { addonRegistry } from "./addonRegistry";
import { AniriumAddonManifest } from "./types";
import playerProManifest from "@/addons/player-pro/manifest.json";

let accountLoadRevision = 0;

/**
 * Carregador Dinâmico de Componentes de Frontend dos Plugins
 *
 * Filosofia Canônica:
 * Os arquivos TSX dos componentes de interface pertencem aos plugins, não ao Core.
 * O Core apenas invoca este carregador ao autenticar/carregar os dados da conta do usuário.
 * Se a conta possui o plugin ativo, o componente do plugin é importado dinamicamente
 * e registrado no slot do Host. Caso contrário, nenhum código do plugin é carregado.
 */
export async function loadAccountPlugins(enabledAddonIds: string[] = [], userLevel: number = 0) {
  const revision = ++accountLoadRevision;
  const hasPlayerPro = userLevel >= 2 && enabledAddonIds.includes("player-pro");

  if (hasPlayerPro) {
    if (!addonRegistry.isPlayerPluginRegistered("player-pro")) {
      try {
        // Importação dinâmica do componente TSX do plugin Player Pro
        const module = await import("@/addons/player-pro/PlayerProComponent");
        if (revision !== accountLoadRevision) return;
        addonRegistry.registerPlayerPlugin({
          manifest: playerProManifest as AniriumAddonManifest,
          component: module.default,
        });
      } catch (err) {
        if (revision !== accountLoadRevision) return;
        console.error("[PluginLoader] Falha ao carregar componente dinâmico do Player Pro:");
      }
    }
    addonRegistry.enableAddon("player-pro");
  } else {
    // Conta padrão / sem plugin: remove o plugin do registro
    addonRegistry.unregisterPlayerPlugin("player-pro");
  }

  // Sincroniza os demais addons da conta no registry
  if (revision !== accountLoadRevision) return;
  addonRegistry.syncUserAddons(enabledAddonIds);

  if (hasPlayerPro) {
    addonRegistry.enableAddon("player-pro");
  }
}
