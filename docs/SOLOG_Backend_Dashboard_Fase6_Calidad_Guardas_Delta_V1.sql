-- Fase 6G: normalización N/D, calidad de movimiento y guardas RPC.
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
      ELSE 'muy_alto' END,CASE mov_quality WHEN 'completa' THEN 'complete' WHEN 'parcial' THEN 'partial' WHEN 'insuficiente' THEN 'insufficient' ELSE 'insufficient' END,coalesce(calidad,'no_data')
 FROM scored;
$body$;


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
   coalesce(m.confirmed,0)::int physical_confirmed
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
               WHEN empty>0 THEN 'partial' ELSE 'complete' END),
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
       WHEN empty>0 THEN 'partial' ELSE 'complete' END)
 ) ORDER BY nombre),'[]'::jsonb) INTO v_sites FROM srows;
 RETURN jsonb_build_object('sites',v_sites);
END;
$f$;


CREATE OR REPLACE FUNCTION inventario.metrics_dashboard_day_v1(
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
    WHEN p_day>(p_at AT TIME ZONE 'America/Lima')::date THEN 'no_data'
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


CREATE OR REPLACE FUNCTION public.metrics_dashboard_v1(
 p_action text,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE
 v_uid uuid:=auth.uid();
 v_role text;v_active boolean;
 v_now timestamptz:=pg_catalog.statement_timestamp();
 v_site uuid;v_limit integer;
 v_sort text;v_scope text;v_date date;v_from date;v_to date;
 v_cursor jsonb;v_cursor_text text;
 v_data jsonb;v_quality text;
 v_context text:='';
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'SOLOG_AUTH_REQUIRED';END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
 THEN RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';END IF;

 SELECT u.rol::text,u.activo INTO v_role,v_active
 FROM public.usuarios u WHERE u.id=v_uid;
 IF NOT FOUND OR NOT coalesce(v_active,false)
 THEN RAISE EXCEPTION 'SOLOG_USER_DISABLED';END IF;
 IF v_role NOT IN ('admin','moderador')
 THEN RAISE EXCEPTION 'SOLOG_ADMIN_ROLE_REQUIRED';END IF;

 IF p_action IS NULL OR p_action NOT IN ('overview','rounds','risk','episodes','activity',
                     'day','day_observations')
 THEN RAISE EXCEPTION 'SOLOG_INVALID_ACTION';END IF;

 IF p_action='overview' THEN
  IF p_payload<>'{}'::jsonb THEN RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';END IF;
  v_data:=inventario.metrics_dashboard_overview_v1(v_now);
  v_quality:=CASE
   WHEN EXISTS(SELECT 1 FROM inventario.metrics_diferencias) THEN 'partial'
   ELSE 'no_data' END;
 ELSE
  BEGIN v_site:=(p_payload->>'site_id')::uuid;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'SOLOG_INVALID_SITE'; END;
  IF v_site IS NULL THEN RAISE EXCEPTION 'SOLOG_INVALID_SITE';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sedes
        WHERE id=v_site AND activo)
  THEN RAISE EXCEPTION 'SOLOG_SITE_FORBIDDEN';END IF;

  IF p_action='rounds' THEN
   IF (p_payload - 'site_id')<>'{}'::jsonb
   THEN RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';END IF;
   v_data:=inventario.metrics_dashboard_rounds_v1(v_site,v_now);
   v_quality:=CASE WHEN v_data->'current' IS NULL OR
        v_data->'current'='null'::jsonb THEN 'no_data'
     ELSE coalesce(v_data->'current'->>'quality','no_data') END;

  ELSIF p_action='risk' THEN
   IF (p_payload-'site_id'-'limit'-'sort'-'cursor')<>'{}'::jsonb
   THEN RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';END IF;
   v_sort:=coalesce(p_payload->>'sort','risk');
   IF v_sort NOT IN ('risk','value','difference')
   THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_SORT';END IF;
   v_limit:=6;
   IF p_payload ? 'limit' THEN
    BEGIN v_limit:=(p_payload->>'limit')::integer;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_LIMIT';END;
   END IF;
   IF v_limit IS NULL OR v_limit<1 OR v_limit>100
     THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_LIMIT';END IF;
   v_context:='';
   IF p_payload ? 'cursor' AND p_payload->'cursor'<>'null'::jsonb THEN
      IF jsonb_typeof(p_payload->'cursor')<>'string'
      THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR'; END IF;
      v_cursor_text:=p_payload->>'cursor';
      v_cursor:=inventario.metrics_dashboard_cursor_parse_v1(
       v_cursor_text,'risk',v_site,v_sort,v_context);
   END IF;
   IF v_cursor IS NOT NULL AND
      ((v_cursor->>'anchor')::timestamptz>v_now+interval '1 minute'
       OR (v_cursor->>'anchor')::timestamptz<v_now-interval '30 minutes')
    THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR'; END IF;
   v_data:=inventario.metrics_dashboard_risk_v1(
     v_site,v_sort,v_limit,v_cursor,v_now);
   v_quality:=CASE WHEN EXISTS(SELECT 1 FROM inventario.metrics_movimiento_sku
       WHERE sede_id=v_site AND c24_sku IS NOT NULL) THEN 'complete'
       ELSE 'partial' END;

  ELSIF p_action='episodes' THEN
   IF (p_payload-'site_id'-'scope'-'limit'-'sort'-'cursor')<>'{}'::jsonb
   THEN RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';END IF;
   v_scope:=coalesce(p_payload->>'scope','open');
   IF v_scope NOT IN('open','closed')
     THEN RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';END IF;
   v_sort:=coalesce(p_payload->>'sort',
            CASE WHEN v_scope='open' THEN 'importance' ELSE 'recent' END);
   IF (v_scope='open' AND v_sort NOT IN('importance','recurrence','persistence'))
     OR (v_scope='closed' AND v_sort<>'recent')
     THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_SORT';END IF;
   v_limit:=25;
   IF p_payload ? 'limit' THEN
    BEGIN v_limit:=(p_payload->>'limit')::integer;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_LIMIT';END;
   END IF;
   IF v_limit IS NULL OR v_limit<1 OR v_limit>100
   THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_LIMIT';END IF;
   v_context:=v_scope;
   IF p_payload ? 'cursor' AND p_payload->'cursor'<>'null'::jsonb THEN
      IF jsonb_typeof(p_payload->'cursor')<>'string'
       THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR';END IF;
      v_cursor:=inventario.metrics_dashboard_cursor_parse_v1(
        p_payload->>'cursor','episodes',v_site,v_sort,v_context);
   END IF;
   IF v_cursor IS NOT NULL AND
      ((v_cursor->>'anchor')::timestamptz>v_now+interval '1 minute'
       OR (v_cursor->>'anchor')::timestamptz<v_now-interval '30 minutes')
    THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR'; END IF;
   v_data:=inventario.metrics_dashboard_episodes_v1(
     v_site,v_scope,v_sort,v_limit,v_cursor,v_now);
   v_quality:=CASE WHEN EXISTS(SELECT 1 FROM inventario.metrics_episodios
         WHERE sede_id=v_site) THEN 'complete' ELSE 'no_data' END;

  ELSIF p_action IN('activity','day','day_observations') THEN
   IF p_action='activity' THEN
    IF (p_payload-'site_id'-'date_from'-'date_to')<>'{}'::jsonb
    THEN RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';END IF;
    IF coalesce(p_payload->>'date_from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR coalesce(p_payload->>'date_to','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_DATE';END IF;
    BEGIN v_from:=(p_payload->>'date_from')::date;
          v_to:=(p_payload->>'date_to')::date;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_DATE';END;
    IF v_from>v_to OR v_to-v_from>=31
    THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_RANGE';END IF;
    v_data:=inventario.metrics_dashboard_activity_v1(v_site,v_from,v_to,v_now);
    v_quality:=CASE WHEN EXISTS(SELECT 1 FROM inventario.metrics_actividad_turnos
      WHERE sede_id=v_site AND turno_desde>=v_from::timestamp AT TIME ZONE 'America/Lima'
        AND turno_desde<((v_to+1)::timestamp AT TIME ZONE 'America/Lima'))
       THEN 'partial' ELSE 'no_data' END;
   ELSE
    IF (p_action='day' AND (p_payload-'site_id'-'date')<>'{}'::jsonb)
       OR (p_action='day_observations' AND
             (p_payload-'site_id'-'date'-'limit'-'cursor')<>'{}'::jsonb)
     THEN RAISE EXCEPTION 'SOLOG_INVALID_PAYLOAD';END IF;
    IF coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_DATE';END IF;
    BEGIN v_date:=(p_payload->>'date')::date;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_DATE';END;
    IF p_action='day' THEN
       v_data:=inventario.metrics_dashboard_day_v1(v_site,v_date,v_now);
       v_quality:=coalesce(v_data->>'quality','no_data');
    ELSE
       v_limit:=25;
       IF p_payload ? 'limit' THEN
        BEGIN v_limit:=(p_payload->>'limit')::integer;
        EXCEPTION WHEN others THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_LIMIT';END;
       END IF;
       IF v_limit IS NULL OR v_limit<1 OR v_limit>100
       THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_LIMIT';END IF;
       IF p_payload ? 'cursor' AND p_payload->'cursor'<>'null'::jsonb THEN
        IF jsonb_typeof(p_payload->'cursor')<>'string'
        THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR';END IF;
        v_cursor:=inventario.metrics_dashboard_cursor_parse_v1(
         p_payload->>'cursor','day_observations',v_site,'recent',v_date::text);
       END IF;
       IF v_cursor IS NOT NULL AND
      ((v_cursor->>'anchor')::timestamptz>v_now+interval '1 minute'
       OR (v_cursor->>'anchor')::timestamptz<v_now-interval '30 minutes')
    THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR'; END IF;
   v_data:=inventario.metrics_dashboard_day_observations_v1(
        v_site,v_date,v_limit,v_cursor,v_now);
       v_quality:=CASE WHEN v_date>(v_now AT TIME ZONE 'America/Lima')::date
              THEN 'no_data' ELSE 'complete' END;
    END IF;
   END IF;
  END IF;
 END IF;
 IF v_cursor IS NOT NULL AND
   ((v_cursor->>'anchor')::timestamptz>v_now+interval '1 minute'
    OR (v_cursor->>'anchor')::timestamptz<v_now-interval '30 minutes')
 THEN RAISE EXCEPTION 'SOLOG_METRICS_INVALID_CURSOR';END IF;

 RETURN jsonb_build_object('contract_version',1,'generated_at',v_now,
     'action',p_action,'source','metrics_dashboard_v1',
     'quality',v_quality,'data',v_data);
END;
$body$;
