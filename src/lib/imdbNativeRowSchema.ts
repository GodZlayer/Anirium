export const imdbNativeRowSchemaSQL=String.raw`
 CREATE OR REPLACE FUNCTION canonical_imdb_row_facts(dataset TEXT,line TEXT) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
 DECLARE c TEXT[]; names TEXT[]; types TEXT[]; vals JSONB[]; result JSONB='[]'; n NUMERIC; i INTEGER; v JSONB;
 BEGIN
  IF dataset IS NULL OR dataset NOT IN ('basics','ratings') OR line IS NULL OR length(line)>1048576 OR position(chr(10) IN line)>0 OR position(chr(13) IN line)>0 THEN
   RAISE EXCEPTION 'Invalid IMDb SQL row' USING ERRCODE='23514';
  END IF;
  c=string_to_array(line,chr(9));
  IF cardinality(c)<>(CASE WHEN dataset='basics' THEN 9 ELSE 3 END) OR c[1]!~'^tt[0-9]{7,12}$' THEN
   RAISE EXCEPTION 'Invalid IMDb SQL columns or identity' USING ERRCODE='23514';
  END IF;
  IF dataset='ratings' THEN
   IF c[2]!~'^(0|[1-9][0-9]*)([.][0-9]+)?$' OR c[3]!~'^(0|[1-9][0-9]*)$' THEN
    RAISE EXCEPTION 'Invalid IMDb SQL rating' USING ERRCODE='23514';
   END IF;
   IF c[2]::numeric>10 OR c[3]::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid IMDb SQL rating range' USING ERRCODE='23514'; END IF;
   names=ARRAY['media.averageRating','media.numVotes','source.id'];types=ARRAY['number','number','string'];
   vals=ARRAY[to_jsonb(c[2]::numeric),to_jsonb(c[3]::numeric),to_jsonb(c[1])];
  ELSE
   IF c[2] IN ('','\N') OR c[3] IN ('','\N') OR c[4] IN ('','\N') OR c[5] NOT IN ('0','1','\N') THEN
    RAISE EXCEPTION 'Invalid IMDb SQL required text or boolean' USING ERRCODE='23514';
   END IF;
   names=ARRAY['media.titleType','media.primaryTitle','media.originalTitle','media.isAdult','media.startYear','media.endYear','media.durationMinutes','media.genres','source.id'];
   types=ARRAY['string','string','string','boolean','number','number','number','string-list','string'];
   vals=ARRAY[to_jsonb(c[2]),to_jsonb(c[3]),to_jsonb(c[4]),CASE WHEN c[5]='\N' THEN 'null'::jsonb ELSE to_jsonb(c[5]='1') END];
   FOR i IN 6..8 LOOP
    IF c[i]='\N' THEN v='null'::jsonb;
    ELSE
     IF c[i]!~'^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION 'Invalid IMDb SQL integer' USING ERRCODE='23514'; END IF;
     n=c[i]::numeric;
     IF n>(CASE WHEN i=8 THEN 2147483647 ELSE 9999 END) THEN RAISE EXCEPTION 'Invalid IMDb SQL integer range' USING ERRCODE='23514'; END IF;
     v=to_jsonb(n);
    END IF;
    vals=array_append(vals,v);
   END LOOP;
   IF c[9]='\N' THEN v='null'::jsonb;
   ELSE
    IF cardinality(string_to_array(c[9],','))>3 OR EXISTS(SELECT 1 FROM unnest(string_to_array(c[9],',')) genre WHERE btrim(genre)='') OR c[9]='' THEN
     RAISE EXCEPTION 'Invalid IMDb SQL genres' USING ERRCODE='23514';
    END IF;
    v=to_jsonb(string_to_array(c[9],','));
   END IF;
   vals=array_append(vals,v);vals=array_append(vals,to_jsonb(c[1]));
  END IF;
  FOR i IN 1..cardinality(names) LOOP
   result=result||jsonb_build_array(jsonb_build_object('field',names[i],'type',CASE WHEN vals[i]='null'::jsonb THEN 'null' ELSE types[i] END,'value',vals[i]));
  END LOOP;
  RETURN result;
 END $$;
`;
