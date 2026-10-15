import { mediaRefreshSchemaSQL } from './mediaRefreshSchema';
import { imdbDatasetSchemaSQL } from './imdbDatasetSchema';
/** Fail atomically on invalid existing IDs; never rewrite identity or encrypted AAD. */
export const canonicalEntityIdSQL = `
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='canonical_entities'::regclass AND conname='canonical_entities_uuid_id') THEN
      ALTER TABLE canonical_entities ADD CONSTRAINT canonical_entities_uuid_id
        CHECK(id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    END IF;
  END $$;
  ALTER TABLE canonical_entities VALIDATE CONSTRAINT canonical_entities_uuid_id;
`;
/** Canonical index and integrity; explicit migrations preserve stored private-data AAD. */
export const entitySchemaSQL = `
  CREATE TABLE IF NOT EXISTS canonical_entities (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    kind TEXT NOT NULL CHECK (kind IN ('UNIVERSE','ARC','WORK','SEASON','EPISODE','ACCOUNT','PLUGIN','PROVIDER','THEME','ASSET','SOURCE','TAXONOMY','RESOURCE')),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','account-private')),
    owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (length(id) BETWEEN 1 AND 100),
    CHECK ((visibility='public' AND owner_id IS NULL) OR (visibility='account-private' AND owner_id IS NOT NULL)),
    CHECK (kind <> 'ACCOUNT' OR visibility='account-private'),
    UNIQUE(id,kind)
  );
  ${canonicalEntityIdSQL}
  CREATE INDEX IF NOT EXISTS idx_canonical_entity_owner ON canonical_entities(owner_id,kind,id);
  ALTER TABLE canonical_entities DROP CONSTRAINT IF EXISTS canonical_entities_kind_check;
  ALTER TABLE canonical_entities ADD CONSTRAINT canonical_entities_kind_check CHECK (kind IN ('UNIVERSE','ARC','WORK','SEASON','EPISODE','ACCOUNT','PLUGIN','PROVIDER','THEME','ASSET','SOURCE','TAXONOMY','RESOURCE'));
  CREATE TABLE IF NOT EXISTS canonical_asset_locations (
    asset_id TEXT NOT NULL,
    asset_kind TEXT NOT NULL DEFAULT 'ASSET' CHECK(asset_kind='ASSET'),
    backend TEXT NOT NULL CHECK(backend IN ('local','drive','https')),
    locator TEXT,
    locator_private JSONB,
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    FOREIGN KEY(asset_id,asset_kind) REFERENCES canonical_entities(id,kind) ON DELETE CASCADE,
    PRIMARY KEY(asset_id,backend),
    CHECK((locator IS NULL) <> (locator_private IS NULL)),
    CHECK(locator_private IS NULL OR COALESCE((jsonb_typeof(locator_private)='object' AND locator_private->>'_anirium_private'='1' AND locator_private->>'alg'='A256GCM'),FALSE)),
    CHECK(locator IS NULL OR length(locator) BETWEEN 1 AND 4096)
  );
  CREATE OR REPLACE FUNCTION canonical_asset_location_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE e canonical_entities%ROWTYPE;
  BEGIN
    SELECT * INTO e FROM canonical_entities WHERE id=NEW.asset_id;
    IF (e.visibility='public' AND NEW.locator IS NULL) OR (e.visibility='account-private' AND NEW.locator_private IS NULL) THEN
      RAISE EXCEPTION 'Asset locator scope conflict' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_asset_location_scope ON canonical_asset_locations;
  CREATE TRIGGER canonical_asset_location_scope BEFORE INSERT OR UPDATE ON canonical_asset_locations FOR EACH ROW EXECUTE FUNCTION canonical_asset_location_scope();
  CREATE TABLE IF NOT EXISTS canonical_asset_links (
    asset_id TEXT NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    slot TEXT NOT NULL CHECK(length(slot) BETWEEN 1 AND 100),
    PRIMARY KEY(entity_id,slot),
    UNIQUE(asset_id,entity_id,slot)
  );
  CREATE INDEX IF NOT EXISTS idx_asset_link_reverse ON canonical_asset_links(asset_id,entity_id);
  CREATE OR REPLACE FUNCTION canonical_asset_link_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE a canonical_entities%ROWTYPE; e canonical_entities%ROWTYPE;
  BEGIN
    SELECT * INTO a FROM canonical_entities WHERE id=NEW.asset_id;
    SELECT * INTO e FROM canonical_entities WHERE id=NEW.entity_id;
    IF a.kind<>'ASSET' OR a.visibility IS DISTINCT FROM e.visibility OR a.owner_id IS DISTINCT FROM e.owner_id THEN
      RAISE EXCEPTION 'Asset attachment scope conflict' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_asset_link_scope ON canonical_asset_links;
  CREATE TRIGGER canonical_asset_link_scope BEFORE INSERT OR UPDATE ON canonical_asset_links FOR EACH ROW EXECUTE FUNCTION canonical_asset_link_scope();
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS asset_refs_json JSONB;
  CREATE TABLE IF NOT EXISTS canonical_asset_contents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    asset_id TEXT NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    asset_kind TEXT NOT NULL DEFAULT 'ASSET' CHECK(asset_kind='ASSET'),
    content_hash TEXT NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
    byte_length BIGINT NOT NULL CHECK(byte_length BETWEEN 0 AND 9007199254740991),
    revision INTEGER NOT NULL CHECK(revision>0),
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY(asset_id,asset_kind) REFERENCES canonical_entities(id,kind),
    UNIQUE(asset_id,content_hash),
    UNIQUE(asset_id,revision)
  );
  CREATE OR REPLACE FUNCTION canonical_asset_content_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Asset content is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
  DROP TRIGGER IF EXISTS canonical_asset_content_immutable ON canonical_asset_contents;
  CREATE TRIGGER canonical_asset_content_immutable BEFORE UPDATE ON canonical_asset_contents FOR EACH ROW EXECUTE FUNCTION canonical_asset_content_immutable();
  CREATE TABLE IF NOT EXISTS canonical_index_manifests (
    content_id TEXT PRIMARY KEY REFERENCES canonical_asset_contents(id) ON DELETE CASCADE,
    validated_manifest JSONB NOT NULL CHECK(jsonb_typeof(validated_manifest)='object'),
    validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  DROP TRIGGER IF EXISTS canonical_index_manifest_immutable ON canonical_index_manifests;
  CREATE TRIGGER canonical_index_manifest_immutable BEFORE UPDATE ON canonical_index_manifests FOR EACH ROW EXECUTE FUNCTION canonical_asset_content_immutable();
  CREATE TABLE IF NOT EXISTS canonical_data_blocks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    resource_id TEXT NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    content_id TEXT NOT NULL REFERENCES canonical_asset_contents(id) ON DELETE CASCADE,
    schema_version INTEGER NOT NULL CHECK(schema_version>0),
    coverage TEXT NOT NULL CHECK(length(coverage) BETWEEN 1 AND 200),
    revision INTEGER NOT NULL CHECK(revision>0),
    previous_block_id TEXT REFERENCES canonical_data_blocks(id),
    CHECK((revision=1 AND previous_block_id IS NULL) OR (revision>1 AND previous_block_id IS NOT NULL)),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(resource_id,revision),
    UNIQUE(resource_id,content_id)
  );
  CREATE OR REPLACE FUNCTION canonical_block_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE r canonical_entities%ROWTYPE; a canonical_entities%ROWTYPE; c canonical_asset_contents%ROWTYPE; manifest JSONB;
  BEGIN
    SELECT * INTO r FROM canonical_entities WHERE id=NEW.resource_id;
    SELECT * INTO c FROM canonical_asset_contents WHERE id=NEW.content_id;
    SELECT validated_manifest INTO manifest FROM canonical_index_manifests WHERE content_id=NEW.content_id;
    SELECT * INTO a FROM canonical_entities WHERE id=c.asset_id;
    IF r.kind<>'RESOURCE' OR r.visibility IS DISTINCT FROM a.visibility OR r.owner_id IS DISTINCT FROM a.owner_id
      OR manifest IS NULL OR NEW.schema_version IS DISTINCT FROM (manifest->>'schemaVersion')::integer
      OR NEW.coverage IS DISTINCT FROM manifest->>'coverage' THEN
      RAISE EXCEPTION 'Data block scope or validation conflict' USING ERRCODE='23514';
    END IF;
    IF NEW.previous_block_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM canonical_data_blocks WHERE id=NEW.previous_block_id AND resource_id=NEW.resource_id AND revision=NEW.revision-1) THEN
      RAISE EXCEPTION 'Data block predecessor conflict' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_block_scope ON canonical_data_blocks;
  CREATE TRIGGER canonical_block_scope BEFORE INSERT ON canonical_data_blocks FOR EACH ROW EXECUTE FUNCTION canonical_block_scope();
  DROP TRIGGER IF EXISTS canonical_block_immutable ON canonical_data_blocks;
  CREATE TRIGGER canonical_block_immutable BEFORE UPDATE ON canonical_data_blocks FOR EACH ROW EXECUTE FUNCTION canonical_asset_content_immutable();
  CREATE TABLE IF NOT EXISTS canonical_theme_releases (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    theme_id TEXT NOT NULL,
    theme_kind TEXT NOT NULL DEFAULT 'THEME' CHECK(theme_kind='THEME'),
    version TEXT NOT NULL CHECK(length(version) BETWEEN 1 AND 64),
    token_schema_version INTEGER NOT NULL CHECK(token_schema_version>0),
    descriptor_hash TEXT NOT NULL CHECK(descriptor_hash ~ '^[a-f0-9]{64}$'),
    tokens JSONB NOT NULL CHECK(jsonb_typeof(tokens)='object' AND tokens<>'{}'::jsonb AND NOT jsonb_path_exists(tokens,'$.* ? (@.type() != "string")')),
    FOREIGN KEY(theme_id,theme_kind) REFERENCES canonical_entities(id,kind),
    UNIQUE(theme_id,version)
  );
  CREATE OR REPLACE FUNCTION canonical_theme_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Theme release is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
  DROP TRIGGER IF EXISTS canonical_theme_release_immutable ON canonical_theme_releases;
  CREATE TRIGGER canonical_theme_release_immutable BEFORE UPDATE ON canonical_theme_releases FOR EACH ROW EXECUTE FUNCTION canonical_theme_release_immutable();
  ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_release_id TEXT REFERENCES canonical_theme_releases(id);
  CREATE TABLE IF NOT EXISTS canonical_text_variants (
    entity_id TEXT NOT NULL REFERENCES canonical_entities(id),
    field TEXT NOT NULL CHECK(length(field) BETWEEN 1 AND 100),
    locale TEXT NOT NULL CHECK(length(locale) BETWEEN 1 AND 64),
    form TEXT NOT NULL CHECK(length(form) BETWEEN 1 AND 100),
    source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),
    value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 100000),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    PRIMARY KEY(entity_id,field,locale,form,source_key)
  );
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS text_variants_json JSONB;
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS canonical_entity_id TEXT REFERENCES canonical_entities(id);
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS canonical_entity_kind TEXT GENERATED ALWAYS AS ('WORK'::text) STORED;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='anime_catalog'::regclass AND conname='catalog_canonical_work_fk') THEN
      ALTER TABLE anime_catalog ADD CONSTRAINT catalog_canonical_work_fk FOREIGN KEY(canonical_entity_id,canonical_entity_kind) REFERENCES canonical_entities(id,kind);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_catalog_canonical_entity ON anime_catalog(canonical_entity_id);
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS composition_work_id TEXT;
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS composition_season_id TEXT;
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS composition_seasons_json JSONB;
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS composition_universe_id TEXT;
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS composition_season_kind TEXT GENERATED ALWAYS AS ('SEASON'::text) STORED;
  ALTER TABLE anime_catalog ADD COLUMN IF NOT EXISTS composition_universe_kind TEXT GENERATED ALWAYS AS ('UNIVERSE'::text) STORED;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='anime_catalog'::regclass AND conname='catalog_composition_work_fk') THEN
      ALTER TABLE anime_catalog ADD CONSTRAINT catalog_composition_work_fk FOREIGN KEY(composition_work_id,canonical_entity_kind) REFERENCES canonical_entities(id,kind);
      ALTER TABLE anime_catalog ADD CONSTRAINT catalog_composition_season_fk FOREIGN KEY(composition_season_id,composition_season_kind) REFERENCES canonical_entities(id,kind);
      ALTER TABLE anime_catalog ADD CONSTRAINT catalog_composition_universe_fk FOREIGN KEY(composition_universe_id,composition_universe_kind) REFERENCES canonical_entities(id,kind);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_catalog_composition_work ON anime_catalog(composition_work_id);
  ALTER TABLE user_entity_status ADD COLUMN IF NOT EXISTS canonical_entity_id TEXT;
  ALTER TABLE user_entity_status ADD COLUMN IF NOT EXISTS release_entity_id TEXT;
  ALTER TABLE user_entity_status ADD COLUMN IF NOT EXISTS release_entity_kind TEXT GENERATED ALWAYS AS ('SEASON'::text) STORED;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='user_entity_status'::regclass AND conname='activity_release_kind_fk') THEN
      ALTER TABLE user_entity_status ADD CONSTRAINT activity_release_kind_fk FOREIGN KEY(release_entity_id,release_entity_kind) REFERENCES canonical_entities(id,kind);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_activity_release_account ON user_entity_status(user_id,release_entity_id);
  ALTER TABLE user_entity_status ADD COLUMN IF NOT EXISTS canonical_entity_kind TEXT GENERATED ALWAYS AS (CASE entity_type WHEN 'SERIES' THEN 'WORK' ELSE entity_type END) STORED;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='user_entity_status'::regclass AND conname='activity_canonical_kind_fk') THEN
      ALTER TABLE user_entity_status ADD CONSTRAINT activity_canonical_kind_fk FOREIGN KEY(canonical_entity_id,canonical_entity_kind) REFERENCES canonical_entities(id,kind);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_activity_canonical_account ON user_entity_status(user_id,canonical_entity_id);
  DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='user_entity_status'::regclass AND conname='activity_arc_scope') THEN
      ALTER TABLE user_entity_status ADD CONSTRAINT activity_arc_scope CHECK(entity_type<>'ARC' OR (
        canonical_entity_id IS NOT NULL AND entity_id=canonical_entity_id AND release_entity_id IS NULL
        AND parent_series_id IS NULL AND season_idx IS NULL AND episode_number IS NULL
        AND status IN ('watching','plan_to_watch','completed','dropped','on_hold')
        AND completed IS NOT NULL AND contains_spoilers IS NOT NULL));
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_activity_canonical_latest ON user_entity_status(user_id,canonical_entity_id,updated_at DESC,id DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_own_account_context ON user_entity_status
    (user_id,canonical_entity_id,COALESCE(updated_at,TIMESTAMPTZ 'epoch') DESC,id DESC)
    WHERE canonical_entity_id IS NOT NULL AND (entity_type<>'SERIES' OR release_entity_id IS NULL);
  ALTER TABLE entity_comments ADD COLUMN IF NOT EXISTS canonical_entity_id TEXT;
  ALTER TABLE entity_comments ADD COLUMN IF NOT EXISTS release_entity_id TEXT;
  ALTER TABLE entity_comments ADD COLUMN IF NOT EXISTS release_entity_kind TEXT GENERATED ALWAYS AS ('SEASON'::text) STORED;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='entity_comments'::regclass AND conname='comment_release_kind_fk') THEN
      ALTER TABLE entity_comments ADD CONSTRAINT comment_release_kind_fk FOREIGN KEY(release_entity_id,release_entity_kind) REFERENCES canonical_entities(id,kind);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_comment_release ON entity_comments(release_entity_id,created_at,id);
  ALTER TABLE entity_comments ADD COLUMN IF NOT EXISTS canonical_entity_kind TEXT GENERATED ALWAYS AS (CASE entity_type WHEN 'SERIES' THEN 'WORK' ELSE entity_type END) STORED;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='entity_comments'::regclass AND conname='comment_canonical_kind_fk') THEN
      ALTER TABLE entity_comments ADD CONSTRAINT comment_canonical_kind_fk FOREIGN KEY(canonical_entity_id,canonical_entity_kind) REFERENCES canonical_entities(id,kind);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_comment_canonical ON entity_comments(canonical_entity_id,created_at,id);
  ALTER TABLE entity_comments ADD COLUMN IF NOT EXISTS arc_parent_id UUID GENERATED ALWAYS AS (CASE WHEN entity_type='ARC' THEN parent_comment_id ELSE NULL END) STORED;
  DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='entity_comments'::regclass AND conname='comment_canonical_parent_key') THEN
      ALTER TABLE entity_comments ADD CONSTRAINT comment_canonical_parent_key UNIQUE(id,canonical_entity_id,canonical_entity_kind);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='entity_comments'::regclass AND conname='comment_arc_parent_fk') THEN
      ALTER TABLE entity_comments ADD CONSTRAINT comment_arc_parent_fk FOREIGN KEY(arc_parent_id,canonical_entity_id,canonical_entity_kind)
        REFERENCES entity_comments(id,canonical_entity_id,canonical_entity_kind) ON DELETE CASCADE;
    END IF;
  END $$;
  DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='entity_comments'::regclass AND conname='comment_arc_scope') THEN
      ALTER TABLE entity_comments ADD CONSTRAINT comment_arc_scope CHECK(entity_type<>'ARC' OR (
        canonical_entity_id IS NOT NULL AND entity_id=canonical_entity_id AND release_entity_id IS NULL
        AND parent_series_id IS NULL AND episode_number IS NULL AND is_spoiler IS NOT NULL));
    END IF;
  END $$;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS canonical_account_id TEXT REFERENCES canonical_entities(id);
  ALTER TABLE user_addons ADD COLUMN IF NOT EXISTS canonical_plugin_id TEXT REFERENCES canonical_entities(id);
  ALTER TABLE user_addons ADD COLUMN IF NOT EXISTS canonical_plugin_kind TEXT GENERATED ALWAYS AS ('PLUGIN'::text) STORED;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='user_addons'::regclass AND conname='account_plugin_kind_fk') THEN
      ALTER TABLE user_addons ADD CONSTRAINT account_plugin_kind_fk FOREIGN KEY(canonical_plugin_id,canonical_plugin_kind) REFERENCES canonical_entities(id,kind);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_account_plugin_canonical ON user_addons(canonical_plugin_id,user_id);
  CREATE TABLE IF NOT EXISTS canonical_plugin_releases (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    plugin_id TEXT NOT NULL,
    plugin_kind TEXT NOT NULL DEFAULT 'PLUGIN' CHECK (plugin_kind='PLUGIN'),
    version TEXT NOT NULL CHECK (length(version) BETWEEN 1 AND 64),
    descriptor_hash TEXT NOT NULL CHECK (descriptor_hash ~ '^[a-f0-9]{64}$'),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('account-submitted','official-package')),
    UNIQUE(plugin_id,version,descriptor_hash),
    UNIQUE(id,plugin_id),
    FOREIGN KEY(plugin_id,plugin_kind) REFERENCES canonical_entities(id,kind)
  );
  ALTER TABLE canonical_plugin_releases DROP CONSTRAINT IF EXISTS canonical_plugin_releases_source_kind_check;
  ALTER TABLE canonical_plugin_releases ADD CONSTRAINT canonical_plugin_releases_source_kind_check CHECK (source_kind IN ('account-submitted','official-package'));
  ALTER TABLE user_addons ADD COLUMN IF NOT EXISTS selected_release_id TEXT;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='user_addons'::regclass AND conname='account_plugin_release_fk') THEN
      ALTER TABLE user_addons ADD CONSTRAINT account_plugin_release_fk FOREIGN KEY(selected_release_id,canonical_plugin_id) REFERENCES canonical_plugin_releases(id,plugin_id);
      ALTER TABLE user_addons ADD CONSTRAINT account_plugin_release_bound CHECK (selected_release_id IS NULL OR canonical_plugin_id IS NOT NULL);
    END IF;
  END $$;
  CREATE TABLE IF NOT EXISTS canonical_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id TEXT NOT NULL REFERENCES canonical_entities(id) ON DELETE CASCADE,
    namespace TEXT NOT NULL CHECK (length(namespace) BETWEEN 1 AND 100),
    value TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 512),
    state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','disputed','retired')),
    source_key TEXT NOT NULL CHECK (length(source_key) BETWEEN 1 AND 200),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_alias_active ON canonical_aliases(namespace,value) WHERE state='active';
  CREATE INDEX IF NOT EXISTS idx_canonical_alias_entity ON canonical_aliases(entity_id,state,namespace);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_alias_identity ON canonical_aliases(id,entity_id);
  CREATE OR REPLACE FUNCTION canonical_string_list_is_valid(input JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN jsonb_typeof(input)='array' THEN jsonb_array_length(input)<=1000 AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(input) item WHERE jsonb_typeof(item)<>'string'
        OR length(btrim(item #>> '{}'))=0 OR length(item #>> '{}')>10000) ELSE FALSE END
  $$;
  CREATE TABLE IF NOT EXISTS canonical_content_facts (
    entity_id TEXT NOT NULL,
    alias_id UUID NOT NULL,
    source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),
    field TEXT NOT NULL CHECK(field ~ '^[a-zA-Z0-9_.:-]{1,100}$'),
    value_type TEXT NOT NULL CHECK(value_type IN ('string','string-list','number','boolean','instant','null')),
    value JSONB NOT NULL,
    observed_at BIGINT NOT NULL CHECK(observed_at BETWEEN 0 AND 8640000000000000),
    PRIMARY KEY(entity_id,alias_id,source_key,field,observed_at),
    FOREIGN KEY(alias_id,entity_id) REFERENCES canonical_aliases(id,entity_id),
    CHECK(field<>'airing.scheduledAt' OR value_type IN ('instant','null')),
    CHECK(field<>'airing.cancelled' OR value_type='boolean'),
    CONSTRAINT canonical_content_fact_value_shape CHECK ((value_type='string' AND jsonb_typeof(value)='string') OR
      (value_type='string-list' AND canonical_string_list_is_valid(value)) OR
      (value_type='number' AND jsonb_typeof(value)='number') OR
      (value_type='boolean' AND jsonb_typeof(value)='boolean') OR
      (value_type='null' AND jsonb_typeof(value)='null') OR
      (value_type='instant' AND jsonb_typeof(value)='number' AND
        (value::text)::numeric BETWEEN 0 AND 8640000000000000 AND mod((value::text)::numeric,1)=0))
  );
  DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='canonical_content_facts'::regclass
      AND conname='canonical_content_facts_value_type_check' AND pg_get_constraintdef(oid) LIKE '%string-list%') THEN
      ALTER TABLE canonical_content_facts DROP CONSTRAINT IF EXISTS canonical_content_facts_value_type_check;
      ALTER TABLE canonical_content_facts ADD CONSTRAINT canonical_content_facts_value_type_check CHECK(value_type IN ('string','string-list','number','boolean','instant','null'));
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='canonical_content_facts'::regclass AND conname='canonical_content_fact_value_shape') THEN
      ALTER TABLE canonical_content_facts DROP CONSTRAINT IF EXISTS canonical_content_facts_check;
      ALTER TABLE canonical_content_facts ADD CONSTRAINT canonical_content_fact_value_shape CHECK (
        (value_type='string' AND jsonb_typeof(value)='string') OR (value_type='string-list' AND canonical_string_list_is_valid(value)) OR
        (value_type='number' AND jsonb_typeof(value)='number') OR (value_type='boolean' AND jsonb_typeof(value)='boolean') OR
        (value_type='null' AND jsonb_typeof(value)='null') OR (value_type='instant' AND jsonb_typeof(value)='number'
          AND (value::text)::numeric BETWEEN 0 AND 8640000000000000 AND mod((value::text)::numeric,1)=0));
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_canonical_content_latest ON canonical_content_facts(entity_id,alias_id,source_key,field,observed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_content_fact_source_observation ON canonical_content_facts(alias_id,source_key,observed_at,field);
  CREATE INDEX IF NOT EXISTS idx_content_fact_string_lists ON canonical_content_facts USING GIN(value) WHERE value_type='string-list';
  CREATE TABLE IF NOT EXISTS canonical_ingestion_checkpoints (
    source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),
    scope TEXT NOT NULL CHECK(length(scope) BETWEEN 1 AND 200),
    cursor TEXT,
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
    observed_at BIGINT CHECK(observed_at BETWEEN 0 AND 8640000000000000),
    PRIMARY KEY(source_key,scope),
    CHECK(cursor IS NULL OR length(cursor) BETWEEN 1 AND 2000)
  );
  CREATE TABLE IF NOT EXISTS canonical_ingestion_commits (
    source_key TEXT NOT NULL,
    scope TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>0),
    cursor TEXT NOT NULL CHECK(length(cursor) BETWEEN 1 AND 2000),
    observed_at BIGINT NOT NULL CHECK(observed_at BETWEEN 0 AND 8640000000000000),
    entry_type TEXT NOT NULL CHECK(entry_type IN ('baseline','advance')),
    PRIMARY KEY(source_key,scope,revision),
    FOREIGN KEY(source_key,scope) REFERENCES canonical_ingestion_checkpoints(source_key,scope)
  );
  INSERT INTO canonical_ingestion_commits(source_key,scope,revision,cursor,observed_at,entry_type)
    SELECT source_key,scope,revision,cursor,observed_at,'baseline' FROM canonical_ingestion_checkpoints WHERE revision>0
    ON CONFLICT DO NOTHING;
  CREATE OR REPLACE FUNCTION canonical_ingestion_transition() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Ingestion checkpoint cannot be deleted' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      IF NEW.revision<>0 OR NEW.cursor IS NOT NULL OR NEW.observed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Invalid initial ingestion checkpoint' USING ERRCODE='23514';
      END IF;
    ELSE
      IF ROW(NEW.source_key,NEW.scope) IS DISTINCT FROM ROW(OLD.source_key,OLD.scope)
        OR NEW.revision<>OLD.revision+1 OR NEW.cursor IS NULL OR NEW.observed_at IS NULL
        OR (OLD.observed_at IS NOT NULL AND NEW.observed_at<OLD.observed_at) THEN
        RAISE EXCEPTION 'Invalid ingestion checkpoint transition' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_ingestion_transition ON canonical_ingestion_checkpoints;
  CREATE TRIGGER canonical_ingestion_transition BEFORE INSERT OR UPDATE OR DELETE ON canonical_ingestion_checkpoints FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_transition();
  CREATE OR REPLACE FUNCTION canonical_ingestion_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'Ingestion history is immutable' USING ERRCODE='23514'; END $$;
  DROP TRIGGER IF EXISTS canonical_ingestion_truncate_guard ON canonical_ingestion_checkpoints;
  CREATE TRIGGER canonical_ingestion_truncate_guard BEFORE TRUNCATE ON canonical_ingestion_checkpoints FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
  DROP TRIGGER IF EXISTS canonical_ingestion_commit_immutable ON canonical_ingestion_commits;
  CREATE TRIGGER canonical_ingestion_commit_immutable BEFORE UPDATE OR DELETE ON canonical_ingestion_commits FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_immutable();
  DROP TRIGGER IF EXISTS canonical_ingestion_commit_truncate_guard ON canonical_ingestion_commits;
  CREATE TRIGGER canonical_ingestion_commit_truncate_guard BEFORE TRUNCATE ON canonical_ingestion_commits FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
  CREATE OR REPLACE FUNCTION canonical_ingestion_commit_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM canonical_ingestion_checkpoints WHERE source_key=NEW.source_key AND scope=NEW.scope
      AND revision=NEW.revision AND cursor=NEW.cursor AND observed_at=NEW.observed_at) THEN
      RAISE EXCEPTION 'Ingestion commit checkpoint conflict' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_ingestion_commit_scope ON canonical_ingestion_commits;
  CREATE TRIGGER canonical_ingestion_commit_scope BEFORE INSERT ON canonical_ingestion_commits FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_commit_scope();
  CREATE OR REPLACE FUNCTION canonical_ingestion_record_commit() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    INSERT INTO canonical_ingestion_commits(source_key,scope,revision,cursor,observed_at,entry_type)
      VALUES(NEW.source_key,NEW.scope,NEW.revision,NEW.cursor,NEW.observed_at,'advance');
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS canonical_ingestion_record_commit ON canonical_ingestion_checkpoints;
  CREATE TRIGGER canonical_ingestion_record_commit AFTER UPDATE ON canonical_ingestion_checkpoints FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_record_commit();
  CREATE OR REPLACE FUNCTION canonical_ingestion_current_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM canonical_ingestion_checkpoints p LEFT JOIN canonical_ingestion_commits c
      ON c.source_key=p.source_key AND c.scope=p.scope AND c.revision=p.revision
      WHERE p.source_key=NEW.source_key AND p.scope=NEW.scope
        AND (p.revision=0 OR (c.cursor=p.cursor AND c.observed_at=p.observed_at))) THEN
      RAISE EXCEPTION 'Ingestion current history conflict' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS canonical_ingestion_current_integrity ON canonical_ingestion_checkpoints;
  CREATE CONSTRAINT TRIGGER canonical_ingestion_current_integrity AFTER INSERT OR UPDATE ON canonical_ingestion_checkpoints
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_current_integrity();
  CREATE TABLE IF NOT EXISTS canonical_ingestion_batches (
    source_key TEXT NOT NULL,
    scope TEXT NOT NULL,
    revision INTEGER NOT NULL,
    observed_at BIGINT NOT NULL CHECK(observed_at BETWEEN 0 AND 8640000000000000),
    entry_count INTEGER NOT NULL CHECK(entry_count BETWEEN 0 AND 500),
    payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='array'),
    payload_hash TEXT NOT NULL CHECK(payload_hash=encode(sha256(convert_to(payload::text,'UTF8')),'hex')),
    PRIMARY KEY(source_key,scope,revision),
    FOREIGN KEY(source_key,scope,revision) REFERENCES canonical_ingestion_commits(source_key,scope,revision) DEFERRABLE INITIALLY DEFERRED,
    CHECK(jsonb_array_length(payload)=entry_count)
  );
  CREATE TABLE IF NOT EXISTS canonical_ingestion_batch_items (
    source_key TEXT NOT NULL,
    scope TEXT NOT NULL,
    revision INTEGER NOT NULL,
    entity_id TEXT NOT NULL,
    alias_id UUID NOT NULL,
    season_alias_id UUID NOT NULL REFERENCES canonical_aliases(id),
    observed_at BIGINT NOT NULL,
    entry JSONB NOT NULL CHECK(jsonb_typeof(entry)='object'),
    time_field TEXT NOT NULL DEFAULT 'airing.scheduledAt' CHECK(time_field='airing.scheduledAt'),
    cancellation_field TEXT NOT NULL DEFAULT 'airing.cancelled' CHECK(cancellation_field='airing.cancelled'),
    PRIMARY KEY(source_key,scope,revision,alias_id),
    FOREIGN KEY(source_key,scope,revision) REFERENCES canonical_ingestion_batches(source_key,scope,revision),
    FOREIGN KEY(entity_id,alias_id,source_key,time_field,observed_at) REFERENCES canonical_content_facts(entity_id,alias_id,source_key,field,observed_at),
    FOREIGN KEY(entity_id,alias_id,source_key,cancellation_field,observed_at) REFERENCES canonical_content_facts(entity_id,alias_id,source_key,field,observed_at),
    CHECK(COALESCE(jsonb_typeof(entry->'id')='string' AND jsonb_typeof(entry->'mediaId')='string'
      AND jsonb_typeof(entry->'episode')='number' AND jsonb_typeof(entry->'scheduledAt')='number',FALSE)),
    CHECK(COALESCE((entry->>'episode')::numeric BETWEEN 1 AND 2147483647 AND mod((entry->>'episode')::numeric,1)=0,FALSE)),
    CHECK(COALESCE((entry->>'scheduledAt')::numeric BETWEEN 0 AND 8640000000000000 AND mod((entry->>'scheduledAt')::numeric,1)=0,FALSE))
  );
  CREATE OR REPLACE FUNCTION canonical_ingestion_batch_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE b canonical_ingestion_batches%ROWTYPE;
  BEGIN
    SELECT * INTO b FROM canonical_ingestion_batches WHERE source_key=NEW.source_key AND scope=NEW.scope AND revision=NEW.revision;
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM canonical_ingestion_commits c WHERE c.source_key=b.source_key AND c.scope=b.scope
      AND c.revision=b.revision AND c.observed_at=b.observed_at)
      OR (SELECT COUNT(*) FROM canonical_ingestion_batch_items i WHERE i.source_key=b.source_key AND i.scope=b.scope AND i.revision=b.revision)<>b.entry_count
      OR (SELECT COUNT(DISTINCT p->>'id') FROM jsonb_array_elements(b.payload) p)<>b.entry_count THEN
      RAISE EXCEPTION 'Ingestion batch coverage conflict' USING ERRCODE='23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM canonical_ingestion_batch_items i
      JOIN canonical_aliases a ON a.id=i.alias_id
      JOIN canonical_aliases s ON s.id=i.season_alias_id
      JOIN canonical_content_facts t ON (t.entity_id,t.alias_id,t.source_key,t.field,t.observed_at)=(i.entity_id,i.alias_id,i.source_key,i.time_field,i.observed_at)
      JOIN canonical_content_facts c ON (c.entity_id,c.alias_id,c.source_key,c.field,c.observed_at)=(i.entity_id,i.alias_id,i.source_key,i.cancellation_field,i.observed_at)
      WHERE i.source_key=b.source_key AND i.scope=b.scope AND i.revision=b.revision AND (
        i.observed_at<>b.observed_at OR a.state<>'active' OR s.state<>'active'
        OR a.value<>(i.entry->>'id') OR a.namespace<>b.source_key OR s.value<>(i.entry->>'mediaId')
        OR (b.source_key='anilist:airing-schedule' AND s.namespace<>'anilist:season')
        OR NOT EXISTS(SELECT 1 FROM canonical_memberships m WHERE m.child_id=i.entity_id AND m.parent_id=s.entity_id AND m.parent_kind='SEASON' AND m.display_order=(i.entry->>'episode')::integer)
        OR t.value_type<>'instant' OR t.value<>(i.entry->'scheduledAt') OR c.value_type<>'boolean' OR c.value<>'false'::jsonb
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b.payload) p WHERE p=i.entry)
      )
    ) OR EXISTS (SELECT 1 FROM jsonb_array_elements(b.payload) p WHERE NOT EXISTS (
      SELECT 1 FROM canonical_ingestion_batch_items i WHERE i.source_key=b.source_key AND i.scope=b.scope AND i.revision=b.revision AND i.entry=p)) THEN
      RAISE EXCEPTION 'Ingestion batch fact conflict' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS canonical_ingestion_batch_integrity ON canonical_ingestion_batches;
  CREATE CONSTRAINT TRIGGER canonical_ingestion_batch_integrity AFTER INSERT ON canonical_ingestion_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_batch_integrity();
  DROP TRIGGER IF EXISTS canonical_ingestion_batch_item_integrity ON canonical_ingestion_batch_items;
  CREATE CONSTRAINT TRIGGER canonical_ingestion_batch_item_integrity AFTER INSERT ON canonical_ingestion_batch_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_batch_integrity();
  DROP TRIGGER IF EXISTS canonical_ingestion_batch_immutable ON canonical_ingestion_batches;
  CREATE TRIGGER canonical_ingestion_batch_immutable BEFORE UPDATE OR DELETE ON canonical_ingestion_batches FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_immutable();
  DROP TRIGGER IF EXISTS canonical_ingestion_batch_item_immutable ON canonical_ingestion_batch_items;
  CREATE TRIGGER canonical_ingestion_batch_item_immutable BEFORE UPDATE OR DELETE ON canonical_ingestion_batch_items FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_immutable();
  DROP TRIGGER IF EXISTS canonical_ingestion_batch_truncate ON canonical_ingestion_batches;
  CREATE TRIGGER canonical_ingestion_batch_truncate BEFORE TRUNCATE ON canonical_ingestion_batches FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
  DROP TRIGGER IF EXISTS canonical_ingestion_batch_item_truncate ON canonical_ingestion_batch_items;
  CREATE TRIGGER canonical_ingestion_batch_item_truncate BEFORE TRUNCATE ON canonical_ingestion_batch_items FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
  CREATE OR REPLACE FUNCTION canonical_ingestion_require_batch() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM canonical_ingestion_batches WHERE source_key=NEW.source_key AND scope=NEW.scope AND revision=NEW.revision) THEN
      RAISE EXCEPTION 'Ingestion batch manifest required' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS canonical_ingestion_require_batch ON canonical_ingestion_checkpoints;
  CREATE CONSTRAINT TRIGGER canonical_ingestion_require_batch AFTER UPDATE ON canonical_ingestion_checkpoints DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_require_batch();
  CREATE TABLE IF NOT EXISTS canonical_collection_windows (
    source_key TEXT NOT NULL,
    scope TEXT NOT NULL,
    window_start BIGINT NOT NULL CHECK(window_start>=0),
    window_end BIGINT NOT NULL CHECK(window_end<=8640000000000000 AND window_end>window_start),
    page_size INTEGER NOT NULL CHECK(page_size BETWEEN 1 AND 500),
    next_page INTEGER NOT NULL DEFAULT 1 CHECK(next_page>=1),
    checkpoint_revision INTEGER NOT NULL DEFAULT 0 CHECK(checkpoint_revision>=0),
    status TEXT NOT NULL DEFAULT 'collecting' CHECK(status IN ('collecting','complete')),
    PRIMARY KEY(source_key,scope),
    FOREIGN KEY(source_key,scope) REFERENCES canonical_ingestion_checkpoints(source_key,scope)
  );
  CREATE TABLE IF NOT EXISTS canonical_collection_pages (
    source_key TEXT NOT NULL,
    scope TEXT NOT NULL,
    page INTEGER NOT NULL CHECK(page>=1),
    checkpoint_revision INTEGER NOT NULL CHECK(checkpoint_revision>=1),
    has_more BOOLEAN NOT NULL,
    PRIMARY KEY(source_key,scope,page),
    UNIQUE(source_key,scope,checkpoint_revision),
    FOREIGN KEY(source_key,scope) REFERENCES canonical_collection_windows(source_key,scope),
    FOREIGN KEY(source_key,scope,checkpoint_revision) REFERENCES canonical_ingestion_batches(source_key,scope,revision) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE OR REPLACE FUNCTION canonical_collection_transition() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Collection window cannot be deleted' USING ERRCODE='23514'; END IF;
    IF TG_OP='INSERT' THEN
      IF NEW.next_page<>1 OR NEW.checkpoint_revision<>0 OR NEW.status<>'collecting' THEN
        RAISE EXCEPTION 'Invalid initial collection state' USING ERRCODE='23514'; END IF;
    ELSE
      IF ROW(NEW.source_key,NEW.scope,NEW.window_start,NEW.window_end,NEW.page_size)
        IS DISTINCT FROM ROW(OLD.source_key,OLD.scope,OLD.window_start,OLD.window_end,OLD.page_size)
        OR OLD.status<>'collecting' OR NEW.next_page<>OLD.next_page+1 OR NEW.checkpoint_revision<>OLD.checkpoint_revision+1 THEN
        RAISE EXCEPTION 'Invalid collection transition' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_collection_transition ON canonical_collection_windows;
  CREATE TRIGGER canonical_collection_transition BEFORE INSERT OR UPDATE OR DELETE ON canonical_collection_windows FOR EACH ROW EXECUTE FUNCTION canonical_collection_transition();
  CREATE OR REPLACE FUNCTION canonical_collection_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE w canonical_collection_windows%ROWTYPE; p canonical_collection_pages%ROWTYPE; total INTEGER;
  BEGIN
    SELECT * INTO w FROM canonical_collection_windows WHERE source_key=NEW.source_key AND scope=NEW.scope;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT COUNT(*) INTO total FROM canonical_collection_pages WHERE source_key=w.source_key AND scope=w.scope;
    IF total<>w.next_page-1 OR w.checkpoint_revision<>total OR NOT EXISTS (
      SELECT 1 FROM canonical_ingestion_checkpoints WHERE source_key=w.source_key AND scope=w.scope AND revision=w.checkpoint_revision
    ) THEN RAISE EXCEPTION 'Collection coverage conflict' USING ERRCODE='23514'; END IF;
    IF total>0 THEN
      SELECT * INTO p FROM canonical_collection_pages WHERE source_key=w.source_key AND scope=w.scope AND page=w.next_page-1;
      IF NOT FOUND OR p.checkpoint_revision<>w.checkpoint_revision OR w.status<>(CASE WHEN p.has_more THEN 'collecting' ELSE 'complete' END) THEN
        RAISE EXCEPTION 'Collection completion conflict' USING ERRCODE='23514'; END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM canonical_collection_pages r JOIN canonical_ingestion_batches b
      ON b.source_key=r.source_key AND b.scope=r.scope AND b.revision=r.checkpoint_revision
      WHERE r.source_key=w.source_key AND r.scope=w.scope AND (r.page<>r.checkpoint_revision
        OR b.entry_count>w.page_size OR (r.has_more AND b.entry_count=0) OR (r.page<w.next_page-1 AND NOT r.has_more)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(b.payload) e WHERE (e->>'scheduledAt')::numeric<w.window_start OR (e->>'scheduledAt')::numeric>=w.window_end))) THEN
      RAISE EXCEPTION 'Collection page receipt conflict' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS canonical_collection_integrity ON canonical_collection_windows;
  CREATE CONSTRAINT TRIGGER canonical_collection_integrity AFTER INSERT OR UPDATE ON canonical_collection_windows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_collection_integrity();
  DROP TRIGGER IF EXISTS canonical_collection_page_integrity ON canonical_collection_pages;
  CREATE CONSTRAINT TRIGGER canonical_collection_page_integrity AFTER INSERT ON canonical_collection_pages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_collection_integrity();
  DROP TRIGGER IF EXISTS canonical_collection_checkpoint_integrity ON canonical_ingestion_checkpoints;
  CREATE CONSTRAINT TRIGGER canonical_collection_checkpoint_integrity AFTER UPDATE ON canonical_ingestion_checkpoints DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_collection_integrity();
  DROP TRIGGER IF EXISTS canonical_collection_page_immutable ON canonical_collection_pages;
  CREATE TRIGGER canonical_collection_page_immutable BEFORE UPDATE OR DELETE ON canonical_collection_pages FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_immutable();
  DROP TRIGGER IF EXISTS canonical_collection_window_truncate ON canonical_collection_windows;
  CREATE TRIGGER canonical_collection_window_truncate BEFORE TRUNCATE ON canonical_collection_windows FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
  DROP TRIGGER IF EXISTS canonical_collection_page_truncate ON canonical_collection_pages;
  CREATE TRIGGER canonical_collection_page_truncate BEFORE TRUNCATE ON canonical_collection_pages FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
  CREATE INDEX IF NOT EXISTS idx_canonical_airing_fact ON canonical_content_facts(field,entity_id,observed_at DESC) WHERE field IN ('airing.scheduledAt','airing.cancelled');
  CREATE OR REPLACE FUNCTION canonical_content_fact_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM canonical_entities WHERE id=NEW.entity_id AND visibility='public'
      AND kind IN ('UNIVERSE','ARC','WORK','SEASON','EPISODE')
      AND (NEW.field NOT IN ('airing.scheduledAt','airing.cancelled') OR kind='EPISODE')) THEN
      RAISE EXCEPTION 'Canonical content fact scope conflict' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_content_fact_scope ON canonical_content_facts;
  CREATE TRIGGER canonical_content_fact_scope BEFORE INSERT ON canonical_content_facts FOR EACH ROW EXECUTE FUNCTION canonical_content_fact_scope();
  CREATE OR REPLACE FUNCTION canonical_content_fact_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'Canonical content fact is immutable' USING ERRCODE='23514'; END $$;
  DROP TRIGGER IF EXISTS canonical_content_fact_immutable ON canonical_content_facts;
  CREATE TRIGGER canonical_content_fact_immutable BEFORE UPDATE OR DELETE ON canonical_content_facts FOR EACH ROW EXECUTE FUNCTION canonical_content_fact_immutable();
  DROP TRIGGER IF EXISTS canonical_content_fact_truncate_guard ON canonical_content_facts;
  CREATE TRIGGER canonical_content_fact_truncate_guard BEFORE TRUNCATE ON canonical_content_facts FOR EACH STATEMENT EXECUTE FUNCTION canonical_content_fact_immutable();
  CREATE TABLE IF NOT EXISTS canonical_content_fact_heads (
    entity_id TEXT NOT NULL,
    alias_id UUID NOT NULL,
    source_key TEXT NOT NULL,
    field TEXT NOT NULL,
    observed_at BIGINT NOT NULL,
    PRIMARY KEY(entity_id,alias_id,source_key,field),
    FOREIGN KEY(entity_id,alias_id,source_key,field,observed_at)
      REFERENCES canonical_content_facts(entity_id,alias_id,source_key,field,observed_at)
  );
  CREATE INDEX IF NOT EXISTS idx_canonical_fact_head_source ON canonical_content_fact_heads(source_key,field,entity_id,alias_id);
  DROP TRIGGER IF EXISTS canonical_content_head_truncate_guard ON canonical_content_fact_heads;
  CREATE TRIGGER canonical_content_head_truncate_guard BEFORE TRUNCATE ON canonical_content_fact_heads FOR EACH STATEMENT EXECUTE FUNCTION canonical_content_fact_immutable();
  CREATE OR REPLACE FUNCTION canonical_content_fact_head_update() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    INSERT INTO canonical_content_fact_heads(entity_id,alias_id,source_key,field,observed_at)
      VALUES(NEW.entity_id,NEW.alias_id,NEW.source_key,NEW.field,NEW.observed_at)
      ON CONFLICT(entity_id,alias_id,source_key,field) DO UPDATE SET observed_at=EXCLUDED.observed_at
      WHERE canonical_content_fact_heads.observed_at<EXCLUDED.observed_at;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS canonical_content_fact_head_update ON canonical_content_facts;
  CREATE TRIGGER canonical_content_fact_head_update AFTER INSERT ON canonical_content_facts FOR EACH ROW EXECUTE FUNCTION canonical_content_fact_head_update();
  INSERT INTO canonical_content_fact_heads(entity_id,alias_id,source_key,field,observed_at)
    SELECT entity_id,alias_id,source_key,field,MAX(observed_at) FROM canonical_content_facts GROUP BY entity_id,alias_id,source_key,field
    ON CONFLICT(entity_id,alias_id,source_key,field) DO UPDATE SET observed_at=EXCLUDED.observed_at
    WHERE canonical_content_fact_heads.observed_at<>EXCLUDED.observed_at;
  CREATE OR REPLACE FUNCTION canonical_content_fact_head_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE previous_entity TEXT; previous_alias UUID; previous_source TEXT; previous_field TEXT;
    current_entity TEXT; current_alias UUID; current_source TEXT; current_field TEXT; target RECORD;
  BEGIN
    IF TG_OP<>'INSERT' THEN
      previous_entity:=OLD.entity_id; previous_alias:=OLD.alias_id; previous_source:=OLD.source_key; previous_field:=OLD.field;
    END IF;
    IF TG_OP<>'DELETE' THEN
      current_entity:=NEW.entity_id; current_alias:=NEW.alias_id; current_source:=NEW.source_key; current_field:=NEW.field;
    END IF;
    FOR target IN
      SELECT entity_id,alias_id,source_key,field,MAX(observed_at) AS observed_at FROM canonical_content_facts
      WHERE (entity_id,alias_id,source_key,field)=(previous_entity,previous_alias,previous_source,previous_field)
         OR (entity_id,alias_id,source_key,field)=(current_entity,current_alias,current_source,current_field)
      GROUP BY entity_id,alias_id,source_key,field
    LOOP
      IF NOT EXISTS (SELECT 1 FROM canonical_content_fact_heads h WHERE h.entity_id=target.entity_id AND h.alias_id=target.alias_id
        AND h.source_key=target.source_key AND h.field=target.field AND h.observed_at=target.observed_at) THEN
        RAISE EXCEPTION 'Canonical current fact integrity conflict' USING ERRCODE='23514';
      END IF;
    END LOOP;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS canonical_content_fact_head_integrity ON canonical_content_fact_heads;
  CREATE CONSTRAINT TRIGGER canonical_content_fact_head_integrity AFTER INSERT OR UPDATE OR DELETE ON canonical_content_fact_heads
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_content_fact_head_integrity();
  CREATE TABLE IF NOT EXISTS canonical_memberships (
    parent_id TEXT NOT NULL,
    parent_kind TEXT NOT NULL,
    child_id TEXT NOT NULL,
    child_kind TEXT NOT NULL,
    display_order INTEGER CHECK (display_order >= 0),
    source_key TEXT NOT NULL CHECK (length(source_key) BETWEEN 1 AND 200),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    PRIMARY KEY(parent_id,child_id),
    FOREIGN KEY(parent_id,parent_kind) REFERENCES canonical_entities(id,kind) ON DELETE CASCADE,
    FOREIGN KEY(child_id,child_kind) REFERENCES canonical_entities(id,kind) ON DELETE CASCADE,
    CHECK ((parent_kind='UNIVERSE' AND child_kind='WORK') OR
           (parent_kind='WORK' AND child_kind='SEASON') OR
           (parent_kind='SEASON' AND child_kind='EPISODE')),
    CHECK (parent_id <> child_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_membership_single_parent ON canonical_memberships(child_id) WHERE child_kind IN ('SEASON','EPISODE');
  CREATE INDEX IF NOT EXISTS idx_canonical_membership_order ON canonical_memberships(parent_id,display_order,child_id);
  CREATE INDEX IF NOT EXISTS idx_canonical_membership_reverse ON canonical_memberships(child_id,parent_id);
  CREATE TABLE IF NOT EXISTS canonical_arcs (
    arc_id TEXT PRIMARY KEY,
    arc_kind TEXT NOT NULL DEFAULT 'ARC' CHECK(arc_kind='ARC'),
    universe_id TEXT NOT NULL,
    universe_kind TEXT NOT NULL DEFAULT 'UNIVERSE' CHECK(universe_kind='UNIVERSE'),
    source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    FOREIGN KEY(arc_id,arc_kind) REFERENCES canonical_entities(id,kind),
    FOREIGN KEY(universe_id,universe_kind) REFERENCES canonical_entities(id,kind)
  );
  CREATE INDEX IF NOT EXISTS idx_canonical_arc_universe ON canonical_arcs(universe_id,arc_id);
  CREATE TABLE IF NOT EXISTS canonical_arc_episodes (
    arc_id TEXT NOT NULL REFERENCES canonical_arcs(arc_id),
    episode_id TEXT NOT NULL,
    episode_kind TEXT NOT NULL DEFAULT 'EPISODE' CHECK(episode_kind='EPISODE'),
    display_order INTEGER NOT NULL CHECK(display_order>=0),
    source_key TEXT NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
    PRIMARY KEY(arc_id,episode_id),
    FOREIGN KEY(episode_id,episode_kind) REFERENCES canonical_entities(id,kind)
  );
  CREATE INDEX IF NOT EXISTS idx_canonical_arc_episode_order ON canonical_arc_episodes(arc_id,display_order,episode_id);
  CREATE INDEX IF NOT EXISTS idx_canonical_episode_arcs ON canonical_arc_episodes(episode_id,arc_id);
  CREATE OR REPLACE FUNCTION canonical_classification_lock() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('anirium:canonical-classification',0));
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_classification_lock ON canonical_arcs;
  CREATE TRIGGER canonical_classification_lock BEFORE INSERT OR UPDATE OR DELETE ON canonical_arcs FOR EACH ROW EXECUTE FUNCTION canonical_classification_lock();
  DROP TRIGGER IF EXISTS canonical_classification_lock ON canonical_arc_episodes;
  CREATE TRIGGER canonical_classification_lock BEFORE INSERT OR UPDATE OR DELETE ON canonical_arc_episodes FOR EACH ROW EXECUTE FUNCTION canonical_classification_lock();
  DROP TRIGGER IF EXISTS canonical_classification_lock ON canonical_memberships;
  CREATE TRIGGER canonical_classification_lock BEFORE INSERT OR UPDATE OR DELETE ON canonical_memberships FOR EACH ROW EXECUTE FUNCTION canonical_classification_lock();
  CREATE OR REPLACE FUNCTION canonical_arc_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE affected TEXT[]; previous_id TEXT; current_id TEXT;
  BEGIN
    IF TG_TABLE_NAME='canonical_memberships' THEN
      IF TG_OP<>'INSERT' THEN previous_id:=OLD.child_id; END IF;
      IF TG_OP<>'DELETE' THEN current_id:=NEW.child_id; END IF;
      WITH RECURSIVE descendants(id) AS (
        SELECT unnest(ARRAY[previous_id,current_id])
        UNION
        SELECT m.child_id FROM canonical_memberships m JOIN descendants d ON m.parent_id=d.id
      )
      SELECT array_agg(DISTINCT ae.arc_id) INTO affected
      FROM descendants d JOIN canonical_arc_episodes ae ON ae.episode_id=d.id;
    ELSE
      IF TG_OP<>'INSERT' THEN previous_id:=OLD.arc_id; END IF;
      IF TG_OP<>'DELETE' THEN current_id:=NEW.arc_id; END IF;
      affected:=ARRAY[previous_id,current_id];
    END IF;
    IF affected IS NULL THEN RETURN NULL; END IF;
    IF EXISTS (
      SELECT 1 FROM canonical_arcs a
      JOIN canonical_entities arc ON arc.id=a.arc_id
      JOIN canonical_entities universe ON universe.id=a.universe_id
      WHERE a.arc_id=ANY(affected) AND (arc.visibility<>'public' OR universe.visibility<>'public')
    ) OR EXISTS (
      SELECT 1 FROM canonical_arc_episodes ae JOIN canonical_arcs a ON a.arc_id=ae.arc_id
      WHERE ae.arc_id=ANY(affected) AND NOT EXISTS (
        SELECT 1 FROM canonical_memberships ep
        JOIN canonical_memberships season ON season.child_id=ep.parent_id
        JOIN canonical_memberships work ON work.child_id=season.parent_id
        JOIN canonical_entities e ON e.id=ep.child_id
        WHERE ep.child_id=ae.episode_id AND ep.parent_kind='SEASON'
          AND season.parent_kind='WORK' AND work.parent_kind='UNIVERSE'
          AND work.parent_id=a.universe_id AND e.visibility='public'
      )
    ) THEN
      RAISE EXCEPTION 'Canonical arc classification conflict' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END $$;
  DROP TRIGGER IF EXISTS canonical_arc_integrity ON canonical_arcs;
  CREATE CONSTRAINT TRIGGER canonical_arc_integrity AFTER INSERT OR UPDATE OR DELETE ON canonical_arcs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_arc_integrity();
  DROP TRIGGER IF EXISTS canonical_arc_integrity ON canonical_arc_episodes;
  CREATE CONSTRAINT TRIGGER canonical_arc_integrity AFTER INSERT OR UPDATE OR DELETE ON canonical_arc_episodes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_arc_integrity();
  DROP TRIGGER IF EXISTS canonical_arc_integrity ON canonical_memberships;
  CREATE CONSTRAINT TRIGGER canonical_arc_integrity AFTER INSERT OR UPDATE OR DELETE ON canonical_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_arc_integrity();
  CREATE TABLE IF NOT EXISTS canonical_release_facts (
    season_id TEXT PRIMARY KEY,
    season_kind TEXT NOT NULL DEFAULT 'SEASON' CHECK(season_kind='SEASON'),
    episode_count INTEGER CHECK(episode_count>=0),
    episodes_observed BOOLEAN NOT NULL DEFAULT FALSE,
    source_key TEXT NOT NULL,
    FOREIGN KEY(season_id,season_kind) REFERENCES canonical_entities(id,kind)
  );
  CREATE TABLE IF NOT EXISTS canonical_membership_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id TEXT NOT NULL REFERENCES canonical_entities(id),
    previous_parent_id TEXT NOT NULL REFERENCES canonical_entities(id),
    next_parent_id TEXT NOT NULL REFERENCES canonical_entities(id),
    source_key TEXT NOT NULL CHECK (length(source_key) BETWEEN 1 AND 200),
    source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
    source_snapshot TEXT NOT NULL CHECK (length(source_snapshot) BETWEEN 1 AND 1000000),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (previous_parent_id <> next_parent_id),
    CHECK (source_hash=encode(sha256(convert_to(source_snapshot,'UTF8')),'hex'))
  );
  CREATE INDEX IF NOT EXISTS idx_membership_history_child ON canonical_membership_history(child_id,changed_at,id);
  CREATE OR REPLACE FUNCTION canonical_membership_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'Canonical membership history is immutable' USING ERRCODE='23514'; END $$;
  DROP TRIGGER IF EXISTS canonical_membership_history_immutable ON canonical_membership_history;
  CREATE TRIGGER canonical_membership_history_immutable BEFORE UPDATE OR DELETE ON canonical_membership_history FOR EACH ROW EXECUTE FUNCTION canonical_membership_history_immutable();
  CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_record_owner ON user_entity_status(id,user_id);
  CREATE TABLE IF NOT EXISTS activity_binding_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_id UUID NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_entity_id TEXT NOT NULL REFERENCES canonical_entities(id),
    next_entity_id TEXT NOT NULL REFERENCES canonical_entities(id),
    membership_proof_ids JSONB NOT NULL CHECK (jsonb_typeof(membership_proof_ids)='array' AND jsonb_array_length(membership_proof_ids) BETWEEN 1 AND 1000),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY(status_id,user_id) REFERENCES user_entity_status(id,user_id) ON DELETE CASCADE,
    CHECK(previous_entity_id <> next_entity_id)
  );
  CREATE INDEX IF NOT EXISTS idx_activity_binding_history_owner ON activity_binding_history(user_id,status_id,changed_at,id);
  CREATE OR REPLACE FUNCTION activity_binding_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'Activity binding history is immutable' USING ERRCODE='23514'; END $$;
  DROP TRIGGER IF EXISTS activity_binding_history_immutable ON activity_binding_history;
  CREATE TRIGGER activity_binding_history_immutable BEFORE UPDATE ON activity_binding_history FOR EACH ROW EXECUTE FUNCTION activity_binding_history_immutable();
  CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_record_owner ON entity_comments(id,user_id);
  CREATE TABLE IF NOT EXISTS comment_binding_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_entity_id TEXT NOT NULL REFERENCES canonical_entities(id),
    next_entity_id TEXT NOT NULL REFERENCES canonical_entities(id),
    membership_proof_ids JSONB NOT NULL CHECK (jsonb_typeof(membership_proof_ids)='array' AND jsonb_array_length(membership_proof_ids) BETWEEN 1 AND 1000),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY(comment_id,user_id) REFERENCES entity_comments(id,user_id) ON DELETE CASCADE,
    CHECK(previous_entity_id <> next_entity_id)
  );
  CREATE INDEX IF NOT EXISTS idx_comment_binding_owner ON comment_binding_history(user_id,comment_id,changed_at,id);
  DROP TRIGGER IF EXISTS comment_binding_history_immutable ON comment_binding_history;
  CREATE TRIGGER comment_binding_history_immutable BEFORE UPDATE ON comment_binding_history FOR EACH ROW EXECUTE FUNCTION activity_binding_history_immutable();
  CREATE OR REPLACE FUNCTION canonical_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF ROW(NEW.id,NEW.kind,NEW.visibility,NEW.owner_id) IS DISTINCT FROM ROW(OLD.id,OLD.kind,OLD.visibility,OLD.owner_id) THEN
      RAISE EXCEPTION 'Canonical identity is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_identity_immutable ON canonical_entities;
  CREATE TRIGGER canonical_identity_immutable BEFORE UPDATE ON canonical_entities FOR EACH ROW EXECUTE FUNCTION canonical_identity_immutable();
  CREATE OR REPLACE FUNCTION canonical_alias_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF ROW(NEW.entity_id,NEW.namespace,NEW.value) IS DISTINCT FROM ROW(OLD.entity_id,OLD.namespace,OLD.value) THEN
      RAISE EXCEPTION 'Canonical alias cannot be rebound' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_alias_immutable ON canonical_aliases;
  CREATE TRIGGER canonical_alias_immutable BEFORE UPDATE ON canonical_aliases FOR EACH ROW EXECUTE FUNCTION canonical_alias_immutable();
  CREATE OR REPLACE FUNCTION canonical_membership_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE p canonical_entities%ROWTYPE; c canonical_entities%ROWTYPE;
  BEGIN
    SELECT * INTO p FROM canonical_entities WHERE id=NEW.parent_id;
    SELECT * INTO c FROM canonical_entities WHERE id=NEW.child_id;
    IF p.visibility IS DISTINCT FROM c.visibility OR p.owner_id IS DISTINCT FROM c.owner_id THEN
      RAISE EXCEPTION 'Canonical membership scope conflict' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_membership_scope ON canonical_memberships;
  CREATE TRIGGER canonical_membership_scope BEFORE INSERT OR UPDATE ON canonical_memberships FOR EACH ROW EXECUTE FUNCTION canonical_membership_scope();
  CREATE OR REPLACE FUNCTION canonical_account_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW.canonical_account_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM canonical_entities WHERE id=NEW.canonical_account_id AND kind='ACCOUNT' AND owner_id=NEW.id AND visibility='account-private'
    ) THEN
      RAISE EXCEPTION 'Canonical account scope conflict' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_account_scope ON users;
  CREATE TRIGGER canonical_account_scope BEFORE INSERT OR UPDATE OF canonical_account_id,id ON users FOR EACH ROW EXECUTE FUNCTION canonical_account_scope();
  CREATE OR REPLACE FUNCTION canonical_public_reference_scope() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE targets TEXT[];
  BEGIN
    CASE TG_TABLE_NAME
      WHEN 'anime_catalog' THEN targets := ARRAY[NEW.canonical_entity_id,NEW.composition_work_id,NEW.composition_season_id,NEW.composition_universe_id];
      WHEN 'user_entity_status' THEN targets := ARRAY[NEW.canonical_entity_id,NEW.release_entity_id];
      WHEN 'entity_comments' THEN targets := ARRAY[NEW.canonical_entity_id,NEW.release_entity_id];
      WHEN 'user_addons' THEN targets := ARRAY[NEW.canonical_plugin_id];
      ELSE RAISE EXCEPTION 'Unsupported canonical reference table' USING ERRCODE='23514';
    END CASE;
    IF EXISTS (SELECT 1 FROM canonical_entities WHERE id=ANY(targets) AND (visibility<>'public' OR owner_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'Canonical public reference scope conflict' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_public_reference_scope ON anime_catalog;
  CREATE TRIGGER canonical_public_reference_scope BEFORE INSERT OR UPDATE OF canonical_entity_id,composition_work_id,composition_season_id,composition_universe_id ON anime_catalog FOR EACH ROW EXECUTE FUNCTION canonical_public_reference_scope();
  DROP TRIGGER IF EXISTS canonical_public_reference_scope ON user_entity_status;
  CREATE TRIGGER canonical_public_reference_scope BEFORE INSERT OR UPDATE OF canonical_entity_id,release_entity_id ON user_entity_status FOR EACH ROW EXECUTE FUNCTION canonical_public_reference_scope();
  DROP TRIGGER IF EXISTS canonical_public_reference_scope ON entity_comments;
  CREATE TRIGGER canonical_public_reference_scope BEFORE INSERT OR UPDATE OF canonical_entity_id,release_entity_id ON entity_comments FOR EACH ROW EXECUTE FUNCTION canonical_public_reference_scope();
  DROP TRIGGER IF EXISTS canonical_public_reference_scope ON user_addons;
  CREATE TRIGGER canonical_public_reference_scope BEFORE INSERT OR UPDATE OF canonical_plugin_id ON user_addons FOR EACH ROW EXECUTE FUNCTION canonical_public_reference_scope();
  CREATE TABLE IF NOT EXISTS canonical_collection_schedules (
    id UUID PRIMARY KEY,
    source_key TEXT NOT NULL CHECK(source_key='anilist:airing-schedule'),
    initial_start BIGINT NOT NULL CHECK(initial_start>=1000 AND initial_start%1000=0),
    window_ms BIGINT NOT NULL CHECK(window_ms>=1000 AND window_ms%1000=0),
    interval_ms BIGINT NOT NULL CHECK(interval_ms>=2100),
    lookback_ms BIGINT NOT NULL CHECK(lookback_ms>=0 AND lookback_ms<window_ms AND lookback_ms%1000=0),
    sequence BIGINT NOT NULL DEFAULT 0 CHECK(sequence>=0),
    next_start BIGINT NOT NULL,
    due_at BIGINT NOT NULL CHECK(due_at>=0),
    CHECK(next_start=initial_start+sequence*(window_ms-lookback_ms)),
    CHECK(next_start+window_ms<=2147483647000)
  );
  CREATE TABLE IF NOT EXISTS canonical_collection_retries (
    schedule_id UUID NOT NULL REFERENCES canonical_collection_schedules(id),
    sequence BIGINT NOT NULL CHECK(sequence>=0),
    retry_at BIGINT NOT NULL CHECK(retry_at>=0 AND retry_at<=8640000000000000),
    rate_limit_until BIGINT NOT NULL DEFAULT 0 CHECK(rate_limit_until>=0 AND rate_limit_until<=retry_at),
    failures INTEGER NOT NULL CHECK(failures>0),
    code TEXT NOT NULL CHECK(code IN ('collection_failed','source_rate_limited')),
    PRIMARY KEY(schedule_id,sequence)
  );
  CREATE INDEX IF NOT EXISTS canonical_collection_retries_due ON canonical_collection_retries(retry_at,schedule_id);
  CREATE OR REPLACE FUNCTION canonical_collection_retry_transition() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE current_sequence BIGINT;
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Collection retry deletion forbidden'; END IF;
    SELECT sequence INTO current_sequence FROM canonical_collection_schedules WHERE id=NEW.schedule_id FOR UPDATE;
    IF current_sequence IS NULL OR current_sequence<>NEW.sequence THEN RAISE EXCEPTION 'Stale collection retry'; END IF;
    IF TG_OP='INSERT' THEN
      IF NEW.failures<>1 OR (NEW.code='source_rate_limited' AND NEW.rate_limit_until<>NEW.retry_at)
        OR (NEW.code='collection_failed' AND NEW.rate_limit_until<>0) THEN RAISE EXCEPTION 'Invalid initial retry'; END IF;
    ELSIF (NEW.schedule_id,NEW.sequence) IS DISTINCT FROM (OLD.schedule_id,OLD.sequence)
      OR NEW.failures<>OLD.failures+1 OR NEW.retry_at<OLD.retry_at OR NEW.rate_limit_until<OLD.rate_limit_until
      OR (NEW.code='collection_failed' AND NEW.rate_limit_until<>OLD.rate_limit_until)
      OR (NEW.code='source_rate_limited' AND NEW.rate_limit_until<>NEW.retry_at) THEN
      RAISE EXCEPTION 'Invalid collection retry transition';
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_collection_retry_transition ON canonical_collection_retries;
  CREATE TRIGGER canonical_collection_retry_transition BEFORE INSERT OR UPDATE OR DELETE ON canonical_collection_retries FOR EACH ROW EXECUTE FUNCTION canonical_collection_retry_transition();
  DROP TRIGGER IF EXISTS canonical_collection_retry_truncate ON canonical_collection_retries;
  CREATE TRIGGER canonical_collection_retry_truncate BEFORE TRUNCATE ON canonical_collection_retries FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
  CREATE INDEX IF NOT EXISTS canonical_collection_schedules_due ON canonical_collection_schedules(due_at,id);
  CREATE OR REPLACE FUNCTION canonical_collection_schedule_transition() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Collection schedule deletion forbidden'; END IF;
    IF TG_OP='INSERT' THEN
      IF NEW.sequence<>0 OR NEW.next_start<>NEW.initial_start THEN RAISE EXCEPTION 'Invalid initial schedule'; END IF;
    ELSIF NEW IS DISTINCT FROM OLD THEN
      IF (NEW.id,NEW.source_key,NEW.initial_start,NEW.window_ms,NEW.interval_ms,NEW.lookback_ms)
         IS DISTINCT FROM (OLD.id,OLD.source_key,OLD.initial_start,OLD.window_ms,OLD.interval_ms,OLD.lookback_ms)
         OR NEW.sequence<>OLD.sequence+1 OR NEW.due_at<OLD.due_at+OLD.interval_ms
         OR NOT EXISTS(SELECT 1 FROM canonical_collection_windows WHERE source_key=OLD.source_key
           AND scope='schedule:'||OLD.id::text||':'||OLD.sequence::text AND status='complete'
           AND window_start=OLD.next_start AND window_end=OLD.next_start+OLD.window_ms)
      THEN RAISE EXCEPTION 'Invalid collection schedule advance'; END IF;
    END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_collection_schedule_transition ON canonical_collection_schedules;
  CREATE TRIGGER canonical_collection_schedule_transition BEFORE INSERT OR UPDATE OR DELETE ON canonical_collection_schedules FOR EACH ROW EXECUTE FUNCTION canonical_collection_schedule_transition();
  DROP TRIGGER IF EXISTS canonical_collection_schedule_truncate ON canonical_collection_schedules;
  CREATE TRIGGER canonical_collection_schedule_truncate BEFORE TRUNCATE ON canonical_collection_schedules FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
  CREATE OR REPLACE FUNCTION canonical_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Canonical release is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END $$;
  DROP TRIGGER IF EXISTS canonical_release_immutable ON canonical_plugin_releases;
  CREATE TRIGGER canonical_release_immutable BEFORE UPDATE ON canonical_plugin_releases FOR EACH ROW EXECUTE FUNCTION canonical_release_immutable();
  ${mediaRefreshSchemaSQL}
  ${imdbDatasetSchemaSQL}
`;
