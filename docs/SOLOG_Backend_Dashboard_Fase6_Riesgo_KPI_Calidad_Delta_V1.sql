CREATE OR REPLACE FUNCTION inventario.metrics_dashboard_overview_v1(p_at timestamptz)
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
   coalesce(m.risk_high,0)::int rh,coalesce(m.risk_very_high,0)::int rvh,
   coalesce(m.confirmed,0)::int physical_confirmed,
   coalesce(m.unmeasured_risk,0)::int unmeasured_risk
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
     count(*) FILTER(where estado_confirmado IN ('Coincide','Confirmada'))::integer confirmed,
     count(*) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada>0)::integer surplus_groups,
     sum(valor_confirmado) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada>0) surplus_value,
     count(*) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada>0
       AND valor_confirmado IS NULL)::integer surplus_unknown,
     count(*) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada<0)::integer shortage_groups,
     sum(valor_confirmado) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada<0) shortage_value,
     count(*) FILTER(where estado_confirmado='Confirmada' AND diferencia_confirmada<0
       AND valor_confirmado IS NULL)::integer shortage_unknown,
     count(*) FILTER(where riesgo_puntaje IS NOT NULL
       AND movimiento_calidad<>'complete')::integer unmeasured_risk,
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
      'quality',CASE WHEN universe=0 OR (green+yellow+red+exempt)=0 THEN 'no_data'
               WHEN empty>0 OR unmeasured_risk>0 THEN 'partial' ELSE 'complete' END),
   'surplus',jsonb_build_object('groups',sg,
      'value',CASE WHEN physical_confirmed=0 OR su>0 THEN NULL
         WHEN sg=0 THEN 0 ELSE surplus_value END,
      'quality',CASE WHEN physical_confirmed=0 THEN 'no_data'
        WHEN su>0 THEN 'partial' ELSE 'complete' END),
   'shortage',jsonb_build_object('groups',fg,
      'value',CASE WHEN physical_confirmed=0 OR fu>0 THEN NULL
         WHEN fg=0 THEN 0 ELSE shortage_value END,
      'quality',CASE WHEN physical_confirmed=0 THEN 'no_data'
        WHEN fu>0 THEN 'partial' ELSE 'complete' END),
   'risk',jsonb_build_object('high',rh,'very_high',rvh,
      'quality',CASE WHEN physical_confirmed=0 THEN 'no_data'
       WHEN empty>0 OR unmeasured_risk>0 THEN 'partial' ELSE 'complete' END)
 ) ORDER BY nombre),'[]'::jsonb) INTO v_sites FROM srows;
 RETURN jsonb_build_object('sites',v_sites);
END;
$f$;



