CREATE OR REPLACE FUNCTION public.rpc_solog_admin_incidents_v2(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_rol text; v_activo boolean; v_site uuid; v_family text; v_operation uuid; v_scope text; v_replay jsonb; v_response jsonb;
  v_period_from date; v_period_to date; v_from timestamptz; v_to timestamptz; v_rows jsonb; v_page integer; v_page_size integer;
  v_inc inventario.incidencias%rowtype; v_until timestamptz; v_exclusion uuid; v_current bigint; v_expected bigint; v_fp text; v_change_id uuid;
  v_has_current boolean;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;
  select u.rol::text,u.activo into v_rol,v_activo from public.usuarios u where u.id=v_uid;
  if not found or not coalesce(v_activo,false) then raise exception 'SOLOG_USER_DISABLED'; end if;
  if v_rol not in ('admin','moderador') then raise exception 'SOLOG_ADMIN_ROLE_REQUIRED'; end if;
  if nullif(p_payload->>'site_id','') is not null then
    begin v_site:=(p_payload->>'site_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_SITE'; end;
    if not exists(select 1 from public.sedes s where s.id=v_site and s.activo) then raise exception 'SOLOG_SITE_FORBIDDEN'; end if;
  end if;

  if p_action='summary' then
    v_period_from:=inventario.solog_periodo_desde(now()); v_period_to:=inventario.solog_periodo_hasta(now());
    v_from:=v_period_from::timestamp at time zone 'America/Lima'; v_to:=(v_period_to+1)::timestamp at time zone 'America/Lima';
    with scoped as (
      select i.* from inventario.incidencias i
      where i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
        and (v_site is null or i.sede_id=v_site)
        and ((i.last_seen_at>=v_from and i.last_seen_at<v_to) or (i.resuelta_at is not null and i.resuelta_at>=v_from and i.resuelta_at<v_to))
    ), latest as (
      select distinct on (i.family_key) i.* from scoped i
      order by i.family_key,case when i.estado in ('pendiente','suprimida') then 0 else 1 end,i.last_seen_at desc,i.id desc
    ), agg as (
      select i.family_key,count(*)::integer cases,sum(i.occurrence_count)::bigint occurrences,count(distinct i.sede_id)::integer sites,
        count(*) filter(where i.estado='pendiente')::integer pending_cases,
        count(*) filter(where i.estado='suprimida')::integer suppressed_cases,
        count(*) filter(where i.estado='resuelta')::integer resolved_cases,
        count(*) filter(where i.estado in ('pendiente','suprimida'))::integer active_cases,
        min(i.first_seen_at) first_seen_at,max(i.last_seen_at) last_seen_at,max(i.resuelta_at) resolved_at
      from scoped i group by i.family_key
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'family_key',l.family_key,'tipo',l.tipo,'c_interno',l.c_interno,'c_interno_original',l.c_interno_original,'datos',l.datos,
      'representative_id',l.id,'representative_site_id',l.sede_id,'cases',a.cases,'occurrences',a.occurrences,'sites',a.sites,
      'pending_cases',a.pending_cases,'suppressed_cases',a.suppressed_cases,'resolved_cases',a.resolved_cases,'active_cases',a.active_cases,
      'active',a.active_cases>0,'family_state',case when a.pending_cases>0 then 'pendiente' when a.suppressed_cases>0 then 'suprimida' else 'resuelta' end,
      'first_seen_at',a.first_seen_at,'last_seen_at',a.last_seen_at,'resolved_at',a.resolved_at,
      'active_suppression_until',(select max(e.hasta_at) from inventario.exclusiones_incidencias e where e.family_key=l.family_key and e.revocada_at is null and now()>=e.desde_at and now()<e.hasta_at and (e.sede_id is null or v_site is null or e.sede_id=v_site)),
      'scope_suppression_until',(select max(e.hasta_at) from inventario.exclusiones_incidencias e where e.family_key=l.family_key and e.revocada_at is null and now()>=e.desde_at and now()<e.hasta_at and e.sede_id is not distinct from v_site),
      'reactivate_available',exists(select 1 from inventario.exclusiones_incidencias e where e.family_key=l.family_key and e.revocada_at is null and now()>=e.desde_at and now()<e.hasta_at and e.sede_id is not distinct from v_site),
      'deletion_proposed',exists(select 1 from inventario.cambios_catalogo cc where cc.tipo='eliminar_producto' and cc.c_interno=l.c_interno and cc.estado in ('pendiente','aprobado','incorporado'))
    ) order by (a.active_cases>0) desc,a.last_seen_at desc,l.family_key),'[]'::jsonb) into v_rows
    from latest l join agg a using(family_key);
    return jsonb_build_object('contract_version',2,'generated_at',now(),'period',jsonb_build_object('from',v_period_from,'to',v_period_to),'site_id',v_site,'families',v_rows,
      'revisions',jsonb_build_object(
        'incidents',inventario.solog_revision_get('incidents',v_site),
        'incidents_global',inventario.solog_revision_get('incidents',null)
      ));

  elsif p_action='detail_sites' then
    v_family:=nullif(btrim(p_payload->>'family_key'),'');
    if v_family is null or length(v_family)<>64 then raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND'; end if;

    if not exists(
      select 1
      from inventario.incidencias i
      where i.family_key=v_family
        and i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
    ) then
      raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND';
    end if;

    with family_sites as (
      select
        i.sede_id,
        sum(i.occurrence_count)::bigint occurrences,
        count(*) filter(where i.estado='pendiente')::integer pending_rows,
        count(*) filter(where i.estado='suprimida')::integer suppressed_rows,
        count(*) filter(where i.estado in ('pendiente','suprimida'))::integer active_rows,
        min(i.first_seen_at) first_seen_at,
        max(i.last_seen_at) last_seen_at,
        max(i.resuelta_at) resolved_at
      from inventario.incidencias i
      where i.family_key=v_family
        and i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
      group by i.sede_id
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'site_id',s.id,
          'site',s.nombre,
          'occurrences',coalesce(fs.occurrences,0),
          'state',case
            when fs.sede_id is null then null
            when fs.pending_rows>0 then 'pendiente'
            when fs.suppressed_rows>0 then 'suprimida'
            else 'resuelta'
          end,
          'active',coalesce(fs.active_rows,0)>0,
          'first_seen_at',fs.first_seen_at,
          'last_seen_at',fs.last_seen_at,
          'resolved_at',fs.resolved_at
        )
        order by case lower(s.nombre)
          when 'cutervo' then 1
          when 'huaca' then 2
          when 'divino' then 3
          when 'unidad' then 4
          when 'casuarinas' then 5
          when 'casua' then 5
          else 99
        end, s.nombre
      ),
      '[]'::jsonb
    )
    into v_rows
    from public.sedes s
    left join family_sites fs on fs.sede_id=s.id
    where s.activo;

    return jsonb_build_object(
      'contract_version',2,
      'generated_at',now(),
      'family_key',v_family,
      'sites',v_rows,
      'revisions',jsonb_build_object(
        'incidents',inventario.solog_revision_get('incidents',null)
      )
    );

  elsif p_action='detail' then
    v_family:=nullif(btrim(p_payload->>'family_key'),''); if v_family is null or length(v_family)<>64 then raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND'; end if;
    begin v_page:=greatest(coalesce(nullif(p_payload->>'page','')::integer,0),0); v_page_size:=least(greatest(coalesce(nullif(p_payload->>'page_size','')::integer,100),1),100); exception when others then raise exception 'SOLOG_INVALID_PAGE_SIZE'; end;
    select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'sede_id',q.sede_id,'sede',q.sede,'c_interno',q.c_interno,'c_interno_original',q.c_interno_original,'tipo',q.tipo,'estado',q.estado,'datos',q.datos,'first_seen_at',q.first_seen_at,'last_seen_at',q.last_seen_at,'occurrence_count',q.occurrence_count,'resuelta_at',q.resuelta_at,'active',q.estado in ('pendiente','suprimida'),'primer_snapshot_id',q.primer_snapshot_id,'ultimo_snapshot_id',q.ultimo_snapshot_id) order by q.last_seen_at desc,q.id desc),'[]'::jsonb) into v_rows
    from (
      select i.*,s.nombre sede from inventario.incidencias i join public.sedes s on s.id=i.sede_id
      where i.family_key=v_family
        and i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
        and (v_site is null or i.sede_id=v_site)
      order by i.last_seen_at desc,i.id desc limit v_page_size offset v_page*v_page_size
    ) q;
    if not exists(select 1 from inventario.incidencias i where i.family_key=v_family and i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido') and (v_site is null or i.sede_id=v_site)) then raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND'; end if;
    return jsonb_build_object('contract_version',2,'generated_at',now(),'family_key',v_family,'site_id',v_site,'items',v_rows,'page',v_page,'page_size',v_page_size,
      'revisions',jsonb_build_object('incidents',inventario.solog_revision_get('incidents',v_site)));

  elsif p_action in ('ignore_30d','reactivate','propose_delete') then
    v_family:=nullif(btrim(p_payload->>'family_key'),''); if v_family is null or length(v_family)<>64 then raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND'; end if;
    begin v_operation:=(p_payload->>'operation_id')::uuid; exception when others then raise exception 'SOLOG_INVALID_OPERATION'; end;
    if v_operation is null then raise exception 'SOLOG_INVALID_OPERATION'; end if;
    v_scope:=lower(coalesce(nullif(btrim(p_payload->>'scope'),''),case when v_site is null then 'global' else 'site' end));
    if v_scope not in ('global','site') then raise exception 'SOLOG_INVALID_INCIDENT_SCOPE'; end if;
    if v_scope='site' and v_site is null then raise exception 'SOLOG_INVALID_SITE'; end if;
    v_replay:=inventario.solog_operation_begin('incidents:'||p_action,v_uid,v_operation,p_payload);
    if v_replay is not null then return v_replay||jsonb_build_object('replay',true); end if;
    perform pg_advisory_xact_lock(hashtextextended('solog-incidents:'||v_family||':'||v_scope||':'||coalesce(v_site::text,'global'),0));

    select * into v_inc from inventario.incidencias i
    where i.family_key=v_family
      and i.tipo in ('producto_ausente','codigo_interno_invalido','codigo_interno_duplicado','stock_invalido')
      and (v_site is null or i.sede_id=v_site)
    order by case when i.estado in ('pendiente','suprimida') then 0 else 1 end,i.last_seen_at desc,i.id desc limit 1 for update;
    if not found then raise exception 'SOLOG_INCIDENT_FAMILY_NOT_FOUND'; end if;
    v_current:=inventario.solog_revision_get('incidents',case when v_scope='site' then v_site else null end);
    begin v_expected:=nullif(p_payload->>'expected_revision','')::bigint; exception when others then raise exception 'SOLOG_MASTERDATA_REVISION_CONFLICT'; end;
    if v_expected is not null and v_expected<>v_current then raise exception 'SOLOG_MASTERDATA_REVISION_CONFLICT'; end if;

    if p_action='ignore_30d' then
      if not exists(select 1 from inventario.incidencias i where i.family_key=v_family and i.estado in ('pendiente','suprimida') and (v_scope='global' or i.sede_id=v_site)) then raise exception 'SOLOG_INCIDENT_NOT_CURRENT'; end if;
      v_until:=now()+interval '30 days';
      select e.id into v_exclusion from inventario.exclusiones_incidencias e
      where e.family_key=v_family and e.sede_id is not distinct from (case when v_scope='site' then v_site else null end) and e.revocada_at is null
      order by e.created_at desc limit 1 for update;
      if v_exclusion is null then
        insert into inventario.exclusiones_incidencias(sede_id,c_interno,tipo,incidencia_origen_id,desde_at,hasta_at,motivo,revocada_at,created_at,family_key)
        values(case when v_scope='site' then v_site else null end,v_inc.c_interno,v_inc.tipo,v_inc.id,now(),v_until,'ignorar_30_dias',null,now(),v_family) returning id into v_exclusion;
      else
        update inventario.exclusiones_incidencias set incidencia_origen_id=v_inc.id,desde_at=now(),hasta_at=v_until,motivo='ignorar_30_dias',revocada_at=null where id=v_exclusion;
      end if;
      update inventario.incidencias set estado='suprimida',resuelta_at=null,updated_at=now()
      where family_key=v_family and estado in ('pendiente','suprimida') and (v_scope='global' or sede_id=v_site);
      insert into inventario.auditoria(accion,entidad,entidad_id,actor_tipo,actor_id,sede_id,datos)
      values('suppress_incident_30d','familia_incidencia',v_family,'usuario',v_uid::text,case when v_scope='site' then v_site else null end,jsonb_build_object('scope',v_scope,'hasta_at',v_until,'exclusion_id',v_exclusion));
      v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'status','suppressed','family_key',v_family,'scope',v_scope,'site_id',case when v_scope='site' then v_site else null end,'until',v_until,
        'revisions',jsonb_build_object('incidents',inventario.solog_revision_get('incidents',case when v_scope='site' then v_site else null end)));

    elsif p_action='reactivate' then
      if not exists(
        select 1
        from inventario.exclusiones_incidencias e
        where e.family_key=v_family
          and e.revocada_at is null
          and now()>=e.desde_at and now()<e.hasta_at
          and e.sede_id is not distinct from (case when v_scope='site' then v_site else null end)
      ) then
        raise exception 'SOLOG_INCIDENT_SUPPRESSION_NOT_ACTIVE';
      end if;
      update inventario.exclusiones_incidencias set revocada_at=now()
      where family_key=v_family
        and revocada_at is null
        and now()>=desde_at and now()<hasta_at
        and sede_id is not distinct from (case when v_scope='site' then v_site else null end);
      update inventario.incidencias set estado='pendiente',resuelta_at=null,updated_at=now()
      where family_key=v_family and estado='suprimida' and (v_scope='global' or sede_id=v_site)
        and not exists(select 1 from inventario.exclusiones_incidencias e where e.family_key=v_family and e.revocada_at is null and now()>=e.desde_at and now()<e.hasta_at and (e.sede_id is null or e.sede_id=inventario.incidencias.sede_id));
      insert into inventario.auditoria(accion,entidad,entidad_id,actor_tipo,actor_id,sede_id,datos)
      values('reactivate_incident_family','familia_incidencia',v_family,'usuario',v_uid::text,case when v_scope='site' then v_site else null end,jsonb_build_object('scope',v_scope));
      v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'status','active','family_key',v_family,'scope',v_scope,'site_id',case when v_scope='site' then v_site else null end,
        'revisions',jsonb_build_object('incidents',inventario.solog_revision_get('incidents',case when v_scope='site' then v_site else null end)));

    else
      if v_inc.tipo<>'producto_ausente' or v_inc.c_interno is null then raise exception 'SOLOG_INCIDENT_ACTION_NOT_ALLOWED'; end if;
      select exists(
        select 1
        from inventario.incidencias i
        join inventario.snapshots s on s.id=i.ultimo_snapshot_id and s.estado='confirmado' and s.confirmado_at is not null
        join inventario.snapshot_stock ss on ss.snapshot_id=s.id and ss.c_interno=i.c_interno
        where i.family_key=v_family and i.tipo='producto_ausente' and i.estado in ('pendiente','suprimida')
          and (v_scope='global' or i.sede_id=v_site)
          and ss.estado_observacion='producto_ausente' and ss.producto_eliminado
          and not exists(select 1 from inventario.snapshots newer where newer.sede_id=i.sede_id and newer.estado='confirmado' and newer.confirmado_at is not null and (newer.capturado_at>s.capturado_at or (newer.capturado_at=s.capturado_at and newer.id>s.id)))
      ) into v_has_current;
      if not v_has_current then raise exception 'SOLOG_INCIDENT_NOT_CURRENT'; end if;
      v_fp:=encode(extensions.digest(concat_ws('|',v_inc.c_interno::text,'eliminar_producto'),'sha256'),'hex');
      insert into inventario.cambios_catalogo(propuesta_fingerprint,ambito,c_interno,grupo_id,tipo,estado,datos,incidencia_origen_id,aprobado_por,aprobado_at,created_at,updated_at)
      values(v_fp,'producto',v_inc.c_interno,null,'eliminar_producto','aprobado',jsonb_build_object('producto',coalesce((select c.producto from inventario.catalogo c where c.c_interno=v_inc.c_interno),v_inc.datos->>'producto'),'origen','producto_ausente_manual'),v_inc.id,v_uid,now(),now(),now())
      on conflict(propuesta_fingerprint) do update set estado='aprobado',datos=excluded.datos,incidencia_origen_id=excluded.incidencia_origen_id,aprobado_por=v_uid,aprobado_at=now(),ignorado_por=null,ignorado_at=null,updated_at=now() returning id into v_change_id;
      insert into inventario.auditoria(accion,entidad,entidad_id,actor_tipo,actor_id,sede_id,datos)
      values('approve_product_deletion','familia_incidencia',v_family,'usuario',v_uid::text,case when v_scope='site' then v_site else null end,jsonb_build_object('scope',v_scope,'c_interno',v_inc.c_interno,'cambio_catalogo_id',v_change_id));
      v_response:=jsonb_build_object('contract_version',2,'generated_at',now(),'replay',false,'status','deletion_proposed','family_key',v_family,'scope',v_scope,'site_id',case when v_scope='site' then v_site else null end,'cambio_catalogo_id',v_change_id,
        'revisions',jsonb_build_object('incidents',inventario.solog_revision_get('incidents',case when v_scope='site' then v_site else null end),'catalog',inventario.solog_revision_get('catalog',null)));
    end if;
    return inventario.solog_operation_finish('incidents:'||p_action,v_uid,v_operation,v_response);
  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$

