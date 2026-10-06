-- SOLOG Admin Control V1
-- Fuente primaria: docs/SOLOG_Backend_Admin_Control_Contrato_V1.md

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
        end
        order by fr.event_at desc,fr.case_id desc,fr.stage_order desc
      )
      from functional_rows fr
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

REVOKE ALL ON FUNCTION inventario.solog_control_chronology_view_v1(uuid,uuid,timestamptz,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION inventario.solog_control_chronology_view_v1(uuid,uuid,timestamptz,jsonb) FROM anon;
REVOKE ALL ON FUNCTION inventario.solog_control_chronology_view_v1(uuid,uuid,timestamptz,jsonb) FROM authenticated;

CREATE OR REPLACE FUNCTION inventario.solog_control_groups_v10(p_uid uuid, p_site uuid, p_generated timestamp with time zone, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_period text;
  v_today date;
  v_cutoff date;
  v_from_date date;
  v_to_date date;
  v_from timestamptz;
  v_to timestamptz;
  v_items jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_payload) as k(key)
    where k.key not in ('site_id','period','date_from','date_to')
  ) then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  v_today := (p_generated at time zone 'America/Lima')::date;
  v_cutoff := v_today - 44;
  v_period := lower(coalesce(nullif(btrim(p_payload->>'period'),''),'today'));

  if v_period='today' then
    if p_payload ? 'date_from' or p_payload ? 'date_to' then
      raise exception 'SOLOG_INVALID_PAYLOAD';
    end if;
    v_from_date := v_today;
    v_to_date := v_today;
  elsif v_period='last_week' then
    if p_payload ? 'date_from' or p_payload ? 'date_to' then
      raise exception 'SOLOG_INVALID_PAYLOAD';
    end if;
    v_to_date := v_today;
    v_from_date := v_to_date - 6;
  elsif v_period='current_biweekly' then
    if p_payload ? 'date_from' or p_payload ? 'date_to' then
      raise exception 'SOLOG_INVALID_PAYLOAD';
    end if;
    v_from_date := inventario.solog_periodo_desde(p_generated);
    v_to_date := inventario.solog_periodo_hasta(p_generated);
  elsif v_period='previous_biweekly' then
    if p_payload ? 'date_from' or p_payload ? 'date_to' then
      raise exception 'SOLOG_INVALID_PAYLOAD';
    end if;
    v_to_date := inventario.solog_periodo_desde(p_generated)-1;
    v_from_date := inventario.solog_periodo_desde((v_to_date::timestamp at time zone 'America/Lima'));
  elsif v_period='custom' then
    if not (p_payload ? 'date_from') or not (p_payload ? 'date_to')
       or coalesce(p_payload->>'date_from','') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(p_payload->>'date_to','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'SOLOG_INVALID_DATE_RANGE';
    end if;
    begin
      v_from_date := (p_payload->>'date_from')::date;
      v_to_date := (p_payload->>'date_to')::date;
    exception when others then
      raise exception 'SOLOG_INVALID_DATE_RANGE';
    end;
    if to_char(v_from_date,'YYYY-MM-DD') <> p_payload->>'date_from'
       or to_char(v_to_date,'YYYY-MM-DD') <> p_payload->>'date_to' then
      raise exception 'SOLOG_INVALID_DATE_RANGE';
    end if;
  else
    raise exception 'SOLOG_INVALID_DATE_RANGE';
  end if;

  if v_from_date is null
     or v_to_date is null
     or v_to_date < v_from_date then
    raise exception 'SOLOG_INVALID_DATE_RANGE';
  end if;

  if v_period='custom' and (
       v_from_date < v_cutoff
       or v_to_date > v_today
       or v_to_date - v_from_date > 44
     ) then
    raise exception 'SOLOG_INVALID_DATE_RANGE';
  end if;

  v_from := v_from_date::timestamp at time zone 'America/Lima';
  v_to := (v_to_date+1)::timestamp at time zone 'America/Lima';

  with ranked as (
    select
      cd.id,
      cd.grupo_conteo_id,
      coalesce(cd.grupo_nombre,g.nombre,'') as grupo_nombre,
      coalesce(cd.categoria_nombre,cat.nombre,'') as categoria_nombre,
      cd.contado_at,
      cd.estado_diferencia,
      cd.diferencia,
      cd.valor_diferencia,
      row_number() over (
        partition by cd.grupo_conteo_id
        order by cd.contado_at desc,cd.id desc
      ) as rn
    from inventario.conteo_detalle cd
    join inventario.conteos c on c.id=cd.conteo_id
    left join inventario.grupos_conteo g on g.id=cd.grupo_conteo_id
    left join inventario.categorias cat on cat.id=g.categoria_id
    where c.sede_id=p_site
      and cd.contado_at>=v_from
      and cd.contado_at<v_to
      and cd.estado_diferencia in ('Coincide','Recontar','Confirmada','Inconsistente')
  ), latest as (
    select * from ranked where rn=1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'case_id',l.id,
    'group_id',l.grupo_conteo_id,
    'group_name',l.grupo_nombre,
    'category',l.categoria_nombre,
    'origin_at',l.contado_at,
    'state',l.estado_diferencia,
    'difference',l.diferencia,
    'valued_difference',l.valor_diferencia
  ) order by l.contado_at desc,l.id desc),'[]'::jsonb)
  into v_items
  from latest l;

  return jsonb_build_object(
    'contract_version',2,
    'generated_at',p_generated,
    'revisions',jsonb_build_object(
      'operational',inventario.solog_revision_get('operational',p_site)
    ),
    'site_id',p_site,
    'period',jsonb_build_object(
      'key',v_period,
      'from',v_from_date,
      'to',v_to_date
    ),
    'items',v_items
  );
end;
$function$;

REVOKE ALL ON FUNCTION inventario.solog_control_groups_v10(uuid,uuid,timestamptz,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION inventario.solog_control_groups_v10(uuid,uuid,timestamptz,jsonb) FROM anon;
REVOKE ALL ON FUNCTION inventario.solog_control_groups_v10(uuid,uuid,timestamptz,jsonb) FROM authenticated;

CREATE OR REPLACE FUNCTION public.rpc_solog_admin_control_v1(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_site uuid;
  v_generated timestamptz := statement_timestamp();
begin
  if v_uid is null then
    raise exception 'SOLOG_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  select u.rol::text,u.activo
    into v_role,v_active
  from public.usuarios u
  where u.id=v_uid;

  if not found or not coalesce(v_active,false) then
    raise exception 'SOLOG_USER_DISABLED';
  end if;

  if v_role not in ('admin','moderador') then
    raise exception 'SOLOG_ADMIN_ROLE_REQUIRED';
  end if;

  begin
    v_site := (p_payload->>'site_id')::uuid;
  exception when others then
    raise exception 'SOLOG_INVALID_SITE';
  end;

  if v_site is null then
    raise exception 'SOLOG_INVALID_SITE';
  end if;

  if not exists (
    select 1
    from public.sedes s
    where s.id=v_site
      and s.activo
  ) then
    raise exception 'SOLOG_SITE_FORBIDDEN';
  end if;

  if p_action='control_groups' then
    return inventario.solog_control_groups_v10(
      v_uid,v_site,v_generated,p_payload
    );
  elsif p_action='control_chronology_view' then
    return inventario.solog_control_chronology_view_v1(
      v_uid,v_site,v_generated,p_payload
    );
  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.rpc_solog_admin_control_v1(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_solog_admin_control_v1(text,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_solog_admin_control_v1(text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_solog_admin_control_v1(text,jsonb) TO authenticated;
