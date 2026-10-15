import { encodeProfileSettings, readProfileSettings, type ProfileSettings } from "./privateProfileSettings";
import { resolveCatalogText } from "./catalogTextVariants";
import { hydrateCatalogAssets } from "./catalogAssets";
import type { PoolClient } from 'pg';
import { requireCatalogSeason, ensureReleaseEpisode } from "./catalogReleaseIdentity";
import { catalogSeasonPosition } from "./catalogSeasonPosition";
import { saveCanonicalWatchProgress } from "./canonicalWatchProgress";
import { randomBytes, randomUUID } from "node:crypto";
import { resolveGoogleAccount } from "./externalIdentity";
import { registerCanonicalAccount, backfillAccountIdentity } from "./accountIdentity";
import { encodeGoogleSubject, authenticateGoogleSubject } from "./identityLookup";
import { encodeProfile, readProfile } from "./privateProfile";
import { logServerFailure } from "./serverLog";
import { bindActivityEntity, isCanonicalEntityId, resolveActivityEntity } from "./activityEntityIndex";
import { registerAccountPlugin } from "./accountPluginIndex";
import { selectPluginRelease } from "./pluginReleaseIndex";
import { selectOfficialPluginRelease } from "./officialPluginRelease";
import { writeActivity, projectActivity, activityContext } from "./privateActivity";
import { validateWatchProgressInput, validateProfileUpdateInput, validateAddonToggleInput, ApiInputError } from "./apiInput";
import { query, queryOne, ensurePostgresSchema, withTransaction } from "./postgres";
import { WEB_SESSION_MAX_AGE_SECONDS } from "./webSession";
import { encryptPrivateJson, readStoredPrivateJson, addonPrivateContext } from "./privateData";

export type ExperienceLevel = 0 | 1 | 2 | 3;

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  level_tier: ExperienceLevel;
  badge_label: string;
  created_at: number;
  settings?: ProfileSettings;
  enabledAddons?: string[];
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: number | null;
}

export interface WatchHistoryItem {
  userId: string;
  canonicalEntityId?: string;
  seasonEntityId?: string;
  resumeAvailable: boolean;
  animeId: number | null;
  seasonIdx: number | null;
  episodeNumber: number | null;
  progressSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: number | null;
  animeTitle?: string;
  animeImage?: string;
}

export interface BookmarkItem {
  seasonEntityId?: string;
  id?: string;
  userId: string;
  entityType: "UNIVERSE" | "ARC" | "SERIES" | "SEASON" | "EPISODE";
  entityId: string;
  canonicalEntityId?: string;
  animeId: number;
  seasonIdx?: number | null;
  episodeNumber?: number | null;
  status: "watching" | "plan_to_watch" | "completed" | "dropped" | "on_hold" | null;
  score?: number;
  createdAt: number | null;
  animeTitle?: string;
  animeImage?: string;
}

// Definição canônica dos Níveis do Anirium:
// Nível 0: Visitante (não logado, canônico factual)
// Nível 1: Membro da Comunidade (logado, sem addons ativados por padrão)
// Nível 2: Anirium+ / Otaku Pro (exclusivo via compra/admin)
// Nível 3: Admin do Sistema (gestão de contas, tiers e Anirium+)
export const INITIAL_PROFILES: UserProfile[] = [
  {
    id: "user-level-0",
    username: "canon_guest",
    display_name: "Visitante Canônico",
    avatar_url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80",
    level_tier: 0,
    badge_label: "Canônico",
    created_at: 1711584000000,
    settings: {
      theme: "default",
      preferredAudio: "Japonês (Original)",
      preferredSubtitles: "Português (Brasil)",
      autoNextEpisode: false,
      telemetryHud: false,
    },
    enabledAddons: [],
  },
  {
    id: "user-level-1",
    username: "community_member",
    display_name: "Membro da Comunidade",
    avatar_url: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80",
    level_tier: 1,
    badge_label: "Membro",
    created_at: 1711584000000,
    settings: {
      theme: "default",
      preferredAudio: "Japonês (Original)",
      preferredSubtitles: "Português (Brasil)",
      autoNextEpisode: true,
      telemetryHud: false,
    },
    enabledAddons: [],
  },
  {
    id: "user-level-2",
    username: "otaku_pro",
    display_name: "Otaku Pro",
    avatar_url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80",
    level_tier: 2,
    badge_label: "Anirium+",
    created_at: 1711584000000,
    settings: {
      theme: "default",
      preferredAudio: "Japonês (Original)",
      preferredSubtitles: "Português (Brasil)",
      autoNextEpisode: true,
      autoSkipIntro: true,
      telemetryHud: true,
    },
    enabledAddons: [],
  },
  {
    id: "user-level-3",
    username: "admin_master",
    display_name: "Administrador Geral",
    avatar_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80",
    level_tier: 3,
    badge_label: "Admin",
    created_at: 1711584000000,
    settings: {
      theme: "default",
      preferredAudio: "Japonês (Original)",
      preferredSubtitles: "Português (Brasil)",
      autoNextEpisode: true,
      autoSkipIntro: true,
      telemetryHud: true,
    },
    enabledAddons: [],
  },
];

