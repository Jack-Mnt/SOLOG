-- SOLOG | Ciclo horario Cajero Full V3 | Verificación solo lectura
-- Ejecutar DESPUES de migraciones 01 y 02 en entorno controlado.
-- NO simula sesiones reales, envíos, races, permisos autenticados, ni constituye smoke.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='25s';

DO $verify$
DECLARE
  v_new jsonb;v_backup jsonb;v_allowed jsonb;v_blocked jsonb;
  v_old jsonb;v_mode text;v_ok boolean;v_doc json;v_def text;
  v_user uuid:='11111111-1111-4111-8111-111111111111';
  v_snap uuid:='22222222-2222-4222-8222-222222222222';
  v_token text:=repeat('a',64);
BEGIN
  IF to_regprocedure('inventario.full_window_v3(timestamptz,timestamptz,timestamptz)') IS NULL
     OR to_regprocedure('inventario.full_cashier_state_v3(uuid,uuid,timestamptz)') IS NULL
  THEN RAISE EXCEPTION 'V3_HELPERS_MISSING';END IF;

  v_new:=inventario.full_window_v3(
    '2026-11-11T11:59:30-05:00'::timestamptz,
    '2026-11-11T12:00:00-05:00'::timestamptz,
    '2026-11-11T12:00:00-05:00'::timestamptz);
  IF v_new->>'session_expires_at' IS NULL
     OR (v_new->>'session_expires_at')::timestamptz
       <> '2026-11-11T13:00:00-05:00'::timestamptz
     OR v_new->>'capture_interval_number'<>'1'
     OR (v_new->>'pending_delivery_until')::timestamptz
       <> '2026-11-11T15:00:00-05:00'::timestamptz
  THEN RAISE EXCEPTION 'V3_NEW_WINDOW_INCORRECT: %',v_new;END IF;

  v_backup:=inventario.full_window_v3(
    '2026-11-11T10:59:30-05:00'::timestamptz,
    '2026-11-11T12:30:00-05:00'::timestamptz,
    '2026-11-11T12:30:00-05:00'::timestamptz);
  IF (v_backup->>'session_expires_at')::timestamptz
       <> '2026-11-11T12:59:30-05:00'::timestamptz
     OR v_backup->>'capture_interval_number'<>'2'
  THEN RAISE EXCEPTION 'V3_BACKUP_WINDOW_INCORRECT: %',v_backup;END IF;

  v_allowed:=inventario.full_window_v3(
    '2026-11-11T11:59:30-05:00'::timestamptz,
    '2026-11-11T12:56:59.999-05:00'::timestamptz,
    '2026-11-11T12:56:59.999-05:00'::timestamptz);
  v_blocked:=inventario.full_window_v3(
    '2026-11-11T11:59:30-05:00'::timestamptz,
    '2026-11-11T12:57:00-05:00'::timestamptz,
    '2026-11-11T12:57:00-05:00'::timestamptz);
  IF (v_allowed->>'can_start')::boolean IS DISTINCT FROM true OR
     (v_blocked->>'can_start')::boolean IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'V3_HH57_BOUNDARY_INCORRECT';END IF;

  v_old:=inventario.full_window_v1(
    '2026-11-11T11:59:30-05:00'::timestamptz,
    '2026-11-11T12:00:00-05:00'::timestamptz,
    '2026-11-11T12:00:00-05:00'::timestamptz);
  IF (v_old->>'session_expires_at')::timestamptz
       <> '2026-11-11T12:59:30-05:00'::timestamptz
  THEN RAISE EXCEPTION 'V2_LEGACY_WINDOW_CHANGED';END IF;

  SELECT mode INTO v_mode FROM inventario.full_cashier_hourly_config_v3
   WHERE singleton;
  IF v_mode IS NULL OR v_mode NOT IN('legacy','dual','required')
  THEN RAISE EXCEPTION 'V3_CONFIG_INVALID';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='inventario'
       AND t.relname='full_cashier_hourly_config_v3'
       AND t.relrowsecurity)
  THEN RAISE EXCEPTION 'V3_CONFIG_RLS_NOT_ENABLED';END IF;

  SELECT document::json INTO v_doc FROM inventario.full_contracts
   WHERE kind='cashier_mutate';
  IF v_doc IS NULL THEN RAISE EXCEPTION 'V3_SCHEMA_MISSING';END IF;
  SELECT extensions.json_matches_schema(v_doc,
    jsonb_build_object('p_action','start','p_payload',jsonb_build_object(
      'operation_id',v_user,'device_token',v_token,
      'expected_snapshot_id',v_snap,
      'expected_cycle_started_at','2026-11-11T11:59:00Z',
      'selected_as','fallback'))::json)
  INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'V3_START_SCHEMA_REJECTED';END IF;

  SELECT extensions.json_matches_schema(v_doc,
    jsonb_build_object('p_action','start','p_payload',jsonb_build_object(
      'operation_id',v_user,'device_token',v_token))::json)
  INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'V2_START_SCHEMA_REJECTED';END IF;

  SELECT extensions.json_matches_schema(v_doc,
    jsonb_build_object('p_action','start','p_payload',jsonb_build_object(
      'operation_id',v_user,'device_token',v_token,
      'expected_snapshot_id',v_snap,'selected_as','fallback'))::json)
  INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'V3_PARTIAL_START_SCHEMA_ACCEPTED';END IF;

  SELECT pg_get_functiondef(
    'inventario.full_cashier_dispatch_v2(uuid,text,jsonb,timestamptz)'::regprocedure)
  INTO v_def;
  IF position('full_cashier_state_v3' IN v_def)=0
     OR position('full_window_v3' IN v_def)=0
     OR position('v_item_index' IN v_def)=0
  THEN RAISE EXCEPTION 'V3_DISPATCH_NOT_INSTALLED';END IF;
  IF has_function_privilege('anon'::regrole,
       'inventario.full_cashier_state_v3(uuid,uuid,timestamptz)'::regprocedure,'EXECUTE')
  THEN RAISE EXCEPTION 'V3_HELPER_ANON_EXECUTE_LEAK';END IF;
END $verify$;

SELECT mode,updated_at FROM inventario.full_cashier_hourly_config_v3
 WHERE singleton;
SELECT policy_version,estado,count(*) total FROM inventario.full_session_windows w
 JOIN inventario.conteos c ON c.id=w.session_id GROUP BY 1,2 ORDER BY 1,2;
SELECT p.proname,p.prosecdef,p.proowner::regrole owner
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='inventario' AND p.proname IN
 ('full_window_v3','full_cashier_start_offer_v3',
  'full_cashier_state_v3','full_cashier_error_v3',
  'full_cashier_dispatch_v2','solog_cleanup_session_runtime_groups')
 ORDER BY p.proname;

ROLLBACK;
