-- Phase 5, prepared and tested locally only. Does not promote installations.
DO $$ BEGIN
 IF current_user<>(SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.rpc_conexion_full_v1(uuid,text,jsonb)'::regprocedure) THEN RAISE EXCEPTION 'FULL_MIGRATION_OWNER_MISMATCH'; END IF;
END $$;

CREATE TABLE inventario.full_edge_rate (
 installation_id uuid PRIMARY KEY REFERENCES inventario.instalaciones(id) ON DELETE CASCADE,
 requests timestamptz[] NOT NULL CHECK(cardinality(requests)<=120)
);
CREATE TABLE inventario.full_exclusions (
 batch_id uuid NOT NULL,sede_id uuid NOT NULL,reason_code text NOT NULL,message text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(batch_id,sede_id),
 FOREIGN KEY(batch_id,sede_id) REFERENCES inventario.full_batch_sites(batch_id,sede_id),
 CHECK(reason_code IN ('WAREHOUSE_MISSING','LOCAL_STOCK_INVALID','LOCAL_VALIDATION_FAILED','ABANDONED_AFTER_RECONCILIATION')),
 CHECK(length(message) BETWEEN 1 AND 1024)
);
ALTER TABLE inventario.full_edge_rate ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.full_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventario.full_edge_rate,inventario.full_exclusions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.rpc_conexion_full_admit_v1(p_installation_id uuid,p_installation_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$
DECLARE r jsonb;ts timestamptz;recent timestamptz[];retry integer;
BEGIN
 r:=inventario.full_dispatch_v1(p_installation_id,p_installation_secret,'{"action":"bootstrap"}'::jsonb,clock_timestamp());
 IF NOT (r->>'ok')::boolean THEN RETURN jsonb_build_object('response',r); END IF;
 -- Authentication acquired config and installation locks first; rate is last.
 ts:=clock_timestamp();
 INSERT INTO inventario.full_edge_rate VALUES(p_installation_id,'{}') ON CONFLICT DO NOTHING;
 SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO recent FROM inventario.full_edge_rate t CROSS JOIN LATERAL unnest(t.requests)x
 WHERE t.installation_id=p_installation_id AND x>ts-interval '1 minute';
 IF cardinality(recent)>=120 THEN
  retry:=greatest(1,ceil(extract(epoch FROM recent[1]+interval '1 minute'-ts))::integer);
  RETURN jsonb_build_object('response',inventario.full_error_v1('RATE_LIMITED',ts),'retry_after',retry);
 END IF;
 UPDATE inventario.full_edge_rate SET requests=array_append(recent,ts) WHERE installation_id=p_installation_id;
 RETURN jsonb_build_object('response',r);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR query_canceled THEN RETURN jsonb_build_object('response',inventario.full_error_v1('TEMPORARILY_UNAVAILABLE',clock_timestamp()));
END $$;

CREATE FUNCTION public.rpc_conexion_full_catalog_v1(p_installation_id uuid,p_installation_secret text,p_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$
DECLARE r jsonb;cat inventario.versiones_catalogo%rowtype;
BEGIN
 r:=inventario.full_dispatch_v1(p_installation_id,p_installation_secret,'{"action":"bootstrap"}'::jsonb,clock_timestamp());
 IF NOT (r->>'ok')::boolean THEN RETURN jsonb_build_object('response',r); END IF;
 SELECT * INTO cat FROM inventario.versiones_catalogo WHERE schema_version=2 AND storage_path IS NOT NULL ORDER BY version DESC LIMIT 1;
 IF cat.version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('response',inventario.full_error_v1('CATALOG_MISMATCH',clock_timestamp())); END IF;
 RETURN jsonb_build_object('response',r,'catalog',jsonb_build_object('version',cat.version,'schema_version',cat.schema_version,'sha256',cat.hash,'size_bytes',cat.tamano_bytes,'storage_path',cat.storage_path));
END $$;

CREATE FUNCTION public.rpc_conexion_full_http_v1(p_installation_id uuid,p_installation_secret text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$
DECLARE auth jsonb;r jsonb;was_existing boolean:=false;http integer:=200;
BEGIN
 -- Serialize inspection and creation on the same installation as the dispatcher.
 auth:=inventario.full_dispatch_v1(p_installation_id,p_installation_secret,'{"action":"bootstrap"}'::jsonb,clock_timestamp());
 IF NOT (auth->>'ok')::boolean THEN RETURN jsonb_build_object('response',auth,'http_status',200); END IF;
 IF p_request->>'action'='batch_open' THEN
  SELECT EXISTS(SELECT 1 FROM inventario.full_batches WHERE installation_id=p_installation_id AND enterprise_id=p_request->>'source_enterprise_id' AND report_id=p_request->>'source_report_id') INTO was_existing;
 END IF;
 r:=inventario.full_dispatch_v1(p_installation_id,p_installation_secret,p_request,clock_timestamp());
 IF (r->>'ok')::boolean THEN
  IF r->>'code'='SNAPSHOT_CONFIRMED' OR (r->>'code'='BATCH_OPENED' AND NOT was_existing) THEN http:=201; END IF;
  IF p_request->>'action'='batch_close' THEN
   INSERT INTO inventario.full_exclusions(batch_id,sede_id,reason_code,message)
   SELECT (p_request->>'batch_id')::uuid,(x->>'sede_id')::uuid,x->>'reason_code',x->>'message' FROM jsonb_array_elements(p_request->'excluded_sites')x
   ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN jsonb_build_object('response',r,'http_status',http);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR query_canceled THEN RETURN jsonb_build_object('response',inventario.full_error_v1('TEMPORARILY_UNAVAILABLE',clock_timestamp()),'http_status',503);
END $$;

REVOKE ALL ON FUNCTION public.rpc_conexion_full_admit_v1(uuid,text),public.rpc_conexion_full_catalog_v1(uuid,text,integer),public.rpc_conexion_full_http_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_conexion_full_admit_v1(uuid,text),public.rpc_conexion_full_catalog_v1(uuid,text,integer),public.rpc_conexion_full_http_v1(uuid,text,jsonb) TO service_role;

-- Freeze old implementations privately, retaining their behavior for ordinary installations.
-- Guard both sync entry points and catalog authentication. Preserve signatures/ACLs.
DO $migration$
DECLARE name text;sig text;definition text;priv text;body text;call text;denied text;
BEGIN
 FOREACH name IN ARRAY ARRAY['rpc_conexion_auth_state','rpc_conexion_sync_snapshot','rpc_conexion_sync_snapshot_strict_v2'] LOOP
  sig:=CASE WHEN name='rpc_conexion_auth_state' THEN '(uuid,text,text,integer,text,integer,text)' ELSE '(uuid,text,jsonb)' END;
  definition:=pg_get_functiondef(('public.'||name||sig)::regprocedure);
  priv:='full_legacy_'||name;
  EXECUTE replace(definition,'FUNCTION public.'||name||'(','FUNCTION inventario.'||priv||'(');
  EXECUTE 'REVOKE ALL ON FUNCTION inventario.'||priv||sig||' FROM PUBLIC,anon,authenticated,service_role';
  call:=CASE WHEN name='rpc_conexion_auth_state' THEN 'p_installation_id,p_installation_secret,p_version_conexion,p_catalog_local_version,p_catalog_local_hash,p_confirm_catalog_version,p_confirm_catalog_hash' ELSE 'p_installation_id,p_installation_secret,p_payload' END;
  denied:=CASE WHEN name='rpc_conexion_auth_state' THEN 'false,''FULL_SCOPE_REQUIRED''::text,NULL::uuid,NULL::text,NULL::text,NULL::integer,NULL::integer,NULL::integer,NULL::text,NULL::text,NULL::bigint,NULL::boolean,NULL::timestamptz'
   ELSE 'false,''FULL_SCOPE_REQUIRED''::text,NULL::uuid,false,NULL::timestamptz,0,0' END;
  body:='BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702); PERFORM 1 FROM inventario.instalaciones WHERE id=p_installation_id FOR UPDATE; IF EXISTS(SELECT 1 FROM inventario.instalaciones WHERE id=p_installation_id AND full_enabled AND secret_hash=encode(extensions.digest(p_installation_secret,''sha256''),''hex'')) THEN RETURN QUERY SELECT '||denied||'; RETURN; END IF; RETURN QUERY SELECT * FROM inventario.'||priv||'('||call||'); END';
  -- pg_get_functiondef always emits the $function$ delimiter here; fail closed otherwise.
  IF position('AS $function$' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected legacy definition'; END IF;
  EXECUTE regexp_replace(definition,'AS \$function\$.*\$function\$', 'AS $function$'||body||'$function$','s');
 END LOOP;
END $migration$;
NOTIFY pgrst,'reload schema';
