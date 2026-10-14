-- SOLOG · Motivos de diferencias · Phase backend 1 · additive schema and cashier V5
-- Compatible with production V4, which remains unmodified until the approved cutover.
ALTER TABLE inventario.conteo_detalle
  ADD COLUMN IF NOT EXISTS motivo_diferencia text,
  ADD COLUMN IF NOT EXISTS observacion_diferencia text,
  ADD COLUMN IF NOT EXISTS observacion_reconteo text;

ALTER TABLE inventario.conteo_detalle
  ADD CONSTRAINT conteo_detalle_motivo_diferencia_v1_check
    CHECK (motivo_diferencia IS NULL OR motivo_diferencia IN
      ('Transferencia','Venta por mayor','Dañado','Vencido','Otro motivo')),
  ADD CONSTRAINT conteo_detalle_observacion_diferencia_v1_check
    CHECK (observacion_diferencia IS NULL OR
      (char_length(btrim(observacion_diferencia)) >= 3 AND motivo_diferencia IS NOT NULL)),
  ADD CONSTRAINT conteo_detalle_observacion_reconteo_v1_check
    CHECK (observacion_reconteo IS NULL OR
      (char_length(btrim(observacion_reconteo)) >= 3 AND
       (observacion_reconteo <> 'Resuelto' OR
         (stock_reconteo IS NOT NULL AND stock_teorico_reconteo=stock_reconteo))));

COMMENT ON COLUMN inventario.conteo_detalle.motivo_diferencia IS 'Motivo declarado en captura inicial o incorporado al reconteo; no equivale a causa verificada';
COMMENT ON COLUMN inventario.conteo_detalle.observacion_diferencia IS 'Observacion textual de la captura original; NULL para historicos o capturas sin explicacion';
COMMENT ON COLUMN inventario.conteo_detalle.observacion_reconteo IS 'Observacion del reconteo; Resuelto solo cuando fisico coincide con teorico de reconteo';

CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_mutate_v5(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz:=clock_timestamp();
  v_uid uuid:=auth.uid();
  v_rol text;
  v_sede_id uuid;
  v_activo boolean;

  v_token text;
  v_hash text;
  v_device_id uuid;

  v_operation_id uuid;
  v_replay jsonb;
  v_response jsonb;

  v_conteo_id uuid;
  v_session inventario.conteos%rowtype;
  v_ctx record;

  v_snapshot_id uuid;
  v_snapshot_at timestamptz;
  v_snapshot_confirmado_at timestamptz;
  v_version integer;
  v_expira_at timestamptz;
  v_groups_rev bigint;
  v_oper_rev bigint;
  v_operational_groups integer;

  v_items jsonb;
  v_item jsonb;
  v_client_id uuid;
  v_group_id uuid;
  v_stock_fisico integer;
  v_observed_at timestamptz;
  v_runtime inventario.solog_session_runtime_groups%rowtype;

  v_diff integer;
  v_state text;
  v_detail_id uuid;
  v_first_post uuid;
  v_latest_post uuid;
  v_first_stock integer;
  v_latest_stock integer;

  v_recount_detail uuid;
  v_recount_stock integer;
  v_recount_at timestamptz;
  v_reason text;
  v_observation text;
  v_recount_observation text;
  v_cd inventario.conteo_detalle%rowtype;
  v_d0 integer;
  v_dr integer;
  v_final_diff integer;
  v_final_state text;

  v_results jsonb:='[]'::jsonb;
  v_saved integer:=0;
  v_expected_groups bigint;
  v_affected_groups uuid[]:='{}'::uuid[];

  v_panel_state jsonb;
  v_panel_delta jsonb;
  v_session_capability jsonb;
  v_finish jsonb;
begin
  if v_uid is null then
    raise exception 'SOLOG_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  if p_action not in ('start','save_batch','recount_save_batch','finish') then
    raise exception 'SOLOG_INVALID_ACTION';
  end if;

  select u.rol::text,u.sede_id,u.activo
    into v_rol,v_sede_id,v_activo
  from public.usuarios u
  where u.id=v_uid;

  if not found or not coalesce(v_activo,false) then
    raise exception 'SOLOG_USER_DISABLED';
  end if;

  if v_rol<>'cajero' then
    raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED';
  end if;

  if v_sede_id is null then
    raise exception 'SOLOG_CASHIER_WITHOUT_SEDE';
  end if;

  begin
    v_operation_id:=(p_payload->>'operation_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_OPERATION';
  end;

  if v_operation_id is null then
    raise exception 'SOLOG_INVALID_OPERATION';
  end if;

  v_replay:=inventario.solog_operation_begin(
    'cashier_v5:'||p_action,
    v_uid,
    v_operation_id,
    p_payload - 'device_token'
  );

  if v_replay is not null then
    return v_replay||jsonb_build_object('replay',true);
  end if;

  perform 1
  from public.sedes s
  where s.id=v_sede_id
    and s.activo
  for update;

  if not found then
    raise exception 'SOLOG_SEDE_NOT_FOUND';
  end if;

  v_token:=nullif(btrim(coalesce(p_payload->>'device_token','')),'');

  if v_token is null
     or length(v_token)<32
     or length(v_token)>512 then
    raise exception 'SOLOG_DEVICE_UNAUTHORIZED';
  end if;

  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

  select d.id
    into v_device_id
  from inventario.dispositivos_solog d
  where d.device_hash=v_hash
    and d.sede_id=v_sede_id
    and d.estado='autorizado'
  for update;

  if not found then
    raise exception 'SOLOG_DEVICE_UNAUTHORIZED';
  end if;

  update inventario.dispositivos_solog
  set
    ultimo_acceso_at=v_now,
    updated_at=v_now
  where id=v_device_id;

  perform inventario.solog_normalize_sessions_v4(
    v_now,
    v_sede_id,
    null
  );

  if p_action='start' then
    if exists(
      select 1
      from inventario.conteos c
      where c.sede_id=v_sede_id
        and c.estado='activo'
    ) then
      raise exception 'SOLOG_SESSION_CONFLICT';
    end if;

    select s.id,s.capturado_at,s.confirmado_at,s.version_catalogo
      into
        v_snapshot_id,
        v_snapshot_at,
        v_snapshot_confirmado_at,
        v_version
    from inventario.snapshots s
    where s.sede_id=v_sede_id
      and s.estado='confirmado'
      and s.confirmado_at is not null
    order by s.confirmado_at desc,s.capturado_at desc,s.id desc
    limit 1;

    if v_snapshot_id is null then
      raise exception 'SOLOG_CONFIRMED_SNAPSHOT_REQUIRED';
    end if;

    if v_now>=inventario.solog_snapshot_expira_at(v_snapshot_at) then
      raise exception 'SOLOG_STOCK_EXPIRED';
    end if;

    if v_now>=inventario.solog_snapshot_expira_at(v_snapshot_at)-interval '5 minutes' then
      raise exception 'SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY';
    end if;

    v_expira_at:=inventario.solog_sesion_expira_at(v_snapshot_at);

    if v_expira_at is null or v_now>=v_expira_at then
      raise exception 'SOLOG_SESSION_WINDOW_CLOSED';
    end if;

    select *
      into v_ctx
    from inventario.solog_temporal_context(v_now);

    select count(*)::integer
      into v_operational_groups
    from inventario.estado_stock_grupo esg
    where esg.sede_id=v_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo;

    if v_operational_groups=0 then
      raise exception 'SOLOG_OPERATIONAL_PERIOD_NOT_STARTED';
    end if;

    if exists(
      select 1
      from inventario.estado_stock_grupo esg
      where esg.sede_id=v_sede_id
        and esg.activo
        and not esg.requiere_snapshot_completo
        and inventario.solog_stock_grupo_snapshot(
          v_snapshot_id,
          esg.grupo_conteo_id
        ) is null
    ) then
      raise exception 'SOLOG_CONFIRMED_SNAPSHOT_INCOMPLETE';
    end if;

    v_groups_rev:=inventario.solog_revision_get('groups',null);

    insert into inventario.conteos(
      sede_id,
      estado,
      iniciado_at,
      usuario_id,
      expira_at,
      snapshot_referencia_id,
      version_catalogo,
      groups_revision,
      periodo_desde,
      periodo_hasta,
      ronda,
      ronda_desde,
      ronda_hasta,
      turno,
      turno_desde,
      turno_hasta,
      created_at,
      updated_at
    ) values(
      v_sede_id,
      'activo',
      v_now,
      v_uid,
      v_expira_at,
      v_snapshot_id,
      v_version,
      v_groups_rev,
      v_ctx.periodo_desde,
      v_ctx.periodo_hasta,
      v_ctx.ronda,
      v_ctx.ronda_desde,
      v_ctx.ronda_hasta,
      v_ctx.turno,
      v_ctx.turno_desde,
      v_ctx.turno_hasta,
      v_now,
      v_now
    )
    returning id
      into v_conteo_id;

    insert into inventario.solog_session_runtime_groups(
      conteo_id,
      grupo_conteo_id,
      snapshot_referencia_id,
      stock_teorico,
      grupo_nombre,
      categoria_id,
      categoria_nombre,
      tipo_grupo,
      precio,
      unidades_por_paquete,
      precio_paquete,
      codigos_internos,
      productos,
      accion,
      priority_class,
      detalle_reconteo_id,
      created_at,
      updated_at
    )
    select
      v_conteo_id,
      g.id,
      v_snapshot_id,
      st.stock_teorico,
      g.nombre,
      g.categoria_id,
      cat.nombre,
      case
        when count(c.c_interno) filter(where c.estado<>'Excluido')=1
          then 'Individual'
        else 'Agrupado'
      end,
      g.precio,
      g.unidades_por_paquete,
      g.precio_paquete,
      coalesce(
        array_agg(c.c_interno order by c.c_interno)
          filter(where c.c_interno is not null and c.estado<>'Excluido'),
        '{}'::integer[]
      ),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'c_interno',c.c_interno,
            'producto',c.producto,
            'marca',c.marca,
            'precio',c.precio
          )
          order by c.producto,c.c_interno
        ) filter(where c.c_interno is not null and c.estado<>'Excluido'),
        '[]'::jsonb
      ),
      a.action,
      inventario.solog_priority_classify_v4(a.action,a.coverage_complete),
      case when a.action='recount' then a.detalle_reconteo_id else null end,
      v_now,
      v_now
    from inventario.estado_stock_grupo esg
    join inventario.solog_cashier_group_actions_v4(v_sede_id,v_now) a
      on a.grupo_conteo_id=esg.grupo_conteo_id
    join inventario.grupos_conteo g
      on g.id=esg.grupo_conteo_id
     and g.activo
    join inventario.categorias cat
      on cat.id=g.categoria_id
     and cat.activo
    cross join lateral (
      select inventario.solog_stock_grupo_snapshot(
        v_snapshot_id,
        g.id
      ) as stock_teorico
    ) st
    left join inventario.catalogo c
      on c.grupo_conteo_id=g.id
    where esg.sede_id=v_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo
      and st.stock_teorico is not null
    group by
      g.id,
      g.nombre,
      g.categoria_id,
      cat.nombre,
      g.precio,
      g.unidades_por_paquete,
      g.precio_paquete,
      st.stock_teorico,
      a.action,
      a.coverage_complete,
      a.detalle_reconteo_id;

    if (
      select count(*)::integer
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
    )<>v_operational_groups then
      raise exception 'SOLOG_SESSION_RUNTIME_INCOMPLETE';
    end if;

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_panel_state:=inventario.solog_cashier_panel_state_v4(
      v_conteo_id,
      v_now
    );

    v_session_capability:=
      inventario.solog_session_capability_v4(
        v_conteo_id,
        true,
        v_now
      );

    v_response:=jsonb_build_object(
      'contract_version',5,
      'generated_at',v_now,
      'action','start',
      'replay',false,
      'conteo_id',v_conteo_id,
      'revisions',jsonb_build_object(
        'groups',v_groups_rev,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      ),
      'stock',jsonb_build_object(
        'snapshot_id',v_snapshot_id,
        'capturado_at',v_snapshot_at,
        'confirmado_at',v_snapshot_confirmado_at,
        'snapshot_expira_at',
          inventario.solog_snapshot_expira_at(v_snapshot_at),
        'version_catalogo',v_version
      ),
      'session_capability',v_session_capability,
      'panel_state',v_panel_state
    );

    return inventario.solog_operation_finish(
      'cashier_v5:start',
      v_uid,
      v_operation_id,
      v_response
    );
  end if;

  begin
    v_conteo_id:=(p_payload->>'conteo_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_SESSION';
  end;

  if v_conteo_id is null then
    raise exception 'SOLOG_INVALID_SESSION';
  end if;

  select *
    into v_session
  from inventario.conteos c
  where c.id=v_conteo_id
  for update;

  if not found
     or v_session.sede_id<>v_sede_id
     or v_session.usuario_id<>v_uid then
    raise exception 'SOLOG_SESSION_NOT_FOUND';
  end if;

  if v_session.snapshot_referencia_id is null
     or v_session.groups_revision is null
     or v_session.ronda is null
     or v_session.turno is null then
    raise exception 'SOLOG_SESSION_REVISION_CONFLICT';
  end if;

  begin
    v_expected_groups:=
      nullif(p_payload->>'expected_groups_revision','')::bigint;
  exception when others then
    raise exception 'SOLOG_GROUPS_REVISION_CONFLICT';
  end;

  if v_expected_groups is not null
     and v_expected_groups<>v_session.groups_revision then
    raise exception 'SOLOG_GROUPS_REVISION_CONFLICT';
  end if;

  if p_action='save_batch' then
    v_items:=p_payload->'items';

    if v_items is null
       or jsonb_typeof(v_items)<>'array'
       or jsonb_array_length(v_items)=0
       or jsonb_array_length(v_items)>500 then
      raise exception 'SOLOG_INVALID_BATCH_PAYLOAD';
    end if;

    for v_item in
      select value from jsonb_array_elements(v_items)
    loop
      begin
        v_client_id:=(v_item->>'client_observation_id')::uuid;
        v_group_id:=(v_item->>'grupo_id')::uuid;
        v_stock_fisico:=(v_item->>'stock_fisico')::integer;
        v_observed_at:=(v_item->>'contado_at')::timestamptz;
        if not (v_item ? 'motivo_diferencia' and v_item ? 'observacion_diferencia')
           or jsonb_typeof(v_item->'motivo_diferencia') not in ('string','null')
           or jsonb_typeof(v_item->'observacion_diferencia') not in ('string','null') then
          raise exception 'SOLOG_OBSERVATION_FIELDS_REQUIRED';
        end if;
        v_reason:=nullif(btrim(v_item->>'motivo_diferencia'),'');
        v_observation:=nullif(btrim(v_item->>'observacion_diferencia'),'');
      exception when others then
        raise exception 'SOLOG_INVALID_BATCH_ITEM';
      end;

      if v_client_id is null
         or v_group_id is null
         or v_stock_fisico is null
         or v_stock_fisico<0
         or v_observed_at is null then
        raise exception 'SOLOG_INVALID_BATCH_ITEM';
      end if;

      perform inventario.solog_validate_session_observation_v4(
        v_conteo_id,
        v_observed_at,
        clock_timestamp()
      );

      select *
        into v_runtime
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
        and sg.grupo_conteo_id=v_group_id
      for update;

      if not found then
        raise exception 'SOLOG_GROUP_NOT_AVAILABLE';
      end if;

      if v_runtime.accion not in ('coverage','daily') then
        raise exception 'SOLOG_GROUP_ALREADY_COUNTED';
      end if;

      if exists(
        select 1
        from inventario.conteo_detalle cd
        where cd.client_observation_id=v_client_id
      ) then
        raise exception 'SOLOG_CLIENT_OBSERVATION_CONFLICT';
      end if;

      v_diff:=v_stock_fisico-v_runtime.stock_teorico;
      if v_reason is not null and v_reason not in
          ('Transferencia','Venta por mayor','Dañado','Vencido','Otro motivo') then
        raise exception 'SOLOG_INVALID_DIFFERENCE_REASON';
      end if;
      if (v_reason is null) is distinct from (v_observation is null)
         or (v_observation is not null and char_length(v_observation)<3) then
        raise exception 'SOLOG_INVALID_DIFFERENCE_OBSERVATION';
      end if;
      if abs(v_diff)>=12 and (v_reason is null or v_observation is null) then
        raise exception 'SOLOG_DIFFERENCE_EXPLANATION_REQUIRED';
      end if;
      v_state:=case
        when v_diff=0 then 'Coincide'
        else 'Recontar'
      end;

      insert into inventario.conteo_detalle(
        conteo_id,
        grupo_conteo_id,
        snapshot_referencia_id,
        stock_teorico,
        stock_fisico,
        diferencia,
        precio,
        valor_diferencia,
        contado_at,
        estado_diferencia,
        client_observation_id,
        motivo_diferencia,
        observacion_diferencia,
        grupo_nombre,
        categoria_nombre,
        tipo_grupo,
        codigos_internos,
        unidades_por_paquete,
        precio_paquete,
        created_at,
        updated_at
      ) values(
        v_conteo_id,
        v_group_id,
        v_session.snapshot_referencia_id,
        v_runtime.stock_teorico,
        v_stock_fisico,
        v_diff,
        v_runtime.precio,
        0,
        v_observed_at,
        v_state,
        v_client_id,
        v_reason,
        v_observation,
        v_runtime.grupo_nombre,
        v_runtime.categoria_nombre,
        v_runtime.tipo_grupo,
        v_runtime.codigos_internos,
        v_runtime.unidades_por_paquete,
        v_runtime.precio_paquete,
        clock_timestamp(),
        clock_timestamp()
      )
      returning id
        into v_detail_id;

      update inventario.solog_session_runtime_groups
      set
        accion='none',
        priority_class='none',
        contado_detalle_id=v_detail_id,
        contado_at=v_observed_at,
        updated_at=clock_timestamp()
      where conteo_id=v_conteo_id
        and grupo_conteo_id=v_group_id;

      update inventario.estado_stock_grupo esg
      set
        estado=case
          when esg.snapshot_id=v_session.snapshot_referencia_id
            then 'Contado'
          else esg.estado
        end,
        updated_at=clock_timestamp()
      where esg.sede_id=v_sede_id
        and esg.grupo_conteo_id=v_group_id
        and esg.activo;

      if v_state='Recontar' then
        select s.id,x.stock_now
          into v_first_post,v_first_stock
        from inventario.snapshots s
        cross join lateral (
          select inventario.solog_stock_grupo_snapshot(
            s.id,
            v_group_id
          ) as stock_now
        ) x
        where s.sede_id=v_sede_id
          and s.estado='confirmado'
          and s.confirmado_at is not null
          and s.capturado_at>v_observed_at
          and x.stock_now is not null
        order by s.capturado_at asc,s.confirmado_at asc,s.id asc
        limit 1;

        if v_first_post is not null then
          update inventario.conteo_detalle
          set
            primer_snapshot_posterior_id=v_first_post,
            snapshot_posterior_id=v_first_post,
            stock_posterior=v_first_stock,
            updated_at=clock_timestamp()
          where id=v_detail_id;

          select s.id,x.stock_now
            into v_latest_post,v_latest_stock
          from inventario.snapshots s
          cross join lateral (
            select inventario.solog_stock_grupo_snapshot(
              s.id,
              v_group_id
            ) as stock_now
          ) x
          where s.sede_id=v_sede_id
            and s.estado='confirmado'
            and s.confirmado_at is not null
            and s.capturado_at>v_observed_at
            and x.stock_now is not null
          order by s.capturado_at desc,s.confirmado_at desc,s.id desc
          limit 1;

          if v_latest_post is distinct from v_first_post then
            update inventario.conteo_detalle
            set
              snapshot_posterior_id=v_latest_post,
              stock_posterior=v_latest_stock,
              updated_at=clock_timestamp()
            where id=v_detail_id;
          end if;
        end if;
      end if;

      select cd.diferencia,cd.estado_diferencia
        into v_diff,v_state
      from inventario.conteo_detalle cd
      where cd.id=v_detail_id;

      v_results:=v_results||jsonb_build_array(
        jsonb_build_object(
          'client_observation_id',v_client_id,
          'detalle_id',v_detail_id,
          'grupo_id',v_group_id,
          'stock_teorico',v_runtime.stock_teorico,
          'stock_fisico',v_stock_fisico,
          'motivo_diferencia',v_reason,
          'observacion_diferencia',v_observation,
          'diferencia',v_diff,
          'estado_diferencia',v_state,
          'contado_at',v_observed_at
        )
      );

      v_affected_groups:=array_append(
        v_affected_groups,
        v_group_id
      );

      v_saved:=v_saved+1;
    end loop;

    v_panel_delta:=inventario.solog_cashier_panel_delta_v4(
      v_conteo_id,
      v_affected_groups,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',5,
      'generated_at',clock_timestamp(),
      'action','save_batch',
      'replay',false,
      'conteo_id',v_conteo_id,
      'saved',v_saved,
      'items',v_results,
      'panel_delta',v_panel_delta,
      'session_capability',
        v_panel_delta->'session_capability',
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v5:save_batch',
      v_uid,
      v_operation_id,
      v_response
    );

  elsif p_action='recount_save_batch' then
    v_items:=p_payload->'items';

    if v_items is null
       or jsonb_typeof(v_items)<>'array'
       or jsonb_array_length(v_items)=0
       or jsonb_array_length(v_items)>500 then
      raise exception 'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD';
    end if;

    if exists(
      select 1
      from jsonb_array_elements(v_items) x(value)
      group by value->>'detalle_id'
      having count(*)>1
    ) then
      raise exception 'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD';
    end if;

    for v_item in
      select value from jsonb_array_elements(v_items)
    loop
      begin
        v_recount_detail:=(v_item->>'detalle_id')::uuid;
        v_recount_stock:=(v_item->>'stock_fisico')::integer;
        v_recount_at:=(v_item->>'contado_at')::timestamptz;
        if not (v_item ? 'motivo_diferencia' and v_item ? 'observacion_reconteo')
           or jsonb_typeof(v_item->'motivo_diferencia') not in ('string','null')
           or jsonb_typeof(v_item->'observacion_reconteo') not in ('string','null') then
          raise exception 'SOLOG_OBSERVATION_FIELDS_REQUIRED';
        end if;
        v_reason:=nullif(btrim(v_item->>'motivo_diferencia'),'');
        v_recount_observation:=nullif(btrim(v_item->>'observacion_reconteo'),'');
      exception when others then
        raise exception 'SOLOG_INVALID_RECOUNT_BATCH_ITEM';
      end;

      if v_recount_detail is null
         or v_recount_stock is null
         or v_recount_stock<0
         or v_recount_at is null then
        raise exception 'SOLOG_INVALID_RECOUNT_BATCH_ITEM';
      end if;

      perform inventario.solog_validate_session_observation_v4(
        v_conteo_id,
        v_recount_at,
        clock_timestamp()
      );

      select *
        into v_cd
      from inventario.conteo_detalle cd
      where cd.id=v_recount_detail
      for update;

      if not found
         or v_cd.estado_diferencia<>'Recontar'
         or v_cd.primer_snapshot_posterior_id is null
         or v_cd.stock_reconteo is not null then
        raise exception 'SOLOG_RECOUNT_NOT_PENDING';
      end if;

      if v_cd.conteo_id=v_conteo_id then
        raise exception 'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN';
      end if;

      if not exists(
        select 1
        from inventario.conteos origin
        where origin.id=v_cd.conteo_id
          and origin.sede_id=v_sede_id
          and origin.iniciado_at<v_session.iniciado_at
      ) then
        raise exception 'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN';
      end if;

      select *
        into v_runtime
      from inventario.solog_session_runtime_groups sg
      where sg.conteo_id=v_conteo_id
        and sg.grupo_conteo_id=v_cd.grupo_conteo_id
      for update;

      if not found
         or v_runtime.accion<>'recount'
         or v_runtime.detalle_reconteo_id
              is distinct from v_recount_detail then
        raise exception 'SOLOG_RECOUNT_NOT_PENDING';
      end if;

      if v_runtime.stock_teorico is null then
        raise exception 'SOLOG_RECOUNT_THEORETICAL_REQUIRED';
      end if;

      v_d0:=v_cd.stock_fisico-v_cd.stock_teorico;
      v_dr:=v_recount_stock-v_runtime.stock_teorico;

      if v_reason is not null and v_reason not in
          ('Transferencia','Venta por mayor','Dañado','Vencido','Otro motivo') then
        raise exception 'SOLOG_INVALID_DIFFERENCE_REASON';
      end if;
      if v_cd.motivo_diferencia is not null
         and v_reason is not null
         and v_cd.motivo_diferencia<>v_reason then
        raise exception 'SOLOG_DIFFERENCE_REASON_IMMUTABLE';
      end if;
      v_reason:=coalesce(v_cd.motivo_diferencia,v_reason);
      if v_dr=0 then
        v_recount_observation:='Resuelto';
      else
        if v_recount_observation='Resuelto'
           or (v_recount_observation is not null and char_length(v_recount_observation)<3)
           or (v_cd.motivo_diferencia is null and v_reason is not null and v_recount_observation is null)
           or (v_reason is null and v_recount_observation is not null) then
          raise exception 'SOLOG_INVALID_RECOUNT_OBSERVATION';
        end if;
        if abs(v_dr)>=12 and (v_reason is null or v_recount_observation is null) then
          raise exception 'SOLOG_RECOUNT_EXPLANATION_REQUIRED';
        end if;
      end if;

      if v_dr=0 then
        v_final_state:='Coincide';
        v_final_diff:=0;
      elsif (v_d0<0 and v_dr<0)
         or (v_d0>0 and v_dr>0) then
        v_final_state:='Confirmada';
        v_final_diff:=case
          when abs(v_dr)<abs(v_d0) then v_dr
          else v_d0
        end;
      else
        v_final_state:='Inconsistente';
        v_final_diff:=v_dr;
      end if;

      update inventario.conteo_detalle
      set
        snapshot_reconteo_id=v_session.snapshot_referencia_id,
        stock_teorico_reconteo=v_runtime.stock_teorico,
        stock_reconteo=v_recount_stock,
        recontado_at=v_recount_at,
        reconteo_conteo_id=v_conteo_id,
        motivo_diferencia=v_reason,
        observacion_reconteo=v_recount_observation,
        estado_diferencia=v_final_state,
        diferencia=v_final_diff,
        updated_at=clock_timestamp()
      where id=v_recount_detail;

      update inventario.solog_session_runtime_groups
      set
        accion='none',
        priority_class='none',
        recontado_at=v_recount_at,
        updated_at=clock_timestamp()
      where conteo_id=v_conteo_id
        and grupo_conteo_id=v_cd.grupo_conteo_id;

      update inventario.estado_stock_grupo esg
      set
        estado=case
          when v_final_state='Inconsistente'
            then 'Cambio_reciente'
          when esg.snapshot_id=v_session.snapshot_referencia_id
            then 'Contado'
          else esg.estado
        end,
        updated_at=clock_timestamp()
      where esg.sede_id=v_sede_id
        and esg.grupo_conteo_id=v_cd.grupo_conteo_id
        and esg.ultimo_conteo_detalle_id=v_recount_detail;

      select jsonb_build_object(
        'detalle_id',cd.id,
        'grupo_id',cd.grupo_conteo_id,
        'snapshot_reconteo_id',cd.snapshot_reconteo_id,
        'stock_teorico_reconteo',cd.stock_teorico_reconteo,
        'stock_reconteo',cd.stock_reconteo,
        'motivo_diferencia',cd.motivo_diferencia,
        'observacion_reconteo',cd.observacion_reconteo,
        'diferencia_reconteo',
          cd.stock_reconteo-cd.stock_teorico_reconteo,
        'diferencia',cd.diferencia,
        'estado_diferencia',cd.estado_diferencia,
        'valor_diferencia',cd.valor_diferencia,
        'recontado_at',cd.recontado_at
      )
      into v_item
      from inventario.conteo_detalle cd
      where cd.id=v_recount_detail;

      v_results:=v_results||jsonb_build_array(v_item);

      v_affected_groups:=array_append(
        v_affected_groups,
        v_cd.grupo_conteo_id
      );

      v_saved:=v_saved+1;
    end loop;

    v_panel_delta:=inventario.solog_cashier_panel_delta_v4(
      v_conteo_id,
      v_affected_groups,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',5,
      'generated_at',clock_timestamp(),
      'action','recount_save_batch',
      'replay',false,
      'conteo_id',v_conteo_id,
      'saved',v_saved,
      'items',v_results,
      'panel_delta',v_panel_delta,
      'session_capability',
        v_panel_delta->'session_capability',
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v5:recount_save_batch',
      v_uid,
      v_operation_id,
      v_response
    );

  else
    v_finish:=inventario.solog_finish_session_v4(
      v_conteo_id,
      clock_timestamp()
    );

    v_oper_rev:=inventario.solog_revision_bump(
      'operational',
      v_sede_id
    );

    v_response:=jsonb_build_object(
      'contract_version',5,
      'generated_at',clock_timestamp(),
      'action','finish',
      'replay',false,
      'conteo_id',v_conteo_id,
      'status',v_finish->>'estado',
      'finalizado_at',v_finish->'finalizado_at',
      'session_capability',jsonb_build_object(
        'mode','none',
        'estado',v_finish->>'estado',
        'capture_allowed',false,
        'pending_delivery_allowed',false,
        'expira_at',v_finish->'expira_at',
        'recovery_until',v_finish->'recovery_until',
        'finalizado_at',v_finish->'finalizado_at'
      ),
      'revisions',jsonb_build_object(
        'groups',v_session.groups_revision,
        'devices',inventario.solog_revision_get(
          'devices',
          v_sede_id
        ),
        'operational',v_oper_rev
      )
    );

    return inventario.solog_operation_finish(
      'cashier_v5:finish',
      v_uid,
      v_operation_id,
      v_response
    );
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.rpc_solog_cashier_mutate_v5(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_solog_cashier_mutate_v5(text,jsonb) TO authenticated;
