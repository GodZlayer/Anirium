export interface StremioConfigField {
  key: string;
  type: "text" | "password" | "number" | "checkbox" | "select" | string;
  title?: string;
  default?: string;
  options?: string[];
  required?: boolean;
}

export type AddonInspectionStatus =
  | "ready"
  | "configuration_required"
  | "unsupported"
  | "offline"
  | "invalid_manifest"
  | "invalid_ref";

export type AddonConfigMode = "none" | "native" | "page";

export interface AddonInspectionResult {
  inputUrl: string;
  manifestUrl: string;
  configureUrl?: string;
  status: AddonInspectionStatus;
  httpStatus?: number;
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  logo?: string;
  resources?: string[];
  types?: string[];
  supportsStreams: boolean;
  supportsSubtitles: boolean;
  configurable: boolean;
  configurationRequired: boolean;
  configFields?: StremioConfigField[];
  configMode: AddonConfigMode;
  existingConfigValues?: Record<string, string>;
  error?: string;
}

export interface AddonDirectoryItem {
  manifestUrl: string;
  configureUrl?: string;
  id: string;
  name: string;
  version?: string;
  description?: string;
  logo?: string;
  resources?: string[];
  types?: string[];
  supportsStreams: boolean;
  supportsSubtitles: boolean;
  configurable: boolean;
  configurationRequired: boolean;
  configFields?: StremioConfigField[];
  configMode: AddonConfigMode;
  directories: string[];
}

export interface AddonDirectorySourceStatus {
  name: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface AddonDirectorySearchResponse {
  items: AddonDirectoryItem[];
  sources: AddonDirectorySourceStatus[];
}

export interface AddonConfigSession {
  sessionId: string;
  token: string;
  proxyOrigin: string;
  frameUrl: string;
  configureUrl: string;
}

export interface AddonConfigCapturedPayload {
  sessionId: string;
  manifestUrl: string;
}

const SERVICE_WS_URL = "ws://127.0.0.1:4004/ws";

interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timer: number;
  expectedEvent: string;
}

type CaptureListener = (payload: AddonConfigCapturedPayload) => void;

class AddonServiceWSClient {
  private ws: WebSocket | null = null;
  private connectPromise: Promise<WebSocket> | null = null;
  private pending = new Map<string, PendingRequest<any>>();
  private captureListeners = new Set<CaptureListener>();
  private reqCounter = 0;

  private nextRequestId(): string {
    this.reqCounter += 1;
    return `addon-ws-${Date.now()}-${this.reqCounter}`;
  }

