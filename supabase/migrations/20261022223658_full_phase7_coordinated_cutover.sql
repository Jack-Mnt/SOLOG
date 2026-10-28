-- Coordinated cutover, explicitly authorized after all stations were disabled.
-- Requires the verified checkpoint, paused cron and six reviewed migrations.
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(1397705807,4702);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM inventario.full_settings WHERE id AND policy_version=2 AND NOT new_ingestion AND NOT new_sessions AND NOT raw_history_enabled)THEN RAISE EXCEPTION 'FULL_CUTOVER_FLAGS_NOT_CLOSED';END IF;
 IF (SELECT count(*)FROM inventario.instalaciones)<>5 OR EXISTS(SELECT 1 FROM inventario.instalaciones WHERE estado<>'deshabilitada')THEN RAISE EXCEPTION 'LEGACY_INSTALLATIONS_NOT_FENCED';END IF;
 IF NOT EXISTS(SELECT 1 FROM inventario.instalaciones WHERE id='13fc7bde-9459-43e6-8cff-dc665ba657a4' AND sede_id='8be00aa4-f530-47f6-be76-90b7c147b38d')THEN RAISE EXCEPTION 'MASTER_INSTALLATION_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM inventario.full_site_permissions)THEN RAISE EXCEPTION 'UNEXPECTED_PREEXISTING_FULL_SCOPES';END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE active)THEN RAISE EXCEPTION 'BUSINESS_CRON_NOT_PAUSED';END IF;
 IF NOT(SELECT count(*)=2 AND bool_and(indisvalid AND indisready AND indisunique)FROM pg_index WHERE indexrelid IN(to_regclass('inventario.snapshots_full_batch_site'),to_regclass('inventario.snapshots_legacy_install_hash')))THEN RAISE EXCEPTION 'REPLACEMENT_UNIQUENESS_NOT_READY';END IF;
END $$;
ALTER TABLE inventario.snapshots DROP CONSTRAINT snapshots_instalacion_excel_hash_unique;
INSERT INTO inventario.full_site_permissions(installation_id,sede_id,warehouse)VALUES
 ('13fc7bde-9459-43e6-8cff-dc665ba657a4','5f08a332-233e-4371-ba7b-f766729ebedb','ALMCASUARINAS'),
 ('13fc7bde-9459-43e6-8cff-dc665ba657a4','1e29ac7b-fe62-4511-99b6-dc3de506e780','ALMDIVINO'),
 ('13fc7bde-9459-43e6-8cff-dc665ba657a4','3d620b2e-0fd6-4f00-848b-73ecb56418bf','ALMHUACACHINA'),
 ('13fc7bde-9459-43e6-8cff-dc665ba657a4','773e4938-87e3-4c60-a08b-9b01a8091bcd','ALMCUTERVO'),
 ('13fc7bde-9459-43e6-8cff-dc665ba657a4','8be00aa4-f530-47f6-be76-90b7c147b38d','ALMUNIDAD');
UPDATE inventario.instalaciones SET full_enabled=true,estado='activa',deshabilitada_at=NULL,updated_at=clock_timestamp()WHERE id='13fc7bde-9459-43e6-8cff-dc665ba657a4';
NOTIFY pgrst,'reload schema';

