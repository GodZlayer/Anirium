import { logServerFailure } from "./serverLog";
import { Pool, type PoolClient } from "pg";
import { openSync, fstatSync, readSync, closeSync, constants } from "node:fs";
import { isAbsolute } from "node:path";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { createHash } from "node:crypto";
import { entitySchemaSQL } from "./entitySchema";
import { ensureBlackTheme } from "./themeIndex";

// Credentials belong to deployment configuration, never to a source fallback.
let configurationError: string | null = null;
function databaseTransport() {
  try {
    const value = process.env.DATABASE_URL;
    if (!value?.trim()) throw new Error("Database configuration unavailable");
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || /[%/\\]/.test(url.hostname) || url.pathname.length < 2) throw new Error();
    // pg parses URL options after explicit config and could overwrite ssl/host.
    const allowed = new Set(["application_name", "connect_timeout"]);
    for (const key of url.searchParams.keys()) {
      if (key === "sslmode" && url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === "verify-full") continue;
      if (!allowed.has(key)) throw new Error();
    }
    url.searchParams.delete("sslmode");
    const policy = process.env.ANIRIUM_DB_TLS;
    if (policy && policy !== "required") throw new Error();
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const useTls = !loopback || policy === "required" || new URL(value).searchParams.has("sslmode");
    let ca: string | undefined;
    const caPath = process.env.ANIRIUM_DB_CA_FILE;
    if (caPath) {
      if (!useTls || !isAbsolute(caPath)) throw new Error();
      const fd = openSync(caPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      try {
        const info = fstatSync(fd);
        if (!info.isFile() || info.size === 0 || info.size > 65536) throw new Error();
        const bytes = Buffer.alloc(65537);
        let used = 0;
        while (used < bytes.length) {
          const count = readSync(fd, bytes, used, bytes.length-used, null);
          if (count === 0) break;
          used += count;
        }
        if (used === 0 || used > 65536) throw new Error();
        ca = bytes.subarray(0,used).toString("utf8");
      } finally { closeSync(fd); }
      if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error();
    }
    const expectedHost = url.hostname.replace(/^\[|\]$/g, "");
    return { connectionString: url.toString(), ssl: useTls ? { rejectUnauthorized: true, minVersion: "TLSv1.2" as const,
      checkServerIdentity: (_hostname: string, certificate: PeerCertificate) => checkServerIdentity(expectedHost, certificate), ...(ca ? { ca } : {}) } : false,
      enableChannelBinding: true, sslnegotiation: "postgres" as const };
  } catch (error) {
    configurationError = error instanceof Error && error.message === "Database configuration unavailable" ? error.message : "Database configuration invalid";
    // Builds may import this module. Access guards fail before any socket opens.
    return {};
  }
}
const transport = databaseTransport();
const operationLimits = { statement_timeout: 10000, lock_timeout: 3000, idle_in_transaction_session_timeout: 10000, query_timeout: 15000 };

function requireDatabaseConfiguration() {
  if (configurationError) throw new Error(configurationError);
}

// Singleton Pool para reutilização de conexões e suporte a alta concorrência
declare global {
  var _aniriumPgPool: Pool | undefined;
  var _aniriumPgPoolConfiguration: string | undefined;
}

let pool: Pool;

