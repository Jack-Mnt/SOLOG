-- SOLOG | Cajero Full | Activacion directa LEGACY -> REQUIRED (sin modo dual).
-- Aprobado por el responsable del proyecto el 2026-11-11: aplicacion cerrada hasta nueva publicacion.
-- Estado: APROBADO PARA EJECUCION. El backend exigira V3 a NUEVOS starts Full.
-- Los replays V2 ya confirmados no pierden su idempotencia.
-- La app frontend actualmente desplegada NO puede comenzar una nueva sesion bajo required.
-- Nunca reabrir Cajero hasta implementar y verificar frontend V3.
-- No modifica RPC legacy, Full settings policy_version ni ventanas ya creadas.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $check$
DECLARE v_mode text;v_fn text;v_active integer;v_pending integer;
BEGIN
  -- Serializar el corte con dispatch Full, que usa el mismo lock en modo compartido.
  PERFORM pg_advisory_xact_lock(1397705807,4702);
  SELECT mode INTO v_mode
    FROM inventario.full_cashier_hourly_config_v3 WHERE singleton FOR UPDATE;
  IF v_mode IS DISTINCT FROM 'legacy' THEN
    RAISE EXCEPTION 'SOLOG_V3_DIRECT_REQUIRED_REQUIRES_LEGACY_MODE: %',v_mode;
  END IF;
  IF (SELECT policy_version FROM inventario.full_settings WHERE id) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'SOLOG_V3_GLOBAL_FULL_POLICY_CHANGED';
  END IF;
  SELECT count(*) INTO v_active
    FROM inventario.conteos c JOIN inventario.full_session_windows w ON w.session_id=c.id
    WHERE c.estado IN ('activo','recovery');
  IF v_active<>0 THEN
    RAISE EXCEPTION 'SOLOG_V3_DIRECT_REQUIRED_ACTIVE_SESSIONS: %',v_active;
  END IF;
  SELECT count(*) INTO v_pending FROM inventario.full_recount_reservations;
  IF v_pending<>0 THEN
    RAISE EXCEPTION 'SOLOG_V3_DIRECT_REQUIRED_RECOUNT_RESERVATIONS: %',v_pending;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM inventario.full_contracts
    WHERE kind='cashier_mutate'
      AND document#>'{definitions,StartOfferV3}' IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM inventario.full_contracts
    WHERE kind='cashier_bootstrap'
      AND document#>'{definitions,StartOfferV3}' IS NOT NULL) THEN
    RAISE EXCEPTION 'SOLOG_V3_DIRECT_REQUIRED_CONTRACT_MISSING';
  END IF;
  SELECT pg_get_functiondef(
      'inventario.full_cashier_dispatch_v2(uuid,text,jsonb,timestamptz)'::regprocedure)
    INTO v_fn;
  IF position('full_window_v3' in v_fn)=0
     OR position('full_cashier_state_v3' in v_fn)=0
     OR position('START_POLICY_UPGRADE_REQUIRED' in v_fn)=0
  THEN RAISE EXCEPTION 'SOLOG_V3_DIRECT_REQUIRED_DISPATCH_INCOMPLETE'; END IF;
  UPDATE inventario.full_cashier_hourly_config_v3
     SET mode='required',updated_at=clock_timestamp()
    WHERE singleton;
  IF (SELECT mode FROM inventario.full_cashier_hourly_config_v3 WHERE singleton) IS DISTINCT FROM 'required'
  THEN RAISE EXCEPTION 'SOLOG_V3_DIRECT_REQUIRED_UPDATE_FAILED'; END IF;
END $check$;
