create or replace function inventario.solog_daily_detail_bootstrap_v1(
  p_uid uuid,
  p_site uuid,
  p_generated timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_date date;
  v_from timestamptz;
  v_to timestamptz;
  v_stock text;
  v_invalid integer;
  v_response jsonb;
begin
  if coalesce(p_payload->>'origin_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'SOLOG_INVALID_DATE_RANGE';
  end if;

  begin
    v_date := (p_payload->>'origin_date')::date;
  exception when others then
    raise exception 'SOLOG_INVALID_DATE_RANGE';
  end;
  if v_date is null then raise exception 'SOLOG_INVALID_DATE_RANGE'; end if;

  v_stock := lower(coalesce(nullif(btrim(p_payload->>'stock_class'),''),''));
  if v_stock not in ('positive','zero') then
    raise exception 'SOLOG_INVALID_STOCK_CLASS';
  end if;

  v_from := v_date::timestamp at time zone 'America/Lima';
  v_to := (v_date+1)::timestamp at time zone 'America/Lima';

  with base as materialized (
    select
      cd.id as case_id,
      cd.grupo_nombre as grupo,
      cd.estado_diferencia as state,
      cd.contado_at,
      case when cd.stock_fisico=0 then 'zero'::text when cd.stock_fisico>0 then 'positive'::text else null end as stock_class,
      case
        when cd.estado_diferencia='Coincide'
          and cd.stock_reconteo is not null
          and cd.stock_teorico_reconteo is not null
          and cd.stock_reconteo-cd.stock_teorico_reconteo=0
        then cd.stock_reconteo
        else cd.stock_fisico
      end as current_stock,
      cd.stock_fisico as initial_physical,
      cd.stock_fisico-cd.stock_teorico as initial_difference,
      cd.diferencia as final_difference,
      cd.valor_diferencia as final_valued_difference,
      cd.stock_teorico_reconteo as recount_theoretical,
      case
        when cd.stock_reconteo is not null and cd.stock_teorico_reconteo is not null
        then cd.stock_reconteo-cd.stock_teorico_reconteo
        else null
      end as found_difference,
      cd.stock_reconteo,
      cd.stock_teorico_reconteo
    from inventario.conteo_detalle cd
    join inventario.conteos c on c.id=cd.conteo_id
    where c.sede_id=p_site
      and cd.contado_at>=v_from
      and cd.contado_at<v_to
  ),
  selected as (
    select *
    from base
    where stock_class=v_stock
      and state in ('Coincide','Recontar','Confirmada','Inconsistente')
  ),
  ranked as (
    select s.*,
      row_number() over (
        partition by s.state
        order by s.grupo,s.contado_at,s.case_id
      ) as rn
    from selected s
  )
  select
    (select count(*)::integer
       from selected s
      where s.state='Inconsistente'
        and (s.stock_reconteo is null or s.stock_teorico_reconteo is null)),
    jsonb_build_object(
      'contract_version',2,
      'generated_at',p_generated,
      'revisions',jsonb_build_object(
        'operational',inventario.solog_revision_get('operational',p_site)
      ),
      'site_id',p_site,
      'origin_date',v_date,
      'stock_class',v_stock,
      'page_size',25,
      'counts',jsonb_build_object(
        'positive',jsonb_build_object(
          'Coincide',(select count(*) from base where stock_class='positive' and state='Coincide'),
          'Recontar',(select count(*) from base where stock_class='positive' and state='Recontar'),
          'Confirmada',(select count(*) from base where stock_class='positive' and state='Confirmada'),
          'Inconsistente',(select count(*) from base where stock_class='positive' and state='Inconsistente')
        ),
        'zero',jsonb_build_object(
          'Coincide',(select count(*) from base where stock_class='zero' and state='Coincide'),
          'Recontar',(select count(*) from base where stock_class='zero' and state='Recontar'),
          'Confirmada',(select count(*) from base where stock_class='zero' and state='Confirmada'),
          'Inconsistente',(select count(*) from base where stock_class='zero' and state='Inconsistente')
        )
      ),
      'views',jsonb_build_object(
        'Coincide',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'case_id',r.case_id,
              'grupo',r.grupo,
              'stock',r.current_stock
            )
            order by r.grupo,r.contado_at,r.case_id
          )
          from ranked r
          where r.state='Coincide' and r.rn<=25
        ),'[]'::jsonb),
        'Recontar',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'case_id',r.case_id,
              'grupo',r.grupo,
              'physical',r.initial_physical,
              'difference',r.initial_difference
            )
            order by r.grupo,r.contado_at,r.case_id
          )
          from ranked r
          where r.state='Recontar' and r.rn<=25
        ),'[]'::jsonb),
        'Confirmada',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'case_id',r.case_id,
              'grupo',r.grupo,
              'difference',r.final_difference,
              'valued_difference',r.final_valued_difference
            )
            order by r.grupo,r.contado_at,r.case_id
          )
          from ranked r
          where r.state='Confirmada' and r.rn<=25
        ),'[]'::jsonb),
        'Inconsistente',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'case_id',r.case_id,
              'grupo',r.grupo,
              'theoretical',r.recount_theoretical,
              'initial_difference',r.initial_difference,
              'found_difference',r.found_difference
            )
            order by r.grupo,r.contado_at,r.case_id
          )
          from ranked r
          where r.state='Inconsistente' and r.rn<=25
        ),'[]'::jsonb)
      )
    )
  into v_invalid,v_response;

  if v_invalid>0 then
    raise exception 'SOLOG_INCONSISTENT_RECOUNT_MISSING';
  end if;

  return v_response;