if (process.env.NODE_ENV === "production") {
  pool = new Pool({
    ...transport,
    ...operationLimits,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
} else {
  const configuration = createHash("sha256").update(JSON.stringify(["verified-tls-v1", transport, operationLimits])).digest("hex");
  if (!global._aniriumPgPool || global._aniriumPgPoolConfiguration !== configuration) {
    // Hot reload must not keep an old pool with different endpoint/trust policy.
    const previous = global._aniriumPgPool;
    global._aniriumPgPool = new Pool({
      ...transport,
      ...operationLimits,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    global._aniriumPgPoolConfiguration = configuration;
    if (previous) void previous.end().catch(() => {});
  }
  pool = global._aniriumPgPool;
}

pool.on("error", (err) => {
  logServerFailure("postgres", err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  requireDatabaseConfiguration();
  const client = await pool.connect();
  let failure: Error | undefined;
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } catch (error) {
    failure = error instanceof Error ? error : new Error("Database query failed");
    throw error;
  } finally {
    client.release(failure);
  }
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  requireDatabaseConfiguration();
  const client = await pool.connect();
  let failure: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    failure = error instanceof Error ? error : new Error("Database transaction failed");
    try { await client.query("ROLLBACK"); } catch { /* Discard the connection and preserve the original failure. */ }
    throw error;
  }
  finally { client.release(failure); }
}

// Inicializador de Schema Canônico do PostgreSQL
let schemaInitialized = false;

export async function ensurePostgresSchema() {
  requireDatabaseConfiguration();
  if (schemaInitialized) return;

  const schemaSQL = `
    -- 0. Tabela de Cache de Requisições de APIs Externas (AniList/MAL)
    CREATE TABLE IF NOT EXISTS api_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    );

    -- 1. Tabela de Usuários e Perfis
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      profile_private JSONB,
      google_subject_private JSONB,
      level_tier INTEGER NOT NULL DEFAULT 1, -- 0: Guest, 1: Membro, 2: Otaku Pro, 3: Arquiteto
      badge_label TEXT NOT NULL DEFAULT 'Membro',
      created_at BIGINT NOT NULL,
      settings_json JSONB DEFAULT '{}'::jsonb,
      subscription_plan TEXT DEFAULT NULL,
      subscription_expires_at BIGINT DEFAULT NULL
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_private JSONB;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject_private JSONB;

    CREATE TABLE IF NOT EXISTS external_identities (
      provider TEXT NOT NULL CHECK (provider = 'google'),
      key_id TEXT NOT NULL CHECK (key_id ~ '^[A-Za-z0-9_-]{1,64}$'),
      subject_hash TEXT NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (provider, key_id, subject_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_external_identity_user ON external_identities(user_id);

    -- 2. Tabela Canônica do Catálogo Completo (Tudo o que existe no mundo dos animes em uma ÚNICA tabela)
    CREATE TABLE IF NOT EXISTS user_write_budget (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL CONSTRAINT user_write_budget_action_v2_check CHECK (action IN ('save_progress','save_entity_status','add_comment','update_profile','toggle_bookmark','toggle_addon','install_manifest','uninstall_addon','register_manifest')),
      window_start BIGINT NOT NULL,
      hits INTEGER NOT NULL CHECK (hits > 0 AND hits <= 121),
      PRIMARY KEY (user_id, action)
    );
    DO $$ BEGIN
      -- Serialize this bounded compatibility migration across Core instances.
      PERFORM pg_advisory_xact_lock(918204731);
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='user_write_budget'::regclass AND conname='user_write_budget_action_v2_check') THEN
        ALTER TABLE user_write_budget ADD CONSTRAINT user_write_budget_action_v2_check
          CHECK (action IN ('save_progress','save_entity_status','add_comment','update_profile','toggle_bookmark','toggle_addon','install_manifest','uninstall_addon','register_manifest'));
        ALTER TABLE user_write_budget DROP CONSTRAINT IF EXISTS user_write_budget_action_check;
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS idx_write_budget_expiry ON user_write_budget(window_start, user_id, action);

    CREATE TABLE IF NOT EXISTS anime_catalog (
      mal_id INTEGER PRIMARY KEY,
      id_mal INTEGER,
      id_anilist INTEGER CHECK (id_anilist > 0),
      source_relations_json JSONB,
      source_nodes_json JSONB,
      title TEXT NOT NULL,
      title_english TEXT,
      title_japanese TEXT,
      title_portuguese TEXT,
      synonyms_json JSONB DEFAULT '[]'::jsonb,
      images_json JSONB NOT NULL,
      synopsis TEXT,
      score NUMERIC(4, 2),
      score_mal NUMERIC(4, 2), -- Nível 2: Nota MyAnimeList
      score_anilist NUMERIC(4, 2), -- Nível 2: Nota AniList
      score_imdb NUMERIC(4, 2), -- Nível 2: Nota IMDb consolidada
      score_episodes_avg NUMERIC(4, 2), -- Nível 2: Média dos episódios
      score_work_general NUMERIC(4, 2), -- Nível 2: Nota Geral Consolidada da Obra
      scored_by INTEGER,
      popularity INTEGER,
      episodes INTEGER,
      status TEXT, -- 'RELEASING', 'FINISHED', 'NOT_YET_RELEASED'
      category TEXT, -- 'seasonal', 'popular', 'upcoming'
      genres_json JSONB DEFAULT '[]'::jsonb,
      tags_json JSONB DEFAULT '[]'::jsonb,
      studios_json JSONB DEFAULT '[]'::jsonb,
      year INTEGER,
      format TEXT, -- 'TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'
      banner_image TEXT,
      streaming_links_json JSONB DEFAULT '[]'::jsonb,
      seasons_json JSONB DEFAULT '[]'::jsonb,
      universe_id TEXT,
      franchise_root TEXT,
      relation_type TEXT DEFAULT 'MAIN',
      next_airing_episode_json JSONB,
      updated_at BIGINT NOT NULL
    );
    ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS id_anilist INTEGER CHECK (id_anilist > 0);
    ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS source_relations_json JSONB;
    ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS source_nodes_json JSONB;

    -- 4. Status Granular do Usuário por Entidade (Franquia, Série, Temporada ou Episódio)
    -- Contém: Nota Pessoal, Opinião, Telemetria ao Segundo e Progresso
    CREATE TABLE IF NOT EXISTS user_entity_status (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL, -- 'UNIVERSE', 'SERIES', 'SEASON', 'EPISODE'
      entity_id VARCHAR(100) NOT NULL,
      parent_series_id INTEGER,
      season_idx INTEGER,
      episode_number INTEGER,
      status VARCHAR(20) NOT NULL, -- 'watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch'
      user_score NUMERIC(3, 1), -- Nota do usuário 1.0 a 10.0
      external_source_score NUMERIC(3, 1), -- Nota MAL / AniList
      user_opinion TEXT, -- Opinião pessoal daquele status
      contains_spoilers BOOLEAN DEFAULT FALSE,
      watched_seconds INTEGER DEFAULT 0, -- Até qual segundo assistiu
      total_seconds INTEGER DEFAULT 0, -- Duração total do episódio
      completed BOOLEAN DEFAULT FALSE,
      audio_track_used VARCHAR(50),
      subtitle_track_used VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (user_id, entity_type, entity_id)
    );
    ALTER TABLE user_entity_status ADD COLUMN IF NOT EXISTS activity_private JSONB;

    -- 5. Comentários (0 ou mais por Entidade / Status)
    CREATE TABLE IF NOT EXISTS entity_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL,
      entity_id VARCHAR(100) NOT NULL,
      parent_series_id INTEGER,
      episode_number INTEGER,
      parent_comment_id UUID REFERENCES entity_comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_spoiler BOOLEAN DEFAULT FALSE,
      upvotes INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- 6. Addons do Usuário
    CREATE TABLE IF NOT EXISTS user_addons (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addon_id TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      installed_at BIGINT NOT NULL,
      config_json JSONB DEFAULT '{}'::jsonb,
      PRIMARY KEY (user_id, addon_id)
    );

    -- 7. Sessão Ativa Local
    CREATE TABLE IF NOT EXISTS active_session (
      key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    -- Índices Canônicos de Alta Velocidade
    CREATE INDEX IF NOT EXISTS idx_pg_catalog_status ON anime_catalog(status);
    CREATE INDEX IF NOT EXISTS idx_pg_catalog_category ON anime_catalog(category);
    CREATE INDEX IF NOT EXISTS idx_pg_catalog_format ON anime_catalog(format);
    CREATE INDEX IF NOT EXISTS idx_pg_catalog_universe ON anime_catalog(universe_id);
    CREATE INDEX IF NOT EXISTS idx_pg_catalog_year ON anime_catalog(year);
    CREATE INDEX IF NOT EXISTS idx_pg_user_status_lookup ON user_entity_status(user_id, entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_pg_user_status_page ON user_entity_status(user_id, (COALESCE(updated_at, TIMESTAMPTZ '1970-01-01 00:00:00+00')) DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_pg_user_status_history ON user_entity_status(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pg_comments_entity ON entity_comments(entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pg_comments_page ON entity_comments(entity_type, entity_id, (COALESCE(created_at, TIMESTAMPTZ '1970-01-01 00:00:00+00')), id);

    -- Migração dinâmica da coluna is_favorite para tabelas já existentes
    ALTER TABLE user_entity_status ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_pg_user_status_favorite ON user_entity_status(user_id, is_favorite);
  `;

  try {
    await withTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:schema',0))");
      await client.query(schemaSQL);
      await client.query(entitySchemaSQL);
      const blackThemeRef = await ensureBlackTheme(client);
      // Only the packaged black theme is currently available. Preserve pinned
      // selections while assigning the existing visual default to legacy users.
      await client.query("UPDATE users SET theme_release_id=$1 WHERE theme_release_id IS NULL",[blackThemeRef.releaseId]);
      const themeDefault = (await client.query("SELECT format('ALTER TABLE users ALTER COLUMN theme_release_id SET DEFAULT %L', $1::text) AS sql",[blackThemeRef.releaseId])).rows[0].sql;
      await client.query(themeDefault);
    });
    schemaInitialized = true;
    console.log("✓ Schema canônico PostgreSQL garantido e pronto para uso.");
  } catch (err) {
    logServerFailure("postgres", err);
    throw err;
  }
}

export default pool;
