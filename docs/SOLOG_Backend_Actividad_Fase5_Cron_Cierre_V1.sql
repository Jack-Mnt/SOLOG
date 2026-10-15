-- SOLOG Dashboard Fase 5E: cierre de turnos recuperable y sondeo sin sesión.
-- UTC minute 06 hourly; consulta contextos Lima y gates reales V5.
-- No modifica Cron de calibración ni de rondas.
DO $f$
DECLARE job bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='metrics_actividad_turnos_cierre')
 THEN RAISE EXCEPTION 'SOLOG_ACTIVITY_CRON_ALREADY_EXISTS';END IF;
 SELECT cron.schedule(
   'metrics_actividad_turnos_cierre',
   '6 * * * *',
   'SELECT inventario.metrics_actividad_cerrar_pendientes_v1(pg_catalog.clock_timestamp());'
 ) INTO job;
 IF job IS NULL THEN RAISE EXCEPTION 'SOLOG_ACTIVITY_CRON_FAILED';END IF;
END;
$f$;