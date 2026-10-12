CREATE OR REPLACE FUNCTION public.rpc_solog_control_export_v2(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_rol text; v_activo boolean; v_site uuid; v_site_name text; v_period text; v_from_date date; v_to_date date; v_from timestamptz; v_to timestamptz;
  v_summary jsonb; v_adjust jsonb; v_pending jsonb; v_inconsistent jsonb; v_all jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;
  select u.rol::text,u.activo into v_rol,v_activo from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol not in ('admin','moderador') then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;
  begin v_site:=(p_payload->>'site_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_SITE'; end;
  select s.nombre into v_site_name from public.sedes s where s.id=v_site and s.activo;
  if not found then raise exception 'SOLOG_SITE_FORBIDDEN'; end if;
  v_period:=lower(coalesce(nullif(btrim(p_payload->>'period'),''),'current_biweekly'));
  if v_period='current_biweekly' then v_from_date:=inventario.solog_periodo_desde(now()); v_to_date:=inventario.solog_periodo_hasta(now());
  elsif v_period='previous_biweekly' then v_to_date:=inventario.solog_periodo_desde(now())-1; v_from_date:=inventario.solog_periodo_desde((v_to_date::timestamp at time zone 'America/Lima'));
  else raise exception 'SOLOG_EXPORT_PERIOD_INVALID'; end if;
  v_from:=v_from_date::timestamp at time zone 'America/Lima'; v_to:=(v_to_date+1)::timestamp at time zone 'America/Lima';

  with base as (
    select cd.*,(cd.stock_fisico-cd.stock_teorico) d0,
      case when cd.stock_reconteo is not null and cd.stock_teorico_reconteo is not null then cd.stock_reconteo-cd.stock_teorico_reconteo else null end dr,
      case
        when cd.stock_reconteo is not null and cd.estado_diferencia='Inconsistente' then 'recount'
        when cd.stock_reconteo is not null and cd.estado_diferencia='Coincide' and cd.stock_teorico_reconteo is not null and cd.stock_reconteo-cd.stock_teorico_reconteo=0 then 'recount'
        when cd.stock_reconteo is not null and cd.estado_diferencia='Confirmada' and cd.stock_teorico_reconteo is not null and abs(cd.stock_reconteo-cd.stock_teorico_reconteo)<abs(cd.stock_fisico-cd.stock_teorico) then 'recount'
        when cd.stock_reconteo is null and cd.estado_diferencia='Coincide' and cd.primer_snapshot_posterior_id is not null then 'posterior'
        else 'initial' end source_kind
    from inventario.conteo_detalle cd join inventario.conteos c on c.id=cd.conteo_id
    where c.sede_id=v_site and cd.contado_at>=v_from and cd.contado_at<v_to
  ), normalized as (
    select b.*,
      case when b.source_kind='recount' then b.stock_teorico_reconteo when b.source_kind='posterior' then b.stock_posterior else b.stock_teorico end result_theoretical,
      case when b.source_kind='recount' then b.stock_reconteo else b.stock_fisico end result_physical
    from base b
  ), last_resolved as (
    select distinct on (n.grupo_conteo_id) n.*
    from normalized n where n.estado_diferencia in ('Coincide','Confirmada')
    order by n.grupo_conteo_id,n.contado_at desc,n.id desc
  )
  select
    jsonb_build_object('total',count(*),'coincide',count(*) filter(where n.estado_diferencia='Coincide'),'pending_recount',count(*) filter(where n.estado_diferencia='Recontar'),'confirmed',count(*) filter(where n.estado_diferencia='Confirmada'),'inconsistent',count(*) filter(where n.estado_diferencia='Inconsistente')),
    coalesce((select jsonb_agg(jsonb_build_object('case_id',l.id,'grupo_id',l.grupo_conteo_id,'grupo',l.grupo_nombre,'categoria',l.categoria_nombre,'fecha_origen',l.contado_at,'estado',l.estado_diferencia,'teorico',l.result_theoretical,'fisico',l.result_physical,'diferencia',l.diferencia,'valorizado',l.valor_diferencia,'source',l.source_kind) order by l.grupo_nombre,l.grupo_conteo_id) from last_resolved l where l.estado_diferencia='Confirmada' and l.diferencia<>0),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('case_id',p.id,'grupo_id',p.grupo_conteo_id,'grupo',p.grupo_nombre,'categoria',p.categoria_nombre,'fecha_origen',p.contado_at,'teorico_conteo',p.stock_teorico,'fisico_conteo',p.stock_fisico,'diferencia',p.diferencia,'stock_posterior',p.stock_posterior) order by p.grupo_nombre,p.contado_at,p.id) from normalized p where p.estado_diferencia='Recontar'),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('case_id',i.id,'grupo_id',i.grupo_conteo_id,'grupo',i.grupo_nombre,'categoria',i.categoria_nombre,'fecha_origen',i.contado_at,'teorico_conteo',i.stock_teorico,'fisico_conteo',i.stock_fisico,'diferencia_conteo',i.d0,'teorico_reconteo',i.stock_teorico_reconteo,'fisico_reconteo',i.stock_reconteo,'diferencia_reconteo',i.dr,'estado',i.estado_diferencia) order by i.grupo_nombre,i.contado_at,i.id) from normalized i where i.estado_diferencia='Inconsistente'),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('case_id',a.id,'grupo_id',a.grupo_conteo_id,'grupo',a.grupo_nombre,'categoria',a.categoria_nombre,'fecha_origen',a.contado_at,'recontado_at',a.recontado_at,'estado',a.estado_diferencia,'teorico',a.result_theoretical,'fisico',a.result_physical,'diferencia',a.diferencia,'valorizado',a.valor_diferencia,'source',a.source_kind) order by a.grupo_nombre,a.contado_at,a.id) from normalized a),'[]'::jsonb)
  into v_summary,v_adjust,v_pending,v_inconsistent,v_all
  from normalized n;

  return jsonb_build_object('contract_version',2,'generated_at',now(),'site',jsonb_build_object('id',v_site,'nombre',v_site_name),'period',jsonb_build_object('key',v_period,'from',v_from_date,'to',v_to_date),
    'summary',v_summary,'adjustments',v_adjust,'pending_recount',v_pending,'inconsistent',v_inconsistent,'all',v_all,
    'revisions',jsonb_build_object('operational',inventario.solog_revision_get('operational',v_site),'groups',inventario.solog_revision_get('groups',null)));
end;
$function$
;
