-- Approved compact confirmations and reference-safe temporary lifecycle. No production activation.
DO $$BEGIN IF current_user<>(SELECT pg_get_userbyid(proowner)FROM pg_proc WHERE oid='public.rpc_solog_cashier_mutate_v6(text,jsonb)'::regprocedure)THEN RAISE EXCEPTION 'FULL_MIGRATION_OWNER_MISMATCH';END IF;END $$;
UPDATE inventario.full_settings SET new_ingestion=false,new_sessions=false,operational_capacity_verified=false;
-- Keep a full calendar month plus margin for the requested calibration review.
-- Applies only to new Full calibration summaries; physical evidence and legacy samples are untouched.
ALTER TABLE inventario.full_settings ADD COLUMN calibration_retention_days integer NOT NULL DEFAULT 35 CHECK(calibration_retention_days BETWEEN 32 AND 90);
ALTER TABLE inventario.metrics_calibracion_c24 ADD COLUMN groups_revision bigint;
-- Immutable group composition: content stored once, small links per global revision.
CREATE TABLE inventario.full_group_definitions(
 definition_sha256 text PRIMARY KEY CHECK(definition_sha256~'^[0-9a-f]{64}$'),document jsonb NOT NULL CHECK(jsonb_typeof(document)='object')
);
CREATE TABLE inventario.full_group_revisions(
 groups_revision bigint NOT NULL,group_id uuid NOT NULL,definition_sha256 text NOT NULL REFERENCES inventario.full_group_definitions(definition_sha256),
 PRIMARY KEY(groups_revision,group_id)
);
ALTER TABLE inventario.full_group_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.full_group_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventario.full_group_definitions,inventario.full_group_revisions FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION inventario.full_record_group_revision_v1(p_revision bigint,p_group uuid,p_document jsonb)RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE hash text;original jsonb;BEGIN
 IF p_revision IS NULL OR p_revision<1 OR p_group IS NULL OR p_document->>'group_id' IS DISTINCT FROM p_group::text THEN RAISE EXCEPTION 'GROUP_STRUCTURE_CHANGED';END IF;
 hash:=encode(extensions.digest(p_document::text,'sha256'),'hex');
 INSERT INTO inventario.full_group_definitions VALUES(hash,p_document)ON CONFLICT DO NOTHING;
 SELECT d.document INTO original FROM inventario.full_group_definitions d WHERE d.definition_sha256=hash;
 IF original IS DISTINCT FROM p_document THEN RAISE EXCEPTION 'GROUP_STRUCTURE_CHANGED';END IF;
 INSERT INTO inventario.full_group_revisions VALUES(p_revision,p_group,hash)ON CONFLICT DO NOTHING;
 SELECT d.document INTO original FROM inventario.full_group_revisions v JOIN inventario.full_group_definitions d USING(definition_sha256)WHERE v.groups_revision=p_revision AND v.group_id=p_group;
 IF original IS DISTINCT FROM p_document THEN RAISE EXCEPTION 'GROUP_STRUCTURE_CHANGED';END IF;
END $$;
CREATE FUNCTION inventario.full_freeze_group_revision_v1()RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN PERFORM inventario.full_record_group_revision_v1(NEW.groups_revision,NEW.group_id,(to_jsonb(NEW)-'snapshot_id'-'stock_theoretical'-'groups_revision')||jsonb_build_object('active',true));RETURN NEW;END $$;
CREATE TRIGGER full_freeze_group_revision AFTER INSERT ON inventario.full_group_history FOR EACH ROW EXECUTE FUNCTION inventario.full_freeze_group_revision_v1();
DO $$DECLARE h inventario.full_group_history%rowtype;BEGIN FOR h IN SELECT *FROM inventario.full_group_history ORDER BY snapshot_id,group_id LOOP
 PERFORM inventario.full_record_group_revision_v1(h.groups_revision,h.group_id,(to_jsonb(h)-'snapshot_id'-'stock_theoretical'-'groups_revision')||jsonb_build_object('active',true));END LOOP;END $$;
CREATE FUNCTION inventario.full_capture_group_revision_v1(p_revision bigint)RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item record;BEGIN
 FOR item IN
 SELECT g.id,jsonb_build_object('group_id',g.id,'group_name',g.nombre,'category_id',g.categoria_id,'category_name',cat.nombre,'price',g.precio,'units_per_package',g.unidades_por_paquete,'package_price',g.precio_paquete,'active',g.activo,
 'member_codes',coalesce(array_agg(c.c_interno ORDER BY c.c_interno)FILTER(WHERE c.c_interno IS NOT NULL),'{}'),
 'members',coalesce(jsonb_agg(jsonb_build_object('c_interno',c.c_interno,'product',c.producto,'barcode',c.c_barras,'price',c.precio)ORDER BY c.c_interno)FILTER(WHERE c.c_interno IS NOT NULL),'[]'))doc
 FROM inventario.grupos_conteo g JOIN inventario.categorias cat ON cat.id=g.categoria_id LEFT JOIN inventario.catalogo c ON c.grupo_conteo_id=g.id AND c.estado<>'Excluido' GROUP BY g.id,cat.nombre
 LOOP PERFORM inventario.full_record_group_revision_v1(p_revision,item.id,item.doc);END LOOP;
