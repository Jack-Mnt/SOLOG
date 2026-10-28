-- Policy 2: local-only until the revised release gates pass. Preserves existing evidence.
DO $$BEGIN IF current_user<>(SELECT pg_get_userbyid(proowner)FROM pg_proc WHERE oid='public.rpc_conexion_full_v1(uuid,text,jsonb)'::regprocedure) THEN RAISE EXCEPTION 'FULL_MIGRATION_OWNER_MISMATCH';END IF;END $$;
ALTER TABLE inventario.full_settings ADD COLUMN operational_capacity_verified boolean NOT NULL DEFAULT false;
ALTER TABLE inventario.full_settings ALTER COLUMN policy_version SET DEFAULT 2;
UPDATE inventario.full_settings SET policy_version=2,new_ingestion=false,new_sessions=false,raw_history_enabled=false,retention_capacity_verified=false,operational_capacity_verified=false;
ALTER TABLE inventario.full_settings ADD CONSTRAINT full_policy2_no_raw_history CHECK(policy_version=2 AND NOT raw_history_enabled);
INSERT INTO inventario.full_contracts(kind,document)VALUES('policy_v2','{"contract_version":2,"snapshot_contract_version":2,"timezone":"America/Lima","recommended_capture_interval_seconds":3600,"minimum_capture_interval_seconds":0,"stock_validity_seconds":7200,"session_capture_interval_seconds":3600,"max_capture_intervals_per_snapshot":2,"pending_delivery_seconds":7200,"observation_future_tolerance_seconds":30,"movement_max_intervals":20,"movement_min_valid_intervals":3,"movement_max_age_seconds":604800,"raw_interval_retention_days":0,"max_body_bytes":4194304,"max_sku_entries":10000,"max_incidents":20000,"max_batch_items":500,"max_response_errors":100,"max_string_length":1024,"automatic_retry_attempts":3,"retry_delays_seconds":[2,5,15],"retry_jitter_fraction":0.2,"rate_limit_requests_per_installation_per_minute":120,"db_lock_timeout_ms":5000,"db_statement_timeout_ms":25000,"http_client_timeout_ms":60000,"shifts_local":[{"id":"early","label":"shift_1","start":"00:00","end":"08:00"},{"id":"day","label":"shift_2","start":"08:00","end":"16:00"},{"id":"night","label":"shift_3","start":"16:00","end":"24:00"}],"kill_switches":{"full_new_ingestion":false,"solog_new_sessions":false},"strict_unknown_properties":true,"fingerprint_version":1,"policy_version":2,"raw_movement_history_enabled":false,"capacity_gate":"must_pass_before_activation"}'::jsonb);
CREATE OR REPLACE FUNCTION inventario.full_movement_apply_v1(p_snapshot_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_sede_id uuid;
  v_capturado_at timestamptz;
  v_version_catalogo integer;
  v_actualizados integer;
BEGIN
  SELECT s.sede_id,s.capturado_at,s.version_catalogo
  INTO v_sede_id,v_capturado_at,v_version_catalogo
  FROM inventario.snapshots s
  WHERE s.id=p_snapshot_id AND s.estado='procesando';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLOG_METRICS_SNAPSHOT_NOT_PROCESSING';
  END IF;

  -- Precondición estructural: no calcular variaciones tras reemplazar stock_actual.
  IF EXISTS(
    SELECT 1 FROM inventario.stock_actual a
    WHERE a.sede_id=v_sede_id AND a.snapshot_id=p_snapshot_id
  ) THEN
    RAISE EXCEPTION 'SOLOG_METRICS_SNAPSHOT_STOCK_ALREADY_APPLIED';
  END IF;


  IF NOT EXISTS(SELECT 1 FROM inventario.full_settings WHERE id AND policy_version=2 AND NOT raw_history_enabled AND operational_capacity_verified) THEN RAISE EXCEPTION 'INGESTION_PAUSED'; END IF;
  -- Policy 2 updates only the bounded 20-interval arrays. No raw-history INSERT.
  WITH entrantes AS MATERIALIZED (
    SELECT ss.c_interno,ss.stock,ss.producto_eliminado,
           v_sede_id AS sede_id, v_capturado_at AS capturado_at,
           p_snapshot_id AS snapshot_id
    FROM inventario.snapshot_stock ss
    JOIN inventario.catalogo_version_skus cvs
      ON cvs.version=v_version_catalogo
     AND cvs.c_interno=ss.c_interno
     AND cvs.estado='incluido'
    JOIN inventario.catalogo c ON c.c_interno=ss.c_interno
     AND c.estado<>'Excluido'
    WHERE ss.snapshot_id=p_snapshot_id
      AND NOT EXISTS(
        SELECT 1 FROM inventario.metrics_movimiento_sku already
        WHERE already.sede_id=v_sede_id AND already.c_interno=ss.c_interno
          AND already.ultimo_snapshot_procesado_id=p_snapshot_id
      )
  ),
  antecedentes AS (
    SELECT e.*,
           m.ultimo_stock,m.ultimo_snapshot_id,m.ultimo_capturado_at,
           m.variacion_stock,m.duracion_intervalo,
           sa.stock AS stock_anterior,sa.snapshot_id AS snapshot_anterior,
           sa.observed_at AS captura_anterior,
           sa.producto_eliminado AS anterior_no_observado,
           (
             NOT e.producto_eliminado
             AND m.ultimo_stock IS NOT NULL
             AND sa.snapshot_id=m.ultimo_snapshot_id
             AND sa.observed_at=m.ultimo_capturado_at
             AND sa.producto_eliminado IS FALSE
             AND e.capturado_at>m.ultimo_capturado_at
             AND abs(e.stock::bigint-m.ultimo_stock::bigint)<=2147483647::bigint
           ) IS TRUE AS comparable
    FROM entrantes e
    LEFT JOIN inventario.metrics_movimiento_sku m
      ON m.sede_id=e.sede_id AND m.c_interno=e.c_interno
    LEFT JOIN inventario.stock_actual sa
      ON sa.sede_id=e.sede_id AND sa.c_interno=e.c_interno
  ),
  arrays AS (
    SELECT a.*,
      CASE WHEN a.comparable THEN
        coalesce(a.variacion_stock,'{}'::integer[])
        || ARRAY[abs(a.stock::bigint-a.ultimo_stock::bigint)::integer]
      ELSE '{}'::integer[] END AS deltas_ext,
      CASE WHEN a.comparable THEN
        coalesce(a.duracion_intervalo,'{}'::integer[])
        || ARRAY[extract(epoch FROM (a.capturado_at-a.ultimo_capturado_at))::integer]
      ELSE '{}'::integer[] END AS segundos_ext
    FROM antecedentes a
  ),
  preparados AS (
    SELECT a.*,
      ARRAY(
        SELECT x.v FROM pg_catalog.unnest(a.deltas_ext)
        WITH ORDINALITY AS x(v,pos)
        WHERE x.pos>greatest(pg_catalog.cardinality(a.deltas_ext)-20,0)
        ORDER BY x.pos
      ) AS deltas20,
      ARRAY(
        SELECT x.v FROM pg_catalog.unnest(a.segundos_ext)
        WITH ORDINALITY AS x(v,pos)
        WHERE x.pos>greatest(pg_catalog.cardinality(a.segundos_ext)-20,0)
        ORDER BY x.pos
      ) AS segundos20
    FROM arrays a
  )
  INSERT INTO inventario.metrics_movimiento_sku(
    sede_id,c_interno,variacion_stock,duracion_intervalo,
    ultimo_stock,ultimo_snapshot_id,ultimo_capturado_at,
    ultimo_snapshot_procesado_id,c24_sku,estado_calidad,updated_at
  )
  SELECT p.sede_id,p.c_interno,p.deltas20,p.segundos20,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.stock END,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.snapshot_id END,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.capturado_at END,
         p.snapshot_id,
         CASE WHEN p.producto_eliminado THEN NULL ELSE c.c24_sku END,
         CASE WHEN p.producto_eliminado THEN 'insuficiente'
              WHEN pg_catalog.cardinality(p.deltas20)=0 THEN 'base'
              WHEN c.c24_sku IS NULL THEN 'insuficiente'
              ELSE 'medido' END,
         pg_catalog.clock_timestamp()
  FROM preparados p
  CROSS JOIN LATERAL inventario.metrics_c24_ventana_v1(
    p.deltas20,p.segundos20,
    CASE WHEN p.producto_eliminado THEN NULL ELSE p.capturado_at END,
    p.capturado_at
  ) c
  ON CONFLICT(sede_id,c_interno) DO UPDATE SET
    variacion_stock=EXCLUDED.variacion_stock,
    duracion_intervalo=EXCLUDED.duracion_intervalo,
    ultimo_stock=EXCLUDED.ultimo_stock,
    ultimo_snapshot_id=EXCLUDED.ultimo_snapshot_id,
    ultimo_capturado_at=EXCLUDED.ultimo_capturado_at,
    ultimo_snapshot_procesado_id=EXCLUDED.ultimo_snapshot_procesado_id,
    c24_sku=EXCLUDED.c24_sku,
    estado_calidad=EXCLUDED.estado_calidad,
    updated_at=EXCLUDED.updated_at;

  GET DIAGNOSTICS v_actualizados=ROW_COUNT;
  UPDATE inventario.metrics_movimiento_sku SET algorithm_version='full-20-v1' WHERE sede_id=v_sede_id AND ultimo_snapshot_procesado_id=p_snapshot_id;
  RETURN v_actualizados;
END;
$function$;
CREATE OR REPLACE FUNCTION inventario.full_submit_v1(p_actor uuid,p_request jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b inventario.full_batches%rowtype;op inventario.full_operations%rowtype;site uuid;sid uuid;capture timestamptz;fp text;p jsonb;cfg inventario.full_settings%rowtype;cat inventario.versiones_catalogo%rowtype;r record;code text;finished timestamptz;real_started timestamptz:=clock_timestamp();data jsonb;linked integer;changed integer;rev bigint;
BEGIN
 site:=(p_request->>'sede_id')::uuid;sid:=(p_request#>>'{payload,snapshot_id}')::uuid;
 -- Operation identity lock precedes batch and common site mutex.
 IF sid IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('full-operation:'||sid::text,0)); END IF;
 SELECT * INTO b FROM inventario.full_batches WHERE id=(p_request->>'batch_id')::uuid AND installation_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN inventario.full_error_v1('BATCH_NOT_FOUND',p_now); END IF;
 IF NOT EXISTS(SELECT 1 FROM inventario.full_site_permissions WHERE installation_id=p_actor AND sede_id=site)
 OR NOT EXISTS(SELECT 1 FROM inventario.full_batch_sites WHERE batch_id=b.id AND sede_id=site) THEN RETURN inventario.full_error_v1('SEDE_NOT_ALLOWED',p_now); END IF;
 PERFORM 1 FROM public.sedes WHERE id=site AND activo FOR UPDATE;
 IF NOT FOUND THEN RETURN inventario.full_error_v1('SEDE_NOT_ALLOWED',p_now); END IF;
 IF NOT extensions.json_matches_schema((SELECT document::json FROM inventario.full_contracts WHERE kind='request'),p_request::json) THEN
  UPDATE inventario.full_batch_sites SET state=CASE WHEN state='confirmed' THEN state ELSE 'rejected' END,last_error_code=CASE WHEN state='confirmed' THEN last_error_code ELSE 'INVALID_STRUCTURE' END WHERE batch_id=b.id AND sede_id=site;
  RETURN inventario.full_error_v1('INVALID_STRUCTURE',p_now);
 END IF;
 p:=p_request->'payload';capture:=(p->>'capturado_at')::timestamptz;
 IF NOT isfinite(capture) THEN RETURN inventario.full_error_v1('INVALID_STRUCTURE',p_now); END IF;
 p:=jsonb_set(p,'{capturado_at}',to_jsonb(inventario.full_utc_v1(capture)));
 fp:=encode(extensions.digest(jsonb_build_object('batch_id',b.id,'sede_id',site,'snapshot_id',sid,'groups_revision',b.groups_revision,'catalog_version',b.catalog_version,'catalog_hash',b.catalog_hash,'payload',p)::text,'sha256'),'hex');
 SELECT * INTO op FROM inventario.full_operations WHERE snapshot_id=sid FOR UPDATE;
 IF FOUND AND (op.batch_id<>b.id OR op.sede_id<>site OR op.fingerprint<>fp) THEN RETURN inventario.full_error_v1('IDEMPOTENCY_CONFLICT',p_now); END IF;
 IF op.state='confirmed' THEN RETURN inventario.full_result_v1('SNAPSHOT_ALREADY_CONFIRMED',jsonb_set(op.result,'{duplicate}','true'),p_now); END IF;
 IF EXISTS(SELECT 1 FROM inventario.full_operations WHERE batch_id=b.id AND sede_id=site AND snapshot_id<>sid)
 OR EXISTS(SELECT 1 FROM inventario.snapshots WHERE id=sid) THEN RETURN inventario.full_error_v1('IDEMPOTENCY_CONFLICT',p_now); END IF;
 IF b.lifecycle='closed' THEN RETURN inventario.full_error_v1('BATCH_CLOSED',p_now); END IF;
 INSERT INTO inventario.full_operations(snapshot_id,batch_id,sede_id,fingerprint,state) VALUES(sid,b.id,site,fp,'rejected')
 ON CONFLICT(snapshot_id) DO UPDATE SET attempts=inventario.full_operations.attempts+1,updated_at=clock_timestamp();
 -- Expected rejections and failed application attempts are recorded outside the application savepoint.
 BEGIN
  SELECT * INTO cfg FROM inventario.full_settings WHERE id;
  IF NOT cfg.new_ingestion OR NOT cfg.operational_capacity_verified
    OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='inventario.snapshots'::regclass AND conname='snapshots_instalacion_excel_hash_unique') THEN RAISE EXCEPTION 'INGESTION_PAUSED'; END IF;
  SELECT * INTO cat FROM inventario.versiones_catalogo WHERE schema_version=2 AND storage_path IS NOT NULL ORDER BY version DESC LIMIT 1;
  IF cat.version<>b.catalog_version OR cat.hash<>b.catalog_hash THEN RAISE EXCEPTION 'CATALOG_CHANGED'; END IF;
  IF cfg.groups_revision<>b.groups_revision THEN RAISE EXCEPTION 'GROUP_STRUCTURE_CHANGED'; END IF;
  IF p->>'excel_hash'<>b.master_hash OR (p->>'version_catalogo')::integer<>b.catalog_version THEN RAISE EXCEPTION 'CATALOG_MISMATCH'; END IF;
  IF capture<>b.captured_at THEN RAISE EXCEPTION 'SOURCE_REPORT_CONFLICT'; END IF;
  IF capture>p_now THEN RAISE EXCEPTION 'SNAPSHOT_CAPTURE_TIME_IN_FUTURE'; END IF;
  IF capture<=p_now-interval '2 hours' THEN RAISE EXCEPTION 'SNAPSHOT_TOO_OLD'; END IF;
  IF (p#>>'{resumen,sku_total_excel}')::integer=0 THEN RAISE EXCEPTION 'STOCK_UNRESOLVABLE'; END IF;
  IF EXISTS(SELECT 1 FROM inventario.snapshots WHERE sede_id=site AND confirmado_at IS NOT NULL AND capturado_at>capture) THEN RAISE EXCEPTION 'OUT_OF_ORDER_SNAPSHOT'; END IF;
  IF EXISTS(SELECT 1 FROM inventario.snapshots WHERE sede_id=site AND confirmado_at IS NOT NULL AND capturado_at=capture) THEN RAISE EXCEPTION 'CAPTURE_TIME_COLLISION'; END IF;
  -- Wide intermediates; legacy operational columns still use int4 until the cashier migration.
  IF EXISTS(SELECT 1 FROM inventario.catalogo c JOIN jsonb_to_recordset(p->'stock') x(c_interno integer,stock integer) USING(c_interno) WHERE c.estado<>'Excluido' GROUP BY c.grupo_conteo_id HAVING sum(x.stock::bigint) NOT BETWEEN -2147483648 AND 2147483647) THEN RAISE EXCEPTION 'STOCK_UNRESOLVABLE'; END IF;
  SELECT count(*) INTO changed FROM inventario.grupos_conteo g
  LEFT JOIN inventario.estado_stock_grupo esg ON esg.grupo_conteo_id=g.id AND esg.sede_id=site
  CROSS JOIN LATERAL(SELECT coalesce(sum(x.stock::bigint),0) stock FROM inventario.catalogo c LEFT JOIN jsonb_to_recordset(p->'stock')x(c_interno integer,stock integer) USING(c_interno) WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido') expected
  WHERE g.activo AND (esg.stock_actual IS DISTINCT FROM expected.stock OR NOT coalesce(esg.activo,false) OR esg.requiere_snapshot_completo);
  SELECT * INTO STRICT r FROM inventario.full_apply_snapshot_v1(p_actor,site,b.id,p,p_now);
  IF NOT r.ok THEN
   code:=CASE WHEN r.codigo IN ('INVALID_SUMMARY','INVALID_SKU_ARRAY','CATALOG_VERSION_NOT_AVAILABLE','CATALOG_SCHEMA_NOT_SUPPORTED') THEN CASE WHEN r.codigo LIKE 'CATALOG%' THEN 'CATALOG_MISMATCH' ELSE r.codigo END WHEN r.codigo LIKE '%SKU%' THEN 'INVALID_SKU_ARRAY' WHEN r.codigo LIKE '%INCIDENT%' OR r.codigo LIKE '%ELIMINATED%' THEN 'INCIDENT_INVALID' ELSE 'INVALID_STRUCTURE' END;
   RAISE EXCEPTION USING MESSAGE=code;
  END IF;
  SELECT count(*) INTO linked FROM inventario.conteo_detalle WHERE snapshot_posterior_id=sid;
  SELECT inventario.solog_revision_get('operational',site) INTO rev;
  finished:=p_now+(clock_timestamp()-real_started);
  UPDATE inventario.snapshots SET confirmado_at=finished WHERE id=sid;
  data:=jsonb_build_object('batch_id',b.id,'sede_id',site,'snapshot_id',sid,'status','confirmed','duplicate',false,'snapshot_captured_at',inventario.full_utc_v1(capture),'snapshot_confirmed_at',inventario.full_utc_v1(finished),'stock_expires_at',inventario.full_utc_v1(capture+interval '2 hours'),'catalog_version',b.catalog_version,'stock_rows',r.stock_rows,'incidents_processed',r.incidencias_procesadas,'groups_materialized',(SELECT count(*) FROM inventario.full_group_history WHERE snapshot_id=sid),'groups_changed',changed,'pending_recounts_linked',linked,'movement_intervals_added',0,'physical_counts_created',0,'auto_resolved_recounts',0,'operational_revision',rev);
  UPDATE inventario.full_operations SET state='confirmed',result=data,updated_at=clock_timestamp() WHERE snapshot_id=sid;
  UPDATE inventario.full_batch_sites SET state='confirmed',snapshot_id=sid,last_error_code=NULL,confirmed_at=finished WHERE batch_id=b.id AND sede_id=site;
  RETURN inventario.full_result_v1('SNAPSHOT_CONFIRMED',data,finished);
 EXCEPTION WHEN OTHERS THEN
  code:=CASE WHEN SQLSTATE IN ('55P03','57014','40P01') THEN 'TEMPORARILY_UNAVAILABLE' WHEN SQLSTATE='P0001' AND SQLERRM IN ('INGESTION_PAUSED','CATALOG_CHANGED','GROUP_STRUCTURE_CHANGED','CATALOG_MISMATCH','SOURCE_REPORT_CONFLICT','SNAPSHOT_CAPTURE_TIME_IN_FUTURE','SNAPSHOT_TOO_OLD','OUT_OF_ORDER_SNAPSHOT','CAPTURE_TIME_COLLISION','STOCK_UNRESOLVABLE','INVALID_SUMMARY','INVALID_SKU_ARRAY','INCIDENT_INVALID','INVALID_STRUCTURE') THEN SQLERRM ELSE 'INTERNAL_ERROR' END;
 END;
 data:=inventario.full_error_v1(code,p_now);
 UPDATE inventario.full_operations SET state='rejected',result=data,updated_at=clock_timestamp() WHERE snapshot_id=sid;
 UPDATE inventario.full_batch_sites SET state='rejected',last_error_code=code WHERE batch_id=b.id AND sede_id=site;
 RETURN data;
END $$;
CREATE FUNCTION inventario.full_policy2_raw_guard_v1()RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'FULL_RAW_HISTORY_DISABLED';END $$;
CREATE TRIGGER full_policy2_raw_disabled BEFORE INSERT ON inventario.full_intervals FOR EACH ROW EXECUTE FUNCTION inventario.full_policy2_raw_guard_v1();
REVOKE ALL ON FUNCTION inventario.full_policy2_raw_guard_v1()FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION inventario.full_policy2_response_v1(p_result jsonb)RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE cfg inventario.full_settings%rowtype;policy jsonb;BEGIN
 p_result:=jsonb_set(p_result,'{contract_version}','2');
 IF p_result->>'code'='BOOTSTRAP_READY' AND (p_result->>'ok')::boolean THEN SELECT *INTO cfg FROM inventario.full_settings WHERE id;SELECT document INTO policy FROM inventario.full_contracts WHERE kind='policy_v2';policy:=jsonb_set(policy,'{kill_switches}',jsonb_build_object('full_new_ingestion',cfg.new_ingestion,'solog_new_sessions',cfg.new_sessions));p_result:=jsonb_set(p_result,'{data,policy}',policy);END IF;RETURN p_result;END $$;
CREATE FUNCTION inventario.full_policy2_error_v1(p_code text,p_now timestamptz)RETURNS jsonb LANGUAGE sql SET search_path='' AS $$SELECT inventario.full_policy2_response_v1(inventario.full_error_v1(p_code,p_now))$$;
CREATE FUNCTION inventario.full_policy2_dispatch_v1(p_actor uuid,p_secret text,p_request jsonb,p_now timestamptz)RETURNS jsonb LANGUAGE sql SET search_path='' AS $$SELECT inventario.full_policy2_response_v1(inventario.full_dispatch_v1(p_actor,p_secret,p_request,p_now))$$;
REVOKE ALL ON FUNCTION inventario.full_policy2_response_v1(jsonb),inventario.full_policy2_error_v1(text,timestamptz),inventario.full_policy2_dispatch_v1(uuid,text,jsonb,timestamptz)FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rpc_conexion_full_admit_v2(p_installation_id uuid,p_installation_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$
DECLARE r jsonb;ts timestamptz;recent timestamptz[];retry integer;
BEGIN
 r:=inventario.full_policy2_dispatch_v1(p_installation_id,p_installation_secret,'{"action":"bootstrap"}'::jsonb,clock_timestamp());
 IF NOT (r->>'ok')::boolean THEN RETURN jsonb_build_object('response',r); END IF;
 -- Authentication acquired config and installation locks first; rate is last.
 ts:=clock_timestamp();
 INSERT INTO inventario.full_edge_rate VALUES(p_installation_id,'{}') ON CONFLICT DO NOTHING;
 SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO recent FROM inventario.full_edge_rate t CROSS JOIN LATERAL unnest(t.requests)x
 WHERE t.installation_id=p_installation_id AND x>ts-interval '1 minute';
 IF cardinality(recent)>=120 THEN
  retry:=greatest(1,ceil(extract(epoch FROM recent[1]+interval '1 minute'-ts))::integer);
  RETURN jsonb_build_object('response',inventario.full_policy2_error_v1('RATE_LIMITED',ts),'retry_after',retry);
 END IF;
 UPDATE inventario.full_edge_rate SET requests=array_append(recent,ts) WHERE installation_id=p_installation_id;
 RETURN jsonb_build_object('response',r);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR query_canceled THEN RETURN jsonb_build_object('response',inventario.full_policy2_error_v1('TEMPORARILY_UNAVAILABLE',clock_timestamp()));
END $$;
REVOKE ALL ON FUNCTION public.rpc_conexion_full_admit_v2(uuid,text)FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.rpc_conexion_full_admit_v2(uuid,text)TO service_role;
CREATE OR REPLACE FUNCTION public.rpc_conexion_full_catalog_v2(p_installation_id uuid,p_installation_secret text,p_version integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$
DECLARE r jsonb;cat inventario.versiones_catalogo%rowtype;
BEGIN
 r:=inventario.full_policy2_dispatch_v1(p_installation_id,p_installation_secret,'{"action":"bootstrap"}'::jsonb,clock_timestamp());
 IF NOT (r->>'ok')::boolean THEN RETURN jsonb_build_object('response',r); END IF;
 SELECT * INTO cat FROM inventario.versiones_catalogo WHERE schema_version=2 AND storage_path IS NOT NULL ORDER BY version DESC LIMIT 1;
 IF cat.version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('response',inventario.full_policy2_error_v1('CATALOG_MISMATCH',clock_timestamp())); END IF;
 RETURN jsonb_build_object('response',r,'catalog',jsonb_build_object('version',cat.version,'schema_version',cat.schema_version,'sha256',cat.hash,'size_bytes',cat.tamano_bytes,'storage_path',cat.storage_path));
END $$;
REVOKE ALL ON FUNCTION public.rpc_conexion_full_catalog_v2(uuid,text,integer)FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.rpc_conexion_full_catalog_v2(uuid,text,integer)TO service_role;
CREATE OR REPLACE FUNCTION public.rpc_conexion_full_http_v2(p_installation_id uuid,p_installation_secret text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$
DECLARE auth jsonb;r jsonb;was_existing boolean:=false;http integer:=200;
BEGIN
 -- Serialize inspection and creation on the same installation as the dispatcher.
 auth:=inventario.full_policy2_dispatch_v1(p_installation_id,p_installation_secret,'{"action":"bootstrap"}'::jsonb,clock_timestamp());
 IF NOT (auth->>'ok')::boolean THEN RETURN jsonb_build_object('response',auth,'http_status',200); END IF;
 IF p_request->>'action'='batch_open' THEN
  SELECT EXISTS(SELECT 1 FROM inventario.full_batches WHERE installation_id=p_installation_id AND enterprise_id=p_request->>'source_enterprise_id' AND report_id=p_request->>'source_report_id') INTO was_existing;
 END IF;
 r:=inventario.full_policy2_dispatch_v1(p_installation_id,p_installation_secret,p_request,clock_timestamp());
 IF (r->>'ok')::boolean THEN
  IF r->>'code'='SNAPSHOT_CONFIRMED' OR (r->>'code'='BATCH_OPENED' AND NOT was_existing) THEN http:=201; END IF;
  IF p_request->>'action'='batch_close' THEN
   INSERT INTO inventario.full_exclusions(batch_id,sede_id,reason_code,message)
   SELECT (p_request->>'batch_id')::uuid,(x->>'sede_id')::uuid,x->>'reason_code',x->>'message' FROM jsonb_array_elements(p_request->'excluded_sites')x
   ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN jsonb_build_object('response',r,'http_status',http);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR query_canceled THEN RETURN jsonb_build_object('response',inventario.full_policy2_error_v1('TEMPORARILY_UNAVAILABLE',clock_timestamp()),'http_status',503);
END $$;
REVOKE ALL ON FUNCTION public.rpc_conexion_full_http_v2(uuid,text,jsonb)FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.rpc_conexion_full_http_v2(uuid,text,jsonb)TO service_role;
CREATE OR REPLACE FUNCTION public.rpc_conexion_full_v1(p_installation_id uuid,p_installation_secret text,p_request jsonb)RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$SELECT inventario.full_error_v1('UNSUPPORTED_CONTRACT_VERSION',clock_timestamp())$$;
CREATE OR REPLACE FUNCTION public.rpc_conexion_full_admit_v1(p_installation_id uuid,p_installation_secret text)RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$SELECT jsonb_build_object('response',inventario.full_error_v1('UNSUPPORTED_CONTRACT_VERSION',clock_timestamp()),'http_status',400)$$;
CREATE OR REPLACE FUNCTION public.rpc_conexion_full_catalog_v1(p_installation_id uuid,p_installation_secret text,p_version integer)RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$SELECT jsonb_build_object('response',inventario.full_error_v1('UNSUPPORTED_CONTRACT_VERSION',clock_timestamp()),'http_status',400)$$;
CREATE OR REPLACE FUNCTION public.rpc_conexion_full_http_v1(p_installation_id uuid,p_installation_secret text,p_request jsonb)RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$SELECT jsonb_build_object('response',inventario.full_error_v1('UNSUPPORTED_CONTRACT_VERSION',clock_timestamp()),'http_status',400)$$;
COMMENT ON TABLE inventario.full_intervals IS 'Historical policy-1 evidence only; no policy-2 inserts, no automatic deletion.';
NOTIFY pgrst,'reload schema';
