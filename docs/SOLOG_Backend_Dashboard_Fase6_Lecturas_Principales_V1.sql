-- SOLOG Fase 6B — overview, rounds y risk. RPCs internas sin EXECUTE externo.
CREATE FUNCTION inventario.metrics_dashboard_overview_v1(p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_sites jsonb;
BEGIN
 WITH ctx AS (SELECT * FROM inventario.solog_temporal_context(p_at)),
 srows AS (
  SELECT s.id,s.nombre,r.total_exigibles,r.total_acreditadas,r.calidad_historia,
   coalesce(m.green,0)::int green,coalesce(m.yellow,0)::int yellow,
   coalesce(m.red,0)::int red,coalesce(m.exempt,0)::int exempt,
   coalesce(m.empty,0)::int empty,coalesce(m.universe,0)::int universe,
   coalesce(m.surplus_groups,0)::int sg, m.surplus_value,coalesce(m.surplus_unknown,0)::int su,
   coalesce(m.shortage_groups,0)::int fg,m.shortage_value,coalesce(m.shortage_unknown,0)::int fu,
   coalesce(m.risk_high,0)::int rh,coalesce(m.risk_very_high,0)::int rvh
  FROM public.sedes s
  CROSS JOIN ctx
  LEFT JOIN inventario.metrics_rondas r
   ON r.sede_id=s.id AND r.ronda_desde=ctx.ronda_desde
  LEFT JOIN LATERAL (
   SELECT count(*) FILTER(where clase_precision='green')::integer green,
     count(*) FILTER(where clase_precision='yellow')::integer yellow,
     count(*) FILTER(where clase_precision='red')::integer red,
     count(*) FILTER(where clase_precision='exempt')::integer exempt,
     count(*) FILTER(where clase_precision='without_evidence')::integer empty,
     count(*)::integer universe,
     count(*) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada>0)::integer surplus_groups,
     sum(valor_confirmado) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada>0) surplus_value,
     count(*) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada>0
       AND valor_confirmado IS NULL)::integer surplus_unknown,
     count(*) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada<0)::integer shortage_groups,
     sum(valor_confirmado) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada<0) shortage_value,
     count(*) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada<0
       AND valor_confirmado IS NULL)::integer shortage_unknown,
     count(*) FILTER(where riesgo_nivel='alto')::integer risk_high,
     count(*) FILTER(where riesgo_nivel='muy_alto')::integer risk_very_high
   FROM inventario.metrics_dashboard_grupos_v1(s.id,p_at)
  ) m ON true
  WHERE s.activo
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'site_id',id,'site_name',nombre,
   'round',jsonb_build_object(
     'period_from',(SELECT periodo_desde FROM ctx),'round',(SELECT ronda FROM ctx),
     'counted',CASE WHEN total_exigibles IS NOT NULL THEN total_acreditadas END,
     'required',total_exigibles,
     'percent',CASE WHEN total_exigibles>0
       THEN round(total_acreditadas::numeric*100/total_exigibles,2) END,
     'quality',coalesce(calidad_historia,'no_data')),
   'accuracy',jsonb_build_object('green',green,'yellow',yellow,'red',red,
      'exempt_zero_zero',exempt,'without_evidence',empty,'universe',universe,
      'denominator',green+yellow+red,
      'green_percent',CASE WHEN green+yellow+red>0
          THEN round(100*green::numeric/(green+yellow+red),2) END,
      'yellow_percent',CASE WHEN green+yellow+red>0
          THEN round(100*yellow::numeric/(green+yellow+red),2) END,
      'red_percent',CASE WHEN green+yellow+red>0
          THEN round(100*red::numeric/(green+yellow+red),2) END,
      'quality',CASE WHEN universe=0 THEN 'no_data'
               WHEN empty>0 THEN 'partial' ELSE 'complete' END),
   'surplus',jsonb_build_object('groups',sg,
      'value',CASE WHEN su>0 THEN NULL
         WHEN sg=0 THEN 0 ELSE surplus_value END,
      'quality',CASE WHEN su>0 THEN 'partial' ELSE 'complete' END),
   'shortage',jsonb_build_object('groups',fg,
      'value',CASE WHEN fu>0 THEN NULL
         WHEN fg=0 THEN 0 ELSE shortage_value END,
      'quality',CASE WHEN fu>0 THEN 'partial' ELSE 'complete' END),
   'risk',jsonb_build_object('high',rh,'very_high',rvh,
      'quality',CASE WHEN empty>0 THEN 'partial' ELSE 'complete' END)
 ) ORDER BY nombre),'[]'::jsonb) INTO v_sites FROM srows;
 RETURN jsonb_build_object('sites',v_sites);
END;
$f$;

