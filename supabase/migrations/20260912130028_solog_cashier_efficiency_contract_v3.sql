-- SOLOG Cajero V3 — migración sincronizada desde runtime desplegado.
-- Runtime Supabase: 20260912130028_solog_cashier_efficiency_contract_v3
-- Fuente contractual: docs/SOLOG_Backend_Cajero_Eficiencia_Contrato_V1.md

CREATE OR REPLACE FUNCTION inventario.solog_cashier_pre_session_summary_v3(p_sede_id uuid, p_period_from date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer:=0;
  v_covered integer:=0;
  v_count_pending integer:=0;
  v_review_pending integer:=0;
  v_positive_total integer:=0;
  v_positive_covered integer:=0;
  v_zero_total integer:=0;
  v_zero_covered integer:=0;
  v_negative_total integer:=0;
  v_negative_covered integer:=0;
begin
  if p_sede_id is null or p_period_from is null then
    raise exception 'SOLOG_INVALID_PRE_SESSION_SUMMARY';
  end if;

  with eligible as (
    select
      esg.stock_actual,
      esg.cobertura_periodo,
      esg.estado,
      (cd.id is not null) as pending_recount
    from inventario.estado_stock_grupo esg
    left join inventario.conteo_detalle cd
      on cd.id=esg.ultimo_conteo_detalle_id
     and cd.estado_diferencia='Recontar'
     and cd.primer_snapshot_posterior_id is not null
     and cd.stock_reconteo is null
    where esg.sede_id=p_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo
      and esg.cobertura_periodo_desde=p_period_from
  )
  select
    count(*)::integer,
    count(*) filter(where cobertura_periodo)::integer,
    count(*) filter(where not pending_recount and (not cobertura_periodo or (cobertura_periodo and estado='Cambio_reciente')))::integer,
    count(*) filter(where pending_recount)::integer,
    count(*) filter(where stock_actual>0)::integer,
    count(*) filter(where stock_actual>0 and cobertura_periodo)::integer,
    count(*) filter(where stock_actual=0)::integer,
    count(*) filter(where stock_actual=0 and cobertura_periodo)::integer,
    count(*) filter(where stock_actual<0)::integer,
    count(*) filter(where stock_actual<0 and cobertura_periodo)::integer
  into
    v_total,v_covered,v_count_pending,v_review_pending,
    v_positive_total,v_positive_covered,
    v_zero_total,v_zero_covered,
    v_negative_total,v_negative_covered
  from eligible;

  return jsonb_build_object(
    'groups_total',v_total,
    'coverage_counted',v_covered,
    'coverage_percent',case when v_total>0 then round(v_covered::numeric*100/v_total,1) else 0 end,
    'count_pending',v_count_pending,
    'review_pending',v_review_pending,
    'stock_types',jsonb_build_object(
      'positive',jsonb_build_object('total',v_positive_total,'covered',v_positive_covered),
      'zero',jsonb_build_object('total',v_zero_total,'covered',v_zero_covered),
      'negative',jsonb_build_object('total',v_negative_total,'covered',v_negative_covered)
    )
  );
end;
$function$

CREATE OR REPLACE FUNCTION inventario.solog_cashier_session_kpis_v3(p_conteo_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'groups_total',count(*)::integer,
    'coverage_counted',count(*) filter(where sg.cobertura_periodo)::integer,
    'coverage_percent',case when count(*)>0 then round((count(*) filter(where sg.cobertura_periodo))::numeric*100/count(*),1) else 0 end,
    'count_pending',count(*) filter(where sg.requiere_conteo)::integer,
    'review_pending',count(*) filter(where sg.requiere_reconteo)::integer
  )
  from inventario.solog_session_groups sg
  where sg.conteo_id=p_conteo_id
$function$

CREATE OR REPLACE FUNCTION inventario.solog_cashier_panel_state_v3(p_conteo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state jsonb;
begin
  v_state:=inventario.solog_cashier_session_state(p_conteo_id);
  return v_state || jsonb_build_object(
    'source','session',
    'frozen',true,
    'basis',jsonb_build_object(
      'snapshot_referencia_id',v_state->'session'->'snapshot_referencia_id',
      'version_catalogo',v_state->'session'->'version_catalogo',
      'groups_revision',v_state->'session'->'groups_revision',
      'periodo_desde',v_state->'session'->'periodo_desde',
      'periodo_hasta',v_state->'session'->'periodo_hasta'
    )
  );
end;
$function$

CREATE OR REPLACE FUNCTION inventario.solog_cashier_session_capability_v3(p_conteo_id uuid, p_authorized boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estado text;
  v_expira_at timestamptz;
  v_recovery_until timestamptz;
  v_mode text;
begin
  if p_conteo_id is null then
    return jsonb_build_object('mode','none','capture_allowed',false,'pending_delivery_allowed',false,'recovery_until',null);
  end if;

  select c.estado,c.expira_at,c.expira_at+interval '2 hours'
    into v_estado,v_expira_at,v_recovery_until
  from inventario.conteos c
  where c.id=p_conteo_id;

  if not found or v_estado<>'activo' or now()>=v_recovery_until then
    return jsonb_build_object('mode','none','capture_allowed',false,'pending_delivery_allowed',false,'recovery_until',null);
  end if;

  v_mode:=case when now()<v_expira_at then 'active' else 'recovery' end;
  return jsonb_build_object(
    'mode',v_mode,
    'capture_allowed',coalesce(p_authorized,false) and v_mode='active',
    'pending_delivery_allowed',coalesce(p_authorized,false),
    'recovery_until',v_recovery_until
  );
end;
$function$

revoke all on function inventario.solog_cashier_pre_session_summary_v3(uuid,date) from public,anon,authenticated;
revoke all on function inventario.solog_cashier_session_kpis_v3(uuid) from public,anon,authenticated;
revoke all on function inventario.solog_cashier_panel_state_v3(uuid) from public,anon,authenticated;
revoke all on function inventario.solog_cashier_session_capability_v3(uuid,boolean) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_bootstrap_v3(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_nombre text; v_rol text; v_sede_id uuid; v_activo boolean; v_sede_nombre text;
  v_token text; v_hash text; v_device_id uuid; v_device_estado text; v_device_sede uuid;
  v_authorized_exists boolean:=false; v_authorized boolean:=false;
  v_conteo_id uuid; v_panel_state jsonb:=null; v_pre_session_summary jsonb:=null;
  v_snapshot_id uuid; v_snapshot_at timestamptz; v_confirmado_at timestamptz; v_version integer; v_snapshot_expira_at timestamptz;
  v_stock_snapshot_id uuid; v_stock_snapshot_at timestamptz; v_stock_confirmado_at timestamptz; v_stock_version integer; v_stock_expira_at timestamptz;
  v_groups_rev bigint; v_devices_rev bigint; v_oper_rev bigint;
  v_cov jsonb; v_can_start boolean:=false; v_reason text:=null;
  v_period_from date; v_period_to date;
  v_session_capability jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;

  select u.nombre,u.rol::text,u.sede_id,u.activo
    into v_nombre,v_rol,v_sede_id,v_activo
  from public.usuarios u
  where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol<>'cajero' then raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED'; end if;
  if v_sede_id is null then raise exception 'SOLOG_CASHIER_WITHOUT_SEDE'; end if;

  select s.nombre into v_sede_nombre
  from public.sedes s
  where s.id=v_sede_id and s.activo;
  if not found then raise exception 'SOLOG_SEDE_NOT_FOUND'; end if;

  select exists(
    select 1 from inventario.dispositivos_solog d
    where d.sede_id=v_sede_id and d.estado='autorizado'
  ) into v_authorized_exists;

  v_token:=nullif(btrim(coalesce(p_payload->>'device_token','')),'');
  if v_token is not null then
    if length(v_token)<32 or length(v_token)>512 then raise exception 'SOLOG_INVALID_DEVICE_TOKEN'; end if;
    v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
    select d.id,d.estado,d.sede_id
      into v_device_id,v_device_estado,v_device_sede
    from inventario.dispositivos_solog d
    where d.device_hash=v_hash;
    v_authorized:=found and v_device_sede=v_sede_id and v_device_estado='autorizado';
  else
    v_device_estado:='token_requerido';
    v_device_sede:=v_sede_id;
  end if;

  update inventario.conteos
  set estado='expirado',finalizado_at=coalesce(finalizado_at,expira_at+interval '2 hours'),updated_at=now()
  where sede_id=v_sede_id and estado='activo' and now()>=expira_at+interval '2 hours';

  select c.id into v_conteo_id
  from inventario.conteos c
  where c.sede_id=v_sede_id
    and c.usuario_id=v_uid
    and c.estado='activo'
    and now()<c.expira_at+interval '2 hours'
  order by c.iniciado_at desc
  limit 1;

  select s.id,s.capturado_at,s.confirmado_at,s.version_catalogo
    into v_snapshot_id,v_snapshot_at,v_confirmado_at,v_version
  from inventario.snapshots s
  where s.sede_id=v_sede_id and s.estado='confirmado' and s.confirmado_at is not null
  order by s.confirmado_at desc,s.capturado_at desc,s.id desc
  limit 1;
  if v_snapshot_id is not null then v_snapshot_expira_at:=inventario.solog_snapshot_expira_at(v_snapshot_at); end if;

  v_groups_rev:=inventario.solog_revision_get('groups',null);
  v_devices_rev:=inventario.solog_revision_get('devices',v_sede_id);
  v_oper_rev:=inventario.solog_revision_get('operational',v_sede_id);
  v_period_from:=inventario.solog_periodo_desde(now());
  v_period_to:=inventario.solog_periodo_hasta(now());
  v_cov:=inventario.solog_cobertura(v_sede_id,now());

  if not v_authorized then v_reason:='SOLOG_DEVICE_UNAUTHORIZED';
  elsif v_conteo_id is not null then v_reason:='SOLOG_SESSION_CONFLICT';
  elsif v_snapshot_id is null then v_reason:='SOLOG_CONFIRMED_SNAPSHOT_REQUIRED';
  elsif now()>=v_snapshot_expira_at then v_reason:='SOLOG_STOCK_EXPIRED';
  elsif now()>=v_snapshot_expira_at-interval '5 minutes' then v_reason:='SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY';
  elsif not coalesce((v_cov->'periodo'->>'inaugurada')::boolean,false) then v_reason:='SOLOG_OPERATIONAL_PERIOD_NOT_STARTED';
  else v_can_start:=true;
  end if;

  if v_authorized and v_conteo_id is not null and exists(
    select 1 from inventario.solog_session_groups sg where sg.conteo_id=v_conteo_id
  ) then
    v_panel_state:=inventario.solog_cashier_panel_state_v3(v_conteo_id);
    v_session_capability:=inventario.solog_cashier_session_capability_v3(v_conteo_id,true);

    select s.id,s.capturado_at,s.confirmado_at,s.version_catalogo
      into v_stock_snapshot_id,v_stock_snapshot_at,v_stock_confirmado_at,v_stock_version
    from inventario.conteos c
    join inventario.snapshots s on s.id=c.snapshot_referencia_id
    where c.id=v_conteo_id;
    v_stock_expira_at:=inventario.solog_snapshot_expira_at(v_stock_snapshot_at);
  else
    v_panel_state:=null;
    v_session_capability:=case
      when v_conteo_id is null then jsonb_build_object('mode','none','capture_allowed',false,'pending_delivery_allowed',false,'recovery_until',null)
      else inventario.solog_cashier_session_capability_v3(v_conteo_id,false)
    end;

    v_stock_snapshot_id:=v_snapshot_id;
    v_stock_snapshot_at:=v_snapshot_at;
    v_stock_confirmado_at:=v_confirmado_at;
    v_stock_version:=v_version;
    v_stock_expira_at:=v_snapshot_expira_at;

    if v_authorized and v_conteo_id is null then
      v_pre_session_summary:=inventario.solog_cashier_pre_session_summary_v3(v_sede_id,v_period_from);
    end if;
  end if;

  return jsonb_build_object(
    'contract_version',3,
    'generated_at',now(),
    'server_now',now(),
    'revisions',jsonb_build_object('groups',v_groups_rev,'devices',v_devices_rev,'operational',v_oper_rev),
    'identity',jsonb_build_object('id',v_uid,'nombre',v_nombre,'rol',v_rol),
    'site',jsonb_build_object('id',v_sede_id,'nombre',v_sede_nombre),
    'device',jsonb_build_object(
      'id',v_device_id,
      'estado',coalesce(v_device_estado,'sin_solicitud'),
      'sede_correcta',v_device_sede=v_sede_id,
      'autorizado',v_authorized,
      'sede_tiene_dispositivo_autorizado',v_authorized_exists
    ),
    'stock',jsonb_build_object(
      'snapshot_id',v_stock_snapshot_id,
      'capturado_at',v_stock_snapshot_at,
      'confirmado_at',v_stock_confirmado_at,
      'snapshot_expira_at',v_stock_expira_at,
      'version_catalogo',v_stock_version
    ),
    'start_capability',jsonb_build_object('allowed',v_can_start,'reason',v_reason),
    'session_capability',v_session_capability,
    'pre_session_summary',v_pre_session_summary,
    'panel_state',v_panel_state
  );
end;
$function$

revoke all on function public.rpc_solog_cashier_bootstrap_v3(jsonb) from public,anon;
grant execute on function public.rpc_solog_cashier_bootstrap_v3(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_mutate_v3(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_rol text; v_sede_id uuid; v_activo boolean;
  v_token text; v_hash text; v_device_id uuid;
  v_operation_id uuid; v_replay jsonb; v_response jsonb;
  v_conteo_id uuid; v_session inventario.conteos%rowtype;
  v_snapshot_id uuid; v_snapshot_at timestamptz; v_snapshot_confirmado_at timestamptz; v_version integer;
  v_expira_at timestamptz; v_period_from date; v_period_to date; v_groups_rev bigint;
  v_items jsonb; v_item jsonb; v_client_id uuid; v_group_id uuid; v_stock_fisico integer; v_contado_at timestamptz;
  v_sg inventario.solog_session_groups%rowtype; v_diff integer; v_state text; v_detail_id uuid;
  v_first_post uuid; v_latest_post uuid; v_first_stock integer; v_latest_stock integer;
  v_results jsonb:='[]'::jsonb; v_saved integer:=0;
  v_recount_detail uuid; v_recount_stock integer; v_recount_at timestamptz;
  v_cd inventario.conteo_detalle%rowtype; v_d0 integer; v_dr integer; v_final_diff integer; v_final_state text;
  v_oper_rev bigint; v_expected_groups bigint;
  v_affected_groups uuid[]:='{}'::uuid[];
  v_affected_details uuid[]:='{}'::uuid[];
  v_groups_patch jsonb:='[]'::jsonb;
  v_kpis jsonb;
  v_panel_delta jsonb;
  v_session_capability jsonb;
  v_panel_state jsonb;
  v_status text; v_finalizado_at timestamptz;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;

  select u.rol::text,u.sede_id,u.activo
    into v_rol,v_sede_id,v_activo
  from public.usuarios u
  where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol<>'cajero' then raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED'; end if;
  if v_sede_id is null then raise exception 'SOLOG_CASHIER_WITHOUT_SEDE'; end if;

  begin v_operation_id:=(p_payload->>'operation_id')::uuid;
  exception when others then raise exception 'SOLOG_INVALID_OPERATION'; end;
  if v_operation_id is null then raise exception 'SOLOG_INVALID_OPERATION'; end if;

  v_replay:=inventario.solog_operation_begin('cashier_v3:'||coalesce(p_action,''),v_uid,v_operation_id,p_payload - 'device_token');
  if v_replay is not null then return v_replay||jsonb_build_object('replay',true); end if;

  perform 1 from public.sedes s where s.id=v_sede_id and s.activo for update;
  if not found then raise exception 'SOLOG_SEDE_NOT_FOUND'; end if;

  v_token:=nullif(btrim(coalesce(p_payload->>'device_token','')),'');
  if v_token is null or length(v_token)<32 or length(v_token)>512 then raise exception 'SOLOG_DEVICE_UNAUTHORIZED'; end if;
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
  select d.id into v_device_id
  from inventario.dispositivos_solog d
  where d.device_hash=v_hash and d.sede_id=v_sede_id and d.estado='autorizado'
  for update;
  if not found then raise exception 'SOLOG_DEVICE_UNAUTHORIZED'; end if;
  update inventario.dispositivos_solog
  set ultimo_acceso_at=now(),updated_at=now()
  where id=v_device_id;

  update inventario.conteos
  set estado='expirado',finalizado_at=coalesce(finalizado_at,expira_at+interval '2 hours'),updated_at=now()
  where sede_id=v_sede_id and estado='activo' and now()>=expira_at+interval '2 hours';

  if p_action='start' then
    if exists(select 1 from inventario.conteos c where c.sede_id=v_sede_id and c.estado='activo') then
      raise exception 'SOLOG_SESSION_CONFLICT';
    end if;

    select s.id,s.capturado_at,s.confirmado_at,s.version_catalogo
      into v_snapshot_id,v_snapshot_at,v_snapshot_confirmado_at,v_version
    from inventario.snapshots s
    where s.sede_id=v_sede_id and s.estado='confirmado' and s.confirmado_at is not null
    order by s.confirmado_at desc,s.capturado_at desc,s.id desc
    limit 1;
    if v_snapshot_id is null then raise exception 'SOLOG_CONFIRMED_SNAPSHOT_REQUIRED'; end if;

    v_expira_at:=inventario.solog_sesion_expira_at(v_snapshot_at);
    if now()>=inventario.solog_snapshot_expira_at(v_snapshot_at) then raise exception 'SOLOG_STOCK_EXPIRED'; end if;
    if now()>=inventario.solog_snapshot_expira_at(v_snapshot_at)-interval '5 minutes' then raise exception 'SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY'; end if;

    v_period_from:=inventario.solog_periodo_desde(now());
    v_period_to:=inventario.solog_periodo_hasta(now());
    if not exists(
      select 1 from inventario.estado_stock_grupo esg
      where esg.sede_id=v_sede_id and esg.activo and not esg.requiere_snapshot_completo
        and esg.cobertura_periodo_desde=v_period_from
    ) then raise exception 'SOLOG_OPERATIONAL_PERIOD_NOT_STARTED'; end if;

    v_groups_rev:=inventario.solog_revision_get('groups',null);

    insert into inventario.conteos(
      sede_id,estado,iniciado_at,usuario_id,expira_at,snapshot_referencia_id,version_catalogo,groups_revision,
      periodo_desde,periodo_hasta,created_at,updated_at
    ) values(
      v_sede_id,'activo',now(),v_uid,v_expira_at,v_snapshot_id,v_version,v_groups_rev,
      v_period_from,v_period_to,now(),now()
    ) returning id into v_conteo_id;

    insert into inventario.solog_session_groups(
      conteo_id,grupo_conteo_id,snapshot_referencia_id,stock_teorico,grupo_nombre,categoria_id,categoria_nombre,tipo_grupo,
      precio,unidades_por_paquete,precio_paquete,codigos_internos,productos,cobertura_periodo,estado_stock,
      requiere_conteo,requiere_reconteo,detalle_reconteo_id,created_at,updated_at
    )
    select
      v_conteo_id,g.id,v_snapshot_id,inventario.solog_stock_grupo_snapshot(v_snapshot_id,g.id),g.nombre,g.categoria_id,cat.nombre,
      case when count(c.c_interno) filter(where c.estado<>'Excluido')=1 then 'Individual' else 'Agrupado' end,
      g.precio,g.unidades_por_paquete,g.precio_paquete,
      coalesce(array_agg(c.c_interno order by c.c_interno) filter(where c.c_interno is not null and c.estado<>'Excluido'),'{}'::integer[]),
      coalesce(jsonb_agg(jsonb_build_object('c_interno',c.c_interno,'producto',c.producto,'marca',c.marca,'precio',c.precio)
        order by c.producto,c.c_interno) filter(where c.c_interno is not null and c.estado<>'Excluido'),'[]'::jsonb),
      esg.cobertura_periodo,esg.estado,
      case when pending.id is null and (not esg.cobertura_periodo or (esg.cobertura_periodo and esg.estado='Cambio_reciente')) then true else false end,
      pending.id is not null,
      pending.id,
      now(),now()
    from inventario.estado_stock_grupo esg
    join inventario.grupos_conteo g on g.id=esg.grupo_conteo_id and g.activo
    join inventario.categorias cat on cat.id=g.categoria_id and cat.activo
    left join inventario.catalogo c on c.grupo_conteo_id=g.id
    left join lateral (
      select cd.id
      from inventario.conteo_detalle cd
      where cd.id=esg.ultimo_conteo_detalle_id
        and cd.estado_diferencia='Recontar'
        and cd.primer_snapshot_posterior_id is not null
        and cd.stock_reconteo is null
      limit 1
    ) pending on true
    where esg.sede_id=v_sede_id
      and esg.activo
      and not esg.requiere_snapshot_completo
      and esg.cobertura_periodo_desde=v_period_from
    group by g.id,g.nombre,g.categoria_id,cat.nombre,g.precio,g.unidades_por_paquete,g.precio_paquete,
             esg.cobertura_periodo,esg.estado,pending.id;

    v_oper_rev:=inventario.solog_revision_bump('operational',v_sede_id);
    v_panel_state:=inventario.solog_cashier_panel_state_v3(v_conteo_id);
    v_session_capability:=inventario.solog_cashier_session_capability_v3(v_conteo_id,true);
    v_response:=jsonb_build_object(
      'contract_version',3,
      'generated_at',now(),
      'action','start',
      'replay',false,
      'revisions',jsonb_build_object(
        'groups',v_groups_rev,
        'devices',inventario.solog_revision_get('devices',v_sede_id),
        'operational',v_oper_rev
      ),
      'session_capability',v_session_capability,
      'stock',jsonb_build_object(
        'snapshot_id',v_snapshot_id,
        'capturado_at',v_snapshot_at,
        'confirmado_at',v_snapshot_confirmado_at,
        'snapshot_expira_at',inventario.solog_snapshot_expira_at(v_snapshot_at),
        'version_catalogo',v_version
      ),
      'panel_state',v_panel_state
    );
    return inventario.solog_operation_finish('cashier_v3:start',v_uid,v_operation_id,v_response);

  elsif p_action in ('save_batch','recount_save_batch','finish') then
    begin v_conteo_id:=(p_payload->>'conteo_id')::uuid;
    exception when others then raise exception 'SOLOG_INVALID_SESSION'; end;
    if v_conteo_id is null then raise exception 'SOLOG_INVALID_SESSION'; end if;

    select * into v_session
    from inventario.conteos c
    where c.id=v_conteo_id
    for update;
    if not found or v_session.sede_id<>v_sede_id or v_session.usuario_id<>v_uid then raise exception 'SOLOG_SESSION_NOT_FOUND'; end if;
    if v_session.snapshot_referencia_id is null or v_session.groups_revision is null then raise exception 'SOLOG_SESSION_REVISION_CONFLICT'; end if;

    if v_session.estado='activo' and now()>=v_session.expira_at+interval '2 hours' then
      update inventario.conteos
      set estado='expirado',finalizado_at=coalesce(finalizado_at,expira_at+interval '2 hours'),updated_at=now()
      where id=v_conteo_id;
      v_session.estado:='expirado';
      v_session.finalizado_at:=coalesce(v_session.finalizado_at,v_session.expira_at+interval '2 hours');
    end if;

    begin v_expected_groups:=nullif(p_payload->>'expected_groups_revision','')::bigint;
    exception when others then raise exception 'SOLOG_GROUPS_REVISION_CONFLICT'; end;
    if v_expected_groups is not null and v_expected_groups<>v_session.groups_revision then raise exception 'SOLOG_GROUPS_REVISION_CONFLICT'; end if;

    if p_action='save_batch' then
      if v_session.estado<>'activo' then raise exception 'SOLOG_SESSION_EXPIRED'; end if;
      v_items:=p_payload->'items';
      if v_items is null or jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 or jsonb_array_length(v_items)>500 then
        raise exception 'SOLOG_INVALID_BATCH_PAYLOAD';
      end if;

      for v_item in select value from jsonb_array_elements(v_items) loop
        begin
          v_client_id:=(v_item->>'client_observation_id')::uuid;
          v_group_id:=(v_item->>'grupo_id')::uuid;
          v_stock_fisico:=(v_item->>'stock_fisico')::integer;
          v_contado_at:=(v_item->>'contado_at')::timestamptz;
        exception when others then raise exception 'SOLOG_INVALID_BATCH_ITEM'; end;
        if v_client_id is null or v_group_id is null or v_stock_fisico is null or v_stock_fisico<0 or v_contado_at is null then
          raise exception 'SOLOG_INVALID_BATCH_ITEM';
        end if;
        if v_contado_at<v_session.iniciado_at or v_contado_at>v_session.expira_at or v_contado_at>now()+interval '30 seconds' then
          raise exception 'SOLOG_INVALID_COUNT_TIMESTAMP';
        end if;

        select * into v_sg
        from inventario.solog_session_groups sg
        where sg.conteo_id=v_conteo_id and sg.grupo_conteo_id=v_group_id
        for update;
        if not found then raise exception 'SOLOG_GROUP_NOT_AVAILABLE'; end if;
        if v_sg.requiere_reconteo then raise exception 'SOLOG_RECOUNT_NOT_PENDING'; end if;
        if not v_sg.requiere_conteo then raise exception 'SOLOG_GROUP_ALREADY_COUNTED'; end if;
        if exists(select 1 from inventario.conteo_detalle cd where cd.client_observation_id=v_client_id) then
          raise exception 'SOLOG_CLIENT_OBSERVATION_CONFLICT';
        end if;

        v_diff:=v_stock_fisico-v_sg.stock_teorico;
        v_state:=case when v_diff=0 then 'Coincide' else 'Recontar' end;
        insert into inventario.conteo_detalle(
          conteo_id,grupo_conteo_id,snapshot_referencia_id,stock_teorico,stock_fisico,diferencia,precio,valor_diferencia,
          contado_at,estado_diferencia,client_observation_id,grupo_nombre,categoria_nombre,tipo_grupo,codigos_internos,
          unidades_por_paquete,precio_paquete,created_at,updated_at
        ) values(
          v_conteo_id,v_group_id,v_session.snapshot_referencia_id,v_sg.stock_teorico,v_stock_fisico,v_diff,v_sg.precio,0,
          v_contado_at,v_state,v_client_id,v_sg.grupo_nombre,v_sg.categoria_nombre,v_sg.tipo_grupo,v_sg.codigos_internos,
          v_sg.unidades_por_paquete,v_sg.precio_paquete,now(),now()
        ) returning id into v_detail_id;

        update inventario.solog_session_groups
        set requiere_conteo=false,contado_detalle_id=v_detail_id,contado_at=v_contado_at,updated_at=now()
        where conteo_id=v_conteo_id and grupo_conteo_id=v_group_id;

        update inventario.estado_stock_grupo esg
        set cobertura_periodo=true,
            estado=case when esg.snapshot_id=v_session.snapshot_referencia_id then 'Contado' else esg.estado end,
            ultimo_conteo_at=v_contado_at,
            ultimo_conteo_detalle_id=v_detail_id,
            updated_at=now()
        where esg.sede_id=v_sede_id and esg.grupo_conteo_id=v_group_id and esg.activo;

        if v_state='Recontar' then
          select s.id into v_first_post
          from inventario.snapshots s
          where s.sede_id=v_sede_id and s.estado='confirmado' and s.confirmado_at is not null and s.capturado_at>v_contado_at
          order by s.capturado_at asc,s.confirmado_at asc,s.id asc
          limit 1;
          if v_first_post is not null then
            v_first_stock:=inventario.solog_stock_grupo_snapshot(v_first_post,v_group_id);
            update inventario.conteo_detalle
            set primer_snapshot_posterior_id=v_first_post,
                snapshot_posterior_id=v_first_post,
                stock_posterior=v_first_stock,
                estado_diferencia=case when v_first_stock=v_stock_fisico then 'Coincide' else 'Recontar' end,
                diferencia=case when v_first_stock=v_stock_fisico then 0 else v_diff end,
                updated_at=now()
            where id=v_detail_id;
            if v_first_stock<>v_stock_fisico then
              select s.id into v_latest_post
              from inventario.snapshots s
              where s.sede_id=v_sede_id and s.estado='confirmado' and s.confirmado_at is not null and s.capturado_at>v_contado_at
              order by s.capturado_at desc,s.confirmado_at desc,s.id desc
              limit 1;
              if v_latest_post is distinct from v_first_post then
                v_latest_stock:=inventario.solog_stock_grupo_snapshot(v_latest_post,v_group_id);
                update inventario.conteo_detalle
                set snapshot_posterior_id=v_latest_post,stock_posterior=v_latest_stock,updated_at=now()
                where id=v_detail_id;
              end if;
            end if;
          end if;
        end if;

        select cd.diferencia,cd.estado_diferencia
          into v_diff,v_state
        from inventario.conteo_detalle cd
        where cd.id=v_detail_id;

        v_results:=v_results||jsonb_build_array(jsonb_build_object(
          'client_observation_id',v_client_id,
          'detalle_id',v_detail_id,
          'grupo_id',v_group_id,
          'stock_teorico',v_sg.stock_teorico,
          'stock_fisico',v_stock_fisico,
          'diferencia',v_diff,
          'estado_diferencia',v_state,
          'contado_at',v_contado_at
        ));
        v_affected_groups:=array_append(v_affected_groups,v_group_id);
        v_saved:=v_saved+1;
      end loop;

      select coalesce(jsonb_agg(jsonb_build_object(
        'grupo_id',sg.grupo_conteo_id,
        'cobertura_periodo',sg.cobertura_periodo,
        'requiere_conteo',sg.requiere_conteo,
        'requiere_reconteo',sg.requiere_reconteo,
        'detalle_reconteo_id',sg.detalle_reconteo_id,
        'contado_detalle_id',sg.contado_detalle_id,
        'contado_at',sg.contado_at,
        'recontado_at',sg.recontado_at
      ) order by sg.grupo_conteo_id),'[]'::jsonb)
      into v_groups_patch
      from inventario.solog_session_groups sg
      where sg.conteo_id=v_conteo_id and sg.grupo_conteo_id=any(v_affected_groups);

      v_kpis:=inventario.solog_cashier_session_kpis_v3(v_conteo_id);
      v_panel_delta:=jsonb_build_object(
        'groups_patch',v_groups_patch,
        'count_queue_remove',to_jsonb(v_affected_groups),
        'review_queue_remove','[]'::jsonb,
        'kpis',v_kpis
      );
      v_oper_rev:=inventario.solog_revision_bump('operational',v_sede_id);
      v_session_capability:=inventario.solog_cashier_session_capability_v3(v_conteo_id,true);
      v_response:=jsonb_build_object(
        'contract_version',3,'generated_at',now(),'action','save_batch','replay',false,
        'conteo_id',v_conteo_id,'saved',v_saved,'items',v_results,
        'panel_delta',v_panel_delta,
        'session_capability',v_session_capability,
        'revisions',jsonb_build_object(
          'groups',v_session.groups_revision,
          'devices',inventario.solog_revision_get('devices',v_sede_id),
          'operational',v_oper_rev
        )
      );
      return inventario.solog_operation_finish('cashier_v3:save_batch',v_uid,v_operation_id,v_response);

    elsif p_action='recount_save_batch' then
      if v_session.estado<>'activo' then raise exception 'SOLOG_SESSION_EXPIRED'; end if;
      v_items:=p_payload->'items';
      if v_items is null or jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 or jsonb_array_length(v_items)>500 then
        raise exception 'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD';
      end if;
      if exists(
        select 1 from jsonb_array_elements(v_items) x(value)
        group by value->>'detalle_id'
        having count(*)>1
      ) then raise exception 'SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD'; end if;

      v_results:='[]'::jsonb;
      v_saved:=0;
      for v_item in select value from jsonb_array_elements(v_items) loop
        begin
          v_recount_detail:=(v_item->>'detalle_id')::uuid;
          v_recount_stock:=(v_item->>'stock_fisico')::integer;
          v_recount_at:=(v_item->>'contado_at')::timestamptz;
        exception when others then raise exception 'SOLOG_INVALID_RECOUNT_BATCH_ITEM'; end;
        if v_recount_detail is null or v_recount_stock is null or v_recount_stock<0 or v_recount_at is null then
          raise exception 'SOLOG_INVALID_RECOUNT_BATCH_ITEM';
        end if;
        if v_recount_at<v_session.iniciado_at or v_recount_at>v_session.expira_at or v_recount_at>now()+interval '30 seconds' then
          raise exception 'SOLOG_INVALID_COUNT_TIMESTAMP';
        end if;

        select * into v_cd
        from inventario.conteo_detalle cd
        where cd.id=v_recount_detail
        for update;
        if not found or v_cd.estado_diferencia<>'Recontar' or v_cd.primer_snapshot_posterior_id is null or v_cd.stock_reconteo is not null then
          raise exception 'SOLOG_RECOUNT_NOT_PENDING';
        end if;
        if v_cd.conteo_id=v_conteo_id then raise exception 'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN'; end if;
        if not exists(
          select 1 from inventario.conteos origin
          where origin.id=v_cd.conteo_id
            and origin.sede_id=v_sede_id
            and origin.iniciado_at<v_session.iniciado_at
        ) then raise exception 'SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN'; end if;

        select * into v_sg
        from inventario.solog_session_groups sg
        where sg.conteo_id=v_conteo_id and sg.grupo_conteo_id=v_cd.grupo_conteo_id
        for update;
        if not found or not v_sg.requiere_reconteo or v_sg.detalle_reconteo_id is distinct from v_recount_detail then
          raise exception 'SOLOG_RECOUNT_NOT_PENDING';
        end if;
        if v_sg.stock_teorico is null then raise exception 'SOLOG_RECOUNT_THEORETICAL_REQUIRED'; end if;

        v_cd.snapshot_reconteo_id:=v_session.snapshot_referencia_id;
        v_cd.stock_teorico_reconteo:=v_sg.stock_teorico;
        update inventario.conteo_detalle
        set snapshot_reconteo_id=v_cd.snapshot_reconteo_id,
            stock_teorico_reconteo=v_cd.stock_teorico_reconteo,
            updated_at=now()
        where id=v_recount_detail;

        v_d0:=v_cd.stock_fisico-v_cd.stock_teorico;
        v_dr:=v_recount_stock-v_cd.stock_teorico_reconteo;
        if v_dr=0 then
          v_final_state:='Coincide'; v_final_diff:=0;
        elsif (v_d0<0 and v_dr<0) or (v_d0>0 and v_dr>0) then
          v_final_state:='Confirmada';
          v_final_diff:=case when abs(v_dr)<abs(v_d0) then v_dr else v_d0 end;
        else
          v_final_state:='Inconsistente'; v_final_diff:=v_dr;
        end if;

        update inventario.conteo_detalle
        set stock_reconteo=v_recount_stock,
            recontado_at=v_recount_at,
            reconteo_conteo_id=v_conteo_id,
            estado_diferencia=v_final_state,
            diferencia=v_final_diff,
            updated_at=now()
        where id=v_recount_detail;

        update inventario.solog_session_groups
        set requiere_reconteo=false,recontado_at=v_recount_at,updated_at=now()
        where conteo_id=v_conteo_id and grupo_conteo_id=v_cd.grupo_conteo_id;

        update inventario.estado_stock_grupo esg
        set estado=case
              when v_final_state='Inconsistente' then 'Cambio_reciente'
              when esg.snapshot_id=v_cd.snapshot_reconteo_id then 'Contado'
              else esg.estado
            end,
            updated_at=now()
        where esg.sede_id=v_sede_id
          and esg.grupo_conteo_id=v_cd.grupo_conteo_id
          and esg.ultimo_conteo_detalle_id=v_recount_detail;

        select jsonb_build_object(
          'detalle_id',cd.id,
          'grupo_id',cd.grupo_conteo_id,
          'snapshot_reconteo_id',cd.snapshot_reconteo_id,
          'stock_teorico_reconteo',cd.stock_teorico_reconteo,
          'stock_reconteo',cd.stock_reconteo,
          'diferencia_reconteo',cd.stock_reconteo-cd.stock_teorico_reconteo,
          'diferencia',cd.diferencia,
          'estado_diferencia',cd.estado_diferencia,
          'valor_diferencia',cd.valor_diferencia,
          'recontado_at',cd.recontado_at
        ) into v_item
        from inventario.conteo_detalle cd
        where cd.id=v_recount_detail;

        v_results:=v_results||jsonb_build_array(v_item);
        v_affected_groups:=array_append(v_affected_groups,v_cd.grupo_conteo_id);
        v_affected_details:=array_append(v_affected_details,v_recount_detail);
        v_saved:=v_saved+1;
      end loop;

      select coalesce(jsonb_agg(jsonb_build_object(
        'grupo_id',sg.grupo_conteo_id,
        'cobertura_periodo',sg.cobertura_periodo,
        'requiere_conteo',sg.requiere_conteo,
        'requiere_reconteo',sg.requiere_reconteo,
        'detalle_reconteo_id',sg.detalle_reconteo_id,
        'contado_detalle_id',sg.contado_detalle_id,
        'contado_at',sg.contado_at,
        'recontado_at',sg.recontado_at
      ) order by sg.grupo_conteo_id),'[]'::jsonb)
      into v_groups_patch
      from inventario.solog_session_groups sg
      where sg.conteo_id=v_conteo_id and sg.grupo_conteo_id=any(v_affected_groups);

      v_kpis:=inventario.solog_cashier_session_kpis_v3(v_conteo_id);
      v_panel_delta:=jsonb_build_object(
        'groups_patch',v_groups_patch,
        'count_queue_remove','[]'::jsonb,
        'review_queue_remove',to_jsonb(v_affected_details),
        'kpis',v_kpis
      );
      v_oper_rev:=inventario.solog_revision_bump('operational',v_sede_id);
      v_session_capability:=inventario.solog_cashier_session_capability_v3(v_conteo_id,true);
      v_response:=jsonb_build_object(
        'contract_version',3,'generated_at',now(),'action','recount_save_batch','replay',false,
        'conteo_id',v_conteo_id,'saved',v_saved,'items',v_results,
        'panel_delta',v_panel_delta,
        'session_capability',v_session_capability,
        'revisions',jsonb_build_object(
          'groups',v_session.groups_revision,
          'devices',inventario.solog_revision_get('devices',v_sede_id),
          'operational',v_oper_rev
        )
      );
      return inventario.solog_operation_finish('cashier_v3:recount_save_batch',v_uid,v_operation_id,v_response);

    else
      if v_session.estado='activo' then
        update inventario.conteos
        set estado='finalizado',finalizado_at=now(),updated_at=now()
        where id=v_conteo_id
        returning estado,finalizado_at into v_status,v_finalizado_at;
      elsif v_session.estado in ('finalizado','expirado') then
        v_status:=v_session.estado;
        v_finalizado_at:=v_session.finalizado_at;
      else
        raise exception 'SOLOG_SESSION_NOT_FOUND';
      end if;

      v_oper_rev:=inventario.solog_revision_bump('operational',v_sede_id);
      v_response:=jsonb_build_object(
        'contract_version',3,'generated_at',now(),'action','finish','replay',false,
        'conteo_id',v_conteo_id,
        'status',v_status,
        'finalizado_at',v_finalizado_at,
        'session_capability',jsonb_build_object(
          'mode','none','capture_allowed',false,'pending_delivery_allowed',false,'recovery_until',null
        ),
        'revisions',jsonb_build_object(
          'groups',v_session.groups_revision,
          'devices',inventario.solog_revision_get('devices',v_sede_id),
          'operational',v_oper_rev
        )
      );
      return inventario.solog_operation_finish('cashier_v3:finish',v_uid,v_operation_id,v_response);
    end if;
  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$

revoke all on function public.rpc_solog_cashier_mutate_v3(text,jsonb) from public,anon;
grant execute on function public.rpc_solog_cashier_mutate_v3(text,jsonb) to authenticated;

comment on function public.rpc_solog_cashier_bootstrap_v3(jsonb) is
'SOLOG Cajero V3: bootstrap compacto sin sesion; panel congelado unico al restaurar sesion activa/recovery.';
comment on function public.rpc_solog_cashier_mutate_v3(text,jsonb) is
'SOLOG Cajero V3: start con panel completo, save/recount con deltas autoritativos y finish minimo; hereda recovery V8.';