END $$;
REVOKE ALL ON FUNCTION inventario.full_record_group_revision_v1(bigint,uuid,jsonb),inventario.full_freeze_group_revision_v1(),inventario.full_capture_group_revision_v1(bigint)FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE inventario.full_count_evidence(
 observation_id uuid PRIMARY KEY REFERENCES inventario.full_observations(observation_id),
 detail_id uuid NOT NULL REFERENCES inventario.conteo_detalle(id),
 session_id uuid NOT NULL REFERENCES inventario.conteos(id),
 group_id uuid NOT NULL,reference_snapshot_id uuid NOT NULL REFERENCES inventario.snapshots(id),
 schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object'),
 document_sha256 text NOT NULL CHECK(document_sha256~'^[0-9a-f]{64}$')
);
CREATE INDEX full_count_evidence_detail ON inventario.full_count_evidence(detail_id);
CREATE INDEX full_count_evidence_session ON inventario.full_count_evidence(session_id);
ALTER TABLE inventario.full_count_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventario.full_count_evidence FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION inventario.full_evidence_document_v1(p_observation uuid)RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('schema_version',1,'observation_id',o.observation_id,'kind',o.kind,'detail_id',o.detail_id,'session_id',o.session_id,'group_id',r.grupo_conteo_id,
 'reference_snapshot_id',r.snapshot_referencia_id,'reference_captured_at',inventario.full_utc_v1(s.capturado_at),'catalog_version',c.version_catalogo,'groups_revision',c.groups_revision,
 'group_name',r.grupo_nombre,'category_id',r.categoria_id,'category_name',r.categoria_nombre,'group_type',r.tipo_grupo,
 'price',r.precio,'units_per_package',r.unidades_por_paquete,'package_price',r.precio_paquete,'member_codes',to_jsonb(r.codigos_internos),'members',r.productos,'stock_theoretical',r.stock_teorico,'confirmation',o.result)
 FROM inventario.full_observations o JOIN inventario.conteo_detalle d ON d.id=o.detail_id JOIN inventario.conteos c ON c.id=o.session_id
 JOIN inventario.solog_session_runtime_groups r ON r.conteo_id=o.session_id AND r.grupo_conteo_id=d.grupo_conteo_id
 JOIN inventario.snapshots s ON s.id=r.snapshot_referencia_id WHERE o.observation_id=p_observation
$$;
CREATE FUNCTION inventario.full_freeze_count_evidence_v1()RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE doc jsonb;BEGIN doc:=inventario.full_evidence_document_v1(NEW.observation_id);IF doc IS NULL THEN RAISE EXCEPTION 'FULL_EVIDENCE_REQUIRED';END IF;
 INSERT INTO inventario.full_count_evidence(observation_id,detail_id,session_id,group_id,reference_snapshot_id,document,document_sha256)
 VALUES(NEW.observation_id,NEW.detail_id,NEW.session_id,(doc->>'group_id')::uuid,(doc->>'reference_snapshot_id')::uuid,doc,encode(extensions.digest(doc::text,'sha256'),'hex'));RETURN NEW;END $$;
CREATE TRIGGER full_freeze_count_evidence AFTER INSERT ON inventario.full_observations FOR EACH ROW EXECUTE FUNCTION inventario.full_freeze_count_evidence_v1();
-- Backfill only from original frozen runtime. Missing original evidence blocks cleanup; never substitute current catalog.
INSERT INTO inventario.full_count_evidence(observation_id,detail_id,session_id,group_id,reference_snapshot_id,document,document_sha256)
SELECT o.observation_id,o.detail_id,o.session_id,(x.doc->>'group_id')::uuid,(x.doc->>'reference_snapshot_id')::uuid,x.doc,encode(extensions.digest(x.doc::text,'sha256'),'hex')
FROM inventario.full_observations o CROSS JOIN LATERAL(SELECT inventario.full_evidence_document_v1(o.observation_id)doc)x WHERE x.doc IS NOT NULL;

CREATE FUNCTION inventario.full_compact_replay_data_v1(p_data jsonb,p_session uuid)RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb;members jsonb;affected jsonb:='[]';BEGIN
 IF p_data->>'action' IN('start','finish')THEN RETURN jsonb_set(p_data,'{affected_groups}','[]');END IF;
 FOR item IN SELECT g FROM jsonb_array_elements(p_data->'affected_groups')g WHERE g->>'group_id' IN(
  SELECT d.grupo_conteo_id::text FROM inventario.full_observations o JOIN inventario.conteo_detalle d ON d.id=o.detail_id
  WHERE o.session_id=p_session AND o.observation_id IN(SELECT(x->>'client_observation_id')::uuid FROM jsonb_array_elements(p_data->'observation_results')x))
 LOOP
  members:=item->'members';
  IF members IS NULL THEN SELECT e.document->'members'INTO members FROM inventario.full_count_evidence e WHERE e.session_id=p_session AND e.group_id=(item->>'group_id')::uuid AND e.reference_snapshot_id=(item->>'reference_snapshot_id')::uuid ORDER BY e.observation_id LIMIT 1;END IF;
  IF members IS NULL THEN RAISE EXCEPTION 'FULL_REPLAY_EVIDENCE_MISSING';END IF;
  affected:=affected||jsonb_build_array(jsonb_set(item,'{members}',members));
 END LOOP;
 IF jsonb_array_length(affected)=0 AND jsonb_array_length(p_data->'affected_groups')>0 THEN RAISE EXCEPTION 'FULL_REPLAY_EVIDENCE_MISSING';END IF;
 RETURN jsonb_set(p_data,'{affected_groups}',affected);
END $$;
REVOKE ALL ON FUNCTION inventario.full_compact_replay_data_v1(jsonb,uuid)FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION inventario.full_runtime_cleanup_candidates_v1(p_asof timestamptz DEFAULT clock_timestamp())RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT w.session_id FROM inventario.full_session_windows w JOIN inventario.conteos c ON c.id=w.session_id
 WHERE w.pending_delivery_until<=p_asof AND isfinite(p_asof)
 AND EXISTS(SELECT 1 FROM inventario.solog_session_runtime_groups r WHERE r.conteo_id=w.session_id AND r.full_policy)
 AND NOT EXISTS(SELECT 1 FROM inventario.full_observations o LEFT JOIN inventario.full_count_evidence e ON e.observation_id=o.observation_id WHERE o.session_id=w.session_id AND(e.observation_id IS NULL OR e.document_sha256<>encode(extensions.digest(e.document::text,'sha256'),'hex')))
 AND NOT EXISTS(SELECT 1 FROM inventario.conteo_detalle d WHERE d.conteo_id=w.session_id AND NOT EXISTS(SELECT 1 FROM inventario.full_count_evidence e JOIN inventario.full_observations o ON o.observation_id=e.observation_id WHERE e.detail_id=d.id AND e.session_id=w.session_id AND o.kind='save_batch'))