CREATE FUNCTION inventario.metrics_dashboard_rounds_v1(p_site uuid,p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_ctx record;v_current jsonb;v_period jsonb;v_history jsonb;
BEGIN
 SELECT * INTO v_ctx FROM inventario.solog_temporal_context(p_at);
 SELECT inventario.metrics_dashboard_round_item_v1(p_site,v_ctx.ronda_desde) INTO v_current;
 WITH p AS (
 SELECT r.ronda_desde FROM inventario.metrics_rondas r
 WHERE r.sede_id=p_site AND r.periodo_desde=v_ctx.periodo_desde
 ORDER BY r.ronda
 )
 SELECT coalesce(jsonb_agg(inventario.metrics_dashboard_round_item_v1(p_site,ronda_desde)
 ORDER BY ronda_desde),'[]'::jsonb) INTO v_period FROM p;
 WITH h AS (
 SELECT r.ronda_desde FROM inventario.metrics_rondas r
 WHERE r.sede_id=p_site AND r.ronda_hasta<=p_at
 ORDER BY r.ronda_desde DESC LIMIT 6
 )
 SELECT coalesce(jsonb_agg(inventario.metrics_dashboard_round_item_v1(p_site,ronda_desde)
  ORDER BY ronda_desde DESC),'[]'::jsonb) INTO v_history FROM h;
 RETURN jsonb_build_object('site_id',p_site,'current',v_current,
   'period_rounds',v_period,'history',v_history);
END;
$f$;

CREATE FUNCTION inventario.metrics_dashboard_risk_v1(
 p_site uuid,p_sort text,p_limit int,p_cursor jsonb,p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE rows_json jsonb;v_has_more boolean;v_count int;
 c0 numeric;c1 numeric;c2 numeric;cid text;
 v_anchor timestamptz:=coalesce((p_cursor->>'anchor')::timestamptz,p_at);
 next_token text;
BEGIN
 WITH source AS MATERIALIZED(
   SELECT g.*,CASE p_sort WHEN 'risk' THEN coalesce(g.riesgo_puntaje::numeric,-1)
     WHEN 'value' THEN coalesce(abs(g.valor_confirmado),-1)
     ELSE abs(g.diferencia_confirmada)::numeric END k0,
     coalesce(abs(g.valor_confirmado),-1) k1,
     abs(g.diferencia_confirmada)::numeric k2
   FROM inventario.metrics_dashboard_grupos_v1(p_site,v_anchor) g
   JOIN inventario.metrics_diferencias d
     ON d.sede_id=p_site AND d.grupo_conteo_id=g.grupo_id
   WHERE g.estado_confirmado='Confirmada' AND g.diferencia_confirmada<>0
     AND d.updated_at<=v_anchor
 ), eligible AS (
   SELECT * FROM source
   WHERE p_cursor IS NULL OR
      (k0,k1,k2,grupo_id::text) <
      ((p_cursor->'keys'->>0)::numeric,
       (p_cursor->'keys'->>1)::numeric,
       (p_cursor->'keys'->>2)::numeric,
       p_cursor->'keys'->>3)
 ), page AS (
   SELECT *,row_number() OVER(ORDER BY k0 DESC,k1 DESC,k2 DESC,grupo_id::text DESC) rn
   FROM eligible
   ORDER BY k0 DESC,k1 DESC,k2 DESC,grupo_id::text DESC
   LIMIT p_limit+1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
     'group_id',grupo_id,'group_name',grupo_nombre,
     'difference',diferencia_confirmada,'confirmed_value',valor_confirmado,
     'level',riesgo_nivel,'movement_quality',movimiento_calidad,
     'risk_available',riesgo_puntaje IS NOT NULL)
     ORDER BY rn) FILTER(where rn<=p_limit),'[]'::jsonb),
   count(*)>p_limit,
   max(k0) FILTER(where rn=p_limit),max(k1) FILTER(where rn=p_limit),
   max(k2) FILTER(where rn=p_limit),max(grupo_id::text) FILTER(where rn=p_limit)
 INTO rows_json,v_has_more,c0,c1,c2,cid FROM page;
 IF v_has_more THEN
   next_token:=inventario.metrics_dashboard_cursor_make_v1(
     'risk',p_site,p_sort,'',v_anchor,c0,c1,c2,cid);END IF;
 SELECT count(*)::integer INTO v_count
 FROM inventario.metrics_diferencias d
 JOIN inventario.grupos_conteo g ON g.id=d.grupo_conteo_id AND g.activo
 WHERE d.sede_id=p_site AND d.comparable AND
  d.estado_confirmado='Confirmada' AND d.diferencia_confirmada<>0
  AND d.updated_at<=v_anchor
  AND EXISTS(SELECT 1 FROM inventario.catalogo c WHERE c.grupo_conteo_id=g.id
   AND c.estado<>'Excluido');
 RETURN jsonb_build_object('site_id',p_site,'sort',p_sort,'rows',rows_json,
    'next_cursor',next_token,'total',v_count);
END;
$f$;

REVOKE ALL ON FUNCTION
 inventario.metrics_dashboard_overview_v1(timestamptz),
 inventario.metrics_dashboard_rounds_v1(uuid,timestamptz),
 inventario.metrics_dashboard_risk_v1(uuid,text,int,jsonb,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
