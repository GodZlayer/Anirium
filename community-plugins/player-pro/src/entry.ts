import PlayerProComponent from "./PlayerProComponent";

declare global {
  interface Window {
    __ANIRIUM_REGISTER_RENDERER__?: (addonId: string, component: any) => void;
  }
}

if (typeof window !== "undefined" && typeof window.__ANIRIUM_REGISTER_RENDERER__ === "function") {
  window.__ANIRIUM_REGISTER_RENDERER__("player-pro", PlayerProComponent);
}

export default PlayerProComponent;