function profileFromRow(row: any, addons: { addon_id: string; enabled: boolean }[], tier = Number(row.level_tier), badge = row.badge_label): UserProfile {
  if (addons.some(addon => typeof addon.enabled !== "boolean")) throw new Error("Addon enabled requires schema migration");
  const identity = readProfile(row);
  return {
    id: row.id, username: row.username, display_name: identity.displayName, avatar_url: identity.avatarUrl,
    level_tier: tier as ExperienceLevel, badge_label: badge, created_at: Number(row.created_at),
    settings: readProfileSettings(row.id, row.settings_json),
    enabledAddons: [...addons.filter(addon => addon.enabled === true).map(addon => addon.addon_id),
      ...(tier >= 2 && !addons.some(addon => addon.addon_id === 'player-pro') ? ['player-pro'] : [])],
    subscriptionPlan: row.subscription_plan || (tier === 3 ? "admin_unlimited" : null),
    subscriptionExpiresAt: row.subscription_expires_at ? Number(row.subscription_expires_at) : null,
  };
}

let profilesInitialized = false;

// Garante que os perfis padrão existam no banco de dados PostgreSQL
export async function ensureDefaultProfiles(): Promise<void> {
  await ensurePostgresSchema();
  if (profilesInitialized) return;

  try {
    const existing = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM users");
    if (existing && parseInt(existing.count, 10) === 0 && process.env.NODE_ENV !== "production") {
      for (const p of INITIAL_PROFILES) {
        await query(
          `INSERT INTO users (id, username, display_name, avatar_url, level_tier, badge_label, created_at, settings_json, profile_private)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            p.id,
            p.username,
            "Conta",
            "",
            p.level_tier,
            p.badge_label,
            p.created_at,
            JSON.stringify(encodeProfileSettings(p.id, p.settings || {})),
            JSON.stringify(encodeProfile(p.id, p.display_name, p.avatar_url)),
          ]
        );

        await backfillAccountIdentity(p.id);
        if (p.enabledAddons) {
          for (const addonId of p.enabledAddons) {
            await query(
              `INSERT INTO user_addons (user_id, addon_id, enabled, installed_at)
               VALUES ($1, $2, TRUE, $3)
               ON CONFLICT (user_id, addon_id) DO NOTHING`,
              [p.id, addonId, Date.now()]
            );
          }
        }
      }

    }
    profilesInitialized = true;
  } catch (err) {
    logServerFailure("user", err);
  }
}

// Obter a lista de todos os perfis disponíveis
export async function getAllProfiles(): Promise<UserProfile[]> {
  await ensureDefaultProfiles();
  try {
    const rows = await query<any>("SELECT * FROM users ORDER BY level_tier ASC");
    const profiles: UserProfile[] = [];

    for (const r of rows) {
      const addonRows = await query<{ addon_id: string; enabled: boolean }>(
        "SELECT addon_id, enabled FROM user_addons WHERE user_id = $1",
        [r.id]
      );
      profiles.push(profileFromRow(r, addonRows));
    }

    return profiles;
  } catch (err) {
    console.error("[UserProfiles] Perfis indisponíveis.");
    throw new Error("Profiles unavailable");
  }
}

// Obter o usuário atualmente ativo na sessão (retorna null se não estiver logado)
export async function getActiveUserProfile(fallbackToDefault: boolean = false, sessionId: string = "current"): Promise<UserProfile | null> {
  await ensureDefaultProfiles();
  const allowDemoFallback = fallbackToDefault && process.env.NODE_ENV !== "production";
  try {
    const session = await queryOne<{ user_id: string }>(
      "SELECT user_id FROM active_session WHERE key = $1 AND updated_at > $2",
      [sessionId, Date.now() - WEB_SESSION_MAX_AGE_SECONDS * 1000]
    );
    
    if (!session || !session.user_id) {
      if (allowDemoFallback) {
        return INITIAL_PROFILES[2];
      }
      return null;
    }

    const targetUserId = session.user_id;
    const userRow = await queryOne<any>("SELECT * FROM users WHERE id = $1", [targetUserId]);
    if (!userRow) {
      return allowDemoFallback ? INITIAL_PROFILES[2] : null;
    }

    let userTier = Number(userRow.level_tier) as ExperienceLevel;
    let badgeLabel = userRow.badge_label;
    const subPlan = userRow.subscription_plan || null;
    const subExpiresAt = userRow.subscription_expires_at ? Number(userRow.subscription_expires_at) : null;

    let isExpired = false;
    if (userTier === 2 && subPlan === "open_beta" && process.env.ANIRIUM_OPEN_BETA !== "true") {
      userTier = 1;
      badgeLabel = "Membro";
    }
    // Se o usuário possui assinatura com prazo (ex: Trial de 1 dia, 1 mês, etc.) e já expirou:
    if (userTier === 2 && subExpiresAt && Date.now() > subExpiresAt) {
      userTier = 1;
      badgeLabel = "Membro";
      isExpired = true;
      await query(
        `UPDATE users
         SET level_tier = 1, badge_label = 'Membro'
         WHERE id = $1`,
        [userRow.id]
      );
    }

    const addonRows = await query<{ addon_id: string; enabled: boolean }>(
      "SELECT addon_id, enabled FROM user_addons WHERE user_id = $1",
      [userRow.id]
    );

    return profileFromRow(userRow, addonRows, userTier, badgeLabel);
  } catch (err) {
    console.error("[UserProfiles] Perfil ativo indisponível.");
    throw new Error("Profile unavailable");
  }
}

// Deslogar / encerrar sessão ativa
export async function clearActiveUserProfile(sessionId: string = "current"): Promise<void> {
  await ensureDefaultProfiles();
  try {
    await query("DELETE FROM active_session WHERE key = $1", [sessionId]);
  } catch (err) {
    logServerFailure("user", err);
    throw err;
  }
}

// Alternar o usuário ativo pelo ID ou pelo nível (0, 1, 2, 3)
export async function setActiveUserProfile(userIdOrLevel: string | number, sessionId: string = "current"): Promise<UserProfile | null> {
  await ensureDefaultProfiles();
  try {
    let targetUserId = "";
    if (typeof userIdOrLevel === "number") {
      const match = await queryOne<{ id: string }>(
        "SELECT id FROM users WHERE level_tier = $1 LIMIT 1",
        [userIdOrLevel]
      );
      targetUserId = match?.id || `user-level-${userIdOrLevel}`;
    } else {
      targetUserId = userIdOrLevel;
    }

    await query(
      `INSERT INTO active_session (key, user_id, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = EXCLUDED.updated_at`,
      [sessionId, targetUserId, Date.now()]
    );

    return await getActiveUserProfile(true, sessionId);
  } catch (err) {
    logServerFailure("user", err);
    return await getActiveUserProfile(true, sessionId);
  }
}

// Salvar telemetria granular por episódio e status no PostgreSQL (Exclusivo Anirium+ L2+)
export async function saveWatchProgress(
  userId: string,
  animeId: number,
  seasonIdx: number,
  episodeNumber: number,
  progressSeconds: number,
  durationSeconds: number,
  expectedSeasonEntityId: string
): Promise<void> {
  validateWatchProgressInput({ animeId, seasonIdx, episode: episodeNumber, progressSeconds, durationSeconds, seasonEntityId: expectedSeasonEntityId });
  await ensureDefaultProfiles();
  try {
    await withTransaction(async client => {
      const transactionQueryOne = async <T = any>(sql: string, parameters: any[]): Promise<T | null> => (await client.query(sql, parameters)).rows[0] ?? null;
    // Exclusividade Anirium+: Se a assinatura estiver suspensa ou for nível 0/1, o sistema não grava
    const userRow = await transactionQueryOne<{ level_tier: number; subscription_expires_at: any }>(
      "SELECT level_tier, subscription_expires_at FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    if (!userRow) return;
    const tier = Number(userRow.level_tier);
    const expiresAt = userRow.subscription_expires_at ? Number(userRow.subscription_expires_at) : null;
    if (tier < 2 || (tier === 2 && expiresAt && Date.now() > expiresAt)) {
      // Suspenso ou sem Anirium+: o sistema passa a apenas não funcionar/persistir
      return;
    }

    await saveCanonicalWatchProgress(client,userId,animeId,expectedSeasonEntityId,episodeNumber,progressSeconds,durationSeconds);
    });
  } catch (err) {
    if (err instanceof ApiInputError) throw err;
    throw new Error("Failed to persist watch progress");
  }
}

// Buscar lista de itens "Continuar Assistindo" com metadados do anime diretamente no PostgreSQL
export async function getWatchHistory(userId: string): Promise<WatchHistoryItem[]> {
  await ensureDefaultProfiles();
  try {
    const eligible: any[] = [];
    let cursorTime: string | null = null, cursorId: string | null = null;
    while (eligible.length < 12) {
    const rows: any[] = await query<any>(
      `SELECT 
        s.id, COALESCE(s.updated_at,TIMESTAMPTZ '1970-01-01')::text as cursor_time, s.user_id,
        a.mal_id as anime_id,
        s.season_idx,
        membership.display_order AS episode_number,
        s.entity_type, s.entity_id, s.canonical_entity_id, s.activity_private, s.watched_seconds, s.total_seconds,
        s.completed,
        EXTRACT(EPOCH FROM s.updated_at) * 1000 as updated_at,
        a.text_variants_json AS catalog_text_variants,
        COALESCE(a.composition_season_id,a.canonical_entity_id) AS catalog_asset_entity_id,
        a.banner_image, a.seasons_json, a.composition_seasons_json, a.composition_season_id,
        membership.parent_id AS canonical_season_id
      FROM user_entity_status s
      LEFT JOIN canonical_memberships membership ON membership.child_id=s.canonical_entity_id AND membership.parent_kind='SEASON' AND membership.child_kind='EPISODE'
      LEFT JOIN canonical_memberships release_work ON release_work.child_id=membership.parent_id AND release_work.parent_kind='WORK' AND release_work.child_kind='SEASON'
      LEFT JOIN LATERAL (SELECT c.* FROM anime_catalog c WHERE c.composition_work_id=release_work.parent_id
        AND EXISTS (SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(c.composition_seasons_json)='object' THEN c.composition_seasons_json ELSE '{}'::jsonb END) mapping WHERE mapping.value=membership.parent_id)
        ORDER BY (c.mal_id=s.parent_series_id) DESC NULLS LAST,c.mal_id LIMIT 1) a ON TRUE
      WHERE s.user_id = $1 
        AND s.entity_type = 'EPISODE' 
        AND s.canonical_entity_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM user_entity_status newer WHERE newer.user_id=s.user_id AND newer.entity_type='EPISODE'
            AND newer.canonical_entity_id=s.canonical_entity_id
            AND (COALESCE(newer.updated_at,TIMESTAMPTZ '1970-01-01'),newer.id)>(COALESCE(s.updated_at,TIMESTAMPTZ '1970-01-01'),s.id)
        )
        AND s.completed = FALSE 
        AND ($2::timestamptz IS NULL OR (COALESCE(s.updated_at,TIMESTAMPTZ '1970-01-01'),s.id) < ($2::timestamptz,$3::uuid))
      ORDER BY COALESCE(s.updated_at,TIMESTAMPTZ '1970-01-01') DESC, s.id DESC LIMIT 100`,
      [userId,cursorTime,cursorId]
    );

    for (const row of rows) {
      const projected = projectActivity(row);
      if (Number(projected.watched_seconds) > 10) eligible.push(projected);
      if (eligible.length === 12) break;
    }
    if (rows.length < 100) break;
    const last: any = rows.at(-1)!;
    cursorTime = last.cursor_time; cursorId = last.id;
    }
    return (await withTransaction(client=>hydrateCatalogAssets(client,eligible))).map((r) => {
      const currentSeasonIdx = r.canonical_season_id ? catalogSeasonPosition(r.canonical_season_id,r.composition_seasons_json,r.seasons_json,r.composition_season_id) ?? null : null;
      const animeId = r.anime_id == null ? null : Number(r.anime_id);
      const episodeNumber = r.episode_number == null ? null : Number(r.episode_number);
      const resumeAvailable = Number.isSafeInteger(animeId) && animeId! > 0 && Number.isSafeInteger(episodeNumber) && episodeNumber! > 0 && currentSeasonIdx !== null;
      let image = r.resolved_banner_image;
      if (!image && r.resolved_images_json) {
        try {
          const parsed = r.resolved_images_json;
          image = parsed.webp?.large_image_url || parsed.jpg?.large_image_url || parsed.webp?.image_url || parsed.jpg?.image_url || parsed.webp?.small_image_url || parsed.jpg?.small_image_url;
        } catch {}
      }

      return {
        userId: r.user_id,
        animeId,
        canonicalEntityId: r.canonical_entity_id ?? undefined,
        seasonIdx: currentSeasonIdx,
        seasonEntityId: r.canonical_season_id ?? undefined,
        resumeAvailable,
        episodeNumber,
        progressSeconds: Number(r.watched_seconds) || 0,
        durationSeconds: Number(r.total_seconds) || 0,
        completed: Boolean(r.completed),
        updatedAt: r.updated_at == null ? null : Number(r.updated_at),
        animeTitle: resolveCatalogText(r.catalog_text_variants,"title",["pt-br","pt","en","und","ja"],["default","native"]) ?? "",
        animeImage: image,
      };
    });
  } catch (err) {
    throw new Error("Failed to load watch history");
  }
}

// Remoção idempotente: não cria registros nem altera progresso ou opinião.
export async function removeEntityBookmark(userId: string, entityType: "UNIVERSE" | "ARC" | "SERIES" | "SEASON" | "EPISODE", entityId: string): Promise<void> {
  if (!['UNIVERSE','ARC','SERIES','SEASON','EPISODE'].includes(entityType) || !isCanonicalEntityId(entityId)) throw new ApiInputError(400,"invalid_bookmark_release");
  await query(`UPDATE user_entity_status SET is_favorite = FALSE
    WHERE user_id = $1 AND entity_type = $2 AND canonical_entity_id = $3 AND is_favorite = TRUE`,
    [userId, entityType, entityId]);
}

// Alternar favorito por identidade canônica de conteúdo - Exclusivo Anirium+ L2+
export async function toggleEntityBookmark(
  userId: string,
  entityType: "UNIVERSE" | "ARC" | "SERIES" | "SEASON" | "EPISODE",
  entityId: string,
  parentSeriesId?: number,
  seasonIdx?: number,
  episodeNumber?: number,
  seasonEntityId?: string
): Promise<boolean> {
  if (!['UNIVERSE','ARC','SERIES','SEASON','EPISODE'].includes(entityType) || !isCanonicalEntityId(entityId)) throw new ApiInputError(400,"invalid_bookmark_release");
  if (entityType==='ARC' && [parentSeriesId,seasonIdx,episodeNumber,seasonEntityId].some(value=>value!=null)) throw new ApiInputError(400,'invalid_bookmark_release');
  if (seasonEntityId!==undefined && (seasonEntityId!==entityId || !['EPISODE','SEASON'].includes(entityType) || !Number.isSafeInteger(parentSeriesId) || !parentSeriesId || (entityType==='EPISODE' && (!Number.isSafeInteger(episodeNumber) || !episodeNumber || episodeNumber<1)))) throw new ApiInputError(400,"invalid_bookmark_release");
  for (const [field,value] of Object.entries({parentSeriesId,seasonIdx,episodeNumber})) {
    if (value != null && (!Number.isSafeInteger(value) || value < (field === "seasonIdx" ? 0 : 1) || value > 2147483647)) throw new ApiInputError(400,"activity_identity_conflict");
  }
  await ensureDefaultProfiles();
  try {
    return await withTransaction(async client => {
    const transactionQueryOne = async <T = any>(sql: string, parameters: any[]): Promise<T | null> => (await client.query(sql,parameters)).rows[0] ?? null;
    // Exclusividade Anirium+: Se a assinatura estiver suspensa ou for nível 0/1, o sistema não favorita
    const userRow = await transactionQueryOne<{ level_tier: number; subscription_expires_at: any }>(
      "SELECT level_tier, subscription_expires_at FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    if (!userRow) return false;
    const tier = Number(userRow.level_tier);
    const expiresAt = userRow.subscription_expires_at ? Number(userRow.subscription_expires_at) : null;
    if (tier < 2 || (tier === 2 && expiresAt && Date.now() > expiresAt)) {
      // Suspenso ou sem Anirium+: o sistema passa a apenas não funcionar/persistir
      return false;
    }

    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('anirium:catalog:hierarchy',0))");
    if (seasonEntityId) {
      await requireCatalogSeason(client,parentSeriesId!,seasonEntityId);
      entityId=entityType==='SEASON' ? seasonEntityId : await ensureReleaseEpisode(client,seasonEntityId,episodeNumber!);
    }
    const requestedCanonical=await resolveActivityEntity(client,entityType,entityId);
    if (requestedCanonical && ['EPISODE','SEASON'].includes(entityType) && parentSeriesId && !seasonEntityId) {
      const releaseId=entityType==='SEASON' ? requestedCanonical : (await client.query("SELECT parent_id FROM canonical_memberships WHERE child_id=$1 AND parent_kind='SEASON'",[requestedCanonical])).rows[0]?.parent_id;
      if (!releaseId) throw new ApiInputError(409,"stale_release_identity");
      await requireCatalogSeason(client,parentSeriesId,releaseId);
    }
    const existing = await transactionQueryOne<any>(`SELECT id,entity_id,canonical_entity_id,is_favorite FROM user_entity_status
      WHERE user_id=$1 AND entity_type=$2 AND canonical_entity_id=$3
        AND (entity_type <> 'SERIES' OR release_entity_id IS NULL)
      ORDER BY updated_at DESC NULLS LAST,id DESC LIMIT 1 FOR UPDATE`,[userId,entityType,requestedCanonical]);

    if (existing) entityId=existing.entity_id;
    if (existing && existing.is_favorite) {
      // Remove o favorito sem apagar o progresso de assistir se houver
      await client.query(
        `UPDATE user_entity_status 
         SET is_favorite = FALSE, updated_at = NOW()
         WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3`,
        [userId, entityType, entityId]
      );
      return false;
    } else if (existing) {
      await client.query(
        `UPDATE user_entity_status 
         SET is_favorite = TRUE, updated_at = NOW()
         WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3`,
        [userId, entityType, entityId]
      );
      return true;
    } else {
      await client.query(
        `INSERT INTO user_entity_status (
          user_id, entity_type, entity_id, parent_series_id, season_idx, episode_number, status, is_favorite, created_at, updated_at, activity_private,canonical_entity_id
        ) VALUES ($1, $2, $3, $4, $5, $6, 'plan_to_watch', TRUE, NOW(), NOW(), $7,$8)`,
        [
          userId,
          entityType,
          entityId,
          parentSeriesId ?? null,
          seasonIdx ?? null,
          episodeNumber ?? null,
          JSON.stringify(encryptPrivateJson({}, activityContext({user_id:userId, entity_type:entityType, entity_id:entityId}))),
          entityType==='ARC'?requestedCanonical:null,
        ]
      );
      await bindActivityEntity(client,userId,entityType,entityId);
      return true;
    }
    });
  } catch (err) {
    if (err instanceof ApiInputError) throw err;
    logServerFailure("user", err);
    return false;
  }
}

// Obter lista de IDs favoritados pelo usuário (exclusivamente onde is_favorite = TRUE)
export async function getUserBookmarks(userId: string, strict = false): Promise<number[]> {
  await ensureDefaultProfiles();
  try {
    const rows = await query<{ anime_id: number }>(
      `SELECT DISTINCT a.mal_id AS anime_id FROM user_entity_status s
       JOIN LATERAL (SELECT c.mal_id FROM anime_catalog c WHERE c.composition_work_id=s.canonical_entity_id
         ORDER BY (c.mal_id=s.parent_series_id) DESC NULLS LAST,c.mal_id LIMIT 1) a ON TRUE
       WHERE s.user_id=$1 AND s.entity_type='SERIES' AND s.canonical_entity_id IS NOT NULL
         AND s.release_entity_id IS NULL AND s.is_favorite=TRUE
         AND NOT EXISTS (SELECT 1 FROM user_entity_status newer WHERE newer.user_id=s.user_id
           AND newer.entity_type='SERIES' AND newer.canonical_entity_id=s.canonical_entity_id AND newer.release_entity_id IS NULL
           AND (COALESCE(newer.updated_at,TIMESTAMPTZ '1970-01-01'),newer.id)>(COALESCE(s.updated_at,TIMESTAMPTZ '1970-01-01'),s.id))
       ORDER BY anime_id`,
      [userId]
    );
    return rows.map((r) => r.anime_id);
  } catch (err) {
    logServerFailure("user", err);
    if (strict) throw err;
    return [];
  }
}

// Ler favoritos pelas identidades canônicas e informações próprias das entidades.
export async function getBookmarkItems(userId: string, filterDegree?: string): Promise<BookmarkItem[]> {
  await ensureDefaultProfiles();
  try {
    let queryStr = `
      SELECT 
        s.id,
        s.user_id,
        s.entity_type,
        s.entity_id,
        s.canonical_entity_id,
        CASE WHEN s.entity_type='SEASON' THEN s.canonical_entity_id ELSE ep.parent_id END AS season_entity_id,
        a.mal_id as anime_id,
        s.season_idx,
        CASE WHEN s.entity_type='EPISODE' THEN ep.display_order ELSE s.episode_number END AS episode_number,
        s.status,
        s.activity_private, s.user_score,
        EXTRACT(EPOCH FROM s.created_at) * 1000 as created_at,
        a.text_variants_json AS catalog_text_variants,
        own.variants AS own_entity_texts,
        a.seasons_json AS bookmark_seasons,
        a.composition_seasons_json AS bookmark_season_ids,
        a.composition_season_id AS bookmark_root_season,
        COALESCE(a.composition_season_id,a.canonical_entity_id) AS catalog_asset_entity_id,
        a.banner_image
      FROM user_entity_status s
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('field',field,'locale',locale,'form',form,'sourceKey',source_key,'value',value)
        ORDER BY field,locale,form,source_key) AS variants FROM canonical_text_variants
        WHERE entity_id=s.canonical_entity_id AND field='title') own ON TRUE
      LEFT JOIN canonical_memberships ep ON ep.child_id=s.canonical_entity_id AND ep.parent_kind='SEASON' AND ep.child_kind='EPISODE'
      LEFT JOIN canonical_memberships release_work ON release_work.child_id=CASE WHEN s.entity_type='SEASON' THEN s.canonical_entity_id ELSE ep.parent_id END
        AND release_work.parent_kind='WORK' AND release_work.child_kind='SEASON'
      LEFT JOIN LATERAL (SELECT c.* FROM anime_catalog c WHERE
        (s.entity_type IN ('EPISODE','SEASON') AND c.composition_work_id=release_work.parent_id
          AND EXISTS (SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(c.composition_seasons_json)='object' THEN c.composition_seasons_json ELSE '{}'::jsonb END) mapping
            WHERE mapping.value=release_work.child_id))
        OR (s.entity_type='SERIES' AND c.composition_work_id=s.canonical_entity_id)
        ORDER BY (c.mal_id=s.parent_series_id) DESC NULLS LAST,c.mal_id LIMIT 1) a ON TRUE
      WHERE s.user_id = $1 
        AND s.is_favorite = TRUE
        AND s.canonical_entity_id IS NOT NULL
        AND (s.entity_type <> 'SERIES' OR s.release_entity_id IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM user_entity_status newer WHERE newer.user_id=s.user_id AND newer.entity_type=s.entity_type
            AND newer.canonical_entity_id=s.canonical_entity_id
            AND (newer.entity_type <> 'SERIES' OR newer.release_entity_id IS NULL)
            AND (COALESCE(newer.updated_at,TIMESTAMPTZ '1970-01-01'),newer.id)>(COALESCE(s.updated_at,TIMESTAMPTZ '1970-01-01'),s.id)
        )
    `;
    const params: any[] = [userId];

    if (filterDegree && filterDegree !== "ALL") {
      params.push(filterDegree);
      queryStr += ` AND s.entity_type = $2`;
    }

    queryStr += ` ORDER BY s.updated_at DESC`;

    const rows = await query<any>(queryStr, params);

    return (await withTransaction(client=>hydrateCatalogAssets(client,rows))).map(projectActivity).map((r) => {
      const numeric = (value: unknown): number | null => {
        if (typeof value !== "number" && !(typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))) return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
      };
      const index = (value: unknown, minimum: number): number | undefined => {
        const number = numeric(value);
        return number !== null && Number.isSafeInteger(number) && number >= minimum && number <= 2147483647 ? number : undefined;
      };
      let season = index(r.season_idx, 0);
      if (r.season_entity_id) {
        season = catalogSeasonPosition(r.season_entity_id,r.bookmark_season_ids,r.bookmark_seasons,r.bookmark_root_season);
      }
      const episode = index(r.episode_number, 1);
      const score = numeric(r.user_score);
      const createdAt = numeric(r.created_at);
      let image = r.resolved_banner_image;
      if (!image && r.resolved_images_json) {
        try {
          const parsed = r.resolved_images_json;
          image = parsed.webp?.large_image_url || parsed.jpg?.large_image_url || parsed.webp?.image_url || parsed.jpg?.image_url || parsed.webp?.small_image_url || parsed.jpg?.small_image_url;
        } catch {}
      }

      let displayTitle = resolveCatalogText(r.own_entity_texts,"title",["pt-br","pt","en","und","ja"],["default","native","full"])
        ?? resolveCatalogText(r.catalog_text_variants,"title",["pt-br","pt","en","und","ja"],["default","native"]) ?? "";
      if (r.entity_type === "EPISODE" && episode !== undefined) {
        displayTitle = `${displayTitle} • Ep. ${episode}`;
      } else if (r.entity_type === "SEASON" && season !== undefined) {
        displayTitle = `${displayTitle} • T#${season + 1}`;
      }

      return {
        id: r.id,
        userId: r.user_id,
        entityType: r.entity_type,
        entityId: r.canonical_entity_id,
        canonicalEntityId: r.canonical_entity_id ?? undefined,
        seasonEntityId: r.season_entity_id ?? undefined,
        animeId: index(r.anime_id, 1) ?? 0,
        seasonIdx: season,
        episodeNumber: episode,
        status: ["watching", "plan_to_watch", "completed", "dropped", "on_hold"].includes(r.status) ? r.status : null,
        score: score !== null && score >= 0 && score <= 10 ? score : undefined,
        createdAt: createdAt !== null && createdAt >= 0 ? createdAt : null,
        animeTitle: displayTitle,
        animeImage: image,
      };
    });
  } catch (err) {
    throw new Error("Failed to load bookmarks");
  }
}