  private rejectAllPending(message: string) {
    for (const [id, entry] of this.pending.entries()) {
      window.clearTimeout(entry.timer);
      entry.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  private ensureSocket(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<WebSocket>((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(SERVICE_WS_URL);
      } catch {
        this.connectPromise = null;
        reject(new Error("service_offline"));
        return;
      }

      const openTimeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.connectPromise = null;
          try {
            socket.close();
          } catch {
            // noop
          }
          reject(new Error("service_offline"));
        }
      }, 2500);

      socket.onopen = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(openTimeout);
          this.ws = socket;
          this.connectPromise = null;
          resolve(socket);
        }
      };

      socket.onmessage = (event) => {
        let msg: { event?: string; payload?: any };
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const ev = msg?.event;
        const payload = msg?.payload ?? {};

        if (ev === "addon_config_captured" && payload?.sessionId && payload?.manifestUrl) {
          for (const listener of this.captureListeners) {
            listener({
              sessionId: String(payload.sessionId),
              manifestUrl: String(payload.manifestUrl),
            });
          }
          return;
        }

        const requestId = typeof payload?.requestId === "string" ? payload.requestId : "";
        if (!requestId) return;
        const entry = this.pending.get(requestId);
        if (!entry || entry.expectedEvent !== ev) return;
        window.clearTimeout(entry.timer);
        this.pending.delete(requestId);
        entry.resolve(payload);
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(openTimeout);
          this.connectPromise = null;
          reject(new Error("service_offline"));
        }
      };

      socket.onclose = () => {
        if (this.ws === socket) {
          this.ws = null;
        }
        this.connectPromise = null;
        this.rejectAllPending("service_disconnected");
      };
    });

    return this.connectPromise;
  }

  private async request<T>(
    action: string,
    expectedEvent: string,
    body: Record<string, unknown>,
    timeoutMs = 10000
  ): Promise<T> {
    const socket = await this.ensureSocket();
    const requestId = this.nextRequestId();
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("service_timeout"));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        expectedEvent,
      });

      try {
        socket.send(JSON.stringify({ action, requestId, ...body }));
      } catch {
        window.clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error("service_send_failed"));
      }
    });
  }

  async inspectAddon(manifestUrl: string): Promise<AddonInspectionResult> {
    const res = await this.request<{ result: AddonInspectionResult }>(
      "inspect_addon",
      "addon_inspect_result",
      { manifestUrl },
      10000
    );
    return res.result;
  }

  async inspectAddons(manifestUrls: string[]): Promise<AddonInspectionResult[]> {
    const cleaned = manifestUrls.map((u) => u.trim()).filter(Boolean);
    if (cleaned.length === 0) return [];
    const res = await this.request<{ results?: AddonInspectionResult[] }>(
      "inspect_addons",
      "addons_inspect_result",
      { manifestUrls: cleaned },
      22000
    );
    return Array.isArray(res.results) ? res.results : [];
  }

  async searchDirectories(params: {
    query?: string;
    category?: string;
    limit?: number;
  }): Promise<AddonDirectorySearchResponse> {
    const res = await this.request<{
      items?: AddonDirectoryItem[];
      sources?: AddonDirectorySourceStatus[];
    }>(
      "search_addon_directories",
      "addon_directory_results",
      {
        query: params.query ?? "",
        category: params.category ?? "",
        limit: params.limit ?? 40,
      },
      12000
    );
    return {
      items: Array.isArray(res.items) ? res.items : [],
      sources: Array.isArray(res.sources) ? res.sources : [],
    };
  }

  async startConfigSession(manifestUrl: string): Promise<AddonConfigSession> {
    const res = await this.request<{
      sessionId?: string;
      token?: string;
      proxyOrigin?: string;
      frameUrl?: string;
      configureUrl?: string;
      error?: string;
    }>(
      "start_addon_config_session",
      "addon_config_session",
      { manifestUrl },
      8000
    );
    if (res.error || !res.sessionId || !res.frameUrl || !res.proxyOrigin || !res.token) {
      throw new Error(res.error || "Não foi possível iniciar o configurador do add-on.");
    }
    return {
      sessionId: res.sessionId,
      token: res.token,
      proxyOrigin: res.proxyOrigin,
      frameUrl: res.frameUrl,
      configureUrl: res.configureUrl || manifestUrl,
    };
  }

  async closeConfigSession(sessionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      await this.request(
        "close_addon_config_session",
        "addon_config_session_closed",
        { sessionId },
        3000
      );
    } catch {
      // Sessão já encerrada ou service offline
    }
  }

  onConfigCaptured(cb: CaptureListener): () => void {
    this.captureListeners.add(cb);
    return () => {
      this.captureListeners.delete(cb);
    };
  }
}

const client = new AddonServiceWSClient();

export function inspectAddon(manifestUrl: string): Promise<AddonInspectionResult> {
  return client.inspectAddon(manifestUrl);
}

export function inspectAddons(manifestUrls: string[]): Promise<AddonInspectionResult[]> {
  return client.inspectAddons(manifestUrls);
}

export function searchAddonDirectories(params: {
  query?: string;
  category?: string;
  limit?: number;
}): Promise<AddonDirectorySearchResponse> {
  return client.searchDirectories(params);
}

export function startAddonConfigSession(manifestUrl: string): Promise<AddonConfigSession> {
  return client.startConfigSession(manifestUrl);
}

export function closeAddonConfigSession(sessionId: string): Promise<void> {
  return client.closeConfigSession(sessionId);
}

export function onAddonConfigCaptured(cb: CaptureListener): () => void {
  return client.onConfigCaptured(cb);
}
