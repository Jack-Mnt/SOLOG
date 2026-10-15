CREATE OR REPLACE FUNCTION inventario.metrics_dashboard_grupos_v1(p_sede uuid,p_at timestamptz DEFAULT clock_timestamp())
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
 ), eligible_sku AS (
  SELECT c.grupo_conteo_id,c.c_interno
  FROM inventario.catalogo c JOIN e ON e.id=c.grupo_conteo_id
  WHERE c.estado<>'Excluido'
 ), movement_rate AS (
  SELECT sku.grupo_conteo_id,
    CASE WHEN m.estado_calidad='invalidado' THEN NULL::numeric
         ELSE windowed.c24_sku END AS c24
  FROM eligible_sku sku
  LEFT JOIN inventario.metrics_movimiento_sku m
    ON m.sede_id=p_sede AND m.c_interno=sku.c_interno
  LEFT JOIN LATERAL(
    SELECT w.c24_sku FROM inventario.metrics_c24_ventana_v1(
       m.variacion_stock,m.duracion_intervalo,m.ultimo_capturado_at,p_at) w
    WHERE m.sede_id IS NOT NULL
  ) windowed ON true
 ), movement_grouped AS (
  SELECT grupo_conteo_id,count(*)::integer total,
    count(c24)::integer medidos,sum(c24) c24
  FROM movement_rate GROUP BY grupo_conteo_id
 ), b AS (
  SELECT e.id,e.nombre,d.estado_confirmado,d.diferencia_confirmada,
   d.valor_diferencia_confirmada,d.validacion_tipo,d.comparable,
   d.stock_teorico_confirmacion,d.stock_fisico_confirmacion,
   d.factor_v_riesgo,d.calidad,
   CASE WHEN mv.medidos=0 THEN 1::smallint
        ELSE inventario.metrics_factor_c_v1(mv.c24) END factor_c,
   CASE WHEN mv.medidos=0 THEN 'insuficiente'
      WHEN mv.medidos<mv.total THEN 'parcial' ELSE 'completa' END mov_quality,
   CASE WHEN d.validacion_tipo IN ('recontar','inconsistente','estructura') THEN 'yellow'
     WHEN d.comparable AND d.estado_confirmado='Coincide'
       AND d.stock_teorico_confirmacion=0 AND d.stock_fisico_confirmacion=0 THEN 'exempt'
     WHEN d.comparable AND d.estado_confirmado='Coincide' THEN 'green'
     WHEN d.comparable AND d.estado_confirmado='Confirmada'
       AND d.diferencia_confirmada<>0 THEN 'red'
     ELSE 'without_evidence' END cls
  FROM e LEFT JOIN inventario.metrics_diferencias d
   ON d.sede_id=p_sede AND d.grupo_conteo_id=e.id
  LEFT JOIN movement_grouped mv ON mv.grupo_conteo_id=e.id
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
      ELSE 'muy_alto' END,CASE mov_quality WHEN 'completa' THEN 'complete' WHEN 'parcial' THEN 'partial' WHEN 'insuficiente' THEN 'insufficient' ELSE 'insufficient' END,coalesce(calidad,'no_data')
 FROM scored;
$body$;