// The official Player preference remains usable even at the community limit.
export const MAX_USER_ADDONS = 50;
async function requireAddonSlot(client: PoolClient, userId: string, addonId: string) {
  const owner = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
  if (!owner.rows.length) throw new ApiInputError(404, 'addon_owner_unavailable');
  const state = await client.query<{ count: number; existing: boolean }>(
    "SELECT COUNT(*) FILTER (WHERE addon_id <> 'player-pro')::integer AS count, BOOL_OR(addon_id=$2) AS existing FROM user_addons WHERE user_id=$1",
    [userId, addonId]);
  if (addonId !== 'player-pro' && !state.rows[0].existing && state.rows[0].count >= MAX_USER_ADDONS) {
    throw new ApiInputError(409, 'addon_install_limit');
  }
}

// Alternar status de um addon para o usuário
export async function toggleUserAddon(userId: string, addonId: string, enabled: boolean): Promise<void> {
  validateAddonToggleInput({ addonId, enabled });
  await ensureDefaultProfiles();
  try {
    await withTransaction(async client => {
      await requireAddonSlot(client, userId, addonId);
      await client.query(
      `INSERT INTO user_addons (user_id, addon_id, enabled, installed_at, config_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, addon_id) DO UPDATE SET
         enabled = EXCLUDED.enabled`,
      [userId, addonId, enabled, Date.now(), JSON.stringify(encryptPrivateJson({}, addonPrivateContext(userId, addonId)))]
      );
      const pluginId = await registerAccountPlugin(client,userId,addonId);
      await selectOfficialPluginRelease(client,userId,addonId,pluginId);
    });
  } catch (err) {
    if (err instanceof ApiInputError) throw err;
    logServerFailure('user', err);
    throw new Error("Addon persistence unavailable");
  }
}

