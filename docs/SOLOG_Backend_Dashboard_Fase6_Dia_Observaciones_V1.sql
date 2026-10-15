-- SOLOG Fase 6E — Drawer de fecha única, sin tablas diarias derivadas.
CREATE FUNCTION inventario.metrics_dashboard_day_v1(
 p_site uuid,p_day date,p_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_start timestamptz;v_end timestamptz;v_physical jsonb;
 v_episodes jsonb;v_confirmed jsonb;v_total integer;v_quality text;
BEGIN
 v_start:=p_day::timestamp AT TIME ZONE 'America/Lima';
 v_end:=(p_day+1)::timestamp AT TIME ZONE 'America/Lima';
 WITH ev AS (
   SELECT cd.grupo_conteo_id gid,'normal'::text kind,cd.contado_at happened
   FROM inventario.conteo_detalle cd
   JOIN inventario.conteos co ON co.id=cd.conteo_id
   WHERE co.sede_id=p_site AND cd.contado_at>=v_start AND cd.contado_at<v_end
   UNION ALL
   SELECT cd.grupo_conteo_id,'recount',cd.recontado_at
   FROM inventario.conteo_detalle cd
   JOIN inventario.conteos co ON co.id=cd.reconteo_conteo_id
   WHERE co.sede_id=p_site AND cd.recontado_at>=v_start AND cd.recontado_at<v_end
 ),eligible AS (
   SELECT * FROM ev WHERE EXISTS(
     SELECT 1 FROM inventario.grupos_conteo g WHERE g.id=ev.gid AND g.activo
       AND EXISTS(SELECT 1 FROM inventario.catalogo c
          WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido'))
 )
 SELECT jsonb_build_object(
   'groups_observed',count(DISTINCT gid),
   'counts',count(*) FILTER(where kind='normal'),
   'recounts',count(*) FILTER(where kind='recount'))
 INTO v_physical FROM eligible;

 SELECT jsonb_build_object(
  'opened',count(*) FILTER(where ep.apertura_at>=v_start AND ep.apertura_at<v_end),
  'closed',count(*) FILTER(where ep.cierre_at>=v_start AND ep.cierre_at<v_end),
  'open_at_day_end',count(*) FILTER(where ep.apertura_at<v_end
     AND (ep.cierre_at IS NULL OR ep.cierre_at>=v_end))
 ) INTO v_episodes
 FROM inventario.metrics_episodios ep
 JOIN inventario.grupos_conteo g ON g.id=ep.grupo_conteo_id AND g.activo
 WHERE ep.sede_id=p_site
    AND EXISTS(SELECT 1 FROM inventario.catalogo c
         WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido');

 WITH confirmed AS (
  SELECT DISTINCT ON(cd.grupo_conteo_id)
    cd.grupo_conteo_id gid,g.nombre,
    cd.recontado_at happened,
    CASE WHEN abs(cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)
                <abs(cd.stock_fisico::bigint-cd.stock_teorico::bigint)
         THEN cd.stock_reconteo-cd.stock_teorico_reconteo
         ELSE cd.stock_fisico-cd.stock_teorico END diff,
    cd.precio,cd.unidades_por_paquete,cd.precio_paquete
  FROM inventario.conteo_detalle cd
  JOIN inventario.conteos co ON co.id=cd.reconteo_conteo_id
  JOIN inventario.grupos_conteo g ON g.id=cd.grupo_conteo_id AND g.activo
  WHERE co.sede_id=p_site
    AND cd.recontado_at>=v_start AND cd.recontado_at<v_end
    AND cd.stock_reconteo IS NOT NULL AND cd.stock_teorico_reconteo IS NOT NULL
    AND (cd.stock_fisico::bigint-cd.stock_teorico::bigint)
       *(cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)>0
    AND EXISTS(SELECT 1 FROM inventario.catalogo c
         WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido')
  ORDER BY cd.grupo_conteo_id,cd.recontado_at DESC,cd.id DESC
 ), valued AS (
  SELECT *,inventario.solog_calcular_valor_diferencia(
        diff,precio,unidades_por_paquete,precio_paquete) frozen_value
  FROM confirmed
 )
 SELECT count(*)::integer,
   coalesce(jsonb_agg(jsonb_build_object(
    'group_id',gid,'group_name',nombre,'recounted_at',happened,
    'difference',diff,'frozen_value',frozen_value)
    ORDER BY abs(frozen_value) DESC NULLS LAST,abs(diff) DESC,gid),'[]'::jsonb)
 INTO v_total,v_confirmed FROM valued;

 v_quality:=CASE
    WHEN p_day < (SELECT min(inicializada_at AT TIME ZONE 'America/Lima')::date
       FROM inventario.metrics_rondas)
    THEN 'partial'
    ELSE 'complete' END;
 RETURN jsonb_build_object(
  'site_id',p_site,'date',p_day,
  'physical_activity',v_physical,'episodes',v_episodes,
  'confirmed_differences',v_confirmed,'confirmed_total',v_total,
  'confirmed_next_cursor',NULL,
  'observations_initial_cursor',NULL,'quality',v_quality);
END;
$f$;

CREATE FUNCTION inventario.metrics_dashboard_day_observations_v1(
 p_site uuid,p_day date,p_limit integer,p_cursor jsonb,p_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_anchor timestamptz:=coalesce((p_cursor->>'anchor')::timestamptz,p_at);
 v_start timestamptz:=p_day::timestamp AT TIME ZONE 'America/Lima';
 v_end timestamptz:=(p_day+1)::timestamp AT TIME ZONE 'America/Lima';
 v_rows jsonb;v_more boolean;v_next text;
 k0 numeric;k1 numeric;k2 numeric;k3 text;
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
 INTO v_rows,v_more,k0,k1,k2,k3 FROM page;
 IF v_more THEN v_next:=inventario.metrics_dashboard_cursor_make_v1(
  'day_observations',p_site,'recent',p_day::text,v_anchor,k0,k1,k2,k3);END IF;
 RETURN jsonb_build_object('site_id',p_site,'date',p_day,
    'rows',v_rows,'next_cursor',v_next);
END;
$f$;
REVOKE ALL ON FUNCTION
 inventario.metrics_dashboard_day_v1(uuid,date,timestamptz),
 inventario.metrics_dashboard_day_observations_v1(uuid,date,integer,jsonb,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
