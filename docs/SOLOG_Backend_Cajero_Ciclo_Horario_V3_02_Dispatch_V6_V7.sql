-- SOLOG | Cajero Full | Ciclo horario V3 | Migración 02/02
-- ESTADO: PREPARADA, NO APLICADA. Requiere migración 01 aplicada.
-- Fuente funcional: docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md
-- Base de dispatcher verificada mediante md5 de pg_get_functiondef.
-- Mantiene modo legacy. No activa V3 y no cambia RPC pública.
-- La transacción la gestiona el ejecutor de migraciones de Supabase.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
BEGIN
  IF to_regclass('inventario.full_cashier_hourly_config_v3') IS NULL
     OR to_regprocedure('inventario.full_cashier_state_v3(uuid,uuid,timestamp with time zone)') IS NULL
  THEN RAISE EXCEPTION 'SOLOG_V3_MIGRATION_01_REQUIRED';END IF;
  IF md5(pg_get_functiondef(
       'inventario.full_cashier_dispatch_v2(uuid,text,jsonb,timestamp with time zone)'::regprocedure
     ))<>'f09dd9ad88123b990b5fd4a7110c8c9e'
  THEN RAISE EXCEPTION 'SOLOG_V3_DISPATCH_BASELINE_CHANGED';END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION inventario.full_cashier_dispatch_v2(p_uid uuid, p_action text, p_payload jsonb, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE u public.usuarios%rowtype;device uuid;op uuid;sid uuid;fp text;saved inventario.full_cashier_operations%rowtype;conf inventario.full_delivery_conflicts%rowtype;c inventario.conteos%rowtype;s inventario.snapshots%rowtype;cfg inventario.full_settings%rowtype;win jsonb;ctx record;r inventario.solog_session_runtime_groups%rowtype;d inventario.conteo_detalle%rowtype;obs inventario.full_observations%rowtype;item jsonb;items jsonb;ofp text;oid uuid;did uuid;gid uuid;observed timestamptz;physical integer;delta bigint;d0 bigint;dr bigint;state text;reason text;note text;data jsonb;code text;res jsonb;outs jsonb:='[]';entry jsonb;cl text;schema_key text;v_mode text;v_is_v3 boolean:=false;v_offer jsonb;v_item_index integer:=-1;v_conflict_payload jsonb;
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
 IF p_action='bootstrap' THEN RETURN inventario.full_cashier_result_v2('CASHIER_STATE',inventario.full_cashier_state_v3(p_uid,u.sede_id,p_now),p_now);END IF;
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
 IF FOUND THEN RETURN inventario.full_cashier_error_v3(
    CASE WHEN conf.fingerprint=fp THEN conf.code ELSE 'IDEMPOTENCY_CONFLICT' END,
    p_now,
    CASE WHEN conf.fingerprint=fp
      THEN NULLIF(conf.payload#>>'{_solog_v3_diagnostic,item_index}','')::integer
      ELSE NULL END
  );END IF;
 sid:=(p_payload->>'session_id')::uuid;
 BEGIN
 IF p_action='start' THEN
  SELECT mode INTO v_mode
    FROM inventario.full_cashier_hourly_config_v3 WHERE singleton FOR SHARE;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'SOLOG_V3_CONFIG_MISSING';END IF;
  -- Ambos formatos han pasado ya el JSON Schema estricto.
  v_is_v3:=p_payload ? 'expected_snapshot_id';
  IF v_is_v3 THEN
    IF v_mode='legacy' THEN RAISE EXCEPTION 'START_POLICY_NOT_ENABLED';END IF;
    p_now:=clock_timestamp();
    data:=inventario.full_cashier_state_v3(p_uid,u.sede_id,p_now);
    v_offer:=data->'start_offer';
    -- Un cambio de referencia, hora o modalidad exige una elección nueva.
    IF (v_offer->>'snapshot_id') IS DISTINCT FROM p_payload->>'expected_snapshot_id'
       OR (v_offer->>'status') IS DISTINCT FROM p_payload->>'selected_as'
       OR (v_offer->>'cycle_started_at')::timestamptz
          IS DISTINCT FROM (p_payload->>'expected_cycle_started_at')::timestamptz
    THEN RAISE EXCEPTION 'SNAPSHOT_SELECTION_CHANGED';END IF;
    code:=v_offer->>'block_reason';
    IF code IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=code;END IF;
    IF NOT COALESCE((v_offer->>'can_start')::boolean,false)
    THEN RAISE EXCEPTION 'START_CAPTURE_TOO_SHORT';END IF;
  ELSE
    IF v_mode='required' THEN RAISE EXCEPTION 'START_POLICY_UPGRADE_REQUIRED';END IF;
    data:=inventario.full_cashier_state_v2(p_uid,u.sede_id,p_now);
    code:=data#>>'{capabilities,block_reason}';
    IF code IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=code;END IF;
  END IF;
  SELECT * INTO s FROM inventario.snapshots WHERE id=(data#>>'{stock,snapshot_id}')::uuid;
  SELECT * INTO cfg FROM inventario.full_settings WHERE id;
  win:=CASE WHEN v_is_v3
      THEN inventario.full_window_v3(s.capturado_at,p_now,p_now)
      ELSE inventario.full_window_v1(s.capturado_at,p_now,p_now) END;
  SELECT * INTO ctx FROM inventario.full_temporal_context_v1(p_now);
  -- Segunda guardia inmediatamente antes del INSERT: límite HH:57 y rollover.
  IF v_is_v3 THEN
    p_now:=clock_timestamp();
    IF (date_trunc('hour',p_now AT TIME ZONE 'America/Lima')
        -interval '1 minute') AT TIME ZONE 'America/Lima'
          IS DISTINCT FROM (p_payload->>'expected_cycle_started_at')::timestamptz
    THEN RAISE EXCEPTION 'SNAPSHOT_SELECTION_CHANGED';END IF;
    IF extract(minute FROM p_now AT TIME ZONE 'America/Lima')>=57
    THEN RAISE EXCEPTION 'START_WINDOW_CLOSED';END IF;
    win:=inventario.full_window_v3(s.capturado_at,p_now,p_now);
    IF NOT COALESCE((win->>'can_start')::boolean,false)
    THEN RAISE EXCEPTION 'START_CAPTURE_TOO_SHORT';END IF;
    SELECT * INTO ctx FROM inventario.full_temporal_context_v1(p_now);
  END IF;
  INSERT INTO inventario.conteos(sede_id,usuario_id,estado,iniciado_at,expira_at,snapshot_referencia_id,version_catalogo,groups_revision,periodo_desde,periodo_hasta,ronda,ronda_desde,ronda_hasta,turno,turno_desde,turno_hasta,created_at,updated_at)
  VALUES(u.sede_id,p_uid,'activo',p_now,(win->>'session_expires_at')::timestamptz,s.id,s.version_catalogo,cfg.groups_revision,ctx.periodo_desde,ctx.periodo_hasta,ctx.ronda,ctx.ronda_desde,ctx.ronda_hasta,ctx.turno,ctx.turno_desde,ctx.turno_hasta,p_now,p_now)RETURNING * INTO c;sid:=c.id;
  INSERT INTO inventario.full_session_windows(
    session_id,policy_version,reference_snapshot_id,reference_captured_at,
    capture_interval_number,capture_interval_starts_at,
    capture_interval_ends_at,session_expires_at,pending_delivery_until
  ) VALUES(
    sid,CASE WHEN v_is_v3 THEN 3 ELSE cfg.policy_version END,
    s.id,s.capturado_at,
    (win->>'capture_interval_number')::integer,
    (win->>'capture_interval_starts_at')::timestamptz,
    COALESCE((win->>'capture_interval_ends_at')::timestamptz,
      s.capturado_at+make_interval(hours=>(win->>'capture_interval_number')::integer)),
    c.expira_at,c.expira_at+interval '2 hours'
  );
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
    IF NOT coalesce((inventario.full_session_json_v1(sid,p_now)->>'pending_delivery_allowed')::boolean,false) THEN RAISE EXCEPTION 'SESSION_DELIVERY_CLOSED';END IF;
   IF (SELECT count(*) FROM jsonb_array_elements_text(p_payload#>'{delivery_manifest,observation_ids}'))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p_payload#>'{delivery_manifest,observation_ids}')x)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload#>'{delivery_manifest,observation_ids}')x WHERE NOT EXISTS(SELECT 1 FROM inventario.full_observations WHERE observation_id=x::uuid AND session_id=sid AND user_id=p_uid))
   OR EXISTS(SELECT 1 FROM inventario.full_observations WHERE session_id=sid AND user_id=p_uid AND NOT(p_payload#>'{delivery_manifest,observation_ids}' ? observation_id::text)) THEN RAISE EXCEPTION 'MANIFEST_NOT_CONFIRMED';END IF;
   UPDATE inventario.conteos SET estado='finalizado',finalizado_at=p_now,updated_at=p_now WHERE id=sid AND estado IN('activo','recovery');IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_DELIVERY_CLOSED';END IF;code:='SESSION_FINISHED';
  ELSE
   FOR item IN SELECT x FROM jsonb_array_elements(items)x LOOP
     v_item_index:=v_item_index+1;
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
  code:=CASE WHEN SQLSTATE IN('55P03','40P01','57014') THEN 'TEMPORARILY_UNAVAILABLE' WHEN SQLERRM='SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT' THEN 'NORMAL_COUNT_ALREADY_IN_SHIFT' WHEN SQLERRM='SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT' THEN 'NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT' WHEN SQLERRM='SOLOG_SESSION_PRIORITY_CONFLICT' THEN 'PRIORITY_CONFLICT' WHEN SQLSTATE='P0001' AND SQLERRM IN('START_WINDOW_CLOSED','START_CAPTURE_TOO_SHORT','SNAPSHOT_SELECTION_CHANGED','START_POLICY_NOT_ENABLED','START_POLICY_UPGRADE_REQUIRED','SESSION_RECOVERY_PENDING','SESSION_ALREADY_ACTIVE','NEW_SESSIONS_PAUSED','SNAPSHOT_REQUIRED','STOCK_EXPIRED','STRUCTURE_SNAPSHOT_REQUIRED','SESSION_NOT_FOUND','GROUP_STRUCTURE_CHANGED','MANIFEST_NOT_CONFIRMED','OBSERVATION_ALREADY_RECORDED','SESSION_DELIVERY_CLOSED','INVALID_OBSERVATION_TIME','SESSION_CAPTURE_CLOSED','RECOUNT_NOT_READY','RECOUNT_ALREADY_RESOLVED','PRIORITY_CONFLICT','STOCK_UNRESOLVABLE','INVALID_STRUCTURE') THEN SQLERRM ELSE 'INTERNAL_ERROR' END;
 END;
 IF code IN('RECOUNT_ALREADY_RESOLVED','NORMAL_COUNT_ALREADY_IN_SHIFT',
             'NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT','OBSERVATION_ALREADY_RECORDED')
     AND sid IS NOT NULL AND
     EXISTS(SELECT 1 FROM inventario.conteos
            WHERE id=sid AND usuario_id=p_uid AND sede_id=u.sede_id) THEN
    v_conflict_payload:=p_payload-'device_token';
    IF v_item_index BETWEEN 0 AND 499
       AND p_action IN('save_batch','recount_save_batch') THEN
      v_conflict_payload:=jsonb_set(v_conflict_payload,
        '{_solog_v3_diagnostic}',jsonb_build_object('item_index',v_item_index),true);
    END IF;
    INSERT INTO inventario.full_delivery_conflicts
      (user_id,operation_id,session_id,fingerprint,payload,code,created_at)
    VALUES(p_uid,op,sid,fp,v_conflict_payload,code,clock_timestamp())
    ON CONFLICT(user_id,operation_id) DO NOTHING;
  END IF;
  RETURN inventario.full_cashier_error_v3(code,p_now,
    CASE WHEN code IN('RECOUNT_ALREADY_RESOLVED','NORMAL_COUNT_ALREADY_IN_SHIFT',
                       'NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT','OBSERVATION_ALREADY_RECORDED')
               AND v_item_index BETWEEN 0 AND 499
         THEN v_item_index ELSE NULL END);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN inventario.full_cashier_error_v2('INVALID_STRUCTURE',coalesce(p_now,clock_timestamp()));WHEN lock_not_available OR deadlock_detected OR query_canceled THEN RETURN inventario.full_cashier_error_v2('TEMPORARILY_UNAVAILABLE',coalesce(p_now,clock_timestamp()));WHEN OTHERS THEN RETURN inventario.full_cashier_error_v2('INTERNAL_ERROR',coalesce(p_now,clock_timestamp()));END $function$



-- Conserva el propietario y los grants anteriores de la función reemplazada.
-- Las únicas RPC públicas siguen siendo V6/V7.
