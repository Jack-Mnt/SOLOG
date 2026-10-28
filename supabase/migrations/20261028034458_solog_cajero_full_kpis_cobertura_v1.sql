-- SOLOG Cajero Full P2 — KPIs y cobertura; migración aditiva.
-- Fuente primaria: docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md
-- Baseline función state verificado en P2: a78a7e57c72a0b82cee91e5e718c9aa7.

CREATE OR REPLACE FUNCTION inventario.full_cashier_kpi_projection_v1(
  p_site uuid, p_session uuid, p_now timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $solog_kpi$
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
        'coverage_pending_round',coalesce(NOT s.covered,false)
      ) ORDER BY g.value->>'group_id'
    ),'[]'::jsonb
  ) AS groups_json
  FROM (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM inventario.conteos c
    WHERE c.id=p_session AND c.sede_id=p_site
  ) THEN p_session ELSE NULL::uuid END AS session_id) scope
  CROSS JOIN LATERAL jsonb_array_elements(inventario.full_runtime_json_v2(scope.session_id)) AS g(value)
  LEFT JOIN source s ON s.grupo_conteo_id=(g.value->>'group_id')::uuid
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
$solog_kpi$;

REVOKE ALL ON FUNCTION inventario.full_cashier_kpi_projection_v1(uuid,uuid,timestamptz)
FROM PUBLIC,anon,authenticated;

-- Mantener intacta la firma V6, los campos existentes, las decisiones
-- del Motor y la escritura V7. Sustituir únicamente la función interna
-- full_cashier_state_v2 por su variante aditiva a continuación.

CREATE OR REPLACE FUNCTION inventario.full_cashier_state_v2(p_uid uuid, p_site uuid, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s inventario.snapshots%rowtype;rev bigint;sid uuid;stock jsonb;reason text;cfg inventario.full_settings%rowtype;shift jsonb;kpi_projection jsonb;BEGIN
 SELECT * INTO cfg FROM inventario.full_settings WHERE id;
 SELECT x.* INTO s FROM inventario.snapshots x WHERE x.sede_id=p_site AND x.confirmado_at IS NOT NULL ORDER BY x.capturado_at DESC,x.id DESC LIMIT 1;
 SELECT max(groups_revision) INTO rev FROM inventario.full_group_history WHERE snapshot_id=s.id;
 IF s.id IS NOT NULL THEN stock:=jsonb_build_object('snapshot_id',s.id,'snapshot_captured_at',inventario.full_utc_v1(s.capturado_at),'snapshot_confirmed_at',inventario.full_utc_v1(s.confirmado_at),'stock_expires_at',inventario.full_utc_v1(s.capturado_at+interval '2 hours'),'is_fresh',p_now>=s.capturado_at AND p_now<s.capturado_at+interval '2 hours','is_fallback',p_now>=s.capturado_at+interval '1 hour' AND p_now<s.capturado_at+interval '2 hours','catalog_version',s.version_catalogo,'groups_revision',coalesce(rev,cfg.groups_revision));END IF;
 SELECT c.id INTO sid FROM inventario.conteos c JOIN inventario.full_session_windows w ON w.session_id=c.id WHERE c.sede_id=p_site AND c.usuario_id=p_uid AND c.estado='activo' ORDER BY c.iniciado_at DESC LIMIT 1;
 reason:=CASE WHEN EXISTS(SELECT 1 FROM inventario.conteos WHERE sede_id=p_site AND estado='activo') THEN 'SESSION_ALREADY_ACTIVE' WHEN NOT cfg.new_sessions THEN 'NEW_SESSIONS_PAUSED' WHEN s.id IS NULL THEN 'SNAPSHOT_REQUIRED' WHEN p_now<s.capturado_at OR p_now>=s.capturado_at+interval '2 hours' THEN 'STOCK_EXPIRED' WHEN EXISTS(SELECT 1 FROM inventario.full_group_history h JOIN inventario.categorias k ON k.id=h.category_id JOIN inventario.estado_stock_grupo e ON e.grupo_conteo_id=h.group_id AND e.sede_id=p_site AND e.activo WHERE h.snapshot_id=s.id AND NOT k.activo) OR rev IS DISTINCT FROM cfg.groups_revision OR s.version_catalogo IS DISTINCT FROM(SELECT max(version)FROM inventario.versiones_catalogo WHERE schema_version=2 AND storage_path IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM inventario.full_group_history WHERE snapshot_id=s.id) THEN 'STRUCTURE_SNAPSHOT_REQUIRED' ELSE NULL END;
 shift:=inventario.full_window_v1(p_now,p_now,p_now)->'shift';
 SELECT inventario.full_cashier_kpi_projection_v1(p_site,sid,p_now) INTO kpi_projection;
 RETURN jsonb_build_object('timezone','America/Lima','stock',stock,'session',inventario.full_session_json_v1(sid,p_now),'recovery_sessions',coalesce((SELECT jsonb_agg(inventario.full_session_json_v1(c.id,p_now) ORDER BY c.iniciado_at)FROM inventario.conteos c JOIN inventario.full_session_windows w ON w.session_id=c.id WHERE c.usuario_id=p_uid AND c.sede_id=p_site AND c.estado='recovery'),'[]'),'shift',shift,'capabilities',jsonb_build_object('can_start_session',reason IS NULL,'can_capture_in_current_session',sid IS NOT NULL,'block_reason',reason),'confirmed_observation_ids',coalesce((SELECT jsonb_agg(o.observation_id ORDER BY o.observation_id)FROM inventario.full_observations o WHERE o.session_id=sid AND o.user_id=p_uid),'[]'::jsonb),'recovery_manifests',coalesce((SELECT jsonb_agg(jsonb_build_object('session_id',old_session.id,'observation_ids',coalesce((SELECT jsonb_agg(o.observation_id ORDER BY o.observation_id)FROM inventario.full_observations o WHERE o.session_id=old_session.id AND o.user_id=p_uid),'[]'::jsonb))ORDER BY old_session.id)FROM inventario.conteos old_session JOIN inventario.full_session_windows old_window ON old_window.session_id=old_session.id WHERE old_session.usuario_id=p_uid AND old_session.sede_id=p_site AND old_session.estado='recovery'),'[]'::jsonb),'recovery_delivery_states',coalesce((SELECT jsonb_agg(jsonb_build_object('session_id',old_session.id,'groups_revision',old_session.groups_revision,'current_priority_class',inventario.solog_runtime_priority_class_v4(old_session.id),'eligible_groups',coalesce((SELECT jsonb_agg(jsonb_build_object('group_id',rg.grupo_conteo_id,'action',rg.accion,'priority_class',rg.priority_class,'recount_detail_id',rg.detalle_reconteo_id,'reference_snapshot_id',rg.snapshot_referencia_id) ORDER BY rg.grupo_conteo_id) FROM inventario.solog_session_runtime_groups rg WHERE rg.conteo_id=old_session.id AND rg.accion<>'none' AND rg.priority_class<>'none'),'[]'::jsonb)) ORDER BY old_session.iniciado_at,old_session.id) FROM inventario.conteos old_session JOIN inventario.full_session_windows recovery_window ON recovery_window.session_id=old_session.id WHERE old_session.usuario_id=p_uid AND old_session.sede_id=p_site AND old_session.estado='recovery' AND p_now<recovery_window.pending_delivery_until),'[]'::jsonb),'groups',kpi_projection->'groups','operational_summary',kpi_projection->'operational_summary');
END $function$
;
