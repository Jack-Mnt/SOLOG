-- SOLOG | Activación controlada Full V3: LEGACY -> DUAL
-- NO APLICAR hasta superar validación de migraciones 01 y 02.
-- En DUAL los starts Full antiguos siguen creando V2; los nuevos con selección crean V3.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $check$
DECLARE v_mode text; v_signature text;
BEGIN
  SELECT mode INTO v_mode FROM inventario.full_cashier_hourly_config_v3
   WHERE singleton FOR UPDATE;
  IF v_mode IS DISTINCT FROM 'legacy' THEN
    RAISE EXCEPTION 'SOLOG_V3_DUAL_REQUIRES_LEGACY_MODE: %',v_mode;
  END IF;
  SELECT pg_get_functiondef(
    'inventario.full_cashier_dispatch_v2(uuid,text,jsonb,timestamp with time zone)'::regprocedure)
    INTO v_signature;
  IF position('full_window_v3' IN v_signature)=0
     OR position('full_cashier_state_v3' IN v_signature)=0 THEN
    RAISE EXCEPTION 'SOLOG_V3_DISPATCH_MIGRATION_02_REQUIRED';
  END IF;
  UPDATE inventario.full_cashier_hourly_config_v3
     SET mode='dual',updated_at=clock_timestamp()
   WHERE singleton;
END $check$;
COMMIT;
