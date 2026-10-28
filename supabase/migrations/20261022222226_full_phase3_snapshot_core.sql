-- PREPARED LOCAL-VALIDATED CODE. No remote deployment or production activation.
CREATE FUNCTION inventario.full_result_v1(p_code text,p_data jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT jsonb_build_object('ok',true,'code',p_code,'contract_version',1,'request_id',gen_random_uuid(),'server_now',inventario.full_utc_v1(p_now),'retryable',false,'action_required','none','data',p_data,'errors','[]'::jsonb)
$$;
CREATE FUNCTION inventario.full_error_v1(p_code text,p_now timestamptz) RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT jsonb_build_object('ok',false,'code',p_code,'contract_version',1,'request_id',gen_random_uuid(),'server_now',inventario.full_utc_v1(p_now),
 'retryable',p_code IN ('TEMPORARILY_UNAVAILABLE','INTERNAL_ERROR','RATE_LIMITED'),
 'action_required',CASE WHEN p_code IN ('TEMPORARILY_UNAVAILABLE','INTERNAL_ERROR','RATE_LIMITED') THEN 'retry_same_operation' WHEN p_code IN ('INVALID_CREDENTIALS','INSTALLATION_DISABLED','FULL_SCOPE_REQUIRED') THEN 'refresh_credentials' WHEN p_code IN ('CATALOG_CHANGED','GROUP_STRUCTURE_CHANGED','OUT_OF_ORDER_SNAPSHOT','SNAPSHOT_TOO_OLD','CAPTURE_TIME_COLLISION') THEN 'new_capture' WHEN p_code='CATALOG_MISMATCH' THEN 'refresh_catalog' ELSE 'fix_payload' END,
 'data',NULL,'errors',jsonb_build_array(jsonb_build_object('code',p_code,'message','Solicitud no confirmada. Consulte el código de resultado.','field_path','')),'errors_total',1,'errors_truncated',false)
$$;
CREATE FUNCTION inventario.full_batch_data_v1(p_batch uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('batch_id',b.id,'lifecycle',b.lifecycle,
 'outcome',CASE WHEN count(*) FILTER(WHERE s.state='confirmed')=count(*) THEN 'completed' WHEN b.lifecycle='open' AND count(*) FILTER(WHERE s.state='confirmed')=0 THEN 'pending' WHEN count(*) FILTER(WHERE s.state='confirmed')>0 THEN 'partial' WHEN b.lifecycle='closed' THEN 'failed' ELSE 'pending' END,
 'groups_revision',b.groups_revision,'catalog_version',b.catalog_version,'source_enterprise_id',b.enterprise_id,'source_report_id',b.report_id,'snapshot_captured_at',inventario.full_utc_v1(b.captured_at),'master_excel_sha256',b.master_hash,
 'sites',jsonb_agg(jsonb_build_object('sede_id',s.sede_id,'state',s.state,'snapshot_id',s.snapshot_id,'last_error_code',s.last_error_code,'snapshot_confirmed_at',inventario.full_utc_v1(s.confirmed_at)) ORDER BY s.sede_id))
 FROM inventario.full_batches b JOIN inventario.full_batch_sites s ON s.batch_id=b.id WHERE b.id=p_batch GROUP BY b.id
$$;

CREATE FUNCTION inventario.full_config_lock_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN NULL; END $$;
CREATE FUNCTION inventario.full_structure_bump_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN UPDATE inventario.full_settings SET groups_revision=groups_revision+1 WHERE id; RETURN NULL; END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['catalogo','grupos_conteo','categorias','versiones_catalogo','catalogo_version_skus','full_site_permissions','full_settings'] LOOP
  EXECUTE format('CREATE TRIGGER full_config_before_write BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON inventario.%I FOR EACH STATEMENT EXECUTE FUNCTION inventario.full_config_lock_v1()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['catalogo','grupos_conteo','categorias'] LOOP
  EXECUTE format('CREATE TRIGGER full_structure_after_write AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON inventario.%I FOR EACH STATEMENT EXECUTE FUNCTION inventario.full_structure_bump_v1()',t);
 END LOOP;
END $$;
CREATE TRIGGER full_installation_auth_guard BEFORE UPDATE OF estado,secret_hash,full_enabled ON inventario.instalaciones FOR EACH STATEMENT EXECUTE FUNCTION inventario.full_config_lock_v1();
CREATE TRIGGER full_installation_delete_guard BEFORE DELETE ON inventario.instalaciones FOR EACH STATEMENT EXECUTE FUNCTION inventario.full_config_lock_v1();

CREATE FUNCTION inventario.full_project_groups_v1(p_snapshot uuid,p_batch uuid) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n integer;BEGIN
 INSERT INTO inventario.full_group_history(snapshot_id,group_id,groups_revision,group_name,category_id,category_name,price,units_per_package,package_price,member_codes,members,stock_theoretical)
 SELECT p_snapshot,g.id,b.groups_revision,g.nombre,g.categoria_id,cat.nombre,g.precio,g.unidades_por_paquete,g.precio_paquete,
 coalesce(array_agg(c.c_interno ORDER BY c.c_interno) FILTER(WHERE c.c_interno IS NOT NULL),'{}'),
 coalesce(jsonb_agg(jsonb_build_object('c_interno',c.c_interno,'product',c.producto,'barcode',c.c_barras,'price',c.precio) ORDER BY c.c_interno) FILTER(WHERE c.c_interno IS NOT NULL),'[]'),
 coalesce(sum(ss.stock::bigint),0)
 FROM inventario.grupos_conteo g JOIN inventario.categorias cat ON cat.id=g.categoria_id CROSS JOIN inventario.full_batches b
 LEFT JOIN inventario.catalogo c ON c.grupo_conteo_id=g.id AND c.estado<>'Excluido'
 LEFT JOIN inventario.snapshot_stock ss ON ss.snapshot_id=p_snapshot AND ss.c_interno=c.c_interno
 WHERE b.id=p_batch AND g.activo GROUP BY g.id,cat.nombre,b.groups_revision;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;

CREATE FUNCTION inventario.full_submit_v1(p_actor uuid,p_request jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
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
  IF NOT cfg.new_ingestion OR NOT cfg.raw_history_enabled OR NOT cfg.retention_capacity_verified
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
  data:=jsonb_build_object('batch_id',b.id,'sede_id',site,'snapshot_id',sid,'status','confirmed','duplicate',false,'snapshot_captured_at',inventario.full_utc_v1(capture),'snapshot_confirmed_at',inventario.full_utc_v1(finished),'stock_expires_at',inventario.full_utc_v1(capture+interval '2 hours'),'catalog_version',b.catalog_version,'stock_rows',r.stock_rows,'incidents_processed',r.incidencias_procesadas,'groups_materialized',(SELECT count(*) FROM inventario.full_group_history WHERE snapshot_id=sid),'groups_changed',changed,'pending_recounts_linked',linked,'movement_intervals_added',(SELECT count(*) FROM inventario.full_intervals WHERE snapshot_id=sid),'physical_counts_created',0,'auto_resolved_recounts',0,'operational_revision',rev);
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

CREATE FUNCTION inventario.full_dispatch_v1(p_actor uuid,p_secret text,p_request jsonb,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE inst inventario.instalaciones%rowtype;cat inventario.versiones_catalogo%rowtype;cfg inventario.full_settings%rowtype;b inventario.full_batches%rowtype;op uuid;fp text;source_fp text;cmd inventario.full_commands%rowtype;data jsonb;action text;sid uuid;code text;policy jsonb;site jsonb;old_hash text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(1397705807,4702);
 SELECT * INTO inst FROM inventario.instalaciones WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND OR p_secret IS NULL OR length(p_secret)>4096 OR inst.secret_hash<>encode(extensions.digest(p_secret,'sha256'),'hex') THEN RETURN inventario.full_error_v1('INVALID_CREDENTIALS',p_now); END IF;
 IF inst.estado<>'activa' THEN RETURN inventario.full_error_v1('INSTALLATION_DISABLED',p_now); END IF;
 IF NOT inst.full_enabled THEN RETURN inventario.full_error_v1('FULL_SCOPE_REQUIRED',p_now); END IF;
 IF NOT EXISTS(SELECT 1 FROM inventario.full_site_permissions WHERE installation_id=p_actor) THEN RETURN inventario.full_error_v1('SEDE_NOT_ALLOWED',p_now); END IF;
 IF jsonb_typeof(p_request)<>'object' OR p_request IS NULL THEN RETURN inventario.full_error_v1('INVALID_STRUCTURE',p_now); END IF;
 IF octet_length(p_request::text)>4194304 THEN RETURN inventario.full_error_v1('PAYLOAD_TOO_LARGE',p_now); END IF;
 action:=p_request->>'action';
 IF action='snapshot_submit' THEN RETURN inventario.full_submit_v1(p_actor,p_request,p_now); END IF;
 IF NOT extensions.json_matches_schema((SELECT document::json FROM inventario.full_contracts WHERE kind='request'),p_request::json) THEN RETURN inventario.full_error_v1('INVALID_STRUCTURE',p_now); END IF;
 SELECT * INTO cfg FROM inventario.full_settings WHERE id;
 SELECT * INTO cat FROM inventario.versiones_catalogo WHERE schema_version=2 AND storage_path IS NOT NULL ORDER BY version DESC LIMIT 1;
 IF action IN ('catalog_confirm','batch_open','batch_close') THEN
  op:=(p_request->>'operation_id')::uuid;PERFORM pg_advisory_xact_lock(hashtextextended('full-command:'||op::text,0));
  fp:=encode(extensions.digest((p_request-'operation_id')::text,'sha256'),'hex');
  SELECT * INTO cmd FROM inventario.full_commands WHERE installation_id=p_actor AND operation_id=op FOR UPDATE;
  IF FOUND THEN
   IF cmd.action<>action OR cmd.fingerprint<>fp THEN RETURN inventario.full_error_v1('IDEMPOTENCY_CONFLICT',p_now); END IF;
   RETURN inventario.full_result_v1(cmd.result->>'code',cmd.result->'data',p_now);
  END IF;
 END IF;
 IF action='bootstrap' THEN
  policy:=(SELECT document FROM inventario.full_contracts WHERE kind='policy');
  policy:=jsonb_set(policy,'{kill_switches}',jsonb_build_object('full_new_ingestion',cfg.new_ingestion,'solog_new_sessions',cfg.new_sessions));
  SELECT jsonb_agg(jsonb_build_object('sede_id',s.id,'sede_name',s.nombre,'warehouse',a.warehouse,'latest_snapshot_id',x.id,'latest_snapshot_captured_at',inventario.full_utc_v1(x.capturado_at),'stock_expires_at',inventario.full_utc_v1(x.capturado_at+interval '2 hours')) ORDER BY s.id) INTO data
  FROM inventario.full_site_permissions a JOIN public.sedes s ON s.id=a.sede_id
  LEFT JOIN LATERAL(SELECT id,capturado_at FROM inventario.snapshots WHERE sede_id=s.id AND confirmado_at IS NOT NULL ORDER BY capturado_at DESC LIMIT 1)x ON true WHERE a.installation_id=p_actor;
  RETURN inventario.full_result_v1('BOOTSTRAP_READY',jsonb_build_object('installation_id',p_actor,'scope','full','allowed_sites',data,'catalog',jsonb_build_object('version',cat.version,'schema_version',cat.schema_version,'sha256',cat.hash,'size_bytes',cat.tamano_bytes,'confirmed',EXISTS(SELECT 1 FROM inventario.full_catalog_receipts WHERE installation_id=p_actor AND version=cat.version AND hash=cat.hash)),'groups_revision',cfg.groups_revision,'policy',policy),p_now);
 ELSIF action='catalog_confirm' THEN
  IF (p_request->>'catalog_version')::integer<>cat.version OR p_request->>'catalog_sha256'<>cat.hash THEN RETURN inventario.full_error_v1('CATALOG_MISMATCH',p_now); END IF;
  INSERT INTO inventario.full_catalog_receipts VALUES(p_actor,cat.version,cat.hash,p_now) ON CONFLICT(installation_id,version) DO UPDATE SET hash=excluded.hash,confirmed_at=excluded.confirmed_at;
  data:=jsonb_build_object('version',cat.version,'schema_version',cat.schema_version,'sha256',cat.hash,'size_bytes',cat.tamano_bytes,'confirmed',true);code:='CATALOG_CONFIRMED';
 ELSIF action='batch_open' THEN
  IF (p_request->>'catalog_version')::integer<>cat.version OR p_request->>'catalog_sha256'<>cat.hash THEN RETURN inventario.full_error_v1('CATALOG_MISMATCH',p_now); END IF;
  IF NOT EXISTS(SELECT 1 FROM inventario.full_catalog_receipts WHERE installation_id=p_actor AND version=cat.version AND hash=cat.hash) THEN RETURN inventario.full_error_v1('CATALOG_MISMATCH',p_now); END IF;
  source_fp:=encode(extensions.digest(((p_request-'operation_id'-'batch_id'-'action')||jsonb_build_object('report_created_at',inventario.full_utc_v1((p_request->>'report_created_at')::timestamptz),'report_finished_at',inventario.full_utc_v1((p_request->>'report_finished_at')::timestamptz),'downloaded_at',inventario.full_utc_v1((p_request->>'downloaded_at')::timestamptz)))::text,'sha256'),'hex');
  SELECT * INTO b FROM inventario.full_batches WHERE installation_id=p_actor AND enterprise_id=p_request->>'source_enterprise_id' AND report_id=p_request->>'source_report_id' FOR UPDATE;
  IF FOUND THEN IF b.source_fingerprint<>source_fp THEN RETURN inventario.full_error_v1('SOURCE_REPORT_CONFLICT',p_now); END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM inventario.full_batches WHERE id=(p_request->>'batch_id')::uuid) THEN RETURN inventario.full_error_v1('IDEMPOTENCY_CONFLICT',p_now); END IF;
   IF NOT ((p_request->>'report_created_at')::timestamptz<=(p_request->>'report_finished_at')::timestamptz AND (p_request->>'report_finished_at')::timestamptz<=(p_request->>'downloaded_at')::timestamptz) THEN RETURN inventario.full_error_v1('INVALID_STRUCTURE',p_now); END IF;
   INSERT INTO inventario.full_batches(id,installation_id,enterprise_id,report_id,source_fingerprint,captured_at,finished_at,downloaded_at,master_hash,catalog_version,catalog_hash,groups_revision)
   VALUES((p_request->>'batch_id')::uuid,p_actor,p_request->>'source_enterprise_id',p_request->>'source_report_id',source_fp,(p_request->>'report_created_at')::timestamptz,(p_request->>'report_finished_at')::timestamptz,(p_request->>'downloaded_at')::timestamptz,p_request->>'master_excel_sha256',cat.version,cat.hash,cfg.groups_revision) RETURNING * INTO b;
   INSERT INTO inventario.full_batch_sites(batch_id,sede_id) SELECT b.id,sede_id FROM inventario.full_site_permissions WHERE installation_id=p_actor;
  END IF;
  code:='BATCH_OPENED';data:=inventario.full_batch_data_v1(b.id);
 ELSIF action IN ('batch_status','snapshot_status','batch_close') THEN
  SELECT * INTO b FROM inventario.full_batches WHERE id=(p_request->>'batch_id')::uuid AND installation_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN RETURN inventario.full_error_v1('BATCH_NOT_FOUND',p_now); END IF;
  IF action='snapshot_status' THEN
   sid:=(p_request->>'sede_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM inventario.full_site_permissions WHERE installation_id=p_actor AND sede_id=sid) THEN RETURN inventario.full_error_v1('SEDE_NOT_ALLOWED',p_now); END IF;
   SELECT jsonb_build_object('batch_id',b.id,'sede_id',sid,'status',coalesce(o.state,CASE WHEN bs.state='pending' THEN 'not_found' ELSE bs.state END),'confirmation',CASE WHEN o.state='confirmed' THEN o.result ELSE NULL END,'last_error_code',bs.last_error_code) INTO data
   FROM inventario.full_batch_sites bs LEFT JOIN inventario.full_operations o ON o.batch_id=bs.batch_id AND o.sede_id=bs.sede_id WHERE bs.batch_id=b.id AND bs.sede_id=sid;
   IF data IS NULL THEN RETURN inventario.full_error_v1('SEDE_NOT_ALLOWED',p_now); END IF;
   RETURN inventario.full_result_v1('SNAPSHOT_STATUS',data,p_now);
  ELSIF action='batch_close' THEN
   IF b.lifecycle='closed' THEN RETURN inventario.full_error_v1('BATCH_CLOSED',p_now); END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'excluded_sites') x LEFT JOIN inventario.full_batch_sites s ON s.batch_id=b.id AND s.sede_id=(x->>'sede_id')::uuid WHERE s.state IS DISTINCT FROM 'pending') THEN RETURN inventario.full_error_v1('BATCH_STATE_CONFLICT',p_now); END IF;
   UPDATE inventario.full_batch_sites SET state='excluded' WHERE batch_id=b.id AND sede_id IN(SELECT (x->>'sede_id')::uuid FROM jsonb_array_elements(p_request->'excluded_sites')x);
   UPDATE inventario.full_batches SET lifecycle='closed' WHERE id=b.id;code:='BATCH_CLOSED';data:=inventario.full_batch_data_v1(b.id);
  ELSE RETURN inventario.full_result_v1('BATCH_STATUS',inventario.full_batch_data_v1(b.id),p_now); END IF;
 ELSE RETURN inventario.full_error_v1('INVALID_STRUCTURE',p_now);
 END IF;
 INSERT INTO inventario.full_commands VALUES(p_actor,op,action,fp,jsonb_build_object('code',code,'data',data));
 RETURN inventario.full_result_v1(code,data,p_now);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN inventario.full_error_v1('INVALID_STRUCTURE',p_now);
 WHEN lock_not_available OR deadlock_detected OR query_canceled THEN RETURN inventario.full_error_v1('TEMPORARILY_UNAVAILABLE',p_now);
 WHEN OTHERS THEN RETURN inventario.full_error_v1('INTERNAL_ERROR',p_now);
END $$;

CREATE FUNCTION public.rpc_conexion_full_v1(p_installation_id uuid,p_installation_secret text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$
BEGIN RETURN inventario.full_dispatch_v1(p_installation_id,p_installation_secret,p_request,clock_timestamp()); END $$;
REVOKE ALL ON FUNCTION public.rpc_conexion_full_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_conexion_full_v1(uuid,text,jsonb) TO service_role;






-- BEGIN GENERATED PHASE 3
CREATE OR REPLACE FUNCTION inventario.full_apply_groups_v1(p_snapshot_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_sede_id uuid;
  v_capturado_at timestamptz;
  v_groups integer:=0;
  v_details integer:=0;
begin
  select s.sede_id,s.capturado_at
    into v_sede_id,v_capturado_at
  from inventario.snapshots s
  where s.id=p_snapshot_id
    and s.estado='confirmado'
    and s.confirmado_at is not null;

  if not found then
    raise exception 'SOLOG_V4_SNAPSHOT_NOT_CONFIRMED';
  end if;

  with grp as (
    select
      g.id grupo_id,
      coalesce(sum(ss.stock),0)::integer stock_actual,
      coalesce(bool_or(c.c_interno is not null),false) activo,
      coalesce(
        bool_or(
          c.c_interno is not null
          and ss.c_interno is null
        ),
        false
      ) incompleto
    from inventario.grupos_conteo g
    left join inventario.catalogo c
      on c.grupo_conteo_id=g.id
     and c.estado<>'Excluido'
    left join inventario.snapshot_stock ss
      on ss.snapshot_id=p_snapshot_id
     and ss.c_interno=c.c_interno
    where g.activo
    group by g.id
  )
  insert into inventario.estado_stock_grupo(
    sede_id,
    grupo_conteo_id,
    stock_actual,
    snapshot_id,
    estado,
    ultimo_conteo_at,
    ultimo_conteo_detalle_id,
    activo,
    requiere_snapshot_completo,
    ultima_observacion_fisica_at,
    updated_at
  )
  select
    v_sede_id,
    gr.grupo_id,
    gr.stock_actual,
    p_snapshot_id,
    'Cambio_reciente',
    null,
    null,
    gr.activo,
    false,
    null,
    clock_timestamp()
  from grp gr
  where not gr.incompleto
  on conflict(sede_id,grupo_conteo_id) do update
  set
    stock_actual=excluded.stock_actual,
    snapshot_id=excluded.snapshot_id,
    estado=case
      when not inventario.estado_stock_grupo.activo
           and excluded.activo
        then 'Cambio_reciente'
      when inventario.estado_stock_grupo.requiere_snapshot_completo
        then 'Cambio_reciente'
      when inventario.estado_stock_grupo.stock_actual
           is distinct from excluded.stock_actual
        then 'Cambio_reciente'
      else inventario.estado_stock_grupo.estado
    end,
    activo=excluded.activo,
    requiere_snapshot_completo=false,
    ultima_observacion_fisica_at=case
      when inventario.estado_stock_grupo.activo
           is distinct from excluded.activo
        then null
      when inventario.estado_stock_grupo.requiere_snapshot_completo
        then null
      else inventario.estado_stock_grupo.ultima_observacion_fisica_at
    end,
    updated_at=clock_timestamp();

  get diagnostics v_groups=row_count;

  update inventario.estado_stock_grupo esg
  set
    activo=false,
    estado='Cambio_reciente',
    requiere_snapshot_completo=false,
    ultima_observacion_fisica_at=null,
    updated_at=clock_timestamp()
  where esg.sede_id=v_sede_id
    and not exists(
      select 1
      from inventario.grupos_conteo g
      join inventario.catalogo c
        on c.grupo_conteo_id=g.id
       and c.estado<>'Excluido'
      where g.id=esg.grupo_conteo_id
        and g.activo
    );

  with latest_open as (
    select distinct on (cd.grupo_conteo_id)
      cd.id,
      cd.grupo_conteo_id,cd.codigos_internos
    from inventario.conteo_detalle cd
    join inventario.conteos co
      on co.id=cd.conteo_id
    join inventario.estado_stock_grupo esg
      on esg.sede_id=co.sede_id
     and esg.grupo_conteo_id=cd.grupo_conteo_id
     and esg.ultimo_conteo_detalle_id=cd.id
    where co.sede_id=v_sede_id
      and cd.estado_diferencia='Recontar'
      and cd.stock_reconteo is null
      and cd.contado_at<v_capturado_at
      and not esg.requiere_snapshot_completo
    order by cd.grupo_conteo_id,cd.contado_at desc,cd.id desc
  ),
  vals_raw as (
    select
      lo.*,
      (SELECT CASE WHEN sum(ss.stock::bigint) BETWEEN -2147483648 AND 2147483647 THEN sum(ss.stock::bigint)::integer END FROM inventario.snapshot_stock ss WHERE ss.snapshot_id=p_snapshot_id AND ss.c_interno=ANY(lo.codigos_internos)) stock_now
    from latest_open lo
  ),
  vals as (
    select *
    from vals_raw
    where stock_now is not null
  ),
  upd as (
    update inventario.conteo_detalle cd
    set
      primer_snapshot_posterior_id=
        coalesce(cd.primer_snapshot_posterior_id,p_snapshot_id),
      snapshot_posterior_id=p_snapshot_id,
      stock_posterior=v.stock_now,
      updated_at=clock_timestamp()
    from vals v
    where cd.id=v.id
    returning cd.id
  )
  select count(*)::integer
    into v_details
  from upd;

  return jsonb_build_object(
    'snapshot_id',p_snapshot_id,
    'sede_id',v_sede_id,
    'grupos_actualizados',v_groups,
    'recontar_actualizados',v_details,
    'auto_resueltos',0
  );
end;
$function$;

CREATE OR REPLACE FUNCTION inventario.full_apply_snapshot_v1(p_installation_id uuid, p_sede_id uuid, p_batch_id uuid, p_payload jsonb, p_now timestamptz)
 RETURNS TABLE(ok boolean, codigo text, snapshot_id uuid, duplicado boolean, ultimo_snapshot_confirmado_at timestamp with time zone, stock_rows integer, incidencias_procesadas integer)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_inst inventario.instalaciones%rowtype;
  v_snapshot_id uuid;
  v_existing_snapshot_id uuid;
  v_contract_version integer;
  v_capturado_at timestamptz;
  v_version_catalogo integer;
  v_excel_hash text;
  v_stock jsonb;
  v_eliminados jsonb;
  v_incidencias jsonb;
  v_resumen jsonb;
  v_sku_total_excel integer;
  v_sku_catalogo integer;
  v_sku_excluidos integer;
  v_sku_validos integer;
  v_sku_stock_no_cero integer;
  v_sku_stock_cero integer;
  v_sku_eliminados integer;
  v_incidencias_total integer;
  v_expected_catalogo integer;
  v_expected_excluidos integer;
  v_expected_validos integer;
  v_stock_rows integer:=0;
  v_incidencias_count integer:=0;
  v_ultimo timestamptz;
  r record;
  v_num_a numeric;
  v_num_b numeric;
  v_int integer;
begin
  SELECT i.* INTO STRICT v_inst FROM inventario.instalaciones i WHERE i.id=p_installation_id;
  v_inst.sede_id:=p_sede_id;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    return query select false,'INVALID_PAYLOAD',null::uuid,false,null::timestamptz,0,0;
    return;
  end if;

  if p_payload ? 'ignorados' then
    return query select false,'INVALID_PAYLOAD_STRUCTURE',null::uuid,false,null::timestamptz,0,0;
    return;
  end if;

  begin
    v_contract_version:=(p_payload->>'contract_version')::integer;
    v_snapshot_id:=(p_payload->>'snapshot_id')::uuid;
    v_capturado_at:=(p_payload->>'capturado_at')::timestamptz;
    v_version_catalogo:=(p_payload->>'version_catalogo')::integer;
  exception when others then
    return query select false,'INVALID_PAYLOAD_METADATA',null::uuid,false,null::timestamptz,0,0;
    return;
  end;

  if v_contract_version is distinct from 2 then
    return query select false,'INVALID_CONTRACT_VERSION',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  v_excel_hash:=lower(btrim(coalesce(p_payload->>'excel_hash','')));
  if v_snapshot_id is null or v_capturado_at is null or v_version_catalogo is null or v_version_catalogo<=0
     or v_excel_hash !~ '^[0-9a-f]{64}$' then
    return query select false,'INVALID_PAYLOAD_METADATA',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  v_stock:=coalesce(p_payload->'stock','[]'::jsonb);
  v_eliminados:=coalesce(p_payload->'eliminados','[]'::jsonb);
  v_incidencias:=coalesce(p_payload->'incidencias','[]'::jsonb);
  v_resumen:=coalesce(p_payload->'resumen','{}'::jsonb);

  if jsonb_typeof(v_stock)<>'array' or jsonb_typeof(v_eliminados)<>'array'
     or jsonb_typeof(v_incidencias)<>'array' or jsonb_typeof(v_resumen)<>'object' then
    return query select false,'INVALID_PAYLOAD_STRUCTURE',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  if not exists(
    select 1 from inventario.versiones_catalogo vc
    where vc.version=v_version_catalogo and vc.storage_path is not null
  ) then
    return query select false,'CATALOG_VERSION_NOT_AVAILABLE',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  if not exists(
    select 1 from inventario.versiones_catalogo vc
    where vc.version=v_version_catalogo and vc.schema_version=2
  ) then
    return query select false,'CATALOG_SCHEMA_NOT_SUPPORTED',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  select count(*)::integer,
         count(*) filter(where cvs.estado='excluido')::integer,
         count(*) filter(where cvs.estado='incluido')::integer
    into v_expected_catalogo,v_expected_excluidos,v_expected_validos
  from inventario.catalogo_version_skus cvs
  where cvs.version=v_version_catalogo;

  if v_expected_catalogo=0 then
    return query select false,'CATALOG_VERSION_NOT_AVAILABLE',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  begin
    v_sku_total_excel:=(v_resumen->>'sku_total_excel')::integer;
    v_sku_catalogo:=(v_resumen->>'sku_catalogo')::integer;
    v_sku_excluidos:=(v_resumen->>'sku_excluidos')::integer;
    v_sku_validos:=(v_resumen->>'sku_validos')::integer;
    v_sku_stock_no_cero:=(v_resumen->>'sku_stock_no_cero')::integer;
    v_sku_stock_cero:=(v_resumen->>'sku_stock_cero')::integer;
    v_sku_eliminados:=(v_resumen->>'sku_eliminados')::integer;
    v_incidencias_total:=(v_resumen->>'incidencias_total')::integer;
  exception when others then
    return query select false,'INVALID_SUMMARY',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end;

  if v_sku_total_excel<0 or v_sku_catalogo<0 or v_sku_excluidos<0 or v_sku_validos<0
     or v_sku_stock_no_cero<0 or v_sku_stock_cero<0 or v_sku_eliminados<0 or v_incidencias_total<0
     or v_sku_catalogo<>v_expected_catalogo
     or v_sku_excluidos<>v_expected_excluidos
     or v_sku_validos<>v_expected_validos
     or v_sku_stock_no_cero<>jsonb_array_length(v_stock)
     or v_sku_eliminados<>jsonb_array_length(v_eliminados)
     or v_incidencias_total<>jsonb_array_length(v_incidencias)
     or v_sku_catalogo<>v_sku_validos+v_sku_excluidos
     or v_sku_validos<>v_sku_stock_no_cero+v_sku_stock_cero+v_sku_eliminados then
    return query select false,'INVALID_SUMMARY',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  -- Stock array validation.
  begin
    if exists(
      select 1 from jsonb_to_recordset(v_stock) as x(c_interno integer,stock integer)
      where x.c_interno is null or x.c_interno<=20000 or x.stock is null or x.stock=0
    ) then
      return query select false,'INVALID_SKU_ARRAY',v_snapshot_id,false,null::timestamptz,0,0;
      return;
    end if;
  exception when others then
    return query select false,'INVALID_SKU_ARRAY',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end;

  if exists(
    select 1 from jsonb_to_recordset(v_stock) as x(c_interno integer,stock integer)
    group by c_interno having count(*)>1
  ) then
    return query select false,'DUPLICATE_SKU_IN_STOCK',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  if exists(
    select 1
    from jsonb_to_recordset(v_stock) as x(c_interno integer,stock integer)
    left join inventario.catalogo_version_skus cvs
      on cvs.version=v_version_catalogo and cvs.c_interno=x.c_interno and cvs.estado='incluido'
    where cvs.c_interno is null
  ) then
    return query select false,'UNKNOWN_SKU_WITHOUT_INCIDENT',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  -- Only producto_ausente may represent a valid unobserved catalog SKU.
  begin
    if exists(
      select 1
      from jsonb_to_recordset(v_eliminados) as x(c_interno integer,motivo text)
      where x.motivo in ('codigo_interno_duplicado','stock_invalido')
    ) then
      return query select false,'UNRESOLVABLE_STOCK_NOT_ALLOWED',v_snapshot_id,false,null::timestamptz,0,0;
      return;
    end if;

    if exists(
      select 1 from jsonb_to_recordset(v_eliminados) as x(c_interno integer,motivo text)
      where x.c_interno is null or x.c_interno<=20000
         or x.motivo<>'producto_ausente'
    ) then
      return query select false,'INVALID_SKU_ARRAY',v_snapshot_id,false,null::timestamptz,0,0;
      return;
    end if;
  exception when others then
    return query select false,'INVALID_SKU_ARRAY',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end;

  if exists(
    select 1 from jsonb_to_recordset(v_eliminados) as x(c_interno integer,motivo text)
    group by c_interno having count(*)>1
  ) then
    return query select false,'DUPLICATE_SKU_IN_PAYLOAD',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  if exists(
    select 1
    from jsonb_to_recordset(v_eliminados) as x(c_interno integer,motivo text)
    left join inventario.catalogo_version_skus cvs
      on cvs.version=v_version_catalogo and cvs.c_interno=x.c_interno and cvs.estado='incluido'
    where cvs.c_interno is null
  ) then
    return query select false,'SKU_STATE_CONFLICT',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  if exists(
    select 1
    from jsonb_to_recordset(v_stock) s(c_interno integer,stock integer)
    join jsonb_to_recordset(v_eliminados) e(c_interno integer,motivo text) using(c_interno)
  ) then
    return query select false,'SKU_STATE_CONFLICT',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  -- Incident structural validation and per-type minimum contract.
  begin
    for r in
      select * from jsonb_to_recordset(v_incidencias)
        as x(c_interno integer,c_interno_original text,tipo text,datos jsonb)
    loop
      if btrim(coalesce(r.tipo,'')) in ('codigo_interno_duplicado','stock_invalido') then
        return query select false,'UNRESOLVABLE_STOCK_NOT_ALLOWED',v_snapshot_id,false,null::timestamptz,0,0;
        return;
      end if;

      if r.tipo is null or btrim(r.tipo) not in (
        'producto_nuevo','producto_ausente','nombre_modificado','precio_modificado',
        'codigo_barras_modificado','codigo_barras_agregado','codigo_barras_eliminado',
        'codigo_interno_invalido'
      ) or r.datos is null or jsonb_typeof(r.datos)<>'object' then
        return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
        return;
      end if;

      if r.tipo='producto_nuevo' then
        if r.c_interno is null or r.c_interno<=20000
           or exists(select 1 from inventario.catalogo_version_skus cvs where cvs.version=v_version_catalogo and cvs.c_interno=r.c_interno)
           or nullif(btrim(coalesce(r.datos->>'producto','')),'') is null
           or not (r.datos ? 'precio') or not (r.datos ? 'stock') then
          return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
          return;
        end if;
        begin
          v_num_a:=(r.datos->>'precio')::numeric;
          v_int:=(r.datos->>'stock')::integer;
        exception when others then
          return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
          return;
        end;
        if v_num_a IS NULL OR v_int IS NULL OR v_num_a::text IN ('NaN','Infinity','-Infinity') OR v_num_a<0 then
          return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
          return;
        end if;
      elsif r.tipo='codigo_interno_invalido' then
        if r.c_interno is not null then
          return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
          return;
        end if;
      else
        if r.c_interno is null or not exists(
          select 1 from inventario.catalogo_version_skus cvs
          where cvs.version=v_version_catalogo and cvs.c_interno=r.c_interno and cvs.estado='incluido'
        ) then
          return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
          return;
        end if;

        if r.tipo='nombre_modificado' then
          if nullif(btrim(coalesce(r.datos->>'anterior','')),'') is null
             or nullif(btrim(coalesce(r.datos->>'nuevo','')),'') is null
             or lower(btrim(regexp_replace(r.datos->>'anterior','\s+',' ','g')))=lower(btrim(regexp_replace(r.datos->>'nuevo','\s+',' ','g'))) then
            return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
            return;
          end if;
        elsif r.tipo='precio_modificado' then
          begin
            v_num_a:=(r.datos->>'anterior')::numeric;
            v_num_b:=(r.datos->>'nuevo')::numeric;
          exception when others then
            return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
            return;
          end;
          if v_num_a IS NULL OR v_num_b IS NULL OR v_num_a::text IN ('NaN','Infinity','-Infinity') OR v_num_b::text IN ('NaN','Infinity','-Infinity') OR v_num_a<0 OR v_num_b<0 OR v_num_a=v_num_b then
            return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
            return;
          end if;
        elsif r.tipo='codigo_barras_modificado' then
          if nullif(regexp_replace(coalesce(r.datos->>'anterior',''),'\s','','g'),'') is null
             or nullif(regexp_replace(coalesce(r.datos->>'nuevo',''),'\s','','g'),'') is null
             or regexp_replace(r.datos->>'anterior','\s','','g')=regexp_replace(r.datos->>'nuevo','\s','','g') then
            return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
            return;
          end if;
        elsif r.tipo='codigo_barras_agregado' then
          if (r.datos ? 'anterior') and jsonb_typeof(r.datos->'anterior')<>'null' then
            return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
            return;
          end if;
          if nullif(regexp_replace(coalesce(r.datos->>'nuevo',''),'\s','','g'),'') is null then
            return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
            return;
          end if;
        elsif r.tipo='codigo_barras_eliminado' then
          if nullif(regexp_replace(coalesce(r.datos->>'anterior',''),'\s','','g'),'') is null then
            return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
            return;
          end if;
          if (r.datos ? 'nuevo') and jsonb_typeof(r.datos->'nuevo')<>'null' then
            return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
            return;
          end if;
        end if;
      end if;
    end loop;
  exception when others then
    return query select false,'INCIDENT_INVALID',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end;

  -- Strict correspondence between producto_ausente and eliminados[].
  if exists(
    select 1
    from jsonb_to_recordset(v_eliminados) e(c_interno integer,motivo text)
    where (select count(*) from jsonb_to_recordset(v_incidencias) i(c_interno integer,c_interno_original text,tipo text,datos jsonb)
           where i.c_interno=e.c_interno and i.tipo='producto_ausente')<>1
  ) or exists(
    select 1
    from jsonb_to_recordset(v_incidencias) i(c_interno integer,c_interno_original text,tipo text,datos jsonb)
    where i.tipo='producto_ausente'
      and (select count(*) from jsonb_to_recordset(v_eliminados) e(c_interno integer,motivo text)
           where e.c_interno=i.c_interno and e.motivo='producto_ausente')<>1
  ) then
    return query select false,'ELIMINATED_WITHOUT_INCIDENT',v_snapshot_id,false,null::timestamptz,0,0;
    return;
  end if;

  insert into inventario.snapshots(
    id,instalacion_id,sede_id,full_batch_id,recibido_at,capturado_at,version_catalogo,excel_hash,
    sku_total_excel,sku_catalogo,sku_excluidos,sku_validos,sku_stock_no_cero,sku_stock_cero,sku_eliminados,
    incidencias_total,estado
  ) values (
    v_snapshot_id,p_installation_id,v_inst.sede_id,p_batch_id,p_now,v_capturado_at,v_version_catalogo,v_excel_hash,
    v_sku_total_excel,v_sku_catalogo,v_sku_excluidos,v_sku_validos,v_sku_stock_no_cero,v_sku_stock_cero,v_sku_eliminados,
    v_incidencias_total,'procesando'
  );

  with stock_in as (
    select c_interno,stock
    from jsonb_to_recordset(v_stock) as x(c_interno integer,stock integer)
  ), elim_in as (
    select c_interno,motivo
    from jsonb_to_recordset(v_eliminados) as x(c_interno integer,motivo text)
  ), version_skus as (
    select c_interno
    from inventario.catalogo_version_skus
    where version=v_version_catalogo and estado='incluido'
  ), resolved as (
    select vs.c_interno,
           case when e.motivo='producto_ausente'
                then 0::integer
                else coalesce(s.stock,0)
           end stock,
           coalesce(e.motivo='producto_ausente',false) producto_eliminado,
           coalesce(e.motivo,'observado') estado_observacion
    from version_skus vs
    left join stock_in s using(c_interno)
    left join elim_in e using(c_interno)
  )
  insert into inventario.snapshot_stock(snapshot_id,c_interno,stock,producto_eliminado,capturado_at,estado_observacion)
  select v_snapshot_id,c_interno,stock,producto_eliminado,v_capturado_at,estado_observacion
  from resolved;

  get diagnostics v_stock_rows=row_count;

  if v_stock_rows<>v_sku_validos then
    raise exception 'SNAPSHOT_STOCK_RECONSTRUCTION_MISMATCH';
  end if;

  insert into inventario.stock_actual(
    sede_id,c_interno,stock,snapshot_id,producto_eliminado,updated_at,observed_at
  )
  select v_inst.sede_id,ss.c_interno,ss.stock,v_snapshot_id,ss.producto_eliminado,p_now,v_capturado_at
  from inventario.snapshot_stock ss
  where ss.snapshot_id=v_snapshot_id
    and ss.estado_observacion in ('observado','producto_ausente')
  on conflict(sede_id,c_interno) do update
  set stock=excluded.stock,
      snapshot_id=excluded.snapshot_id,
      producto_eliminado=excluded.producto_eliminado,
      observed_at=excluded.observed_at,
      updated_at=case
        when inventario.stock_actual.stock is distinct from excluded.stock
          or inventario.stock_actual.producto_eliminado is distinct from excluded.producto_eliminado
        then p_now
        else inventario.stock_actual.updated_at
      end;

  insert into inventario.incidencias(
    sede_id,c_interno,c_interno_original,tipo,estado,
    primer_snapshot_id,ultimo_snapshot_id,datos,
    first_seen_at,last_seen_at,occurrence_count,fingerprint,
    created_at,updated_at
  )
  select
    v_inst.sede_id,
    case when x.c_interno>20000 then x.c_interno else null end,
    nullif(btrim(x.c_interno_original),''),
    btrim(x.tipo),
    case
      when x.c_interno>20000 and exists(
        select 1 from inventario.exclusiones_incidencias e
        where (e.sede_id=v_inst.sede_id or e.sede_id is null)
          and e.c_interno=x.c_interno
          and e.tipo=btrim(x.tipo)
          and e.revocada_at is null
          and e.desde_at<=p_now
          and e.hasta_at>p_now
      ) then 'suprimida'
      else 'pendiente'
    end,
    v_snapshot_id,
    v_snapshot_id,
    coalesce(x.datos,'{}'::jsonb),
    v_capturado_at,
    v_capturado_at,
    1,
    encode(extensions.digest(
      concat_ws('|',
        v_inst.sede_id::text,
        coalesce(case when x.c_interno>20000 then x.c_interno::text else '' end,''),
        coalesce(nullif(btrim(x.c_interno_original),''),''),
        btrim(x.tipo),
        inventario.solog_incident_identity_text_v2(btrim(x.tipo),x.datos)
      ),'sha256'),'hex'),
    p_now,
    p_now
  from jsonb_to_recordset(v_incidencias)
    as x(c_interno integer,c_interno_original text,tipo text,datos jsonb)
  on conflict(sede_id,tipo,fingerprint) do update
  set ultimo_snapshot_id=excluded.ultimo_snapshot_id,
      last_seen_at=greatest(inventario.incidencias.last_seen_at,excluded.last_seen_at),
      occurrence_count=inventario.incidencias.occurrence_count+1,
      estado=case
        when excluded.c_interno is not null and exists(
          select 1 from inventario.exclusiones_incidencias e
          where (e.sede_id=excluded.sede_id or e.sede_id is null)
            and e.c_interno=excluded.c_interno
            and e.tipo=excluded.tipo
            and e.revocada_at is null
            and e.desde_at<=p_now
            and e.hasta_at>p_now
        ) then 'suprimida'
        else 'pendiente'
      end,
      resuelta_at=null,
      updated_at=p_now;

  get diagnostics v_incidencias_count=row_count;

  update inventario.snapshots
  set estado='confirmado',confirmado_at=p_now
  where id=v_snapshot_id;

  PERFORM inventario.full_project_groups_v1(v_snapshot_id,p_batch_id);
  PERFORM inventario.full_apply_groups_v1(v_snapshot_id);

  update inventario.instalaciones
  set ultimo_acceso_at=p_now,updated_at=p_now
  where id=p_installation_id;

  select max(s.confirmado_at) into v_ultimo
  from inventario.snapshots s
  where s.sede_id=v_inst.sede_id and s.confirmado_at is not null;

  return query select true,'OK',v_snapshot_id,false,v_ultimo,v_stock_rows,v_incidencias_count;
end;
$function$;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_admin_bootstrap_v2(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid(); v_rol text; v_nombre text; v_activo boolean; v_sites jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  select u.rol::text,u.nombre,u.activo into v_rol,v_nombre,v_activo from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol not in ('admin','moderador') then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'nombre',s.nombre,'operational_revision',inventario.solog_revision_get('operational',s.id),'devices_revision',inventario.solog_revision_get('devices',s.id),'incidents_revision',inventario.solog_revision_get('incidents',s.id)) order by s.nombre),'[]'::jsonb) into v_sites from public.sedes s where s.activo;
  return jsonb_build_object('contract_version',2,'generated_at',now(),'identity',jsonb_build_object('id',v_uid,'nombre',v_nombre,'rol',v_rol),
    'permissions',jsonb_build_object('can_admin',v_rol='admin','can_moderate',true),
    'allowed_sites',v_sites,'revisions',jsonb_build_object('groups',inventario.solog_revision_get('groups',null),'catalog',inventario.solog_revision_get('catalog',null)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_admin_bootstrap_v2(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_admin_bootstrap_v2(p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_admin_bootstrap_v2(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_admin_catalog_v4(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_active boolean;
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_operation uuid;
  v_expected_catalog bigint;
  v_expected_groups bigint;
  v_replay jsonb;
  v_result jsonb;
  v_response jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  select u.rol::text,u.activo
    into v_role,v_active
  from public.usuarios u
  where u.id=v_uid;

  if not found or not coalesce(v_active,false) then
    raise exception 'SOLOG_USER_DISABLED';
  end if;
  if v_role not in ('admin','moderador') then
    raise exception 'SOLOG_ADMIN_ROLE_REQUIRED';
  end if;

  if v_action not in (
    'proposal_action',
    'resolve_product',
    'resolve_price',
    'propose_product_state',
    'prepare_product',
    'prepare_price'
  ) then
    raise exception 'SOLOG_INVALID_ACTION';
  end if;

  begin
    v_operation:=(p_payload->>'operation_id')::uuid;
    v_expected_catalog:=(p_payload->>'expected_catalog_revision')::bigint;
    v_expected_groups:=(p_payload->>'expected_groups_revision')::bigint;
  exception when others then
    raise exception 'SOLOG_INVALID_OPERATION';
  end;

  if v_operation is null
     or v_expected_catalog is null
     or v_expected_groups is null then
    raise exception 'SOLOG_INVALID_OPERATION';
  end if;

  v_replay:=inventario.solog_operation_begin(
    'catalog:v4:'||v_action,
    v_uid,
    v_operation,
    p_payload
  );

  if v_replay is not null then
    return v_replay||jsonb_build_object('replay',true);
  end if;

  if not pg_try_advisory_xact_lock(1397705807,4702) then
    raise exception 'SOLOG_LOCK_CONFLICT_RETRYABLE';
  end if;

  if v_expected_catalog<>inventario.solog_revision_get('catalog',null)
     or v_expected_groups<>inventario.solog_revision_get('groups',null) then
    raise exception 'SOLOG_MASTERDATA_REVISION_CONFLICT';
  end if;

  v_result:=inventario.solog_admin_catalog_mutate_v4(
    v_uid,
    v_action,
    p_payload-'expected_catalog_revision'-'expected_groups_revision'
  );

  v_response:=jsonb_build_object(
    'contract_version',4,
    'generated_at',now(),
    'replay',false,
    'result',v_result,
    'revisions',jsonb_build_object(
      'catalog',inventario.solog_revision_get('catalog',null),
      'groups',inventario.solog_revision_get('groups',null)
    )
  );

  return inventario.solog_operation_finish(
    'catalog:v4:'||v_action,
    v_uid,
    v_operation,
    v_response
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_admin_catalog_v4(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_admin_catalog_v4(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_admin_catalog_v4(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_admin_control_v1(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_site uuid;
  v_generated timestamptz := statement_timestamp();
begin
  if v_uid is null then
    raise exception 'SOLOG_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  select u.rol::text,u.activo
    into v_role,v_active
  from public.usuarios u
  where u.id=v_uid;

  if not found or not coalesce(v_active,false) then
    raise exception 'SOLOG_USER_DISABLED';
  end if;

  if v_role not in ('admin','moderador') then
    raise exception 'SOLOG_ADMIN_ROLE_REQUIRED';
  end if;

  begin
    v_site := (p_payload->>'site_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_SITE';
  end;

  if v_site is null then
    raise exception 'SOLOG_INVALID_SITE';
  end if;

  if not exists (
    select 1
    from public.sedes s
    where s.id=v_site
      and s.activo
  ) then
    raise exception 'SOLOG_SITE_FORBIDDEN';
  end if;

  if p_action='control_groups' then
    return inventario.solog_control_groups_v10(
      v_uid,v_site,v_generated,p_payload
    );
  elsif p_action='control_chronology_view' then
    return inventario.solog_control_chronology_view_v1(
      v_uid,v_site,v_generated,p_payload
    );
  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_admin_control_v1(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_admin_control_v1(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_admin_control_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_admin_devices_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_rol text; v_activo boolean; v_site uuid; v_device uuid; v_expected bigint; v_current bigint; v_operation uuid; v_replay jsonb; v_response jsonb;
  v_target inventario.dispositivos_solog%rowtype; v_authorized inventario.dispositivos_solog%rowtype; v_rows jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;
  select u.rol::text,u.activo into v_rol,v_activo from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol not in ('admin','moderador') then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;
  if nullif(p_payload->>'site_id','') is not null then begin v_site:=(p_payload->>'site_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_SITE'; end; end if;

  if p_action='list' then
    select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'site_id',d.sede_id,'site',s.nombre,'estado',d.estado,'solicitado_por',d.solicitado_por,'solicitante',u.nombre,'solicitado_at',d.solicitado_at,'autorizado_at',d.autorizado_at,'revocado_at',d.revocado_at,'ultimo_acceso_at',d.ultimo_acceso_at,'revision',inventario.solog_revision_get('devices',d.sede_id)) order by s.nombre,d.estado,d.solicitado_at desc),'[]'::jsonb) into v_rows
    from inventario.dispositivos_solog d join public.sedes s on s.id=d.sede_id join public.usuarios u on u.id=d.solicitado_por
    where s.activo and (v_site is null or d.sede_id=v_site) and d.estado in ('pendiente','autorizado');
    return jsonb_build_object('contract_version',2,'generated_at',now(),'devices',v_rows);
  end if;

  if p_action not in ('authorize','revoke','reject') then raise exception 'SOLOG_INVALID_ACTION'; end if;
  begin v_device:=(p_payload->>'device_id')::uuid; v_operation:=(p_payload->>'operation_id')::uuid; v_expected:=(p_payload->>'expected_revision')::bigint; exception when others then raise exception 'SOLOG_INVALID_DEVICE_OPERATION'; end;
  if v_device is null or v_operation is null or v_expected is null then raise exception 'SOLOG_INVALID_DEVICE_OPERATION'; end if;
  v_replay:=inventario.solog_operation_begin('devices:'||p_action,v_uid,v_operation,p_payload);
  if v_replay is not null then return v_replay||jsonb_build_object('replay',true); end if;
  select * into v_target from inventario.dispositivos_solog d where d.id=v_device;
  if not found then raise exception 'SOLOG_DEVICE_NOT_FOUND'; end if;
  v_site:=v_target.sede_id;
  perform 1 from public.sedes s where s.id=v_site and s.activo for update;
  if not found then raise exception 'SOLOG_SITE_FORBIDDEN'; end if;
  v_current:=inventario.solog_revision_get('devices',v_site);
  if v_expected<>v_current then raise exception 'SOLOG_DEVICE_REVISION_CONFLICT'; end if;
  select * into v_target from inventario.dispositivos_solog d where d.id=v_device for update;
  select * into v_authorized from inventario.dispositivos_solog d where d.sede_id=v_site and d.estado='autorizado' limit 1 for update;

  if p_action='authorize' then
    if v_target.estado='autorizado' then null;
    elsif v_target.estado<>'pendiente' then raise exception 'SOLOG_PENDING_DEVICE_NOT_FOUND';
    elsif v_authorized.id is not null and v_authorized.id<>v_target.id then raise exception 'SOLOG_DEVICE_REVISION_CONFLICT';
    else update inventario.dispositivos_solog set estado='autorizado',autorizado_por=v_uid,autorizado_at=now(),revocado_at=null,updated_at=now() where id=v_target.id; end if;
  elsif p_action='revoke' then
    if v_target.estado<>'autorizado' then raise exception 'SOLOG_DEVICE_NOT_REVOCABLE'; end if;
    update inventario.dispositivos_solog set estado='revocado',revocado_at=now(),updated_at=now() where id=v_target.id;
  else
    if v_target.estado<>'pendiente' then raise exception 'SOLOG_PENDING_DEVICE_NOT_FOUND'; end if;
    delete from inventario.dispositivos_solog where id=v_target.id;
  end if;

  select * into v_authorized from inventario.dispositivos_solog d where d.sede_id=v_site and d.estado='autorizado' limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'estado',d.estado,'solicitado_por',d.solicitado_por,'solicitado_at',d.solicitado_at,'ultimo_acceso_at',d.ultimo_acceso_at) order by d.solicitado_at),'[]'::jsonb) into v_rows
  from inventario.dispositivos_solog d where d.sede_id=v_site and d.estado='pendiente';
  v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'action',p_action,'site_id',v_site,
    'authorized_device',case when v_authorized.id is null then null else jsonb_build_object('id',v_authorized.id,'estado',v_authorized.estado,'autorizado_at',v_authorized.autorizado_at,'ultimo_acceso_at',v_authorized.ultimo_acceso_at) end,
    'pending_devices',v_rows,'revisions',jsonb_build_object('devices',inventario.solog_revision_get('devices',v_site)));
  insert into inventario.auditoria(accion,entidad,entidad_id,actor_tipo,actor_id,sede_id,datos)
  values('device_'||p_action,'dispositivo_solog',v_device::text,'usuario',v_uid::text,v_site,jsonb_build_object('operation_id',v_operation));
  return inventario.solog_operation_finish('devices:'||p_action,v_uid,v_operation,v_response);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_admin_devices_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_admin_devices_v2(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_admin_devices_v2(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_admin_groups_v1(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_active boolean;
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_operation uuid;
  v_expected_groups bigint;
  v_expected_catalog bigint;
  v_replay jsonb;
  v_result jsonb;
  v_response jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;
  select u.rol::text,u.activo into v_role,v_active from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_active,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_role not in ('admin','moderador') then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;
  if v_action not in ('group_create','group_update','membership_move','make_unique','valuation_save') then raise exception 'SOLOG_INVALID_ACTION'; end if;
  begin
    v_operation:=(p_payload->>'operation_id')::uuid;
    v_expected_groups:=(p_payload->>'expected_groups_revision')::bigint;
    v_expected_catalog:=(p_payload->>'expected_catalog_revision')::bigint;
  exception when others then raise exception 'SOLOG_INVALID_OPERATION'; end;
  if v_operation is null or v_expected_groups is null or v_expected_catalog is null then raise exception 'SOLOG_INVALID_OPERATION'; end if;

  v_replay:=inventario.solog_operation_begin('groups:v1:'||v_action,v_uid,v_operation,p_payload);
  if v_replay is not null then return v_replay||jsonb_build_object('replay',true); end if;

  if not pg_try_advisory_xact_lock(1397705807,4702) then raise exception 'SOLOG_LOCK_CONFLICT_RETRYABLE'; end if;
  if v_expected_groups<>inventario.solog_revision_get('groups',null)
     or v_expected_catalog<>inventario.solog_revision_get('catalog',null) then
    raise exception 'SOLOG_MASTERDATA_REVISION_CONFLICT';
  end if;

  v_result:=inventario.solog_admin_groups_mutate_v1(v_uid,v_action,p_payload-'operation_id'-'expected_groups_revision'-'expected_catalog_revision');
  v_response:=jsonb_build_object(
    'contract_version',1,'generated_at',now(),'replay',false,'result',v_result,
    'revisions',jsonb_build_object('groups',inventario.solog_revision_get('groups',null),'catalog',inventario.solog_revision_get('catalog',null))
  );
  return inventario.solog_operation_finish('groups:v1:'||v_action,v_uid,v_operation,v_response);
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_admin_groups_v1(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_admin_groups_v1(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_admin_groups_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_admin_incidents_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_rol text; v_activo boolean; v_site uuid; v_family text; v_operation uuid; v_scope text; v_replay jsonb; v_response jsonb;
  v_period_from date; v_period_to date; v_from timestamptz; v_to timestamptz; v_rows jsonb; v_page integer; v_page_size integer;
  v_inc inventario.incidencias%rowtype; v_until timestamptz; v_exclusion uuid; v_current bigint; v_expected bigint; v_fp text; v_change_id uuid;
  v_has_current boolean;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;
  select u.rol::text,u.activo into v_rol,v_activo from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol not in ('admin','moderador') then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;
  if nullif(p_payload->>'site_id','') is not null then
    begin v_site:=(p_payload->>'site_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_SITE'; end;
    if not exists(select 1 from public.sedes s where s.id=v_site and s.activo) then raise exception 'SOLOG_SITE_FORBIDDEN'; end if;
  end if;

  if p_action='summary' then
    v_period_from:=inventario.solog_periodo_desde(now()); v_period_to:=inventario.solog_periodo_hasta(now());
    v_from:=v_period_from::timestamp at time zone 'America/Lima'; v_to:=(v_period_to+1)::timestamp at time zone 'America/Lima';
    with scoped as (
      select i.* from inventario.incidencias i
      where i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
        and (v_site is null or i.sede_id=v_site)
        and ((i.last_seen_at>=v_from and i.last_seen_at<v_to) or (i.resuelta_at is not null and i.resuelta_at>=v_from and i.resuelta_at<v_to))
    ), latest as (
      select distinct on (i.family_key) i.* from scoped i
      order by i.family_key,case when i.estado in ('pendiente','suprimida') then 0 else 1 end,i.last_seen_at desc,i.id desc
    ), agg as (
      select i.family_key,count(*)::integer cases,sum(i.occurrence_count)::bigint occurrences,count(distinct i.sede_id)::integer sites,
        count(*) filter(where i.estado='pendiente')::integer pending_cases,
        count(*) filter(where i.estado='suprimida')::integer suppressed_cases,
        count(*) filter(where i.estado='resuelta')::integer resolved_cases,
        count(*) filter(where i.estado in ('pendiente','suprimida'))::integer active_cases,
        min(i.first_seen_at) first_seen_at,max(i.last_seen_at) last_seen_at,max(i.resuelta_at) resolved_at
      from scoped i group by i.family_key
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'family_key',l.family_key,'tipo',l.tipo,'c_interno',l.c_interno,'c_interno_original',l.c_interno_original,'datos',l.datos,
      'representative_id',l.id,'representative_site_id',l.sede_id,'cases',a.cases,'occurrences',a.occurrences,'sites',a.sites,
      'pending_cases',a.pending_cases,'suppressed_cases',a.suppressed_cases,'resolved_cases',a.resolved_cases,'active_cases',a.active_cases,
      'active',a.active_cases>0,'family_state',case when a.pending_cases>0 then 'pendiente' when a.suppressed_cases>0 then 'suprimida' else 'resuelta' end,
      'first_seen_at',a.first_seen_at,'last_seen_at',a.last_seen_at,'resolved_at',a.resolved_at,
      'active_suppression_until',(select max(e.hasta_at) from inventario.exclusiones_incidencias e where e.family_key=l.family_key and e.revocada_at is null and now()>=e.desde_at and now()<e.hasta_at and (e.sede_id is null or v_site is null or e.sede_id=v_site)),
      'scope_suppression_until',(select max(e.hasta_at) from inventario.exclusiones_incidencias e where e.family_key=l.family_key and e.revocada_at is null and now()>=e.desde_at and now()<e.hasta_at and e.sede_id is not distinct from v_site),
      'reactivate_available',exists(select 1 from inventario.exclusiones_incidencias e where e.family_key=l.family_key and e.revocada_at is null and now()>=e.desde_at and now()<e.hasta_at and e.sede_id is not distinct from v_site),
      'deletion_proposed',exists(select 1 from inventario.cambios_catalogo cc where cc.tipo='eliminar_producto' and cc.c_interno=l.c_interno and cc.estado in ('pendiente','aprobado','incorporado'))
    ) order by (a.active_cases>0) desc,a.last_seen_at desc,l.family_key),'[]'::jsonb) into v_rows
    from latest l join agg a using(family_key);
    return jsonb_build_object('contract_version',2,'generated_at',now(),'period',jsonb_build_object('from',v_period_from,'to',v_period_to),'site_id',v_site,'families',v_rows,
      'revisions',jsonb_build_object(
        'incidents',inventario.solog_revision_get('incidents',v_site),
        'incidents_global',inventario.solog_revision_get('incidents',null)
      ));

  elsif p_action='detail_sites' then
    v_family:=nullif(btrim(p_payload->>'family_key'),'');
    if v_family is null or length(v_family)<>64 then raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND'; end if;

    if not exists(
      select 1
      from inventario.incidencias i
      where i.family_key=v_family
        and i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
    ) then
      raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND';
    end if;

    with family_sites as (
      select
        i.sede_id,
        sum(i.occurrence_count)::bigint occurrences,
        count(*) filter(where i.estado='pendiente')::integer pending_rows,
        count(*) filter(where i.estado='suprimida')::integer suppressed_rows,
        count(*) filter(where i.estado in ('pendiente','suprimida'))::integer active_rows,
        min(i.first_seen_at) first_seen_at,
        max(i.last_seen_at) last_seen_at,
        max(i.resuelta_at) resolved_at
      from inventario.incidencias i
      where i.family_key=v_family
        and i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
      group by i.sede_id
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'site_id',s.id,
          'site',s.nombre,
          'occurrences',coalesce(fs.occurrences,0),
          'state',case
            when fs.sede_id is null then null
            when fs.pending_rows>0 then 'pendiente'
            when fs.suppressed_rows>0 then 'suprimida'
            else 'resuelta'
          end,
          'active',coalesce(fs.active_rows,0)>0,
          'first_seen_at',fs.first_seen_at,
          'last_seen_at',fs.last_seen_at,
          'resolved_at',fs.resolved_at
        )
        order by case lower(s.nombre)
          when 'cutervo' then 1
          when 'huaca' then 2
          when 'divino' then 3
          when 'unidad' then 4
          when 'casuarinas' then 5
          when 'casua' then 5
          else 99
        end, s.nombre
      ),
      '[]'::jsonb
    )
    into v_rows
    from public.sedes s
    left join family_sites fs on fs.sede_id=s.id
    where s.activo;

    return jsonb_build_object(
      'contract_version',2,
      'generated_at',now(),
      'family_key',v_family,
      'sites',v_rows,
      'revisions',jsonb_build_object(
        'incidents',inventario.solog_revision_get('incidents',null)
      )
    );

  elsif p_action in ('ignore_30d','reactivate','propose_delete') then
    v_family:=nullif(btrim(p_payload->>'family_key'),''); if v_family is null or length(v_family)<>64 then raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND'; end if;
    begin v_operation:=(p_payload->>'operation_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_OPERATION'; end;
    if v_operation is null then raise exception 'SOLOG_INVALID_OPERATION'; end if;
    v_scope:=lower(coalesce(nullif(btrim(p_payload->>'scope'),''),case when v_site is null then 'global' else 'site' end));
    if v_scope not in ('global','site') then raise exception 'SOLOG_INVALID_INCIDENT_SCOPE'; end if;
    if v_scope='site' and v_site is null then raise exception 'SOLOG_INVALID_SITE'; end if;
    v_replay:=inventario.solog_operation_begin('incidents:'||p_action,v_uid,v_operation,p_payload);
    if v_replay is not null then return v_replay||jsonb_build_object('replay',true); end if;
    perform pg_advisory_xact_lock(hashtextextended('solog-incidents:'||v_family||':'||v_scope||':'||coalesce(v_site::text,'global'),0));

    select * into v_inc from inventario.incidencias i
    where i.family_key=v_family
      and i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
      and (v_site is null or i.sede_id=v_site)
    order by case when i.estado in ('pendiente','suprimida') then 0 else 1 end,i.last_seen_at desc,i.id desc limit 1 for update;
    if not found then raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND'; end if;
    v_current:=inventario.solog_revision_get('incidents',case when v_scope='site' then v_site else null end);
    begin v_expected:=nullif(p_payload->>'expected_revision','')::bigint; exception when others then raise exception 'SOLOG_MASTERDATA_REVISION_CONFLICT'; end;
    if v_expected is not null and v_expected<>v_current then raise exception 'SOLOG_MASTERDATA_REVISION_CONFLICT'; end if;

    if p_action='ignore_30d' then
      if not exists(select 1 from inventario.incidencias i where i.family_key=v_family and i.estado in ('pendiente','suprimida') and (v_scope='global' or i.sede_id=v_site)) then raise exception 'SOLOG_INCIDENT_NOT_CURRENT'; end if;
      v_until:=now()+interval '30 days';
      select e.id into v_exclusion from inventario.exclusiones_incidencias e
      where e.family_key=v_family and e.sede_id is not distinct from (case when v_scope='site' then v_site else null end) and e.revocada_at is null
      order by e.created_at desc limit 1 for update;
      if v_exclusion is null then
        insert into inventario.exclusiones_incidencias(sede_id,c_interno,tipo,incidencia_origen_id,desde_at,hasta_at,motivo,revocada_at,created_at,family_key)
        values(case when v_scope='site' then v_site else null end,v_inc.c_interno,v_inc.tipo,v_inc.id,now(),v_until,'ignorar_30_dias',null,now(),v_family) returning id into v_exclusion;
      else
        update inventario.exclusiones_incidencias set incidencia_origen_id=v_inc.id,desde_at=now(),hasta_at=v_until,motivo='ignorar_30_dias',revocada_at=null where id=v_exclusion;
      end if;
      update inventario.incidencias set estado='suprimida',resuelta_at=null,updated_at=now()
      where family_key=v_family and estado in ('pendiente','suprimida') and (v_scope='global' or sede_id=v_site);
      insert into inventario.auditoria(accion,entidad,entidad_id,actor_tipo,actor_id,sede_id,datos)
      values('suppress_incident_30d','familia_incidencia',v_family,'usuario',v_uid::text,case when v_scope='site' then v_site else null end,jsonb_build_object('scope',v_scope,'hasta_at',v_until,'exclusion_id',v_exclusion));
      v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'status','suppressed','family_key',v_family,'scope',v_scope,'site_id',case when v_scope='site' then v_site else null end,'until',v_until,
        'revisions',jsonb_build_object('incidents',inventario.solog_revision_get('incidents',case when v_scope='site' then v_site else null end)));

    elsif p_action='reactivate' then
      if not exists(
        select 1
        from inventario.exclusiones_incidencias e
        where e.family_key=v_family
          and e.revocada_at is null
          and now()>=e.desde_at and now()<e.hasta_at
          and e.sede_id is not distinct from (case when v_scope='site' then v_site else null end)
      ) then
        raise exception 'SOLOG_INCIDENT_SUPPRESSION_NOT_ACTIVE';
      end if;
      update inventario.exclusiones_incidencias set revocada_at=now()
      where family_key=v_family
        and revocada_at is null
        and now()>=desde_at and now()<hasta_at
        and sede_id is not distinct from (case when v_scope='site' then v_site else null end);
      update inventario.incidencias set estado='pendiente',resuelta_at=null,updated_at=now()
      where family_key=v_family and estado='suprimida' and (v_scope='global' or sede_id=v_site)
        and not exists(select 1 from inventario.exclusiones_incidencias e where e.family_key=v_family and e.revocada_at is null and now()>=e.desde_at and now()<e.hasta_at and (e.sede_id is null or e.sede_id=inventario.incidencias.sede_id));
      insert into inventario.auditoria(accion,entidad,entidad_id,actor_tipo,actor_id,sede_id,datos)
      values('reactivate_incident_family','familia_incidencia',v_family,'usuario',v_uid::text,case when v_scope='site' then v_site else null end,jsonb_build_object('scope',v_scope));
      v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'status','active','family_key',v_family,'scope',v_scope,'site_id',case when v_scope='site' then v_site else null end,
        'revisions',jsonb_build_object('incidents',inventario.solog_revision_get('incidents',case when v_scope='site' then v_site else null end)));

    else
      if v_inc.tipo<>'producto_ausente' or v_inc.c_interno is null then raise exception 'SOLOG_INCIDENT_ACTION_NOT_ALLOWED'; end if;
      select exists(
        select 1
        from inventario.incidencias i
        join inventario.snapshots s on s.id=i.ultimo_snapshot_id and s.estado='confirmado' and s.confirmado_at is not null
        join inventario.stock_actual sa
          on sa.sede_id=i.sede_id
         and sa.c_interno=i.c_interno
         and sa.snapshot_id=s.id
        where i.family_key=v_family and i.tipo='producto_ausente' and i.estado in ('pendiente','suprimida')
          and (v_scope='global' or i.sede_id=v_site)
          and sa.producto_eliminado
          and not exists(select 1 from inventario.snapshots newer where newer.sede_id=i.sede_id and newer.estado='confirmado' and newer.confirmado_at is not null and (newer.capturado_at>s.capturado_at or (newer.capturado_at=s.capturado_at and newer.id>s.id)))
      ) into v_has_current;
      if not v_has_current then raise exception 'SOLOG_INCIDENT_NOT_CURRENT'; end if;
      v_fp:=inventario.solog_catalog_admin_proposal_fingerprint_v4(v_operation,v_inc.c_interno,'eliminar_producto');
      insert into inventario.cambios_catalogo(propuesta_fingerprint,ambito,c_interno,grupo_id,tipo,estado,datos,incidencia_origen_id,aprobado_por,aprobado_at,created_at,updated_at)
      values(v_fp,'producto',v_inc.c_interno,null,'eliminar_producto','aprobado',jsonb_build_object('producto',coalesce((select c.producto from inventario.catalogo c where c.c_interno=v_inc.c_interno),v_inc.datos->>'producto'),'origen','producto_ausente_manual'),v_inc.id,v_uid,now(),now(),now())
      on conflict(propuesta_fingerprint) do update set estado='aprobado',datos=excluded.datos,incidencia_origen_id=excluded.incidencia_origen_id,aprobado_por=v_uid,aprobado_at=now(),ignorado_por=null,ignorado_at=null,updated_at=now() returning id into v_change_id;
      insert into inventario.auditoria(accion,entidad,entidad_id,actor_tipo,actor_id,sede_id,datos)
      values('approve_product_deletion','familia_incidencia',v_family,'usuario',v_uid::text,case when v_scope='site' then v_site else null end,jsonb_build_object('scope',v_scope,'c_interno',v_inc.c_interno,'cambio_catalogo_id',v_change_id));
      v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'status','deletion_proposed','family_key',v_family,'scope',v_scope,'site_id',case when v_scope='site' then v_site else null end,'cambio_catalogo_id',v_change_id,
        'revisions',jsonb_build_object('incidents',inventario.solog_revision_get('incidents',case when v_scope='site' then v_site else null end),'catalog',inventario.solog_revision_get('catalog',null)));
    end if;
    return inventario.solog_operation_finish('incidents:'||p_action,v_uid,v_operation,v_response);
  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_admin_incidents_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_admin_incidents_v2(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_admin_incidents_v2(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_admin_masterdata_v1(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_active boolean;
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_operation uuid;
  v_expected_categories bigint;
  v_replay jsonb;
  v_result jsonb;
  v_response jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;

  select u.rol::text,u.activo into v_role,v_active
  from public.usuarios u where u.id=v_uid;

  if not found or not coalesce(v_active,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_role not in ('admin','moderador') then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;
  if v_action not in ('category_create','category_rename','category_reorder') then raise exception 'SOLOG_INVALID_ACTION'; end if;

  begin
    v_operation:=(p_payload->>'operation_id')::uuid;
    v_expected_categories:=(p_payload->>'expected_categories_revision')::bigint;
  exception when others then
    raise exception 'SOLOG_INVALID_OPERATION';
  end;
  if v_operation is null or v_expected_categories is null then raise exception 'SOLOG_INVALID_OPERATION'; end if;

  v_replay:=inventario.solog_operation_begin(
    'masterdata:v1:'||v_action,
    v_uid,
    v_operation,
    p_payload
  );
  if v_replay is not null then
    return v_replay||jsonb_build_object('replay',true);
  end if;

  if not pg_try_advisory_xact_lock(1397705807,4702) then
    raise exception 'SOLOG_LOCK_CONFLICT_RETRYABLE';
  end if;

  if v_expected_categories<>inventario.solog_revision_get('categories',null) then
    raise exception 'SOLOG_MASTERDATA_REVISION_CONFLICT';
  end if;

  v_result:=inventario.solog_admin_masterdata_mutate_v1(
    v_uid,
    v_action,
    p_payload-'operation_id'-'expected_categories_revision'
  );

  v_response:=jsonb_build_object(
    'contract_version',1,
    'generated_at',now(),
    'replay',false,
    'result',v_result,
    'revisions',jsonb_build_object(
      'groups',inventario.solog_revision_get('groups',null),
      'catalog',inventario.solog_revision_get('catalog',null),
      'categories',inventario.solog_revision_get('categories',null)
    )
  );

  return inventario.solog_operation_finish(
    'masterdata:v1:'||v_action,
    v_uid,
    v_operation,
    v_response
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_admin_masterdata_v1(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_admin_masterdata_v1(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_admin_masterdata_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_cashier_bootstrap_v4(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_nombre text;
  v_rol text;
  v_sede_id uuid;
  v_activo boolean;
  v_sede_nombre text;

  v_token text;
  v_hash text;
  v_device_id uuid;
  v_device_estado text;
  v_device_sede uuid;
  v_authorized_exists boolean:=false;
  v_authorized boolean:=false;

  v_site_active_id uuid;
  v_own_active_id uuid;
  v_recovery_sessions jsonb:='[]'::jsonb;

  v_snapshot_id uuid;
  v_snapshot_at timestamptz;
  v_confirmado_at timestamptz;
  v_version integer;
  v_snapshot_expira_at timestamptz;
  v_session_expira_at timestamptz;

  v_stock_snapshot_id uuid;
  v_stock_snapshot_at timestamptz;
  v_stock_confirmado_at timestamptz;
  v_stock_version integer;
  v_stock_expira_at timestamptz;

  v_groups_rev bigint;
  v_devices_rev bigint;
  v_oper_rev bigint;

  v_panel_state jsonb:=null;
  v_pre_session_summary jsonb:=null;
  v_session_capability jsonb;
  v_can_start boolean:=false;
  v_reason text:=null;
  v_operational_groups integer:=0;
begin
  if v_uid is null then
    raise exception 'SOLOG_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  select u.nombre,u.rol::text,u.sede_id,u.activo
    into v_nombre,v_rol,v_sede_id,v_activo
  from public.usuarios u
  where u.id=v_uid;

  if not found or not coalesce(v_activo,false) then
    raise exception 'SOLOG_USER_DISABLED';
  end if;

  if v_rol<>'cajero' then
    raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED';
  end if;

  if v_sede_id is null then
    raise exception 'SOLOG_CASHIER_WITHOUT_SEDE';
  end if;

  select s.nombre
    into v_sede_nombre
  from public.sedes s
  where s.id=v_sede_id
    and s.activo;

  if not found then
    raise exception 'SOLOG_SEDE_NOT_FOUND';
  end if;

  perform inventario.solog_normalize_sessions_v4(
    clock_timestamp(),
    v_sede_id,
    null
  );

  select exists(
    select 1
    from inventario.dispositivos_solog d
    where d.sede_id=v_sede_id
      and d.estado='autorizado'
  )
  into v_authorized_exists;

  v_token:=nullif(btrim(coalesce(p_payload->>'device_token','')),'');

  if v_token is not null then
    if length(v_token)<32 or length(v_token)>512 then
      raise exception 'SOLOG_INVALID_DEVICE_TOKEN';
    end if;

    v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

    select d.id,d.estado,d.sede_id
      into v_device_id,v_device_estado,v_device_sede
    from inventario.dispositivos_solog d
    where d.device_hash=v_hash;

    v_authorized:=
      found
      and v_device_sede=v_sede_id
      and v_device_estado='autorizado';
  else
    v_device_estado:='token_requerido';
    v_device_sede:=v_sede_id;
  end if;

  select c.id
    into v_site_active_id
  from inventario.conteos c
  where c.sede_id=v_sede_id
    and c.estado='activo'
  order by c.iniciado_at desc
  limit 1;

  select c.id
    into v_own_active_id
  from inventario.conteos c
  where c.sede_id=v_sede_id
    and c.usuario_id=v_uid
    and c.estado='activo'
  order by c.iniciado_at desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',c.id,
      'iniciado_at',c.iniciado_at,
      'expira_at',c.expira_at,
      'recovery_until',c.expira_at+interval '2 hours',
      'snapshot_referencia_id',c.snapshot_referencia_id,
      'ronda',c.ronda,
      'turno',c.turno,
      'session_capability',
        inventario.solog_session_capability_v4(
          c.id,
          v_authorized,
          clock_timestamp()
        )
    )
    order by c.iniciado_at desc
  ),'[]'::jsonb)
  into v_recovery_sessions
  from inventario.conteos c
  where c.sede_id=v_sede_id
    and c.usuario_id=v_uid
    and c.estado='recovery'
    and clock_timestamp()<c.expira_at+interval '2 hours';

  select s.id,s.capturado_at,s.confirmado_at,s.version_catalogo
    into v_snapshot_id,v_snapshot_at,v_confirmado_at,v_version
  from inventario.snapshots s
  where s.sede_id=v_sede_id
    and s.estado='confirmado'
    and s.confirmado_at is not null
  order by s.confirmado_at desc,s.capturado_at desc,s.id desc
  limit 1;

  if v_snapshot_id is not null then
    v_snapshot_expira_at:=inventario.solog_snapshot_expira_at(v_snapshot_at);
    v_session_expira_at:=inventario.solog_sesion_expira_at(v_snapshot_at);
  end if;

  select count(*)::integer
    into v_operational_groups
  from inventario.estado_stock_grupo esg
  where esg.sede_id=v_sede_id
    and esg.activo
    and not esg.requiere_snapshot_completo;

  v_groups_rev:=inventario.solog_revision_get('groups',null);
  v_devices_rev:=inventario.solog_revision_get('devices',v_sede_id);
  v_oper_rev:=inventario.solog_revision_get('operational',v_sede_id);

  if not v_authorized then
    v_reason:='SOLOG_DEVICE_UNAUTHORIZED';
  elsif v_site_active_id is not null then
    v_reason:='SOLOG_SESSION_CONFLICT';
  elsif v_snapshot_id is null then
    v_reason:='SOLOG_CONFIRMED_SNAPSHOT_REQUIRED';
  elsif clock_timestamp()>=v_snapshot_expira_at then
    v_reason:='SOLOG_STOCK_EXPIRED';
  elsif clock_timestamp()>=v_snapshot_expira_at-interval '5 minutes' then
    v_reason:='SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY';
  elsif v_session_expira_at is null
        or clock_timestamp()>=v_session_expira_at then
    v_reason:='SOLOG_SESSION_WINDOW_CLOSED';
  elsif v_operational_groups=0 then
    v_reason:='SOLOG_OPERATIONAL_PERIOD_NOT_STARTED';
  else
    v_can_start:=true;
  end if;

  if v_authorized and v_own_active_id is not null then
    v_panel_state:=inventario.solog_cashier_panel_state_v4(
      v_own_active_id,
      clock_timestamp()
    );

    v_session_capability:=inventario.solog_session_capability_v4(
      v_own_active_id,
      true,
      clock_timestamp()
    );

    select s.id,s.capturado_at,s.confirmado_at,s.version_catalogo
      into
        v_stock_snapshot_id,
        v_stock_snapshot_at,
        v_stock_confirmado_at,
        v_stock_version
    from inventario.conteos c
    join inventario.snapshots s
      on s.id=c.snapshot_referencia_id
    where c.id=v_own_active_id;

    v_stock_expira_at:=
      inventario.solog_snapshot_expira_at(v_stock_snapshot_at);
  else
    v_session_capability:=jsonb_build_object(
      'mode','none',
      'estado',null,
      'capture_allowed',false,
      'pending_delivery_allowed',false,
      'iniciado_at',null,
      'expira_at',null,
      'recovery_until',null,
      'finalizado_at',null
    );

    v_stock_snapshot_id:=v_snapshot_id;
    v_stock_snapshot_at:=v_snapshot_at;
    v_stock_confirmado_at:=v_confirmado_at;
    v_stock_version:=v_version;
    v_stock_expira_at:=v_snapshot_expira_at;

    if v_authorized then
      v_pre_session_summary:=
        inventario.solog_cashier_operational_summary_v4(
          v_sede_id,
          clock_timestamp()
        );
    end if;
  end if;

  return jsonb_build_object(
    'contract_version',4,
    'generated_at',clock_timestamp(),
    'server_now',clock_timestamp(),
    'revisions',jsonb_build_object(
      'groups',v_groups_rev,
      'devices',v_devices_rev,
      'operational',v_oper_rev
    ),
    'identity',jsonb_build_object(
      'id',v_uid,
      'nombre',v_nombre,
      'rol',v_rol
    ),
    'site',jsonb_build_object(
      'id',v_sede_id,
      'nombre',v_sede_nombre
    ),
    'device',jsonb_build_object(
      'id',v_device_id,
      'estado',coalesce(v_device_estado,'sin_solicitud'),
      'sede_correcta',v_device_sede=v_sede_id,
      'autorizado',v_authorized,
      'sede_tiene_dispositivo_autorizado',v_authorized_exists
    ),
    'stock',jsonb_build_object(
      'snapshot_id',v_stock_snapshot_id,
      'capturado_at',v_stock_snapshot_at,
      'confirmado_at',v_stock_confirmado_at,
      'snapshot_expira_at',v_stock_expira_at,
      'version_catalogo',v_stock_version
    ),
    'start_capability',jsonb_build_object(
      'allowed',v_can_start,
      'reason',v_reason
    ),
    'session_capability',v_session_capability,
    'recovery_sessions',v_recovery_sessions,
    'pre_session_summary',v_pre_session_summary,
    'panel_state',v_panel_state
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_bootstrap_v4(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702); RETURN inventario.full_compat_rpc_solog_cashier_bootstrap_v4(p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_cashier_bootstrap_v4(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_cashier_mutate_v4(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz:=clock_timestamp();
  v_uid uuid:=auth.uid();
  v_rol text;
  v_sede_id uuid;
  v_activo boolean;

  v_token text;
  v_hash text;
  v_device_id uuid;

  v_operation_id uuid;
  v_replay jsonb;
  v_response jsonb;

  v_conteo_id uuid;
  v_session inventario.conteos%rowtype;
  v_ctx record;

  v_snapshot_id uuid;
  v_snapshot_at timestamptz;
  v_snapshot_confirmado_at timestamptz;
  v_version integer;
  v_expira_at timestamptz;
  v_groups_rev bigint;
  v_oper_rev bigint;
  v_operational_groups integer;

  v_items jsonb;
  v_item jsonb;
  v_client_id uuid;
  v_group_id uuid;
  v_stock_fisico integer;
  v_observed_at timestamptz;
  v_runtime inventario.solog_session_runtime_groups%rowtype;

  v_diff integer;
  v_state text;
  v_detail_id uuid;
  v_first_post uuid;
  v_latest_post uuid;
  v_first_stock integer;
  v_latest_stock integer;

  v_recount_detail uuid;
  v_recount_stock integer;
  v_recount_at timestamptz;
  v_cd inventario.conteo_detalle%rowtype;
  v_d0 integer;
  v_dr integer;
  v_final_diff integer;
  v_final_state text;

  v_results jsonb:='[]'::jsonb;
  v_saved integer:=0;
  v_expected_groups bigint;
  v_affected_groups uuid[]:='{}'::uuid[];

  v_panel_state jsonb;
  v_panel_delta jsonb;
  v_session_capability jsonb;
  v_finish jsonb;
begin
  if v_uid is null then
    raise exception 'SOLOG_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  if p_action not in ('start','save_batch','recount_save_batch','finish') then
    raise exception 'SOLOG_INVALID_ACTION';
  end if;

  select u.rol::text,u.sede_id,u.activo
    into v_rol,v_sede_id,v_activo
  from public.usuarios u
  where u.id=v_uid;

  if not found or not coalesce(v_activo,false) then
    raise exception 'SOLOG_USER_DISABLED';
  end if;

  if v_rol<>'cajero' then
    raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED';
  end if;

  if v_sede_id is null then
    raise exception 'SOLOG_CASHIER_WITHOUT_SEDE';
  end if;

  begin
    v_operation_id:=(p_payload->>'operation_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_OPERATION';
  end;

  if v_operation_id is null then
    raise exception 'SOLOG_INVALID_OPERATION';
  end if;

  v_replay:=inventario.solog_operation_begin(
    'cashier_v4:'||p_action,
    v_uid,
    v_operation_id,
    p_payload - 'device_token'
  );

  if v_replay is not null then
    return v_replay||jsonb_build_object('replay',true);
  end if;

  perform 1
  from public.sedes s
  where s.id=v_sede_id
    and s.activo
  for update;

  if not found then
    raise exception 'SOLOG_SEDE_NOT_FOUND';
  end if;

  v_token:=nullif(btrim(coalesce(p_payload->>'device_token','')),'');

  if v_token is null
     or length(v_token)<32
     or length(v_token)>512 then
    raise exception 'SOLOG_DEVICE_UNAUTHORIZED';
  end if;

  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

  select d.id
    into v_device_id
  from inventario.dispositivos_solog d
  where d.device_hash=v_hash
    and d.sede_id=v_sede_id
    and d.estado='autorizado'
  for update;

  if not found then
    raise exception 'SOLOG_DEVICE_UNAUTHORIZED';
  end if;

  update inventario.dispositivos_solog
  set
    ultimo_acceso_at=v_now,
    updated_at=v_now
  where id=v_device_id;

  perform inventario.solog_normalize_sessions_v4(
    v_now,
    v_sede_id,
    null
  );

  if p_action='start' then
    if exists(
      select 1
      from inventario.conteos c
      where c.sede_id=v_sede_id
        and c.estado='activo'
    ) then
      raise exception 'SOLOG_SESSION_CONFLICT';
    end if;

    select s.id,s.capturado_at,s.confirmado_at,s.version_catalogo
      into
        v_snapshot_id,
        v_snapshot_at,
        v_snapshot_confirmado_at,
        v_version
    from inventario.snapshots s
    where s.sede_id=v_sede_id
      and s.estado='confirmado'
      and s.confirmado_at is not null
    order by s.confirmado_at desc,s.capturado_at desc,s.id desc
    limit 1;

    if v_snapshot_id is null then
      raise exception 'SOLOG_CONFIRMED_SNAPSHOT_REQUIRED';
    end if;

    if v_now>=inventario.solog_snapshot_expira_at(v_snapshot_at) then
      raise exception 'SOLOG_STOCK_EXPIRED';
    end if;

    if v_now>=inventario.solog_snapshot_expira_at(v_snapshot_at)-interval '5 minutes' then
      raise exception 'SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY';
    end if;

    v_expira_at:=inventario.solog_sesion_expira_at(v_snapshot_at);

    if v_expira_at is null or v_now>=v_expira_at then
      raise exception 'SOLOG_SESSION_WINDOW_CLOSED';
    end if;

    select *
      into v_ctx
    from inventario.solog_temporal_context(v_now);

    select count(*)::integer
      into v_operational_groups
    from inventario.estado_stock_grupo esg
    where esg.sede_id=v_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo;

    if v_operational_groups=0 then
      raise exception 'SOLOG_OPERATIONAL_PERIOD_NOT_STARTED';
    end if;

    if exists(
      select 1
      from inventario.estado_stock_grupo esg
      where esg.sede_id=v_sede_id
        and esg.activo
        and not esg.requiere_snapshot_completo
        and inventario.solog_stock_grupo_snapshot(
          v_snapshot_id,
          esg.grupo_conteo_id
        ) is null
    ) then
      raise exception 'SOLOG_CONFIRMED_SNAPSHOT_INCOMPLETE';
    end if;

    v_groups_rev:=inventario.solog_revision_get('groups',null);

    insert into inventario.conteos(
      sede_id,
      estado,
      iniciado_at,
      usuario_id,
      expira_at,
      snapshot_referencia_id,
      version_catalogo,
      groups_revision,
      periodo_desde,
      periodo_hasta,
      ronda,
      ronda_desde,
      ronda_hasta,
      turno,
      turno_desde,
      turno_hasta,
      created_at,
      updated_at
    ) values(
      v_sede_id,
      'activo',
      v_now,
      v_uid,
      v_expira_at,
      v_snapshot_id,
      v_version,
      v_groups_rev,
      v_ctx.periodo_desde,
      v_ctx.periodo_hasta,
      v_ctx.ronda,
      v_ctx.ronda_desde,
      v_ctx.ronda_hasta,
      v_ctx.turno,
      v_ctx.turno_desde,
      v_ctx.turno_hasta,
      v_now,
      v_now
    )
    returning id
      into v_conteo_id;

    insert into inventario.solog_session_runtime_groups(
      conteo_id,
      grupo_conteo_id,
      snapshot_referencia_id,
      stock_teorico,
      grupo_nombre,
      categoria_id,
      categoria_nombre,
      tipo_grupo,
      precio,
      unidades_por_paquete,
      precio_paquete,
      codigos_internos,
      productos,
      accion,
      priority_class,
      detalle_reconteo_id,
      created_at,
      updated_at
    )
    select
      v_conteo_id,
      g.id,
      v_snapshot_id,
      st.stock_teorico,
      g.nombre,
      g.categoria_id,
      cat.nombre,
      case
        when count(c.c_interno) filter(where c.estado<>'Excluido')=1
          then 'Individual'
        else 'Agrupado'
      end,
      g.precio,
      g.unidades_por_paquete,
      g.precio_paquete,
      coalesce(
        array_agg(c.c_interno order by c.c_interno)
          filter(where c.c_interno is not null and c.estado<>'Excluido'),
        '{}'::integer[]
      ),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'c_interno',c.c_interno,
            'producto',c.producto,
            'marca',c.marca,
            'precio',c.precio
          )
          order by c.producto,c.c_interno
        ) filter(where c.c_interno is not null and c.estado<>'Excluido'),
        '[]'::jsonb
      ),
      a.action,
      inventario.solog_priority_classify_v4(a.action,a.coverage_complete),
      case when a.action='recount' then a.detalle_reconteo_id else null end,
      v_now,
      v_now
    from inventario.estado_stock_grupo esg
    join inventario.solog_cashier_group_actions_v4(v_sede_id,v_now) a
      on a.grupo_conteo_id=esg.grupo_conteo_id
    join inventario.grupos_conteo g
      on g.id=esg.grupo_conteo_id
     and g.activo
    join inventario.categorias cat
      on cat.id=g.categoria_id
     and cat.activo
    cross join lateral (
      select inventario.solog_stock_grupo_snapshot(
        v_snapshot_id,
        g.id
      ) as stock_teorico
    ) st
    left join inventario.catalogo c
      on c.grupo_conteo_id=g.id
    where esg.sede_id=v_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo
      and st.stock_teorico is not null
    group by
      g.id,
      g.nombre,
      g.categoria_id,
      cat.nombre,
      g.precio,
      g.unidades_por_paquete,
      g.precio_paquete,
      st.stock_teorico,
      a.action,
      a.coverage_complete,
      a.detalle_reconteo_id;

    if (
      select count(*)::integer
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
    )<>v_operational_groups then
      raise exception 'SOLOG_SESSION_RUNTIME_INCOMPLETE';
    end if;

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_panel_state:=inventario.solog_cashier_panel_state_v4(
      v_conteo_id,
      v_now
    );

    v_session_capability:=
      inventario.solog_session_capability_v4(
        v_conteo_id,
        true,
        v_now
      );

    v_response:=jsonb_build_object(
      'contract_version',4,
      'generated_at',v_now,
      'action','start',
      'replay',false,
      'conteo_id',v_conteo_id,
      'revisions',jsonb_build_object(
        'groups',v_groups_rev,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      ),
      'stock',jsonb_build_object(
        'snapshot_id',v_snapshot_id,
        'capturado_at',v_snapshot_at,
        'confirmado_at',v_snapshot_confirmado_at,
        'snapshot_expira_at',
          inventario.solog_snapshot_expira_at(v_snapshot_at),
        'version_catalogo',v_version
      ),
      'session_capability',v_session_capability,
      'panel_state',v_panel_state
    );

    return inventario.solog_operation_finish(
      'cashier_v4:start',
      v_uid,
      v_operation_id,
      v_response
    );
  end if;

  begin
    v_conteo_id:=(p_payload->>'conteo_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_SESSION';
  end;

  if v_conteo_id is null then
    raise exception 'SOLOG_INVALID_SESSION';
  end if;

  select *
    into v_session
  from inventario.conteos c
  where c.id=v_conteo_id
  for update;

  if not found
     or v_session.sede_id<>v_sede_id
     or v_session.usuario_id<>v_uid then
    raise exception 'SOLOG_SESSION_NOT_FOUND';
  end if;

  if v_session.snapshot_referencia_id is null
     or v_session.groups_revision is null
     or v_session.ronda is null
     or v_session.turno is null then
    raise exception 'SOLOG_SESSION_REVISION_CONFLICT';
  end if;

  begin
    v_expected_groups:=
      nullif(p_payload->>'expected_groups_revision','')::bigint;
  exception when others then
    raise exception 'SOLOG_GROUPS_REVISION_CONFLICT';
  end;

  if v_expected_groups is not null
     and v_expected_groups<>v_session.groups_revision then
    raise exception 'SOLOG_GROUPS_REVISION_CONFLICT';
  end if;

  if p_action='save_batch' then
    v_items:=p_payload->'items';

    if v_items is null
       or jsonb_typeof(v_items)<>'array'
       or jsonb_array_length(v_items)=0
       or jsonb_array_length(v_items)>500 then
      raise exception 'SOLOG_INVALID_BATCH_PAYLOAD';
    end if;

    for v_item in
      select value from jsonb_array_elements(v_items)
    loop
      begin
        v_client_id:=(v_item->>'client_observation_id')::uuid;
        v_group_id:=(v_item->>'grupo_id')::uuid;
        v_stock_fisico:=(v_item->>'stock_fisico')::integer;
        v_observed_at:=(v_item->>'contado_at')::timestamptz;
      exception when others then
        raise exception 'SOLOG_INVALID_BATCH_ITEM';
      end;

      if v_client_id is null
         or v_group_id is null
         or v_stock_fisico is null
         or v_stock_fisico<0
         or v_observed_at is null then
        raise exception 'SOLOG_INVALID_BATCH_ITEM';
      end if;

      perform inventario.solog_validate_session_observation_v4(
        v_conteo_id,
        v_observed_at,
        clock_timestamp()
      );

      select *
        into v_runtime
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
        and sg.grupo_conteo_id=v_group_id
      for update;

      if not found then
        raise exception 'SOLOG_GROUP_NOT_AVAILABLE';
      end if;

      if v_runtime.accion not in ('coverage','daily') then
        raise exception 'SOLOG_GROUP_ALREADY_COUNTED';
      end if;

      if exists(
        select 1
        from inventario.conteo_detalle cd
        where cd.client_observation_id=v_client_id
      ) then
        raise exception 'SOLOG_CLIENT_OBSERVATION_CONFLICT';
      end if;

      v_diff:=v_stock_fisico-v_runtime.stock_teorico;
      v_state:=case
        when v_diff=0 then 'Coincide'
        else 'Recontar'
      end;

      insert into inventario.conteo_detalle(
        conteo_id,
        grupo_conteo_id,
        snapshot_referencia_id,
        stock_teorico,
        stock_fisico,
        diferencia,
        precio,
        valor_diferencia,
        contado_at,
        estado_diferencia,
        client_observation_id,
        grupo_nombre,
        categoria_nombre,
        tipo_grupo,
        codigos_internos,
        unidades_por_paquete,
        precio_paquete,
        created_at,
        updated_at
      ) values(
        v_conteo_id,
        v_group_id,
        v_session.snapshot_referencia_id,
        v_runtime.stock_teorico,
        v_stock_fisico,
        v_diff,
        v_runtime.precio,
        0,
        v_observed_at,
        v_state,
        v_client_id,
        v_runtime.grupo_nombre,
        v_runtime.categoria_nombre,
        v_runtime.tipo_grupo,
        v_runtime.codigos_internos,
        v_runtime.unidades_por_paquete,
        v_runtime.precio_paquete,
        clock_timestamp(),
        clock_timestamp()
      )
      returning id
        into v_detail_id;

      update inventario.solog_session_runtime_groups
      set
        accion='none',
        priority_class='none',
        contado_detalle_id=v_detail_id,
        contado_at=v_observed_at,
        updated_at=clock_timestamp()
      where conteo_id=v_conteo_id
        and grupo_conteo_id=v_group_id;

      update inventario.estado_stock_grupo esg
      set
        estado=case
          when esg.snapshot_id=v_session.snapshot_referencia_id
            then 'Contado'
          else esg.estado
        end,
        updated_at=clock_timestamp()
      where esg.sede_id=v_sede_id
        and esg.grupo_conteo_id=v_group_id
        and esg.activo;

      if v_state='Recontar' then
        select s.id,x.stock_now
          into v_first_post,v_first_stock
        from inventario.snapshots s
        cross join lateral (
          select inventario.solog_stock_grupo_snapshot(
            s.id,
            v_group_id
          ) as stock_now
        ) x
        where s.sede_id=v_sede_id
          and s.estado='confirmado'
          and s.confirmado_at is not null
          and s.capturado_at>v_observed_at
          and x.stock_now is not null
        order by s.capturado_at asc,s.confirmado_at asc,s.id asc
        limit 1;

        if v_first_post is not null then
          update inventario.conteo_detalle
          set
            primer_snapshot_posterior_id=v_first_post,
            snapshot_posterior_id=v_first_post,
            stock_posterior=v_first_stock,
            updated_at=clock_timestamp()
          where id=v_detail_id;

          select s.id,x.stock_now
            into v_latest_post,v_latest_stock
          from inventario.snapshots s
          cross join lateral (
            select inventario.solog_stock_grupo_snapshot(
              s.id,
              v_group_id
            ) as stock_now
          ) x
          where s.sede_id=v_sede_id
            and s.estado='confirmado'
            and s.confirmado_at is not null
            and s.capturado_at>v_observed_at
            and x.stock_now is not null
          order by s.capturado_at desc,s.confirmado_at desc,s.id desc
          limit 1;

          if v_latest_post is distinct from v_first_post then
            update inventario.conteo_detalle
            set
              snapshot_posterior_id=v_latest_post,
              stock_posterior=v_latest_stock,
              updated_at=clock_timestamp()
            where id=v_detail_id;
          end if;
        end if;
      end if;

      select cd.diferencia,cd.estado_diferencia
        into v_diff,v_state
      from inventario.conteo_detalle cd
      where cd.id=v_detail_id;

      v_results:=v_results||jsonb_build_array(
        jsonb_build_object(
          'client_observation_id',v_client_id,
          'detalle_id',v_detail_id,
          'grupo_id',v_group_id,
          'stock_teorico',v_runtime.stock_teorico,
          'stock_fisico',v_stock_fisico,
          'diferencia',v_diff,
          'estado_diferencia',v_state,
          'contado_at',v_observed_at
        )
      );

      v_affected_groups:=array_append(
        v_affected_groups,
        v_group_id
      );

      v_saved:=v_saved+1;
    end loop;

    v_panel_delta:=inventario.solog_cashier_panel_delta_v4(
      v_conteo_id,
      v_affected_groups,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',4,
      'generated_at',clock_timestamp(),
      'action','save_batch',
      'replay',false,
      'conteo_id',v_conteo_id,
      'saved',v_saved,
      'items',v_results,
      'panel_delta',v_panel_delta,
      'session_capability',
        v_panel_delta->'session_capability',
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v4:save_batch',
      v_uid,
      v_operation_id,
      v_response
    );

  elsif p_action='recount_save_batch' then
    v_items:=p_payload->'items';

    if v_items is null
       or jsonb_typeof(v_items)<>'array'
       or jsonb_array_length(v_items)=0
       or jsonb_array_length(v_items)>500 then
      raise exception 'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD';
    end if;

    if exists(
      select 1
      from jsonb_array_elements(v_items) x(value)
      group by value->>'detalle_id'
      having count(*)>1
    ) then
      raise exception 'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD';
    end if;

    for v_item in
      select value from jsonb_array_elements(v_items)
    loop
      begin
        v_recount_detail:=(v_item->>'detalle_id')::uuid;
        v_recount_stock:=(v_item->>'stock_fisico')::integer;
        v_recount_at:=(v_item->>'contado_at')::timestamptz;
      exception when others then
        raise exception 'SOLOG_INVALID_RECOUNT_BATCH_ITEM';
      end;

      if v_recount_detail is null
         or v_recount_stock is null
         or v_recount_stock<0
         or v_recount_at is null then
        raise exception 'SOLOG_INVALID_RECOUNT_BATCH_ITEM';
      end if;

      perform inventario.solog_validate_session_observation_v4(
        v_conteo_id,
        v_recount_at,
        clock_timestamp()
      );

      select *
        into v_cd
      from inventario.conteo_detalle cd
      where cd.id=v_recount_detail
      for update;

      if not found
         or v_cd.estado_diferencia<>'Recontar'
         or v_cd.primer_snapshot_posterior_id is null
         or v_cd.stock_reconteo is not null then
        raise exception 'SOLOG_RECOUNT_NOT_PENDING';
      end if;

      if v_cd.conteo_id=v_conteo_id then
        raise exception 'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN';
      end if;

      if not exists(
        select 1
        from inventario.conteos origin
        where origin.id=v_cd.conteo_id
          and origin.sede_id=v_sede_id
          and origin.iniciado_at<v_session.iniciado_at
      ) then
        raise exception 'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN';
      end if;

      select *
        into v_runtime
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
        and sg.grupo_conteo_id=v_cd.grupo_conteo_id
      for update;

      if not found
         or v_runtime.accion<>'recount'
         or v_runtime.detalle_reconteo_id
              is distinct from v_recount_detail then
        raise exception 'SOLOG_RECOUNT_NOT_PENDING';
      end if;

      if v_runtime.stock_teorico is null then
        raise exception 'SOLOG_RECOUNT_THEORETICAL_REQUIRED';
      end if;

      v_d0:=v_cd.stock_fisico-v_cd.stock_teorico;
      v_dr:=v_recount_stock-v_runtime.stock_teorico;

      if v_dr=0 then
        v_final_state:='Coincide';
        v_final_diff:=0;
      elsif (v_d0<0 and v_dr<0)
         or (v_d0>0 and v_dr>0) then
        v_final_state:='Confirmada';
        v_final_diff:=case
          when abs(v_dr)<abs(v_d0) then v_dr
          else v_d0
        end;
      else
        v_final_state:='Inconsistente';
        v_final_diff:=v_dr;
      end if;

      update inventario.conteo_detalle
      set
        snapshot_reconteo_id=v_session.snapshot_referencia_id,
        stock_teorico_reconteo=v_runtime.stock_teorico,
        stock_reconteo=v_recount_stock,
        recontado_at=v_recount_at,
        reconteo_conteo_id=v_conteo_id,
        estado_diferencia=v_final_state,
        diferencia=v_final_diff,
        updated_at=clock_timestamp()
      where id=v_recount_detail;

      update inventario.solog_session_runtime_groups
      set
        accion='none',
        priority_class='none',
        recontado_at=v_recount_at,
        updated_at=clock_timestamp()
      where conteo_id=v_conteo_id
        and grupo_conteo_id=v_cd.grupo_conteo_id;

      update inventario.estado_stock_grupo esg
      set
        estado=case
          when v_final_state='Inconsistente'
            then 'Cambio_reciente'
          when esg.snapshot_id=v_session.snapshot_referencia_id
            then 'Contado'
          else esg.estado
        end,
        updated_at=clock_timestamp()
      where esg.sede_id=v_sede_id
        and esg.grupo_conteo_id=v_cd.grupo_conteo_id
        and esg.ultimo_conteo_detalle_id=v_recount_detail;

      select jsonb_build_object(
        'detalle_id',cd.id,
        'grupo_id',cd.grupo_conteo_id,
        'snapshot_reconteo_id',cd.snapshot_reconteo_id,
        'stock_teorico_reconteo',cd.stock_teorico_reconteo,
        'stock_reconteo',cd.stock_reconteo,
        'diferencia_reconteo',
          cd.stock_reconteo-cd.stock_teorico_reconteo,
        'diferencia',cd.diferencia,
        'estado_diferencia',cd.estado_diferencia,
        'valor_diferencia',cd.valor_diferencia,
        'recontado_at',cd.recontado_at
      )
      into v_item
      from inventario.conteo_detalle cd
      where cd.id=v_recount_detail;

      v_results:=v_results||jsonb_build_array(v_item);

      v_affected_groups:=array_append(
        v_affected_groups,
        v_cd.grupo_conteo_id
      );

      v_saved:=v_saved+1;
    end loop;

    v_panel_delta:=inventario.solog_cashier_panel_delta_v4(
      v_conteo_id,
      v_affected_groups,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',4,
      'generated_at',clock_timestamp(),
      'action','recount_save_batch',
      'replay',false,
      'conteo_id',v_conteo_id,
      'saved',v_saved,
      'items',v_results,
      'panel_delta',v_panel_delta,
      'session_capability',
        v_panel_delta->'session_capability',
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v4:recount_save_batch',
      v_uid,
      v_operation_id,
      v_response
    );

  else
    v_finish:=inventario.solog_finish_session_v4(
      v_conteo_id,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',4,
      'generated_at',clock_timestamp(),
      'action','finish',
      'replay',false,
      'conteo_id',v_conteo_id,
      'status',v_finish->>'estado',
      'finalizado_at',v_finish->'finalizado_at',
      'session_capability',jsonb_build_object(
        'mode','none',
        'estado',v_finish->>'estado',
        'capture_allowed',false,
        'pending_delivery_allowed',false,
        'expira_at',v_finish->'expira_at',
        'recovery_until',v_finish->'recovery_until',
        'finalizado_at',v_finish->'finalizado_at'
      ),
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v4:finish',
      v_uid,
      v_operation_id,
      v_response
    );
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_mutate_v4(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702); RETURN inventario.full_compat_rpc_solog_cashier_mutate_v4(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_cashier_mutate_v4(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_cashier_mutate_v5(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz:=clock_timestamp();
  v_uid uuid:=auth.uid();
  v_rol text;
  v_sede_id uuid;
  v_activo boolean;

  v_token text;
  v_hash text;
  v_device_id uuid;

  v_operation_id uuid;
  v_replay jsonb;
  v_response jsonb;

  v_conteo_id uuid;
  v_session inventario.conteos%rowtype;
  v_ctx record;

  v_snapshot_id uuid;
  v_snapshot_at timestamptz;
  v_snapshot_confirmado_at timestamptz;
  v_version integer;
  v_expira_at timestamptz;
  v_groups_rev bigint;
  v_oper_rev bigint;
  v_operational_groups integer;

  v_items jsonb;
  v_item jsonb;
  v_client_id uuid;
  v_group_id uuid;
  v_stock_fisico integer;
  v_observed_at timestamptz;
  v_runtime inventario.solog_session_runtime_groups%rowtype;

  v_diff integer;
  v_state text;
  v_detail_id uuid;
  v_first_post uuid;
  v_latest_post uuid;
  v_first_stock integer;
  v_latest_stock integer;

  v_recount_detail uuid;
  v_recount_stock integer;
  v_recount_at timestamptz;
  v_reason text;
  v_observation text;
  v_recount_observation text;
  v_cd inventario.conteo_detalle%rowtype;
  v_d0 integer;
  v_dr integer;
  v_final_diff integer;
  v_final_state text;

  v_results jsonb:='[]'::jsonb;
  v_saved integer:=0;
  v_expected_groups bigint;
  v_affected_groups uuid[]:='{}'::uuid[];

  v_panel_state jsonb;
  v_panel_delta jsonb;
  v_session_capability jsonb;
  v_finish jsonb;
begin
  if v_uid is null then
    raise exception 'SOLOG_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  if p_action not in ('start','save_batch','recount_save_batch','finish') then
    raise exception 'SOLOG_INVALID_ACTION';
  end if;

  select u.rol::text,u.sede_id,u.activo
    into v_rol,v_sede_id,v_activo
  from public.usuarios u
  where u.id=v_uid;

  if not found or not coalesce(v_activo,false) then
    raise exception 'SOLOG_USER_DISABLED';
  end if;

  if v_rol<>'cajero' then
    raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED';
  end if;

  if v_sede_id is null then
    raise exception 'SOLOG_CASHIER_WITHOUT_SEDE';
  end if;

  begin
    v_operation_id:=(p_payload->>'operation_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_OPERATION';
  end;

  if v_operation_id is null then
    raise exception 'SOLOG_INVALID_OPERATION';
  end if;

  v_replay:=inventario.solog_operation_begin(
    'cashier_v5:'||p_action,
    v_uid,
    v_operation_id,
    p_payload - 'device_token'
  );

  if v_replay is not null then
    return v_replay||jsonb_build_object('replay',true);
  end if;

  perform 1
  from public.sedes s
  where s.id=v_sede_id
    and s.activo
  for update;

  if not found then
    raise exception 'SOLOG_SEDE_NOT_FOUND';
  end if;

  v_token:=nullif(btrim(coalesce(p_payload->>'device_token','')),'');

  if v_token is null
     or length(v_token)<32
     or length(v_token)>512 then
    raise exception 'SOLOG_DEVICE_UNAUTHORIZED';
  end if;

  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

  select d.id
    into v_device_id
  from inventario.dispositivos_solog d
  where d.device_hash=v_hash
    and d.sede_id=v_sede_id
    and d.estado='autorizado'
  for update;

  if not found then
    raise exception 'SOLOG_DEVICE_UNAUTHORIZED';
  end if;

  update inventario.dispositivos_solog
  set
    ultimo_acceso_at=v_now,
    updated_at=v_now
  where id=v_device_id;

  perform inventario.solog_normalize_sessions_v4(
    v_now,
    v_sede_id,
    null
  );

  if p_action='start' then
    if exists(
      select 1
      from inventario.conteos c
      where c.sede_id=v_sede_id
        and c.estado='activo'
    ) then
      raise exception 'SOLOG_SESSION_CONFLICT';
    end if;

    select s.id,s.capturado_at,s.confirmado_at,s.version_catalogo
      into
        v_snapshot_id,
        v_snapshot_at,
        v_snapshot_confirmado_at,
        v_version
    from inventario.snapshots s
    where s.sede_id=v_sede_id
      and s.estado='confirmado'
      and s.confirmado_at is not null
    order by s.confirmado_at desc,s.capturado_at desc,s.id desc
    limit 1;

    if v_snapshot_id is null then
      raise exception 'SOLOG_CONFIRMED_SNAPSHOT_REQUIRED';
    end if;

    if v_now>=inventario.solog_snapshot_expira_at(v_snapshot_at) then
      raise exception 'SOLOG_STOCK_EXPIRED';
    end if;

    if v_now>=inventario.solog_snapshot_expira_at(v_snapshot_at)-interval '5 minutes' then
      raise exception 'SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY';
    end if;

    v_expira_at:=inventario.solog_sesion_expira_at(v_snapshot_at);

    if v_expira_at is null or v_now>=v_expira_at then
      raise exception 'SOLOG_SESSION_WINDOW_CLOSED';
    end if;

    select *
      into v_ctx
    from inventario.solog_temporal_context(v_now);

    select count(*)::integer
      into v_operational_groups
    from inventario.estado_stock_grupo esg
    where esg.sede_id=v_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo;

    if v_operational_groups=0 then
      raise exception 'SOLOG_OPERATIONAL_PERIOD_NOT_STARTED';
    end if;

    if exists(
      select 1
      from inventario.estado_stock_grupo esg
      where esg.sede_id=v_sede_id
        and esg.activo
        and not esg.requiere_snapshot_completo
        and inventario.solog_stock_grupo_snapshot(
          v_snapshot_id,
          esg.grupo_conteo_id
        ) is null
    ) then
      raise exception 'SOLOG_CONFIRMED_SNAPSHOT_INCOMPLETE';
    end if;

    v_groups_rev:=inventario.solog_revision_get('groups',null);

    insert into inventario.conteos(
      sede_id,
      estado,
      iniciado_at,
      usuario_id,
      expira_at,
      snapshot_referencia_id,
      version_catalogo,
      groups_revision,
      periodo_desde,
      periodo_hasta,
      ronda,
      ronda_desde,
      ronda_hasta,
      turno,
      turno_desde,
      turno_hasta,
      created_at,
      updated_at
    ) values(
      v_sede_id,
      'activo',
      v_now,
      v_uid,
      v_expira_at,
      v_snapshot_id,
      v_version,
      v_groups_rev,
      v_ctx.periodo_desde,
      v_ctx.periodo_hasta,
      v_ctx.ronda,
      v_ctx.ronda_desde,
      v_ctx.ronda_hasta,
      v_ctx.turno,
      v_ctx.turno_desde,
      v_ctx.turno_hasta,
      v_now,
      v_now
    )
    returning id
      into v_conteo_id;

    insert into inventario.solog_session_runtime_groups(
      conteo_id,
      grupo_conteo_id,
      snapshot_referencia_id,
      stock_teorico,
      grupo_nombre,
      categoria_id,
      categoria_nombre,
      tipo_grupo,
      precio,
      unidades_por_paquete,
      precio_paquete,
      codigos_internos,
      productos,
      accion,
      priority_class,
      detalle_reconteo_id,
      created_at,
      updated_at
    )
    select
      v_conteo_id,
      g.id,
      v_snapshot_id,
      st.stock_teorico,
      g.nombre,
      g.categoria_id,
      cat.nombre,
      case
        when count(c.c_interno) filter(where c.estado<>'Excluido')=1
          then 'Individual'
        else 'Agrupado'
      end,
      g.precio,
      g.unidades_por_paquete,
      g.precio_paquete,
      coalesce(
        array_agg(c.c_interno order by c.c_interno)
          filter(where c.c_interno is not null and c.estado<>'Excluido'),
        '{}'::integer[]
      ),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'c_interno',c.c_interno,
            'producto',c.producto,
            'marca',c.marca,
            'precio',c.precio
          )
          order by c.producto,c.c_interno
        ) filter(where c.c_interno is not null and c.estado<>'Excluido'),
        '[]'::jsonb
      ),
      a.action,
      inventario.solog_priority_classify_v4(a.action,a.coverage_complete),
      case when a.action='recount' then a.detalle_reconteo_id else null end,
      v_now,
      v_now
    from inventario.estado_stock_grupo esg
    join inventario.solog_cashier_group_actions_v4(v_sede_id,v_now) a
      on a.grupo_conteo_id=esg.grupo_conteo_id
    join inventario.grupos_conteo g
      on g.id=esg.grupo_conteo_id
     and g.activo
    join inventario.categorias cat
      on cat.id=g.categoria_id
     and cat.activo
    cross join lateral (
      select inventario.solog_stock_grupo_snapshot(
        v_snapshot_id,
        g.id
      ) as stock_teorico
    ) st
    left join inventario.catalogo c
      on c.grupo_conteo_id=g.id
    where esg.sede_id=v_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo
      and st.stock_teorico is not null
    group by
      g.id,
      g.nombre,
      g.categoria_id,
      cat.nombre,
      g.precio,
      g.unidades_por_paquete,
      g.precio_paquete,
      st.stock_teorico,
      a.action,
      a.coverage_complete,
      a.detalle_reconteo_id;

    if (
      select count(*)::integer
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
    )<>v_operational_groups then
      raise exception 'SOLOG_SESSION_RUNTIME_INCOMPLETE';
    end if;

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_panel_state:=inventario.solog_cashier_panel_state_v4(
      v_conteo_id,
      v_now
    );

    v_session_capability:=
      inventario.solog_session_capability_v4(
        v_conteo_id,
        true,
        v_now
      );

    v_response:=jsonb_build_object(
      'contract_version',5,
      'generated_at',v_now,
      'action','start',
      'replay',false,
      'conteo_id',v_conteo_id,
      'revisions',jsonb_build_object(
        'groups',v_groups_rev,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      ),
      'stock',jsonb_build_object(
        'snapshot_id',v_snapshot_id,
        'capturado_at',v_snapshot_at,
        'confirmado_at',v_snapshot_confirmado_at,
        'snapshot_expira_at',
          inventario.solog_snapshot_expira_at(v_snapshot_at),
        'version_catalogo',v_version
      ),
      'session_capability',v_session_capability,
      'panel_state',v_panel_state
    );

    return inventario.solog_operation_finish(
      'cashier_v5:start',
      v_uid,
      v_operation_id,
      v_response
    );
  end if;

  begin
    v_conteo_id:=(p_payload->>'conteo_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_SESSION';
  end;

  if v_conteo_id is null then
    raise exception 'SOLOG_INVALID_SESSION';
  end if;

  select *
    into v_session
  from inventario.conteos c
  where c.id=v_conteo_id
  for update;

  if not found
     or v_session.sede_id<>v_sede_id
     or v_session.usuario_id<>v_uid then
    raise exception 'SOLOG_SESSION_NOT_FOUND';
  end if;

  if v_session.snapshot_referencia_id is null
     or v_session.groups_revision is null
     or v_session.ronda is null
     or v_session.turno is null then
    raise exception 'SOLOG_SESSION_REVISION_CONFLICT';
  end if;

  begin
    v_expected_groups:=
      nullif(p_payload->>'expected_groups_revision','')::bigint;
  exception when others then
    raise exception 'SOLOG_GROUPS_REVISION_CONFLICT';
  end;

  if v_expected_groups is not null
     and v_expected_groups<>v_session.groups_revision then
    raise exception 'SOLOG_GROUPS_REVISION_CONFLICT';
  end if;

  if p_action='save_batch' then
    v_items:=p_payload->'items';

    if v_items is null
       or jsonb_typeof(v_items)<>'array'
       or jsonb_array_length(v_items)=0
       or jsonb_array_length(v_items)>500 then
      raise exception 'SOLOG_INVALID_BATCH_PAYLOAD';
    end if;

    for v_item in
      select value from jsonb_array_elements(v_items)
    loop
      begin
        v_client_id:=(v_item->>'client_observation_id')::uuid;
        v_group_id:=(v_item->>'grupo_id')::uuid;
        v_stock_fisico:=(v_item->>'stock_fisico')::integer;
        v_observed_at:=(v_item->>'contado_at')::timestamptz;
      exception when others then
        raise exception 'SOLOG_INVALID_BATCH_ITEM';
      end;

      if not (v_item ? 'motivo_diferencia' and v_item ? 'observacion_diferencia')
         or jsonb_typeof(v_item->'motivo_diferencia') not in ('string','null')
         or jsonb_typeof(v_item->'observacion_diferencia') not in ('string','null') then
        raise exception 'SOLOG_OBSERVATION_FIELDS_REQUIRED';
      end if;
      v_reason:=nullif(btrim(v_item->>'motivo_diferencia'),'');
      v_observation:=nullif(regexp_replace(v_item->>'observacion_diferencia','^[[:space:]]+|[[:space:]]+$','','g'),'');
      if jsonb_typeof(v_item->'motivo_diferencia')='string' and v_reason is null then
        raise exception 'SOLOG_INVALID_DIFFERENCE_REASON';
      end if;
      if jsonb_typeof(v_item->'observacion_diferencia')='string' and v_observation is null then
        raise exception 'SOLOG_INVALID_DIFFERENCE_OBSERVATION';
      end if;

      if v_client_id is null
         or v_group_id is null
         or v_stock_fisico is null
         or v_stock_fisico<0
         or v_observed_at is null then
        raise exception 'SOLOG_INVALID_BATCH_ITEM';
      end if;

      perform inventario.solog_validate_session_observation_v4(
        v_conteo_id,
        v_observed_at,
        clock_timestamp()
      );

      select *
        into v_runtime
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
        and sg.grupo_conteo_id=v_group_id
      for update;

      if not found then
        raise exception 'SOLOG_GROUP_NOT_AVAILABLE';
      end if;

      if v_runtime.accion not in ('coverage','daily') then
        raise exception 'SOLOG_GROUP_ALREADY_COUNTED';
      end if;

      if exists(
        select 1
        from inventario.conteo_detalle cd
        where cd.client_observation_id=v_client_id
      ) then
        raise exception 'SOLOG_CLIENT_OBSERVATION_CONFLICT';
      end if;

      v_diff:=v_stock_fisico-v_runtime.stock_teorico;
      if v_reason is not null and v_reason not in
          ('Transferencia','Venta por mayor','Dañado','Vencido','Otro motivo') then
        raise exception 'SOLOG_INVALID_DIFFERENCE_REASON';
      end if;
      if (v_reason is null) is distinct from (v_observation is null)
         or (v_observation is not null and char_length(v_observation)<3) then
        raise exception 'SOLOG_INVALID_DIFFERENCE_OBSERVATION';
      end if;
      if abs(v_diff)>=12 and (v_reason is null or v_observation is null) then
        raise exception 'SOLOG_DIFFERENCE_EXPLANATION_REQUIRED';
      end if;
      v_state:=case
        when v_diff=0 then 'Coincide'
        else 'Recontar'
      end;

      insert into inventario.conteo_detalle(
        conteo_id,
        grupo_conteo_id,
        snapshot_referencia_id,
        stock_teorico,
        stock_fisico,
        diferencia,
        precio,
        valor_diferencia,
        contado_at,
        estado_diferencia,
        client_observation_id,
        motivo_diferencia,
        observacion_diferencia,
        grupo_nombre,
        categoria_nombre,
        tipo_grupo,
        codigos_internos,
        unidades_por_paquete,
        precio_paquete,
        created_at,
        updated_at
      ) values(
        v_conteo_id,
        v_group_id,
        v_session.snapshot_referencia_id,
        v_runtime.stock_teorico,
        v_stock_fisico,
        v_diff,
        v_runtime.precio,
        0,
        v_observed_at,
        v_state,
        v_client_id,
        v_reason,
        v_observation,
        v_runtime.grupo_nombre,
        v_runtime.categoria_nombre,
        v_runtime.tipo_grupo,
        v_runtime.codigos_internos,
        v_runtime.unidades_por_paquete,
        v_runtime.precio_paquete,
        clock_timestamp(),
        clock_timestamp()
      )
      returning id
        into v_detail_id;

      update inventario.solog_session_runtime_groups
      set
        accion='none',
        priority_class='none',
        contado_detalle_id=v_detail_id,
        contado_at=v_observed_at,
        updated_at=clock_timestamp()
      where conteo_id=v_conteo_id
        and grupo_conteo_id=v_group_id;

      update inventario.estado_stock_grupo esg
      set
        estado=case
          when esg.snapshot_id=v_session.snapshot_referencia_id
            then 'Contado'
          else esg.estado
        end,
        updated_at=clock_timestamp()
      where esg.sede_id=v_sede_id
        and esg.grupo_conteo_id=v_group_id
        and esg.activo;

      if v_state='Recontar' then
        select s.id,x.stock_now
          into v_first_post,v_first_stock
        from inventario.snapshots s
        cross join lateral (
          select inventario.solog_stock_grupo_snapshot(
            s.id,
            v_group_id
          ) as stock_now
        ) x
        where s.sede_id=v_sede_id
          and s.estado='confirmado'
          and s.confirmado_at is not null
          and s.capturado_at>v_observed_at
          and x.stock_now is not null
        order by s.capturado_at asc,s.confirmado_at asc,s.id asc
        limit 1;

        if v_first_post is not null then
          update inventario.conteo_detalle
          set
            primer_snapshot_posterior_id=v_first_post,
            snapshot_posterior_id=v_first_post,
            stock_posterior=v_first_stock,
            updated_at=clock_timestamp()
          where id=v_detail_id;

          select s.id,x.stock_now
            into v_latest_post,v_latest_stock
          from inventario.snapshots s
          cross join lateral (
            select inventario.solog_stock_grupo_snapshot(
              s.id,
              v_group_id
            ) as stock_now
          ) x
          where s.sede_id=v_sede_id
            and s.estado='confirmado'
            and s.confirmado_at is not null
            and s.capturado_at>v_observed_at
            and x.stock_now is not null
          order by s.capturado_at desc,s.confirmado_at desc,s.id desc
          limit 1;

          if v_latest_post is distinct from v_first_post then
            update inventario.conteo_detalle
            set
              snapshot_posterior_id=v_latest_post,
              stock_posterior=v_latest_stock,
              updated_at=clock_timestamp()
            where id=v_detail_id;
          end if;
        end if;
      end if;

      select cd.diferencia,cd.estado_diferencia
        into v_diff,v_state
      from inventario.conteo_detalle cd
      where cd.id=v_detail_id;

      v_results:=v_results||jsonb_build_array(
        jsonb_build_object(
          'client_observation_id',v_client_id,
          'detalle_id',v_detail_id,
          'grupo_id',v_group_id,
          'stock_teorico',v_runtime.stock_teorico,
          'stock_fisico',v_stock_fisico,
          'motivo_diferencia',v_reason,
          'observacion_diferencia',v_observation,
          'diferencia',v_diff,
          'estado_diferencia',v_state,
          'contado_at',v_observed_at
        )
      );

      v_affected_groups:=array_append(
        v_affected_groups,
        v_group_id
      );

      v_saved:=v_saved+1;
    end loop;

    v_panel_delta:=inventario.solog_cashier_panel_delta_v4(
      v_conteo_id,
      v_affected_groups,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',5,
      'generated_at',clock_timestamp(),
      'action','save_batch',
      'replay',false,
      'conteo_id',v_conteo_id,
      'saved',v_saved,
      'items',v_results,
      'panel_delta',v_panel_delta,
      'session_capability',
        v_panel_delta->'session_capability',
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v5:save_batch',
      v_uid,
      v_operation_id,
      v_response
    );

  elsif p_action='recount_save_batch' then
    v_items:=p_payload->'items';

    if v_items is null
       or jsonb_typeof(v_items)<>'array'
       or jsonb_array_length(v_items)=0
       or jsonb_array_length(v_items)>500 then
      raise exception 'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD';
    end if;

    if exists(
      select 1
      from jsonb_array_elements(v_items) x(value)
      group by value->>'detalle_id'
      having count(*)>1
    ) then
      raise exception 'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD';
    end if;

    for v_item in
      select value from jsonb_array_elements(v_items)
    loop
      begin
        v_recount_detail:=(v_item->>'detalle_id')::uuid;
        v_recount_stock:=(v_item->>'stock_fisico')::integer;
        v_recount_at:=(v_item->>'contado_at')::timestamptz;
      exception when others then
        raise exception 'SOLOG_INVALID_RECOUNT_BATCH_ITEM';
      end;

      if not (v_item ? 'motivo_diferencia' and v_item ? 'observacion_reconteo')
         or jsonb_typeof(v_item->'motivo_diferencia') not in ('string','null')
         or jsonb_typeof(v_item->'observacion_reconteo') not in ('string','null') then
        raise exception 'SOLOG_OBSERVATION_FIELDS_REQUIRED';
      end if;
      v_reason:=nullif(btrim(v_item->>'motivo_diferencia'),'');
      v_recount_observation:=nullif(regexp_replace(v_item->>'observacion_reconteo','^[[:space:]]+|[[:space:]]+$','','g'),'');
      if jsonb_typeof(v_item->'motivo_diferencia')='string' and v_reason is null then
        raise exception 'SOLOG_INVALID_DIFFERENCE_REASON';
      end if;
      if jsonb_typeof(v_item->'observacion_reconteo')='string' and v_recount_observation is null then
        raise exception 'SOLOG_INVALID_RECOUNT_OBSERVATION';
      end if;

      if v_recount_detail is null
         or v_recount_stock is null
         or v_recount_stock<0
         or v_recount_at is null then
        raise exception 'SOLOG_INVALID_RECOUNT_BATCH_ITEM';
      end if;

      perform inventario.solog_validate_session_observation_v4(
        v_conteo_id,
        v_recount_at,
        clock_timestamp()
      );

      select *
        into v_cd
      from inventario.conteo_detalle cd
      where cd.id=v_recount_detail
      for update;

      if not found
         or v_cd.estado_diferencia<>'Recontar'
         or v_cd.primer_snapshot_posterior_id is null
         or v_cd.stock_reconteo is not null then
        raise exception 'SOLOG_RECOUNT_NOT_PENDING';
      end if;

      if v_cd.conteo_id=v_conteo_id then
        raise exception 'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN';
      end if;

      if not exists(
        select 1
        from inventario.conteos origin
        where origin.id=v_cd.conteo_id
          and origin.sede_id=v_sede_id
          and origin.iniciado_at<v_session.iniciado_at
      ) then
        raise exception 'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN';
      end if;

      select *
        into v_runtime
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
        and sg.grupo_conteo_id=v_cd.grupo_conteo_id
      for update;

      if not found
         or v_runtime.accion<>'recount'
         or v_runtime.detalle_reconteo_id
              is distinct from v_recount_detail then
        raise exception 'SOLOG_RECOUNT_NOT_PENDING';
      end if;

      if v_runtime.stock_teorico is null then
        raise exception 'SOLOG_RECOUNT_THEORETICAL_REQUIRED';
      end if;

      v_d0:=v_cd.stock_fisico-v_cd.stock_teorico;
      v_dr:=v_recount_stock-v_runtime.stock_teorico;

      if v_reason is not null and v_reason not in
          ('Transferencia','Venta por mayor','Dañado','Vencido','Otro motivo') then
        raise exception 'SOLOG_INVALID_DIFFERENCE_REASON';
      end if;
      if v_cd.motivo_diferencia is not null
         and v_reason is not null
         and v_cd.motivo_diferencia<>v_reason then
        raise exception 'SOLOG_DIFFERENCE_REASON_IMMUTABLE';
      end if;
      v_reason:=coalesce(v_cd.motivo_diferencia,v_reason);
      if v_dr=0 then
        v_recount_observation:='Resuelto';
      else
        if v_recount_observation='Resuelto'
           or (v_recount_observation is not null and char_length(v_recount_observation)<3)
           or (v_cd.motivo_diferencia is null and v_reason is not null and v_recount_observation is null)
           or (v_reason is null and v_recount_observation is not null) then
          raise exception 'SOLOG_INVALID_RECOUNT_OBSERVATION';
        end if;
        if abs(v_dr)>=12 and (v_reason is null or v_recount_observation is null) then
          raise exception 'SOLOG_RECOUNT_EXPLANATION_REQUIRED';
        end if;
      end if;

      if v_dr=0 then
        v_final_state:='Coincide';
        v_final_diff:=0;
      elsif (v_d0<0 and v_dr<0)
         or (v_d0>0 and v_dr>0) then
        v_final_state:='Confirmada';
        v_final_diff:=case
          when abs(v_dr)<abs(v_d0) then v_dr
          else v_d0
        end;
      else
        v_final_state:='Inconsistente';
        v_final_diff:=v_dr;
      end if;

      update inventario.conteo_detalle
      set
        snapshot_reconteo_id=v_session.snapshot_referencia_id,
        stock_teorico_reconteo=v_runtime.stock_teorico,
        stock_reconteo=v_recount_stock,
        recontado_at=v_recount_at,
        reconteo_conteo_id=v_conteo_id,
        motivo_diferencia=v_reason,
        observacion_reconteo=v_recount_observation,
        estado_diferencia=v_final_state,
        diferencia=v_final_diff,
        updated_at=clock_timestamp()
      where id=v_recount_detail;

      update inventario.solog_session_runtime_groups
      set
        accion='none',
        priority_class='none',
        recontado_at=v_recount_at,
        updated_at=clock_timestamp()
      where conteo_id=v_conteo_id
        and grupo_conteo_id=v_cd.grupo_conteo_id;

      update inventario.estado_stock_grupo esg
      set
        estado=case
          when v_final_state='Inconsistente'
            then 'Cambio_reciente'
          when esg.snapshot_id=v_session.snapshot_referencia_id
            then 'Contado'
          else esg.estado
        end,
        updated_at=clock_timestamp()
      where esg.sede_id=v_sede_id
        and esg.grupo_conteo_id=v_cd.grupo_conteo_id
        and esg.ultimo_conteo_detalle_id=v_recount_detail;

      select jsonb_build_object(
        'detalle_id',cd.id,
        'grupo_id',cd.grupo_conteo_id,
        'snapshot_reconteo_id',cd.snapshot_reconteo_id,
        'stock_teorico_reconteo',cd.stock_teorico_reconteo,
        'stock_reconteo',cd.stock_reconteo,
        'motivo_diferencia',cd.motivo_diferencia,
        'observacion_reconteo',cd.observacion_reconteo,
        'diferencia_reconteo',
          cd.stock_reconteo-cd.stock_teorico_reconteo,
        'diferencia',cd.diferencia,
        'estado_diferencia',cd.estado_diferencia,
        'valor_diferencia',cd.valor_diferencia,
        'recontado_at',cd.recontado_at
      )
      into v_item
      from inventario.conteo_detalle cd
      where cd.id=v_recount_detail;

      v_results:=v_results||jsonb_build_array(v_item);

      v_affected_groups:=array_append(
        v_affected_groups,
        v_cd.grupo_conteo_id
      );

      v_saved:=v_saved+1;
    end loop;

    v_panel_delta:=inventario.solog_cashier_panel_delta_v4(
      v_conteo_id,
      v_affected_groups,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',5,
      'generated_at',clock_timestamp(),
      'action','recount_save_batch',
      'replay',false,
      'conteo_id',v_conteo_id,
      'saved',v_saved,
      'items',v_results,
      'panel_delta',v_panel_delta,
      'session_capability',
        v_panel_delta->'session_capability',
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v5:recount_save_batch',
      v_uid,
      v_operation_id,
      v_response
    );

  else
    v_finish:=inventario.solog_finish_session_v4(
      v_conteo_id,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',5,
      'generated_at',clock_timestamp(),
      'action','finish',
      'replay',false,
      'conteo_id',v_conteo_id,
      'status',v_finish->>'estado',
      'finalizado_at',v_finish->'finalizado_at',
      'session_capability',jsonb_build_object(
        'mode','none',
        'estado',v_finish->>'estado',
        'capture_allowed',false,
        'pending_delivery_allowed',false,
        'expira_at',v_finish->'expira_at',
        'recovery_until',v_finish->'recovery_until',
        'finalizado_at',v_finish->'finalizado_at'
      ),
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v5:finish',
      v_uid,
      v_operation_id,
      v_response
    );
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_mutate_v5(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702); RETURN inventario.full_compat_rpc_solog_cashier_mutate_v5(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_cashier_mutate_v5(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_cashier_orphan_finish_v1(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_sede_id uuid;
  v_rol text;
  v_activo boolean;
  v_conteo_id uuid;
  v_operation_id uuid;
  v_session inventario.conteos%rowtype;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'SOLOG_AUTH_REQUIRED'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';
  END IF;
  BEGIN
    v_conteo_id := (p_payload->>'conteo_id')::uuid;
    v_operation_id := (p_payload->>'operation_id')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';
  END;
  IF v_conteo_id IS NULL OR v_operation_id IS NULL THEN
    RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';
  END IF;
  SELECT u.sede_id,u.rol::text,u.activo
  INTO v_sede_id,v_rol,v_activo
  FROM public.usuarios u WHERE u.id=v_uid;
  IF NOT FOUND OR NOT coalesce(v_activo,false) THEN RAISE EXCEPTION 'SOLOG_USER_DISABLED'; END IF;
  IF v_rol <> 'cajero' THEN RAISE EXCEPTION 'SOLOG_OPERATIONAL_ROLE_REQUIRED'; END IF;
  IF v_sede_id IS NULL THEN RAISE EXCEPTION 'SOLOG_CASHIER_WITHOUT_SEDE'; END IF;
  PERFORM 1 FROM public.sedes s WHERE s.id=v_sede_id AND s.activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLOG_SEDE_NOT_FOUND'; END IF;
  SELECT * INTO v_session FROM inventario.conteos c
  WHERE c.id=v_conteo_id AND c.sede_id=v_sede_id AND c.usuario_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOLOG_SESSION_NOT_FOUND'; END IF;
  IF v_session.estado='finalizado' THEN
    RETURN public.rpc_solog_cashier_mutate_v4('finish',
      jsonb_build_object('conteo_id',v_conteo_id,'operation_id',v_operation_id,'device_token',p_payload->>'device_token'));
  END IF;
  IF v_session.estado <> 'recovery' THEN RAISE EXCEPTION 'SOLOG_RECOVERY_NOT_AVAILABLE'; END IF;
  IF EXISTS (
    SELECT 1 FROM inventario.solog_operaciones o
    WHERE o.actor_id=v_uid AND o.scope IN ('cashier_v4:start','cashier_v4:save_batch','cashier_v4:recount_save_batch','cashier_v4:finish')
      AND o.response IS NULL
  ) THEN RAISE EXCEPTION 'SOLOG_RECOVERY_OPERATION_UNRESOLVED'; END IF;
  RETURN public.rpc_solog_cashier_mutate_v4('finish',
    jsonb_build_object('conteo_id',v_conteo_id,'operation_id',v_operation_id,'device_token',p_payload->>'device_token'));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_orphan_finish_v1(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702); RETURN inventario.full_compat_rpc_solog_cashier_orphan_finish_v1(p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_cashier_orphan_finish_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_catalog_publication_artifact_v6(p_actor_id uuid, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare v_role text; v_active boolean; v_row inventario.solog_catalog_publications%rowtype;
begin
  if p_actor_id is null or p_operation_id is null then raise exception 'SOLOG_INVALID_OPERATION'; end if;
  select u.rol::text,u.activo into v_role,v_active from public.usuarios u where u.id=p_actor_id;
  if not found or not coalesce(v_active,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_role<>'admin' then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;
  select * into v_row from inventario.solog_catalog_publications p where p.actor_id=p_actor_id and p.operation_id=p_operation_id;
  if not found then raise exception 'SOLOG_OPERATION_NOT_STARTED'; end if;
  return jsonb_build_object(
    'contract_version',2,
    'operation_id',v_row.operation_id,
    'status',v_row.status,
    'version',v_row.version,
    'schema_version',v_row.schema_version,
    'prepared_at',v_row.created_at,
    'plan_hash',inventario.solog_catalog_plan_hash_v3(v_row.change_ids)
  );
end;$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_catalog_publication_artifact_v6(p_actor_id uuid, p_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_catalog_publication_artifact_v6(p_actor_id,p_operation_id); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_catalog_publication_artifact_v6(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_compat_rpc_solog_catalog_publication_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid;
  v_operation uuid;
  v_role text;
  v_active boolean;
  v_row inventario.solog_catalog_publications%rowtype;
  v_other inventario.solog_catalog_publications%rowtype;
  v_preview jsonb;
  v_ids uuid[];
  v_version integer;
  v_schema integer;
  v_result jsonb;
  v_response jsonb;
  v_error text;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;
  begin
    v_actor:=(p_payload->>'actor_id')::uuid;
    v_operation:=(p_payload->>'operation_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_OPERATION';
  end;
  if v_actor is null or v_operation is null then raise exception 'SOLOG_INVALID_OPERATION'; end if;

  select u.rol::text,u.activo into v_role,v_active from public.usuarios u where u.id=v_actor;
  if not found or not coalesce(v_active,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_role<>'admin' then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;

  if p_action='begin' then
    perform pg_advisory_xact_lock(1397705807,4703);

    select * into v_row
    from inventario.solog_catalog_publications p
    where p.actor_id=v_actor and p.operation_id=v_operation
    for update;

    if found then
      if v_row.status='committed' then
        return jsonb_build_object('contract_version',2,'status','committed','replay',true,'response',v_row.response,'version',v_row.version);
      elsif v_row.status='failed' then
        return jsonb_build_object('contract_version',2,'status','failed','replay',true,'error_code',v_row.error_code,'version',v_row.version);
      end if;

      if v_row.version is not null and exists(select 1 from inventario.versiones_catalogo vc where vc.version=v_row.version) then
        if not exists(
          select 1 from unnest(coalesce(v_row.change_ids,'{}'::uuid[])) x(id)
          left join inventario.cambios_catalogo cc on cc.id=x.id
          where cc.id is null or cc.estado<>'incorporado' or cc.version_aplicada is distinct from v_row.version
        ) then
          select jsonb_build_object(
            'ok',true,'codigo','CATALOG_PUBLISHED','version',vc.version,'hash',vc.hash,
            'storage_path',vc.storage_path,'productos',(select count(*) from inventario.catalogo),
            'grupos_activos',(select count(*) from inventario.grupos_conteo where activo),
            'cambios_incorporados',cardinality(coalesce(v_row.change_ids,'{}'::uuid[]))
          ) into v_response
          from inventario.versiones_catalogo vc where vc.version=v_row.version;
          update inventario.solog_catalog_publications
          set status='committed',response=v_response,updated_at=now()
          where actor_id=v_actor and operation_id=v_operation;
          return jsonb_build_object('contract_version',2,'status','committed','replay',true,'response',v_response,'version',v_row.version);
        end if;
      end if;

      v_preview:=inventario.catalogo_preparar_publicacion(v_row.change_ids);
      if not coalesce((v_preview->>'ok')::boolean,false) then
        return jsonb_build_object('contract_version',2,'status','prepared','replay',true,'resume_error',coalesce(v_preview->>'codigo','CATALOG_PREVIEW_ERROR'),'preview',v_preview,'version',v_row.version);
      end if;
      if (v_preview->>'version_nueva')::integer is distinct from v_row.version or (v_preview->>'schema_version')::integer is distinct from v_row.schema_version then
        raise exception 'SOLOG_CATALOG_RESERVATION_CONFLICT';
      end if;
      return jsonb_build_object('contract_version',2,'status','prepared','replay',true,'preview',v_preview,'version',v_row.version);
    end if;

    select * into v_other
    from inventario.solog_catalog_publications p
    where p.status='prepared'
    order by p.created_at
    limit 1
    for update;
    if found then
      if v_other.version is not null and exists(select 1 from inventario.versiones_catalogo vc where vc.version=v_other.version) then
        if not exists(
          select 1 from unnest(coalesce(v_other.change_ids,'{}'::uuid[])) x(id)
          left join inventario.cambios_catalogo cc on cc.id=x.id
          where cc.id is null or cc.estado<>'incorporado' or cc.version_aplicada is distinct from v_other.version
        ) then
          update inventario.solog_catalog_publications
          set status='committed',response=jsonb_build_object('ok',true,'codigo','CATALOG_PUBLISHED','version',v_other.version),updated_at=now()
          where actor_id=v_other.actor_id and operation_id=v_other.operation_id;
        else
          raise exception 'SOLOG_OPERATION_IN_PROGRESS';
        end if;
      else
        raise exception 'SOLOG_OPERATION_IN_PROGRESS';
      end if;
    end if;

    v_preview:=inventario.catalogo_preparar_publicacion(null);
    if not coalesce((v_preview->>'ok')::boolean,false) then
      return jsonb_build_object('contract_version',2,'status','rejected','replay',false,'preview',v_preview);
    end if;
    v_version:=(v_preview->>'version_nueva')::integer;
    v_schema:=(v_preview->>'schema_version')::integer;
    select array_agg(value::uuid order by ord) into v_ids
    from jsonb_array_elements_text(v_preview->'change_ids') with ordinality x(value,ord);

    insert into inventario.solog_catalog_publications(actor_id,operation_id,status,version,schema_version,change_ids,created_at,updated_at)
    values(v_actor,v_operation,'prepared',v_version,v_schema,v_ids,now(),now());

    return jsonb_build_object('contract_version',2,'status','prepared','replay',false,'preview',v_preview,'version',v_version);

  elsif p_action='finish' then
    begin v_version:=(p_payload->>'version')::integer; exception when others then raise exception 'SOLOG_INVALID_CATALOG_PUBLICATION_METADATA'; end;
    v_response:=p_payload->'response';
    if v_version is null or v_response is null or jsonb_typeof(v_response)<>'object' then raise exception 'SOLOG_INVALID_CATALOG_PUBLICATION_METADATA'; end if;
    select * into v_row from inventario.solog_catalog_publications p
    where p.actor_id=v_actor and p.operation_id=v_operation for update;
    if not found then raise exception 'SOLOG_OPERATION_NOT_STARTED'; end if;
    if v_row.status='committed' then return jsonb_build_object('contract_version',2,'status','committed','replay',true,'response',v_row.response); end if;
    if v_row.status<>'prepared' or v_row.version<>v_version then raise exception 'SOLOG_CATALOG_RESERVATION_CONFLICT'; end if;
    if not exists(select 1 from inventario.versiones_catalogo vc where vc.version=v_version) then raise exception 'SOLOG_CATALOG_COMMIT_NOT_FOUND'; end if;
    update inventario.solog_catalog_publications set status='committed',response=v_response,error_code=null,updated_at=now()
    where actor_id=v_actor and operation_id=v_operation;
    return jsonb_build_object('contract_version',2,'status','committed','replay',false,'response',v_response);

  elsif p_action='fail' then
    v_error:=coalesce(nullif(btrim(p_payload->>'error_code'),''),'CATALOG_PUBLICATION_FAILED');
    select * into v_row from inventario.solog_catalog_publications p
    where p.actor_id=v_actor and p.operation_id=v_operation for update;
    if not found then raise exception 'SOLOG_OPERATION_NOT_STARTED'; end if;
    if v_row.status='committed' then return jsonb_build_object('contract_version',2,'status','committed','replay',true,'response',v_row.response); end if;
    update inventario.solog_catalog_publications set status='failed',error_code=v_error,updated_at=now()
    where actor_id=v_actor and operation_id=v_operation;
    return jsonb_build_object('contract_version',2,'status','failed','replay',false,'error_code',v_error,'version',v_row.version);
  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_catalog_publication_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(1397705807,4702); RETURN inventario.full_compat_rpc_solog_catalog_publication_v2(p_action,p_payload); END $function$;
REVOKE ALL ON FUNCTION inventario.full_compat_rpc_solog_catalog_publication_v2(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $privileges$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='inventario' AND p.proname LIKE 'full_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;END $privileges$;
