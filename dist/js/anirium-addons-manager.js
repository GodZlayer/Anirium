(function () {
  "use strict";

  const SERVICE_WS_URL = "ws://127.0.0.1:4004/ws";
  const CATEGORIES = [
    { id: "", label: "Todos" },
    { id: "subtitles", label: "Legendas" },
    { id: "anime", label: "Anime" },
    { id: "torrents", label: "Torrents & Streams" },
  ];

  const inspectionsByUrl = Object.create(null);
  let inspectingNow = false;
  let lastInspectedSignature = "";

  const wsState = {
    socket: null,
    connectPromise: null,
    reqCounter: 0,
    pending: new Map(),
    captureListeners: new Set(),
  };

  const modalState = {
    isOpen: false,
    step: "browse", // "browse" | "native-config" | "page-config"
    browseTab: "explore", // "explore" | "paste"
    query: "",
    category: "",
    isSearching: false,
    directoryItems: [],
    directorySources: [],
    serviceOffline: false,
    pasteInput: "",
    showJsonPaste: false,
    busyUrl: "",
    isSubmitting: false,
    error: "",
    unsupportedCandidate: null,
    activeTarget: null,
    replaceAddonId: "",
    nativeValues: Object.create(null),
    revealedPasswords: Object.create(null),
    session: null,
    isStartingSession: false,
    validatingCapture: false,
    captureLocked: false,
    showManualFallback: false,
    manualUrl: "",
    searchDebounceTimer: 0,
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeHttpUrl(raw) {
    if (!raw || typeof raw !== "string") return "";
    const trimmed = raw.trim();
    if (/^https:\/\//i.test(trimmed) || /^http:\/\/(?:127\.0\.0\.1|localhost):/i.test(trimmed)) {
      return trimmed;
    }
    return "";
  }

  function safeHttpsLogo(raw) {
    if (!raw || typeof raw !== "string") return "";
    const trimmed = raw.trim();
    return /^https:\/\//i.test(trimmed) ? trimmed : "";
  }

  function canonicalComparableUrl(raw) {
    return String(raw || "")
      .trim()
      .replace(/^stremio:\/\//i, "https://")
      .replace(/:(443|80)(?=\/|$)/, "")
      .toLowerCase();
  }

  function hostFromUrl(raw) {
    if (!raw) return "";
    try {
      return new URL(raw).hostname;
    } catch {
      return String(raw).replace(/^https?:\/\//i, "").split("/")[0] || "";
    }
  }

  function getCsrfToken() {
    const panel = document.getElementById("profile-panel-addons");
    const attr = panel ? panel.getAttribute("data-csrf") : "";
    if (attr) return attr;
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") || "" : "";
  }

  function rejectAllPending(reason) {
    for (const [id, entry] of wsState.pending.entries()) {
      window.clearTimeout(entry.timer);
      entry.reject(new Error(reason));
      wsState.pending.delete(id);
    }
  }

  function ensureServiceSocket() {
    if (wsState.socket && wsState.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve(wsState.socket);
    }
    if (wsState.connectPromise) {
      return wsState.connectPromise;
    }

    wsState.connectPromise = new Promise((resolve, reject) => {
      let settled = false;
      let sock;
      try {
        sock = new WebSocket(SERVICE_WS_URL);
      } catch {
        wsState.connectPromise = null;
        reject(new Error("service_offline"));
        return;
      }

      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          wsState.connectPromise = null;
          try {
            sock.close();
          } catch {
            // noop
          }
          reject(new Error("service_offline"));
        }
      }, 2800);

      sock.onopen = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          wsState.socket = sock;
          wsState.connectPromise = null;
          if (typeof window.updateServiceHealthStatus === "function") {
            window.updateServiceHealthStatus(true);
          }
          resolve(sock);
        }
      };

      sock.onmessage = (evt) => {
        let msg;
        try {
          msg = JSON.parse(String(evt.data));
        } catch {
          return;
        }
        const ev = msg && msg.event;
        const payload = (msg && msg.payload) || {};

        if (ev === "addon_config_captured" && payload.sessionId && payload.manifestUrl) {
          for (const listener of wsState.captureListeners) {
            listener({
              sessionId: String(payload.sessionId),
              manifestUrl: String(payload.manifestUrl),
            });
          }
          return;
        }

        const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
        if (!requestId) return;
        const entry = wsState.pending.get(requestId);
        if (!entry || entry.expectedEvent !== ev) return;
        window.clearTimeout(entry.timer);
        wsState.pending.delete(requestId);
        entry.resolve(payload);
      };

      sock.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          wsState.connectPromise = null;
          reject(new Error("service_offline"));
        }
      };

      sock.onclose = () => {
        if (wsState.socket === sock) {
          wsState.socket = null;
        }
        wsState.connectPromise = null;
        rejectAllPending("service_disconnected");
      };
    });

    return wsState.connectPromise;
  }

  async function wsRequest(action, expectedEvent, body, timeoutMs) {
    const sock = await ensureServiceSocket();
    wsState.reqCounter += 1;
    const requestId = `anirium-blade-ws-${Date.now()}-${wsState.reqCounter}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        wsState.pending.delete(requestId);
        reject(new Error("service_timeout"));
      }, timeoutMs);

      wsState.pending.set(requestId, {
        resolve,
        reject,
        timer,
        expectedEvent,
      });

      try {
        sock.send(JSON.stringify(Object.assign({ action, requestId }, body || {})));
      } catch {
        window.clearTimeout(timer);
        wsState.pending.delete(requestId);
        reject(new Error("service_send_failed"));
      }
    });
  }

  async function inspectAddon(manifestUrl) {
    const res = await wsRequest("inspect_addon", "addon_inspect_result", { manifestUrl }, 10000);
    return res.result;
  }

  async function inspectAddons(manifestUrls) {
    const cleaned = manifestUrls.map((u) => String(u || "").trim()).filter(Boolean);
    if (cleaned.length === 0) return [];
    const res = await wsRequest("inspect_addons", "addons_inspect_result", { manifestUrls: cleaned }, 22000);
    return Array.isArray(res.results) ? res.results : [];
  }

  async function searchAddonDirectories(params) {
    const res = await wsRequest(
      "search_addon_directories",
      "addon_directory_results",
      {
        query: params.query || "",
        category: params.category || "",
        limit: params.limit || 40,
      },
      12000
    );
    return {
      items: Array.isArray(res.items) ? res.items : [],
      sources: Array.isArray(res.sources) ? res.sources : [],
    };
  }

  async function startAddonConfigSession(manifestUrl) {
    const res = await wsRequest("start_addon_config_session", "addon_config_session", { manifestUrl }, 8000);
    if (res.error || !res.sessionId || !res.frameUrl || !res.proxyOrigin || !res.token) {
      throw new Error(res.error || "Não foi possível abrir o configurador do add-on.");
    }
    return {
      sessionId: res.sessionId,
      token: res.token,
      proxyOrigin: res.proxyOrigin,
      frameUrl: res.frameUrl,
      configureUrl: res.configureUrl || manifestUrl,
    };
  }

  async function closeAddonConfigSession(sessionId) {
    if (!sessionId) return;
    try {
      await wsRequest("close_addon_config_session", "addon_config_session_closed", { sessionId }, 3000);
    } catch {
      // noop
    }
  }

  function updateInspectStatusBadge(text, visible) {
    const el = document.getElementById("profile-addons-inspect-status");
    if (!el) return;
    if (visible && text) {
      el.textContent = text;
      el.classList.remove("hidden");
    } else {
      el.textContent = "";
      el.classList.add("hidden");
    }
  }

  function getAddonDisplayName(addon, inspection) {
    if (inspection && inspection.name) return inspection.name;
    if (addon.name && !String(addon.name).startsWith("remote-")) return addon.name;
    const url = String(addon.manifest_url || "").toLowerCase();
    if (url.includes("torrentio")) return "Torrentio";
    if (url.includes("netflix")) return "Netflix Catalog";
    if (url.includes("thepiratebay")) return "ThePirateBay+";
    if (url.includes("brazuca")) return "Brazuca Torrents";
    if (url.includes("animesub")) return "AnimeSub+";
    if (url.includes("opensubtitles")) return "OpenSubtitles v3 PRO";
    if (url.includes("subdl")) return "SubDL Subtitles";
    if (url.includes("subsource")) return "SubSource Subtitles";
    if (url.includes("stremio-br-anime")) return "Nyaa Anime BR";
    if (url.includes("aniscraper") || url.includes("nyaa")) return "AniScraper (Nyaa)";
    const host = hostFromUrl(addon.manifest_url);
    return host || addon.id || "Addon Comunitário";
  }

  function renderStatusBadgeHtml(status) {
    switch (status) {
      case "ready":
        return '<span style="background:rgba(16,185,129,0.16);color:#6ee7b7;border:1px solid rgba(16,185,129,0.35);padding:1px 6px;border-radius:6px;font-size:9px;font-family:monospace;font-weight:700;">Pronto</span>';
      case "configuration_required":
        return '<span style="background:rgba(255,199,102,0.2);color:#ffc766;border:1px solid rgba(255,199,102,0.45);padding:1px 6px;border-radius:6px;font-size:9px;font-family:monospace;font-weight:700;">Configuração pendente</span>';
      case "offline":
        return '<span style="background:rgba(239,68,68,0.16);color:#fca5a5;border:1px solid rgba(239,68,68,0.35);padding:1px 6px;border-radius:6px;font-size:9px;font-family:monospace;font-weight:700;">Offline</span>';
      case "unsupported":
        return '<span style="background:rgba(255,255,255,0.08);color:#a1a1aa;border:1px solid rgba(255,255,255,0.16);padding:1px 6px;border-radius:6px;font-size:9px;font-family:monospace;font-weight:700;">Somente catálogo</span>';
      case "invalid_manifest":
      case "invalid_ref":
        return '<span style="background:rgba(239,68,68,0.16);color:#fca5a5;border:1px solid rgba(239,68,68,0.35);padding:1px 6px;border-radius:6px;font-size:9px;font-family:monospace;font-weight:700;">Manifesto inválido</span>';
      default:
        return "";
    }
  }

  function renderAddonsListEnriched() {
    const container = document.getElementById("profile-addons-list");
    if (!container) return;

    const list = Array.isArray(window.userAddonsList) ? window.userAddonsList : [];
    if (list.length === 0) {
      const emptyMsg = window.i18n ? window.i18n.t("profile.no_addons") : "Nenhum add-on comunitário instalado.";
      container.innerHTML = `<div class="p-4 text-center text-xs font-mono text-theme-muted" data-i18n="profile.no_addons">${escapeHtml(emptyMsg)}</div>`;
      return;
    }

    container.innerHTML = list
      .map((addon) => {
        const url = addon.manifest_url || "";
        const inspection = url ? inspectionsByUrl[url] || inspectionsByUrl[canonicalComparableUrl(url)] : null;
        const name = getAddonDisplayName(addon, inspection);
        const version = (inspection && inspection.version) || (addon.version && addon.version !== "1.0.0" ? addon.version : "");
        const needsConfig = !!(inspection && inspection.status === "configuration_required");
        const canConfigure = !!url && (needsConfig || !!(inspection && inspection.configurable));
        const logoUrl = safeHttpsLogo(inspection && inspection.logo);
        const subText = (inspection && inspection.description) || hostFromUrl(url) || addon.description || "Stremio Community Addon";

        const borderStyle = needsConfig
          ? "border:1px solid rgba(255,199,102,0.5);"
          : "";

        const logoHtml = logoUrl
          ? `<div style="position:relative;width:36px;height:36px;flex-shrink:0;">
               <img src="${escapeHtml(logoUrl)}" alt="" style="width:36px;height:36px;border-radius:10px;object-fit:cover;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <span style="display:none;width:36px;height:36px;border-radius:10px;align-items:center;justify-content:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:16px;">🧩</span>
             </div>`
          : `<div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);font-size:16px;flex-shrink:0;">🧩</div>`;

        const streamPill = inspection && inspection.supportsStreams
          ? '<span style="background:rgba(56,189,248,0.15);color:#7dd3fc;border:1px solid rgba(56,189,248,0.3);padding:1px 6px;border-radius:6px;font-size:9px;font-family:monospace;">Streams</span>'
          : "";
        const subPill = inspection && inspection.supportsSubtitles
          ? '<span style="background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.3);padding:1px 6px;border-radius:6px;font-size:9px;font-family:monospace;">Legendas</span>'
          : "";

        let configBtnHtml = "";
        if (canConfigure) {
          if (needsConfig) {
            configBtnHtml = `<button type="button" data-action="configure-addon" data-addon-id="${escapeHtml(addon.id)}" style="background:#ffc766;color:#0b0b0f;border:none;padding:6px 11px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;" title="Finalizar configuração do add-on">Configurar add-on</button>`;
          } else {
            configBtnHtml = `<button type="button" data-action="configure-addon" data-addon-id="${escapeHtml(addon.id)}" style="background:rgba(255,255,255,0.07);color:#d4d4d8;border:1px solid rgba(255,255,255,0.14);padding:5px 10px;border-radius:10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;" title="Reconfigurar add-on">Reconfigurar</button>`;
          }
        }

        return `
          <div class="p-3.5 rounded-2xl bg-theme-raised border border-theme-default flex items-center justify-between gap-3" style="${borderStyle}">
            <div class="flex items-center gap-3 min-w-0">
              ${logoHtml}
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h5 class="text-xs font-bold text-theme-primary truncate">${escapeHtml(name)}</h5>
                  ${version ? `<span style="font-size:9px;font-family:monospace;color:#a1a1aa;">v${escapeHtml(version)}</span>` : ""}
                  ${inspection ? renderStatusBadgeHtml(inspection.status) : ""}
                  ${streamPill}
                  ${subPill}
                </div>
                <p class="text-[10px] font-mono text-theme-muted truncate mt-0.5">${escapeHtml(subText)}</p>
              </div>
            </div>
            <div class="flex items-center gap-2.5 shrink-0">
              ${configBtnHtml}
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" data-action="toggle-addon" data-addon-id="${escapeHtml(addon.id)}" ${addon.enabled ? "checked" : ""} class="sr-only peer">
                <div class="w-8 h-4 bg-theme-pill border border-theme-default peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-theme-accent"></div>
              </label>
              <button type="button" data-action="uninstall-addon" data-addon-id="${escapeHtml(addon.id)}" class="text-theme-muted hover:text-red-400 p-1 transition-colors cursor-pointer" title="Desinstalar">✕</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function inspectInstalledAccountAddons(addons, force) {
    const list = Array.isArray(addons) ? addons : Array.isArray(window.userAddonsList) ? window.userAddonsList : [];
    const urls = list.map((a) => String((a && a.manifest_url) || "").trim()).filter(Boolean);
    if (urls.length === 0) {
      updateInspectStatusBadge("", false);
      renderAddonsListEnriched();
      return;
    }

    const signature = urls.slice().sort().join("|");
    if (inspectingNow) return;
    if (!force && signature === lastInspectedSignature && Object.keys(inspectionsByUrl).length > 0) {
      renderAddonsListEnriched();
      return;
    }

    inspectingNow = true;
    updateInspectStatusBadge("Verificando status...", true);
    try {
      const results = await inspectAddons(urls);
      for (const res of results) {
        if (!res) continue;
        if (res.inputUrl) {
          inspectionsByUrl[res.inputUrl] = res;
          inspectionsByUrl[canonicalComparableUrl(res.inputUrl)] = res;
        }
        if (res.manifestUrl) {
          inspectionsByUrl[res.manifestUrl] = res;
          inspectionsByUrl[canonicalComparableUrl(res.manifestUrl)] = res;
        }
      }
      lastInspectedSignature = signature;
      updateInspectStatusBadge("", false);
      renderAddonsListEnriched();
    } catch {
      updateInspectStatusBadge("Service 4004 offline", true);
    } finally {
      inspectingNow = false;
    }
  }

  async function saveAddonManifestUrl(manifestUrl, replaceAddonId) {
    const csrf = getCsrfToken();
    const payload = { manifest_url: manifestUrl };
    if (replaceAddonId) {
      payload.replace_addon_id = replaceAddonId;
    }
    const res = await fetch("/api/addons/install", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-TOKEN": csrf,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || data.success !== true) {
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    if (typeof window.loadAccountAddons === "function") {
      await window.loadAccountAddons();
      await inspectInstalledAccountAddons(window.userAddonsList, true);
    }
  }

  async function saveAddonRawJson(parsedJson) {
    const csrf = getCsrfToken();
    const res = await fetch("/api/addons/install", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRF-TOKEN": csrf,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ manifest: parsedJson }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data || data.success !== true) {
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    if (typeof window.loadAccountAddons === "function") {
      await window.loadAccountAddons();
      await inspectInstalledAccountAddons(window.userAddonsList, true);
    }
  }

  function buildNativeConfiguredUrl(baseManifestUrl, values, fields) {
    const cleanBase = String(baseManifestUrl || "").trim().replace(/^stremio:\/\//i, "https://");
    const urlObj = new URL(cleanBase);
    let basePath = urlObj.pathname.replace(/\/manifest(?:\.json)?$/i, "");
    const segments = basePath.split("/").filter(Boolean);
    if (segments.length > 0) {
      const tail = segments[segments.length - 1];
      try {
        if (decodeURIComponent(tail).trim().startsWith("{")) {
          segments.pop();
          basePath = segments.length > 0 ? "/" + segments.join("/") : "";
        }
      } catch {
        // ignore
      }
    }

    const payload = {};
    for (const field of fields) {
      if (!field || !field.key) continue;
      const rawVal = values[field.key] != null ? values[field.key] : "";
      if (field.type === "checkbox") {
        payload[field.key] = rawVal === "true";
      } else if (rawVal !== "") {
        payload[field.key] = rawVal;
      }
    }

    const encoded = encodeURIComponent(JSON.stringify(payload));
    urlObj.pathname = `${basePath.replace(/\/$/, "")}/${encoded}/manifest.json`;
    urlObj.search = "";
    urlObj.hash = "";
    return urlObj.toString();
  }

  function initializeNativeValues(fields, existing) {
    const vals = Object.create(null);
    for (const field of fields || []) {
      if (!field || !field.key) continue;
      if (existing && existing[field.key] !== undefined) {
        vals[field.key] = String(existing[field.key]);
      } else if (field.default !== undefined && field.default !== "") {
        vals[field.key] = String(field.default);
      } else if (field.type === "checkbox") {
        vals[field.key] = "false";
      } else if (field.type === "select" && Array.isArray(field.options) && field.options.length > 0) {
        vals[field.key] = String(field.options[0]);
      } else {
        vals[field.key] = "";
      }
    }
    return vals;
  }

  function teardownModalSession() {
    const active = modalState.session;
    modalState.session = null;
    if (active && active.sessionId) {
      void closeAddonConfigSession(active.sessionId);
    }
  }

  function ensureModalElement() {
    let el = document.getElementById("anirium-addon-modal");
    if (el) return el;

    el = document.createElement("div");
    el.id = "anirium-addon-modal";
    el.style.cssText =
      "display:none;position:fixed;inset:0;z-index:95;align-items:center;justify-content:center;padding:16px;background:rgba(5,5,9,0.82);backdrop-filter:blur(10px);font-family:inherit;";
    el.addEventListener("click", (ev) => {
      if (ev.target === el) {
        closeModal();
      }
    });
    el.addEventListener("click", handleModalClick);
    el.addEventListener("input", handleModalInput);
    el.addEventListener("change", handleModalChange);
    el.addEventListener("submit", handleModalSubmit);
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && ev.target && ev.target.id === "anirium-paste-input") {
        ev.preventDefault();
        const val = ev.target.value.trim();
        if (val) void handleInstallOrConfigureUrl(val);
      }
    });
    document.body.appendChild(el);
    return el;
  }

  function closeModal() {
    teardownModalSession();
    modalState.isOpen = false;
    modalState.captureLocked = false;
    modalState.validatingCapture = false;
    modalState.error = "";
    modalState.unsupportedCandidate = null;
    const el = document.getElementById("anirium-addon-modal");
    if (el) {
      el.style.display = "none";
      el.innerHTML = "";
    }
  }

  function refreshBrowseDirectoryDom() {
    if (!modalState.isOpen || modalState.step !== "browse" || modalState.browseTab !== "explore") {
      return;
    }
    const catsEl = document.getElementById("anirium-dir-categories-container");
    const sourcesEl = document.getElementById("anirium-dir-sources-container");
    const resultsEl = document.getElementById("anirium-dir-results-container");
    if (!catsEl || !sourcesEl || !resultsEl) {
      renderModal();
      return;
    }
    catsEl.innerHTML = buildDirectoryCategoriesHtml();
    sourcesEl.innerHTML = buildDirectorySourcesHtml();
    resultsEl.innerHTML = buildDirectoryListHtml();
  }

  async function runDirectorySearch() {
    modalState.isSearching = true;
    refreshBrowseDirectoryDom();
    try {
      const res = await searchAddonDirectories({
        query: modalState.query.trim(),
        category: modalState.category,
        limit: 40,
      });
      modalState.directoryItems = res.items;
      modalState.directorySources = res.sources;
      modalState.serviceOffline = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      modalState.serviceOffline = msg === "service_offline" || msg === "service_timeout";
      modalState.directoryItems = [];
      modalState.directorySources = [];
    } finally {
      modalState.isSearching = false;
      refreshBrowseDirectoryDom();
    }
  }

  function scheduleDirectorySearch() {
    if (modalState.searchDebounceTimer) {
      window.clearTimeout(modalState.searchDebounceTimer);
    }
    modalState.searchDebounceTimer = window.setTimeout(() => {
      void runDirectorySearch();
    }, modalState.query.trim() ? 320 : 0);
  }

  function enterNativeStep(inspected) {
    teardownModalSession();
    modalState.activeTarget = inspected;
    modalState.nativeValues = initializeNativeValues(inspected.configFields, inspected.existingConfigValues);
    modalState.revealedPasswords = Object.create(null);
    modalState.error = "";
    modalState.step = "native-config";
    renderModal();
  }

  async function enterPageStep(inspected) {
    teardownModalSession();
    modalState.captureLocked = false;
    modalState.activeTarget = inspected;
    modalState.error = "";
    modalState.validatingCapture = false;
    modalState.showManualFallback = false;
    modalState.manualUrl = "";
    modalState.step = "page-config";
    modalState.isStartingSession = true;
    renderModal();

    try {
      const session = await startAddonConfigSession(inspected.manifestUrl);
      if (!modalState.isOpen || modalState.step !== "page-config") {
        void closeAddonConfigSession(session.sessionId);
        return;
      }
      modalState.session = session;
    } catch (err) {
      modalState.showManualFallback = true;
      modalState.error =
        (err instanceof Error && err.message) ||
        "Não foi possível abrir o configurador integrado. Use o botão de nova aba e cole o link abaixo.";
    } finally {
      modalState.isStartingSession = false;
      renderModal();
    }
  }

  async function openExploreAddonModal() {
    teardownModalSession();
    modalState.isOpen = true;
    modalState.step = "browse";
    modalState.browseTab = "explore";
    modalState.replaceAddonId = "";
    modalState.activeTarget = null;
    modalState.error = "";
    modalState.unsupportedCandidate = null;
    modalState.pasteInput = "";
    modalState.showJsonPaste = false;
    renderModal();
    await runDirectorySearch();
  }

  async function openConfigureAddonModal(addonId) {
    const list = Array.isArray(window.userAddonsList) ? window.userAddonsList : [];
    const addon = list.find((a) => String(a.id) === String(addonId));
    if (!addon || !addon.manifest_url) return;

    const url = String(addon.manifest_url);
    teardownModalSession();
    modalState.isOpen = true;
    modalState.replaceAddonId = String(addon.id);
    modalState.error = "";
    modalState.unsupportedCandidate = null;
    modalState.step = "page-config";
    modalState.isStartingSession = true;
    modalState.activeTarget = {
      manifestUrl: url,
      configureUrl: url.replace(/\/manifest(?:\.json)?$/i, "/configure"),
      name: getAddonDisplayName(addon, inspectionsByUrl[url] || inspectionsByUrl[canonicalComparableUrl(url)]),
    };
    renderModal();

    try {
      let inspected = inspectionsByUrl[url] || inspectionsByUrl[canonicalComparableUrl(url)];
      if (!inspected || (inspected.configMode === "native" && (!inspected.configFields || inspected.configFields.length === 0))) {
        inspected = await inspectAddon(url);
        inspectionsByUrl[url] = inspected;
        inspectionsByUrl[canonicalComparableUrl(url)] = inspected;
      }
      if (inspected.status === "offline" || inspected.status === "invalid_manifest" || inspected.status === "invalid_ref") {
        modalState.isStartingSession = false;
        modalState.showManualFallback = true;
        modalState.error = inspected.error || "Este add-on está temporariamente offline.";
        renderModal();
        return;
      }
      if (inspected.configMode === "native" && Array.isArray(inspected.configFields) && inspected.configFields.length > 0) {
        modalState.isStartingSession = false;
        enterNativeStep(inspected);
        return;
      }
      await enterPageStep(inspected);
    } catch {
      modalState.isStartingSession = false;
      modalState.showManualFallback = true;
      modalState.error = "Anirium Service offline no momento. Abra o configurador em nova aba e cole o link gerado abaixo.";
      renderModal();
    }
  }

  async function handleInstallOrConfigureUrl(rawUrl) {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed || modalState.isSubmitting) return;

    modalState.busyUrl = trimmed;
    modalState.isSubmitting = true;
    modalState.error = "";
    modalState.unsupportedCandidate = null;
    renderModal();

    try {
      if (!/^(https?|stremio):\/\//i.test(trimmed)) {
        const parsedJson = JSON.parse(trimmed);
        await saveAddonRawJson(parsedJson);
        closeModal();
        return;
      }

      try {
        const inspected = await inspectAddon(trimmed);
        if (inspected.status === "ready") {
          await saveAddonManifestUrl(inspected.manifestUrl, modalState.replaceAddonId);
          closeModal();
          return;
        }
        if (inspected.configMode === "native" && Array.isArray(inspected.configFields) && inspected.configFields.length > 0) {
          modalState.isSubmitting = false;
          modalState.busyUrl = "";
          enterNativeStep(inspected);
          return;
        }
        if (inspected.status === "configuration_required" || inspected.configMode === "page") {
          modalState.isSubmitting = false;
          modalState.busyUrl = "";
          await enterPageStep(inspected);
          return;
        }
        if (inspected.status === "unsupported") {
          modalState.unsupportedCandidate = inspected;
          modalState.error = "Este add-on fornece apenas catálogo (não traz streams nem legendas).";
          return;
        }
        modalState.error = inspected.error || "Não foi possível validar o manifesto deste add-on.";
      } catch (wsErr) {
        const msg = wsErr instanceof Error ? wsErr.message : "";
        if (msg === "service_offline" || msg === "service_timeout") {
          await saveAddonManifestUrl(trimmed, modalState.replaceAddonId);
          closeModal();
          return;
        }
        throw wsErr;
      }
    } catch (err) {
      modalState.error = err instanceof Error ? err.message : "URL ou manifesto inválido.";
    } finally {
      modalState.busyUrl = "";
      modalState.isSubmitting = false;
      if (modalState.isOpen) renderModal();
    }
  }

  async function handleCapturedUrl(capturedUrl) {
    if (!modalState.isOpen || modalState.step !== "page-config" || modalState.captureLocked) {
      return;
    }
    modalState.captureLocked = true;
    modalState.validatingCapture = true;
    modalState.error = "";
    renderModal();

    try {
      const inspected = await inspectAddon(capturedUrl);
      if (inspected.status === "offline" || inspected.status === "invalid_manifest" || inspected.status === "invalid_ref") {
        modalState.captureLocked = false;
        modalState.validatingCapture = false;
        modalState.error = inspected.error || "A URL gerada não respondeu com um manifesto válido.";
        renderModal();
        return;
      }
      if (inspected.configurationRequired && !inspected.supportsStreams && !inspected.supportsSubtitles) {
        modalState.captureLocked = false;
        modalState.validatingCapture = false;
        modalState.error = "O add-on ainda indica configuração pendente. Revise os campos e tente novamente.";
        renderModal();
        return;
      }
      await saveAddonManifestUrl(inspected.manifestUrl, modalState.replaceAddonId);
      closeModal();
    } catch (err) {
      modalState.captureLocked = false;
      modalState.validatingCapture = false;
      modalState.error = err instanceof Error ? err.message : "Falha ao salvar o add-on configurado.";
      renderModal();
    }
  }

  async function handleSubmitNativeConfig(ev) {
    ev.preventDefault();
    if (!modalState.activeTarget || modalState.isSubmitting) return;
    const fields = modalState.activeTarget.configFields || [];
    for (const field of fields) {
      if (field.required && !String(modalState.nativeValues[field.key] || "").trim()) {
        modalState.error = `Preencha o campo obrigatório "${field.title || field.key}".`;
        renderModal();
        return;
      }
    }

    modalState.isSubmitting = true;
    modalState.error = "";
    renderModal();

    try {
      const configuredUrl = buildNativeConfiguredUrl(modalState.activeTarget.manifestUrl, modalState.nativeValues, fields);
      const inspected = await inspectAddon(configuredUrl);
      if (inspected.status === "offline" || inspected.status === "invalid_manifest" || inspected.status === "invalid_ref") {
        modalState.error = inspected.error || "O add-on recusou a configuração informada.";
        return;
      }
      if (inspected.status === "configuration_required" && !inspected.supportsStreams && !inspected.supportsSubtitles) {
        modalState.error = "A configuração ainda parece incompleta segundo o add-on. Verifique os valores.";
        return;
      }
      await saveAddonManifestUrl(inspected.manifestUrl, modalState.replaceAddonId);
      closeModal();
    } catch (err) {
      modalState.error = err instanceof Error ? err.message : "Erro ao aplicar a configuração.";
    } finally {
      modalState.isSubmitting = false;
      if (modalState.isOpen) renderModal();
    }
  }

  async function handleManualFallbackSubmit() {
    const raw = modalState.manualUrl.trim();
    if (!raw || modalState.validatingCapture) return;
    modalState.validatingCapture = true;
    modalState.error = "";
    renderModal();

    try {
      let finalUrl = raw;
      try {
        const inspected = await inspectAddon(raw);
        if (inspected.status === "offline" || inspected.status === "invalid_manifest" || inspected.status === "invalid_ref") {
          modalState.validatingCapture = false;
          modalState.error = inspected.error || "Link inválido ou add-on offline.";
          renderModal();
          return;
        }
        if (inspected.status === "configuration_required") {
          modalState.validatingCapture = false;
          modalState.error = "Esse link ainda está sem configuração. Copie o link final gerado após configurar.";
          renderModal();
          return;
        }
        finalUrl = inspected.manifestUrl;
      } catch {
        // Fallback se o service local estiver offline
      }
      await saveAddonManifestUrl(finalUrl, modalState.replaceAddonId);
      closeModal();
    } catch (err) {
      modalState.validatingCapture = false;
      modalState.error = err instanceof Error ? err.message : "URL inválida.";
      renderModal();
    }
  }

  function renderModal() {
    const el = ensureModalElement();
    if (!modalState.isOpen) {
      el.style.display = "none";
      return;
    }

    el.style.display = "flex";
    const isPage = modalState.step === "page-config";
    const maxW = modalState.step === "native-config" ? "520px" : isPage ? "900px" : "760px";
    const heightCss = isPage ? "height:min(88vh,740px);" : "max-height:88vh;";

    const active = modalState.activeTarget;
    const titleText =
      modalState.step === "browse"
        ? "Explorar & Instalar Add-on Stremio"
        : `Configurar ${(active && active.name) || "Add-on"}`;
    const subtitleText =
      modalState.step === "native-config"
        ? "Preencha os campos exigidos pelo add-on e clique em Aplicar."
        : modalState.step === "page-config"
        ? "Configure abaixo e clique em Instalar dentro da página — o Anirium captura automaticamente."
        : "";

    const activeLogo = safeHttpsLogo(active && active.logo);
    const headerLogoHtml =
      modalState.step !== "browse" && active
        ? activeLogo
          ? `<img src="${escapeHtml(activeLogo)}" alt="" style="width:32px;height:32px;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.12);flex-shrink:0;" onerror="this.style.display='none'">`
          : `<span style="width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,199,102,0.14);border:1px solid rgba(255,199,102,0.3);font-size:15px;flex-shrink:0;">🧩</span>`
        : `<span style="color:#ffc766;font-size:16px;flex-shrink:0;">✨</span>`;

    const backBtnHtml =
      modalState.step !== "browse"
        ? `<button type="button" data-modal-action="back" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#d4d4d8;width:30px;height:30px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;" title="Voltar">←</button>`
        : "";

    const errorHtml = modalState.error
      ? `<div style="margin:14px 20px 0;padding:10px 14px;border-radius:12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;">
           <span>${escapeHtml(modalState.error)}</span>
           ${
             modalState.unsupportedCandidate
               ? `<button type="button" data-modal-action="force-install-unsupported" style="background:rgba(255,255,255,0.12);color:#fff;border:none;padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;">Instalar mesmo assim</button>`
               : ""
           }
         </div>`
      : "";

    let bodyHtml = "";
    if (modalState.step === "browse") {
      bodyHtml = renderBrowseStepHtml();
    } else if (modalState.step === "native-config") {
      bodyHtml = renderNativeStepHtml();
    } else {
      bodyHtml = renderPageStepHtml();
    }

    el.innerHTML = `
      <div style="width:min(96vw,${maxW});${heightCss}display:flex;flex-direction:column;border-radius:18px;border:1px solid rgba(255,255,255,0.12);background:#141418;color:#f4f4f5;box-shadow:0 24px 60px rgba(0,0,0,0.65);overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.09);display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(0,0,0,0.28);flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            ${backBtnHtml}
            ${headerLogoHtml}
            <div style="min-width:0;">
              <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(titleText)}</div>
              ${subtitleText ? `<div style="font-size:11px;color:#a1a1aa;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(subtitleText)}</div>` : ""}
            </div>
          </div>
          <button type="button" data-modal-action="close" style="background:transparent;border:none;color:#a1a1aa;font-size:16px;padding:4px 8px;border-radius:8px;cursor:pointer;" title="Fechar">✕</button>
        </div>
        ${errorHtml}
        ${bodyHtml}
      </div>
    `;
  }

  function buildDirectoryCategoriesHtml() {
    return CATEGORIES.map((c) => {
      const active = modalState.category === c.id;
      return `<button type="button" data-modal-action="set-category" data-category="${escapeHtml(c.id)}" style="padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;${
        active
          ? "background:rgba(56,189,248,0.18);color:#7dd3fc;border:1px solid rgba(56,189,248,0.4);"
          : "background:rgba(255,255,255,0.05);color:#a1a1aa;border:1px solid rgba(255,255,255,0.08);"
      }">${escapeHtml(c.label)}</button>`;
    }).join("");
  }

  function buildDirectorySourcesHtml() {
    return (modalState.directorySources || [])
      .map(
        (s) =>
          `<span style="padding:2px 6px;border-radius:6px;font-size:10px;font-family:monospace;${
            s.ok
              ? "background:rgba(16,185,129,0.12);color:#6ee7b7;border:1px solid rgba(16,185,129,0.25);"
              : "background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.25);"
          }">${escapeHtml(s.name)}</span>`
      )
      .join("");
  }

  function parseUrlOriginAndPath(raw) {
    if (!raw || typeof raw !== "string") return null;
    try {
      const normalized = raw.trim().replace(/^stremio:\/\//i, "https://");
      const u = new URL(normalized);
      return {
        origin: `${u.protocol.toLowerCase()}//${u.host.toLowerCase().replace(/:(443|80)$/, "")}`,
        pathname: u.pathname || "/",
      };
    } catch {
      return null;
    }
  }

  function findInstalledAddonMatch(directoryItem) {
    const installedList = Array.isArray(window.userAddonsList) ? window.userAddonsList : [];
    const targetCanonical = canonicalComparableUrl(directoryItem && directoryItem.manifestUrl);
    const targetId = String((directoryItem && directoryItem.id) || "").trim().toLowerCase();
    const targetParts = parseUrlOriginAndPath(directoryItem && directoryItem.manifestUrl);
    const targetIsRootManifest = !!(targetParts && /^\/manifest(?:\.json)?$/i.test(targetParts.pathname));

    for (const addon of installedList) {
      if (!addon) continue;
      const instUrl = String(addon.manifest_url || "").trim();
      const instCanonical = canonicalComparableUrl(instUrl);
      if (targetCanonical && instCanonical && instCanonical === targetCanonical) {
        return addon;
      }

      const instInsp = instUrl ? inspectionsByUrl[instUrl] || inspectionsByUrl[instCanonical] : null;
      const instId = String((instInsp && instInsp.id) || "").trim().toLowerCase();
      if (targetId && instId && instId === targetId) {
        return addon;
      }

      if (targetIsRootManifest && targetParts && instUrl) {
        const instParts = parseUrlOriginAndPath(instUrl);
        if (instParts && instParts.origin === targetParts.origin) {
          return addon;
        }
      }
    }
    return null;
  }

  function buildDirectoryListHtml() {
    if (modalState.serviceOffline) {
      return `
        <div style="padding:24px;border-radius:14px;border:1px solid rgba(255,199,102,0.3);background:rgba(255,199,102,0.05);text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;">
          <div style="font-size:13px;font-weight:700;">Anirium Service local não conectado</div>
          <div style="font-size:11px;color:#a1a1aa;max-width:440px;">A busca simultânea em diretórios Stremio roda no Anirium Service local (127.0.0.1:4004). Inicie o serviço ou cole o link diretamente.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
            <button type="button" data-modal-action="tab-paste" style="background:#ffc766;color:#0b0b0f;border:none;padding:7px 14px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">Colar Link Manualmente</button>
            <a href="/download/service" download="anirium-service.exe" style="background:rgba(255,255,255,0.1);color:#f4f4f5;padding:7px 14px;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none;">⬇ Baixar Service</a>
          </div>
        </div>
      `;
    }
    if (modalState.isSearching) {
      return `<div style="padding:28px;text-align:center;font-size:12px;font-family:monospace;color:#a1a1aa;">Buscando add-ons em diretórios Stremio...</div>`;
    }
    if (!modalState.directoryItems || modalState.directoryItems.length === 0) {
      return `<div style="padding:28px;text-align:center;font-size:12px;color:#a1a1aa;">Nenhum add-on encontrado. Tente outro termo ou use "Colar Link".</div>`;
    }
    return modalState.directoryItems
      .map((item) => {
        const installedAddon = findInstalledAddonMatch(item);
        const installedUrl = installedAddon ? String(installedAddon.manifest_url || "") : "";
        const installedInsp = installedUrl
          ? inspectionsByUrl[installedUrl] || inspectionsByUrl[canonicalComparableUrl(installedUrl)]
          : null;
        const isBusy = modalState.busyUrl === item.manifestUrl;
        const needsCfg =
          item.configurationRequired ||
          ((item.configMode === "native" || item.configMode === "page") && !item.supportsStreams && !item.supportsSubtitles);
        const logo = safeHttpsLogo(item.logo);
        const itemLogoHtml = logo
          ? `<div style="position:relative;width:40px;height:40px;flex-shrink:0;">
               <img src="${escapeHtml(logo)}" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:cover;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <span style="display:none;width:40px;height:40px;border-radius:10px;align-items:center;justify-content:center;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2);font-size:17px;">🌐</span>
             </div>`
          : `<div style="width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2);font-size:17px;flex-shrink:0;">🌐</div>`;

        let actionHtml = "";
        if (installedAddon) {
          if (installedInsp && installedInsp.status === "configuration_required") {
            actionHtml = `<button type="button" data-modal-action="configure-existing" data-addon-id="${escapeHtml(
              installedAddon.id
            )}" style="padding:6px 11px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(255,199,102,0.18);color:#ffc766;border:1px solid rgba(255,199,102,0.45);cursor:pointer;white-space:nowrap;">✓ Instalado • Configurar</button>`;
          } else {
            actionHtml = `<span style="padding:6px 11px;border-radius:10px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.28);white-space:nowrap;display:inline-flex;align-items:center;gap:4px;">✓ Já instalado</span>`;
          }
        } else {
          actionHtml = `<button type="button" data-modal-action="install-dir-item" data-url="${escapeHtml(item.manifestUrl)}" ${
            modalState.isSubmitting || isBusy ? "disabled" : ""
          } style="padding:7px 12px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;${
            needsCfg
              ? "background:rgba(255,199,102,0.18);color:#ffc766;border:1px solid rgba(255,199,102,0.45);"
              : "background:#ffc766;color:#0b0b0f;border:none;"
          }">${isBusy ? "Verificando..." : needsCfg ? "Configurar e Instalar" : "Instalar"}</button>`;
        }

        return `
          <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.09);background:rgba(0,0,0,0.26);display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;">
              ${itemLogoHtml}
              <div style="min-width:0;display:flex;flex-direction:column;gap:2px;">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                  <span style="font-size:12px;font-weight:700;color:#f4f4f5;">${escapeHtml(item.name)}</span>
                  ${item.version ? `<span style="font-size:10px;font-family:monospace;color:#a1a1aa;">v${escapeHtml(item.version)}</span>` : ""}
                  ${item.supportsStreams ? '<span style="font-size:9px;font-family:monospace;padding:1px 6px;border-radius:5px;background:rgba(56,189,248,0.15);color:#7dd3fc;border:1px solid rgba(56,189,248,0.28);">Streams</span>' : ""}
                  ${item.supportsSubtitles ? '<span style="font-size:9px;font-family:monospace;padding:1px 6px;border-radius:5px;background:rgba(16,185,129,0.15);color:#6ee7b7;border:1px solid rgba(16,185,129,0.28);">Legendas</span>' : ""}
                  ${item.configurable ? '<span style="font-size:9px;font-family:monospace;padding:1px 6px;border-radius:5px;background:rgba(255,199,102,0.15);color:#ffc766;border:1px solid rgba(255,199,102,0.3);">Configurável</span>' : ""}
                </div>
                ${item.description ? `<div style="font-size:11px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:470px;">${escapeHtml(item.description)}</div>` : ""}
                <div style="font-size:10px;font-family:monospace;color:#71717a;">via ${escapeHtml((item.directories || []).join(" + "))}</div>
              </div>
            </div>
            <div style="flex-shrink:0;">${actionHtml}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderBrowseStepHtml() {
    const exploreActive = modalState.browseTab === "explore";
    const tabsHtml = `
      <div style="padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <button type="button" data-modal-action="tab-explore" style="padding:7px 13px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;${
          exploreActive ? "background:#ffc766;color:#0b0b0f;" : "background:rgba(255,255,255,0.05);color:#a1a1aa;"
        }">Explorar Add-ons</button>
        <button type="button" data-modal-action="tab-paste" style="padding:7px 13px;border-radius:10px;font-size:12px;font-weight:700;border:none;cursor:pointer;${
          !exploreActive ? "background:#ffc766;color:#0b0b0f;" : "background:rgba(255,255,255,0.05);color:#a1a1aa;"
        }">Colar Link</button>
      </div>
    `;

    if (!exploreActive) {
      const inputHtml = modalState.showJsonPaste
        ? `<textarea id="anirium-paste-input" rows="4" placeholder='{ "id": "...", "name": "...", "manifestUrl": "https://.../manifest.json" }' style="width:100%;padding:12px;border-radius:12px;background:rgba(0,0,0,0.38);border:1px solid rgba(255,255,255,0.12);color:#f4f4f5;font-size:12px;font-family:monospace;outline:none;">${escapeHtml(modalState.pasteInput)}</textarea>`
        : `<input id="anirium-paste-input" type="text" value="${escapeHtml(modalState.pasteInput)}" placeholder="https://addon.exemplo.com/manifest.json ou stremio://..." style="width:100%;padding:11px 14px;border-radius:12px;background:rgba(0,0,0,0.38);border:1px solid rgba(255,255,255,0.12);color:#f4f4f5;font-size:12px;font-family:monospace;outline:none;">`;

      return `
        ${tabsHtml}
        <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
          <p style="font-size:12px;color:#a1a1aa;line-height:1.5;margin:0;">
            Digite ou cole o endereço do add-on (<code style="color:#ffc766;">https://.../manifest.json</code> ou <code style="color:#ffc766;">stremio://...</code>). Se ele precisar de configuração, o modal de campos ou a página de configuração abrirá automaticamente aqui dentro.
          </p>
          ${inputHtml}
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:4px;">
            <button type="button" data-modal-action="toggle-json-paste" style="background:none;border:none;color:#a1a1aa;font-size:11px;text-decoration:underline;cursor:pointer;padding:0;">
              ${modalState.showJsonPaste ? "Colar URL simples" : "Colar JSON manualmente"}
            </button>
            <div style="display:flex;align-items:center;gap:8px;">
              <button type="button" data-modal-action="close" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#d4d4d8;padding:7px 14px;border-radius:10px;font-size:12px;cursor:pointer;">Cancelar</button>
              <button type="button" data-modal-action="apply-paste" ${modalState.isSubmitting ? "disabled" : ""} style="background:#ffc766;color:#0b0b0f;border:none;padding:7px 16px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">
                ${modalState.isSubmitting ? "Verificando..." : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return `
      ${tabsHtml}
      <div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;">
        <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
          <input id="anirium-dir-search-input" type="text" value="${escapeHtml(modalState.query)}" placeholder="Buscar em vários diretórios Stremio (ex: opensubtitles, subdl, torrentio, anime)..." style="width:100%;padding:10px 14px;border-radius:12px;background:rgba(0,0,0,0.38);border:1px solid rgba(255,255,255,0.12);color:#f4f4f5;font-size:12px;outline:none;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <div id="anirium-dir-categories-container" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${buildDirectoryCategoriesHtml()}</div>
            <div id="anirium-dir-sources-container" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">${buildDirectorySourcesHtml()}</div>
          </div>
        </div>
        <div id="anirium-dir-results-container" style="flex:1;min-height:220px;max-height:430px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px;">
          ${buildDirectoryListHtml()}
        </div>
      </div>
    `;
  }

  function renderNativeStepHtml() {
    const active = modalState.activeTarget;
    const fields = (active && active.configFields) || [];
    const descHtml =
      active && active.description
        ? `<p style="font-size:12px;color:#a1a1aa;background:rgba(0,0,0,0.25);padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);margin:0;">${escapeHtml(active.description)}</p>`
        : "";

    const fieldsHtml = fields
      .map((field) => {
        const label = field.title || field.key;
        const val = modalState.nativeValues[field.key] != null ? modalState.nativeValues[field.key] : "";
        const type = String(field.type || "text").toLowerCase();
        const reqMark = field.required ? '<span style="color:#ffc766;margin-left:3px;">*</span>' : "";

        if (type === "checkbox") {
          const checked = val === "true";
          return `
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);cursor:pointer;">
              <span style="font-size:12px;font-weight:500;">${escapeHtml(label)}${reqMark}</span>
              <input type="checkbox" data-native-key="${escapeHtml(field.key)}" ${checked ? "checked" : ""} style="width:16px;height:16px;accent-color:#ffc766;cursor:pointer;">
            </label>
          `;
        }

        if (type === "select" && Array.isArray(field.options) && field.options.length > 0) {
          const optsHtml = field.options
            .map(
              (opt) =>
                `<option value="${escapeHtml(opt)}" ${val === opt ? "selected" : ""} style="background:#141418;color:#f4f4f5;">${escapeHtml(opt)}</option>`
            )
            .join("");
          return `
            <div style="display:flex;flex-direction:column;gap:5px;">
              <label style="font-size:12px;font-weight:500;">${escapeHtml(label)}${reqMark}</label>
              <select data-native-key="${escapeHtml(field.key)}" style="width:100%;padding:9px 12px;border-radius:10px;background:rgba(0,0,0,0.38);border:1px solid rgba(255,255,255,0.12);color:#f4f4f5;font-size:12px;outline:none;">
                ${optsHtml}
              </select>
            </div>
          `;
        }

        const isPass = type === "password";
        const revealed = !!modalState.revealedPasswords[field.key];
        const htmlType = isPass ? (revealed ? "text" : "password") : type === "number" ? "number" : "text";

        return `
          <div style="display:flex;flex-direction:column;gap:5px;">
            <label style="font-size:12px;font-weight:500;">${escapeHtml(label)}${reqMark}</label>
            <div style="position:relative;">
              <input type="${htmlType}" data-native-key="${escapeHtml(field.key)}" ${field.required ? "required" : ""} value="${escapeHtml(val)}" style="width:100%;padding:9px 36px 9px 12px;border-radius:10px;background:rgba(0,0,0,0.38);border:1px solid rgba(255,255,255,0.12);color:#f4f4f5;font-size:12px;outline:none;">
              ${
                isPass
                  ? `<button type="button" data-modal-action="toggle-pass" data-key="${escapeHtml(field.key)}" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#a1a1aa;font-size:12px;cursor:pointer;">${revealed ? "Ocultar" : "Ver"}</button>`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <form id="anirium-native-config-form" style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;">
        ${descHtml}
        <div style="display:flex;flex-direction:column;gap:10px;">${fieldsHtml}</div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
          <button type="button" data-modal-action="back" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#d4d4d8;padding:7px 14px;border-radius:10px;font-size:12px;cursor:pointer;">Cancelar</button>
          <button type="submit" ${modalState.isSubmitting ? "disabled" : ""} style="background:#ffc766;color:#0b0b0f;border:none;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">
            ${modalState.isSubmitting ? "Aplicando..." : "Aplicar e Instalar"}
          </button>
        </div>
      </form>
    `;
  }

  function renderPageStepHtml() {
    const active = modalState.activeTarget;
    const session = modalState.session;
    const configureHref = safeHttpUrl((session && session.configureUrl) || (active && active.configureUrl) || "");

    let frameAreaHtml = "";
    if (modalState.isStartingSession) {
      frameAreaHtml = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:12px;color:#a1a1aa;">Abrindo configurador do add-on com ponte Anirium...</div>`;
    } else if (session && session.frameUrl) {
      frameAreaHtml = `<iframe src="${escapeHtml(session.frameUrl)}" title="Configurar add-on" style="width:100%;height:100%;border:none;background:#fff;" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"></iframe>`;
    } else {
      frameAreaHtml = `
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;gap:10px;font-size:12px;color:#a1a1aa;">
          <span>Não foi possível carregar o configurador embutido.</span>
          ${configureHref ? `<a href="${escapeHtml(configureHref)}" target="_blank" rel="noopener noreferrer" style="background:#ffc766;color:#0b0b0f;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;text-decoration:none;">Abrir configurador em nova aba ↗</a>` : ""}
        </div>
      `;
    }

    const validatingOverlay = modalState.validatingCapture
      ? `<div style="position:absolute;inset:0;background:rgba(10,10,14,0.85);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#ffc766;z-index:10;">Validando configuração aplicada...</div>`
      : "";

    const manualBoxHtml = modalState.showManualFallback
      ? `<div style="display:flex;align-items:center;gap:8px;padding-top:4px;">
           <input id="anirium-manual-url-input" type="text" value="${escapeHtml(modalState.manualUrl)}" placeholder="Cole aqui o link final gerado pelo configurador..." style="flex:1;padding:7px 12px;border-radius:10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.12);color:#f4f4f5;font-size:12px;font-family:monospace;outline:none;">
           <button type="button" data-modal-action="apply-manual-url" ${modalState.validatingCapture ? "disabled" : ""} style="background:#ffc766;color:#0b0b0f;border:none;padding:7px 14px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;">Aplicar link</button>
         </div>`
      : "";

    return `
      <div style="padding:14px 18px;display:flex;flex-direction:column;gap:10px;flex:1;min-height:0;">
        <div style="position:relative;flex:1;min-height:0;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);background:#0d0d11;">
          ${frameAreaHtml}
          ${validatingOverlay}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span style="font-size:11px;color:#a1a1aa;">Se clicar em Instalar ou Copiar na página acima, o Anirium captura o link sozinho.</span>
            <div style="display:flex;align-items:center;gap:8px;">
              ${configureHref ? `<a href="${escapeHtml(configureHref)}" target="_blank" rel="noopener noreferrer" style="padding:5px 10px;border-radius:8px;font-size:11px;background:rgba(255,255,255,0.06);color:#d4d4d8;border:1px solid rgba(255,255,255,0.12);text-decoration:none;">Abrir em nova aba ↗</a>` : ""}
              <button type="button" data-modal-action="toggle-manual-fallback" style="padding:5px 10px;border-radius:8px;font-size:11px;background:rgba(255,255,255,0.06);color:#d4d4d8;border:1px solid rgba(255,255,255,0.12);cursor:pointer;">
                ${modalState.showManualFallback ? "Ocultar campo manual" : "Colar link manualmente"}
              </button>
            </div>
          </div>
          ${manualBoxHtml}
        </div>
      </div>
    `;
  }

  function handleModalClick(ev) {
    const btn = ev.target && ev.target.closest ? ev.target.closest("[data-modal-action]") : null;
    if (!btn) return;
    const action = btn.getAttribute("data-modal-action");

    switch (action) {
      case "close":
        closeModal();
        break;
      case "back":
        teardownModalSession();
        modalState.error = "";
        if (modalState.replaceAddonId) {
          closeModal();
        } else {
          modalState.step = "browse";
          renderModal();
        }
        break;
      case "tab-explore":
        modalState.browseTab = "explore";
        modalState.error = "";
        modalState.unsupportedCandidate = null;
        renderModal();
        void runDirectorySearch();
        break;
      case "tab-paste":
        modalState.browseTab = "paste";
        modalState.error = "";
        modalState.unsupportedCandidate = null;
        renderModal();
        break;
      case "set-category":
        modalState.category = btn.getAttribute("data-category") || "";
        void runDirectorySearch();
        break;
      case "toggle-json-paste":
        modalState.showJsonPaste = !modalState.showJsonPaste;
        modalState.pasteInput = "";
        renderModal();
        break;
      case "apply-paste":
        void handleInstallOrConfigureUrl(modalState.pasteInput);
        break;
      case "install-dir-item": {
        const url = btn.getAttribute("data-url") || "";
        if (url) void handleInstallOrConfigureUrl(url);
        break;
      }
      case "configure-existing": {
        const addonId = btn.getAttribute("data-addon-id") || "";
        if (addonId) void openConfigureAddonModal(addonId);
        break;
      }
      case "force-install-unsupported":
        if (modalState.unsupportedCandidate && modalState.unsupportedCandidate.manifestUrl) {
          void saveAddonManifestUrl(modalState.unsupportedCandidate.manifestUrl, modalState.replaceAddonId).then(closeModal);
        }
        break;
      case "toggle-pass": {
        const key = btn.getAttribute("data-key") || "";
        modalState.revealedPasswords[key] = !modalState.revealedPasswords[key];
        renderModal();
        break;
      }
      case "toggle-manual-fallback":
        modalState.showManualFallback = !modalState.showManualFallback;
        renderModal();
        break;
      case "apply-manual-url":
        void handleManualFallbackSubmit();
        break;
    }
  }

  function handleModalInput(ev) {
    const target = ev.target;
    if (!target) return;
    if (target.id === "anirium-dir-search-input") {
      modalState.query = target.value;
      scheduleDirectorySearch();
      return;
    }
    if (target.id === "anirium-paste-input") {
      modalState.pasteInput = target.value;
      return;
    }
    if (target.id === "anirium-manual-url-input") {
      modalState.manualUrl = target.value;
      return;
    }
    const nativeKey = target.getAttribute("data-native-key");
    if (nativeKey && target.type !== "checkbox") {
      modalState.nativeValues[nativeKey] = target.value;
    }
  }

  function handleModalChange(ev) {
    const target = ev.target;
    if (!target) return;
    const nativeKey = target.getAttribute("data-native-key");
    if (nativeKey && target.type === "checkbox") {
      modalState.nativeValues[nativeKey] = target.checked ? "true" : "false";
    } else if (nativeKey && target.tagName === "SELECT") {
      modalState.nativeValues[nativeKey] = target.value;
    }
  }

  function handleModalSubmit(ev) {
    if (ev.target && ev.target.id === "anirium-native-config-form") {
      void handleSubmitNativeConfig(ev);
    }
  }

  // Event delegation on #profile-addons-list (safe against arbitrary addon ids)
  document.addEventListener("click", (ev) => {
    const listEl = document.getElementById("profile-addons-list");
    if (!listEl || !listEl.contains(ev.target)) return;
    const btn = ev.target.closest ? ev.target.closest("[data-action]") : null;
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const addonId = btn.getAttribute("data-addon-id");
    if (!addonId) return;
    if (action === "configure-addon") {
      void openConfigureAddonModal(addonId);
    } else if (action === "uninstall-addon" && typeof window.uninstallAddon === "function") {
      void window.uninstallAddon(addonId);
    }
  });

  document.addEventListener("change", (ev) => {
    const listEl = document.getElementById("profile-addons-list");
    if (!listEl || !listEl.contains(ev.target)) return;
    const input = ev.target;
    if (input.getAttribute("data-action") === "toggle-addon" && typeof window.toggleAddon === "function") {
      const addonId = input.getAttribute("data-addon-id");
      if (addonId) void window.toggleAddon(addonId, input.checked);
    }
  });

  // Listen to BOTH iframe postMessage bridge and WS addon_config_captured event
  window.addEventListener("message", (ev) => {
    if (!modalState.isOpen || modalState.step !== "page-config" || !modalState.session) return;
    if (ev.origin !== modalState.session.proxyOrigin) return;
    const data = ev.data;
    if (
      !data ||
      typeof data !== "object" ||
      data.type !== "anirium:addon-configured" ||
      data.sessionId !== modalState.session.sessionId ||
      data.token !== modalState.session.token ||
      typeof data.manifestUrl !== "string"
    ) {
      return;
    }
    void handleCapturedUrl(data.manifestUrl);
  });

  wsState.captureListeners.add((payload) => {
    if (!modalState.isOpen || modalState.step !== "page-config" || !modalState.session) return;
    if (payload.sessionId !== modalState.session.sessionId) return;
    void handleCapturedUrl(payload.manifestUrl);
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modalState.isOpen) {
      closeModal();
    }
  });

  window.addEventListener("beforeunload", () => {
    teardownModalSession();
  });

  window.AniriumAddonsManager = {
    renderAddonsList: renderAddonsListEnriched,
    inspectInstalledAccountAddons,
    openExploreAddonModal,
    openConfigureAddonModal,
    toggleInstallAddonForm: openExploreAddonModal,
    closeModal,
  };
  window.renderAddonsList = renderAddonsListEnriched;
  window.inspectInstalledAccountAddons = inspectInstalledAccountAddons;
  window.openExploreAddonModal = openExploreAddonModal;
  window.openConfigureAddonModal = openConfigureAddonModal;
  window.toggleInstallAddonForm = openExploreAddonModal;
})();
