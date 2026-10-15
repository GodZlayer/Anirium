import { anilistObservationFields } from './anilistMediaDetails';
/** Native periodic source observations; receipts and facts advance together. */
export const mediaRefreshSchemaSQL = `
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='canonical_content_facts'::regclass AND conname='anilist_media_fact_contract' AND pg_get_constraintdef(oid) LIKE '%media.description%') THEN
 ALTER TABLE canonical_content_facts DROP CONSTRAINT IF EXISTS anilist_media_fact_contract;
 ALTER TABLE canonical_content_facts ADD CONSTRAINT anilist_media_fact_contract CHECK(source_key<>'anilist:media' OR COALESCE(
  CASE
   WHEN field='media.episodes' THEN value_type='null' OR (value_type='number' AND jsonb_typeof(value)='number' AND
    CASE WHEN jsonb_typeof(value)='number' THEN value::text::numeric BETWEEN 0 AND 2147483647 AND mod(value::text::numeric,1)=0 ELSE FALSE END)
   WHEN field='media.averageScore' THEN value_type='null' OR (value_type='number' AND jsonb_typeof(value)='number' AND
    CASE WHEN jsonb_typeof(value)='number' THEN value::text::numeric BETWEEN 0 AND 100 AND mod(value::text::numeric,1)=0 ELSE FALSE END)
   WHEN field='media.idMal' THEN value_type='null' OR (value_type='string' AND value #>> '{}' ~ '^[1-9][0-9]{0,9}$' AND
    CASE WHEN value #>> '{}' ~ '^[1-9][0-9]{0,9}$' THEN (value #>> '{}')::numeric<=2147483647 ELSE FALSE END)
   WHEN field='media.countryOfOrigin' THEN value_type='null' OR (value_type='string' AND value #>> '{}' ~ '^[A-Z]{2}$')
   WHEN field IN ('media.status','media.format') THEN value_type='null' OR (value_type='string' AND length(btrim(value #>> '{}'))>0 AND length(value #>> '{}')<=40)
   WHEN field IN ('title.romaji','title.english','title.native') THEN value_type='null' OR (value_type='string' AND length(btrim(value #>> '{}'))>0 AND length(value #>> '{}')<=10000)
   WHEN field='source.topology.sha256' THEN value_type='string' AND value #>> '{}' ~ '^[a-f0-9]{64}$'
   WHEN field='source.topology.snapshot' THEN value_type='string' AND length(value #>> '{}') BETWEEN 1 AND 100000
   WHEN field IN ('media.genres','media.synonyms') THEN value_type='null' OR (value_type='string-list' AND canonical_string_list_is_valid(value))
   WHEN field IN ('media.isAdult','media.isLicensed') THEN value_type IN ('null','boolean')
   WHEN field='media.description' THEN value_type='null' OR (value_type='string' AND length(value #>> '{}')<=100000)
   WHEN field='media.hashtag' THEN value_type='null' OR (value_type='string' AND length(value #>> '{}')<=10000)
   WHEN field='media.season' THEN value_type='null' OR (value_type='string' AND length(value #>> '{}')<=40)
   WHEN field='media.source' THEN value_type='null' OR (value_type='string' AND length(value #>> '{}')<=80)
   WHEN field='media.durationMinutes' THEN value_type='null' OR (value_type='number' AND jsonb_typeof(value)='number' AND
    CASE WHEN jsonb_typeof(value)='number' THEN value::text::numeric BETWEEN 0 AND 2147483647 AND mod(value::text::numeric,1)=0 ELSE FALSE END)
   WHEN field IN ('media.seasonYear','media.startDate.year','media.endDate.year') THEN value_type='null' OR (value_type='number' AND jsonb_typeof(value)='number' AND
    CASE WHEN jsonb_typeof(value)='number' THEN value::text::numeric BETWEEN 1 AND 9999 AND mod(value::text::numeric,1)=0 ELSE FALSE END)
   WHEN field IN ('media.startDate.month','media.endDate.month') THEN value_type='null' OR (value_type='number' AND jsonb_typeof(value)='number' AND
    CASE WHEN jsonb_typeof(value)='number' THEN value::text::numeric BETWEEN 1 AND 12 AND mod(value::text::numeric,1)=0 ELSE FALSE END)
   WHEN field IN ('media.startDate.day','media.endDate.day') THEN value_type='null' OR (value_type='number' AND jsonb_typeof(value)='number' AND
    CASE WHEN jsonb_typeof(value)='number' THEN value::text::numeric BETWEEN 1 AND 31 AND mod(value::text::numeric,1)=0 ELSE FALSE END)
   WHEN field='media.sourceUpdatedAt' THEN value_type='null' OR (value_type='instant' AND jsonb_typeof(value)='number' AND
    CASE WHEN jsonb_typeof(value)='number' THEN value::text::numeric BETWEEN 0 AND 2147483647000 AND mod(value::text::numeric,1000)=0 ELSE FALSE END)
   WHEN field='media.cover.color' THEN value_type='null' OR (value_type='string' AND value #>> '{}' ~ '^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$')
   WHEN field IN ('media.siteUrl','media.bannerImage','media.cover.extraLarge','media.cover.large','media.cover.medium') THEN
    value_type='null' OR (value_type='string' AND length(value #>> '{}')<=4096 AND value #>> '{}' ~ '^https://[A-Za-z0-9.-]+([/?#][^[:space:]]*)?$')
   ELSE FALSE
  END,FALSE));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION canonical_partial_date_is_valid(y JSONB,m JSONB,d JSONB) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN m='null'::jsonb OR d='null'::jsonb THEN TRUE
  WHEN jsonb_typeof(m)='number' AND jsonb_typeof(d)='number' AND (y='null'::jsonb OR jsonb_typeof(y)='number') THEN
   CASE WHEN m::text::numeric BETWEEN 1 AND 12 AND d::text::numeric BETWEEN 1 AND 31
    AND CASE WHEN y='null'::jsonb THEN TRUE ELSE y::text::numeric BETWEEN 1 AND 9999 END THEN
     d::text::numeric<=EXTRACT(day FROM make_date(CASE WHEN y='null'::jsonb THEN 2000 ELSE y::text::integer END,m::text::integer,1)+INTERVAL '1 month - 1 day')
    ELSE FALSE END
  ELSE FALSE END
$$;
CREATE OR REPLACE FUNCTION canonical_media_date_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefix TEXT; y JSONB; m JSONB; d JSONB; components INTEGER;
BEGIN
 prefix=split_part(NEW.field,'.',1)||'.'||split_part(NEW.field,'.',2);
 SELECT COUNT(*) INTO components FROM canonical_content_facts WHERE alias_id=NEW.alias_id AND source_key=NEW.source_key
  AND observed_at=NEW.observed_at AND field IN(prefix||'.year',prefix||'.month',prefix||'.day');
 IF components<>3 THEN RAISE EXCEPTION 'Incomplete source partial date'; END IF;
 SELECT value INTO y FROM canonical_content_facts WHERE alias_id=NEW.alias_id AND source_key=NEW.source_key AND observed_at=NEW.observed_at AND field=prefix||'.year';
 SELECT value INTO m FROM canonical_content_facts WHERE alias_id=NEW.alias_id AND source_key=NEW.source_key AND observed_at=NEW.observed_at AND field=prefix||'.month';
 SELECT value INTO d FROM canonical_content_facts WHERE alias_id=NEW.alias_id AND source_key=NEW.source_key AND observed_at=NEW.observed_at AND field=prefix||'.day';
 IF NOT canonical_partial_date_is_valid(y,m,d) THEN RAISE EXCEPTION 'Invalid source partial date'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_media_date_fact_guard ON canonical_content_facts;
CREATE CONSTRAINT TRIGGER canonical_media_date_fact_guard AFTER INSERT ON canonical_content_facts DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN(NEW.source_key='anilist:media' AND NEW.field IN('media.startDate.year','media.startDate.month','media.startDate.day','media.endDate.year','media.endDate.month','media.endDate.day'))
 EXECUTE FUNCTION canonical_media_date_fact_guard();
CREATE TABLE IF NOT EXISTS canonical_media_refresh_jobs (
 alias_id UUID PRIMARY KEY REFERENCES canonical_aliases(id),
 interval_ms BIGINT NOT NULL CHECK(interval_ms BETWEEN 2100 AND 8640000000000000),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
 due_at BIGINT NOT NULL CHECK(due_at BETWEEN 0 AND 8640000000000000),
 observed_at BIGINT CHECK(observed_at BETWEEN 0 AND 8640000000000000)
);
CREATE INDEX IF NOT EXISTS canonical_media_refresh_due ON canonical_media_refresh_jobs(due_at,alias_id);
CREATE TABLE IF NOT EXISTS canonical_media_refresh_receipts (
 alias_id UUID NOT NULL REFERENCES canonical_media_refresh_jobs(alias_id),
 revision BIGINT NOT NULL CHECK(revision>0 AND revision<=9007199254740991),
 observed_at BIGINT NOT NULL CHECK(observed_at BETWEEN 0 AND 8640000000000000),
 topology_hash TEXT NOT NULL CHECK(topology_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(alias_id,revision)
);
CREATE OR REPLACE FUNCTION canonical_media_refresh_receipt_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_revision BIGINT;
BEGIN
 SELECT revision INTO current_revision FROM canonical_media_refresh_jobs WHERE alias_id=NEW.alias_id FOR UPDATE;
 IF NEW.revision<>current_revision+1 OR NOT EXISTS(SELECT 1 FROM canonical_aliases a JOIN canonical_entities e ON e.id=a.entity_id
  WHERE a.id=NEW.alias_id AND a.namespace='anilist:season' AND a.state='active' AND e.kind='SEASON' AND e.visibility='public') OR NOT EXISTS(
  SELECT 1 FROM canonical_content_facts f JOIN canonical_content_facts snapshot
   ON snapshot.entity_id=f.entity_id AND snapshot.alias_id=f.alias_id AND snapshot.source_key=f.source_key
    AND snapshot.observed_at=f.observed_at AND snapshot.field='source.topology.snapshot' AND snapshot.value_type='string'
  WHERE f.alias_id=NEW.alias_id AND f.source_key='anilist:media'
   AND f.field='source.topology.sha256' AND f.observed_at=NEW.observed_at AND f.value_type='string'
   AND f.value=to_jsonb(NEW.topology_hash)
   AND encode(sha256(convert_to(snapshot.value #>> '{}','UTF8')),'hex')=NEW.topology_hash) OR
  (SELECT COUNT(*) FROM canonical_content_facts f WHERE f.alias_id=NEW.alias_id AND f.source_key='anilist:media'
   AND f.observed_at=NEW.observed_at AND f.field=ANY(ARRAY[${anilistObservationFields.map(field=>`'${field}'`).join(',')}]))<>${anilistObservationFields.length}
 THEN RAISE EXCEPTION 'Refresh receipt lacks current source facts'; END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('media.startDate'),('media.endDate')) prefix(field)
   WHERE NOT canonical_partial_date_is_valid(
    (SELECT value FROM canonical_content_facts WHERE alias_id=NEW.alias_id AND source_key='anilist:media' AND observed_at=NEW.observed_at AND field=prefix.field||'.year'),
    (SELECT value FROM canonical_content_facts WHERE alias_id=NEW.alias_id AND source_key='anilist:media' AND observed_at=NEW.observed_at AND field=prefix.field||'.month'),
    (SELECT value FROM canonical_content_facts WHERE alias_id=NEW.alias_id AND source_key='anilist:media' AND observed_at=NEW.observed_at AND field=prefix.field||'.day')))
 THEN RAISE EXCEPTION 'Refresh receipt has invalid partial date'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_media_refresh_receipt_scope ON canonical_media_refresh_receipts;
CREATE TRIGGER canonical_media_refresh_receipt_scope BEFORE INSERT ON canonical_media_refresh_receipts FOR EACH ROW EXECUTE FUNCTION canonical_media_refresh_receipt_scope();
CREATE OR REPLACE FUNCTION canonical_media_refresh_receipt_complete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM canonical_media_refresh_jobs WHERE alias_id=NEW.alias_id AND revision>=NEW.revision)
 THEN RAISE EXCEPTION 'Refresh receipt was not committed with job'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_media_refresh_receipt_complete ON canonical_media_refresh_receipts;
CREATE CONSTRAINT TRIGGER canonical_media_refresh_receipt_complete AFTER INSERT ON canonical_media_refresh_receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_media_refresh_receipt_complete();
DROP TRIGGER IF EXISTS canonical_media_refresh_receipt_immutable ON canonical_media_refresh_receipts;
CREATE TRIGGER canonical_media_refresh_receipt_immutable BEFORE UPDATE OR DELETE ON canonical_media_refresh_receipts FOR EACH ROW EXECUTE FUNCTION canonical_ingestion_immutable();
DROP TRIGGER IF EXISTS canonical_media_refresh_receipt_truncate ON canonical_media_refresh_receipts;
CREATE TRIGGER canonical_media_refresh_receipt_truncate BEFORE TRUNCATE ON canonical_media_refresh_receipts FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
CREATE OR REPLACE FUNCTION canonical_media_refresh_job_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Refresh job deletion forbidden'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>0 OR NEW.observed_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM canonical_aliases a
   JOIN canonical_entities e ON e.id=a.entity_id WHERE a.id=NEW.alias_id AND a.namespace='anilist:season'
   AND a.state='active' AND a.value ~ '^[1-9][0-9]{0,9}$' AND a.value::numeric<=2147483647
   AND e.kind='SEASON' AND e.visibility='public') THEN RAISE EXCEPTION 'Invalid initial refresh job'; END IF;
 ELSIF NEW IS DISTINCT FROM OLD THEN
  IF NEW.alias_id<>OLD.alias_id OR NEW.interval_ms<>OLD.interval_ms OR NEW.revision<>OLD.revision+1
   OR NEW.observed_at IS NULL OR NEW.observed_at<OLD.due_at OR (OLD.observed_at IS NOT NULL AND NEW.observed_at<OLD.observed_at)
   OR NEW.due_at<GREATEST(OLD.due_at,NEW.observed_at)+OLD.interval_ms
   OR NOT EXISTS(SELECT 1 FROM canonical_media_refresh_receipts r WHERE r.alias_id=NEW.alias_id
    AND r.revision=NEW.revision AND r.observed_at=NEW.observed_at)
   THEN RAISE EXCEPTION 'Invalid refresh advance'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_media_refresh_job_transition ON canonical_media_refresh_jobs;
CREATE TRIGGER canonical_media_refresh_job_transition BEFORE INSERT OR UPDATE OR DELETE ON canonical_media_refresh_jobs FOR EACH ROW EXECUTE FUNCTION canonical_media_refresh_job_transition();
DROP TRIGGER IF EXISTS canonical_media_refresh_job_truncate ON canonical_media_refresh_jobs;
CREATE TRIGGER canonical_media_refresh_job_truncate BEFORE TRUNCATE ON canonical_media_refresh_jobs FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
CREATE TABLE IF NOT EXISTS canonical_media_refresh_retries (
 alias_id UUID NOT NULL REFERENCES canonical_media_refresh_jobs(alias_id),
 revision BIGINT NOT NULL CHECK(revision>=0),
 retry_at BIGINT NOT NULL CHECK(retry_at BETWEEN 0 AND 8640000000000000),
 rate_limit_until BIGINT NOT NULL CHECK(rate_limit_until BETWEEN 0 AND retry_at),
 failures INTEGER NOT NULL CHECK(failures>0),
 code TEXT NOT NULL CHECK(code IN ('refresh_failed','source_rate_limited')),
 PRIMARY KEY(alias_id,revision)
);
CREATE INDEX IF NOT EXISTS canonical_media_refresh_retry_due ON canonical_media_refresh_retries(retry_at,alias_id);
CREATE OR REPLACE FUNCTION canonical_media_refresh_retry_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_revision BIGINT;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Refresh retry deletion forbidden'; END IF;
 SELECT revision INTO current_revision FROM canonical_media_refresh_jobs WHERE alias_id=NEW.alias_id FOR UPDATE;
 IF NEW.revision<>current_revision THEN RAISE EXCEPTION 'Stale refresh retry'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.failures<>1 OR (NEW.code='source_rate_limited' AND NEW.rate_limit_until<>NEW.retry_at)
   OR (NEW.code='refresh_failed' AND NEW.rate_limit_until<>0) THEN RAISE EXCEPTION 'Invalid initial refresh retry'; END IF;
 ELSE
  IF (NEW.alias_id,NEW.revision) IS DISTINCT FROM (OLD.alias_id,OLD.revision) OR NEW.failures<>OLD.failures+1
   OR NEW.retry_at<OLD.retry_at OR NEW.rate_limit_until<OLD.rate_limit_until
   OR (NEW.code='refresh_failed' AND NEW.rate_limit_until<>OLD.rate_limit_until)
   OR (NEW.code='source_rate_limited' AND NEW.rate_limit_until<>NEW.retry_at) THEN RAISE EXCEPTION 'Invalid refresh retry'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_media_refresh_retry_transition ON canonical_media_refresh_retries;
CREATE TRIGGER canonical_media_refresh_retry_transition BEFORE INSERT OR UPDATE OR DELETE ON canonical_media_refresh_retries FOR EACH ROW EXECUTE FUNCTION canonical_media_refresh_retry_transition();
DROP TRIGGER IF EXISTS canonical_media_refresh_retry_truncate ON canonical_media_refresh_retries;
CREATE TRIGGER canonical_media_refresh_retry_truncate BEFORE TRUNCATE ON canonical_media_refresh_retries FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
`;
