-- SOLOG Admin Control — Fase 3 strict period guard
-- Fuente primaria: docs/SOLOG_Backend_Admin_Control_Contrato_V1.md

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
  v_period := lower(nullif(btrim(p_payload->>'period'),''));

  if v_period is null then
    raise exception 'SOLOG_INVALID_DATE_RANGE';
  elsif v_period='today' then
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
$function$
;
