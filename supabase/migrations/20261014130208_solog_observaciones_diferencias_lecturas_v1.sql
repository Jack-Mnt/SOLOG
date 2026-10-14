-- SOLOG · Observaciones de diferencias · Backend Phase 2 · read contracts
-- Additive read fields; no changes to event count/order, filters, permissions or Motor semantics.
-- In Admin chronology the event observations distinguish initial/recount by timestamps.
-- A single coincidence-at-recount event can return both histories without inventing an extra event.

CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_history_v2(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_rol text; v_sede uuid; v_activo boolean;
  v_period text; v_date date; v_from timestamptz; v_to timestamptz; v_items jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  select u.rol::text,u.sede_id,u.activo into v_rol,v_sede,v_activo from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol<>'cajero' or v_sede is null then raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED'; end if;
  v_period:=lower(coalesce(nullif(btrim(p_payload->>'period'),''),'today'));
  if v_period='today' then v_date:=(now() at time zone 'America/Lima')::date;
  elsif v_period='yesterday' then v_date:=(now() at time zone 'America/Lima')::date-1;
  else raise exception 'SOLOG_INVALID_HISTORY_PERIOD'; end if;
  v_from:=v_date::timestamp at time zone 'America/Lima';
  v_to:=(v_date+1)::timestamp at time zone 'America/Lima';

  select coalesce(jsonb_agg(jsonb_build_object(
    'detalle_id',cd.id,'grupo_id',cd.grupo_conteo_id,'grupo',cd.grupo_nombre,'categoria',cd.categoria_nombre,
    'stock_teorico',cd.stock_teorico,'stock_fisico',cd.stock_fisico,'diferencia',cd.diferencia,'estado_diferencia',cd.estado_diferencia,
    'precio',cd.precio,'valor_diferencia',cd.valor_diferencia,'contado_at',cd.contado_at,
    'snapshot_referencia_id',cd.snapshot_referencia_id,'primer_snapshot_posterior_id',cd.primer_snapshot_posterior_id,
    'snapshot_posterior_id',cd.snapshot_posterior_id,'stock_posterior',cd.stock_posterior,
    'snapshot_reconteo_id',cd.snapshot_reconteo_id,'stock_teorico_reconteo',cd.stock_teorico_reconteo,
    'stock_reconteo',cd.stock_reconteo,'recontado_at',cd.recontado_at,
    'motivo_diferencia',cd.motivo_diferencia,
    'observacion_diferencia',cd.observacion_diferencia,
    'observacion_reconteo',cd.observacion_reconteo
  ) order by cd.contado_at desc,cd.id desc),'[]'::jsonb) into v_items
  from inventario.conteo_detalle cd
  join inventario.conteos c on c.id=cd.conteo_id
  where c.sede_id=v_sede and c.usuario_id=v_uid and cd.estado_diferencia <> 'Inválido' and cd.contado_at>=v_from and cd.contado_at<v_to;

  return jsonb_build_object('contract_version',2,'generated_at',now(),'period',v_period,'date',v_date,'items',v_items,
    'revisions',jsonb_build_object('operational',inventario.solog_revision_get('operational',v_sede)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solog_details_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_rol text; v_sede uuid; v_activo boolean; v_sede_nombre text;
  v_generated timestamptz:=now(); v_oper_rev bigint; v_devices_rev bigint;
  v_period text; v_date date; v_from timestamptz; v_to timestamptz;
  v_page_size integer:=100; v_cursor text; v_cursor_json jsonb; v_cursor_at timestamptz; v_cursor_id uuid; v_cursor_rev bigint;
  v_items jsonb:='[]'::jsonb; v_next text:=null; v_count integer:=0; v_last_at timestamptz; v_last_id uuid;
  v_case_id uuid; v_case jsonb; v_skus jsonb; v_chronology jsonb;
  v_device_token text; v_device_hash text; v_device_id uuid; v_device_estado text; v_device_sede uuid;
  v_authorized_id uuid; v_operation_id uuid; v_replay jsonb; v_response jsonb;
  v_period_from date; v_period_to date; v_summary jsonb; v_rows jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;
  select u.rol::text,u.sede_id,u.activo into v_rol,v_sede,v_activo from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol<>'cajero' or v_sede is null then raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED'; end if;
  select s.nombre into v_sede_nombre from public.sedes s where s.id=v_sede and s.activo;
  if not found then raise exception 'SOLOG_SEDE_NOT_FOUND'; end if;
  v_oper_rev:=inventario.solog_revision_get('operational',v_sede);
  v_devices_rev:=inventario.solog_revision_get('devices',v_sede);

  if p_action='summary' then
    v_device_token:=nullif(btrim(coalesce(p_payload->>'device_token','')),'');
    if v_device_token is not null then
      if length(v_device_token)<32 or length(v_device_token)>512 then raise exception 'SOLOG_INVALID_DEVICE_TOKEN'; end if;
      v_device_hash:=encode(extensions.digest(v_device_token,'sha256'),'hex');
      select d.id,d.estado,d.sede_id into v_device_id,v_device_estado,v_device_sede from inventario.dispositivos_solog d where d.device_hash=v_device_hash;
    end if;
    select d.id into v_authorized_id from inventario.dispositivos_solog d where d.sede_id=v_sede and d.estado='autorizado' limit 1;


    with op as (
      select inventario.solog_cashier_operational_summary_v4(v_sede,v_generated) as j
    )
    select jsonb_build_object(
      'periodo',jsonb_build_object(
        'desde',op.j->'basis'->>'periodo_desde',
        'hasta',op.j->'basis'->>'periodo_hasta',
        'inaugurada',coalesce((op.j->'kpis'->>'coverage_total')::integer,0)>0,
        'grupos_contados',coalesce((op.j->'kpis'->>'coverage_counted')::integer,0),
        'grupos_totales',coalesce((op.j->'kpis'->>'coverage_total')::integer,0),
        'pendientes',coalesce((op.j->'kpis'->>'coverage_pending')::integer,0),
        'porcentaje',coalesce((op.j->'kpis'->>'coverage_percent')::numeric,0),
        'completa',coalesce((op.j->'kpis'->>'coverage_pending')::integer,0)=0
      ),
      'diaria',jsonb_build_object(
        'fecha',(v_generated at time zone 'America/Lima')::date,
        'grupos_requeridos',coalesce((op.j->'kpis'->>'daily_pending')::integer,0),
        'grupos_verificados',0,
        'pendientes',coalesce((op.j->'kpis'->>'daily_pending')::integer,0),
        'porcentaje',case when coalesce((op.j->'kpis'->>'daily_pending')::integer,0)=0 then 100 else 0 end,
        'sin_requerimientos',coalesce((op.j->'kpis'->>'daily_pending')::integer,0)=0
      ),
      'conteo_diario_pendientes',coalesce((op.j->'kpis'->>'daily_pending')::integer,0),
      'revisar_pendientes',coalesce((op.j->'kpis'->>'review_pending')::integer,0),
      'ultimo_snapshot',(
        select jsonb_build_object(
          'id',s.id,
          'capturado_at',s.capturado_at,
          'confirmado_at',s.confirmado_at,
          'version_catalogo',s.version_catalogo
        )
        from inventario.snapshots s
        where s.sede_id=v_sede
          and s.estado='confirmado'
          and s.confirmado_at is not null
        order by s.confirmado_at desc,s.capturado_at desc,s.id desc
        limit 1
      )
    )
    into v_summary
    from op;

    return jsonb_build_object('contract_version',2,'generated_at',v_generated,
      'revisions',jsonb_build_object('operational',v_oper_rev,'devices',v_devices_rev),
      'site',jsonb_build_object('id',v_sede,'nombre',v_sede_nombre),'summary',v_summary,
      'access',jsonb_build_object('authorized_device_id',v_authorized_id,'current_device_id',v_device_id,'current_device_state',coalesce(v_device_estado,'sin_solicitud'),
        'current_device_matches_site',v_device_sede is null or v_device_sede=v_sede,'can_request',v_authorized_id is null and (v_device_sede is null or v_device_sede=v_sede)));

  elsif p_action='history' then
    v_period:=lower(coalesce(nullif(btrim(p_payload->>'period'),''),'today'));
    if v_period='today' then v_date:=(v_generated at time zone 'America/Lima')::date;
    elsif v_period='yesterday' then v_date:=(v_generated at time zone 'America/Lima')::date-1;
    else raise exception 'SOLOG_INVALID_HISTORY_PERIOD'; end if;
    v_from:=v_date::timestamp at time zone 'America/Lima';
    v_to:=(v_date+1)::timestamp at time zone 'America/Lima';
    begin v_page_size:=coalesce(nullif(p_payload->>'page_size','')::integer,100); exception when others then raise exception 'SOLOG_INVALID_PAGE_SIZE'; end;
    if v_page_size<1 or v_page_size>100 then raise exception 'SOLOG_INVALID_PAGE_SIZE'; end if;
    v_cursor:=nullif(p_payload->>'cursor','');
    if v_cursor is not null then
      v_cursor_json:=inventario.solog_cursor_decode(v_cursor);
      begin
        v_cursor_at:=(v_cursor_json->>'at')::timestamptz;
        v_cursor_id:=(v_cursor_json->>'id')::uuid;
        v_cursor_rev:=(v_cursor_json->>'revision')::bigint;
      exception when others then raise exception 'SOLOG_PAGE_CURSOR_INVALID'; end;
      if v_cursor_json->>'period' is distinct from v_period or v_cursor_rev<>v_oper_rev then raise exception 'SOLOG_PAGE_CURSOR_INVALID'; end if;
    end if;

    with page as (
      select cd.id,cd.grupo_conteo_id,cd.grupo_nombre,cd.categoria_nombre,cd.contado_at,cd.stock_teorico,cd.stock_fisico,
             cd.diferencia,cd.estado_diferencia,cd.valor_diferencia,cd.recontado_at,
             row_number() over(order by cd.contado_at desc,cd.id desc) rn
      from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id
      where c.sede_id=v_sede and cd.estado_diferencia <> 'Inválido' and cd.contado_at>=v_from and cd.contado_at<v_to
        and (v_cursor_at is null or (cd.contado_at,cd.id)<(v_cursor_at,v_cursor_id))
      order by cd.contado_at desc,cd.id desc
      limit v_page_size+1
    ), trimmed as (select * from page where rn<=v_page_size)
    select coalesce(jsonb_agg(jsonb_build_object(
      'case_id',t.id,'grupo_id',t.grupo_conteo_id,'grupo',t.grupo_nombre,'categoria',t.categoria_nombre,
      'contado_at',t.contado_at,'stock_teorico',t.stock_teorico,'stock_fisico',t.stock_fisico,'diferencia',t.diferencia,
      'estado_diferencia',t.estado_diferencia,'valor_diferencia',t.valor_diferencia,'recontado_at',t.recontado_at
    ) order by t.contado_at desc,t.id desc),'[]'::jsonb),count(*)::integer,
      (select t2.contado_at from trimmed t2 order by t2.contado_at asc,t2.id asc limit 1),
      (select t2.id from trimmed t2 order by t2.contado_at asc,t2.id asc limit 1),
      (select count(*)>v_page_size from page)
    into v_items,v_count,v_last_at,v_last_id,v_activo
    from trimmed t;

    if coalesce(v_activo,false) and v_last_id is not null then
      v_next:=inventario.solog_cursor_encode(jsonb_build_object('period',v_period,'revision',v_oper_rev,'at',v_last_at,'id',v_last_id));
    end if;
    return jsonb_build_object('contract_version',2,'generated_at',v_generated,'revisions',jsonb_build_object('operational',v_oper_rev),
      'period',v_period,'date',v_date,'items',v_items,'next_cursor',v_next,'page_size',v_page_size);

  elsif p_action='detail' then
    begin v_case_id:=(p_payload->>'case_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_CASE_ID'; end;
    if v_case_id is null then raise exception 'SOLOG_INVALID_CASE_ID'; end if;
    select jsonb_build_object(
      'case_id',cd.id,'grupo_id',cd.grupo_conteo_id,'grupo',cd.grupo_nombre,'categoria',cd.categoria_nombre,'tipo_grupo',cd.tipo_grupo,
      'codigos_internos',to_jsonb(cd.codigos_internos),'snapshot_referencia_id',cd.snapshot_referencia_id,
      'stock_teorico',cd.stock_teorico,'stock_fisico',cd.stock_fisico,'diferencia_inicial',cd.stock_fisico-cd.stock_teorico,
      'primer_snapshot_posterior_id',cd.primer_snapshot_posterior_id,'snapshot_posterior_id',cd.snapshot_posterior_id,'stock_posterior',cd.stock_posterior,
      'snapshot_reconteo_id',cd.snapshot_reconteo_id,'stock_teorico_reconteo',cd.stock_teorico_reconteo,'stock_reconteo',cd.stock_reconteo,
      'diferencia_reconteo',case when cd.stock_reconteo is not null and cd.stock_teorico_reconteo is not null then cd.stock_reconteo-cd.stock_teorico_reconteo else null end,
      'diferencia',cd.diferencia,'estado_diferencia',cd.estado_diferencia,'precio',cd.precio,'unidades_por_paquete',cd.unidades_por_paquete,'precio_paquete',cd.precio_paquete,
      'valor_diferencia',cd.valor_diferencia,'contado_at',cd.contado_at,'recontado_at',cd.recontado_at,
      'motivo_diferencia',cd.motivo_diferencia,'observacion_diferencia',cd.observacion_diferencia,
      'observacion_reconteo',cd.observacion_reconteo
    ) into v_case
    from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id
    where cd.id=v_case_id and c.sede_id=v_sede and cd.estado_diferencia <> 'Inválido';
    if v_case is null then raise exception 'SOLOG_CASE_NOT_FOUND'; end if;

    select coalesce(jsonb_agg(jsonb_build_object('c_interno',x.code,'producto',cat.producto,'marca',cat.marca,'precio_actual',cat.precio) order by x.code),'[]'::jsonb)
      into v_skus
    from unnest(coalesce((select codigos_internos from inventario.conteo_detalle where id=v_case_id),'{}'::integer[])) x(code)
    left join inventario.catalogo cat on cat.c_interno=x.code;

    select coalesce(jsonb_agg(jsonb_build_object('case_id',cd.id,'contado_at',cd.contado_at,'estado_diferencia',cd.estado_diferencia,'diferencia',cd.diferencia,'recontado_at',cd.recontado_at) order by cd.contado_at desc,cd.id desc),'[]'::jsonb)
      into v_chronology
    from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id
    where c.sede_id=v_sede and cd.grupo_conteo_id=(v_case->>'grupo_id')::uuid and cd.estado_diferencia <> 'Inválido'
    limit 100;

    return jsonb_build_object('contract_version',2,'generated_at',v_generated,'revisions',jsonb_build_object('operational',v_oper_rev),
      'case',v_case,'skus',v_skus,'chronology',v_chronology);

  elsif p_action='export' then
    v_period:=lower(coalesce(nullif(btrim(p_payload->>'period'),''),'current_biweekly'));
    if v_period='current_biweekly' then
      v_period_from:=inventario.solog_periodo_desde(v_generated); v_period_to:=inventario.solog_periodo_hasta(v_generated);
    elsif v_period='previous_biweekly' then
      v_period_to:=inventario.solog_periodo_desde(v_generated)-1; v_period_from:=inventario.solog_periodo_desde((v_period_to::timestamp at time zone 'America/Lima'));
    else raise exception 'SOLOG_EXPORT_PERIOD_INVALID'; end if;
    v_from:=v_period_from::timestamp at time zone 'America/Lima';
    v_to:=(v_period_to+1)::timestamp at time zone 'America/Lima';

    with eligible as (
      select cd.*
      from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id
      where c.sede_id=v_sede and cd.contado_at>=v_from and cd.contado_at<v_to
        and cd.estado_diferencia in ('Confirmada','Inconsistente')
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'case_id',e.id,'fecha_origen',e.contado_at,'grupo',e.grupo_nombre,'categoria',e.categoria_nombre,'estado',e.estado_diferencia,
      'teorico',case when e.stock_reconteo is not null then e.stock_teorico_reconteo else e.stock_teorico end,
      'fisico',case when e.stock_reconteo is not null then e.stock_reconteo else e.stock_fisico end,
      'diferencia',e.diferencia,'valorizado',case when e.estado_diferencia='Inconsistente' then null else e.valor_diferencia end,
      'precio',e.precio,'unidades_por_paquete',e.unidades_por_paquete,'precio_paquete',e.precio_paquete,'recontado_at',e.recontado_at
    ) order by e.contado_at,e.id),'[]'::jsonb),
    jsonb_build_object('diferencias_finales',count(*),'confirmadas',count(*) filter(where e.estado_diferencia='Confirmada'),'inconsistentes',count(*) filter(where e.estado_diferencia='Inconsistente'),
      'faltantes',count(*) filter(where e.diferencia<0),'sobrantes',count(*) filter(where e.diferencia>0),
      'valorizado_faltantes',coalesce(sum(e.valor_diferencia) filter(where e.estado_diferencia='Confirmada' and e.diferencia<0),0),
      'valorizado_sobrantes',coalesce(sum(e.valor_diferencia) filter(where e.estado_diferencia='Confirmada' and e.diferencia>0),0))
    into v_rows,v_summary from eligible e;
    return jsonb_build_object('contract_version',2,'generated_at',v_generated,'revisions',jsonb_build_object('operational',v_oper_rev),
      'site',jsonb_build_object('id',v_sede,'nombre',v_sede_nombre),'period',jsonb_build_object('key',v_period,'from',v_period_from,'to',v_period_to),'summary',v_summary,'rows',v_rows);

  elsif p_action='request_access' then
    begin v_operation_id:=(p_payload->>'operation_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_OPERATION'; end;
    if v_operation_id is null then raise exception 'SOLOG_INVALID_OPERATION'; end if;
    v_replay:=inventario.solog_operation_begin('details:request_access',v_uid,v_operation_id,p_payload-'device_token');
    if v_replay is not null then return v_replay||jsonb_build_object('replay',true); end if;
    v_device_token:=nullif(btrim(coalesce(p_payload->>'device_token','')),'');
    if v_device_token is null or length(v_device_token)<32 or length(v_device_token)>512 then raise exception 'SOLOG_DEVICE_REQUIRED'; end if;
    v_device_hash:=encode(extensions.digest(v_device_token,'sha256'),'hex');
    perform 1 from public.sedes s where s.id=v_sede and s.activo for update;
    select d.id into v_authorized_id from inventario.dispositivos_solog d where d.sede_id=v_sede and d.estado='autorizado' limit 1 for update;
    select d.id,d.estado,d.sede_id into v_device_id,v_device_estado,v_device_sede from inventario.dispositivos_solog d where d.device_hash=v_device_hash for update;
    if found and v_device_sede<>v_sede then raise exception 'SOLOG_DEVICE_SEDE_MISMATCH'; end if;

    if v_authorized_id is not null then
      v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'status','site_already_authorized','authorized_device_id',v_authorized_id,
        'revisions',jsonb_build_object('devices',inventario.solog_revision_get('devices',v_sede)));
      return inventario.solog_operation_finish('details:request_access',v_uid,v_operation_id,v_response);
    end if;

    if v_device_id is null then
      insert into inventario.dispositivos_solog(sede_id,device_hash,estado,solicitado_por,solicitado_at,ultimo_acceso_at,created_at,updated_at)
      values(v_sede,v_device_hash,'pendiente',v_uid,now(),now(),now(),now()) returning id,estado into v_device_id,v_device_estado;
    elsif v_device_estado='pendiente' then
      update inventario.dispositivos_solog set ultimo_acceso_at=now(),updated_at=now() where id=v_device_id;
    elsif v_device_estado='autorizado' then
      null;
    else
      update inventario.dispositivos_solog set estado='pendiente',solicitado_por=v_uid,solicitado_at=now(),autorizado_por=null,autorizado_at=null,revocado_at=null,ultimo_acceso_at=now(),updated_at=now()
      where id=v_device_id returning estado into v_device_estado;
    end if;
    v_devices_rev:=inventario.solog_revision_bump('devices',v_sede);
    v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'status',case when v_device_estado='autorizado' then 'authorized' else 'pending' end,
      'device_id',v_device_id,'revisions',jsonb_build_object('devices',v_devices_rev));
    return inventario.solog_operation_finish('details:request_access',v_uid,v_operation_id,v_response);
  else
    raise exception 'SOLOG_INVALID_DETAILS_ACTION';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION inventario.solog_control_chronology_view_v1(p_uid uuid, p_site uuid, p_generated timestamp with time zone, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group uuid;
  v_period text;
  v_today date;
  v_cutoff date;
  v_from_date date;
  v_to_date date;
  v_from timestamptz;
  v_to timestamptz;
  v_group_name text;
  v_category text;
  v_rows jsonb;
  v_latest_price numeric;
  v_invalid integer;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as k(key)
    where k.key not in ('site_id','group_id','period')
  ) then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  begin
    v_group := (p_payload->>'group_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_GROUP';
  end;
  if v_group is null then
    raise exception 'SOLOG_INVALID_GROUP';
  end if;

  v_today := (p_generated at time zone 'America/Lima')::date;
  v_cutoff := v_today - 44;
  v_period := lower(nullif(btrim(p_payload->>'period'),''));

  if v_period='current_biweekly' then
    v_from_date := inventario.solog_periodo_desde(p_generated);
    v_to_date := inventario.solog_periodo_hasta(p_generated);
  elsif v_period='previous_counts' then
    v_from_date := v_cutoff;
    v_to_date := inventario.solog_periodo_desde(p_generated)-1;
  else
    raise exception 'SOLOG_INVALID_CHRONOLOGY_PERIOD';
  end if;

  v_from := v_from_date::timestamp at time zone 'America/Lima';
  v_to := (v_to_date+1)::timestamp at time zone 'America/Lima';

  select coalesce(g.nombre,x.grupo_nombre),coalesce(cat.nombre,x.categoria_nombre)
    into v_group_name,v_category
  from inventario.grupos_conteo g
  left join inventario.categorias cat on cat.id=g.categoria_id
  left join lateral (
    select cd.grupo_nombre,cd.categoria_nombre
    from inventario.conteo_detalle cd
    join inventario.conteos c on c.id=cd.conteo_id
    where c.sede_id=p_site
      and cd.grupo_conteo_id=v_group
    order by cd.contado_at desc,cd.id desc
    limit 1
  ) x on true
  where g.id=v_group;

  if v_group_name is null then
    select cd.grupo_nombre,cd.categoria_nombre
      into v_group_name,v_category
    from inventario.conteo_detalle cd
    join inventario.conteos c on c.id=cd.conteo_id
    where c.sede_id=p_site
      and cd.grupo_conteo_id=v_group
    order by cd.contado_at desc,cd.id desc
    limit 1;
  end if;

  if v_group_name is null then
    raise exception 'SOLOG_INVALID_GROUP';
  end if;

  with cases as materialized (
    select
      cd.*,
      sp.capturado_at as snapshot_resolution_at,
      cd.stock_fisico-cd.stock_teorico as initial_difference,
      case
        when cd.stock_reconteo is not null
         and cd.stock_teorico_reconteo is not null
        then cd.stock_reconteo-cd.stock_teorico_reconteo
        else null
      end as recount_difference
    from inventario.conteo_detalle cd
    join inventario.conteos c on c.id=cd.conteo_id
    left join inventario.snapshots sp on sp.id=cd.snapshot_posterior_id
    where c.sede_id=p_site
      and cd.grupo_conteo_id=v_group
      and cd.contado_at>=v_from
      and cd.contado_at<v_to
  ),
  functional_rows as (
    select
      c.id::text||':recontar' as row_id,
      c.id as case_id,
      c.contado_at as event_at,
      'Recontar'::text as state,
      null::numeric as stock,
      c.stock_fisico::numeric as physical,
      c.initial_difference::numeric as difference,
      null::numeric as valued_difference,
      null::numeric as theoretical,
      null::numeric as initial_difference,
      null::numeric as found_difference,
      c.precio::numeric as unit_price,
      1 as stage_order
    from cases c
    where c.estado_diferencia='Recontar'

    union all

    select
      c.id::text||':coincide-initial',
      c.id,
      c.contado_at,
      'Coincide',
      c.stock_fisico::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      c.precio::numeric,
      1
    from cases c
    where c.estado_diferencia='Coincide'
      and c.stock_reconteo is null
      and c.primer_snapshot_posterior_id is null

    union all

    select
      c.id::text||':coincide-recount',
      c.id,
      c.recontado_at,
      'Coincide',
      c.stock_reconteo::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      c.precio::numeric,
      1
    from cases c
    where c.estado_diferencia='Coincide'
      and c.stock_reconteo is not null

    union all

    select
      c.id::text||':coincide-snapshot',
      c.id,
      c.snapshot_resolution_at,
      'Coincide',
      c.stock_fisico::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      c.precio::numeric,
      1
    from cases c
    where c.estado_diferencia='Coincide'
      and c.stock_reconteo is null
      and c.primer_snapshot_posterior_id is not null

    union all

    select
      c.id::text||':recontado',
      c.id,
      c.contado_at,
      'Recontado',
      null::numeric,
      c.stock_fisico::numeric,
      c.initial_difference::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      null::numeric,
      c.precio::numeric,
      1
    from cases c
    where c.estado_diferencia in ('Confirmada','Inconsistente')

    union all

    select
      c.id::text||':resolved',
      c.id,
      c.recontado_at,
      c.estado_diferencia,
      null::numeric,
      null::numeric,
      case
        when c.estado_diferencia='Confirmada'
        then c.recount_difference::numeric
        else null::numeric
      end,
      case
        when c.estado_diferencia='Confirmada'
        then inventario.solog_calcular_valor_diferencia(
          c.recount_difference,
          c.precio,
          c.unidades_por_paquete,
          c.precio_paquete
        )
        else null::numeric
      end,
      case
        when c.estado_diferencia='Inconsistente'
        then c.stock_teorico_reconteo::numeric
        else null::numeric
      end,
      case
        when c.estado_diferencia='Inconsistente'
        then c.initial_difference::numeric
        else null::numeric
      end,
      case
        when c.estado_diferencia='Inconsistente'
        then c.recount_difference::numeric
        else null::numeric
      end,
      c.precio::numeric,
      2
    from cases c
    where c.estado_diferencia in ('Confirmada','Inconsistente')
  )
  select
    (
      select count(*)::integer
      from cases c
      where c.estado_diferencia in ('Confirmada','Inconsistente')
        and (
          c.stock_reconteo is null
          or c.stock_teorico_reconteo is null
          or c.recontado_at is null
        )
    ),
    (
      select fr.unit_price
      from functional_rows fr
      where fr.event_at is not null
      order by fr.event_at desc,fr.case_id desc,fr.stage_order desc
      limit 1
    ),
    coalesce((
      select jsonb_agg(
        case fr.state
          when 'Coincide' then jsonb_build_object(
            'row_id',fr.row_id,'event_at',fr.event_at,'state',fr.state,'stock',fr.stock
          )
          when 'Recontar' then jsonb_build_object(
            'row_id',fr.row_id,'event_at',fr.event_at,'state',fr.state,'physical',fr.physical,'difference',fr.difference
          )
          when 'Recontado' then jsonb_build_object(
            'row_id',fr.row_id,'event_at',fr.event_at,'state',fr.state,'physical',fr.physical,'difference',fr.difference
          )
          when 'Confirmada' then jsonb_build_object(
            'row_id',fr.row_id,'event_at',fr.event_at,'state',fr.state,'difference',fr.difference,'valued_difference',fr.valued_difference
          )
          when 'Inconsistente' then jsonb_build_object(
            'row_id',fr.row_id,'event_at',fr.event_at,'state',fr.state,'theoretical',fr.theoretical,'initial_difference',fr.initial_difference,'found_difference',fr.found_difference
          )
        end ||
          jsonb_build_object(
            'observaciones',
            jsonb_build_object(
              'inicial',case
                when cd.observacion_diferencia is not null
                 and (fr.row_id like '%:recontar'
                   or fr.row_id like '%:recontado'
                   or fr.row_id like '%:coincide-initial'
                   or fr.row_id like '%:coincide-recount')
                  then jsonb_build_object(
                    'motivo',cd.motivo_diferencia,
                    'texto',cd.observacion_diferencia,
                    'registrada_at',cd.contado_at)
                else null end,
              'reconteo',case
                when cd.observacion_reconteo is not null
                 and (fr.row_id like '%:coincide-recount'
                   or fr.row_id like '%:resolved')
                  then jsonb_build_object(
                    'motivo',cd.motivo_diferencia,
                    'texto',cd.observacion_reconteo,
                    'registrada_at',cd.recontado_at)
                else null end
            )
          )
        order by fr.event_at desc,fr.case_id desc,fr.stage_order desc
      )
      from functional_rows fr
      join inventario.conteo_detalle cd on cd.id=fr.case_id
      where fr.event_at is not null
    ),'[]'::jsonb)
  into v_invalid,v_latest_price,v_rows;

  if v_invalid>0 then
    raise exception 'SOLOG_CHRONOLOGY_RECOUNT_MISSING';
  end if;

  return jsonb_build_object(
    'contract_version',2,
    'generated_at',p_generated,
    'revisions',jsonb_build_object(
      'operational',inventario.solog_revision_get('operational',p_site)
    ),
    'site_id',p_site,
    'group',jsonb_build_object(
      'id',v_group,
      'name',v_group_name,
      'category',v_category,
      'latest_unit_price',v_latest_price
    ),
    'period',jsonb_build_object(
      'key',v_period,
      'from',v_from_date,
      'to',v_to_date
    ),
    'chronology',v_rows
  );
end;
$function$;

