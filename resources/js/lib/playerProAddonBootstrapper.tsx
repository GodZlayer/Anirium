import React, { lazy, Suspense } from "react";
import { addonRegistry } from "./addonRegistry";
import { AniriumAddonManifest } from "./addonTypes";

const LazyPlayerPro = lazy(() => import("../addons/player-pro/PlayerProComponent"));

/**
 * Manifesto do Addon Privado Pago (Anirium Player Pro)
 * Categoria: "engine.renderer"
 * Tipo: "private-addon"
 * Mídia: "video"
 */
export const PLAYER_PRO_MANIFEST: AniriumAddonManifest = {
  id: "player-pro",
  name: "Anirium Player Pro",
  version: "1.0.0",
  description: "Tocador privado de alta qualidade funcional: motor HLS avançado, sincronização multi-áudio/legendas e buffer preditivo integrado com o daemon de máquina local.",
  author: "Anirium Technologies & TGCode",
  category: "engine.renderer",
  mediaType: "video",
  type: "private-addon",
  origin: "official",
  capabilities: [
    "ui.player.render",
    "ui.player.overlay",
    "playback.client",
    "subtitles.manage",
    "audio.manage",
  ],
  permissions: [
    "ui.player.render",
    "playback.client",
  ],
  serviceUrl: "http://127.0.0.1:4004",
  enabled: true,
};

/**
 * Registra o Player Pro se o usuário possuir a licença do Addon Privado (Tier 2/3).
 * A injeção no slot ocorre com o mesmo contrato de qualquer tocador comunitário.
 */
export function initializeOfficialPlusPlayerAddon(tier: number = 0, enabled = true) {
  if (tier >= 2 && enabled) {
    if (!addonRegistry.isPlayerPluginRegistered("player-pro")) {
      const PlayerProWrapper: React.FC<any> = (props) => (
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center bg-[color:var(--wc-bgBase)]/90 text-[#FFC766] font-mono text-xs">
              Iniciando motor do Player Pro...
            </div>
          }
        >
          <LazyPlayerPro {...props} />
        </Suspense>
      );

      addonRegistry.registerPlayerPlugin({
        manifest: PLAYER_PRO_MANIFEST,
        component: PlayerProWrapper,
      });
    } else {
      addonRegistry.enableAddon("player-pro");
    }
  } else {
    // Se a conta não possui a licença, o player privado não ocupa o slot
    if (addonRegistry.isPlayerPluginRegistered("player-pro")) {
      addonRegistry.disableAddon("player-pro");
    }
  }
}
