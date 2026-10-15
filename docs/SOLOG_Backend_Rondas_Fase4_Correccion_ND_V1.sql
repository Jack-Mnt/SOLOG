CREATE OR REPLACE FUNCTION inventario.metrics_ronda_corte_generar_v1(
 p_sede_id uuid,p_ronda_desde timestamptz,
 p_as_of timestamptz DEFAULT clock_timestamp(),
 p_evidencia_correccion_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $body$
DECLARE
 r inventario.metrics_rondas%rowtype;
 previous_version integer;
 next_version integer;
 verified boolean;
 a record;
 contributing jsonb;
 details jsonb;
BEGIN
 SELECT * INTO r FROM inventario.metrics_rondas
 WHERE sede_id=p_sede_id AND ronda_desde=p_ronda_desde FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SOLOG_ROUND_NOT_FOUND'; END IF;
 IF p_as_of IS NULL OR p_as_of<r.ronda_hasta THEN
  RAISE EXCEPTION 'SOLOG_ROUND_NOT_FINISHED'; END IF;
 SELECT max(version_corte) INTO previous_version FROM inventario.metrics_rondas_cortes
 WHERE sede_id=p_sede_id AND ronda_desde=p_ronda_desde;

 IF previous_version IS NOT NULL AND p_evidencia_correccion_id IS NULL
 THEN RETURN previous_version; END IF;
 IF previous_version IS NULL AND p_evidencia_correccion_id IS NOT NULL
 THEN RAISE EXCEPTION 'SOLOG_ROUND_CORRECTION_WITHOUT_CUT'; END IF;
 IF p_evidencia_correccion_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM inventario.metrics_rondas_cortes
  WHERE sede_id=p_sede_id AND ronda_desde=p_ronda_desde
   AND evidencia_correccion_id=p_evidencia_correccion_id)
 THEN RETURN previous_version; END IF;
 next_version:=coalesce(previous_version,0)+1;
 verified:=r.calidad_historia='complete'
   AND EXISTS(SELECT 1 FROM inventario.metrics_ronda_obligaciones
     WHERE sede_id=p_sede_id AND ronda_desde=p_ronda_desde);

 IF verified THEN
   WITH eligible AS MATERIALIZED (
     SELECT o.* FROM inventario.metrics_ronda_obligaciones o
     WHERE o.sede_id=p_sede_id AND o.ronda_desde=p_ronda_desde
       AND o.exigible AND o.vigente_desde<r.ronda_hasta
       AND (o.vigente_hasta IS NULL OR o.vigente_hasta>=r.ronda_hasta)
   ),
   observed AS (
     SELECT o.*,phy.id confirm_id,phy.origin,phy.physical_at,
       phy.theoretical,phy.physical,phy.difference,
       CASE WHEN phy.id IS NULL THEN 'S'
         WHEN phy.theoretical=0 AND phy.physical=0 THEN 'Z'
         WHEN phy.state='Coincide' THEN 'G' ELSE 'R' END classe
     FROM eligible o
     LEFT JOIN LATERAL (
       SELECT z.id,z.origin,z.physical_at,z.theoretical,z.physical,z.difference,z.state
       FROM (
         SELECT cd.id,'normal'::text origin,cd.contado_at physical_at,
           cd.stock_teorico theoretical,cd.stock_fisico physical,
           0::integer difference,'Coincide'::text state,0::integer event_order
         FROM inventario.conteo_detalle cd
         JOIN inventario.conteos co ON co.id=cd.conteo_id
         WHERE co.sede_id=o.sede_id
           AND cd.grupo_conteo_id=o.grupo_conteo_id
           AND cd.contado_at<r.ronda_hasta
           AND cd.contado_at>=o.evidencia_desde_at
           AND md5(array_to_string(cd.codigos_internos,','))=
               o.composicion_fingerprint
           AND cd.stock_fisico=cd.stock_teorico
         UNION ALL
         SELECT cd.id,'recount'::text,cd.recontado_at,
           cd.stock_teorico_reconteo,cd.stock_reconteo,
           CASE WHEN cd.stock_reconteo=cd.stock_teorico_reconteo THEN 0
             WHEN abs(cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)
                  <abs(cd.stock_fisico::bigint-cd.stock_teorico::bigint)
             THEN cd.stock_reconteo-cd.stock_teorico_reconteo
             ELSE cd.stock_fisico-cd.stock_teorico END,
           CASE WHEN cd.stock_reconteo=cd.stock_teorico_reconteo
               THEN 'Coincide' ELSE 'Confirmada' END,1
         FROM inventario.conteo_detalle cd
         JOIN inventario.conteos co
           ON co.id=coalesce(cd.reconteo_conteo_id,cd.conteo_id)
         WHERE co.sede_id=o.sede_id
           AND cd.grupo_conteo_id=o.grupo_conteo_id
           AND cd.recontado_at<r.ronda_hasta
           AND cd.recontado_at>=o.evidencia_desde_at
           AND cd.stock_reconteo IS NOT NULL
           AND cd.stock_teorico_reconteo IS NOT NULL
           AND md5(array_to_string(cd.codigos_internos,','))=
               o.composicion_fingerprint
           AND (cd.stock_reconteo=cd.stock_teorico_reconteo OR
              (cd.stock_fisico::bigint-cd.stock_teorico::bigint) *
              (cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)>0)
       ) z ORDER BY z.physical_at DESC,z.event_order DESC,z.id DESC LIMIT 1
     ) phy ON true
   )
   SELECT count(*) FILTER (WHERE classe='G')::int AS hg,
          count(*) FILTER (WHERE classe='R')::int AS hr,
          count(*) FILTER (WHERE classe='Z')::int AS hz,
          count(*) FILTER (WHERE classe='S')::int AS hs,
          count(*)::int AS ht,
          count(*) FILTER (WHERE classe IN ('G','R'))::int AS hu,
          count(*) FILTER (WHERE acreditada_at IS NOT NULL AND
              acreditada_at<r.ronda_hasta)::int AS counted,
          count(*) FILTER (WHERE acreditada_at IS NOT NULL AND
              acreditada_at<r.ronda_hasta AND turno_contribuyente='early')::int AS n_early,
          count(*) FILTER (WHERE acreditada_at IS NOT NULL AND
              acreditada_at<r.ronda_hasta AND turno_contribuyente='day')::int AS n_day,
          count(*) FILTER (WHERE acreditada_at IS NOT NULL AND
              acreditada_at<r.ronda_hasta AND turno_contribuyente='night')::int AS n_night,
          coalesce(jsonb_agg(jsonb_build_object(
             'group_id',grupo_conteo_id,'generation',generacion,
             'fingerprint',composicion_fingerprint,'class',classe,
             'confirmation_id',confirm_id,'origin',origin,
             'confirmed_at',physical_at,'difference',difference,
             'accreditation_id',observacion_id,'accredited_at',acreditada_at,
             'shift',turno_contribuyente
          ) ORDER BY grupo_conteo_id),'[]'::jsonb) AS evidence
   INTO a FROM observed;
   details:=a.evidence;
   contributing:=jsonb_build_object('early',a.n_early,
               'day',a.n_day,'night',a.n_night);
 ELSE
   -- CHECK N/D admite NULL, pero PL/pgSQL requiere record tipado.
   SELECT null::integer hg,null::integer hr,null::integer hz,
          null::integer hs,null::integer ht,null::integer hu,
          null::integer counted INTO a;
   details:='[]'::jsonb;contributing:='{}'::jsonb;
 END IF;

 INSERT INTO inventario.metrics_rondas_cortes(
  sede_id,ronda_desde,version_corte,corte_at,estado_corte,
  motivo_calidad,h_g,h_r,h_z,h_s,h_t,h_u,
  cobertura_acreditadas,cobertura_exigibles,
  contribucion_turnos,hitos_at,evidencia_grupos,
  motivo_correccion,evidencia_correccion_id,version_anterior
 )
 VALUES(p_sede_id,p_ronda_desde,next_version,r.ronda_hasta,
   CASE WHEN NOT verified THEN 'nd'
        WHEN previous_version IS NOT NULL THEN 'corregido' ELSE 'valido' END,
   CASE WHEN NOT verified THEN 'historia_estructural_no_verificable' END,
   CASE WHEN verified THEN a.hg END,CASE WHEN verified THEN a.hr END,
   CASE WHEN verified THEN a.hz END,CASE WHEN verified THEN a.hs END,
   CASE WHEN verified THEN a.ht END,CASE WHEN verified THEN a.hu END,
   CASE WHEN verified THEN a.counted END,CASE WHEN verified THEN a.ht END,
   contributing,jsonb_build_object('50',r.hito_50_at,'90',r.hito_90_at,
                                   '100',r.hito_100_at),details,
   CASE WHEN previous_version IS NOT NULL THEN 'evidencia_fisica_tardia' END,
   p_evidencia_correccion_id,previous_version);

 IF previous_version IS NULL THEN
   UPDATE inventario.metrics_rondas
   SET estado=CASE WHEN verified THEN 'cerrada' ELSE 'sin_datos' END,
       cerrado_at=clock_timestamp(),updated_at=clock_timestamp()
   WHERE sede_id=p_sede_id AND ronda_desde=p_ronda_desde;
 END IF;
 RETURN next_version;
END;
$body$;