$$;
CREATE FUNCTION inventario.full_group_cleanup_candidates_v1(p_asof timestamptz DEFAULT clock_timestamp())RETURNS TABLE(snapshot_id uuid,group_id uuid)LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT h.snapshot_id,h.group_id FROM inventario.full_group_history h JOIN inventario.snapshots s ON s.id=h.snapshot_id
 WHERE isfinite(p_asof)AND s.capturado_at<p_asof-interval '12 hours'
 AND EXISTS(SELECT 1 FROM inventario.full_group_revisions v JOIN inventario.full_group_definitions d USING(definition_sha256)WHERE v.groups_revision=h.groups_revision AND v.group_id=h.group_id AND d.document=(to_jsonb(h)-'snapshot_id'-'stock_theoretical'-'groups_revision')||jsonb_build_object('active',true)AND d.definition_sha256=encode(extensions.digest(d.document::text,'sha256'),'hex'))
 AND s.id IS DISTINCT FROM(SELECT latest.id FROM inventario.snapshots latest WHERE latest.sede_id=s.sede_id AND latest.confirmado_at IS NOT NULL ORDER BY latest.capturado_at DESC,latest.id DESC LIMIT 1)
 AND NOT EXISTS(SELECT 1 FROM inventario.solog_session_runtime_groups r WHERE r.snapshot_referencia_id=h.snapshot_id AND r.grupo_conteo_id=h.group_id)
 -- Conservative protection for existing physical/recount readers; evidence is never removed here.
 AND NOT EXISTS(SELECT 1 FROM inventario.conteo_detalle d WHERE d.grupo_conteo_id=h.group_id AND h.snapshot_id IN(d.snapshot_referencia_id,d.primer_snapshot_posterior_id,d.snapshot_posterior_id,d.snapshot_reconteo_id))
$$;
CREATE FUNCTION inventario.full_calibration_cleanup_candidates_v1(p_asof timestamptz DEFAULT clock_timestamp())RETURNS TABLE(muestreo_at timestamptz,sede_id uuid,c_interno integer)LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT c.muestreo_at,c.sede_id,c.c_interno FROM inventario.metrics_calibracion_c24 c
 WHERE isfinite(p_asof)AND c.algorithm_version='full-20-v1' AND c.muestreo_at<p_asof-make_interval(days=>(SELECT calibration_retention_days FROM inventario.full_settings WHERE id))
$$;
CREATE FUNCTION inventario.full_temporary_maintenance_v1(p_apply boolean DEFAULT false,p_limit integer DEFAULT 5000)RETURNS jsonb LANGUAGE plpgsql SET search_path='' SET lock_timeout='5s' SET statement_timeout='25s' AS $$
DECLARE now_at timestamptz:=clock_timestamp();runtime_count integer:=0;group_count integer:=0;calibration_count integer:=0;ids uuid[];BEGIN
 IF p_apply IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>10000 THEN RAISE EXCEPTION 'INVALID_MAINTENANCE_LIMIT';END IF;
 -- Exclusive counterpart of both ingestion and cashier/config shared locks; evaluate candidates after obtaining it.
 PERFORM pg_advisory_xact_lock(1397705807,4702);now_at:=clock_timestamp();
 IF NOT p_apply THEN RETURN jsonb_build_object('dry_run',true,'runtime_sessions',(SELECT count(*)FROM inventario.full_runtime_cleanup_candidates_v1(now_at)),'group_rows',(SELECT count(*)FROM inventario.full_group_cleanup_candidates_v1(now_at)),'calibration_rows',(SELECT count(*)FROM inventario.full_calibration_cleanup_candidates_v1(now_at)));END IF;
 SELECT array_agg(x)INTO ids FROM(SELECT x FROM inventario.full_runtime_cleanup_candidates_v1(now_at)x ORDER BY x LIMIT least(p_limit,10))c;
 IF ids IS NOT NULL THEN
  UPDATE inventario.conteos c SET estado='expirado',finalizado_at=w.pending_delivery_until,updated_at=now_at FROM inventario.full_session_windows w WHERE c.id=w.session_id AND c.id=ANY(ids)AND c.estado IN('activo','recovery');
  DELETE FROM inventario.full_recount_reservations WHERE session_id=ANY(ids);
  DELETE FROM inventario.solog_session_runtime_groups WHERE conteo_id=ANY(ids)AND full_policy;GET DIAGNOSTICS runtime_count=ROW_COUNT;
 END IF;
 DELETE FROM inventario.full_group_history h USING(SELECT *FROM inventario.full_group_cleanup_candidates_v1(now_at)ORDER BY snapshot_id,group_id LIMIT p_limit)c WHERE h.snapshot_id=c.snapshot_id AND h.group_id=c.group_id;GET DIAGNOSTICS group_count=ROW_COUNT;
 DELETE FROM inventario.metrics_calibracion_c24 t USING(SELECT *FROM inventario.full_calibration_cleanup_candidates_v1(now_at)ORDER BY muestreo_at,sede_id,c_interno LIMIT p_limit)c WHERE t.muestreo_at=c.muestreo_at AND t.sede_id=c.sede_id AND t.c_interno=c.c_interno;GET DIAGNOSTICS calibration_count=ROW_COUNT;
 RETURN jsonb_build_object('dry_run',false,'runtime_rows_deleted',runtime_count,'group_rows_deleted',group_count,'calibration_rows_deleted',calibration_count,'physical_observations_deleted',0,'idempotency_records_deleted',0);
