-- Local development only; all production activation flags remain closed.
DO $owner_guard$ DECLARE owner_role name;owner_id oid;BEGIN
 SELECT pg_get_userbyid(proowner),proowner INTO owner_role,owner_id FROM pg_proc WHERE oid='public.rpc_solog_cashier_mutate_v5(text,jsonb)'::regprocedure;
 IF current_user<>owner_role OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='inventario'::regnamespace AND p.proname LIKE 'full_%' AND p.proowner<>owner_id) THEN RAISE EXCEPTION 'FULL_MIGRATION_OWNER_MISMATCH: apply application migrations with the legacy gateway owner';END IF;
END $owner_guard$;
ALTER TABLE inventario.solog_session_runtime_groups ADD COLUMN full_policy boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX full_runtime_legacy_recount_unique ON inventario.solog_session_runtime_groups(detalle_reconteo_id) WHERE accion='recount' AND detalle_reconteo_id IS NOT NULL AND NOT full_policy;
DROP INDEX inventario.idx_solog_session_runtime_recount_detail_unique_v4;
CREATE TABLE inventario.full_recount_reservations(detail_id uuid PRIMARY KEY REFERENCES inventario.conteo_detalle(id),session_id uuid NOT NULL REFERENCES inventario.conteos(id));
CREATE INDEX full_recount_reservations_session ON inventario.full_recount_reservations(session_id);
CREATE TABLE inventario.full_cashier_operations(user_id uuid NOT NULL REFERENCES public.usuarios(id),operation_id uuid NOT NULL,session_id uuid NOT NULL REFERENCES inventario.conteos(id),fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(user_id,operation_id));
CREATE INDEX full_cashier_operations_session ON inventario.full_cashier_operations(session_id);
CREATE TABLE inventario.full_observations(observation_id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.usuarios(id),session_id uuid NOT NULL REFERENCES inventario.conteos(id),kind text NOT NULL CHECK(kind IN('save_batch','recount_save_batch')),fingerprint text NOT NULL,detail_id uuid NOT NULL REFERENCES inventario.conteo_detalle(id),result jsonb NOT NULL);
CREATE INDEX full_observations_session ON inventario.full_observations(session_id);
CREATE INDEX full_observations_detail ON inventario.full_observations(detail_id);
CREATE TABLE inventario.full_delivery_conflicts(user_id uuid NOT NULL REFERENCES public.usuarios(id),operation_id uuid NOT NULL,session_id uuid NOT NULL REFERENCES inventario.conteos(id),fingerprint text NOT NULL,payload jsonb NOT NULL,code text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(user_id,operation_id));
CREATE INDEX full_delivery_conflicts_session ON inventario.full_delivery_conflicts(session_id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['full_recount_reservations','full_cashier_operations','full_observations','full_delivery_conflicts'] LOOP EXECUTE format('ALTER TABLE inventario.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON inventario.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP; END $$;
CREATE TRIGGER full_user_auth_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.usuarios FOR EACH STATEMENT EXECUTE FUNCTION inventario.full_config_lock_v1();
CREATE TRIGGER full_device_auth_guard BEFORE INSERT OR DELETE OR TRUNCATE ON inventario.dispositivos_solog FOR EACH STATEMENT EXECUTE FUNCTION inventario.full_config_lock_v1();
CREATE TRIGGER full_device_revoke_guard BEFORE UPDATE OF estado,device_hash,sede_id ON inventario.dispositivos_solog FOR EACH STATEMENT EXECUTE FUNCTION inventario.full_config_lock_v1();

CREATE FUNCTION inventario.full_context_for_session_v1(p_at timestamptz,p_session uuid) RETURNS TABLE(periodo_desde date,periodo_hasta date,ronda smallint,ronda_desde timestamptz,ronda_hasta timestamptz,turno text,turno_desde timestamptz,turno_hasta timestamptz) LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN IF EXISTS(SELECT 1 FROM inventario.full_session_windows WHERE session_id=p_session) THEN RETURN QUERY SELECT * FROM inventario.full_temporal_context_v1(p_at);ELSE RETURN QUERY SELECT * FROM inventario.solog_temporal_context(p_at);END IF;END $$;
CREATE FUNCTION inventario.full_uses_policy_v1(p_site uuid,p_at timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM inventario.snapshots s WHERE s.sede_id=p_site AND s.full_batch_id IS NOT NULL AND s.recibido_at<=p_at)
$$;
CREATE FUNCTION inventario.full_context_for_site_v1(p_site uuid,p_at timestamptz) RETURNS TABLE(periodo_desde date,periodo_hasta date,ronda smallint,ronda_desde timestamptz,ronda_hasta timestamptz,turno text,turno_desde timestamptz,turno_hasta timestamptz) LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN IF inventario.full_uses_policy_v1(p_site,p_at) THEN RETURN QUERY SELECT * FROM inventario.full_temporal_context_v1(p_at);ELSE RETURN QUERY SELECT * FROM inventario.solog_temporal_context(p_at);END IF;END $$;
CREATE OR REPLACE FUNCTION inventario.solog_cleanup_session_runtime_groups() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM inventario.full_session_windows WHERE session_id=NEW.id) THEN
  IF NEW.estado<>'activo' THEN DELETE FROM inventario.full_recount_reservations WHERE session_id=NEW.id;END IF;
 ELSE IF NEW.estado IN('finalizado','expirado') AND OLD.estado IS DISTINCT FROM NEW.estado THEN DELETE FROM inventario.solog_session_runtime_groups WHERE conteo_id=NEW.id;END IF;END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION inventario.full_session_json_v1(p_id uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('session_id',c.id,'status',CASE WHEN c.estado='finalizado' THEN 'finished' WHEN c.estado='expirado' OR p_now>=w.pending_delivery_until THEN 'expired' WHEN p_now>=c.expira_at THEN 'recovery' ELSE 'active' END,
 'session_started_at',inventario.full_utc_v1(c.iniciado_at),'reference_snapshot_id',w.reference_snapshot_id,'reference_snapshot_captured_at',inventario.full_utc_v1(w.reference_captured_at),'reference_stock_expires_at',inventario.full_utc_v1(w.reference_captured_at+interval '2 hours'),
 'capture_interval_number',w.capture_interval_number,'capture_interval_starts_at',inventario.full_utc_v1(w.capture_interval_starts_at),'capture_interval_ends_at',inventario.full_utc_v1(w.capture_interval_ends_at),'session_expires_at',inventario.full_utc_v1(w.session_expires_at),'pending_delivery_until',inventario.full_utc_v1(w.pending_delivery_until),
 'capture_allowed',c.estado='activo' AND p_now>=c.iniciado_at AND p_now<c.expira_at,'pending_delivery_allowed',c.estado IN('activo','recovery') AND p_now>=c.iniciado_at AND p_now<w.pending_delivery_until,'groups_revision',c.groups_revision)
 FROM inventario.conteos c JOIN inventario.full_session_windows w ON w.session_id=c.id WHERE c.id=p_id
$$;
CREATE FUNCTION inventario.full_runtime_json_v1(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('group_id',r.grupo_conteo_id,'group_name',r.grupo_nombre,'category_id',r.categoria_id,'category_name',r.categoria_nombre,'reference_snapshot_id',r.snapshot_referencia_id,'groups_revision',c.groups_revision,'stock_theoretical',r.stock_teorico,'member_codes',r.codigos_internos,'price',r.precio,'units_per_package',r.unidades_por_paquete,'package_price',r.precio_paquete,'action',r.accion,'priority_class',r.priority_class,'recount_detail_id',r.detalle_reconteo_id) ORDER BY r.grupo_conteo_id),'[]') FROM inventario.solog_session_runtime_groups r JOIN inventario.conteos c ON c.id=r.conteo_id WHERE r.conteo_id=p_id
$$;
CREATE FUNCTION inventario.full_link_observation_v1(p_detail uuid,p_site uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE first_id uuid;last_id uuid;first_stock integer;last_stock integer;BEGIN
 SELECT s.id,x.stock INTO first_id,first_stock FROM inventario.conteo_detalle d JOIN inventario.snapshots s ON s.sede_id=p_site CROSS JOIN LATERAL(SELECT sum(ss.stock::bigint) stock,count(*) n FROM inventario.snapshot_stock ss WHERE ss.snapshot_id=s.id AND ss.c_interno=ANY(d.codigos_internos))x WHERE d.id=p_detail AND s.confirmado_at IS NOT NULL AND s.capturado_at>d.contado_at AND x.n=cardinality(d.codigos_internos) AND x.stock BETWEEN -2147483648 AND 2147483647 ORDER BY s.capturado_at,s.id LIMIT 1;
 IF first_id IS NOT NULL THEN
  SELECT s.id,x.stock INTO last_id,last_stock FROM inventario.conteo_detalle d JOIN inventario.snapshots s ON s.sede_id=p_site CROSS JOIN LATERAL(SELECT sum(ss.stock::bigint) stock,count(*) n FROM inventario.snapshot_stock ss WHERE ss.snapshot_id=s.id AND ss.c_interno=ANY(d.codigos_internos))x WHERE d.id=p_detail AND s.confirmado_at IS NOT NULL AND s.capturado_at>d.contado_at AND x.n=cardinality(d.codigos_internos) AND x.stock BETWEEN -2147483648 AND 2147483647 ORDER BY s.capturado_at DESC,s.id DESC LIMIT 1;
  UPDATE inventario.conteo_detalle SET primer_snapshot_posterior_id=first_id,snapshot_posterior_id=last_id,stock_posterior=last_stock WHERE id=p_detail;
 END IF;END $$;

CREATE FUNCTION inventario.full_cashier_state_v1(p_uid uuid,p_site uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s inventario.snapshots%rowtype;rev bigint;sid uuid;stock jsonb;reason text;cfg inventario.full_settings%rowtype;shift jsonb;BEGIN
 SELECT * INTO cfg FROM inventario.full_settings WHERE id;
 SELECT x.* INTO s FROM inventario.snapshots x WHERE x.sede_id=p_site AND x.confirmado_at IS NOT NULL ORDER BY x.capturado_at DESC,x.id DESC LIMIT 1;
 SELECT max(groups_revision) INTO rev FROM inventario.full_group_history WHERE snapshot_id=s.id;
 IF s.id IS NOT NULL THEN stock:=jsonb_build_object('snapshot_id',s.id,'snapshot_captured_at',inventario.full_utc_v1(s.capturado_at),'snapshot_confirmed_at',inventario.full_utc_v1(s.confirmado_at),'stock_expires_at',inventario.full_utc_v1(s.capturado_at+interval '2 hours'),'is_fresh',p_now>=s.capturado_at AND p_now<s.capturado_at+interval '2 hours','is_fallback',p_now>=s.capturado_at+interval '1 hour' AND p_now<s.capturado_at+interval '2 hours','catalog_version',s.version_catalogo,'groups_revision',coalesce(rev,cfg.groups_revision));END IF;
 SELECT c.id INTO sid FROM inventario.conteos c JOIN inventario.full_session_windows w ON w.session_id=c.id WHERE c.sede_id=p_site AND c.usuario_id=p_uid AND c.estado='activo' ORDER BY c.iniciado_at DESC LIMIT 1;
 reason:=CASE WHEN EXISTS(SELECT 1 FROM inventario.conteos WHERE sede_id=p_site AND estado='activo') THEN 'SESSION_ALREADY_ACTIVE' WHEN NOT cfg.new_sessions THEN 'NEW_SESSIONS_PAUSED' WHEN s.id IS NULL THEN 'SNAPSHOT_REQUIRED' WHEN p_now<s.capturado_at OR p_now>=s.capturado_at+interval '2 hours' THEN 'STOCK_EXPIRED' WHEN EXISTS(SELECT 1 FROM inventario.full_group_history h JOIN inventario.categorias k ON k.id=h.category_id JOIN inventario.estado_stock_grupo e ON e.grupo_conteo_id=h.group_id AND e.sede_id=p_site AND e.activo WHERE h.snapshot_id=s.id AND NOT k.activo) OR rev IS DISTINCT FROM cfg.groups_revision OR s.version_catalogo IS DISTINCT FROM(SELECT max(version)FROM inventario.versiones_catalogo WHERE schema_version=2 AND storage_path IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM inventario.full_group_history WHERE snapshot_id=s.id) THEN 'STRUCTURE_SNAPSHOT_REQUIRED' ELSE NULL END;
 shift:=inventario.full_window_v1(p_now,p_now,p_now)->'shift';
 RETURN jsonb_build_object('timezone','America/Lima','stock',stock,'session',inventario.full_session_json_v1(sid,p_now),'recovery_sessions',coalesce((SELECT jsonb_agg(inventario.full_session_json_v1(c.id,p_now) ORDER BY c.iniciado_at)FROM inventario.conteos c JOIN inventario.full_session_windows w ON w.session_id=c.id WHERE c.usuario_id=p_uid AND c.sede_id=p_site AND c.estado='recovery'),'[]'),'shift',shift,'capabilities',jsonb_build_object('can_start_session',reason IS NULL,'can_capture_in_current_session',sid IS NOT NULL,'block_reason',reason),'groups',inventario.full_runtime_json_v1(sid));
END $$;

CREATE FUNCTION inventario.full_cashier_dispatch_v1(p_uid uuid,p_action text,p_payload jsonb,p_now timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE u public.usuarios%rowtype;device uuid;op uuid;sid uuid;fp text;saved inventario.full_cashier_operations%rowtype;conf inventario.full_delivery_conflicts%rowtype;c inventario.conteos%rowtype;s inventario.snapshots%rowtype;cfg inventario.full_settings%rowtype;win jsonb;ctx record;r inventario.solog_session_runtime_groups%rowtype;d inventario.conteo_detalle%rowtype;obs inventario.full_observations%rowtype;item jsonb;items jsonb;ofp text;oid uuid;did uuid;gid uuid;observed timestamptz;physical integer;delta bigint;d0 bigint;dr bigint;state text;reason text;note text;data jsonb;code text;res jsonb;outs jsonb:='[]';entry jsonb;cl text;schema_key text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(1397705807,4702);
 SELECT * INTO u FROM public.usuarios WHERE id=p_uid FOR SHARE;
 IF NOT FOUND OR NOT coalesce(u.activo,false) OR u.rol::text<>'cajero' OR u.sede_id IS NULL THEN RETURN inventario.full_error_v1('USER_UNAUTHORIZED',coalesce(p_now,clock_timestamp()));END IF;
 schema_key:=CASE WHEN p_action='bootstrap' THEN 'cashier_bootstrap' ELSE 'cashier_mutate' END;
 IF NOT extensions.json_matches_schema((SELECT document::json FROM inventario.full_contracts WHERE kind=schema_key),CASE WHEN p_action='bootstrap' THEN jsonb_build_object('p_payload',p_payload) ELSE jsonb_build_object('p_action',p_action,'p_payload',p_payload) END::json) THEN RETURN inventario.full_error_v1('INVALID_STRUCTURE',coalesce(p_now,clock_timestamp()));END IF;
 IF octet_length(p_payload::text)>4194304 THEN RETURN inventario.full_error_v1('PAYLOAD_TOO_LARGE',coalesce(p_now,clock_timestamp()));END IF;
 op:=(p_payload->>'operation_id')::uuid;
 IF op IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('full-cashier-operation:'||p_uid::text||op::text,0));END IF;
 PERFORM 1 FROM public.sedes WHERE id=u.sede_id AND activo FOR UPDATE;
 IF NOT FOUND THEN RETURN inventario.full_error_v1('USER_UNAUTHORIZED',coalesce(p_now,clock_timestamp()));END IF;
 SELECT id INTO device FROM inventario.dispositivos_solog WHERE sede_id=u.sede_id AND estado='autorizado' AND device_hash=encode(extensions.digest(p_payload->>'device_token','sha256'),'hex') FOR SHARE;
 IF device IS NULL THEN RETURN inventario.full_error_v1('DEVICE_UNAUTHORIZED',coalesce(p_now,clock_timestamp()));END IF;
 p_now:=coalesce(p_now,clock_timestamp());IF NOT isfinite(p_now) THEN RAISE EXCEPTION 'INVALID_OBSERVATION_TIME';END IF;
 -- Versioned sessions only; old sessions retain their original policy.
 UPDATE inventario.conteos x SET estado='recovery',updated_at=p_now FROM inventario.full_session_windows w WHERE w.session_id=x.id AND x.sede_id=u.sede_id AND x.estado='activo' AND p_now>=x.expira_at AND p_now<w.pending_delivery_until;
 UPDATE inventario.conteos x SET estado='expirado',finalizado_at=w.pending_delivery_until,updated_at=p_now FROM inventario.full_session_windows w WHERE w.session_id=x.id AND x.sede_id=u.sede_id AND x.estado IN('activo','recovery') AND p_now>=w.pending_delivery_until;
 IF p_action='bootstrap' THEN RETURN inventario.full_result_v1('CASHIER_STATE',inventario.full_cashier_state_v1(p_uid,u.sede_id,p_now),p_now);END IF;
 -- Fingerprints exclude the device secret, but authorization precedes every replay.
 items:=p_payload->'items';IF items IS NOT NULL THEN SELECT jsonb_agg(jsonb_set(x,'{contado_at}',to_jsonb(inventario.full_utc_v1((x->>'contado_at')::timestamptz))) ORDER BY ord) INTO items FROM jsonb_array_elements(items) WITH ORDINALITY a(x,ord);p_payload:=jsonb_set(p_payload,'{items}',items);END IF;
 fp:=encode(extensions.digest(jsonb_build_object('action',p_action,'payload',p_payload-'device_token'-'operation_id')::text,'sha256'),'hex');
 SELECT * INTO saved FROM inventario.full_cashier_operations WHERE user_id=p_uid AND operation_id=op;
 IF FOUND THEN
  IF saved.fingerprint<>fp THEN RETURN inventario.full_error_v1('IDEMPOTENCY_CONFLICT',p_now);END IF;
  IF NOT EXISTS(SELECT 1 FROM inventario.conteos WHERE id=saved.session_id AND usuario_id=p_uid AND sede_id=u.sede_id) THEN RETURN inventario.full_error_v1('SESSION_NOT_FOUND',p_now);END IF;
  data:=saved.result->'data';data:=jsonb_set(data,'{replay}','true');data:=jsonb_set(data,'{session}',inventario.full_session_json_v1(saved.session_id,p_now));
  RETURN inventario.full_result_v1(saved.result->>'code',data,p_now);
 END IF;
 SELECT * INTO conf FROM inventario.full_delivery_conflicts WHERE user_id=p_uid AND operation_id=op;
 IF FOUND THEN RETURN inventario.full_error_v1(CASE WHEN conf.fingerprint=fp THEN conf.code ELSE 'IDEMPOTENCY_CONFLICT' END,p_now);END IF;
 sid:=(p_payload->>'session_id')::uuid;
 BEGIN
 IF p_action='start' THEN
  data:=inventario.full_cashier_state_v1(p_uid,u.sede_id,p_now);code:=data#>>'{capabilities,block_reason}';IF code IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=code;END IF;
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
 data:=jsonb_build_object('action',p_action,'replay',false,'session',inventario.full_session_json_v1(sid,p_now),'affected_groups',inventario.full_runtime_json_v1(sid),'observation_results',outs);
 res:=inventario.full_result_v1(code,data,p_now);
 INSERT INTO inventario.full_cashier_operations VALUES(p_uid,op,sid,fp,res);RETURN res;
 EXCEPTION WHEN OTHERS THEN
  code:=CASE WHEN SQLSTATE IN('55P03','40P01','57014') THEN 'TEMPORARILY_UNAVAILABLE' WHEN SQLERRM IN('SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT','SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT') THEN 'NORMAL_COUNT_ALREADY_IN_SHIFT' WHEN SQLERRM='SOLOG_SESSION_PRIORITY_CONFLICT' THEN 'PRIORITY_CONFLICT' WHEN SQLSTATE='P0001' AND SQLERRM IN('SESSION_ALREADY_ACTIVE','NEW_SESSIONS_PAUSED','SNAPSHOT_REQUIRED','STOCK_EXPIRED','STRUCTURE_SNAPSHOT_REQUIRED','SESSION_NOT_FOUND','GROUP_STRUCTURE_CHANGED','MANIFEST_NOT_CONFIRMED','OBSERVATION_ALREADY_RECORDED','SESSION_DELIVERY_CLOSED','INVALID_OBSERVATION_TIME','SESSION_CAPTURE_CLOSED','RECOUNT_NOT_READY','RECOUNT_ALREADY_RESOLVED','PRIORITY_CONFLICT','STOCK_UNRESOLVABLE','INVALID_STRUCTURE') THEN SQLERRM ELSE 'INTERNAL_ERROR' END;
 END;
 IF code IN('RECOUNT_ALREADY_RESOLVED','NORMAL_COUNT_ALREADY_IN_SHIFT','OBSERVATION_ALREADY_RECORDED') AND sid IS NOT NULL AND EXISTS(SELECT 1 FROM inventario.conteos WHERE id=sid AND usuario_id=p_uid AND sede_id=u.sede_id) THEN INSERT INTO inventario.full_delivery_conflicts VALUES(p_uid,op,sid,fp,p_payload-'device_token',code,clock_timestamp()) ON CONFLICT(user_id,operation_id) DO NOTHING;END IF;
 RETURN inventario.full_error_v1(code,p_now);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN inventario.full_error_v1('INVALID_STRUCTURE',coalesce(p_now,clock_timestamp()));WHEN lock_not_available OR deadlock_detected OR query_canceled THEN RETURN inventario.full_error_v1('TEMPORARILY_UNAVAILABLE',coalesce(p_now,clock_timestamp()));WHEN OTHERS THEN RETURN inventario.full_error_v1('INTERNAL_ERROR',coalesce(p_now,clock_timestamp()));END $$;

CREATE FUNCTION public.rpc_solog_cashier_bootstrap_v5(p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$ BEGIN RETURN inventario.full_cashier_dispatch_v1(auth.uid(),'bootstrap',p_payload,NULL);END $$;
CREATE FUNCTION public.rpc_solog_cashier_mutate_v6(p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$ BEGIN RETURN inventario.full_cashier_dispatch_v1(auth.uid(),p_action,p_payload,NULL);END $$;
REVOKE ALL ON FUNCTION public.rpc_solog_cashier_bootstrap_v5(jsonb),public.rpc_solog_cashier_mutate_v6(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_solog_cashier_bootstrap_v5(jsonb),public.rpc_solog_cashier_mutate_v6(text,jsonb) TO authenticated;

-- Generated from frozen contract and legacy definitions.
INSERT INTO inventario.full_contracts VALUES('cashier_bootstrap','{"$schema":"http://json-schema.org/draft-07/schema#","$ref":"#/definitions/CashierBootstrapRequest","definitions":{"UUID":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"Hash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"Timestamp":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"UtcTimestamp":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"ErrorItem":{"type":"object","additionalProperties":false,"properties":{"code":{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},"message":{"type":"string","minLength":1,"maxLength":1024},"field_path":{"type":"string","minLength":0,"maxLength":256},"c_interno":{"anyOf":[{"type":"integer","minimum":20001,"maximum":2147483647},{"type":"null"}]},"source_row":{"anyOf":[{"type":"integer","minimum":1,"maximum":2147483647},{"type":"null"}]}},"required":["code","message","field_path"]},"Failure":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":false},"code":{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"type":"boolean"},"action_required":{"enum":["none","retry_same_operation","reconcile","refresh_credentials","new_capture","refresh_catalog","fix_payload","manual_review","wait"]},"data":{"anyOf":[{"type":"object"},{"type":"null"}]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":100,"minItems":1},"errors_total":{"type":"integer","minimum":1,"maximum":2147483647},"errors_truncated":{"type":"boolean"}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors","errors_total","errors_truncated"]},"Catalog":{"type":"object","additionalProperties":false,"properties":{"version":{"type":"integer","minimum":1,"maximum":2147483647},"schema_version":{"const":2},"sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"size_bytes":{"type":"integer","minimum":1,"maximum":2147483647},"confirmed":{"type":"boolean"}},"required":["version","schema_version","sha256","size_bytes","confirmed"]},"AllowedSite":{"type":"object","additionalProperties":false,"properties":{"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_name":{"type":"string","minLength":1,"maxLength":128},"warehouse":{"enum":["ALMCASUARINAS","ALMDIVINO","ALMHUACACHINA","ALMCUTERVO","ALMUNIDAD"]},"latest_snapshot_id":{"anyOf":[{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},{"type":"null"}]},"latest_snapshot_captured_at":{"anyOf":[{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},{"type":"null"}]},"stock_expires_at":{"anyOf":[{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},{"type":"null"}]}},"required":["sede_id","sede_name","warehouse","latest_snapshot_id","latest_snapshot_captured_at","stock_expires_at"]},"Policy":{"type":"object","additionalProperties":false,"properties":{"contract_version":{"const":1},"snapshot_contract_version":{"const":2},"timezone":{"const":"America/Lima"},"recommended_capture_interval_seconds":{"const":3600},"minimum_capture_interval_seconds":{"const":0},"stock_validity_seconds":{"const":7200},"session_capture_interval_seconds":{"const":3600},"max_capture_intervals_per_snapshot":{"const":2},"pending_delivery_seconds":{"const":7200},"observation_future_tolerance_seconds":{"const":30},"movement_max_intervals":{"const":20},"movement_min_valid_intervals":{"const":3},"movement_max_age_seconds":{"const":604800},"raw_interval_retention_days":{"const":45},"max_body_bytes":{"const":4194304},"max_sku_entries":{"const":10000},"max_incidents":{"const":20000},"max_batch_items":{"const":500},"max_response_errors":{"const":100},"max_string_length":{"const":1024},"automatic_retry_attempts":{"const":3},"retry_delays_seconds":{"const":[2,5,15]},"retry_jitter_fraction":{"const":0.2},"rate_limit_requests_per_installation_per_minute":{"const":120},"db_lock_timeout_ms":{"const":5000},"db_statement_timeout_ms":{"const":25000},"http_client_timeout_ms":{"const":60000},"shifts_local":{"const":[{"id":"early","label":"shift_1","start":"00:00","end":"08:00"},{"id":"day","label":"shift_2","start":"08:00","end":"16:00"},{"id":"night","label":"shift_3","start":"16:00","end":"24:00"}]},"retention_capacity_gate":{"const":"must_pass_before_activation"},"kill_switches":{"type":"object","additionalProperties":false,"properties":{"full_new_ingestion":{"type":"boolean"},"solog_new_sessions":{"type":"boolean"}},"required":["full_new_ingestion","solog_new_sessions"]},"strict_unknown_properties":{"const":true},"fingerprint_version":{"const":1}},"required":["contract_version","snapshot_contract_version","timezone","recommended_capture_interval_seconds","minimum_capture_interval_seconds","stock_validity_seconds","session_capture_interval_seconds","max_capture_intervals_per_snapshot","pending_delivery_seconds","observation_future_tolerance_seconds","movement_max_intervals","movement_min_valid_intervals","movement_max_age_seconds","raw_interval_retention_days","max_body_bytes","max_sku_entries","max_incidents","max_batch_items","max_response_errors","max_string_length","automatic_retry_attempts","retry_delays_seconds","retry_jitter_fraction","rate_limit_requests_per_installation_per_minute","db_lock_timeout_ms","db_statement_timeout_ms","http_client_timeout_ms","shifts_local","retention_capacity_gate","kill_switches","strict_unknown_properties","fingerprint_version"]},"BootstrapSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["BOOTSTRAP_READY"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"installation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"scope":{"const":"full"},"allowed_sites":{"type":"array","items":{"$ref":"#/definitions/AllowedSite"},"maxItems":5,"minItems":1},"catalog":{"$ref":"#/definitions/Catalog"},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"policy":{"$ref":"#/definitions/Policy"}},"required":["installation_id","scope","allowed_sites","catalog","groups_revision","policy"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"CatalogConfirmSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["CATALOG_CONFIRMED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"$ref":"#/definitions/Catalog"},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"Batch":{"type":"object","additionalProperties":false,"properties":{"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"lifecycle":{"enum":["open","closed"]},"outcome":{"enum":["pending","completed","partial","failed"]},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"source_enterprise_id":{"type":"string","minLength":1,"maxLength":80},"source_report_id":{"type":"string","minLength":1,"maxLength":80},"snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"master_excel_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"sites":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"state":{"enum":["pending","confirmed","rejected","excluded"]},"snapshot_id":{"anyOf":[{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},{"type":"null"}]},"last_error_code":{"anyOf":[{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},{"type":"null"}]},"snapshot_confirmed_at":{"anyOf":[{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},{"type":"null"}]}},"required":["sede_id","state","snapshot_id","last_error_code","snapshot_confirmed_at"]},"maxItems":5,"minItems":1}},"required":["batch_id","lifecycle","outcome","groups_revision","catalog_version","source_enterprise_id","source_report_id","snapshot_captured_at","master_excel_sha256","sites"]},"BatchSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["BATCH_OPENED","BATCH_EXISTING","BATCH_STATUS","BATCH_CLOSED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"$ref":"#/definitions/Batch"},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"Confirmation":{"type":"object","additionalProperties":false,"properties":{"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"status":{"const":"confirmed"},"duplicate":{"type":"boolean"},"snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"snapshot_confirmed_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"stock_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"stock_rows":{"type":"integer","minimum":0,"maximum":2147483647},"incidents_processed":{"type":"integer","minimum":0,"maximum":2147483647},"groups_materialized":{"type":"integer","minimum":0,"maximum":2147483647},"groups_changed":{"type":"integer","minimum":0,"maximum":2147483647},"pending_recounts_linked":{"type":"integer","minimum":0,"maximum":2147483647},"movement_intervals_added":{"type":"integer","minimum":0,"maximum":2147483647},"physical_counts_created":{"const":0},"auto_resolved_recounts":{"const":0},"operational_revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["batch_id","sede_id","snapshot_id","status","duplicate","snapshot_captured_at","snapshot_confirmed_at","stock_expires_at","catalog_version","stock_rows","incidents_processed","groups_materialized","groups_changed","pending_recounts_linked","movement_intervals_added","physical_counts_created","auto_resolved_recounts","operational_revision"]},"SnapshotSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["SNAPSHOT_CONFIRMED","SNAPSHOT_ALREADY_CONFIRMED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"status":{"const":"confirmed"},"duplicate":{"type":"boolean"},"snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"snapshot_confirmed_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"stock_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"stock_rows":{"type":"integer","minimum":0,"maximum":2147483647},"incidents_processed":{"type":"integer","minimum":0,"maximum":2147483647},"groups_materialized":{"type":"integer","minimum":0,"maximum":2147483647},"groups_changed":{"type":"integer","minimum":0,"maximum":2147483647},"pending_recounts_linked":{"type":"integer","minimum":0,"maximum":2147483647},"movement_intervals_added":{"type":"integer","minimum":0,"maximum":2147483647},"physical_counts_created":{"const":0},"auto_resolved_recounts":{"const":0},"operational_revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["batch_id","sede_id","snapshot_id","status","duplicate","snapshot_captured_at","snapshot_confirmed_at","stock_expires_at","catalog_version","stock_rows","incidents_processed","groups_materialized","groups_changed","pending_recounts_linked","movement_intervals_added","physical_counts_created","auto_resolved_recounts","operational_revision"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"SnapshotStatusSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["SNAPSHOT_STATUS"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"status":{"enum":["not_found","rejected","confirmed","excluded"]},"confirmation":{"anyOf":[{"$ref":"#/definitions/Confirmation"},{"type":"null"}]},"last_error_code":{"anyOf":[{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},{"type":"null"}]}},"required":["batch_id","sede_id","status","confirmation","last_error_code"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"Incident":{"oneOf":[{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"producto_nuevo"},"datos":{"type":"object","additionalProperties":false,"properties":{"producto":{"type":"string","minLength":1,"maxLength":512},"c_barras":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"precio":{"type":"number","minimum":0},"stock":{"type":"integer","minimum":-2147483648,"maximum":2147483647}},"required":["producto","c_barras","precio","stock"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"producto_ausente"},"datos":{"type":"object","additionalProperties":false,"properties":{"producto":{"type":"string","minLength":1,"maxLength":512}},"required":["producto"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"nombre_modificado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"string","minLength":1,"maxLength":512},"nuevo":{"type":"string","minLength":0,"maxLength":512}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"precio_modificado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"number"},"nuevo":{"type":"number"}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"codigo_barras_modificado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"string","minLength":1,"maxLength":256},"nuevo":{"type":"string","minLength":1,"maxLength":256}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"codigo_barras_agregado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"null"},"nuevo":{"type":"string","minLength":1,"maxLength":256}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"codigo_barras_eliminado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"string","minLength":1,"maxLength":256},"nuevo":{"type":"null"}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"null"},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"codigo_interno_invalido"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"producto":{"anyOf":[{"type":"string","minLength":1,"maxLength":512},{"type":"null"}]}},"required":["fila","producto"]}},"required":["c_interno","tipo","datos"]}]},"SnapshotPayload":{"type":"object","additionalProperties":false,"properties":{"contract_version":{"const":2},"snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"capturado_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"version_catalogo":{"type":"integer","minimum":1,"maximum":2147483647},"excel_hash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"stock":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"stock":{"type":"integer","minimum":-2147483648,"maximum":2147483647,"not":{"const":0}}},"required":["c_interno","stock"]},"maxItems":10000,"minItems":0},"eliminados":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"motivo":{"const":"producto_ausente"}},"required":["c_interno","motivo"]},"maxItems":10000,"minItems":0},"incidencias":{"type":"array","items":{"$ref":"#/definitions/Incident"},"maxItems":20000,"minItems":0},"resumen":{"type":"object","additionalProperties":false,"properties":{"sku_total_excel":{"type":"integer","minimum":0,"maximum":1000000},"sku_catalogo":{"type":"integer","minimum":0,"maximum":1000000},"sku_excluidos":{"type":"integer","minimum":0,"maximum":1000000},"sku_validos":{"type":"integer","minimum":0,"maximum":1000000},"sku_stock_no_cero":{"type":"integer","minimum":0,"maximum":1000000},"sku_stock_cero":{"type":"integer","minimum":0,"maximum":1000000},"sku_eliminados":{"type":"integer","minimum":0,"maximum":1000000},"incidencias_total":{"type":"integer","minimum":0,"maximum":1000000}},"required":["sku_total_excel","sku_catalogo","sku_excluidos","sku_validos","sku_stock_no_cero","sku_stock_cero","sku_eliminados","incidencias_total"]}},"required":["contract_version","snapshot_id","capturado_at","version_catalogo","excel_hash","stock","eliminados","incidencias","resumen"]},"FullRequest":{"oneOf":[{"type":"object","additionalProperties":false,"properties":{"action":{"const":"bootstrap"}},"required":["action"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"catalog_confirm"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"catalog_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["action","operation_id","catalog_version","catalog_sha256"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_open"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"source_enterprise_id":{"type":"string","minLength":1,"maxLength":80},"source_report_id":{"type":"string","minLength":1,"maxLength":80},"report_created_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"report_finished_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"downloaded_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"master_excel_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"catalog_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["action","operation_id","batch_id","source_enterprise_id","source_report_id","report_created_at","report_finished_at","downloaded_at","master_excel_sha256","catalog_version","catalog_sha256"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"snapshot_submit"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"payload":{"$ref":"#/definitions/SnapshotPayload"}},"required":["action","batch_id","sede_id","payload"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"snapshot_status"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}}},"required":["action","batch_id","sede_id"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_status"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}}},"required":["action","batch_id"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_close"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"excluded_sites":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"reason_code":{"enum":["WAREHOUSE_MISSING","LOCAL_STOCK_INVALID","LOCAL_VALIDATION_FAILED","ABANDONED_AFTER_RECONCILIATION"]},"message":{"type":"string","minLength":1,"maxLength":1024}},"required":["sede_id","reason_code","message"]},"maxItems":5,"minItems":0}},"required":["action","operation_id","batch_id","excluded_sites"]}]},"Request_bootstrap":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"bootstrap"}},"required":["action"]},"Request_catalog_confirm":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"catalog_confirm"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"catalog_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["action","operation_id","catalog_version","catalog_sha256"]},"Request_batch_open":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_open"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"source_enterprise_id":{"type":"string","minLength":1,"maxLength":80},"source_report_id":{"type":"string","minLength":1,"maxLength":80},"report_created_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"report_finished_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"downloaded_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"master_excel_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"catalog_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["action","operation_id","batch_id","source_enterprise_id","source_report_id","report_created_at","report_finished_at","downloaded_at","master_excel_sha256","catalog_version","catalog_sha256"]},"Request_snapshot_submit":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"snapshot_submit"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"payload":{"$ref":"#/definitions/SnapshotPayload"}},"required":["action","batch_id","sede_id","payload"]},"Request_snapshot_status":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"snapshot_status"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}}},"required":["action","batch_id","sede_id"]},"Request_batch_status":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_status"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}}},"required":["action","batch_id"]},"Request_batch_close":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_close"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"excluded_sites":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"reason_code":{"enum":["WAREHOUSE_MISSING","LOCAL_STOCK_INVALID","LOCAL_VALIDATION_FAILED","ABANDONED_AFTER_RECONCILIATION"]},"message":{"type":"string","minLength":1,"maxLength":1024}},"required":["sede_id","reason_code","message"]},"maxItems":5,"minItems":0}},"required":["action","operation_id","batch_id","excluded_sites"]},"CatalogQuery":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"catalog"},"version":{"type":"integer","minimum":1,"maximum":2147483647}},"required":["action","version"]},"CashierBootstrapRequest":{"type":"object","additionalProperties":false,"properties":{"p_payload":{"type":"object","additionalProperties":false,"properties":{"device_token":{"type":"string","minLength":32,"maxLength":512}},"required":["device_token"]}},"required":["p_payload"]},"NormalObservation":{"type":"object","additionalProperties":false,"properties":{"client_observation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"grupo_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"stock_fisico":{"type":"integer","minimum":0,"maximum":2147483647},"contado_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"motivo_diferencia":{"anyOf":[{"enum":["Transferencia","Venta por mayor","Dañado","Vencido","Otro motivo"]},{"type":"null"}]},"observacion_diferencia":{"anyOf":[{"type":"string","minLength":3,"maxLength":1024},{"type":"null"}]}},"required":["client_observation_id","grupo_id","stock_fisico","contado_at","motivo_diferencia","observacion_diferencia"]},"RecountObservation":{"type":"object","additionalProperties":false,"properties":{"client_observation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"detalle_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"stock_fisico":{"type":"integer","minimum":0,"maximum":2147483647},"contado_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"motivo_diferencia":{"anyOf":[{"enum":["Transferencia","Venta por mayor","Dañado","Vencido","Otro motivo"]},{"type":"null"}]},"observacion_reconteo":{"anyOf":[{"type":"string","minLength":3,"maxLength":1024},{"type":"null"}]}},"required":["client_observation_id","detalle_id","stock_fisico","contado_at","motivo_diferencia","observacion_reconteo"]},"CashierMutationRequest":{"oneOf":[{"type":"object","additionalProperties":false,"properties":{"p_action":{"const":"start"},"p_payload":{"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"device_token":{"type":"string","minLength":32,"maxLength":512}},"required":["operation_id","device_token"]}},"required":["p_action","p_payload"]},{"type":"object","additionalProperties":false,"properties":{"p_action":{"const":"save_batch"},"p_payload":{"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"device_token":{"type":"string","minLength":32,"maxLength":512},"session_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"expected_groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"items":{"type":"array","items":{"$ref":"#/definitions/NormalObservation"},"maxItems":500,"minItems":1}},"required":["operation_id","device_token","session_id","expected_groups_revision","items"]}},"required":["p_action","p_payload"]},{"type":"object","additionalProperties":false,"properties":{"p_action":{"const":"recount_save_batch"},"p_payload":{"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"device_token":{"type":"string","minLength":32,"maxLength":512},"session_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"expected_groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"items":{"type":"array","items":{"$ref":"#/definitions/RecountObservation"},"maxItems":500,"minItems":1}},"required":["operation_id","device_token","session_id","expected_groups_revision","items"]}},"required":["p_action","p_payload"]},{"type":"object","additionalProperties":false,"properties":{"p_action":{"const":"finish"},"p_payload":{"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"device_token":{"type":"string","minLength":32,"maxLength":512},"session_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"expected_groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"delivery_manifest":{"type":"object","additionalProperties":false,"properties":{"observation_ids":{"type":"array","items":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"maxItems":10000,"minItems":0},"client_queue_empty":{"const":true}},"required":["observation_ids","client_queue_empty"]}},"required":["operation_id","device_token","session_id","expected_groups_revision","delivery_manifest"]}},"required":["p_action","p_payload"]}]},"Stock":{"type":"object","additionalProperties":false,"properties":{"snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"snapshot_confirmed_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"stock_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"is_fresh":{"type":"boolean"},"is_fallback":{"type":"boolean"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["snapshot_id","snapshot_captured_at","snapshot_confirmed_at","stock_expires_at","is_fresh","is_fallback","catalog_version","groups_revision"]},"Session":{"type":"object","additionalProperties":false,"properties":{"session_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"status":{"enum":["active","recovery","finished","expired"]},"session_started_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"reference_snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"reference_snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"reference_stock_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"capture_interval_number":{"enum":[1,2]},"capture_interval_starts_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"capture_interval_ends_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"session_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"pending_delivery_until":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"capture_allowed":{"type":"boolean"},"pending_delivery_allowed":{"type":"boolean"},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["session_id","status","session_started_at","reference_snapshot_id","reference_snapshot_captured_at","reference_stock_expires_at","capture_interval_number","capture_interval_starts_at","capture_interval_ends_at","session_expires_at","pending_delivery_until","capture_allowed","pending_delivery_allowed","groups_revision"]},"Shift":{"type":"object","additionalProperties":false,"properties":{"id":{"enum":["early","day","night"]},"label":{"enum":["shift_1","shift_2","shift_3"]},"starts_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"ends_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"}},"required":["id","label","starts_at","ends_at"]},"Capabilities":{"type":"object","additionalProperties":false,"properties":{"can_start_session":{"type":"boolean"},"can_capture_in_current_session":{"type":"boolean"},"block_reason":{"anyOf":[{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},{"type":"null"}]}},"required":["can_start_session","can_capture_in_current_session","block_reason"]},"RuntimeGroup":{"type":"object","additionalProperties":false,"properties":{"group_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"group_name":{"type":"string","minLength":1,"maxLength":512},"category_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"category_name":{"type":"string","minLength":1,"maxLength":256},"reference_snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"stock_theoretical":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},"member_codes":{"type":"array","items":{"type":"integer","minimum":20001,"maximum":2147483647},"maxItems":10000,"minItems":0},"price":{"type":"number","minimum":0},"units_per_package":{"anyOf":[{"type":"integer","minimum":2,"maximum":2147483647},{"type":"null"}]},"package_price":{"anyOf":[{"type":"number","exclusiveMinimum":0},{"type":"null"}]},"action":{"enum":["coverage","daily","recount","none"]},"priority_class":{"enum":["round_coverage","review_for_coverage","review_regular","shift_coverage","none"]},"recount_detail_id":{"anyOf":[{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},{"type":"null"}]}},"required":["group_id","group_name","category_id","category_name","reference_snapshot_id","groups_revision","stock_theoretical","member_codes","price","units_per_package","package_price","action","priority_class","recount_detail_id"]},"CashierBootstrapSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["CASHIER_STATE"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"timezone":{"const":"America/Lima"},"stock":{"anyOf":[{"$ref":"#/definitions/Stock"},{"type":"null"}]},"session":{"anyOf":[{"$ref":"#/definitions/Session"},{"type":"null"}]},"recovery_sessions":{"type":"array","items":{"$ref":"#/definitions/Session"},"maxItems":100,"minItems":0},"shift":{"$ref":"#/definitions/Shift"},"capabilities":{"$ref":"#/definitions/Capabilities"},"groups":{"type":"array","items":{"$ref":"#/definitions/RuntimeGroup"},"maxItems":10000,"minItems":0}},"required":["timezone","stock","session","recovery_sessions","shift","capabilities","groups"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"CashierMutationSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["SESSION_STARTED","OBSERVATIONS_CONFIRMED","SESSION_FINISHED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"action":{"enum":["start","save_batch","recount_save_batch","finish"]},"replay":{"type":"boolean"},"session":{"$ref":"#/definitions/Session"},"affected_groups":{"type":"array","items":{"$ref":"#/definitions/RuntimeGroup"},"maxItems":10000,"minItems":0},"observation_results":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"client_observation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"detail_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"state":{"enum":["Coincide","Recontar","Confirmada","Inconsistente","Inválido"]},"difference":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},"replay":{"type":"boolean"}},"required":["client_observation_id","detail_id","state","difference","replay"]},"maxItems":500,"minItems":0}},"required":["action","replay","session","affected_groups","observation_results"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"FullSuccess":{"oneOf":[{"$ref":"#/definitions/BootstrapSuccess"},{"$ref":"#/definitions/CatalogConfirmSuccess"},{"$ref":"#/definitions/BatchSuccess"},{"$ref":"#/definitions/SnapshotSuccess"},{"$ref":"#/definitions/SnapshotStatusSuccess"}]},"FullResponse":{"oneOf":[{"$ref":"#/definitions/FullSuccess"},{"$ref":"#/definitions/Failure"}]},"CashierResponse":{"oneOf":[{"$ref":"#/definitions/CashierBootstrapSuccess"},{"$ref":"#/definitions/CashierMutationSuccess"},{"$ref":"#/definitions/Failure"}]}}}'::jsonb);
INSERT INTO inventario.full_contracts VALUES('cashier_mutate','{"$schema":"http://json-schema.org/draft-07/schema#","$ref":"#/definitions/CashierMutationRequest","definitions":{"UUID":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"Hash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"Timestamp":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"UtcTimestamp":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"ErrorItem":{"type":"object","additionalProperties":false,"properties":{"code":{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},"message":{"type":"string","minLength":1,"maxLength":1024},"field_path":{"type":"string","minLength":0,"maxLength":256},"c_interno":{"anyOf":[{"type":"integer","minimum":20001,"maximum":2147483647},{"type":"null"}]},"source_row":{"anyOf":[{"type":"integer","minimum":1,"maximum":2147483647},{"type":"null"}]}},"required":["code","message","field_path"]},"Failure":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":false},"code":{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"type":"boolean"},"action_required":{"enum":["none","retry_same_operation","reconcile","refresh_credentials","new_capture","refresh_catalog","fix_payload","manual_review","wait"]},"data":{"anyOf":[{"type":"object"},{"type":"null"}]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":100,"minItems":1},"errors_total":{"type":"integer","minimum":1,"maximum":2147483647},"errors_truncated":{"type":"boolean"}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors","errors_total","errors_truncated"]},"Catalog":{"type":"object","additionalProperties":false,"properties":{"version":{"type":"integer","minimum":1,"maximum":2147483647},"schema_version":{"const":2},"sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"size_bytes":{"type":"integer","minimum":1,"maximum":2147483647},"confirmed":{"type":"boolean"}},"required":["version","schema_version","sha256","size_bytes","confirmed"]},"AllowedSite":{"type":"object","additionalProperties":false,"properties":{"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_name":{"type":"string","minLength":1,"maxLength":128},"warehouse":{"enum":["ALMCASUARINAS","ALMDIVINO","ALMHUACACHINA","ALMCUTERVO","ALMUNIDAD"]},"latest_snapshot_id":{"anyOf":[{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},{"type":"null"}]},"latest_snapshot_captured_at":{"anyOf":[{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},{"type":"null"}]},"stock_expires_at":{"anyOf":[{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},{"type":"null"}]}},"required":["sede_id","sede_name","warehouse","latest_snapshot_id","latest_snapshot_captured_at","stock_expires_at"]},"Policy":{"type":"object","additionalProperties":false,"properties":{"contract_version":{"const":1},"snapshot_contract_version":{"const":2},"timezone":{"const":"America/Lima"},"recommended_capture_interval_seconds":{"const":3600},"minimum_capture_interval_seconds":{"const":0},"stock_validity_seconds":{"const":7200},"session_capture_interval_seconds":{"const":3600},"max_capture_intervals_per_snapshot":{"const":2},"pending_delivery_seconds":{"const":7200},"observation_future_tolerance_seconds":{"const":30},"movement_max_intervals":{"const":20},"movement_min_valid_intervals":{"const":3},"movement_max_age_seconds":{"const":604800},"raw_interval_retention_days":{"const":45},"max_body_bytes":{"const":4194304},"max_sku_entries":{"const":10000},"max_incidents":{"const":20000},"max_batch_items":{"const":500},"max_response_errors":{"const":100},"max_string_length":{"const":1024},"automatic_retry_attempts":{"const":3},"retry_delays_seconds":{"const":[2,5,15]},"retry_jitter_fraction":{"const":0.2},"rate_limit_requests_per_installation_per_minute":{"const":120},"db_lock_timeout_ms":{"const":5000},"db_statement_timeout_ms":{"const":25000},"http_client_timeout_ms":{"const":60000},"shifts_local":{"const":[{"id":"early","label":"shift_1","start":"00:00","end":"08:00"},{"id":"day","label":"shift_2","start":"08:00","end":"16:00"},{"id":"night","label":"shift_3","start":"16:00","end":"24:00"}]},"retention_capacity_gate":{"const":"must_pass_before_activation"},"kill_switches":{"type":"object","additionalProperties":false,"properties":{"full_new_ingestion":{"type":"boolean"},"solog_new_sessions":{"type":"boolean"}},"required":["full_new_ingestion","solog_new_sessions"]},"strict_unknown_properties":{"const":true},"fingerprint_version":{"const":1}},"required":["contract_version","snapshot_contract_version","timezone","recommended_capture_interval_seconds","minimum_capture_interval_seconds","stock_validity_seconds","session_capture_interval_seconds","max_capture_intervals_per_snapshot","pending_delivery_seconds","observation_future_tolerance_seconds","movement_max_intervals","movement_min_valid_intervals","movement_max_age_seconds","raw_interval_retention_days","max_body_bytes","max_sku_entries","max_incidents","max_batch_items","max_response_errors","max_string_length","automatic_retry_attempts","retry_delays_seconds","retry_jitter_fraction","rate_limit_requests_per_installation_per_minute","db_lock_timeout_ms","db_statement_timeout_ms","http_client_timeout_ms","shifts_local","retention_capacity_gate","kill_switches","strict_unknown_properties","fingerprint_version"]},"BootstrapSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["BOOTSTRAP_READY"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"installation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"scope":{"const":"full"},"allowed_sites":{"type":"array","items":{"$ref":"#/definitions/AllowedSite"},"maxItems":5,"minItems":1},"catalog":{"$ref":"#/definitions/Catalog"},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"policy":{"$ref":"#/definitions/Policy"}},"required":["installation_id","scope","allowed_sites","catalog","groups_revision","policy"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"CatalogConfirmSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["CATALOG_CONFIRMED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"$ref":"#/definitions/Catalog"},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"Batch":{"type":"object","additionalProperties":false,"properties":{"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"lifecycle":{"enum":["open","closed"]},"outcome":{"enum":["pending","completed","partial","failed"]},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"source_enterprise_id":{"type":"string","minLength":1,"maxLength":80},"source_report_id":{"type":"string","minLength":1,"maxLength":80},"snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"master_excel_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"sites":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"state":{"enum":["pending","confirmed","rejected","excluded"]},"snapshot_id":{"anyOf":[{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},{"type":"null"}]},"last_error_code":{"anyOf":[{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},{"type":"null"}]},"snapshot_confirmed_at":{"anyOf":[{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},{"type":"null"}]}},"required":["sede_id","state","snapshot_id","last_error_code","snapshot_confirmed_at"]},"maxItems":5,"minItems":1}},"required":["batch_id","lifecycle","outcome","groups_revision","catalog_version","source_enterprise_id","source_report_id","snapshot_captured_at","master_excel_sha256","sites"]},"BatchSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["BATCH_OPENED","BATCH_EXISTING","BATCH_STATUS","BATCH_CLOSED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"$ref":"#/definitions/Batch"},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"Confirmation":{"type":"object","additionalProperties":false,"properties":{"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"status":{"const":"confirmed"},"duplicate":{"type":"boolean"},"snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"snapshot_confirmed_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"stock_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"stock_rows":{"type":"integer","minimum":0,"maximum":2147483647},"incidents_processed":{"type":"integer","minimum":0,"maximum":2147483647},"groups_materialized":{"type":"integer","minimum":0,"maximum":2147483647},"groups_changed":{"type":"integer","minimum":0,"maximum":2147483647},"pending_recounts_linked":{"type":"integer","minimum":0,"maximum":2147483647},"movement_intervals_added":{"type":"integer","minimum":0,"maximum":2147483647},"physical_counts_created":{"const":0},"auto_resolved_recounts":{"const":0},"operational_revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["batch_id","sede_id","snapshot_id","status","duplicate","snapshot_captured_at","snapshot_confirmed_at","stock_expires_at","catalog_version","stock_rows","incidents_processed","groups_materialized","groups_changed","pending_recounts_linked","movement_intervals_added","physical_counts_created","auto_resolved_recounts","operational_revision"]},"SnapshotSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["SNAPSHOT_CONFIRMED","SNAPSHOT_ALREADY_CONFIRMED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"status":{"const":"confirmed"},"duplicate":{"type":"boolean"},"snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"snapshot_confirmed_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"stock_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"stock_rows":{"type":"integer","minimum":0,"maximum":2147483647},"incidents_processed":{"type":"integer","minimum":0,"maximum":2147483647},"groups_materialized":{"type":"integer","minimum":0,"maximum":2147483647},"groups_changed":{"type":"integer","minimum":0,"maximum":2147483647},"pending_recounts_linked":{"type":"integer","minimum":0,"maximum":2147483647},"movement_intervals_added":{"type":"integer","minimum":0,"maximum":2147483647},"physical_counts_created":{"const":0},"auto_resolved_recounts":{"const":0},"operational_revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["batch_id","sede_id","snapshot_id","status","duplicate","snapshot_captured_at","snapshot_confirmed_at","stock_expires_at","catalog_version","stock_rows","incidents_processed","groups_materialized","groups_changed","pending_recounts_linked","movement_intervals_added","physical_counts_created","auto_resolved_recounts","operational_revision"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"SnapshotStatusSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["SNAPSHOT_STATUS"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"status":{"enum":["not_found","rejected","confirmed","excluded"]},"confirmation":{"anyOf":[{"$ref":"#/definitions/Confirmation"},{"type":"null"}]},"last_error_code":{"anyOf":[{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},{"type":"null"}]}},"required":["batch_id","sede_id","status","confirmation","last_error_code"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"Incident":{"oneOf":[{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"producto_nuevo"},"datos":{"type":"object","additionalProperties":false,"properties":{"producto":{"type":"string","minLength":1,"maxLength":512},"c_barras":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"precio":{"type":"number","minimum":0},"stock":{"type":"integer","minimum":-2147483648,"maximum":2147483647}},"required":["producto","c_barras","precio","stock"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"producto_ausente"},"datos":{"type":"object","additionalProperties":false,"properties":{"producto":{"type":"string","minLength":1,"maxLength":512}},"required":["producto"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"nombre_modificado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"string","minLength":1,"maxLength":512},"nuevo":{"type":"string","minLength":0,"maxLength":512}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"precio_modificado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"number"},"nuevo":{"type":"number"}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"codigo_barras_modificado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"string","minLength":1,"maxLength":256},"nuevo":{"type":"string","minLength":1,"maxLength":256}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"codigo_barras_agregado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"null"},"nuevo":{"type":"string","minLength":1,"maxLength":256}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"codigo_barras_eliminado"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"anterior":{"type":"string","minLength":1,"maxLength":256},"nuevo":{"type":"null"}},"required":["fila","anterior","nuevo"]}},"required":["c_interno","tipo","datos"]},{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"null"},"c_interno_original":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"tipo":{"const":"codigo_interno_invalido"},"datos":{"type":"object","additionalProperties":false,"properties":{"fila":{"type":"integer","minimum":1,"maximum":2147483647},"producto":{"anyOf":[{"type":"string","minLength":1,"maxLength":512},{"type":"null"}]}},"required":["fila","producto"]}},"required":["c_interno","tipo","datos"]}]},"SnapshotPayload":{"type":"object","additionalProperties":false,"properties":{"contract_version":{"const":2},"snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"capturado_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"version_catalogo":{"type":"integer","minimum":1,"maximum":2147483647},"excel_hash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"stock":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"stock":{"type":"integer","minimum":-2147483648,"maximum":2147483647,"not":{"const":0}}},"required":["c_interno","stock"]},"maxItems":10000,"minItems":0},"eliminados":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"c_interno":{"type":"integer","minimum":20001,"maximum":2147483647},"motivo":{"const":"producto_ausente"}},"required":["c_interno","motivo"]},"maxItems":10000,"minItems":0},"incidencias":{"type":"array","items":{"$ref":"#/definitions/Incident"},"maxItems":20000,"minItems":0},"resumen":{"type":"object","additionalProperties":false,"properties":{"sku_total_excel":{"type":"integer","minimum":0,"maximum":1000000},"sku_catalogo":{"type":"integer","minimum":0,"maximum":1000000},"sku_excluidos":{"type":"integer","minimum":0,"maximum":1000000},"sku_validos":{"type":"integer","minimum":0,"maximum":1000000},"sku_stock_no_cero":{"type":"integer","minimum":0,"maximum":1000000},"sku_stock_cero":{"type":"integer","minimum":0,"maximum":1000000},"sku_eliminados":{"type":"integer","minimum":0,"maximum":1000000},"incidencias_total":{"type":"integer","minimum":0,"maximum":1000000}},"required":["sku_total_excel","sku_catalogo","sku_excluidos","sku_validos","sku_stock_no_cero","sku_stock_cero","sku_eliminados","incidencias_total"]}},"required":["contract_version","snapshot_id","capturado_at","version_catalogo","excel_hash","stock","eliminados","incidencias","resumen"]},"FullRequest":{"oneOf":[{"type":"object","additionalProperties":false,"properties":{"action":{"const":"bootstrap"}},"required":["action"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"catalog_confirm"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"catalog_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["action","operation_id","catalog_version","catalog_sha256"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_open"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"source_enterprise_id":{"type":"string","minLength":1,"maxLength":80},"source_report_id":{"type":"string","minLength":1,"maxLength":80},"report_created_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"report_finished_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"downloaded_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"master_excel_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"catalog_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["action","operation_id","batch_id","source_enterprise_id","source_report_id","report_created_at","report_finished_at","downloaded_at","master_excel_sha256","catalog_version","catalog_sha256"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"snapshot_submit"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"payload":{"$ref":"#/definitions/SnapshotPayload"}},"required":["action","batch_id","sede_id","payload"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"snapshot_status"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}}},"required":["action","batch_id","sede_id"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_status"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}}},"required":["action","batch_id"]},{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_close"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"excluded_sites":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"reason_code":{"enum":["WAREHOUSE_MISSING","LOCAL_STOCK_INVALID","LOCAL_VALIDATION_FAILED","ABANDONED_AFTER_RECONCILIATION"]},"message":{"type":"string","minLength":1,"maxLength":1024}},"required":["sede_id","reason_code","message"]},"maxItems":5,"minItems":0}},"required":["action","operation_id","batch_id","excluded_sites"]}]},"Request_bootstrap":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"bootstrap"}},"required":["action"]},"Request_catalog_confirm":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"catalog_confirm"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"catalog_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["action","operation_id","catalog_version","catalog_sha256"]},"Request_batch_open":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_open"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"source_enterprise_id":{"type":"string","minLength":1,"maxLength":80},"source_report_id":{"type":"string","minLength":1,"maxLength":80},"report_created_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"report_finished_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"downloaded_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"master_excel_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"catalog_sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}},"required":["action","operation_id","batch_id","source_enterprise_id","source_report_id","report_created_at","report_finished_at","downloaded_at","master_excel_sha256","catalog_version","catalog_sha256"]},"Request_snapshot_submit":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"snapshot_submit"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"payload":{"$ref":"#/definitions/SnapshotPayload"}},"required":["action","batch_id","sede_id","payload"]},"Request_snapshot_status":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"snapshot_status"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}}},"required":["action","batch_id","sede_id"]},"Request_batch_status":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_status"},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}}},"required":["action","batch_id"]},"Request_batch_close":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"batch_close"},"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"batch_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"excluded_sites":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"sede_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"reason_code":{"enum":["WAREHOUSE_MISSING","LOCAL_STOCK_INVALID","LOCAL_VALIDATION_FAILED","ABANDONED_AFTER_RECONCILIATION"]},"message":{"type":"string","minLength":1,"maxLength":1024}},"required":["sede_id","reason_code","message"]},"maxItems":5,"minItems":0}},"required":["action","operation_id","batch_id","excluded_sites"]},"CatalogQuery":{"type":"object","additionalProperties":false,"properties":{"action":{"const":"catalog"},"version":{"type":"integer","minimum":1,"maximum":2147483647}},"required":["action","version"]},"CashierBootstrapRequest":{"type":"object","additionalProperties":false,"properties":{"p_payload":{"type":"object","additionalProperties":false,"properties":{"device_token":{"type":"string","minLength":32,"maxLength":512}},"required":["device_token"]}},"required":["p_payload"]},"NormalObservation":{"type":"object","additionalProperties":false,"properties":{"client_observation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"grupo_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"stock_fisico":{"type":"integer","minimum":0,"maximum":2147483647},"contado_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"motivo_diferencia":{"anyOf":[{"enum":["Transferencia","Venta por mayor","Dañado","Vencido","Otro motivo"]},{"type":"null"}]},"observacion_diferencia":{"anyOf":[{"type":"string","minLength":3,"maxLength":1024},{"type":"null"}]}},"required":["client_observation_id","grupo_id","stock_fisico","contado_at","motivo_diferencia","observacion_diferencia"]},"RecountObservation":{"type":"object","additionalProperties":false,"properties":{"client_observation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"detalle_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"stock_fisico":{"type":"integer","minimum":0,"maximum":2147483647},"contado_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?(Z|[+-]\\d{2}:\\d{2})$"},"motivo_diferencia":{"anyOf":[{"enum":["Transferencia","Venta por mayor","Dañado","Vencido","Otro motivo"]},{"type":"null"}]},"observacion_reconteo":{"anyOf":[{"type":"string","minLength":3,"maxLength":1024},{"type":"null"}]}},"required":["client_observation_id","detalle_id","stock_fisico","contado_at","motivo_diferencia","observacion_reconteo"]},"CashierMutationRequest":{"oneOf":[{"type":"object","additionalProperties":false,"properties":{"p_action":{"const":"start"},"p_payload":{"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"device_token":{"type":"string","minLength":32,"maxLength":512}},"required":["operation_id","device_token"]}},"required":["p_action","p_payload"]},{"type":"object","additionalProperties":false,"properties":{"p_action":{"const":"save_batch"},"p_payload":{"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"device_token":{"type":"string","minLength":32,"maxLength":512},"session_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"expected_groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"items":{"type":"array","items":{"$ref":"#/definitions/NormalObservation"},"maxItems":500,"minItems":1}},"required":["operation_id","device_token","session_id","expected_groups_revision","items"]}},"required":["p_action","p_payload"]},{"type":"object","additionalProperties":false,"properties":{"p_action":{"const":"recount_save_batch"},"p_payload":{"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"device_token":{"type":"string","minLength":32,"maxLength":512},"session_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"expected_groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"items":{"type":"array","items":{"$ref":"#/definitions/RecountObservation"},"maxItems":500,"minItems":1}},"required":["operation_id","device_token","session_id","expected_groups_revision","items"]}},"required":["p_action","p_payload"]},{"type":"object","additionalProperties":false,"properties":{"p_action":{"const":"finish"},"p_payload":{"type":"object","additionalProperties":false,"properties":{"operation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"device_token":{"type":"string","minLength":32,"maxLength":512},"session_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"expected_groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"delivery_manifest":{"type":"object","additionalProperties":false,"properties":{"observation_ids":{"type":"array","items":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"maxItems":10000,"minItems":0},"client_queue_empty":{"const":true}},"required":["observation_ids","client_queue_empty"]}},"required":["operation_id","device_token","session_id","expected_groups_revision","delivery_manifest"]}},"required":["p_action","p_payload"]}]},"Stock":{"type":"object","additionalProperties":false,"properties":{"snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"snapshot_confirmed_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"stock_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"is_fresh":{"type":"boolean"},"is_fallback":{"type":"boolean"},"catalog_version":{"type":"integer","minimum":1,"maximum":2147483647},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["snapshot_id","snapshot_captured_at","snapshot_confirmed_at","stock_expires_at","is_fresh","is_fallback","catalog_version","groups_revision"]},"Session":{"type":"object","additionalProperties":false,"properties":{"session_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"status":{"enum":["active","recovery","finished","expired"]},"session_started_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"reference_snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"reference_snapshot_captured_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"reference_stock_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"capture_interval_number":{"enum":[1,2]},"capture_interval_starts_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"capture_interval_ends_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"session_expires_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"pending_delivery_until":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"capture_allowed":{"type":"boolean"},"pending_delivery_allowed":{"type":"boolean"},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["session_id","status","session_started_at","reference_snapshot_id","reference_snapshot_captured_at","reference_stock_expires_at","capture_interval_number","capture_interval_starts_at","capture_interval_ends_at","session_expires_at","pending_delivery_until","capture_allowed","pending_delivery_allowed","groups_revision"]},"Shift":{"type":"object","additionalProperties":false,"properties":{"id":{"enum":["early","day","night"]},"label":{"enum":["shift_1","shift_2","shift_3"]},"starts_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"ends_at":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"}},"required":["id","label","starts_at","ends_at"]},"Capabilities":{"type":"object","additionalProperties":false,"properties":{"can_start_session":{"type":"boolean"},"can_capture_in_current_session":{"type":"boolean"},"block_reason":{"anyOf":[{"enum":["INVALID_JSON","INVALID_STRUCTURE","UNSUPPORTED_CONTRACT_VERSION","METHOD_NOT_ALLOWED","INVALID_CREDENTIALS","USER_UNAUTHORIZED","DEVICE_UNAUTHORIZED","INSTALLATION_DISABLED","FULL_SCOPE_REQUIRED","SEDE_NOT_ALLOWED","BATCH_NOT_FOUND","BATCH_STATE_CONFLICT","BATCH_CLOSED","IDEMPOTENCY_CONFLICT","SOURCE_REPORT_CONFLICT","CATALOG_MISMATCH","CATALOG_CHANGED","GROUP_STRUCTURE_CHANGED","OUT_OF_ORDER_SNAPSHOT","CAPTURE_TIME_COLLISION","SNAPSHOT_CAPTURE_TIME_IN_FUTURE","SNAPSHOT_TOO_OLD","PAYLOAD_TOO_LARGE","LIMIT_EXCEEDED","STOCK_UNRESOLVABLE","INVALID_SUMMARY","INVALID_SKU_ARRAY","INCIDENT_INVALID","RATE_LIMITED","TEMPORARILY_UNAVAILABLE","INTERNAL_ERROR","SNAPSHOT_REQUIRED","STOCK_EXPIRED","STRUCTURE_SNAPSHOT_REQUIRED","SESSION_ALREADY_ACTIVE","SESSION_NOT_FOUND","SESSION_CAPTURE_CLOSED","SESSION_DELIVERY_CLOSED","INVALID_OBSERVATION_TIME","RECOUNT_NOT_READY","RECOUNT_ALREADY_RESOLVED","OBSERVATION_ALREADY_RECORDED","PRIORITY_CONFLICT","NORMAL_COUNT_ALREADY_IN_SHIFT","INGESTION_PAUSED","NEW_SESSIONS_PAUSED","MANIFEST_NOT_CONFIRMED"]},{"type":"null"}]}},"required":["can_start_session","can_capture_in_current_session","block_reason"]},"RuntimeGroup":{"type":"object","additionalProperties":false,"properties":{"group_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"group_name":{"type":"string","minLength":1,"maxLength":512},"category_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"category_name":{"type":"string","minLength":1,"maxLength":256},"reference_snapshot_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"groups_revision":{"type":"integer","minimum":1,"maximum":9007199254740991},"stock_theoretical":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},"member_codes":{"type":"array","items":{"type":"integer","minimum":20001,"maximum":2147483647},"maxItems":10000,"minItems":0},"price":{"type":"number","minimum":0},"units_per_package":{"anyOf":[{"type":"integer","minimum":2,"maximum":2147483647},{"type":"null"}]},"package_price":{"anyOf":[{"type":"number","exclusiveMinimum":0},{"type":"null"}]},"action":{"enum":["coverage","daily","recount","none"]},"priority_class":{"enum":["round_coverage","review_for_coverage","review_regular","shift_coverage","none"]},"recount_detail_id":{"anyOf":[{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},{"type":"null"}]}},"required":["group_id","group_name","category_id","category_name","reference_snapshot_id","groups_revision","stock_theoretical","member_codes","price","units_per_package","package_price","action","priority_class","recount_detail_id"]},"CashierBootstrapSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["CASHIER_STATE"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"timezone":{"const":"America/Lima"},"stock":{"anyOf":[{"$ref":"#/definitions/Stock"},{"type":"null"}]},"session":{"anyOf":[{"$ref":"#/definitions/Session"},{"type":"null"}]},"recovery_sessions":{"type":"array","items":{"$ref":"#/definitions/Session"},"maxItems":100,"minItems":0},"shift":{"$ref":"#/definitions/Shift"},"capabilities":{"$ref":"#/definitions/Capabilities"},"groups":{"type":"array","items":{"$ref":"#/definitions/RuntimeGroup"},"maxItems":10000,"minItems":0}},"required":["timezone","stock","session","recovery_sessions","shift","capabilities","groups"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"CashierMutationSuccess":{"type":"object","additionalProperties":false,"properties":{"ok":{"const":true},"code":{"enum":["SESSION_STARTED","OBSERVATIONS_CONFIRMED","SESSION_FINISHED"]},"contract_version":{"const":1},"request_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"server_now":{"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z$"},"retryable":{"const":false},"action_required":{"const":"none"},"data":{"type":"object","additionalProperties":false,"properties":{"action":{"enum":["start","save_batch","recount_save_batch","finish"]},"replay":{"type":"boolean"},"session":{"$ref":"#/definitions/Session"},"affected_groups":{"type":"array","items":{"$ref":"#/definitions/RuntimeGroup"},"maxItems":10000,"minItems":0},"observation_results":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"client_observation_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"detail_id":{"type":"string","format":"uuid","not":{"const":"00000000-0000-0000-0000-000000000000"}},"state":{"enum":["Coincide","Recontar","Confirmada","Inconsistente","Inválido"]},"difference":{"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},"replay":{"type":"boolean"}},"required":["client_observation_id","detail_id","state","difference","replay"]},"maxItems":500,"minItems":0}},"required":["action","replay","session","affected_groups","observation_results"]},"errors":{"type":"array","items":{"$ref":"#/definitions/ErrorItem"},"maxItems":0,"minItems":0}},"required":["ok","code","contract_version","request_id","server_now","retryable","action_required","data","errors"]},"FullSuccess":{"oneOf":[{"$ref":"#/definitions/BootstrapSuccess"},{"$ref":"#/definitions/CatalogConfirmSuccess"},{"$ref":"#/definitions/BatchSuccess"},{"$ref":"#/definitions/SnapshotSuccess"},{"$ref":"#/definitions/SnapshotStatusSuccess"}]},"FullResponse":{"oneOf":[{"$ref":"#/definitions/FullSuccess"},{"$ref":"#/definitions/Failure"}]},"CashierResponse":{"oneOf":[{"$ref":"#/definitions/CashierBootstrapSuccess"},{"$ref":"#/definitions/CashierMutationSuccess"},{"$ref":"#/definitions/Failure"}]}}}'::jsonb);
CREATE OR REPLACE FUNCTION inventario.full_temporal_context_v1(p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS TABLE(periodo_desde date, periodo_hasta date, ronda smallint, ronda_desde timestamp with time zone, ronda_hasta timestamp with time zone, turno text, turno_desde timestamp with time zone, turno_hasta timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_local timestamp;
  v_date date;
  v_period_from date;
  v_period_to date;
  v_round2_from date;
  v_round smallint;
  v_round_from date;
  v_round_to_exclusive date;
  v_shift text;
  v_shift_from timestamp;
  v_shift_to timestamp;
begin
  if p_at is null then
    raise exception 'SOLOG_TEMPORAL_CONTEXT_AT_REQUIRED';
  end if;

  v_local := p_at at time zone 'America/Lima';
  v_date := v_local::date;
  v_period_from := inventario.solog_periodo_desde(p_at);
  v_period_to := inventario.solog_periodo_hasta(p_at);
  v_round2_from := v_period_from + ((v_period_to - v_period_from + 1) / 2);

  if v_date < v_round2_from then
    v_round := 1;
    v_round_from := v_period_from;
    v_round_to_exclusive := v_round2_from;
  else
    v_round := 2;
    v_round_from := v_round2_from;
    v_round_to_exclusive := v_period_to + 1;
  end if;

  if v_local::time < time '08:00' then
    v_shift := 'early';
    v_shift_from := v_date::timestamp;
    v_shift_to := v_date::timestamp + time '08:00';
  elsif v_local::time < time '16:00' then
    v_shift := 'day';
    v_shift_from := v_date::timestamp + time '08:00';
    v_shift_to := v_date::timestamp + time '16:00';
  else
    v_shift := 'night';
    v_shift_from := v_date::timestamp + time '16:00';
    v_shift_to := (v_date + 1)::timestamp;
  end if;

  return query
  select
    v_period_from,
    v_period_to,
    v_round,
    v_round_from::timestamp at time zone 'America/Lima',
    v_round_to_exclusive::timestamp at time zone 'America/Lima',
    v_shift,
    v_shift_from at time zone 'America/Lima',
    v_shift_to at time zone 'America/Lima';
end;
$function$;
CREATE OR REPLACE FUNCTION inventario.full_group_actions_v1(p_sede_id uuid, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS TABLE(grupo_conteo_id uuid, stock_actual integer, estado_stock text, ultima_observacion_fisica_at timestamp with time zone, ultimo_conteo_at timestamp with time zone, coverage_complete boolean, counted_in_shift boolean, pending_recount boolean, recount_actionable boolean, detalle_reconteo_id uuid, action text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with ctx as (
    select *
    from inventario.full_temporal_context_v1(p_at)
  ),
  base as (
    select
      esg.grupo_conteo_id,
      esg.stock_actual,
      esg.estado as estado_stock,
      esg.ultima_observacion_fisica_at,
      esg.ultimo_conteo_at,
      coalesce(
        esg.ultima_observacion_fisica_at >= ctx.ronda_desde
        and esg.ultima_observacion_fisica_at < ctx.ronda_hasta,
        false
      ) as coverage_complete,
      coalesce(
        esg.ultimo_conteo_at >= ctx.turno_desde
        and esg.ultimo_conteo_at < ctx.turno_hasta,
        false
      ) as counted_in_shift,
      (
        cd.id is not null
        and cd.estado_diferencia='Recontar'
        and cd.stock_reconteo is null
      ) as pending_recount,
      (
        cd.id is not null
        and cd.estado_diferencia='Recontar'
        and cd.stock_reconteo is null
        and cd.primer_snapshot_posterior_id is not null
      ) as recount_actionable,
      coalesce(
        cd.id is not null
        and cd.estado_diferencia='Inconsistente'
        and cd.recontado_at >= ctx.turno_desde
        and cd.recontado_at < ctx.turno_hasta,
        false
      ) as blocked_after_inconsistent,
      case
        when cd.id is not null
          and cd.estado_diferencia='Recontar'
          and cd.stock_reconteo is null
        then cd.id
        else null
      end as detalle_reconteo_id
    from inventario.estado_stock_grupo esg
    cross join ctx
    left join inventario.conteo_detalle cd
      on cd.id=esg.ultimo_conteo_detalle_id
    where esg.sede_id=p_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo
  )
  select
    b.grupo_conteo_id,
    b.stock_actual,
    b.estado_stock,
    b.ultima_observacion_fisica_at,
    b.ultimo_conteo_at,
    b.coverage_complete,
    b.counted_in_shift,
    b.pending_recount,
    b.recount_actionable,
    b.detalle_reconteo_id,
    case
      when b.recount_actionable then 'recount'
      when b.pending_recount then 'none'
      when b.blocked_after_inconsistent then 'none'
      when not b.coverage_complete and not b.counted_in_shift then 'coverage'
      when b.coverage_complete
        and b.estado_stock='Cambio_reciente'
        and not b.counted_in_shift
      then 'daily'
      else 'none'
    end as action
  from base b
$function$;
CREATE OR REPLACE FUNCTION inventario.solog_assert_normal_count_turn_v4()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_sede_id uuid;
  v_turn_from timestamptz;
  v_turn_to timestamptz;
begin
  select c.sede_id
    into v_sede_id
  from inventario.conteos c
  where c.id=new.conteo_id;

  if v_sede_id is null then
    raise exception 'SOLOG_COUNT_SESSION_REQUIRED';
  end if;

  select t.turno_desde,t.turno_hasta
    into v_turn_from,v_turn_to
  from inventario.full_context_for_session_v1(new.contado_at,new.conteo_id) t;

  if exists(
    select 1
    from inventario.conteo_detalle cd
    join inventario.conteos c
      on c.id=cd.conteo_id
    where c.sede_id=v_sede_id
      and cd.grupo_conteo_id=new.grupo_conteo_id
      and cd.estado_diferencia='Inconsistente'
      and cd.recontado_at>=v_turn_from
      and cd.recontado_at<v_turn_to
  ) then
    raise exception 'SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT';
  end if;

  if exists(
    select 1
    from inventario.conteo_detalle cd
    join inventario.conteos c
      on c.id=cd.conteo_id
    where c.sede_id=v_sede_id
      and cd.grupo_conteo_id=new.grupo_conteo_id
      and cd.contado_at>=v_turn_from
      and cd.contado_at<v_turn_to
  ) then
    raise exception 'SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT';
  end if;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION inventario.metrics_ronda_acreditar_v1(p_sede_id uuid, p_grupo_id uuid, p_observacion_id uuid, p_tipo_observacion text, p_fisico_at timestamp with time zone, p_codigos integer[])
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE ctx record; rd inventario.metrics_rondas%rowtype;
  ob inventario.metrics_ronda_obligaciones%rowtype;
  evt_turn text; evt_fp text;
BEGIN
 IF p_tipo_observacion NOT IN ('normal','recount')
    OR p_fisico_at IS NULL OR p_observacion_id IS NULL THEN
    RAISE EXCEPTION 'SOLOG_ROUND_INVALID_EVIDENCE';
 END IF;
 SELECT * INTO ctx FROM inventario.full_context_for_site_v1(p_sede_id,p_fisico_at);
 IF ctx.ronda_hasta<=clock_timestamp() THEN
   -- Una evidencia llegada después del cierre nunca altera hitos/denominador.
   -- Solo corrige la versión de la fotografía si existe cierre verificable.
   SELECT * INTO rd FROM inventario.metrics_rondas
     WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
     FOR UPDATE;
   IF NOT FOUND OR rd.estado<>'cerrada'
      OR rd.calidad_historia<>'complete' THEN RETURN false; END IF;
   SELECT * INTO ob FROM inventario.metrics_ronda_obligaciones
     WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
       AND grupo_conteo_id=p_grupo_id AND exigible
       AND vigente_desde<=p_fisico_at
       AND (vigente_hasta IS NULL OR vigente_hasta>p_fisico_at)
     ORDER BY generacion DESC LIMIT 1 FOR UPDATE;
   IF NOT FOUND OR p_codigos IS NULL
     OR ob.evidencia_desde_at IS NULL
     OR p_fisico_at<ob.evidencia_desde_at
     OR md5(array_to_string(p_codigos,',')) IS DISTINCT FROM
         ob.composicion_fingerprint
   THEN RETURN false; END IF;

   IF ob.acreditada_at IS NULL OR p_fisico_at<ob.acreditada_at THEN
     SELECT turno INTO evt_turn
       FROM inventario.full_context_for_site_v1(p_sede_id,p_fisico_at);
     UPDATE inventario.metrics_ronda_obligaciones
     SET acreditada_at=p_fisico_at,
         observacion_id=p_observacion_id,
         tipo_observacion=p_tipo_observacion,
         turno_contribuyente=evt_turn,
         estado_calidad='complete',updated_at=clock_timestamp()
     WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
       AND grupo_conteo_id=p_grupo_id AND generacion=ob.generacion;
   END IF;

   PERFORM inventario.metrics_ronda_corte_generar_v1(
     p_sede_id,ctx.ronda_desde,clock_timestamp(),
     md5(p_observacion_id::text||':'||p_tipo_observacion)::uuid
   );
   RETURN false;
 END IF;
 PERFORM inventario.metrics_ronda_asegurar_v1(p_sede_id,p_fisico_at);
 SELECT * INTO rd FROM inventario.metrics_rondas
 WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde FOR UPDATE;
 IF NOT FOUND OR rd.estado<>'abierta' THEN RETURN false; END IF;

 SELECT * INTO ob FROM inventario.metrics_ronda_obligaciones
 WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
   AND grupo_conteo_id=p_grupo_id AND exigible
   AND vigente_desde<=p_fisico_at
   AND (vigente_hasta IS NULL OR vigente_hasta>p_fisico_at)
 ORDER BY generacion DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 evt_fp:=md5(array_to_string(p_codigos,','));
 IF p_codigos IS NULL OR evt_fp IS DISTINCT FROM ob.composicion_fingerprint
    OR ob.evidencia_desde_at IS NULL OR p_fisico_at<ob.evidencia_desde_at
 THEN RETURN false; END IF;

 IF ob.acreditada_at IS NULL OR p_fisico_at<ob.acreditada_at THEN
   SELECT turno INTO evt_turn FROM inventario.full_context_for_site_v1(p_sede_id,p_fisico_at);
   UPDATE inventario.metrics_ronda_obligaciones
   SET acreditada_at=p_fisico_at,
       observacion_id=p_observacion_id,
       tipo_observacion=p_tipo_observacion,
       turno_contribuyente=evt_turn,
       estado_calidad='complete',
       updated_at=clock_timestamp()
   WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
     AND grupo_conteo_id=p_grupo_id AND generacion=ob.generacion;
   PERFORM inventario.metrics_ronda_recalcular_v1(
       p_sede_id,ctx.ronda_desde,p_fisico_at);
   RETURN true;
 END IF;
 RETURN false;
END;
$function$;
CREATE OR REPLACE FUNCTION inventario.metrics_actividad_retirar_obligacion_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_ctx record;v_key text;
BEGIN
 IF OLD.exigible AND OLD.vigente_hasta IS NULL
   AND NEW.vigente_hasta IS NOT NULL THEN
   SELECT * INTO v_ctx FROM inventario.full_context_for_site_v1(OLD.sede_id,clock_timestamp());
   IF OLD.ronda_desde=v_ctx.ronda_desde THEN
     v_key:='coverage:'||inventario.metrics_actividad_utc_key_v1(OLD.ronda_desde)||':'||
                 OLD.grupo_conteo_id::text||':'||OLD.generacion::text;
     UPDATE inventario.metrics_actividad_turnos
     SET tareas_retiradas=tareas_retiradas||
       jsonb_build_object(v_key,jsonb_build_object(
         'reason','structural_invalidated',
         'removed_at',clock_timestamp())),
       updated_at=clock_timestamp()
     WHERE sede_id=OLD.sede_id AND turno_desde=v_ctx.turno_desde
       AND tareas_habilitadas ? v_key
       AND NOT tareas_retiradas ? v_key;
   END IF;
 END IF;
 RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION inventario.full_legacy_activity_no_session_v1(p_sede_id uuid, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_snap uuid;v_snap_at timestamptz;
 v_ctx record;v_cnt integer;v_priority text;v_queues jsonb;
 v_tasks jsonb:='{}'::jsonb;v_key text;v_n integer;
 job record;
BEGIN
 IF p_at IS NULL OR p_at<clock_timestamp()-interval '2 minutes'
    OR p_at>clock_timestamp()+interval '5 seconds' THEN
   RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sedes WHERE id=p_sede_id AND activo)
   OR NOT EXISTS(SELECT 1 FROM public.usuarios
           WHERE sede_id=p_sede_id AND rol='cajero' AND activo)
   OR NOT EXISTS(SELECT 1 FROM inventario.dispositivos_solog
           WHERE sede_id=p_sede_id AND estado='autorizado')
 THEN RETURN false;END IF;

 -- La posibilidad de iniciar V5 requiere ausencia de otra sesión activa.
 -- Un estado 'activo' expirado es normalizado por V5 a recovery.
 IF EXISTS(SELECT 1 FROM inventario.conteos
    WHERE sede_id=p_sede_id AND estado='activo' AND expira_at>p_at)
 THEN RETURN false; END IF;

 SELECT id,capturado_at INTO v_snap,v_snap_at
 FROM inventario.snapshots
 WHERE sede_id=p_sede_id AND estado='confirmado' AND confirmado_at IS NOT NULL
 ORDER BY confirmado_at DESC,capturado_at DESC,id DESC LIMIT 1;
 IF v_snap IS NULL
    OR p_at>=inventario.solog_snapshot_expira_at(v_snap_at)-interval '5 minutes'
    OR p_at>=inventario.solog_sesion_expira_at(v_snap_at)
 THEN RETURN false;END IF;

 SELECT count(*)::integer INTO v_cnt
 FROM inventario.estado_stock_grupo
 WHERE sede_id=p_sede_id AND activo AND NOT requiere_snapshot_completo;
 IF v_cnt=0 THEN RETURN false;END IF;
 IF EXISTS(
   SELECT 1 FROM inventario.estado_stock_grupo esg
   WHERE esg.sede_id=p_sede_id AND esg.activo
     AND NOT esg.requiere_snapshot_completo
     AND inventario.solog_stock_grupo_snapshot(
            v_snap,esg.grupo_conteo_id) IS NULL
 ) THEN RETURN false; END IF;

 SELECT * INTO v_ctx FROM inventario.solog_temporal_context(p_at);
 WITH candidates AS MATERIALIZED(
   SELECT a.grupo_conteo_id,a.action,a.detalle_reconteo_id,
       inventario.solog_priority_classify_v4(
         a.action,a.coverage_complete) AS class
   FROM inventario.solog_cashier_group_actions_v4(p_sede_id,p_at) a
 ), counters AS(
   SELECT count(*) FILTER(where class='round_coverage')::integer c1,
    count(*) FILTER(where class='review_for_coverage')::integer c2,
    count(*) FILTER(where class='review_regular')::integer c3,
    count(*) FILTER(where class='shift_coverage')::integer c4
   FROM candidates
 )
 SELECT jsonb_build_object('round_coverage',c1,
    'review_for_coverage',c2,'review_regular',c3,'shift_coverage',c4),
    inventario.solog_priority_resolve_v4(c1,c2,c3,c4)
 INTO v_queues,v_priority FROM counters;
 IF v_priority='none' THEN
   -- Gate superado y ningún trabajo: representa Sin tareas verificable.
   PERFORM inventario.metrics_actividad_acumular_v1(
     p_sede_id,v_ctx.turno_desde,v_ctx.turno_hasta,
     v_ctx.turno,'none',v_queues);
   RETURN true;
 END IF;
 FOR job IN
   SELECT a.grupo_conteo_id,a.action,a.detalle_reconteo_id,
          inventario.solog_priority_classify_v4(a.action,a.coverage_complete) cls
   FROM inventario.solog_cashier_group_actions_v4(p_sede_id,p_at) a
   WHERE a.action<>'none'
 LOOP
   IF job.cls IS DISTINCT FROM v_priority THEN CONTINUE;END IF;
   IF job.action='recount' THEN
     IF job.detalle_reconteo_id IS NULL THEN CONTINUE;END IF;
     v_key:='recount:'||job.detalle_reconteo_id::text;
   ELSIF job.action='daily' THEN
     v_key:='daily:'||inventario.metrics_actividad_utc_key_v1(v_ctx.turno_desde)||':'||job.grupo_conteo_id::text;
   ELSE
     SELECT o.generacion INTO v_n
     FROM inventario.metrics_ronda_obligaciones o
     WHERE o.sede_id=p_sede_id AND o.ronda_desde=v_ctx.ronda_desde
       AND o.grupo_conteo_id=job.grupo_conteo_id
       AND o.exigible AND o.vigente_hasta IS NULL
     ORDER BY o.generacion DESC LIMIT 1;
     IF v_n IS NOT NULL THEN
       v_key:='coverage:'||inventario.metrics_actividad_utc_key_v1(v_ctx.ronda_desde)||':'||
                   job.grupo_conteo_id::text||':'||v_n::text;
     ELSE
       v_key:='coverage:'||inventario.metrics_actividad_utc_key_v1(v_ctx.ronda_desde)||':'||
              job.grupo_conteo_id::text||':unversioned';
     END IF;
   END IF;
   v_tasks:=v_tasks||jsonb_build_object(v_key,
     jsonb_build_object('group_id',job.grupo_conteo_id,
      'kind',job.cls,'habilitada_at',p_at,'source','no_session'));
 END LOOP;
 PERFORM inventario.metrics_actividad_acumular_v1(
    p_sede_id,v_ctx.turno_desde,v_ctx.turno_hasta,v_ctx.turno,
    v_priority,v_queues,v_tasks);
 RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION inventario.full_activity_no_session_v1(p_sede_id uuid, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_snap uuid;v_snap_at timestamptz;
 v_ctx record;v_cnt integer;v_priority text;v_queues jsonb;
 v_tasks jsonb:='{}'::jsonb;v_key text;v_n integer;
 job record;
BEGIN
 IF p_at IS NULL OR p_at<clock_timestamp()-interval '2 minutes'
    OR p_at>clock_timestamp()+interval '5 seconds' THEN
   RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sedes WHERE id=p_sede_id AND activo)
   OR NOT EXISTS(SELECT 1 FROM public.usuarios
           WHERE sede_id=p_sede_id AND rol='cajero' AND activo)
   OR NOT EXISTS(SELECT 1 FROM inventario.dispositivos_solog
           WHERE sede_id=p_sede_id AND estado='autorizado')
 THEN RETURN false;END IF;

 -- La posibilidad de iniciar V5 requiere ausencia de otra sesión activa.
 -- Un estado 'activo' expirado es normalizado por V5 a recovery.
 IF EXISTS(SELECT 1 FROM inventario.conteos
    WHERE sede_id=p_sede_id AND estado='activo' AND expira_at>p_at)
 THEN RETURN false; END IF;

 SELECT id,capturado_at INTO v_snap,v_snap_at
 FROM inventario.snapshots
 WHERE sede_id=p_sede_id AND estado='confirmado' AND confirmado_at IS NOT NULL
 ORDER BY capturado_at DESC,id DESC LIMIT 1;
 IF v_snap IS NULL
    OR p_at<v_snap_at OR p_at>=v_snap_at+interval '2 hours'
 THEN RETURN false;END IF;

 SELECT count(*)::integer INTO v_cnt
 FROM inventario.estado_stock_grupo
 WHERE sede_id=p_sede_id AND activo AND NOT requiere_snapshot_completo;
 IF v_cnt=0 THEN RETURN false;END IF;
 IF EXISTS(
   SELECT 1 FROM inventario.estado_stock_grupo esg
   WHERE esg.sede_id=p_sede_id AND esg.activo
     AND NOT esg.requiere_snapshot_completo
     AND inventario.solog_stock_grupo_snapshot(
            v_snap,esg.grupo_conteo_id) IS NULL
 ) THEN RETURN false; END IF;

 IF NOT coalesce((inventario.full_cashier_state_v1(NULL,p_sede_id,p_at)#>>'{capabilities,can_start_session}')::boolean,false) THEN RETURN false; END IF;
 SELECT * INTO v_ctx FROM inventario.full_temporal_context_v1(p_at);
 WITH candidates AS MATERIALIZED(
   SELECT a.grupo_conteo_id,a.action,a.detalle_reconteo_id,
       inventario.solog_priority_classify_v4(
         a.action,a.coverage_complete) AS class
   FROM inventario.full_group_actions_v1(p_sede_id,p_at) a
 ), counters AS(
   SELECT count(*) FILTER(where class='round_coverage')::integer c1,
    count(*) FILTER(where class='review_for_coverage')::integer c2,
    count(*) FILTER(where class='review_regular')::integer c3,
    count(*) FILTER(where class='shift_coverage')::integer c4
   FROM candidates
 )
 SELECT jsonb_build_object('round_coverage',c1,
    'review_for_coverage',c2,'review_regular',c3,'shift_coverage',c4),
    inventario.solog_priority_resolve_v4(c1,c2,c3,c4)
 INTO v_queues,v_priority FROM counters;
 IF v_priority='none' THEN
   -- Gate superado y ningún trabajo: representa Sin tareas verificable.
   PERFORM inventario.metrics_actividad_acumular_v1(
     p_sede_id,v_ctx.turno_desde,v_ctx.turno_hasta,
     v_ctx.turno,'none',v_queues);
   RETURN true;
 END IF;
 FOR job IN
   SELECT a.grupo_conteo_id,a.action,a.detalle_reconteo_id,
          inventario.solog_priority_classify_v4(a.action,a.coverage_complete) cls
   FROM inventario.full_group_actions_v1(p_sede_id,p_at) a
   WHERE a.action<>'none'
 LOOP
   IF job.cls IS DISTINCT FROM v_priority THEN CONTINUE;END IF;
   IF job.action='recount' THEN
     IF job.detalle_reconteo_id IS NULL THEN CONTINUE;END IF;
     v_key:='recount:'||job.detalle_reconteo_id::text;
   ELSIF job.action='daily' THEN
     v_key:='daily:'||inventario.metrics_actividad_utc_key_v1(v_ctx.turno_desde)||':'||job.grupo_conteo_id::text;
   ELSE
     SELECT o.generacion INTO v_n
     FROM inventario.metrics_ronda_obligaciones o
     WHERE o.sede_id=p_sede_id AND o.ronda_desde=v_ctx.ronda_desde
       AND o.grupo_conteo_id=job.grupo_conteo_id
       AND o.exigible AND o.vigente_hasta IS NULL
     ORDER BY o.generacion DESC LIMIT 1;
     IF v_n IS NOT NULL THEN
       v_key:='coverage:'||inventario.metrics_actividad_utc_key_v1(v_ctx.ronda_desde)||':'||
                   job.grupo_conteo_id::text||':'||v_n::text;
     ELSE
       v_key:='coverage:'||inventario.metrics_actividad_utc_key_v1(v_ctx.ronda_desde)||':'||
              job.grupo_conteo_id::text||':unversioned';
     END IF;
   END IF;
   v_tasks:=v_tasks||jsonb_build_object(v_key,
     jsonb_build_object('group_id',job.grupo_conteo_id,
      'kind',job.cls,'habilitada_at',p_at,'source','no_session'));
 END LOOP;
 PERFORM inventario.metrics_actividad_acumular_v1(
    p_sede_id,v_ctx.turno_desde,v_ctx.turno_hasta,v_ctx.turno,
    v_priority,v_queues,v_tasks);
 RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION inventario.metrics_actividad_sin_sesion_v1(p_sede_id uuid, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN IF inventario.full_uses_policy_v1(p_sede_id,p_at) THEN RETURN inventario.full_activity_no_session_v1(p_sede_id,p_at);ELSE RETURN inventario.full_legacy_activity_no_session_v1(p_sede_id,p_at); END IF;END $function$;
CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_mutate_v4(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702);
 IF EXISTS(SELECT 1 FROM inventario.full_settings WHERE new_sessions) OR inventario.full_uses_policy_v1((SELECT sede_id FROM public.usuarios WHERE id=auth.uid()),clock_timestamp()) THEN RAISE EXCEPTION 'SOLOG_CLIENT_UPGRADE_REQUIRED'; END IF;
 RETURN inventario.full_compat_rpc_solog_cashier_mutate_v4(p_action,p_payload); END $function$;
CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_mutate_v5(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702);
 IF EXISTS(SELECT 1 FROM inventario.full_settings WHERE new_sessions) OR inventario.full_uses_policy_v1((SELECT sede_id FROM public.usuarios WHERE id=auth.uid()),clock_timestamp()) THEN RAISE EXCEPTION 'SOLOG_CLIENT_UPGRADE_REQUIRED'; END IF;
 RETURN inventario.full_compat_rpc_solog_cashier_mutate_v5(p_action,p_payload); END $function$;
CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_orphan_finish_v1(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702);
 IF EXISTS(SELECT 1 FROM inventario.full_settings WHERE new_sessions) OR inventario.full_uses_policy_v1((SELECT sede_id FROM public.usuarios WHERE id=auth.uid()),clock_timestamp()) THEN RAISE EXCEPTION 'SOLOG_CLIENT_UPGRADE_REQUIRED'; END IF;
 RETURN inventario.full_compat_rpc_solog_cashier_orphan_finish_v1(p_payload); END $function$;
CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_bootstrap_v4(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock_shared(1397705807,4702);
 IF EXISTS(SELECT 1 FROM inventario.full_settings WHERE new_sessions) OR inventario.full_uses_policy_v1((SELECT sede_id FROM public.usuarios WHERE id=auth.uid()),clock_timestamp()) THEN RAISE EXCEPTION 'SOLOG_CLIENT_UPGRADE_REQUIRED'; END IF;
 RETURN inventario.full_compat_rpc_solog_cashier_bootstrap_v4(p_payload); END $function$;
DO $p$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='inventario' AND p.proname LIKE 'full_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig); END LOOP; END $p$;
