-- SOLOG · Fase 3 Cajero V5 · lectura de contexto original para reconteos
-- Delta aditivo de review_queue; sin cambios de estado, orden, filtros ni permisos.
CREATE OR REPLACE FUNCTION inventario.solog_cashier_panel_state_v4(p_conteo_id uuid, p_at timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_session inventario.conteos%rowtype;
  v_groups jsonb:='[]'::jsonb;
  v_review_queue jsonb:='[]'::jsonb;
  v_coverage_queue jsonb:='[]'::jsonb;
  v_daily_queue jsonb:='[]'::jsonb;
  v_summary jsonb;
  v_capability jsonb;
  v_review_pending integer:=0;
  v_coverage_pending integer:=0;
  v_daily_pending integer:=0;
  v_blocked_waiting integer:=0;
  v_priority_class text:='none';
  v_next_action text:='none';
  v_kpis jsonb;
begin
  if p_conteo_id is null or p_at is null then
    raise exception 'SOLOG_INVALID_SESSION';
  end if;

  perform inventario.solog_normalize_sessions_v4(p_at,null,p_conteo_id);

  select *
    into v_session
  from inventario.conteos c
  where c.id=p_conteo_id;

  if not found then
    raise exception 'SOLOG_SESSION_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'grupo_id',sg.grupo_conteo_id,
      'nombre',sg.grupo_nombre,
      'categoria_id',sg.categoria_id,
      'categoria',sg.categoria_nombre,
      'tipo',sg.tipo_grupo,
      'precio',sg.precio,
      'unidades_por_paquete',sg.unidades_por_paquete,
      'precio_paquete',sg.precio_paquete,
      'codigos_internos',to_jsonb(sg.codigos_internos),
      'productos',sg.productos,
      'stock_teorico',sg.stock_teorico,
      'snapshot_referencia_id',sg.snapshot_referencia_id,
      'accion',sg.accion,
      'detalle_reconteo_id',sg.detalle_reconteo_id,
      'contado_detalle_id',sg.contado_detalle_id,
      'contado_at',sg.contado_at,
      'recontado_at',sg.recontado_at
    )
    order by sg.categoria_nombre,sg.grupo_nombre,sg.grupo_conteo_id
  ),'[]'::jsonb)
  into v_groups
  from inventario.solog_session_runtime_groups sg
  where sg.conteo_id=p_conteo_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'grupo_id',sg.grupo_conteo_id,
      'detalle_id',cd.id,
      'ultima_diferencia',cd.diferencia,
      'motivo_diferencia',cd.motivo_diferencia,
      'observacion_diferencia',cd.observacion_diferencia,
      'contado_at',cd.contado_at,
      'priority_class',sg.priority_class
    )
    order by
      inventario.solog_priority_rank_v4(sg.priority_class),
      cd.contado_at asc,
      cd.id asc
  ),'[]'::jsonb),
  count(*)::integer
  into v_review_queue,v_review_pending
  from inventario.solog_session_runtime_groups sg
  join inventario.conteo_detalle cd
    on cd.id=sg.detalle_reconteo_id
  where sg.conteo_id=p_conteo_id
    and sg.accion='recount'
    and sg.priority_class in ('review_for_coverage','review_regular')
    and cd.estado_diferencia='Recontar'
    and cd.primer_snapshot_posterior_id is not null
    and cd.stock_reconteo is null;

  select
    coalesce(
      jsonb_agg(
        sg.grupo_conteo_id
        order by sg.categoria_nombre,sg.grupo_nombre
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_coverage_queue,v_coverage_pending
  from inventario.solog_session_runtime_groups sg
  where sg.conteo_id=p_conteo_id
    and sg.accion='coverage'
    and sg.priority_class='round_coverage';

  select
    coalesce(
      jsonb_agg(
        sg.grupo_conteo_id
        order by sg.categoria_nombre,sg.grupo_nombre
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_daily_queue,v_daily_pending
  from inventario.solog_session_runtime_groups sg
  where sg.conteo_id=p_conteo_id
    and sg.accion='daily'
    and sg.priority_class='shift_coverage';

  select count(*)::integer
    into v_blocked_waiting
  from inventario.solog_session_runtime_groups sg
  join inventario.estado_stock_grupo esg
    on esg.sede_id=v_session.sede_id
   and esg.grupo_conteo_id=sg.grupo_conteo_id
  join inventario.conteo_detalle cd
    on cd.id=esg.ultimo_conteo_detalle_id
  where sg.conteo_id=p_conteo_id
    and sg.accion='none'
    and sg.priority_class='none'
    and cd.estado_diferencia='Recontar'
    and cd.stock_reconteo is null
    and cd.primer_snapshot_posterior_id is null;

  v_summary:=inventario.solog_cashier_operational_summary_v4(
    v_session.sede_id,
    p_at
  );

  v_priority_class:=
    inventario.solog_runtime_priority_class_v4(p_conteo_id);

  v_next_action:=
    inventario.solog_priority_public_action_v4(v_priority_class);

  v_kpis:=(v_summary->'kpis')
    || jsonb_build_object(
      'review_pending',v_review_pending,
      'coverage_queue_pending',v_coverage_pending,
      'daily_pending',v_daily_pending,
      'coverage_blocked_waiting_snapshot',v_blocked_waiting
    );

  v_capability:=inventario.solog_session_capability_v4(
    p_conteo_id,
    true,
    p_at
  );

  return jsonb_build_object(
    'source','session',
    'frozen',true,
    'session',jsonb_build_object(
      'id',v_session.id,
      'sede_id',v_session.sede_id,
      'usuario_id',v_session.usuario_id,
      'estado',v_session.estado,
      'iniciado_at',v_session.iniciado_at,
      'expira_at',v_session.expira_at,
      'recovery_until',v_session.expira_at+interval '2 hours',
      'finalizado_at',v_session.finalizado_at
    ),
    'basis',jsonb_build_object(
      'snapshot_referencia_id',v_session.snapshot_referencia_id,
      'version_catalogo',v_session.version_catalogo,
      'groups_revision',v_session.groups_revision,
      'periodo_desde',v_session.periodo_desde,
      'periodo_hasta',v_session.periodo_hasta,
      'ronda',v_session.ronda,
      'ronda_desde',v_session.ronda_desde,
      'ronda_hasta',v_session.ronda_hasta,
      'turno',v_session.turno,
      'turno_desde',v_session.turno_desde,
      'turno_hasta',v_session.turno_hasta
    ),
    'groups',v_groups,
    'review_queue',v_review_queue,
    'coverage_queue',v_coverage_queue,
    'daily_queue',v_daily_queue,
    'kpis',v_kpis,
    'next_action',v_next_action,
    'session_capability',v_capability
  );
end;
$function$;
