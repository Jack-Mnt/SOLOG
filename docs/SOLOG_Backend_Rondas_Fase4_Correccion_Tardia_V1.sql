CREATE OR REPLACE FUNCTION inventario.metrics_ronda_acreditar_v1(
 p_sede_id uuid,p_grupo_id uuid,p_observacion_id uuid,
 p_tipo_observacion text,p_fisico_at timestamptz,
 p_codigos integer[]
)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE ctx record; rd inventario.metrics_rondas%rowtype;
  ob inventario.metrics_ronda_obligaciones%rowtype;
  evt_turn text; evt_fp text;
BEGIN
 IF p_tipo_observacion NOT IN ('normal','recount')
    OR p_fisico_at IS NULL OR p_observacion_id IS NULL THEN
    RAISE EXCEPTION 'SOLOG_ROUND_INVALID_EVIDENCE';
 END IF;
 SELECT * INTO ctx FROM inventario.solog_temporal_context(p_fisico_at);
 IF ctx.ronda_hasta<=clock_timestamp() THEN
   -- Una evidencia llegada después del cierre nunca altera hitos/denominador.
   -- Solo corrige la versión de la fotografía si existe cierre verificable.
   SELECT * INTO rd FROM inventario.metrics_rondas
     WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
     FOR UPDATE;
   IF NOT FOUND OR rd.estado<>'cerrada'
      OR rd.calidad_historia<>'complete' THEN RETURN false; END IF;
   SELECT * INTO ob FROM inventario.metrics_ronda_obligaciones
     WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
       AND grupo_conteo_id=p_grupo_id AND exigible
       AND vigente_desde<=p_fisico_at
       AND (vigente_hasta IS NULL OR vigente_hasta>p_fisico_at)
     ORDER BY generacion DESC LIMIT 1 FOR UPDATE;
   IF NOT FOUND OR p_codigos IS NULL
     OR ob.evidencia_desde_at IS NULL
     OR p_fisico_at<ob.evidencia_desde_at
     OR md5(array_to_string(p_codigos,',')) IS DISTINCT FROM
         ob.composicion_fingerprint
   THEN RETURN false; END IF;

   IF ob.acreditada_at IS NULL OR p_fisico_at<ob.acreditada_at THEN
     SELECT turno INTO evt_turn
       FROM inventario.solog_temporal_context(p_fisico_at);
     UPDATE inventario.metrics_ronda_obligaciones
     SET acreditada_at=p_fisico_at,
         observacion_id=p_observacion_id,
         tipo_observacion=p_tipo_observacion,
         turno_contribuyente=evt_turn,
         estado_calidad='complete',updated_at=clock_timestamp()
     WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
       AND grupo_conteo_id=p_grupo_id AND generacion=ob.generacion;
   END IF;

   PERFORM inventario.metrics_ronda_corte_generar_v1(
     p_sede_id,ctx.ronda_desde,clock_timestamp(),
     md5(p_observacion_id::text||':'||p_tipo_observacion)::uuid
   );
   RETURN false;
 END IF;
 PERFORM inventario.metrics_ronda_asegurar_v1(p_sede_id,p_fisico_at);
 SELECT * INTO rd FROM inventario.metrics_rondas
 WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde FOR UPDATE;
 IF NOT FOUND OR rd.estado<>'abierta' THEN RETURN false; END IF;

 SELECT * INTO ob FROM inventario.metrics_ronda_obligaciones
 WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
   AND grupo_conteo_id=p_grupo_id AND exigible
   AND vigente_desde<=p_fisico_at
   AND (vigente_hasta IS NULL OR vigente_hasta>p_fisico_at)
 ORDER BY generacion DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 evt_fp:=md5(array_to_string(p_codigos,','));
 IF p_codigos IS NULL OR evt_fp IS DISTINCT FROM ob.composicion_fingerprint
    OR ob.evidencia_desde_at IS NULL OR p_fisico_at<ob.evidencia_desde_at
 THEN RETURN false; END IF;

 IF ob.acreditada_at IS NULL OR p_fisico_at<ob.acreditada_at THEN
   SELECT turno INTO evt_turn FROM inventario.solog_temporal_context(p_fisico_at);
   UPDATE inventario.metrics_ronda_obligaciones
   SET acreditada_at=p_fisico_at,
       observacion_id=p_observacion_id,
       tipo_observacion=p_tipo_observacion,
       turno_contribuyente=evt_turn,
       estado_calidad='complete',
       updated_at=clock_timestamp()
   WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
     AND grupo_conteo_id=p_grupo_id AND generacion=ob.generacion;
   PERFORM inventario.metrics_ronda_recalcular_v1(
       p_sede_id,ctx.ronda_desde,p_fisico_at);
   RETURN true;
 END IF;
 RETURN false;
END;
$f$;

