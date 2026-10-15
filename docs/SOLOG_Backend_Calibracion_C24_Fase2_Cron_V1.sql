-- SOLOG Dashboard Fase 2C: muestreo auxiliar temporal aprobado.
-- Unico efecto del job: INSERT en metrics_calibracion_c24 mediante helper privado.
-- Horario UTC: 05:05,11:05,17:05,23:05 = Lima 00:05,06:05,12:05,18:05.
DO $do$
DECLARE v_jobid bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='metrics_calibracion_c24_6h') THEN
    RAISE EXCEPTION 'SOLOG_CALIBRATION_CRON_ALREADY_EXISTS';
  END IF;
  SELECT cron.schedule(
    'metrics_calibracion_c24_6h',
    '5 5,11,17,23 * * *',
    'SELECT inventario.metrics_calibracion_c24_tomar_muestra(pg_catalog.clock_timestamp());'
  ) INTO v_jobid;
  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'SOLOG_CALIBRATION_CRON_CREATION_FAILED';
  END IF;
END $do$;