END $$;
REVOKE ALL ON FUNCTION inventario.full_evidence_document_v1(uuid),inventario.full_freeze_count_evidence_v1(),inventario.full_runtime_cleanup_candidates_v1(timestamptz),inventario.full_group_cleanup_candidates_v1(timestamptz),inventario.full_calibration_cleanup_candidates_v1(timestamptz),inventario.full_temporary_maintenance_v1(boolean,integer)FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION inventario.full_calibration_sample_v1(p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_slot timestamptz;
  v_insertados integer;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(1397705807,4702);
 IF EXISTS(SELECT 1 FROM inventario.metrics_movimiento_sku WHERE algorithm_version='full-20-v1')THEN PERFORM inventario.full_capture_group_revision_v1((SELECT groups_revision FROM inventario.full_settings WHERE id));END IF;
  IF p_at IS NULL OR p_at>pg_catalog.clock_timestamp()+interval '5 minutes' THEN
    RAISE EXCEPTION 'SOLOG_CALIBRATION_INVALID_TIMESTAMP';
  END IF;
  -- Slot fijo 6h a HH:05 Lima. Un mismo slot se registra una vez.
  v_slot:=pg_catalog.date_bin('6 hours',p_at,
    '2000-01-01 05:05:00+00'::timestamptz);
  INSERT INTO inventario.metrics_calibracion_c24(
    muestreo_at,sede_id,c_interno,grupo_conteo_id,c24_sku,
    intervalos_validos,calidad,ultimo_capturado_at,algorithm_version,groups_revision
  )
  SELECT v_slot,m.sede_id,m.c_interno,c.grupo_conteo_id,
         e.c24_sku,e.intervalos_validos,
         CASE WHEN m.estado_calidad='invalidado' THEN 'invalidado'
              ELSE e.calidad END,
         m.ultimo_capturado_at,m.algorithm_version,CASE WHEN m.algorithm_version='full-20-v1' THEN(SELECT groups_revision FROM inventario.full_settings WHERE id)END
  FROM inventario.metrics_movimiento_sku m
  JOIN inventario.catalogo c ON c.c_interno=m.c_interno
    AND c.estado<>'Excluido'
  CROSS JOIN LATERAL inventario.metrics_movimiento_c24_efectivo_v1(
    m.sede_id,m.c_interno,p_at
  ) e
  ON CONFLICT(muestreo_at,sede_id,c_interno) DO NOTHING;
  GET DIAGNOSTICS v_insertados=ROW_COUNT;
  RETURN v_insertados;
END;
$function$;

CREATE FUNCTION inventario.full_runtime_json_v2(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('group_id',r.grupo_conteo_id,'group_name',r.grupo_nombre,'category_id',r.categoria_id,'category_name',r.categoria_nombre,'reference_snapshot_id',r.snapshot_referencia_id,'groups_revision',c.groups_revision,'stock_theoretical',r.stock_teorico,'member_codes',r.codigos_internos,'members',r.productos,'price',r.precio,'units_per_package',r.unidades_por_paquete,'package_price',r.precio_paquete,'action',r.accion,'priority_class',r.priority_class,'recount_detail_id',r.detalle_reconteo_id) ORDER BY r.grupo_conteo_id),'[]') FROM inventario.solog_session_runtime_groups r JOIN inventario.conteos c ON c.id=r.conteo_id WHERE r.conteo_id=p_id
$$;
CREATE FUNCTION inventario.full_cashier_state_v2(p_uid uuid,p_site uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s inventario.snapshots%rowtype;rev bigint;sid uuid;stock jsonb;reason text;cfg inventario.full_settings%rowtype;shift jsonb;BEGIN
 SELECT * INTO cfg FROM inventario.full_settings WHERE id;
 SELECT x.* INTO s FROM inventario.snapshots x WHERE x.sede_id=p_site AND x.confirmado_at IS NOT NULL ORDER BY x.capturado_at DESC,x.id DESC LIMIT 1;
 SELECT max(groups_revision) INTO rev FROM inventario.full_group_history WHERE snapshot_id=s.id;
 IF s.id IS NOT NULL THEN stock:=jsonb_build_object('snapshot_id',s.id,'snapshot_captured_at',inventario.full_utc_v1(s.capturado_at),'snapshot_confirmed_at',inventario.full_utc_v1(s.confirmado_at),'stock_expires_at',inventario.full_utc_v1(s.capturado_at+interval '2 hours'),'is_fresh',p_now>=s.capturado_at AND p_now<s.capturado_at+interval '2 hours','is_fallback',p_now>=s.capturado_at+interval '1 hour' AND p_now<s.capturado_at+interval '2 hours','catalog_version',s.version_catalogo,'groups_revision',coalesce(rev,cfg.groups_revision));END IF;
 SELECT c.id INTO sid FROM inventario.conteos c JOIN inventario.full_session_windows w ON w.session_id=c.id WHERE c.sede_id=p_site AND c.usuario_id=p_uid AND c.estado='activo' ORDER BY c.iniciado_at DESC LIMIT 1;
 reason:=CASE WHEN EXISTS(SELECT 1 FROM inventario.conteos WHERE sede_id=p_site AND estado='activo') THEN 'SESSION_ALREADY_ACTIVE' WHEN NOT cfg.new_sessions THEN 'NEW_SESSIONS_PAUSED' WHEN s.id IS NULL THEN 'SNAPSHOT_REQUIRED' WHEN p_now<s.capturado_at OR p_now>=s.capturado_at+interval '2 hours' THEN 'STOCK_EXPIRED' WHEN EXISTS(SELECT 1 FROM inventario.full_group_history h JOIN inventario.categorias k ON k.id=h.category_id JOIN inventario.estado_stock_grupo e ON e.grupo_conteo_id=h.group_id AND e.sede_id=p_site AND e.activo WHERE h.snapshot_id=s.id AND NOT k.activo) OR rev IS DISTINCT FROM cfg.groups_revision OR s.version_catalogo IS DISTINCT FROM(SELECT max(version)FROM inventario.versiones_catalogo WHERE schema_version=2 AND storage_path IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM inventario.full_group_history WHERE snapshot_id=s.id) THEN 'STRUCTURE_SNAPSHOT_REQUIRED' ELSE NULL END;
 shift:=inventario.full_window_v1(p_now,p_now,p_now)->'shift';
 RETURN jsonb_build_object('timezone','America/Lima','stock',stock,'session',inventario.full_session_json_v1(sid,p_now),'recovery_sessions',coalesce((SELECT jsonb_agg(inventario.full_session_json_v1(c.id,p_now) ORDER BY c.iniciado_at)FROM inventario.conteos c JOIN inventario.full_session_windows w ON w.session_id=c.id WHERE c.usuario_id=p_uid AND c.sede_id=p_site AND c.estado='recovery'),'[]'),'shift',shift,'capabilities',jsonb_build_object('can_start_session',reason IS NULL,'can_capture_in_current_session',sid IS NOT NULL,'block_reason',reason),'confirmed_observation_ids',coalesce((SELECT jsonb_agg(o.observation_id ORDER BY o.observation_id)FROM inventario.full_observations o WHERE o.session_id=sid AND o.user_id=p_uid),'[]'::jsonb),'recovery_manifests',coalesce((SELECT jsonb_agg(jsonb_build_object('session_id',old_session.id,'observation_ids',coalesce((SELECT jsonb_agg(o.observation_id ORDER BY o.observation_id)FROM inventario.full_observations o WHERE o.session_id=old_session.id AND o.user_id=p_uid),'[]'::jsonb))ORDER BY old_session.id)FROM inventario.conteos old_session JOIN inventario.full_session_windows old_window ON old_window.session_id=old_session.id WHERE old_session.usuario_id=p_uid AND old_session.sede_id=p_site AND old_session.estado='recovery'),'[]'::jsonb),'groups',inventario.full_runtime_json_v2(sid));
END $$;

CREATE FUNCTION inventario.full_cashier_result_v2(p_code text,p_data jsonb,p_now timestamptz)RETURNS jsonb LANGUAGE sql SET search_path='' AS $$SELECT jsonb_set(inventario.full_result_v1(p_code,p_data,p_now),'{contract_version}','2')$$;
CREATE FUNCTION inventario.full_cashier_error_v2(p_code text,p_now timestamptz)RETURNS jsonb LANGUAGE sql SET search_path='' AS $$SELECT jsonb_set(inventario.full_error_v1(p_code,p_now),'{contract_version}','2')$$;
CREATE FUNCTION inventario.full_cashier_dispatch_v2(p_uid uuid,p_action text,p_payload jsonb,p_now timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE u public.usuarios%rowtype;device uuid;op uuid;sid uuid;fp text;saved inventario.full_cashier_operations%rowtype;conf inventario.full_delivery_conflicts%rowtype;c inventario.conteos%rowtype;s inventario.snapshots%rowtype;cfg inventario.full_settings%rowtype;win jsonb;ctx record;r inventario.solog_session_runtime_groups%rowtype;d inventario.conteo_detalle%rowtype;obs inventario.full_observations%rowtype;item jsonb;items jsonb;ofp text;oid uuid;did uuid;gid uuid;observed timestamptz;physical integer;delta bigint;d0 bigint;dr bigint;state text;reason text;note text;data jsonb;code text;res jsonb;outs jsonb:='[]';entry jsonb;cl text;schema_key text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(1397705807,4702);
 SELECT * INTO u FROM public.usuarios WHERE id=p_uid FOR SHARE;
 IF NOT FOUND OR NOT coalesce(u.activo,false) OR u.rol::text<>'cajero' OR u.sede_id IS NULL THEN RETURN inventario.full_cashier_error_v2('USER_UNAUTHORIZED',coalesce(p_now,clock_timestamp()));END IF;
 schema_key:=CASE WHEN p_action='bootstrap' THEN 'cashier_bootstrap' ELSE 'cashier_mutate' END;
 IF NOT extensions.json_matches_schema((SELECT document::json FROM inventario.full_contracts WHERE kind=schema_key),CASE WHEN p_action='bootstrap' THEN jsonb_build_object('p_payload',p_payload) ELSE jsonb_build_object('p_action',p_action,'p_payload',p_payload) END::json) THEN RETURN inventario.full_cashier_error_v2('INVALID_STRUCTURE',coalesce(p_now,clock_timestamp()));END IF;
 IF octet_length(p_payload::text)>4194304 THEN RETURN inventario.full_cashier_error_v2('PAYLOAD_TOO_LARGE',coalesce(p_now,clock_timestamp()));END IF;
 op:=(p_payload->>'operation_id')::uuid;
 IF op IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('full-cashier-operation:'||p_uid::text||op::text,0));END IF;
 PERFORM 1 FROM public.sedes WHERE id=u.sede_id AND activo FOR UPDATE;
 IF NOT FOUND THEN RETURN inventario.full_cashier_error_v2('USER_UNAUTHORIZED',coalesce(p_now,clock_timestamp()));END IF;
 SELECT id INTO device FROM inventario.dispositivos_solog WHERE sede_id=u.sede_id AND estado='autorizado' AND device_hash=encode(extensions.digest(p_payload->>'device_token','sha256'),'hex') FOR SHARE;
 IF device IS NULL THEN RETURN inventario.full_cashier_error_v2('DEVICE_UNAUTHORIZED',coalesce(p_now,clock_timestamp()));END IF;
 p_now:=coalesce(p_now,clock_timestamp());IF NOT isfinite(p_now) THEN RAISE EXCEPTION 'INVALID_OBSERVATION_TIME';END IF;
 -- Versioned sessions only; old sessions retain their original policy.
 UPDATE inventario.conteos x SET estado='recovery',updated_at=p_now FROM inventario.full_session_windows w WHERE w.session_id=x.id AND x.sede_id=u.sede_id AND x.estado='activo' AND p_now>=x.expira_at AND p_now<w.pending_delivery_until;
 UPDATE inventario.conteos x SET estado='expirado',finalizado_at=w.pending_delivery_until,updated_at=p_now FROM inventario.full_session_windows w WHERE w.session_id=x.id AND x.sede_id=u.sede_id AND x.estado IN('activo','recovery') AND p_now>=w.pending_delivery_until;
 IF p_action='bootstrap' THEN RETURN inventario.full_cashier_result_v2('CASHIER_STATE',inventario.full_cashier_state_v2(p_uid,u.sede_id,p_now),p_now);END IF;
 -- Fingerprints exclude the device secret, but authorization precedes every replay.
 items:=p_payload->'items';IF items IS NOT NULL THEN SELECT jsonb_agg(jsonb_set(x,'{contado_at}',to_jsonb(inventario.full_utc_v1((x->>'contado_at')::timestamptz))) ORDER BY ord) INTO items FROM jsonb_array_elements(items) WITH ORDINALITY a(x,ord);p_payload:=jsonb_set(p_payload,'{items}',items);END IF;
 fp:=encode(extensions.digest(jsonb_build_object('action',p_action,'payload',p_payload-'device_token'-'operation_id')::text,'sha256'),'hex');
 SELECT * INTO saved FROM inventario.full_cashier_operations WHERE user_id=p_uid AND operation_id=op;
 IF FOUND THEN
  IF saved.fingerprint<>fp THEN RETURN inventario.full_cashier_error_v2('IDEMPOTENCY_CONFLICT',p_now);END IF;
  IF NOT EXISTS(SELECT 1 FROM inventario.conteos WHERE id=saved.session_id AND usuario_id=p_uid AND sede_id=u.sede_id) THEN RETURN inventario.full_cashier_error_v2('SESSION_NOT_FOUND',p_now);END IF;
  data:=inventario.full_compact_replay_data_v1(saved.result->'data',saved.session_id);data:=jsonb_set(data,'{replay}','true');data:=jsonb_set(data,'{session}',inventario.full_session_json_v1(saved.session_id,p_now));
  RETURN inventario.full_cashier_result_v2(saved.result->>'code',data,p_now);
 END IF;
 SELECT * INTO conf FROM inventario.full_delivery_conflicts WHERE user_id=p_uid AND operation_id=op;
 IF FOUND THEN RETURN inventario.full_cashier_error_v2(CASE WHEN conf.fingerprint=fp THEN conf.code ELSE 'IDEMPOTENCY_CONFLICT' END,p_now);END IF;
 sid:=(p_payload->>'session_id')::uuid;
 BEGIN
 IF p_action='start' THEN
  data:=inventario.full_cashier_state_v2(p_uid,u.sede_id,p_now);code:=data#>>'{capabilities,block_reason}';IF code IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=code;END IF;
  SELECT * INTO s FROM inventario.snapshots WHERE id=(data#>>'{stock,snapshot_id}')::uuid;
  SELECT * INTO cfg FROM inventario.full_settings WHERE id;
  win:=inventario.full_window_v1(s.capturado_at,p_now,p_now);SELECT * INTO ctx FROM inventario.full_temporal_context_v1(p_now);
  INSERT INTO inventario.conteos(sede_id,usuario_id,estado,iniciado_at,expira_at,snapshot_referencia_id,version_catalogo,groups_revision,periodo_desde,periodo_hasta,ronda,ronda_desde,ronda_hasta,turno,turno_desde,turno_hasta,created_at,updated_at)
  VALUES(u.sede_id,p_uid,'activo',p_now,(win->>'session_expires_at')::timestamptz,s.id,s.version_catalogo,cfg.groups_revision,ctx.periodo_desde,ctx.periodo_hasta,ctx.ronda,ctx.ronda_desde,ctx.ronda_hasta,ctx.turno,ctx.turno_desde,ctx.turno_hasta,p_now,p_now)RETURNING * INTO c;sid:=c.id;
  INSERT INTO inventario.full_session_windows VALUES(sid,cfg.policy_version,s.id,s.capturado_at,(win->>'capture_interval_number')::integer,(win->>'capture_interval_starts_at')::timestamptz,s.capturado_at+make_interval(hours=>(win->>'capture_interval_number')::integer),c.expira_at,c.expira_at+interval '2 hours');
  INSERT INTO inventario.solog_session_runtime_groups(conteo_id,grupo_conteo_id,snapshot_referencia_id,stock_teorico,grupo_nombre,categoria_id,categoria_nombre,tipo_grupo,precio,unidades_por_paquete,precio_paquete,codigos_internos,productos,accion,priority_class,detalle_reconteo_id,created_at,updated_at,full_policy)
  SELECT sid,h.group_id,s.id,h.stock_theoretical,h.group_name,h.category_id,h.category_name,CASE WHEN cardinality(h.member_codes)=1 THEN 'Individual' ELSE 'Agrupado' END,h.price,h.units_per_package,h.package_price,h.member_codes,h.members,
  CASE WHEN a.action='recount' AND (pending_detail.codigos_internos IS DISTINCT FROM h.member_codes OR EXISTS(SELECT 1 FROM inventario.full_recount_reservations WHERE detail_id=pending_detail.id) OR (SELECT capturado_at FROM inventario.snapshots WHERE id=s.id)<=pending_detail.contado_at) THEN 'none' ELSE a.action END,
  CASE WHEN a.action='recount' AND (pending_detail.codigos_internos IS DISTINCT FROM h.member_codes OR EXISTS(SELECT 1 FROM inventario.full_recount_reservations WHERE detail_id=pending_detail.id) OR s.capturado_at<=pending_detail.contado_at) THEN 'none' ELSE inventario.solog_priority_classify_v4(a.action,a.coverage_complete) END,
  CASE WHEN a.action='recount' THEN a.detalle_reconteo_id ELSE NULL END,p_now,p_now,true
  FROM inventario.full_group_history h JOIN inventario.full_group_actions_v1(u.sede_id,p_now)a ON a.grupo_conteo_id=h.group_id LEFT JOIN inventario.conteo_detalle pending_detail ON pending_detail.id=a.detalle_reconteo_id WHERE h.snapshot_id=s.id;
  IF NOT EXISTS(SELECT 1 FROM inventario.solog_session_runtime_groups WHERE conteo_id=sid) THEN RAISE EXCEPTION 'STRUCTURE_SNAPSHOT_REQUIRED';END IF;
  INSERT INTO inventario.full_recount_reservations SELECT detalle_reconteo_id,sid FROM inventario.solog_session_runtime_groups WHERE conteo_id=sid AND accion='recount';
  code:='SESSION_STARTED';
 ELSE
  SELECT x.* INTO c FROM inventario.conteos x JOIN inventario.full_session_windows w ON w.session_id=x.id WHERE x.id=sid AND x.usuario_id=p_uid AND x.sede_id=u.sede_id FOR UPDATE OF x;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND';END IF;
  IF c.groups_revision<>(p_payload->>'expected_groups_revision')::bigint THEN RAISE EXCEPTION 'GROUP_STRUCTURE_CHANGED';END IF;
  IF p_action='finish' THEN
   IF (SELECT count(*) FROM jsonb_array_elements_text(p_payload#>'{delivery_manifest,observation_ids}'))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p_payload#>'{delivery_manifest,observation_ids}')x)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload#>'{delivery_manifest,observation_ids}')x WHERE NOT EXISTS(SELECT 1 FROM inventario.full_observations WHERE observation_id=x::uuid AND session_id=sid AND user_id=p_uid))
   OR EXISTS(SELECT 1 FROM inventario.full_observations WHERE session_id=sid AND user_id=p_uid AND NOT(p_payload#>'{delivery_manifest,observation_ids}' ? observation_id::text)) THEN RAISE EXCEPTION 'MANIFEST_NOT_CONFIRMED';END IF;
   UPDATE inventario.conteos SET estado='finalizado',finalizado_at=p_now,updated_at=p_now WHERE id=sid AND estado IN('activo','recovery');code:='SESSION_FINISHED';
  ELSE
   FOR item IN SELECT x FROM jsonb_array_elements(items)x LOOP
    oid:=(item->>'client_observation_id')::uuid;
    ofp:=encode(extensions.digest(jsonb_build_object('session',sid,'kind',p_action,'item',item)::text,'sha256'),'hex');
    SELECT * INTO obs FROM inventario.full_observations WHERE observation_id=oid;
    IF FOUND THEN
     IF obs.user_id<>p_uid OR obs.session_id<>sid OR obs.fingerprint<>ofp THEN RAISE EXCEPTION 'OBSERVATION_ALREADY_RECORDED';END IF;
     outs:=outs||jsonb_build_array(jsonb_set(obs.result,'{replay}','true'));CONTINUE;
    END IF;
    IF EXISTS(SELECT 1 FROM inventario.conteo_detalle WHERE client_observation_id=oid) THEN RAISE EXCEPTION 'OBSERVATION_ALREADY_RECORDED';END IF;
    IF NOT coalesce((inventario.full_session_json_v1(sid,p_now)->>'pending_delivery_allowed')::boolean,false) THEN RAISE EXCEPTION 'SESSION_DELIVERY_CLOSED';END IF;
    observed:=(item->>'contado_at')::timestamptz;
    IF NOT isfinite(observed) OR observed<c.iniciado_at OR observed>p_now+interval '30 seconds' THEN RAISE EXCEPTION 'INVALID_OBSERVATION_TIME';END IF;
    IF observed>=c.expira_at THEN RAISE EXCEPTION 'SESSION_CAPTURE_CLOSED';END IF;
    physical:=(item->>'stock_fisico')::integer;reason:=nullif(btrim(item->>'motivo_diferencia'),'');
    note:=nullif(btrim(item->>CASE WHEN p_action='save_batch' THEN 'observacion_diferencia' ELSE 'observacion_reconteo' END),'');
    IF p_action='save_batch' THEN gid:=(item->>'grupo_id')::uuid;
    ELSE
     SELECT x.* INTO d FROM inventario.conteo_detalle x JOIN inventario.conteos origin ON origin.id=x.conteo_id WHERE x.id=(item->>'detalle_id')::uuid AND origin.sede_id=u.sede_id FOR UPDATE OF x;
     IF NOT FOUND THEN RAISE EXCEPTION 'RECOUNT_NOT_READY';END IF;
     IF d.stock_reconteo IS NOT NULL OR d.estado_diferencia<>'Recontar' THEN RAISE EXCEPTION 'RECOUNT_ALREADY_RESOLVED';END IF;
     IF d.primer_snapshot_posterior_id IS NULL OR d.conteo_id=sid OR NOT EXISTS(SELECT 1 FROM inventario.conteos WHERE id=d.conteo_id AND iniciado_at<c.iniciado_at) THEN RAISE EXCEPTION 'RECOUNT_NOT_READY';END IF;gid:=d.grupo_conteo_id;
    END IF;
    SELECT * INTO r FROM inventario.solog_session_runtime_groups WHERE conteo_id=sid AND grupo_conteo_id=gid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRIORITY_CONFLICT';END IF;
    cl:=inventario.solog_runtime_priority_class_v4(sid);
    IF r.priority_class='none' OR r.priority_class IS DISTINCT FROM cl OR (p_action='save_batch' AND r.accion NOT IN('coverage','daily')) OR (p_action='recount_save_batch' AND (r.accion<>'recount' OR r.detalle_reconteo_id IS DISTINCT FROM d.id OR r.codigos_internos IS DISTINCT FROM d.codigos_internos)) THEN RAISE EXCEPTION 'PRIORITY_CONFLICT';END IF;
    delta:=physical::bigint-r.stock_teorico::bigint;
    IF delta NOT BETWEEN -2147483648 AND 2147483647 THEN RAISE EXCEPTION 'STOCK_UNRESOLVABLE';END IF;
    IF p_action='save_batch' THEN
     IF (reason IS NULL) IS DISTINCT FROM(note IS NULL) OR note IS NOT NULL AND length(note)<3 OR abs(delta)>=12 AND(reason IS NULL OR note IS NULL) THEN RAISE EXCEPTION 'INVALID_STRUCTURE';END IF;
     state:=CASE WHEN delta=0 THEN 'Coincide' ELSE 'Recontar' END;
     INSERT INTO inventario.conteo_detalle(conteo_id,grupo_conteo_id,snapshot_referencia_id,stock_teorico,stock_fisico,diferencia,precio,valor_diferencia,contado_at,estado_diferencia,client_observation_id,motivo_diferencia,observacion_diferencia)
     VALUES(sid,gid,c.snapshot_referencia_id,r.stock_teorico,physical,delta,r.precio,0,observed,state,oid,reason,note)RETURNING id INTO did;
     UPDATE inventario.solog_session_runtime_groups SET accion='none',priority_class='none',contado_detalle_id=did,contado_at=observed WHERE conteo_id=sid AND grupo_conteo_id=gid;
     IF state='Recontar' THEN PERFORM inventario.full_link_observation_v1(did,u.sede_id);END IF;
    ELSE
     IF d.motivo_diferencia IS NOT NULL AND reason IS NOT NULL AND d.motivo_diferencia<>reason THEN RAISE EXCEPTION 'INVALID_STRUCTURE';END IF;reason:=coalesce(d.motivo_diferencia,reason);dr:=delta;d0:=d.stock_fisico::bigint-d.stock_teorico::bigint;
     IF dr=0 THEN note:='Resuelto';ELSE IF note='Resuelto' OR note IS NOT NULL AND length(note)<3 OR (d.motivo_diferencia IS NULL AND reason IS NOT NULL AND note IS NULL) OR(reason IS NULL AND note IS NOT NULL) OR(abs(dr)>=12 AND(reason IS NULL OR note IS NULL)) THEN RAISE EXCEPTION 'INVALID_STRUCTURE';END IF;END IF;
     state:=CASE WHEN dr=0 THEN 'Coincide' WHEN sign(dr)=sign(d0) THEN 'Confirmada' ELSE 'Inconsistente' END;
     delta:=CASE WHEN dr=0 THEN 0 WHEN sign(dr)=sign(d0) THEN CASE WHEN abs(dr)<abs(d0) THEN dr ELSE d0 END ELSE dr END;
     UPDATE inventario.conteo_detalle SET snapshot_reconteo_id=c.snapshot_referencia_id,stock_teorico_reconteo=r.stock_teorico,stock_reconteo=physical,recontado_at=observed,reconteo_conteo_id=sid,motivo_diferencia=reason,observacion_reconteo=note,estado_diferencia=state,diferencia=delta WHERE id=d.id;did:=d.id;
     UPDATE inventario.solog_session_runtime_groups SET accion='none',priority_class='none',recontado_at=observed WHERE conteo_id=sid AND grupo_conteo_id=gid;
     DELETE FROM inventario.full_recount_reservations WHERE detail_id=did;
    END IF;
    UPDATE inventario.estado_stock_grupo SET estado=CASE WHEN state='Inconsistente' THEN 'Cambio_reciente' WHEN snapshot_id=c.snapshot_referencia_id THEN 'Contado' ELSE estado END WHERE sede_id=u.sede_id AND grupo_conteo_id=gid AND (p_action='save_batch' OR ultimo_conteo_detalle_id=did);
    entry:=jsonb_build_object('client_observation_id',oid,'detail_id',did,'state',state,'difference',delta,'replay',false);
    INSERT INTO inventario.full_observations VALUES(oid,p_uid,sid,p_action,ofp,did,entry);outs:=outs||jsonb_build_array(entry);
   END LOOP;code:='OBSERVATIONS_CONFIRMED';
  END IF;
 END IF;
 PERFORM inventario.solog_revision_bump('operational',u.sede_id);
 data:=jsonb_build_object('action',p_action,'replay',false,'session',inventario.full_session_json_v1(sid,p_now),'affected_groups',CASE WHEN p_action IN('save_batch','recount_save_batch') THEN coalesce((SELECT jsonb_agg(g ORDER BY g->>'group_id') FROM jsonb_array_elements(inventario.full_runtime_json_v2(sid))g WHERE g->>'group_id' IN(SELECT changed_detail.grupo_conteo_id::text FROM inventario.full_observations o JOIN inventario.conteo_detalle changed_detail ON changed_detail.id=o.detail_id WHERE o.session_id=sid AND o.observation_id IN(SELECT (i->>'client_observation_id')::uuid FROM jsonb_array_elements(p_payload->'items')i))),'[]'::jsonb) ELSE '[]'::jsonb END,'observation_results',outs);
 res:=inventario.full_cashier_result_v2(code,data,p_now);
 INSERT INTO inventario.full_cashier_operations VALUES(p_uid,op,sid,fp,jsonb_build_object('code',code,'data',data-'session'));RETURN res;
 EXCEPTION WHEN OTHERS THEN
  code:=CASE WHEN SQLSTATE IN('55P03','40P01','57014') THEN 'TEMPORARILY_UNAVAILABLE' WHEN SQLERRM IN('SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT','SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT') THEN 'NORMAL_COUNT_ALREADY_IN_SHIFT' WHEN SQLERRM='SOLOG_SESSION_PRIORITY_CONFLICT' THEN 'PRIORITY_CONFLICT' WHEN SQLSTATE='P0001' AND SQLERRM IN('SESSION_ALREADY_ACTIVE','NEW_SESSIONS_PAUSED','SNAPSHOT_REQUIRED','STOCK_EXPIRED','STRUCTURE_SNAPSHOT_REQUIRED','SESSION_NOT_FOUND','GROUP_STRUCTURE_CHANGED','MANIFEST_NOT_CONFIRMED','OBSERVATION_ALREADY_RECORDED','SESSION_DELIVERY_CLOSED','INVALID_OBSERVATION_TIME','SESSION_CAPTURE_CLOSED','RECOUNT_NOT_READY','RECOUNT_ALREADY_RESOLVED','PRIORITY_CONFLICT','STOCK_UNRESOLVABLE','INVALID_STRUCTURE') THEN SQLERRM ELSE 'INTERNAL_ERROR' END;
 END;
 IF code IN('RECOUNT_ALREADY_RESOLVED','NORMAL_COUNT_ALREADY_IN_SHIFT','OBSERVATION_ALREADY_RECORDED') AND sid IS NOT NULL AND EXISTS(SELECT 1 FROM inventario.conteos WHERE id=sid AND usuario_id=p_uid AND sede_id=u.sede_id) THEN INSERT INTO inventario.full_delivery_conflicts VALUES(p_uid,op,sid,fp,p_payload-'device_token',code,clock_timestamp()) ON CONFLICT(user_id,operation_id) DO NOTHING;END IF;
 RETURN inventario.full_cashier_error_v2(code,p_now);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN inventario.full_cashier_error_v2('INVALID_STRUCTURE',coalesce(p_now,clock_timestamp()));WHEN lock_not_available OR deadlock_detected OR query_canceled THEN RETURN inventario.full_cashier_error_v2('TEMPORARILY_UNAVAILABLE',coalesce(p_now,clock_timestamp()));WHEN OTHERS THEN RETURN inventario.full_cashier_error_v2('INTERNAL_ERROR',coalesce(p_now,clock_timestamp()));END $$;
CREATE FUNCTION public.rpc_solog_cashier_bootstrap_v6(p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$ BEGIN RETURN inventario.full_cashier_dispatch_v2(auth.uid(),'bootstrap',p_payload,NULL);END $$;
REVOKE ALL ON FUNCTION public.rpc_solog_cashier_bootstrap_v6(jsonb)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.rpc_solog_cashier_bootstrap_v6(jsonb)TO authenticated;
CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_bootstrap_v5(p_payload jsonb)RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT inventario.full_error_v1('UNSUPPORTED_CONTRACT_VERSION',clock_timestamp())$$;
CREATE FUNCTION public.rpc_solog_cashier_mutate_v7(p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$ BEGIN RETURN inventario.full_cashier_dispatch_v2(auth.uid(),p_action,p_payload,NULL);END $$;
REVOKE ALL ON FUNCTION public.rpc_solog_cashier_mutate_v7(text,jsonb)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.rpc_solog_cashier_mutate_v7(text,jsonb)TO authenticated;
CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_mutate_v6(p_action text,p_payload jsonb)RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT inventario.full_error_v1('UNSUPPORTED_CONTRACT_VERSION',clock_timestamp())$$;
REVOKE ALL ON FUNCTION inventario.full_runtime_json_v2(uuid),inventario.full_cashier_state_v2(uuid,uuid,timestamptz),inventario.full_cashier_result_v2(text,jsonb,timestamptz),inventario.full_cashier_error_v2(text,timestamptz),inventario.full_cashier_dispatch_v2(uuid,text,jsonb,timestamptz)FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
