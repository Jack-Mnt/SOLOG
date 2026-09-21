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
      case when cd.stock_fisico=0 then 'zero'::text else 'positive'::text end as stock_class,
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
      case when cd.stock_fisico=0 then 'zero'::text else 'positive'::text end as stock_class,
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
        (v_stock='positive' and cd.stock_fisico<>0)
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


CREATE OR REPLACE FUNCTION public.rpc_solog_operational_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_rol text; v_activo boolean; v_generated timestamptz:=now();
  v_site uuid; v_date date; v_period text; v_from_date date; v_to_date date; v_from timestamptz; v_to timestamptz;
  v_cards jsonb; v_rows jsonb; v_summary jsonb; v_group uuid; v_page integer:=0; v_page_size integer:=100; v_state text; v_search text;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;
  select u.rol::text,u.activo into v_rol,v_activo from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol not in ('admin','moderador') then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;

  if p_action='dashboard_cards' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'site_id',s.id,'site',s.nombre,
      'period_coverage',jsonb_build_object('counted',coalesce(x.p_counted,0),'total',coalesce(x.p_total,0),'percent',case when coalesce(x.p_total,0)>0 then round(x.p_counted::numeric*100/x.p_total,1) else 0 end,'complete',coalesce(x.p_total,0)>0 and x.p_counted=x.p_total),
      'daily_coverage',jsonb_build_object('counted_today',coalesce(d.counted_today,0),'total',coalesce(d.total,0),'percent',case when coalesce(d.total,0)>0 then round(coalesce(d.counted_today,0)::numeric*100/d.total,1) else 0 end),
      'pending_recount',coalesce(x.pending_recount,0),
      'snapshot',snap.obj,
      'operational_revision',inventario.solog_revision_get('operational',s.id)
    ) order by s.nombre),'[]'::jsonb) into v_cards
    from public.sedes s
    left join lateral (
      select count(*) filter(where esg.activo)::integer p_total,
             count(*) filter(where esg.activo and esg.cobertura_periodo and esg.cobertura_periodo_desde=inventario.solog_periodo_desde(v_generated))::integer p_counted,
             count(*) filter(where esg.activo and cd.estado_diferencia='Recontar' and cd.primer_snapshot_posterior_id is not null and cd.stock_reconteo is null)::integer pending_recount
      from inventario.estado_stock_grupo esg
      left join inventario.conteo_detalle cd on cd.id=esg.ultimo_conteo_detalle_id
      where esg.sede_id=s.id
    ) x on true
    left join lateral (
      select
        b.denominator::integer total,
        count(distinct dg.grupo_conteo_id) filter (where exists (
          select 1
          from inventario.conteo_detalle cd
          join inventario.conteos c on c.id=cd.conteo_id
          where c.sede_id=s.id
            and cd.grupo_conteo_id=dg.grupo_conteo_id
            and cd.contado_at>=((v_generated at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima')
            and cd.contado_at<(((v_generated at time zone 'America/Lima')::date+1)::timestamp at time zone 'America/Lima')
        ))::integer counted_today
      from inventario.solog_daily_coverage_base b
      left join inventario.solog_daily_coverage_groups dg
        on dg.sede_id=b.sede_id
       and dg.operational_date=b.operational_date
      where b.sede_id=s.id
        and b.operational_date=(v_generated at time zone 'America/Lima')::date
      group by b.denominator
    ) d on true
    left join lateral (
      select jsonb_build_object('id',ss.id,'capturado_at',ss.capturado_at,'confirmado_at',ss.confirmado_at,'version_catalogo',ss.version_catalogo) obj
      from inventario.snapshots ss where ss.sede_id=s.id and ss.estado='confirmado' and ss.confirmado_at is not null order by ss.confirmado_at desc,ss.capturado_at desc,ss.id desc limit 1
    ) snap on true
    where s.activo;
    return jsonb_build_object('contract_version',2,'generated_at',v_generated,'revisions',jsonb_build_object('groups',inventario.solog_revision_get('groups',null)),'sites',v_cards);
  end if;

  begin v_site:=(p_payload->>'site_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_SITE'; end;
  if v_site is null or not exists(select 1 from public.sedes s where s.id=v_site and s.activo) then raise exception 'SOLOG_SITE_FORBIDDEN'; end if;

  if p_action='control_groups' then
    return inventario.solog_control_groups_v10(v_uid,v_site,v_generated,p_payload);
  elsif p_action='daily_detail_bootstrap' then
    return inventario.solog_daily_detail_bootstrap_v1(v_uid,v_site,v_generated,p_payload);
  elsif p_action='daily_detail_page' then
    return inventario.solog_daily_detail_page_v1(v_uid,v_site,v_generated,p_payload);
  elsif p_action='control_chronology' then
    return inventario.solog_control_chronology_v10(v_uid,v_site,v_generated,p_payload);
  elsif p_action='shift_grid' then
    v_period:=lower(coalesce(nullif(btrim(p_payload->>'period'),''),'current_biweekly'));
    if v_period='current_biweekly' then v_from_date:=inventario.solog_periodo_desde(v_generated); v_to_date:=inventario.solog_periodo_hasta(v_generated);
    elsif v_period='previous_biweekly' then v_to_date:=inventario.solog_periodo_desde(v_generated)-1; v_from_date:=inventario.solog_periodo_desde((v_to_date::timestamp at time zone 'America/Lima'));
    else raise exception 'SOLOG_EXPORT_PERIOD_INVALID'; end if;
    with dates as (
      select d::date operational_date from generate_series(v_from_date,least(v_to_date,(v_generated at time zone 'America/Lima')::date),interval '1 day') g(d)
    ), shift_rows as (
      select d.operational_date,sc.shift,sc.numerator,sc.denominator,sc.percentage,sc.groups_revision,sc.calculated_at
      from dates d left join inventario.solog_shift_coverage sc on sc.sede_id=v_site and sc.operational_date=d.operational_date
    ), totals as (
      select d.operational_date,b.denominator,b.groups_revision,
        count(distinct dg.grupo_conteo_id) filter (where exists (
          select 1
          from inventario.conteo_detalle cd
          join inventario.conteos c on c.id=cd.conteo_id
          where c.sede_id=v_site
            and cd.grupo_conteo_id=dg.grupo_conteo_id
            and cd.contado_at>=d.operational_date::timestamp at time zone 'America/Lima'
            and cd.contado_at<(d.operational_date+1)::timestamp at time zone 'America/Lima'
        ))::integer numerator
      from dates d
      left join inventario.solog_daily_coverage_base b on b.sede_id=v_site and b.operational_date=d.operational_date
      left join inventario.solog_daily_coverage_groups dg on dg.sede_id=v_site and dg.operational_date=d.operational_date
      group by d.operational_date,b.denominator,b.groups_revision
    )
    select jsonb_build_object(
      'shifts',coalesce((select jsonb_agg(jsonb_build_object('date',sr.operational_date,'shift',sr.shift,'numerator',sr.numerator,'denominator',sr.denominator,'percentage',sr.percentage,'groups_revision',sr.groups_revision,'calculated_at',sr.calculated_at) order by sr.operational_date,sr.shift) from shift_rows sr where sr.shift is not null),'[]'::jsonb),
      'totals',coalesce((select jsonb_agg(jsonb_build_object('date',t.operational_date,'numerator',coalesce(t.numerator,0),'denominator',coalesce(t.denominator,0),'percentage',case when coalesce(t.denominator,0)>0 then round(coalesce(t.numerator,0)::numeric*100/t.denominator,2) else 0 end,'groups_revision',t.groups_revision) order by t.operational_date) from totals t),'[]'::jsonb)
    ) into v_rows;
    return jsonb_build_object('contract_version',2,'generated_at',v_generated,'site_id',v_site,'period',jsonb_build_object('key',v_period,'from',v_from_date,'to',v_to_date),'data',v_rows,
      'revisions',jsonb_build_object('operational',inventario.solog_revision_get('operational',v_site),'groups',inventario.solog_revision_get('groups',null)));

  elsif p_action='daily_detail' then
    begin v_date:=(p_payload->>'origin_date')::date; exception when others then raise exception 'SOLOG_INVALID_DATE_RANGE'; end;
    if v_date is null then raise exception 'SOLOG_INVALID_DATE_RANGE'; end if;
    v_from:=v_date::timestamp at time zone 'America/Lima'; v_to:=(v_date+1)::timestamp at time zone 'America/Lima';
    with base as (
      select cd.*,
        (cd.stock_fisico-cd.stock_teorico) d0,
        case when cd.stock_reconteo is not null and cd.stock_teorico_reconteo is not null then cd.stock_reconteo-cd.stock_teorico_reconteo else null end dr,
        case
          when cd.stock_reconteo is not null and cd.estado_diferencia in ('Inconsistente') then 'recount'
          when cd.stock_reconteo is not null and cd.estado_diferencia='Coincide' and cd.stock_teorico_reconteo is not null and cd.stock_reconteo-cd.stock_teorico_reconteo=0 then 'recount'
          when cd.stock_reconteo is not null and cd.estado_diferencia='Confirmada' and cd.stock_teorico_reconteo is not null and abs(cd.stock_reconteo-cd.stock_teorico_reconteo)<abs(cd.stock_fisico-cd.stock_teorico) then 'recount'
          when cd.stock_reconteo is null and cd.estado_diferencia='Coincide' and cd.primer_snapshot_posterior_id is not null then 'posterior'
          else 'initial' end source_kind
      from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id
      where c.sede_id=v_site and cd.contado_at>=v_from and cd.contado_at<v_to
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'case_id',b.id,'grupo_id',b.grupo_conteo_id,'grupo',b.grupo_nombre,'estado',b.estado_diferencia,'contado_at',b.contado_at,'recontado_at',b.recontado_at,
      'theoretical',case when b.source_kind='recount' then b.stock_teorico_reconteo when b.source_kind='posterior' then b.stock_posterior else b.stock_teorico end,
      'physical',case when b.source_kind='recount' then b.stock_reconteo else b.stock_fisico end,
      'stock_class',case when b.stock_fisico=0 then 'zero' else 'positive' end,
      'difference',b.diferencia,'value',b.valor_diferencia,'source',b.source_kind
    ) order by b.grupo_nombre,b.contado_at,b.id),'[]'::jsonb),
    jsonb_build_object('pending_recount',count(*) filter(where b.estado_diferencia='Recontar'),'confirmed',count(*) filter(where b.estado_diferencia='Confirmada'),'inconsistent',count(*) filter(where b.estado_diferencia='Inconsistente'))
    into v_rows,v_summary from base b;
    return jsonb_build_object('contract_version',2,'generated_at',v_generated,'site_id',v_site,'origin_date',v_date,'summary',v_summary,'items',v_rows,
      'revisions',jsonb_build_object('operational',inventario.solog_revision_get('operational',v_site)));

  elsif p_action='control_page' then
    v_period:=lower(coalesce(nullif(btrim(p_payload->>'period'),''),'today'));
    if v_period='today' then v_from_date:=(v_generated at time zone 'America/Lima')::date; v_to_date:=v_from_date;
    elsif v_period='last_week' then v_to_date:=(v_generated at time zone 'America/Lima')::date; v_from_date:=v_to_date-6;
    elsif v_period='current_biweekly' then v_from_date:=inventario.solog_periodo_desde(v_generated); v_to_date:=inventario.solog_periodo_hasta(v_generated);
    elsif v_period='previous_biweekly' then v_to_date:=inventario.solog_periodo_desde(v_generated)-1; v_from_date:=inventario.solog_periodo_desde((v_to_date::timestamp at time zone 'America/Lima'));
    elsif v_period='custom' then begin v_from_date:=(p_payload->>'date_from')::date; v_to_date:=(p_payload->>'date_to')::date; exception when others then raise exception 'SOLOG_INVALID_DATE_RANGE'; end;
    else raise exception 'SOLOG_INVALID_DATE_RANGE'; end if;
    if v_from_date is null or v_to_date is null or v_to_date<v_from_date or v_to_date-v_from_date>92 then raise exception 'SOLOG_INVALID_DATE_RANGE'; end if;
    v_from:=v_from_date::timestamp at time zone 'America/Lima'; v_to:=(v_to_date+1)::timestamp at time zone 'America/Lima';
    begin v_page:=greatest(coalesce(nullif(p_payload->>'page','')::integer,0),0); v_page_size:=least(greatest(coalesce(nullif(p_payload->>'page_size','')::integer,100),1),100); exception when others then raise exception 'SOLOG_INVALID_PAGE_SIZE'; end;
    v_state:=nullif(btrim(p_payload->>'state'),''); v_search:=nullif(btrim(p_payload->>'search'),'');
    if v_state is not null and v_state not in ('Coincide','Recontar','Confirmada','Inconsistente') then raise exception 'SOLOG_INVALID_DIFFERENCE_STATE'; end if;

    select jsonb_build_object('total',count(*),'coincide',count(*) filter(where cd.estado_diferencia='Coincide'),'pending_recount',count(*) filter(where cd.estado_diferencia='Recontar'),'confirmed',count(*) filter(where cd.estado_diferencia='Confirmada'),'inconsistent',count(*) filter(where cd.estado_diferencia='Inconsistente')) into v_summary
    from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id
    where c.sede_id=v_site and cd.contado_at>=v_from and cd.contado_at<v_to
      and (v_state is null or cd.estado_diferencia=v_state) and (v_search is null or cd.grupo_nombre ilike '%'||v_search||'%');

    select coalesce(jsonb_agg(jsonb_build_object('case_id',q.id,'grupo_id',q.grupo_conteo_id,'grupo',q.grupo_nombre,'categoria',q.categoria_nombre,'contado_at',q.contado_at,'recontado_at',q.recontado_at,'estado_diferencia',q.estado_diferencia,'diferencia',q.diferencia,'valor_diferencia',q.valor_diferencia) order by q.contado_at desc,q.id desc),'[]'::jsonb) into v_rows
    from (
      select cd.* from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id
      where c.sede_id=v_site and cd.contado_at>=v_from and cd.contado_at<v_to
        and (v_state is null or cd.estado_diferencia=v_state) and (v_search is null or cd.grupo_nombre ilike '%'||v_search||'%')
      order by cd.contado_at desc,cd.id desc limit v_page_size offset v_page*v_page_size
    ) q;
    return jsonb_build_object('contract_version',2,'generated_at',v_generated,'site_id',v_site,'period',jsonb_build_object('key',v_period,'from',v_from_date,'to',v_to_date),
      'summary',v_summary,'items',v_rows,'page',v_page,'page_size',v_page_size,'revisions',jsonb_build_object('operational',inventario.solog_revision_get('operational',v_site)));

  elsif p_action='control_detail' then
    begin v_group:=(p_payload->>'group_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_GROUP'; end;
    if v_group is null then raise exception 'SOLOG_INVALID_GROUP'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('case_id',cd.id,'contado_at',cd.contado_at,'recontado_at',cd.recontado_at,'stock_teorico',cd.stock_teorico,'stock_fisico',cd.stock_fisico,'diferencia_inicial',cd.stock_fisico-cd.stock_teorico,'stock_posterior',cd.stock_posterior,'stock_teorico_reconteo',cd.stock_teorico_reconteo,'stock_reconteo',cd.stock_reconteo,'diferencia',cd.diferencia,'estado_diferencia',cd.estado_diferencia,'valor_diferencia',cd.valor_diferencia) order by cd.contado_at desc,cd.id desc),'[]'::jsonb) into v_rows
    from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id where c.sede_id=v_site and cd.grupo_conteo_id=v_group;
    return jsonb_build_object('contract_version',2,'generated_at',v_generated,'site_id',v_site,'group_id',v_group,'chronology',v_rows,'revisions',jsonb_build_object('operational',inventario.solog_revision_get('operational',v_site)));
  else raise exception 'SOLOG_INVALID_ACTION'; end if;
end;
$function$


