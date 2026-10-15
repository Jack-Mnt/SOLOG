-- SOLOG Fase 4E: cron orquesta, no determina el tiempo del corte.
CREATE FUNCTION inventario.metrics_rondas_cerrar_pendientes_v1(
 p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE
 v_s record;v_r record;v_ctx record;v_new integer:=0;
 v_closed integer:=0;v_partial integer:=0;
BEGIN
 IF p_as_of IS NULL OR p_as_of>clock_timestamp()+interval '5 minutes' THEN
  RAISE EXCEPTION 'SOLOG_ROUNDS_INVALID_NOW';END IF;
 -- Primero cerrar rondas previas, incluso si el cron se retrasó.
 FOR v_r IN SELECT sede_id,ronda_desde FROM inventario.metrics_rondas
   WHERE ronda_hasta<=p_as_of AND estado IN ('abierta','sin_datos','cerrando')
     AND NOT EXISTS (
       SELECT 1 FROM inventario.metrics_rondas_cortes c
       WHERE c.sede_id=metrics_rondas.sede_id
         AND c.ronda_desde=metrics_rondas.ronda_desde
     )
   ORDER BY sede_id,ronda_desde
 LOOP
   PERFORM inventario.metrics_ronda_corte_generar_v1(
       v_r.sede_id,v_r.ronda_desde,p_as_of,NULL);
   v_closed:=v_closed+1;
 END LOOP;

 -- Asegurar ronda presente Y la próxima por adelantado.
 FOR v_s IN SELECT id FROM public.sedes WHERE activo ORDER BY id LOOP
   SELECT * INTO v_ctx FROM inventario.solog_temporal_context(p_as_of);
   PERFORM inventario.metrics_ronda_asegurar_v1(v_s.id,p_as_of);
   PERFORM inventario.metrics_ronda_asegurar_v1(
      v_s.id,v_ctx.ronda_hasta+interval '1 second');
 END LOOP;

 SELECT count(*)::integer INTO v_partial FROM inventario.metrics_rondas
 WHERE estado='abierta' AND calidad_historia<>'complete'
  AND ronda_hasta>p_as_of;
 RETURN jsonb_build_object('closed_now',v_closed,
   'open_partial_rounds',v_partial,'as_of',p_as_of);
END;
$f$;

REVOKE ALL ON FUNCTION
 inventario.metrics_rondas_cerrar_pendientes_v1(timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
