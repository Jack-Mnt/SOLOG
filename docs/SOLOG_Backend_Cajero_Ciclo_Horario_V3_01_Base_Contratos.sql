-- SOLOG | Cajero Full | Ciclo horario V3 | Migración 01/02 (aditiva)
-- ESTADO: PREPARADA, NO APLICADA. Fuente funcional:
-- docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md
-- Aplicar completa antes de la 02; configuración inicial 'legacy' sin nuevos starts V3.
-- No ejecuta cron, no modifica RPC legacy V3 ni full_settings.policy_version.
-- La transacción la gestiona el ejecutor de migraciones de Supabase.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='inventario' AND p.proname='full_cashier_dispatch_v2')
    OR NOT EXISTS (SELECT 1 FROM inventario.full_contracts WHERE kind='cashier_mutate')
    OR NOT EXISTS (SELECT 1 FROM inventario.full_contracts WHERE kind='cashier_bootstrap')
    OR NOT EXISTS (SELECT 1 FROM inventario.full_settings WHERE id)
  THEN RAISE EXCEPTION 'SOLOG_V3_BASELINE_INCOMPLETE'; END IF;
END $preflight$;

CREATE TABLE inventario.full_cashier_hourly_config_v3 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mode text NOT NULL DEFAULT 'legacy'
    CHECK (mode IN ('legacy','dual','required')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE inventario.full_cashier_hourly_config_v3 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE inventario.full_cashier_hourly_config_v3
  FROM PUBLIC, anon, authenticated;
INSERT INTO inventario.full_cashier_hourly_config_v3(singleton,mode)
VALUES(true,'legacy');
COMMENT ON TABLE inventario.full_cashier_hourly_config_v3 IS
  'Activación independiente de Cajero Full V3: legacy=solo V2; dual=V2/V3; required=solo nuevos V3. No modifica ConeXion ni RPC legacy.';

CREATE OR REPLACE FUNCTION inventario.full_window_v3(
  p_capture timestamptz, p_start timestamptz,
  p_now timestamptz DEFAULT clock_timestamp()
) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO ''
AS $fn$
DECLARE
  v_hour_start timestamptz; v_hour_end timestamptz;
  v_shift_end timestamptz; v_stock_end timestamptz;
  v_capture_end timestamptz; v_interval_start timestamptz;
  v_num integer; v_minute integer; v_fresh boolean; v_can_start boolean;
BEGIN
  IF p_capture IS NULL OR p_start IS NULL OR p_now IS NULL
     OR NOT isfinite(p_capture) OR NOT isfinite(p_start)
     OR NOT isfinite(p_now)
  THEN RAISE EXCEPTION 'INVALID_OBSERVATION_TIME'; END IF;

  v_hour_start := date_trunc('hour',p_start AT TIME ZONE 'America/Lima')
                   AT TIME ZONE 'America/Lima';
  v_hour_end := v_hour_start + interval '1 hour';
  v_stock_end := p_capture + interval '2 hours';
  SELECT turno_hasta INTO v_shift_end
  FROM inventario.full_temporal_context_v1(p_start);
  IF v_shift_end IS NULL THEN RAISE EXCEPTION 'SOLOG_V3_SHIFT_REQUIRED'; END IF;

  v_capture_end := LEAST(v_hour_end,v_stock_end,v_shift_end);
  v_minute := extract(minute FROM p_start AT TIME ZONE 'America/Lima')::integer;
  v_fresh := p_start>=p_capture AND p_start<v_stock_end;
  v_num := CASE WHEN p_start<p_capture+interval '1 hour' THEN 1 ELSE 2 END;
  v_interval_start := GREATEST(v_hour_start,
    p_capture+make_interval(hours=>v_num-1));
  v_can_start := v_fresh AND v_minute<57
    AND v_capture_end-p_start>=interval '180 seconds'
    AND v_interval_start<v_capture_end;

  RETURN jsonb_build_object(
    'can_start',v_can_start,
    'candidate_capture_ends_at',inventario.full_utc_v1(v_capture_end),
    'capture_interval_number',CASE WHEN v_can_start THEN v_num ELSE NULL END,
    'capture_interval_starts_at',CASE WHEN v_can_start THEN inventario.full_utc_v1(v_interval_start) ELSE NULL END,
    'capture_interval_ends_at',CASE WHEN v_can_start THEN inventario.full_utc_v1(v_hour_end) ELSE NULL END,
    'session_expires_at',CASE WHEN v_can_start THEN inventario.full_utc_v1(v_capture_end) ELSE NULL END,
    'stock_expires_at',inventario.full_utc_v1(v_stock_end),
    'pending_delivery_until',CASE WHEN v_can_start THEN inventario.full_utc_v1(v_capture_end+interval '2 hours') ELSE NULL END,
    'capture_allowed',v_can_start AND p_now>=p_start AND p_now<v_capture_end,
    'pending_delivery_allowed',v_can_start AND p_now>=p_start AND p_now<v_capture_end+interval '2 hours',
    'shift',inventario.full_window_v1(p_start,p_start,p_now)->'shift'
  );
END $fn$;

CREATE OR REPLACE FUNCTION inventario.full_cashier_start_offer_v3(
  p_uid uuid, p_site uuid, p_now timestamptz, p_base jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path TO ''
AS $fn$
DECLARE
  v_mode text; v_cycle timestamptz; v_reason text;
  v_capture timestamptz; v_window jsonb; v_status text:='unavailable';
  v_snapshot uuid; v_capture_end text;
BEGIN
  SELECT mode INTO v_mode
    FROM inventario.full_cashier_hourly_config_v3 WHERE singleton;
  IF v_mode IS NULL THEN RAISE EXCEPTION 'SOLOG_V3_CONFIG_MISSING'; END IF;
  v_cycle := (date_trunc('hour',p_now AT TIME ZONE 'America/Lima')
               -interval '1 minute') AT TIME ZONE 'America/Lima';
  v_reason := p_base#>>'{capabilities,block_reason}';

  IF v_mode='legacy' THEN
    v_reason:='START_POLICY_NOT_ENABLED';
  ELSIF v_reason IS NULL AND EXISTS(
    SELECT 1 FROM inventario.conteos c
    JOIN inventario.full_session_windows w ON w.session_id=c.id
    WHERE c.sede_id=p_site AND c.usuario_id=p_uid
      AND c.estado='recovery' AND p_now<w.pending_delivery_until
  ) THEN
    v_reason:='SESSION_RECOVERY_PENDING';
  END IF;

  IF v_reason IS NULL THEN
    v_snapshot := (p_base#>>'{stock,snapshot_id}')::uuid;
    v_capture := (p_base#>>'{stock,snapshot_captured_at}')::timestamptz;
    IF v_snapshot IS NULL OR v_capture IS NULL THEN
      v_reason:='SNAPSHOT_REQUIRED';
    ELSE
      v_window := inventario.full_window_v3(v_capture,p_now,p_now);
      IF extract(minute FROM p_now AT TIME ZONE 'America/Lima')>=57 THEN
        v_reason:='START_WINDOW_CLOSED';
      ELSIF NOT coalesce((v_window->>'can_start')::boolean,false) THEN
        v_reason:='START_CAPTURE_TOO_SHORT';
      ELSE
        v_status := CASE WHEN v_capture>=v_cycle THEN 'new' ELSE 'fallback' END;
        v_capture_end := v_window->>'session_expires_at';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'policy_version',3,
    'cycle_started_at',inventario.full_utc_v1(v_cycle),
    'status',v_status,
    'snapshot_id',CASE WHEN v_reason IS NULL THEN v_snapshot ELSE NULL END,
    'requires_confirmation',v_status='fallback',
    'can_start',v_reason IS NULL,
    'capture_ends_at',CASE WHEN v_reason IS NULL THEN v_capture_end ELSE NULL END,
    'block_reason',v_reason
  );
END $fn$;

CREATE OR REPLACE FUNCTION inventario.full_cashier_state_v3(
  p_uid uuid, p_site uuid, p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path TO ''
AS $fn$
DECLARE v_base jsonb; v_offer jsonb; v_mode text;
BEGIN
  v_base := inventario.full_cashier_state_v2(p_uid,p_site,p_now);
  v_offer := inventario.full_cashier_start_offer_v3(p_uid,p_site,p_now,v_base);
  v_base := jsonb_set(v_base,'{start_offer}',v_offer,true);
  SELECT mode INTO v_mode
  FROM inventario.full_cashier_hourly_config_v3 WHERE singleton;
  -- En dual se preserva la capacidad V2 para clientes previos.
  IF v_mode='required' THEN
    v_base := jsonb_set(v_base,'{capabilities,can_start_session}',v_offer->'can_start');
    v_base := jsonb_set(v_base,'{capabilities,block_reason}',
      COALESCE(v_offer->'block_reason','null'::jsonb));
  END IF;
  RETURN v_base;
END $fn$;

CREATE OR REPLACE FUNCTION inventario.full_cashier_error_v3(
  p_code text, p_now timestamptz, p_item_index integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SET search_path TO ''
AS $fn$
DECLARE v_response jsonb; v_required text;
BEGIN
  v_response := inventario.full_cashier_error_v2(p_code,p_now);
  v_required := CASE
    WHEN p_code IN ('START_WINDOW_CLOSED','START_CAPTURE_TOO_SHORT',
                    'START_POLICY_NOT_ENABLED') THEN 'wait'
    WHEN p_code IN ('SNAPSHOT_SELECTION_CHANGED','SESSION_RECOVERY_PENDING') THEN 'reconcile'
    WHEN p_code IN ('START_POLICY_UPGRADE_REQUIRED','NORMAL_COUNT_ALREADY_IN_SHIFT',
                    'NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT') THEN 'manual_review'
    ELSE NULL END;
  IF v_required IS NOT NULL THEN
    v_response:=jsonb_set(v_response,'{action_required}',to_jsonb(v_required));
  END IF;
  IF p_item_index IS NOT NULL AND p_item_index BETWEEN 0 AND 499 THEN
    v_response:=jsonb_set(v_response,'{errors,0,field_path}',
      to_jsonb(format('p_payload.items[%s]',p_item_index)));
  END IF;
  RETURN v_response;
END $fn$;

REVOKE ALL ON FUNCTION inventario.full_window_v3(timestamptz,timestamptz,timestamptz)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION inventario.full_cashier_start_offer_v3(uuid,uuid,timestamptz,jsonb)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION inventario.full_cashier_state_v3(uuid,uuid,timestamptz)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION inventario.full_cashier_error_v3(text,timestamptz,integer)
  FROM PUBLIC,anon,authenticated;