// Instalar addon/manifesto customizado para o usuário
export async function installUserAddon(userId: string, manifest: any): Promise<void> {
  if (!manifest || typeof manifest.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(manifest.id)) {
    throw new ApiInputError(400, 'invalid_addon_id');
  }
  if (manifest.id.toLowerCase() === 'player-pro') throw new ApiInputError(400,'reserved_addon_id');
  await ensureDefaultProfiles();
  try {
    await withTransaction(async client => {
      await requireAddonSlot(client, userId, manifest.id);
      await client.query(
      `INSERT INTO user_addons (user_id, addon_id, enabled, installed_at, config_json)
       VALUES ($1, $2, TRUE, $3, $4)
       ON CONFLICT (user_id, addon_id) DO UPDATE SET
         enabled = TRUE,
         config_json = EXCLUDED.config_json`,
      [userId, manifest.id, Date.now(), JSON.stringify(encryptPrivateJson(manifest, addonPrivateContext(userId, manifest.id)))]
      );
      const pluginId = await registerAccountPlugin(client,userId,manifest.id);
      await selectPluginRelease(client,userId,pluginId,manifest);
    });
  } catch (err) {
    if (err instanceof ApiInputError) throw err;
    logServerFailure('user', err);
    throw new Error("Addon persistence unavailable");
  }
}

