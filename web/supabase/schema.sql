-- New, isolated tables. Existing legacy tables and Data API settings are untouched.
CREATE FUNCTION public.health_web_valid_record(category text, record_key text, payload jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE required text[]; numeric_fields text[]; field text; number_value numeric;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  CASE category
    WHEN 'body' THEN required:=ARRAY['date','weight','bodyFat']; numeric_fields:=ARRAY['weight','bodyFat'];
    WHEN 'sleep' THEN required:=ARRAY['date','hours','nightHours','napHours']; numeric_fields:=ARRAY['hours','nightHours','napHours'];
    WHEN 'pending' THEN required:=ARRAY['date','weight','bodyFat','nightHours','napHours']; numeric_fields:=ARRAY['weight','bodyFat','nightHours','napHours'];
    WHEN 'exercise' THEN required:=ARRAY['date','type']; numeric_fields:=ARRAY[]::text[];
    WHEN 'workout' THEN required:=ARRAY['recordKey','date','time','species','durationMinutes','distanceKm','caloriesKcal']; numeric_fields:=ARRAY['durationMinutes','distanceKm','caloriesKcal'];
    WHEN 'vo2' THEN required:=ARRAY['date','value','source']; numeric_fields:=ARRAY['value'];
    ELSE RETURN false;
  END CASE;
  IF NOT payload ?& required OR payload - required <> '{}'::jsonb THEN RETURN false; END IF;
  IF jsonb_typeof(payload->'date') IS DISTINCT FROM 'string' OR
     (payload->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
  PERFORM (payload->>'date')::date;
  IF category='workout' THEN
    IF jsonb_typeof(payload->'recordKey') IS DISTINCT FROM 'string' OR record_key IS DISTINCT FROM payload->>'recordKey'
      OR (payload->>'species') NOT IN ('Walking','Running','Cycling')
      OR jsonb_typeof(payload->'species') IS DISTINCT FROM 'string'
      OR jsonb_typeof(payload->'time') IS DISTINCT FROM 'string'
      OR (payload->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' THEN RETURN false; END IF;
  ELSIF category='exercise' THEN
    IF jsonb_typeof(payload->'type') IS DISTINCT FROM 'string' OR length(payload->>'type') NOT BETWEEN 1 AND 80
      OR record_key IS DISTINCT FROM (payload->>'date') || '|' || (payload->>'type') THEN RETURN false; END IF;
  ELSIF record_key IS DISTINCT FROM payload->>'date' THEN RETURN false;
  END IF;
  FOREACH field IN ARRAY numeric_fields LOOP
    IF jsonb_typeof(payload->field)='null' THEN CONTINUE; END IF;
    IF jsonb_typeof(payload->field) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    number_value:=(payload->>field)::numeric;
    IF number_value < 0 THEN RETURN false; END IF;
    IF field='weight' AND (number_value<=0 OR number_value>500) THEN RETURN false; END IF;
    IF field='bodyFat' AND number_value>100 THEN RETURN false; END IF;
    IF field IN ('hours','nightHours','napHours') AND number_value>24 THEN RETURN false; END IF;
  END LOOP;
  IF category IN ('sleep','pending') THEN
    IF (payload->'nightHours'='null'::jsonb) <> (payload->'napHours'='null'::jsonb) THEN RETURN false; END IF;
    IF coalesce((payload->>'nightHours')::numeric,0)+coalesce((payload->>'napHours')::numeric,0)>24 THEN RETURN false; END IF;
  END IF;
  IF category='pending' AND payload->'weight'='null'::jsonb AND payload->'bodyFat'='null'::jsonb AND payload->'nightHours'='null'::jsonb THEN RETURN false; END IF;
  IF category='vo2' AND (jsonb_typeof(payload->'value') IS DISTINCT FROM 'number'
    OR (payload->>'value')::numeric<=0 OR (payload->>'value')::numeric>=200
    OR jsonb_typeof(payload->'source') IS DISTINCT FROM 'string'
    OR (payload->>'source') NOT IN ('export','journal')) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.health_web_valid_record(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_web_valid_record(text,text,jsonb) TO authenticated;

CREATE TABLE public.health_web_owner (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid UNIQUE NOT NULL
);
ALTER TABLE public.health_web_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_web_owner FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.health_web_owner FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.health_web_owner TO authenticated;
CREATE POLICY health_web_owner_read ON public.health_web_owner
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE TABLE public.health_web_records (
  owner_id uuid NOT NULL REFERENCES public.health_web_owner(user_id),
  category text NOT NULL CHECK (category IN ('body','sleep','exercise','workout','pending','vo2')),
  record_key text NOT NULL CHECK (length(record_key) BETWEEN 1 AND 500),
  payload jsonb NOT NULL CHECK (public.health_web_valid_record(category,record_key,payload)),
  PRIMARY KEY (owner_id, category, record_key)
);
ALTER TABLE public.health_web_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_web_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.health_web_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.health_web_records TO authenticated;
CREATE POLICY health_web_records_read ON public.health_web_records
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND owner_id IN (SELECT user_id FROM public.health_web_owner));
CREATE POLICY health_web_records_insert ON public.health_web_records
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) AND owner_id IN (SELECT user_id FROM public.health_web_owner));
CREATE POLICY health_web_records_update ON public.health_web_records
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND owner_id IN (SELECT user_id FROM public.health_web_owner))
  WITH CHECK (owner_id = (SELECT auth.uid()) AND owner_id IN (SELECT user_id FROM public.health_web_owner));

