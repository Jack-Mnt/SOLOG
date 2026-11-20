-- SOLOG Contexto original de reconteos V1
-- Solo ampliacion ADITIVA de la proyeccion de lectura CASHIER_STATE.groups[] en V6.
-- No cambia V7, full_runtime_json_v2, affected_groups, permisos, sesiones ni datos.
-- Contrato congelado: docs/SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_V1.md
CREATE OR REPLACE FUNCTION inventario.full_cashier_kpi_projection_v1(p_site uuid, p_session uuid, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH
ctx AS MATERIALIZED (
  SELECT * FROM inventario.full_temporal_context_v1(p_now)
),
source AS MATERIALIZED (
  SELECT e.grupo_conteo_id,
    coalesce(e.ultima_observacion_fisica_at >= ctx.ronda_desde
       AND e.ultima_observacion_fisica_at < ctx.ronda_hasta, false) AS covered
  FROM inventario.estado_stock_grupo e
  CROSS JOIN ctx
  WHERE e.sede_id = p_site AND e.activo
),
actions AS MATERIALIZED (
  SELECT a.action, a.coverage_complete
  FROM inventario.full_group_actions_v1(p_site,p_now) a
),
totals AS (
  SELECT count(*)::int AS total,
    count(*) FILTER (WHERE covered)::int AS counted
  FROM source
),
queues AS (
  SELECT
    count(*) FILTER (WHERE action='coverage')::int AS round_coverage,
    count(*) FILTER (WHERE action='recount' AND NOT coverage_complete)::int AS review_for_coverage,
    count(*) FILTER (WHERE action='recount' AND coverage_complete)::int AS review_regular,
    count(*) FILTER (WHERE action='daily')::int AS shift_coverage
  FROM actions
),
enriched_groups AS (
  SELECT coalesce(
    jsonb_agg(
      g.value || jsonb_build_object(
        'coverage_pending_round',coalesce(NOT s.covered,false),
        'recount_origin',CASE
          WHEN rg.accion='recount' AND rg.detalle_reconteo_id IS NOT NULL
               AND d.id IS NOT NULL AND orig.id IS NOT NULL
          THEN jsonb_build_object(
            'difference',(d.stock_fisico::bigint-d.stock_teorico::bigint)::int,
            'counted_at',inventario.full_utc_v1(d.contado_at),
            'reason',d.motivo_diferencia,
            'note',d.observacion_diferencia
          )
          ELSE NULL
        END
      ) ORDER BY g.value->>'group_id'
    ),'[]'::jsonb
  ) AS groups_json
  FROM (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM inventario.conteos c
    WHERE c.id=p_session AND c.sede_id=p_site
  ) THEN p_session ELSE NULL::uuid END AS session_id) scope
  CROSS JOIN LATERAL jsonb_array_elements(inventario.full_runtime_json_v2(scope.session_id)) AS g(value)
  LEFT JOIN source s ON s.grupo_conteo_id=(g.value->>'group_id')::uuid
  LEFT JOIN inventario.solog_session_runtime_groups rg
    ON rg.conteo_id=scope.session_id
   AND rg.grupo_conteo_id=(g.value->>'group_id')::uuid
  LEFT JOIN inventario.conteo_detalle d
    ON d.id=rg.detalle_reconteo_id AND rg.accion='recount'
   AND d.grupo_conteo_id=rg.grupo_conteo_id
  LEFT JOIN inventario.conteos orig
    ON orig.id=d.conteo_id AND orig.sede_id=p_site
   AND orig.iniciado_at<(SELECT s_c.iniciado_at FROM inventario.conteos s_c WHERE s_c.id=scope.session_id)
)
SELECT jsonb_build_object(
  'operational_summary',jsonb_build_object(
    'basis',jsonb_build_object(
      'coverage_round',ctx.ronda,
      'round_starts_at',inventario.full_utc_v1(ctx.ronda_desde),
      'round_ends_at',inventario.full_utc_v1(ctx.ronda_hasta)
    ),
    'coverage_total',totals.total,
    'coverage_counted',totals.counted,
    'coverage_pending',totals.total-totals.counted,
    'coverage_percent',CASE WHEN totals.total>0
      THEN round(totals.counted::numeric*100/totals.total,1) ELSE 0 END,
    'review_pending',queues.review_for_coverage+queues.review_regular,
    'daily_pending',queues.shift_coverage,
    'next_action',inventario.solog_priority_public_action_v4(
      inventario.solog_priority_resolve_v4(
        queues.round_coverage,queues.review_for_coverage,
        queues.review_regular,queues.shift_coverage))
  ),
  'groups',enriched_groups.groups_json
)
FROM ctx CROSS JOIN totals CROSS JOIN queues CROSS JOIN enriched_groups;
$function$
;
