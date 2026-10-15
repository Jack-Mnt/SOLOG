CREATE OR REPLACE FUNCTION inventario.metrics_dashboard_day_observations_v1(
 p_site uuid,p_day date,p_limit integer,p_cursor jsonb,p_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_anchor timestamptz:=coalesce((p_cursor->>'anchor')::timestamptz,p_at);
 v_start timestamptz:=p_day::timestamp AT TIME ZONE 'America/Lima';
 v_end timestamptz:=(p_day+1)::timestamp AT TIME ZONE 'America/Lima';
 v_rows jsonb;v_more boolean;v_next text;
 v_key0 numeric;v_key1 numeric;v_key2 numeric;v_key3 text;
BEGIN
 WITH ev AS MATERIALIZED(
  SELECT cd.id,cd.grupo_conteo_id,g.nombre,'normal'::text kind,
   cd.contado_at happened,cd.stock_teorico theoretical,cd.stock_fisico physical,
   cd.stock_fisico-cd.stock_teorico delta,
   CASE WHEN cd.stock_fisico=cd.stock_teorico THEN 'Coincide'
      ELSE 'Recontar' END result,0::integer order_kind
  FROM inventario.conteo_detalle cd
  JOIN inventario.conteos co ON co.id=cd.conteo_id
  JOIN inventario.grupos_conteo g ON g.id=cd.grupo_conteo_id AND g.activo
  WHERE co.sede_id=p_site AND cd.contado_at>=v_start
    AND cd.contado_at<v_end AND cd.contado_at<=v_anchor
    AND EXISTS(SELECT 1 FROM inventario.catalogo c
      WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido')
  UNION ALL
  SELECT cd.id,cd.grupo_conteo_id,g.nombre,'recount'::text,
   cd.recontado_at,cd.stock_teorico_reconteo,cd.stock_reconteo,
   cd.stock_reconteo-cd.stock_teorico_reconteo,
   CASE WHEN cd.stock_reconteo=cd.stock_teorico_reconteo THEN 'Coincide'
     WHEN (cd.stock_fisico::bigint-cd.stock_teorico::bigint)
       *(cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)>0
       THEN 'Confirmada' ELSE 'Inconsistente' END,1::integer
  FROM inventario.conteo_detalle cd
  JOIN inventario.conteos co ON co.id=cd.reconteo_conteo_id
  JOIN inventario.grupos_conteo g ON g.id=cd.grupo_conteo_id AND g.activo
  WHERE co.sede_id=p_site AND cd.recontado_at>=v_start
    AND cd.recontado_at<v_end AND cd.recontado_at<=v_anchor
    AND cd.stock_reconteo IS NOT NULL AND cd.stock_teorico_reconteo IS NOT NULL
    AND EXISTS(SELECT 1 FROM inventario.catalogo c
      WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido')
 ), sorted AS (
  SELECT *,extract(epoch from happened)::numeric k0,order_kind::numeric k1,
     0::numeric k2 FROM ev
  WHERE p_cursor IS NULL OR
    (extract(epoch from happened)::numeric,order_kind::numeric,0::numeric,id::text) <
    ((p_cursor->'keys'->>0)::numeric,(p_cursor->'keys'->>1)::numeric,
      (p_cursor->'keys'->>2)::numeric,p_cursor->'keys'->>3)
 ), page AS (
  SELECT *,row_number() OVER(ORDER BY k0 DESC,k1 DESC,k2 DESC,id::text DESC) rn
  FROM sorted
  ORDER BY k0 DESC,k1 DESC,k2 DESC,id::text DESC LIMIT p_limit+1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'observation_id',id,'group_id',grupo_conteo_id,'group_name',nombre,
   'kind',kind,'observed_at',happened,'theoretical',theoretical,
   'physical',physical,'physical_difference',delta,'result',result)
   ORDER BY rn) FILTER (where rn<=p_limit),'[]'::jsonb),
   count(*)>p_limit,
   max(k0) FILTER(where rn=p_limit),max(k1) FILTER(where rn=p_limit),
   max(k2) FILTER(where rn=p_limit),max(id::text) FILTER(where rn=p_limit)
 INTO v_rows,v_more,v_key0,v_key1,v_key2,v_key3 FROM page;
 IF v_more THEN v_next:=inventario.metrics_dashboard_cursor_make_v1(
  'day_observations',p_site,'recent',p_day::text,v_anchor,v_key0,v_key1,v_key2,v_key3);END IF;
 RETURN jsonb_build_object('site_id',p_site,'date',p_day,
    'rows',v_rows,'next_cursor',v_next);
END;
$f$;
