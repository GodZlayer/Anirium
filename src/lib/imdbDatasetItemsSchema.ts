export const imdbDatasetItemsSchemaSQL=`
 CREATE TABLE IF NOT EXISTS canonical_dataset_items(
  file_id UUID NOT NULL REFERENCES canonical_dataset_files(id),revision BIGINT NOT NULL CHECK(revision>0),
  row_number BIGINT NOT NULL CHECK(row_number>0),title_id TEXT NOT NULL CHECK(title_id ~ '^tt[0-9]{7,12}$'),
  raw_line TEXT NOT NULL CHECK(length(raw_line)<=1048576),entity_id TEXT REFERENCES canonical_entities(id),alias_id UUID REFERENCES canonical_aliases(id),
  PRIMARY KEY(file_id,row_number),UNIQUE(file_id,title_id),
  CHECK((entity_id IS NULL)=(alias_id IS NULL)),
  FOREIGN KEY(file_id,revision) REFERENCES canonical_dataset_batches(file_id,revision) DEFERRABLE INITIALLY DEFERRED
 );
 CREATE OR REPLACE FUNCTION canonical_dataset_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE f canonical_dataset_files%ROWTYPE; expected JSONB; fact JSONB;
 BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Dataset item is immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO f FROM canonical_dataset_files WHERE id=NEW.file_id FOR UPDATE;
  IF NOT FOUND OR NEW.revision<>f.revision+1 OR NEW.row_number<=f.next_row OR NEW.row_number>f.row_count THEN
   RAISE EXCEPTION 'Dataset item outside current batch' USING ERRCODE='23514';
  END IF;
  expected=canonical_imdb_row_facts(f.dataset,NEW.raw_line);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(expected) x WHERE x->>'field'='source.id' AND x->>'value'=NEW.title_id) THEN
   RAISE EXCEPTION 'Dataset item source identity mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW.entity_id IS NULL THEN
   IF EXISTS(SELECT 1 FROM canonical_aliases a JOIN canonical_entities e ON e.id=a.entity_id
    WHERE a.namespace='imdb:title' AND a.value=NEW.title_id AND a.state='active' AND e.visibility='public'
     AND e.kind IN ('UNIVERSE','ARC','WORK','SEASON','EPISODE')) THEN
    RAISE EXCEPTION 'Dataset item known identity cannot be unmatched' USING ERRCODE='23514';
   END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM canonical_aliases a JOIN canonical_entities e ON e.id=a.entity_id
    WHERE a.id=NEW.alias_id AND a.entity_id=NEW.entity_id AND a.namespace='imdb:title' AND a.value=NEW.title_id
     AND a.state='active' AND e.visibility='public' AND e.kind IN ('UNIVERSE','ARC','WORK','SEASON','EPISODE')) THEN
    RAISE EXCEPTION 'Dataset item proven alias unavailable' USING ERRCODE='23514';
   END IF;
   FOR fact IN SELECT value FROM jsonb_array_elements(expected) LOOP
    IF NOT EXISTS(SELECT 1 FROM canonical_content_facts c WHERE c.entity_id=NEW.entity_id AND c.alias_id=NEW.alias_id
     AND c.source_key='imdb:dataset:'||f.dataset AND c.observed_at=f.observed_at AND c.field=fact->>'field'
     AND c.value_type=fact->>'type' AND c.value=fact->'value') THEN
     RAISE EXCEPTION 'Dataset item requires exact typed source facts' USING ERRCODE='23514';
    END IF;
   END LOOP;
  END IF;
  RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS canonical_dataset_item_guard ON canonical_dataset_items;
 CREATE TRIGGER canonical_dataset_item_guard BEFORE INSERT OR UPDATE OR DELETE ON canonical_dataset_items FOR EACH ROW EXECUTE FUNCTION canonical_dataset_item_guard();
 DROP TRIGGER IF EXISTS canonical_dataset_item_truncate ON canonical_dataset_items;
 CREATE TRIGGER canonical_dataset_item_truncate BEFORE TRUNCATE ON canonical_dataset_items FOR EACH STATEMENT EXECUTE FUNCTION canonical_ingestion_immutable();
 CREATE OR REPLACE FUNCTION canonical_dataset_receipt_items() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE n BIGINT; first_row BIGINT; last_row BIGINT; applied BIGINT; unmatched BIGINT; actual_hash TEXT;
 BEGIN
  SELECT count(*),min(row_number),max(row_number),count(entity_id),count(*)-count(entity_id),
   encode(sha256(convert_to(string_agg(raw_line,chr(10) ORDER BY row_number)||chr(10),'UTF8')),'hex')
   INTO n,first_row,last_row,applied,unmatched,actual_hash
   FROM canonical_dataset_items WHERE file_id=NEW.file_id AND revision=NEW.revision;
  IF n<>NEW.end_row-NEW.start_row+1 OR first_row IS DISTINCT FROM NEW.start_row OR last_row IS DISTINCT FROM NEW.end_row
   OR applied<>NEW.applied_count OR unmatched<>NEW.unmatched_count OR actual_hash IS DISTINCT FROM NEW.sha256 THEN
   RAISE EXCEPTION 'Dataset receipt requires exact verified items' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS canonical_dataset_receipt_items ON canonical_dataset_batches;
 CREATE CONSTRAINT TRIGGER canonical_dataset_receipt_items AFTER INSERT ON canonical_dataset_batches DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION canonical_dataset_receipt_items();
`;
