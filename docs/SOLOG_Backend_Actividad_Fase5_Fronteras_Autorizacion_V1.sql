-- SOLOG Fase 5F — fronteras exactas Lima (UTC-5) y autorización de dispositivo.
-- Las tres rutinas reutilizan gates y acumulador existentes: no crean
-- un nuevo origen de prioridad ni otra tabla.
CREATE FUNCTION inventario.metrics_actividad_autorizacion_dispositivo_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
BEGIN
 IF NEW.estado='autorizado' AND
     (TG_OP='INSERT' OR OLD.estado IS DISTINCT FROM NEW.estado)
 THEN
   PERFORM inventario.metrics_actividad_sin_sesion_v1(
     NEW.sede_id,clock_timestamp());
 END IF;
 RETURN NEW;
END;
$f$;

CREATE TRIGGER trg_metrics_actividad_dispositivo_insert_v1
AFTER INSERT ON inventario.dispositivos_solog
FOR EACH ROW WHEN (NEW.estado='autorizado')
EXECUTE FUNCTION inventario.metrics_actividad_autorizacion_dispositivo_v1();

CREATE TRIGGER trg_metrics_actividad_dispositivo_update_v1
AFTER UPDATE OF estado ON inventario.dispositivos_solog
FOR EACH ROW WHEN (NEW.estado='autorizado' AND OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION inventario.metrics_actividad_autorizacion_dispositivo_v1();

REVOKE ALL ON FUNCTION inventario.metrics_actividad_autorizacion_dispositivo_v1()
FROM PUBLIC,anon,authenticated,service_role;

DO $f$
DECLARE job bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job
  WHERE jobname IN ('metrics_actividad_inicio_early',
                    'metrics_actividad_inicio_day',
                    'metrics_actividad_inicio_night'))
 THEN RAISE EXCEPTION 'SOLOG_ACTIVITY_BOUNDARY_CRON_EXISTS';END IF;

 SELECT cron.schedule('metrics_actividad_inicio_early','0 5 * * *',
  'SELECT inventario.metrics_actividad_cerrar_pendientes_v1(pg_catalog.clock_timestamp());'
 ) INTO job;
 IF job IS NULL THEN RAISE EXCEPTION 'SOLOG_EARLY_CRON_FAILED';END IF;

 SELECT cron.schedule('metrics_actividad_inicio_day','30 12 * * *',
  'SELECT inventario.metrics_actividad_cerrar_pendientes_v1(pg_catalog.clock_timestamp());'
 ) INTO job;
 IF job IS NULL THEN RAISE EXCEPTION 'SOLOG_DAY_CRON_FAILED';END IF;

 SELECT cron.schedule('metrics_actividad_inicio_night','30 20 * * *',
  'SELECT inventario.metrics_actividad_cerrar_pendientes_v1(pg_catalog.clock_timestamp());'
 ) INTO job;
 IF job IS NULL THEN RAISE EXCEPTION 'SOLOG_NIGHT_CRON_FAILED';END IF;
END;
$f$;