CREATE FUNCTION public.health_web_archive() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.health_web_owner WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_object_agg(category, records) INTO result FROM (
    SELECT category, coalesce((SELECT jsonb_agg(payload ORDER BY record_key)
      FROM public.health_web_records r WHERE r.category = categories.category AND owner_id = auth.uid()), '[]'::jsonb) records
    FROM unnest(ARRAY['body','sleep','exercise','workout','pending','vo2']) categories(category)
  ) grouped;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.health_web_archive() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_web_archive() TO authenticated;

CREATE FUNCTION public.health_web_import(batch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE entry jsonb; existing jsonb; inserted_count integer := 0; unchanged_count integer := 0; affected integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.health_web_owner WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(batch) IS DISTINCT FROM 'array' OR jsonb_array_length(batch) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid import batch';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(batch) e
    GROUP BY e->>'category', e->>'key' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate keys in import batch';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(batch) LOOP
    IF jsonb_typeof(entry) IS DISTINCT FROM 'object'
      OR NOT entry ?& ARRAY['category','key','payload']
      OR entry - ARRAY['category','key','payload'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Invalid import record';
    END IF;
    SELECT payload INTO existing FROM public.health_web_records
      WHERE owner_id=auth.uid() AND category=entry->>'category' AND record_key=entry->>'key';
    IF FOUND AND existing IS DISTINCT FROM entry->'payload' THEN
      RAISE EXCEPTION 'Record conflict; existing values retained' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.health_web_records(owner_id,category,record_key,payload)
      VALUES (auth.uid(),entry->>'category',entry->>'key',entry->'payload')
      ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT;
    SELECT payload INTO existing FROM public.health_web_records
      WHERE owner_id=auth.uid() AND category=entry->>'category' AND record_key=entry->>'key';
    IF existing IS DISTINCT FROM entry->'payload' THEN
      RAISE EXCEPTION 'Record conflict; existing values retained' USING ERRCODE = '23505';
    END IF;
    inserted_count := inserted_count + affected;
    unchanged_count := unchanged_count + 1 - affected;
  END LOOP;
  RETURN jsonb_build_object('inserted',inserted_count,'unchanged',unchanged_count);
END $$;
REVOKE ALL ON FUNCTION public.health_web_import(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_web_import(jsonb) TO authenticated;

CREATE FUNCTION public.health_web_save_entry(entry jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.health_web_owner WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.health_web_valid_record('pending',entry->>'date',entry) THEN
    RAISE EXCEPTION 'Invalid manual entry';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  INSERT INTO public.health_web_records AS current(owner_id,category,record_key,payload)
    VALUES (auth.uid(),'pending',entry->>'date',entry)
    ON CONFLICT (owner_id,category,record_key) DO UPDATE SET payload = current.payload ||
      (SELECT jsonb_object_agg(key,value) FROM jsonb_each(EXCLUDED.payload) WHERE value <> 'null'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.health_web_save_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_web_save_entry(jsonb) TO authenticated;