// Desinstalar addon do usuário
export async function uninstallUserAddon(userId: string, addonId: string): Promise<void> {
  await ensureDefaultProfiles();
  try {
    await query(
      `DELETE FROM user_addons WHERE user_id = $1 AND addon_id = $2`,
      [userId, addonId]
    );
  } catch (err) {
    logServerFailure("user", err);
    throw err;
  }
}

// Obter todos os addons instalados pelo usuário
export async function getUserInstalledAddons(userId: string): Promise<any[]> {
  await ensureDefaultProfiles();
  try {
    const rows = await query<{ addon_id: string; enabled: boolean; canonical_plugin_id: string | null; config_json: any }>(
      "SELECT a.addon_id, a.enabled, a.canonical_plugin_id, a.selected_release_id, r.version AS selected_version, r.source_kind AS selected_source_kind, a.config_json FROM user_addons a LEFT JOIN canonical_plugin_releases r ON r.id=a.selected_release_id WHERE a.user_id = $1 ORDER BY a.installed_at DESC",
      [userId]
    );
    return rows.map(row => {
      if (typeof row.enabled !== "boolean") throw new Error("Addon enabled requires schema migration");
      return ({ ...row, config_json: readStoredPrivateJson(row.config_json, addonPrivateContext(userId, row.addon_id)) });
    });
  } catch (err) {
    console.error("[UserProfiles] Configuração de addon indisponível.");
    throw new Error("Addon configuration unavailable");
  }
}

