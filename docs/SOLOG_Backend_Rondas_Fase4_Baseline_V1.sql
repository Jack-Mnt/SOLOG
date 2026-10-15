-- SOLOG Fase 4A — metadatos para histórico estructural verificable.
-- Una generación es válida solo mientras mantiene el mismo fingerprint.
-- Los cortes de períodos previos a la activación son N/D, nunca 0.
ALTER TABLE inventario.metrics_ronda_obligaciones
  ADD COLUMN IF NOT EXISTS evidencia_desde_at timestamptz;
ALTER TABLE inventario.metrics_rondas
  ADD COLUMN IF NOT EXISTS calidad_historia text NOT NULL DEFAULT 'partial',
  ADD COLUMN IF NOT EXISTS inicializada_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE inventario.metrics_rondas
  ADD CONSTRAINT metrics_rondas_calidad_historia_ck
  CHECK(calidad_historia IN ('complete','partial','no_data'));

CREATE FUNCTION inventario.metrics_ronda_grupo_estado_v1(p_grupo_id uuid)
RETURNS TABLE(exigible boolean, fingerprint text, codigos integer[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
SELECT e.elegible,
       CASE WHEN e.elegible
         THEN md5(array_to_string(e.codigos_internos,','))
         ELSE NULL::text END,
       e.codigos_internos
FROM inventario.metrics_grupo_elegibilidad_v1(p_grupo_id) e;
$body$;

-- Inicializa un round actual o futuro, únicamente con catálogo disponible
-- al ejecutar. Un round ya pasado NO se rellena artificialmente.
CREATE FUNCTION inventario.metrics_ronda_asegurar_v1(
 p_sede_id uuid,p_contexto_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE
 ctx record;
 v_now timestamptz:=clock_timestamp();
 v_round_created boolean:=false;
 v_quality text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sedes WHERE id=p_sede_id) THEN
   RAISE EXCEPTION 'SOLOG_ROUND_UNKNOWN_SITE'; END IF;
 SELECT * INTO ctx FROM inventario.solog_temporal_context(p_contexto_at);
 IF p_contexto_at IS NULL OR ctx.ronda_desde IS NULL THEN
   RAISE EXCEPTION 'SOLOG_ROUND_INVALID_CONTEXT'; END IF;
 IF ctx.ronda_hasta<=v_now THEN
   -- Nunca inventar obligaciones a fecha de cierre ya transcurrida.
   INSERT INTO inventario.metrics_rondas(
    sede_id,ronda_desde,ronda_hasta,periodo_desde,periodo_hasta,ronda,
    estado,calidad_historia,total_exigibles,total_acreditadas
   ) VALUES(
    p_sede_id,ctx.ronda_desde,ctx.ronda_hasta,ctx.periodo_desde,ctx.periodo_hasta,
    ctx.ronda,'sin_datos','no_data',0,0
   ) ON CONFLICT(sede_id,ronda_desde) DO NOTHING;
   RETURN ctx.ronda_desde;
 END IF;

 v_quality:=CASE WHEN v_now>ctx.ronda_desde+interval '1 second'
                   THEN 'partial' ELSE 'complete' END;
 INSERT INTO inventario.metrics_rondas(
  sede_id,ronda_desde,ronda_hasta,periodo_desde,periodo_hasta,ronda,
  estado,calidad_historia,total_exigibles,total_acreditadas
 ) VALUES (
  p_sede_id,ctx.ronda_desde,ctx.ronda_hasta,
  ctx.periodo_desde,ctx.periodo_hasta,ctx.ronda,
  'abierta',v_quality,0,0
 ) ON CONFLICT(sede_id,ronda_desde) DO NOTHING;
 GET DIAGNOSTICS v_round_created=ROW_COUNT;

 IF v_round_created THEN
   INSERT INTO inventario.metrics_ronda_obligaciones(
     sede_id,ronda_desde,grupo_conteo_id,generacion,
     vigente_desde,exigible,composicion_fingerprint,
     evidencia_desde_at,estado_calidad
   )
   SELECT p_sede_id,ctx.ronda_desde,g.id,1,
          greatest(ctx.ronda_desde,v_now),
          gs.exigible,gs.fingerprint,
          CASE WHEN gs.exigible THEN coalesce(
             (SELECT prev.evidencia_desde_at
              FROM inventario.metrics_ronda_obligaciones prev
              JOIN inventario.metrics_rondas pr
                ON pr.sede_id=prev.sede_id AND pr.ronda_desde=prev.ronda_desde
              WHERE prev.sede_id=p_sede_id
                AND prev.grupo_conteo_id=g.id
                AND prev.ronda_desde<ctx.ronda_desde
                AND prev.composicion_fingerprint=gs.fingerprint
                AND prev.exigible
              ORDER BY prev.ronda_desde DESC,prev.generacion DESC LIMIT 1
              ),greatest(ctx.ronda_desde,v_now))
           END,
          'no_data'
   FROM inventario.grupos_conteo g
   CROSS JOIN LATERAL inventario.metrics_ronda_grupo_estado_v1(g.id) gs;

   UPDATE inventario.metrics_rondas r
   SET total_exigibles=(SELECT count(*) FROM inventario.metrics_ronda_obligaciones o
     WHERE o.sede_id=p_sede_id AND o.ronda_desde=ctx.ronda_desde
       AND o.vigente_hasta IS NULL AND o.exigible),
       updated_at=clock_timestamp()
   WHERE r.sede_id=p_sede_id AND r.ronda_desde=ctx.ronda_desde;
 END IF;
 RETURN ctx.ronda_desde;
END;
$body$;

REVOKE ALL ON FUNCTION
 inventario.metrics_ronda_grupo_estado_v1(uuid),
 inventario.metrics_ronda_asegurar_v1(uuid,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