end;
$function$;

create or replace function inventario.solog_daily_detail_page_v1(
  p_uid uuid,
  p_site uuid,
  p_generated timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_date date;
  v_from timestamptz;
  v_to timestamptz;
  v_stock text;
  v_state text;
  v_page integer;
  v_invalid integer;
  v_rows jsonb;
begin
  if coalesce(p_payload->>'origin_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'SOLOG_INVALID_DATE_RANGE';
  end if;

  begin
    v_date := (p_payload->>'origin_date')::date;
  exception when others then
    raise exception 'SOLOG_INVALID_DATE_RANGE';
  end;
  if v_date is null then raise exception 'SOLOG_INVALID_DATE_RANGE'; end if;

  v_stock := lower(coalesce(nullif(btrim(p_payload->>'stock_class'),''),''));
  if v_stock not in ('positive','zero') then
    raise exception 'SOLOG_INVALID_STOCK_CLASS';
  end if;

  v_state := nullif(btrim(p_payload->>'state'),'');
  if v_state not in ('Coincide','Recontar','Confirmada','Inconsistente') then
    raise exception 'SOLOG_INVALID_DIFFERENCE_STATE';
  end if;

  begin
    v_page := (p_payload->>'page')::integer;
  exception when others then
    raise exception 'SOLOG_INVALID_PAGE_SIZE';
  end;
  if v_page is null or v_page<0 then
    raise exception 'SOLOG_INVALID_PAGE_SIZE';
  end if;

  v_from := v_date::timestamp at time zone 'America/Lima';
  v_to := (v_date+1)::timestamp at time zone 'America/Lima';

  with base as materialized (
    select
      cd.id as case_id,
      cd.grupo_nombre as grupo,
      cd.estado_diferencia as state,
      cd.contado_at,
      case when cd.stock_fisico=0 then 'zero'::text when cd.stock_fisico>0 then 'positive'::text else null end as stock_class,
      case
        when cd.estado_diferencia='Coincide'
          and cd.stock_reconteo is not null
          and cd.stock_teorico_reconteo is not null
          and cd.stock_reconteo-cd.stock_teorico_reconteo=0
        then cd.stock_reconteo
        else cd.stock_fisico
      end as current_stock,
      cd.stock_fisico as initial_physical,
      cd.stock_fisico-cd.stock_teorico as initial_difference,
      cd.diferencia as final_difference,
      cd.valor_diferencia as final_valued_difference,
      cd.stock_teorico_reconteo as recount_theoretical,
      case
        when cd.stock_reconteo is not null and cd.stock_teorico_reconteo is not null
        then cd.stock_reconteo-cd.stock_teorico_reconteo
        else null
      end as found_difference,
      cd.stock_reconteo,
      cd.stock_teorico_reconteo
    from inventario.conteo_detalle cd
    join inventario.conteos c on c.id=cd.conteo_id
    where c.sede_id=p_site
      and cd.contado_at>=v_from
      and cd.contado_at<v_to
      and cd.estado_diferencia=v_state
      and (
        (v_stock='zero' and cd.stock_fisico=0)
        or
        (v_stock='positive' and cd.stock_fisico>0)
      )
  ),
  ranked as (
    select b.*,
      row_number() over (
        order by b.grupo,b.contado_at,b.case_id
      ) as rn
    from base b
  ),
  page_rows as (
    select *
    from ranked
    where rn>(v_page*25)
      and rn<=((v_page+1)*25)
  )
  select
    (select count(*)::integer
       from base b
      where b.state='Inconsistente'
        and (b.stock_reconteo is null or b.stock_teorico_reconteo is null)),
    coalesce(jsonb_agg(
      case v_state
        when 'Coincide' then jsonb_build_object(
          'case_id',p.case_id,
          'grupo',p.grupo,
          'stock',p.current_stock
        )
        when 'Recontar' then jsonb_build_object(
          'case_id',p.case_id,
          'grupo',p.grupo,
          'physical',p.initial_physical,
          'difference',p.initial_difference
        )
        when 'Confirmada' then jsonb_build_object(
          'case_id',p.case_id,
          'grupo',p.grupo,
          'difference',p.final_difference,
          'valued_difference',p.final_valued_difference
        )
        when 'Inconsistente' then jsonb_build_object(
          'case_id',p.case_id,
          'grupo',p.grupo,
          'theoretical',p.recount_theoretical,
          'initial_difference',p.initial_difference,
          'found_difference',p.found_difference
        )
      end
      order by p.grupo,p.contado_at,p.case_id
    ),'[]'::jsonb)
  into v_invalid,v_rows
  from page_rows p;

  if v_invalid>0 then
    raise exception 'SOLOG_INCONSISTENT_RECOUNT_MISSING';
  end if;

  return jsonb_build_object(
    'contract_version',2,
    'generated_at',p_generated,
    'revisions',jsonb_build_object(
      'operational',inventario.solog_revision_get('operational',p_site)
    ),
    'site_id',p_site,
    'origin_date',v_date,
    'stock_class',v_stock,
    'state',v_state,
    'page',v_page,
    'page_size',25,
    'items',v_rows
  );
end;
$function$;

revoke all on function inventario.solog_daily_detail_bootstrap_v1(uuid,uuid,timestamptz,jsonb) from public, anon, authenticated;
revoke all on function inventario.solog_daily_detail_page_v1(uuid,uuid,timestamptz,jsonb) from public, anon, authenticated;
