-- SOLOG Fase 4F: inicialización prospectiva y Cron recuperable.
-- Ronda anterior a la captura de generaciones: N/D sin evidencias inventadas.
-- Ronda actual: cobertura parcial desde activación; siguiente ronda: preparada.
DO $body$
DECLARE c record;site record;seed_result jsonb;newjob bigint;
BEGIN
 SELECT * INTO c FROM inventario.solog_temporal_context(clock_timestamp());
 FOR site IN SELECT id FROM public.sedes WHERE activo ORDER BY id LOOP
   PERFORM inventario.metrics_ronda_asegurar_v1(
     site.id,c.ronda_desde-interval '1 second');
 END LOOP;
 seed_result:=inventario.metrics_rondas_cerrar_pendientes_v1(clock_timestamp());
 IF (SELECT count(*) FROM inventario.metrics_rondas_cortes
       WHERE estado_corte='nd' AND corte_at=c.ronda_desde) <>
       (SELECT count(*) FROM public.sedes WHERE activo)
 THEN RAISE EXCEPTION 'SOLOG_ROUNDS_PREVIOUS_ND_SEED_INCOMPLETE';END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='metrics_rondas_cierre_recuperable') THEN
   RAISE EXCEPTION 'SOLOG_ROUNDS_CRON_ALREADY_EXISTS'; END IF;
 SELECT cron.schedule('metrics_rondas_cierre_recuperable',
  '4 * * * *',
  'SELECT inventario.metrics_rondas_cerrar_pendientes_v1(pg_catalog.clock_timestamp());'
 ) INTO newjob;
 IF newjob IS NULL THEN RAISE EXCEPTION 'SOLOG_ROUNDS_CRON_CREATION_FAILED'; END IF;
END;
$body$;
