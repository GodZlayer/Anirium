const DEFAULT_SERVICE_PORT = 4004;
const DEFAULT_LOCAL_ENDPOINT = `http://127.0.0.1:${DEFAULT_SERVICE_PORT}`;
const LAN_ENDPOINT_STORAGE_KEY = "anirium_service_lan_endpoint";
const ANNOUNCE_THROTTLE_MS = 60_000;

export interface ResolvedServiceResult {
  endpoint: string;
  playbackIdentityVersion: number;
  lanUrl?: string;
  isLocal: boolean;
}

let activeServiceEndpoint: string = DEFAULT_LOCAL_ENDPOINT;
let lastAnnouncedLanUrl: string | null = null;
let lastAnnouncedAt = 0;

function isPrivateLanIPv4(host: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function getCsrfToken(): string {
  if (typeof document === "undefined") {
    return "";
  }
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute("content") || "";
}

function saveLanEndpoint(endpoint: string): void {
  try {
    localStorage.setItem(LAN_ENDPOINT_STORAGE_KEY, endpoint);
  } catch {
    // Ignore storage quota/privacy errors
  }
}

function loadSavedLanEndpoint(): string | null {
  try {
    const saved = localStorage.getItem(LAN_ENDPOINT_STORAGE_KEY);
    if (!saved) {
      return null;
    }
    const parsed = new URL(saved);
    if (parsed.protocol === "http:" && isPrivateLanIPv4(parsed.hostname)) {
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // Ignore invalid stored URLs
  }
  return null;
}

async function announceLanNode(lanUrl: string, serviceVersion?: string): Promise<void> {
  const now = Date.now();
  if (lastAnnouncedLanUrl === lanUrl && now - lastAnnouncedAt < ANNOUNCE_THROTTLE_MS) {
    return;
  }
  lastAnnouncedLanUrl = lanUrl;
  lastAnnouncedAt = now;

  try {
    const csrfToken = getCsrfToken();
    await fetch("/api/service/nodes", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(csrfToken ? { "X-CSRF-TOKEN": csrfToken } : {}),
      },
      body: JSON.stringify({ lanUrl, serviceVersion }),
    });
  } catch {
    // Best-effort announcement; never block local playback
  }
}

async function fetchRegisteredLanNodes(): Promise<string[]> {
  try {
    const res = await fetch("/api/service/nodes", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json().catch(() => ({}));
    if (!Array.isArray(data?.nodes)) {
      return [];
    }
    return data.nodes
      .map((node: { lanUrl?: unknown }) => (typeof node?.lanUrl === "string" ? node.lanUrl : ""))
      .filter((url: string) => url.startsWith("http://"));
  } catch {
    return [];
  }
}

async function probeEndpoint(endpoint: string, isLocal: boolean): Promise<ResolvedServiceResult | null> {
  try {
    const res = await fetch(`${endpoint}/health`, {
      mode: "cors",
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const isNativeService =
      data.isNative === true ||
      data.engine === "anirium-native-torrent" ||
      (data.status === "online" && data.service === "Anirium Player Pro Torrent Node");

    if (!isNativeService) {
      return null;
    }

    const lanUrl = typeof data.lanUrl === "string" && data.lanUrl.startsWith("http://") ? data.lanUrl : undefined;
    if (lanUrl) {
      void announceLanNode(lanUrl, typeof data.version === "string" ? data.version : undefined);
    }

    activeServiceEndpoint = endpoint;
    if (!isLocal) {
      saveLanEndpoint(endpoint);
    }

    return {
      endpoint,
      playbackIdentityVersion: data.playbackIdentityVersion === 1 ? 1 : 0,
      lanUrl,
      isLocal,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves an online Anirium+ Service endpoint with local-first priority:
 * 1. Local machine loopback (127.0.0.1 / localhost)
 * 2. Current page hostname if accessed via a private LAN IP (e.g. phone -> PC)
 * 3. Last known working LAN endpoint cached in localStorage
 * 4. Active LAN nodes registered by the user's other machines via /api/service/nodes
 */
export async function resolveServiceEndpoint(port: number = DEFAULT_SERVICE_PORT): Promise<ResolvedServiceResult | null> {
  // 1. Local machine first
  for (const host of ["127.0.0.1", "localhost"]) {
    const localResult = await probeEndpoint(`http://${host}:${port}`, true);
    if (localResult) {
      return localResult;
    }
  }

  // 2. Build deduplicated LAN candidate list
  const lanCandidates: string[] = [];
  const addCandidate = (url: string | null) => {
    if (!url || lanCandidates.includes(url)) {
      return;
    }
    lanCandidates.push(url);
  };

  if (typeof window !== "undefined") {
    const currentHost = window.location.hostname;
    if (!isLoopbackHost(currentHost) && isPrivateLanIPv4(currentHost)) {
      addCandidate(`http://${currentHost}:${port}`);
    }
  }

  addCandidate(loadSavedLanEndpoint());

  // Probe immediate LAN candidates before querying backend
  for (const candidate of lanCandidates) {
    const lanResult = await probeEndpoint(candidate, false);
    if (lanResult) {
      return lanResult;
    }
  }

  // 3. Query registered LAN nodes from Laravel backend (supports multiple PCs on the same network)
  const registeredNodes = await fetchRegisteredLanNodes();
  for (const nodeUrl of registeredNodes) {
    if (lanCandidates.includes(nodeUrl)) {
      continue;
    }
    const lanResult = await probeEndpoint(nodeUrl, false);
    if (lanResult) {
      return lanResult;
    }
  }

  return null;
}

export function getResolvedServiceEndpoint(): string {
  return activeServiceEndpoint;
}

export function getResolvedServiceWsUrl(): string {
  const endpoint = activeServiceEndpoint || DEFAULT_LOCAL_ENDPOINT;
  return `${endpoint.replace(/^http/i, "ws")}/ws`;
}
