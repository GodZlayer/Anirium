export const imdbIndexedArchiveSchemaSQL=`
 CREATE TABLE IF NOT EXISTS canonical_dataset_archives(
  file_id UUID PRIMARY KEY REFERENCES canonical_dataset_files(id),directory_id UUID NOT NULL UNIQUE,
  index_sha256 TEXT NOT NULL CHECK(index_sha256 ~ '^[0-9a-f]{64}$'),
  index_byte_size BIGINT NOT NULL CHECK(index_byte_size BETWEEN 0 AND 9007199254740991),
  data_byte_size BIGINT NOT NULL CHECK(data_byte_size BETWEEN 0 AND 9007199254740991),
  batch_count BIGINT NOT NULL CHECK(batch_count BETWEEN 0 AND 9007199254740991),
  CHECK(directory_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CHECK((batch_count=0)=(index_byte_size=0)),CHECK((batch_count=0)=(data_byte_size=0)),
  CHECK(index_byte_size<=batch_count::numeric*513),CHECK(data_byte_size<=batch_count::numeric*1048676),
  CHECK(batch_count<>0 OR index_sha256='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
 );
 CREATE OR REPLACE FUNCTION canonical_dataset_archive_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE n BIGINT;
 BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Dataset archive is immutable' USING ERRCODE='23514'; END IF;
  SELECT row_count INTO n FROM canonical_dataset_files WHERE id=NEW.file_id FOR SHARE;
  IF NOT FOUND OR NEW.batch_count>n OR NEW.batch_count::numeric*100<n THEN
   RAISE EXCEPTION 'Dataset archive batch coverage invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS canonical_dataset_archive_guard ON canonical_dataset_archives;
 CREATE TRIGGER canonical_dataset_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON canonical_dataset_archives FOR EACH ROW EXECUTE FUNCTION canonical_dataset_archive_guard();
 DROP TRIGGER IF EXISTS canonical_dataset_archive_truncate ON canonical_dataset_archives;
 CREATE TRIGGER canonical_dataset_archive_truncate BEFORE TRUNCATE ON canonical_dataset_archives FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
`;
