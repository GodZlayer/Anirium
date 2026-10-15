import { parseCommunityManifest, parseRemoteManifestConfig } from '@/lib/extensions/manifestInput';
import { requireUserWriteBudget, WriteBudgetExceeded } from '@/lib/writeBudget';
import { logServerFailure } from "@/lib/serverLog";
import { readApiJson, ApiInputError } from "@/lib/apiInput";
import { readWebSessionId } from "@/lib/webSession";
import { NextRequest, NextResponse } from 'next/server';
import { addonRegistry } from '@/lib/extensions/addonRegistry';
import { AniriumAddonManifest } from '@/lib/extensions/types';
import {
  getActiveUserProfile,
  getUserInstalledAddons,
  installUserAddon,
  uninstallUserAddon,
} from '@/lib/userProfiles';

const getRequestUser = (sessionId: string) => sessionId
  ? getActiveUserProfile(false, sessionId)
  : Promise.resolve(null);

const privateAddonHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = readWebSessionId(request);

  // Se for uma requisição para listar extensões instaladas
  if (searchParams.get('action') === 'list_addons') {
    const activeUser = await getRequestUser(sessionId);
    if (!activeUser || activeUser.level_tier < 1) {
      return NextResponse.json({
        success: true,
        addons: [],
        activeTheme: null,
      }, { headers: privateAddonHeaders });
    }

    // Busca os addons instalados da conta no PostgreSQL
    const installedRows = await getUserInstalledAddons(activeUser.id);
    const addonsList: AniriumAddonManifest[] = [];

    for (const row of installedRows) {
      // Se houver config_json salvo com o manifesto completo
      if (row.config_json && typeof row.config_json === 'object' && row.config_json.id) {
        if (row.config_json.kind === 'remote-manifest' && typeof row.config_json.manifestUrl === 'string') {
          // Neutral display: derived host + canonical URL. No fetched version,
          // live status, capabilities or UI grants are invented client-side.
          let host = 'remote';
          try { host = new URL(row.config_json.manifestUrl).host || 'remote'; } catch {}
          addonsList.push({
            id: row.config_json.id,
            name: host,
            version: '',
            description: row.config_json.manifestUrl,
            author: 'Manifesto remoto',
            type: 'community',
            origin: 'community',
            enabled: row.enabled,
            capabilities: [],
            permissions: [],
            kind: 'remote-manifest',
            manifestUrl: row.config_json.manifestUrl,
          });
        } else {
          addonsList.push({
            ...row.config_json,
            enabled: row.enabled,
          });
        }
      } else {
        // Busca do catálogo em memória do runtime
        const allKnown = addonRegistry.getInstalledAddons();
        const found = allKnown.find((a) => a.id === row.addon_id);
        if (found) {
          addonsList.push({
            ...found,
            enabled: row.enabled,
          });
        }
      }
    }

    // The official player is available to Plus accounts, not mandatory.
    if (activeUser.level_tier >= 2) {
      const playerPreference = installedRows.find(row => row.addon_id === 'player-pro');
      const existingPlayerIndex = addonsList.findIndex(addon => addon.id === 'player-pro');
      if (existingPlayerIndex >= 0) addonsList.splice(existingPlayerIndex, 1);
      addonsList.unshift({
        id: "player-pro",
        name: "Anirium Player Pro",
        version: "1.0.0",
        description: "Player oficial opcional: reproduz playlists, áudio e legendas entregues pelo Anirium Service, além de arquivos locais e links HTTP diretos.",
        author: "Anirium Core",
        type: "official-plus",
        capabilities: [
          "ui.player.render",
          "ui.player.overlay",
          "playback.client",
          "subtitles.manage",
          "audio.manage",
        ],
        permissions: ["ui.player.render", "playback.client"],
        origin: "official",
        enabled: playerPreference ? playerPreference.enabled : true,
      });
    }

    return NextResponse.json({
      success: true,
      addons: addonsList,
      activeTheme: null,
    }, { headers: privateAddonHeaders });
  }

  // Se for para obter apenas o tema de UI ativo
  if (searchParams.get('action') === 'get_active_theme') {
    return NextResponse.json({
      success: true,
      activeTheme: null
    });
  }

  // Se for uma requisição para alterar o status do addon
  if (searchParams.get('action') === 'toggle_addon') {
    return NextResponse.json({
      success: false, reason: 'use_user_mutation_endpoint', replacement: '/api/user', action: 'toggle_addon',
    }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  }

  // Ação de Desenvolvedor (Nível 3): Simular busca com métricas de telemetria
  if (searchParams.get('action') === 'dev_inspect') {
    const titleRomaji = searchParams.get('title') || 'Sousou no Frieren';
    const titleEnglish = searchParams.get('titleEnglish') || 'Frieren: Beyond Journey\'s End';
    const episodeNumber = parseInt(searchParams.get('episode') || '1', 10);
    const seasonNumber = parseInt(searchParams.get('season') || '1', 10);

    const startTime = Date.now();
    const elapsedMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      executionTimeMs: elapsedMs,
      context: { titleRomaji, titleEnglish, episodeNumber, seasonNumber },
      sourcesCount: 0,
      activeProviders: [],
      topSources: [],
      notice: "Providers de mídia são executados exclusivamente pelo Anirium Service."
    });
  }

  // O Core não agrega fontes de mídia externas; visitantes recebem apenas o catálogo.
  const activeUser = await getRequestUser(sessionId);
  if (!activeUser) {
    return NextResponse.json({
      success: true,
      sourcesCount: 0,
      sources: [],
      notice: "Disponível apenas em canais oficiais para visitantes.",
    });
  }

  return NextResponse.json({
    success: true,
    sourcesCount: 0,
    sources: [],
    sourceRuntime: "core-official-only",
    notice: activeUser.level_tier >= 2
      ? "A reprodução Anirium+ é preparada pelo Anirium Service."
      : "Nenhum provider de mídia é executado pelo Core."
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readApiJson(request);
    const { action } = body;
    const sessionId = readWebSessionId(request);
    const requestUser = await getRequestUser(sessionId);
    if (!requestUser) return NextResponse.json({ success: false, error: 'Usuário não autenticado.' }, { status: 401 });

    // Instalar manifesto customizado pelo usuário via código JSON ou URL
    if (action === 'install_manifest') {
      // URL registration is URL-only: Core never fetches the provider manifest.
      // Invalid input is rejected before any write budget reservation.
      const cleanConfig = typeof body.manifestUrl === 'string'
        ? parseRemoteManifestConfig(body.manifestUrl)
        : parseCommunityManifest(body.manifest);
      const activeUser = requestUser;

      await requireUserWriteBudget(activeUser.id, action);
      await installUserAddon(activeUser.id, cleanConfig);

      return NextResponse.json({
        success: true,
        message: typeof body.manifestUrl === 'string'
          ? `Manifesto remoto registrado para '${cleanConfig.id}'.`
          : `Plugin '${(cleanConfig as any).name}' instalado com sucesso.`,
        manifest: cleanConfig,
      });
    }

    // Desinstalar plugin da conta do usuário
    if (action === 'uninstall_addon') {
      const { addonId } = body;
      if (typeof addonId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(addonId)) {
        throw new ApiInputError(400, 'invalid_addon_id');
      }

      const activeUser = requestUser;
      if (!activeUser) {
        return NextResponse.json({ success: false, error: 'Usuário não autenticado.' }, { status: 401 });
      }

      await requireUserWriteBudget(activeUser.id, action);
      await uninstallUserAddon(activeUser.id, addonId);

      return NextResponse.json({
        success: true,
        message: `Plugin removido com sucesso.`
      });
    }

    // Registrar manifesto externo/comunitário via URL ou JSON bruto no Addon DevStudio (Nível 3)
    if (action === 'register_manifest') {
      if (requestUser.level_tier !== 3) return NextResponse.json({ success: false, error: 'Permissão de desenvolvedor necessária.' }, { status: 403 });
      const manifest = parseCommunityManifest(body.manifest);
      await requireUserWriteBudget(requestUser.id, action);
      addonRegistry.registerExternalManifest(manifest);
      return NextResponse.json({
        success: true,
        message: `Addon '${manifest.name}' registrado com sucesso no runtime Anirium.`,
        addons: addonRegistry.getInstalledAddons()
      });
    }

    return NextResponse.json({ success: false, error: 'Ação não suportada' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof WriteBudgetExceeded) return NextResponse.json({ success: false, error: 'write_rate_limited' },
      { status: 429, headers: { 'Retry-After': String(err.retryAfter), 'Cache-Control': 'no-store' } });
    if (err instanceof ApiInputError) return NextResponse.json({ success: false, error: err.reason, message: err.publicMessage }, { status: err.status, headers: { 'Cache-Control': 'no-store' } });
    logServerFailure("sources", err);
    return NextResponse.json({ success: false, error: "Failed to process source request" }, { status: 500 });
  }
}
