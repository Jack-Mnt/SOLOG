-- SOLOG Fase 6D — matriz Actividad de los turnos desde acumulador compacto.
CREATE FUNCTION inventario.metrics_dashboard_activity_v1(
 p_site uuid,p_from date,p_to date,p_at timestamptz
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
 WITH days AS (
   SELECT gs::date business_day
   FROM generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') gs
 ), slots AS (
  SELECT d.business_day,t.shift_name,
    CASE t.shift_name
     WHEN 'early' THEN d.business_day::timestamp AT TIME ZONE 'America/Lima'
     WHEN 'day' THEN (d.business_day::timestamp+interval '7 hours 30 minutes')
             AT TIME ZONE 'America/Lima'
     ELSE (d.business_day::timestamp+interval '15 hours 30 minutes')
             AT TIME ZONE 'America/Lima' END from_at,
    CASE t.shift_name
      WHEN 'early' THEN (d.business_day::timestamp+interval '7 hours 30 minutes')
                         AT TIME ZONE 'America/Lima'
      WHEN 'day' THEN (d.business_day::timestamp+interval '15 hours 30 minutes')
                         AT TIME ZONE 'America/Lima'
      ELSE (d.business_day::timestamp+interval '1 day')
                         AT TIME ZONE 'America/Lima' END until_at
  FROM days d CROSS JOIN (VALUES('early'),('day'),('night')) t(shift_name)
 ), present AS (
  SELECT slots.*,a.sede_id as found_sede,a.calidad,
    coalesce(metrics.n,0) n,coalesce(metrics.d,0) d,
    coalesce(metrics.cov,0) cov,coalesce(metrics.rc,0) rc,
    coalesce(metrics.rr,0) rr,coalesce(metrics.daily,0) daily
  FROM slots
  LEFT JOIN inventario.metrics_actividad_turnos a
   ON a.sede_id=p_site AND a.turno_desde=slots.from_at
  LEFT JOIN LATERAL (
    SELECT count(*)::integer d,
     count(*) FILTER(where a.tareas_completadas ? task.key)::integer n,
     count(*) FILTER(where a.tareas_completadas ? task.key
       AND coalesce(a.tareas_completadas->task.key->>'clase_v4_ejecutada',task.value->>'kind')
              ='round_coverage')::integer cov,
     count(*) FILTER(where a.tareas_completadas ? task.key
       AND coalesce(a.tareas_completadas->task.key->>'clase_v4_ejecutada',task.value->>'kind')
              ='review_for_coverage')::integer rc,
     count(*) FILTER(where a.tareas_completadas ? task.key
       AND coalesce(a.tareas_completadas->task.key->>'clase_v4_ejecutada',task.value->>'kind')
              ='review_regular')::integer rr,
     count(*) FILTER(where a.tareas_completadas ? task.key
       AND coalesce(a.tareas_completadas->task.key->>'clase_v4_ejecutada',task.value->>'kind')
              ='shift_coverage')::integer daily
    FROM jsonb_each(coalesce(a.tareas_habilitadas,'{}'::jsonb)) task(key,value)
    WHERE NOT coalesce(a.tareas_retiradas,'{}'::jsonb) ? task.key
     AND EXISTS(
       SELECT 1 FROM inventario.grupos_conteo g
       WHERE g.id::text=task.value->>'group_id' AND g.activo
         AND EXISTS(SELECT 1 FROM inventario.catalogo c
           WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido'))
  ) metrics ON true
 )
 SELECT jsonb_build_object(
   'site_id',p_site,'date_from',p_from,'date_to',p_to,
   'cells',coalesce(jsonb_agg(jsonb_build_object(
     'date',business_day,'turno',shift_name,
     'status',CASE WHEN found_sede IS NULL THEN 'no_data'
         WHEN d=0 THEN 'no_tasks'
         WHEN from_at<=p_at AND until_at>p_at THEN 'in_progress'
         ELSE 'closed' END,
     'completed',CASE WHEN found_sede IS NOT NULL THEN n END,
     'required',CASE WHEN found_sede IS NOT NULL THEN d END,
     'percent',CASE WHEN found_sede IS NOT NULL AND d>0
          THEN round(100*n::numeric/d,1) END,
     'breakdown',jsonb_build_object('round_coverage',cov,
        'review_for_coverage',rc,'review_regular',rr,'shift_coverage',daily),
     'quality',coalesce(calidad,'no_data')
   ) ORDER BY business_day,from_at),'[]'::jsonb))
 FROM present;
$f$;
REVOKE ALL ON FUNCTION
 inventario.metrics_dashboard_activity_v1(uuid,date,date,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
