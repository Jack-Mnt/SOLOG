-- SOLOG Fase 6A: lectura auxiliar para siete acciones Admin.
CREATE FUNCTION inventario.metrics_dashboard_grupos_v1(p_sede uuid,p_at timestamptz DEFAULT clock_timestamp())
RETURNS TABLE(grupo_id uuid,grupo_nombre text,clase_precision text,estado_confirmado text,
 diferencia_confirmada integer,valor_confirmado numeric,validacion_tipo text,
 stock_teorico integer,stock_fisico integer,riesgo_puntaje integer,
 riesgo_nivel text,movimiento_calidad text,calidad_diferencia text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
 WITH e AS (
  SELECT g.id,g.nombre FROM inventario.grupos_conteo g
  WHERE g.activo AND EXISTS(SELECT 1 FROM inventario.catalogo c
       WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido')
 ), b AS (
  SELECT e.id,e.nombre,d.estado_confirmado,d.diferencia_confirmada,
   d.valor_diferencia_confirmada,d.validacion_tipo,d.comparable,
   d.stock_teorico_confirmacion,d.stock_fisico_confirmacion,
   d.factor_v_riesgo,d.calidad, mov.factor_c,mov.calidad mov_quality,
   CASE WHEN d.validacion_tipo IN ('recontar','inconsistente','estructura') THEN 'yellow'
     WHEN d.comparable AND d.estado_confirmado='Coincide'
       AND d.stock_teorico_confirmacion=0 AND d.stock_fisico_confirmacion=0 THEN 'exempt'
     WHEN d.comparable AND d.estado_confirmado='Coincide' THEN 'green'
     WHEN d.comparable AND d.estado_confirmado='Confirmada'
       AND d.diferencia_confirmada<>0 THEN 'red'
     ELSE 'without_evidence' END cls
  FROM e LEFT JOIN inventario.metrics_diferencias d
   ON d.sede_id=p_sede AND d.grupo_conteo_id=e.id
  CROSS JOIN LATERAL inventario.metrics_movimiento_grupo_v1(p_sede,e.id,p_at) mov
 ), scored AS (
  SELECT b.*,CASE WHEN comparable AND estado_confirmado='Confirmada'
      AND diferencia_confirmada<>0 AND factor_v_riesgo IS NOT NULL AND factor_c IS NOT NULL
     THEN factor_c::int*(CASE WHEN abs(diferencia_confirmada::bigint)<=5 THEN 1
          WHEN abs(diferencia_confirmada::bigint)<=11 THEN 2 ELSE 3 END)*
          factor_v_riesgo::int END AS score FROM b
 )
 SELECT id,nombre,cls,estado_confirmado,
   CASE WHEN comparable THEN diferencia_confirmada END,
   CASE WHEN comparable THEN valor_diferencia_confirmada END,
   coalesce(validacion_tipo,'none'),
   CASE WHEN comparable THEN stock_teorico_confirmacion END,
   CASE WHEN comparable THEN stock_fisico_confirmacion END,
   score,CASE WHEN score IS NULL THEN NULL WHEN score<=2 THEN 'bajo'
      WHEN score<=4 THEN 'medio_bajo' WHEN score<=8 THEN 'medio'
      WHEN score<=14 THEN 'medio_alto' WHEN score<=29 THEN 'alto'
      ELSE 'muy_alto' END,mov_quality,coalesce(calidad,'no_data')
 FROM scored;
$body$;

CREATE FUNCTION inventario.metrics_dashboard_round_item_v1(p_site uuid,p_round timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
 SELECT jsonb_build_object(
  'round_from',r.ronda_desde,'round_to',r.ronda_hasta,'period_from',r.periodo_desde,
  'period_to',r.periodo_hasta,'round',r.ronda,
  'coverage',jsonb_build_object(
    'counted',CASE WHEN cut.version_corte IS NOT NULL THEN cut.cobertura_acreditadas ELSE r.total_acreditadas END,
    'required',CASE WHEN cut.version_corte IS NOT NULL THEN cut.cobertura_exigibles ELSE r.total_exigibles END,
    'percent',CASE WHEN cut.version_corte IS NOT NULL AND cut.cobertura_exigibles>0
       THEN round(cut.cobertura_acreditadas::numeric*100/cut.cobertura_exigibles,2)
      WHEN cut.version_corte IS NULL AND r.total_exigibles>0
       THEN round(r.total_acreditadas::numeric*100/r.total_exigibles,2) END),
  'milestones',jsonb_build_object('50',r.hito_50_at,'90',r.hito_90_at,'100',r.hito_100_at),
  'historical_accuracy',CASE WHEN cut.version_corte IS NULL THEN NULL
    ELSE jsonb_build_object('green',cut.h_g,'red',cut.h_r,'exempt',cut.h_z,
     'without_evidence',cut.h_s,'denominator',cut.h_u,
     'percent',CASE WHEN cut.h_u>0 THEN round(cut.h_g::numeric*100/cut.h_u,2) END) END,
  'shift_contributions',CASE WHEN cut.version_corte IS NOT NULL THEN cut.contribucion_turnos
    ELSE jsonb_build_object(
     'early',(SELECT count(*) FROM inventario.metrics_ronda_obligaciones o WHERE
         o.sede_id=r.sede_id AND o.ronda_desde=r.ronda_desde AND o.vigente_hasta IS NULL
         AND o.exigible AND o.acreditada_at IS NOT NULL AND o.turno_contribuyente='early'),
     'day',(SELECT count(*) FROM inventario.metrics_ronda_obligaciones o WHERE
         o.sede_id=r.sede_id AND o.ronda_desde=r.ronda_desde AND o.vigente_hasta IS NULL
         AND o.exigible AND o.acreditada_at IS NOT NULL AND o.turno_contribuyente='day'),
     'night',(SELECT count(*) FROM inventario.metrics_ronda_obligaciones o WHERE
         o.sede_id=r.sede_id AND o.ronda_desde=r.ronda_desde AND o.vigente_hasta IS NULL
         AND o.exigible AND o.acreditada_at IS NOT NULL AND o.turno_contribuyente='night')) END,
  'closed_at',cut.corte_at,'quality',CASE WHEN cut.version_corte IS NOT NULL
    THEN CASE WHEN cut.estado_corte='nd' THEN 'no_data' ELSE 'complete' END
    ELSE r.calidad_historia END,'cut_version',cut.version_corte)
 FROM inventario.metrics_rondas r LEFT JOIN LATERAL(
   SELECT * FROM inventario.metrics_rondas_cortes v
   WHERE v.sede_id=r.sede_id AND v.ronda_desde=r.ronda_desde
   ORDER BY v.version_corte DESC LIMIT 1) cut ON true
 WHERE r.sede_id=p_site AND r.ronda_desde=p_round;
$body$;

CREATE FUNCTION inventario.metrics_dashboard_cursor_parse_v1(
 p_cursor text,p_action text,p_site uuid,p_sort text,p_context text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE v jsonb;
BEGIN
 IF p_cursor IS NULL THEN RETURN NULL;END IF;
 IF length(p_cursor)>2048 OR p_cursor !~ '^[A-Za-z0-9+/=]+$'
 THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR';END IF;
 BEGIN v:=convert_from(decode(p_cursor,'base64'),'UTF8')::jsonb;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR';END;
 IF jsonb_typeof(v)<>'object' OR v->>'v'<>'1'
    OR v->>'action' IS DISTINCT FROM p_action
    OR v->>'site' IS DISTINCT FROM p_site::text
    OR v->>'sort' IS DISTINCT FROM p_sort
    OR v->>'context' IS DISTINCT FROM p_context
    OR jsonb_typeof(v->'keys')<>'array'
    OR jsonb_array_length(v->'keys')<>4 OR v->>'anchor' IS NULL
 THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR';END IF;
 BEGIN
 PERFORM (v->>'anchor')::timestamptz;
 PERFORM (v->'keys'->>0)::numeric;
 PERFORM (v->'keys'->>1)::numeric;
 PERFORM (v->'keys'->>2)::numeric;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR';END;
 RETURN v;
END;
$body$;

CREATE FUNCTION inventario.metrics_dashboard_cursor_make_v1(
 p_action text,p_site uuid,p_sort text,p_context text,p_anchor timestamptz,
 k0 numeric,k1 numeric,k2 numeric,k3 text)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
 SELECT encode(convert_to(jsonb_build_object('v',1,'action',p_action,
   'site',p_site,'sort',p_sort,'context',p_context,'anchor',p_anchor,
   'keys',jsonb_build_array(k0,k1,k2,k3))::text,'UTF8'),'base64');
$body$;
REVOKE ALL ON FUNCTION
 inventario.metrics_dashboard_grupos_v1(uuid,timestamptz),
 inventario.metrics_dashboard_round_item_v1(uuid,timestamptz),
 inventario.metrics_dashboard_cursor_parse_v1(text,text,uuid,text,text),
 inventario.metrics_dashboard_cursor_make_v1(text,uuid,text,text,timestamptz,numeric,numeric,numeric,text)
FROM PUBLIC,anon,authenticated,service_role;
