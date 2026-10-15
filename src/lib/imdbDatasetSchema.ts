import { imdbNativeRowSchemaSQL } from './imdbNativeRowSchema';
import { imdbDatasetItemsSchemaSQL } from './imdbDatasetItemsSchema';
import {imdbIndexedArchiveSchemaSQL} from './imdbIndexedArchiveSchema';
export const imdbDatasetSchemaSQL=`
 ${imdbNativeRowSchemaSQL}
 CREATE TABLE IF NOT EXISTS canonical_dataset_files(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),dataset TEXT NOT NULL CHECK(dataset IN ('basics','ratings')),
  compression TEXT NOT NULL CHECK(compression IN ('plain','gzip')),sha256 TEXT NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  byte_size BIGINT NOT NULL CHECK(byte_size BETWEEN 1 AND 9007199254740991),row_count BIGINT NOT NULL CHECK(row_count BETWEEN 0 AND 9007199254740991),
  observed_at BIGINT NOT NULL CHECK(observed_at BETWEEN 0 AND 8640000000000000),
  next_row BIGINT NOT NULL DEFAULT 0 CHECK(next_row>=0 AND next_row<=row_count),revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
  UNIQUE(dataset,sha256)
 );
 CREATE TABLE IF NOT EXISTS canonical_dataset_batches(
  file_id UUID NOT NULL REFERENCES canonical_dataset_files(id),revision BIGINT NOT NULL CHECK(revision>0),
  start_row BIGINT NOT NULL CHECK(start_row>0),end_row BIGINT NOT NULL CHECK(end_row>=start_row),
  applied_count BIGINT NOT NULL CHECK(applied_count>=0),unmatched_count BIGINT NOT NULL CHECK(unmatched_count>=0),
  sha256 TEXT NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(file_id,revision),UNIQUE(file_id,start_row),CHECK(applied_count+unmatched_count=end_row-start_row+1)
 );
 CREATE OR REPLACE FUNCTION canonical_dataset_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Dataset file is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.next_row<>0 OR NEW.revision<>0 THEN RAISE EXCEPTION 'Dataset file must start at zero' USING ERRCODE='23514'; END IF;
  ELSIF NEW IS DISTINCT FROM OLD THEN
   IF ROW(NEW.id,NEW.dataset,NEW.compression,NEW.sha256,NEW.byte_size,NEW.row_count,NEW.observed_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.dataset,OLD.compression,OLD.sha256,OLD.byte_size,OLD.row_count,OLD.observed_at)
    OR NEW.revision<>OLD.revision+1 OR NEW.next_row<=OLD.next_row OR NOT EXISTS(
     SELECT 1 FROM canonical_dataset_batches b WHERE b.file_id=OLD.id AND b.revision=NEW.revision
      AND b.start_row=OLD.next_row+1 AND b.end_row=NEW.next_row)
   THEN RAISE EXCEPTION 'Dataset checkpoint requires matching batch' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS canonical_dataset_file_guard ON canonical_dataset_files;
 CREATE TRIGGER canonical_dataset_file_guard BEFORE INSERT OR UPDATE OR DELETE ON canonical_dataset_files FOR EACH ROW EXECUTE FUNCTION canonical_dataset_file_guard();
 CREATE OR REPLACE FUNCTION canonical_dataset_batch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE f canonical_dataset_files%ROWTYPE;
 BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Dataset batch is immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO f FROM canonical_dataset_files WHERE id=NEW.file_id FOR UPDATE;
  IF NOT FOUND OR NEW.revision<>f.revision+1 OR NEW.start_row<>f.next_row+1 OR NEW.end_row>f.row_count THEN
   RAISE EXCEPTION 'Dataset batch must be contiguous' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS canonical_dataset_batch_guard ON canonical_dataset_batches;
 CREATE TRIGGER canonical_dataset_batch_guard BEFORE INSERT OR UPDATE OR DELETE ON canonical_dataset_batches FOR EACH ROW EXECUTE FUNCTION canonical_dataset_batch_guard();
 CREATE OR REPLACE FUNCTION canonical_dataset_batch_advanced() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM canonical_dataset_files WHERE id=NEW.file_id AND revision>=NEW.revision AND next_row>=NEW.end_row) THEN
   RAISE EXCEPTION 'Dataset batch requires atomic checkpoint advance' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS canonical_dataset_batch_advanced ON canonical_dataset_batches;
 CREATE CONSTRAINT TRIGGER canonical_dataset_batch_advanced AFTER INSERT ON canonical_dataset_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION canonical_dataset_batch_advanced();
 DROP TRIGGER IF EXISTS canonical_dataset_file_truncate ON canonical_dataset_files;
 CREATE TRIGGER canonical_dataset_file_truncate BEFORE TRUNCATE ON canonical_dataset_files FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
 DROP TRIGGER IF EXISTS canonical_dataset_batch_truncate ON canonical_dataset_batches;
 CREATE TRIGGER canonical_dataset_batch_truncate BEFORE TRUNCATE ON canonical_dataset_batches FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
 ${imdbDatasetItemsSchemaSQL}
 ${imdbIndexedArchiveSchemaSQL}
`;
