-- SOLOG | Activación controlada Full V3: DUAL -> REQUIRED
-- NO APLICAR sin autorización tras publicar y validar frontend Full compatible.
-- Bloquea NUEVOS starts antiguos, no sus replays ya aplicados.
-- NO modifica las RPC legacy usadas por master.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $check$
DECLARE v_mode text;
BEGIN
  SELECT mode INTO v_mode FROM inventario.full_cashier_hourly_config_v3
   WHERE singleton FOR UPDATE;
  IF v_mode IS DISTINCT FROM 'dual' THEN
    RAISE EXCEPTION 'SOLOG_V3_REQUIRED_REQUIRES_DUAL_MODE: %',v_mode;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM inventario.full_contracts
   WHERE kind='cashier_mutate' AND
     document#>'{definitions,StartOfferV3}' IS NOT NULL) THEN
    RAISE EXCEPTION 'SOLOG_V3_REQUIRED_CONTRACT_MISSING';
  END IF;
  UPDATE inventario.full_cashier_hourly_config_v3
     SET mode='required',updated_at=clock_timestamp()
   WHERE singleton;
END $check$;
COMMIT;