// Atualizar dados de perfil do usuário ativo (nome, avatar, configurações)
export async function updateUserProfile(
  userId: string,
  updates: {
    display_name?: string;
    avatar_url?: string;
    settings?: Partial<UserProfile["settings"]>;
  }
): Promise<UserProfile> {
  validateProfileUpdateInput({ displayName: updates.display_name, avatarUrl: updates.avatar_url, settings: updates.settings });
  await ensureDefaultProfiles();
  try {
    return await withTransaction(async client => {
    const current = (await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
    if (!current) {
      throw new Error("Profile unavailable");
    }

    const identity = readProfile(current);
    const newDisplayName = updates.display_name !== undefined ? updates.display_name : identity.displayName;
    const newAvatarUrl = updates.avatar_url !== undefined ? updates.avatar_url : identity.avatarUrl;
    
    const currentSettings = readProfileSettings(userId, current.settings_json);

    const newSettings = updates.settings ? { ...currentSettings, ...updates.settings } : currentSettings;

    const updated = (await client.query(
      `UPDATE users 
       SET display_name = 'Conta', avatar_url = '', settings_json = $1, profile_private = $2
       WHERE id = $3 RETURNING *`,
      [JSON.stringify(encodeProfileSettings(userId, newSettings)), JSON.stringify(encodeProfile(userId, newDisplayName, newAvatarUrl)), userId]
    )).rows[0];
    if (!updated) throw new Error("Profile unavailable");
    const addons = (await client.query("SELECT addon_id, enabled FROM user_addons WHERE user_id = $1", [userId])).rows;
    return profileFromRow(updated, addons);
    });
  } catch (err) {
    console.error("[UserProfiles] Falha ao atualizar perfil.");
    throw new Error("Profile update unavailable");
  }
}

// Criar ou atualizar perfil de usuário autenticado via Google OAuth
export async function upsertGoogleUserProfile(params: {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string;
}, sessionId: string = "current"): Promise<UserProfile> {
  await ensureDefaultProfiles();
  const avatarUrl = params.avatarUrl || "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80";
  validateProfileUpdateInput({ displayName: params.name || "Conta", avatarUrl });
  const isAdmin = params.email.toLowerCase() === "santoss.cog@gmail.com" || params.email.toLowerCase() === "dnleventos@gmail.com";
  const initialTier = isAdmin ? 3 : 1;
  const initialBadge = isAdmin ? "Admin" : "Membro";
  const defaultSettings = { theme: "default", preferredAudio: "Japonês (Original)", preferredSubtitles: "Português (Brasil)", autoNextEpisode: true, autoSkipIntro: false, telemetryHud: false };
  const userId = await resolveGoogleAccount(params.googleId, async client => {
    const id = randomUUID(), username = `user_${randomBytes(12).toString("hex")}`;
    await client.query(`INSERT INTO users(id,username,display_name,avatar_url,level_tier,badge_label,created_at,settings_json,profile_private,google_subject_private)
      VALUES($1,$2,'Conta','',$3,$4,$5,$6,$7,$8)`, [id,username,initialTier,initialBadge,Date.now(),
      JSON.stringify(encodeProfileSettings(id,defaultSettings)),
      JSON.stringify(encodeProfile(id,params.name || username,avatarUrl)),JSON.stringify(encodeGoogleSubject(id,params.googleId))]);
    return id;
  }, async (client, resolvedId) => {
    const current = (await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [resolvedId])).rows[0];
    if (!current) throw new Error("Authenticated profile unavailable");
    authenticateGoogleSubject(current,params.googleId);
    // Authenticate existing data before refreshing identity metadata.
    readProfile(current);
    readProfileSettings(resolvedId, current.settings_json);
    await registerCanonicalAccount(client,resolvedId);
    await client.query("UPDATE users SET display_name='Conta',avatar_url='',profile_private=$2,google_subject_private=$3 WHERE id=$1",
      [resolvedId,JSON.stringify(encodeProfile(resolvedId,params.name || current.username,avatarUrl)),JSON.stringify(encodeGoogleSubject(resolvedId,params.googleId))]);
    await client.query(`INSERT INTO active_session(key,user_id,updated_at) VALUES($1,$2,$3)
      ON CONFLICT(key) DO UPDATE SET user_id=EXCLUDED.user_id,updated_at=EXCLUDED.updated_at`,
      [sessionId,resolvedId,Date.now()]);
  });

  const profile = await getActiveUserProfile(false, sessionId);
  if (!profile || profile.id !== userId) throw new Error("Authenticated profile unavailable");
  return profile;
}
