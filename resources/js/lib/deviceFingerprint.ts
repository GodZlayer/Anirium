/**
 * Micro-Módulo Puro (~40 linhas): Device Fingerprint Engine (TGCode Standard)
 * Gera um hash determinístico e anônimo da máquina/hardware sem bibliotecas externas pesadas.
 */

const STORAGE_KEY = "anirium_machine_fingerprint";

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export function getOrCreateMachineFingerprint(): string {
  if (typeof window === "undefined") return "server-machine";

  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && cached.length >= 16) return cached;

    // Componentes determinísticos de hardware do navegador
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const navInfo = `${navigator.hardwareConcurrency || 4}-${navigator.language}-${navigator.platform || ""}`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    // Extração leve de WebGL Renderer sem sobrecarga
    let webglInfo = "gl-generic";
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        const dbg = (gl as any).getExtension("WEBGL_debug_renderer_info");
        if (dbg) {
          webglInfo = (gl as any).getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "gl-vendor";
        }
      }
    } catch {}

    const seed = `${screenInfo}|${navInfo}|${tz}|${webglInfo}`;
    const h1 = simpleHash(seed);
    const h2 = simpleHash(seed.split("").reverse().join(""));
    const h3 = simpleHash(`${h1}-${h2}-${Date.now().toString(36)}`);
    const fingerprint = `mfp_${h1}${h2}${h3}`.slice(0, 32);

    localStorage.setItem(STORAGE_KEY, fingerprint);
    return fingerprint;
  } catch {
    return "mfp_fallback_device_1";
  }
}
