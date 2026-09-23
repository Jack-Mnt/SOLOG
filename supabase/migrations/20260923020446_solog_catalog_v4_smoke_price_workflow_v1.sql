create or replace function inventario.solog_catalog_price_group_pending_v4(
  p_group_id uuid,
  p_exclude_fingerprint text default null
)
returns table(
  propuesta_fingerprint text,
  c_interno integer,
  producto text,
  nuevo_precio numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    ca.propuesta_fingerprint,
    ca.c_interno,
    c.producto,
    (ca.datos->>'nuevo')::numeric as nuevo_precio
  from inventario.catalogo_candidatos() ca
  join inventario.catalogo c
    on c.c_interno=ca.c_interno
  left join inventario.cambios_catalogo cc
    on cc.propuesta_fingerprint=ca.propuesta_fingerprint
  where ca.tipo='precio'
    and c.grupo_conteo_id=p_group_id
    and c.estado<>'Excluido'
    and (p_exclude_fingerprint is null or ca.propuesta_fingerprint<>p_exclude_fingerprint)
    and (
      cc.id is null
      or (cc.estado='pendiente' and cc.origen_propuesta='automatico')
    );
$function$;

create or replace function inventario.solog_catalog_apply_group_valuation_v4(
  p_group_id uuid,
  p_package_action text,
  p_units integer,
  p_package_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_group inventario.grupos_conteo%rowtype;
  v_before jsonb;
begin
  select *
    into v_group
  from inventario.grupos_conteo g
  where g.id=p_group_id and g.activo
  for update;

  if not found then
    raise exception 'SOLOG_GROUP_NOT_AVAILABLE';
  end if;

  v_before:=jsonb_build_object(
    'unidades_por_paquete',v_group.unidades_por_paquete,
    'precio_paquete',v_group.precio_paquete
  );

  if p_package_action='keep' then
    null;
  elsif p_package_action='clear' then
    if v_group.unidades_por_paquete is not null or v_group.precio_paquete is not null then
      update inventario.grupos_conteo
         set unidades_por_paquete=null,
             precio_paquete=null
       where id=p_group_id;
    end if;
  elsif p_package_action='set' then
    if p_units is null or p_units<=1 then
      raise exception 'SOLOG_INVALID_PACKAGE_CONFIGURATION';
    end if;
    if p_package_price is null or p_package_price<=0 then
      raise exception 'SOLOG_INVALID_PACKAGE_PRICE';
    end if;
    if v_group.unidades_por_paquete is distinct from p_units
       or v_group.precio_paquete is distinct from p_package_price then
      update inventario.grupos_conteo
         set unidades_por_paquete=p_units,
             precio_paquete=p_package_price
       where id=p_group_id;
    end if;
  elsif p_package_action='update' then
    if coalesce(v_group.unidades_por_paquete,0)<=1 then
      raise exception 'SOLOG_INVALID_PACKAGE_CONFIGURATION';
    end if;
    if p_package_price is null or p_package_price<=0 then
      raise exception 'SOLOG_INVALID_PACKAGE_PRICE';
    end if;
    if v_group.precio_paquete is distinct from p_package_price then
      update inventario.grupos_conteo
         set precio_paquete=p_package_price
       where id=p_group_id;
    end if;
  else
    raise exception 'SOLOG_PACKAGE_PRICE_DECISION_REQUIRED';
  end if;

  select *
    into v_group
  from inventario.grupos_conteo
  where id=p_group_id;

  return jsonb_build_object(
    'before',v_before,
    'after',jsonb_build_object(
      'unidades_por_paquete',v_group.unidades_por_paquete,
      'precio_paquete',v_group.precio_paquete
    )
  );
end;
$function$;

create or replace function inventario.solog_catalog_price_options_v4(
  p_uid uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_group_id uuid;
  v_fp text;
  v_target numeric;
  v_equivalent jsonb;
  v_conflicting jsonb;
begin
  v_base:=inventario.solog_admin_catalog_read_v3(p_uid,'price_options',p_payload);
  v_fp:=v_base->>'propuesta_fingerprint';
  v_group_id:=(v_base#>>'{grupo,id}')::uuid;
  v_target:=(v_base->>'nuevo_precio')::numeric;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'propuesta_fingerprint',p.propuesta_fingerprint,
          'c_interno',p.c_interno,
          'producto',p.producto,
          'nuevo_precio',p.nuevo_precio
        )
        order by p.producto,p.c_interno
      ) filter(where p.nuevo_precio=v_target),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'propuesta_fingerprint',p.propuesta_fingerprint,
          'c_interno',p.c_interno,
          'producto',p.producto,
          'nuevo_precio',p.nuevo_precio
        )
        order by p.producto,p.c_interno
      ) filter(where p.nuevo_precio is distinct from v_target),
      '[]'::jsonb
    )
    into v_equivalent,v_conflicting
  from inventario.solog_catalog_price_group_pending_v4(v_group_id,v_fp) p;

  return v_base||jsonb_build_object(
    'contract_version',4,
    'equivalent_proposals',v_equivalent,
    'conflicting_proposals',v_conflicting
  );
end;
$function$;

create or replace function inventario.solog_catalog_price_mutate_v4(
  p_uid uuid,
  p_mode text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fp text;
  v_resolution text;
  v_package_action text;
  v_change inventario.cambios_catalogo%rowtype;
  v_candidate record;
  v_product inventario.catalogo%rowtype;
  v_group inventario.grupos_conteo%rowtype;
  v_data jsonb;
  v_target numeric;
  v_units integer;
  v_package_price numeric;
  v_stage_payload jsonb;
  v_valuation jsonb:=null;
  v_first jsonb;
  v_second jsonb;
  v_related record;
  v_related_count integer:=0;
  v_conflicts jsonb:='[]'::jsonb;
  v_change_id uuid;
begin
  if p_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_mode not in ('resolve','prepare') then raise exception 'SOLOG_INVALID_ACTION'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'SOLOG_INVALID_PAYLOAD'; end if;

  v_fp:=nullif(btrim(p_payload->>'propuesta_fingerprint'),'');
  v_resolution:=lower(nullif(btrim(p_payload->>'resolution'),''));
  v_package_action:=lower(nullif(btrim(p_payload->>'package_action'),''));

  if v_fp is null or length(v_fp)<>64 then raise exception 'SOLOG_INVALID_CATALOG_CHANGE_ID'; end if;
  if v_resolution not in ('update_group_price','separate_sku','keep_structure') then
    raise exception 'SOLOG_INVALID_PRICE_RESOLUTION';
  end if;

  select *
    into v_change
  from inventario.cambios_catalogo cc
  where cc.propuesta_fingerprint=v_fp and cc.tipo='precio'
  for update;

  if p_mode='resolve' then
    if found then
      if v_change.estado<>'pendiente' then raise exception 'SOLOG_CATALOG_CHANGE_NOT_PENDING'; end if;
      v_data:=v_change.datos;
    else
      select *
        into v_candidate
      from inventario.catalogo_candidatos() ca
      where ca.propuesta_fingerprint=v_fp and ca.tipo='precio';
      if not found then raise exception 'SOLOG_CATALOG_CHANGE_NOT_FOUND'; end if;
      v_change.c_interno:=v_candidate.c_interno;
      v_data:=v_candidate.datos;
    end if;
  else
    if not found or v_change.estado<>'aprobado' then
      raise exception 'SOLOG_CATALOG_CHANGE_NOT_APPROVED';
    end if;
    v_data:=v_change.datos;
  end if;

  select *
    into v_product
  from inventario.catalogo c
  where c.c_interno=v_change.c_interno
    and c.estado<>'Excluido'
  for update;

  if not found or v_product.grupo_conteo_id is null then
    raise exception 'SOLOG_GROUP_NOT_AVAILABLE';
  end if;

  select *
    into v_group
  from inventario.grupos_conteo g
  where g.id=v_product.grupo_conteo_id and g.activo
  for update;

  if not found then raise exception 'SOLOG_GROUP_NOT_AVAILABLE'; end if;

  begin
    v_target:=(v_data->>'nuevo')::numeric;
  exception when others then
    raise exception 'SOLOG_INVALID_PRICE_RESOLUTION';
  end;

  if v_resolution='update_group_price' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'propuesta_fingerprint',p.propuesta_fingerprint,
          'c_interno',p.c_interno,
          'producto',p.producto,
          'nuevo_precio',p.nuevo_precio
        )
        order by p.producto,p.c_interno
      ),
      '[]'::jsonb
    )
      into v_conflicts
    from inventario.solog_catalog_price_group_pending_v4(v_group.id,v_fp) p
    where p.nuevo_precio is distinct from v_target;

    if jsonb_array_length(v_conflicts)>0 then
      raise exception 'SOLOG_GROUP_PRICE_PROPOSAL_CONFLICT'
        using detail=v_conflicts::text;
    end if;
  end if;

  if v_resolution<>'separate_sku' then
    begin
      v_units:=nullif(p_payload->>'unidades_por_paquete','')::integer;
      v_package_price:=nullif(p_payload->>'precio_paquete','')::numeric;
    exception when others then
      raise exception 'SOLOG_INVALID_PACKAGE_CONFIGURATION';
    end;

    v_valuation:=inventario.solog_catalog_apply_group_valuation_v4(
      v_group.id,
      v_package_action,
      v_units,
      v_package_price
    );

    v_stage_payload:=(p_payload-'operation_id'-'unidades_por_paquete'-'precio_paquete')
      ||jsonb_build_object('package_action','keep');
  else
    v_stage_payload:=p_payload-'operation_id';
  end if;

  if p_mode='resolve' then
    v_first:=inventario.solog_admin_catalog_mutate_v3(
      p_uid,
      'proposal_action',
      jsonb_build_object(
        'propuesta_fingerprint',v_fp,
        'action','approve'
      )
    );
  end if;

  v_second:=inventario.solog_admin_catalog_mutate_v3(
    p_uid,
    'prepare_price',
    v_stage_payload
  );

  if coalesce(v_second->>'block_reason','')<>'' then
    raise exception 'SOLOG_CATALOG_CHANGE_RESOLUTION_INCOMPLETE';
  end if;

  v_change_id:=(v_second->>'cambio_id')::uuid;

  if v_resolution='update_group_price' then
    for v_related in
      select *
      from inventario.solog_catalog_price_group_pending_v4(v_group.id,v_fp) p
      where p.nuevo_precio=v_target
      order by p.c_interno,p.propuesta_fingerprint
    loop
      v_first:=inventario.solog_admin_catalog_mutate_v3(
        p_uid,
        'proposal_action',
        jsonb_build_object(
          'propuesta_fingerprint',v_related.propuesta_fingerprint,
          'action','approve'
        )
      );

      v_first:=inventario.solog_admin_catalog_mutate_v3(
        p_uid,
        'prepare_price',
        jsonb_build_object(
          'propuesta_fingerprint',v_related.propuesta_fingerprint,
          'resolution','update_group_price',
          'package_action','keep'
        )
      );

      if coalesce(v_first->>'block_reason','')<>'' then
        raise exception 'SOLOG_CATALOG_CHANGE_RESOLUTION_INCOMPLETE';
      end if;

      v_related_count:=v_related_count+1;
    end loop;
  end if;

  insert into inventario.auditoria(
    accion,entidad,entidad_id,actor_tipo,actor_id,datos
  )
  values(
    case when p_mode='resolve'
      then 'resolve_and_approve_catalog_price_v4'
      else 'prepare_catalog_price_v4'
    end,
    'cambio_catalogo',
    v_change_id::text,
    'usuario',
    p_uid::text,
    jsonb_build_object(
      'propuesta_fingerprint',v_fp,
      'resolution',v_resolution,
      'package_action_requested',v_package_action,
      'valuation_applied',v_valuation,
      'group_equivalent_resolved',v_related_count
    )
  );

  return jsonb_build_object(
    'ok',true,
    'codigo',case when p_mode='resolve'
      then 'CATALOG_PRICE_RESOLVED_AND_APPROVED'
      else 'CATALOG_PRICE_PREPARED'
    end,
    'cambio_id',v_change_id,
    'propuesta_fingerprint',v_fp,
    'estado','aprobado',
    'tipo','precio',
    'resolution',v_second->'resolution',
    'valuation_applied',v_valuation,
    'group_equivalent_resolved',v_related_count,
    'group_resolution_count',v_related_count+1,
    'block_reason',v_second->'block_reason'
  );
end;
$function$;

revoke execute on function inventario.solog_catalog_price_group_pending_v4(uuid,text) from public,anon,authenticated;
revoke execute on function inventario.solog_catalog_apply_group_valuation_v4(uuid,text,integer,numeric) from public,anon,authenticated;
revoke execute on function inventario.solog_catalog_price_options_v4(uuid,jsonb) from public,anon,authenticated;
revoke execute on function inventario.solog_catalog_price_mutate_v4(uuid,text,jsonb) from public,anon,authenticated;


CREATE OR REPLACE FUNCTION inventario.solog_catalog_proposal_action_v4(p_uid uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fp text;
  v_action text;
  v_change inventario.cambios_catalogo%rowtype;
  v_candidate record;
  v_datos jsonb;
  v_context jsonb;
  v_suppression inventario.catalogo_supresiones_evidencia%rowtype;
  v_incidents integer:=0;
  v_sites jsonb:='[]'::jsonb;
begin
  if p_uid is null then
    raise exception 'SOLOG_AUTH_REQUIRED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  v_fp:=nullif(btrim(p_payload->>'propuesta_fingerprint'),'');
  v_action:=lower(nullif(btrim(p_payload->>'action'),''));

  if v_fp is null or length(v_fp)<>64 then
    raise exception 'SOLOG_INVALID_CATALOG_CHANGE_ID';
  end if;
  if v_action not in ('ignore','reactivate','withdraw','discard') then
    raise exception 'SOLOG_INVALID_CATALOG_CHANGE_ACTION';
  end if;

  if v_action='ignore' then
    select *
      into v_change
    from inventario.cambios_catalogo cc
    where cc.propuesta_fingerprint=v_fp
    for update;

    if not found then
      select *
        into v_candidate
      from inventario.catalogo_candidatos() ca
      where ca.propuesta_fingerprint=v_fp;

      if not found then
        raise exception 'SOLOG_CATALOG_CHANGE_NOT_FOUND';
      end if;

      v_context:=jsonb_build_object(
        'sedes',v_candidate.sedes,
        'occurrence_count',v_candidate.occurrence_count,
        'first_seen_at',v_candidate.first_seen_at,
        'last_seen_at',v_candidate.last_seen_at,
        'origen','conexion'
      );
      v_datos:=v_candidate.datos||jsonb_build_object('_context',v_context);

      insert into inventario.cambios_catalogo(
        propuesta_fingerprint,
        ambito,
        c_interno,
        tipo,
        estado,
        datos,
        incidencia_origen_id,
        origen_propuesta,
        ignorado_por,
        ignorado_at,
        created_at,
        updated_at
      )
      values(
        v_fp,
        'producto',
        v_candidate.c_interno,
        v_candidate.tipo,
        'ignorado',
        v_datos-'_setup'-'_price_resolution',
        v_candidate.incidencia_origen_id,
        'automatico',
        p_uid,
        now(),
        now(),
        now()
      )
      returning * into v_change;
    else
      if v_change.estado not in ('pendiente','aprobado') then
        raise exception 'SOLOG_CATALOG_CHANGE_NOT_IGNORABLE';
      end if;
      if v_change.origen_propuesta<>'automatico' then
        raise exception 'SOLOG_CATALOG_CHANGE_NOT_AUTOMATIC';
      end if;

      update inventario.cambios_catalogo
         set estado='ignorado',
             aprobado_por=null,
             aprobado_at=null,
             ignorado_por=p_uid,
             ignorado_at=now(),
             datos=(datos-'_setup'-'_price_resolution'),
             updated_at=now()
       where id=v_change.id
      returning * into v_change;
    end if;

    select *
      into v_suppression
    from inventario.catalogo_supresiones_evidencia se
    where se.propuesta_fingerprint=v_fp
      and se.revocado_at is null
    for update;

    if not found or v_suppression.modo<>'ignorado' then
      raise exception 'SOLOG_CATALOG_EVIDENCE_SUPPRESSION_REQUIRED';
    end if;

    select
      count(*)::integer,
      coalesce(
        jsonb_agg(distinct jsonb_build_object('id',i.sede_id,'nombre',s.nombre)),
        '[]'::jsonb
      )
      into v_incidents,v_sites
    from inventario.incidencias i
    join public.sedes s on s.id=i.sede_id
    where i.estado='suprimida'
      and (
        inventario.solog_catalog_commercial_evidence_v1(
          i.c_interno,
          i.tipo,
          i.datos
        )->>'propuesta_fingerprint'
      )=v_fp;

    insert into inventario.auditoria(
      accion,entidad,entidad_id,actor_tipo,actor_id,datos
    )
    values(
      'ignore_catalog_change_v4',
      'cambio_catalogo',
      v_change.id::text,
      'usuario',
      p_uid::text,
      jsonb_build_object(
        'tipo',v_change.tipo,
        'c_interno',v_change.c_interno,
        'propuesta_fingerprint',v_fp,
        'incidencias_suprimidas',v_incidents,
        'sedes',v_sites
      )
    );

    return jsonb_build_object(
      'ok',true,
      'codigo','CATALOG_CHANGE_IGNORED',
      'cambio_id',v_change.id,
      'propuesta_fingerprint',v_fp,
      'estado','ignorado',
      'origen','automatico',
      'incidencias_suprimidas',v_incidents
    );
  end if;

  if v_action='reactivate' then
    select *
      into v_change
    from inventario.cambios_catalogo cc
    where cc.propuesta_fingerprint=v_fp
    for update;

    if not found then
      raise exception 'SOLOG_CATALOG_CHANGE_NOT_FOUND';
    end if;
    if v_change.estado<>'ignorado' then
      raise exception 'SOLOG_CATALOG_CHANGE_NOT_IGNORED';
    end if;
    if v_change.origen_propuesta<>'automatico' then
      raise exception 'SOLOG_CATALOG_CHANGE_NOT_AUTOMATIC';
    end if;

    select *
      into v_suppression
    from inventario.catalogo_supresiones_evidencia se
    where se.propuesta_fingerprint=v_fp
      and se.revocado_at is null
    for update;

    if not found or v_suppression.modo<>'ignorado' then
      raise exception 'SOLOG_CATALOG_EVIDENCE_SUPPRESSION_NOT_ACTIVE';
    end if;

    update inventario.catalogo_supresiones_evidencia
       set revocado_por=p_uid,
           revocado_at=now()
     where id=v_suppression.id;

    update inventario.cambios_catalogo
       set estado='pendiente',
           ignorado_por=null,
           ignorado_at=null,
           datos=(datos-'_setup'-'_price_resolution'),
           updated_at=now()
     where id=v_change.id
    returning * into v_change;

    select
      count(*)::integer,
      coalesce(
        jsonb_agg(distinct jsonb_build_object('id',i.sede_id,'nombre',s.nombre)),
        '[]'::jsonb
      )
      into v_incidents,v_sites
    from inventario.incidencias i
    join public.sedes s on s.id=i.sede_id
    where i.estado='pendiente'
      and (
        inventario.solog_catalog_commercial_evidence_v1(
          i.c_interno,
          i.tipo,
          i.datos
        )->>'propuesta_fingerprint'
      )=v_fp;

    insert into inventario.auditoria(
      accion,entidad,entidad_id,actor_tipo,actor_id,datos
    )
    values(
      'reactivate_catalog_change_v4',
      'cambio_catalogo',
      v_change.id::text,
      'usuario',
      p_uid::text,
      jsonb_build_object(
        'tipo',v_change.tipo,
        'c_interno',v_change.c_interno,
        'propuesta_fingerprint',v_fp,
        'incidencias_reactivadas',v_incidents,
        'sedes',v_sites
      )
    );

    return jsonb_build_object(
      'ok',true,
      'codigo','CATALOG_CHANGE_REACTIVATED',
      'cambio_id',v_change.id,
      'propuesta_fingerprint',v_fp,
      'estado','pendiente',
      'origen','automatico',
      'incidencias_reactivadas',v_incidents
    );
  end if;

  select *
    into v_change
  from inventario.cambios_catalogo cc
  where cc.propuesta_fingerprint=v_fp
  for update;

  if not found then
    raise exception 'SOLOG_CATALOG_CHANGE_NOT_FOUND';
  end if;
  if v_change.estado<>'aprobado' then
    raise exception 'SOLOG_CATALOG_CHANGE_NOT_APPROVED';
  end if;

  if v_action='withdraw' then
    update inventario.cambios_catalogo
       set estado='pendiente',
           aprobado_por=null,
           aprobado_at=null,
           datos=(datos-'_setup'-'_price_resolution'),
           updated_at=now()
     where id=v_change.id
    returning * into v_change;

    insert into inventario.auditoria(
      accion,entidad,entidad_id,actor_tipo,actor_id,datos
    )
    values(
      'withdraw_catalog_change_approval_v4',
      'cambio_catalogo',
      v_change.id::text,
      'usuario',
      p_uid::text,
      jsonb_build_object(
        'tipo',v_change.tipo,
        'c_interno',v_change.c_interno,
        'propuesta_fingerprint',v_fp,
        'origen',v_change.origen_propuesta
      )
    );

    return jsonb_build_object(
      'ok',true,
      'codigo','CATALOG_CHANGE_WITHDRAWN',
      'cambio_id',v_change.id,
      'propuesta_fingerprint',v_fp,
      'estado','pendiente',
      'origen',v_change.origen_propuesta
    );
  end if;

  if v_action='discard' then
    if v_change.origen_propuesta<>'administrativo' then
      raise exception 'SOLOG_CATALOG_AUTOMATIC_DISCARD_FORBIDDEN';
    end if;

    update inventario.cambios_catalogo
       set estado='descartado',
           descartado_por=p_uid,
           descartado_at=now(),
           datos=(datos-'_setup'-'_price_resolution'),
           updated_at=now()
     where id=v_change.id
    returning * into v_change;

    if v_change.origen_propuesta='automatico' then
      select
        count(*)::integer,
        coalesce(
          jsonb_agg(distinct jsonb_build_object('id',i.sede_id,'nombre',s.nombre)),
          '[]'::jsonb
        )
        into v_incidents,v_sites
      from inventario.incidencias i
      join public.sedes s on s.id=i.sede_id
      where i.estado='suprimida'
        and (
          inventario.solog_catalog_commercial_evidence_v1(
            i.c_interno,
            i.tipo,
            i.datos
          )->>'propuesta_fingerprint'
        )=v_fp;

      select *
        into v_suppression
      from inventario.catalogo_supresiones_evidencia se
      where se.propuesta_fingerprint=v_fp
        and se.revocado_at is null;

      if not found or v_suppression.modo<>'descartado' then
        raise exception 'SOLOG_CATALOG_EVIDENCE_SUPPRESSION_REQUIRED';
      end if;
    end if;

    insert into inventario.auditoria(
      accion,entidad,entidad_id,actor_tipo,actor_id,datos
    )
    values(
      'discard_catalog_change_v4',
      'cambio_catalogo',
      v_change.id::text,
      'usuario',
      p_uid::text,
      jsonb_build_object(
        'tipo',v_change.tipo,
        'c_interno',v_change.c_interno,
        'propuesta_fingerprint',v_fp,
        'origen',v_change.origen_propuesta,
        'incidencias_suprimidas',v_incidents,
        'sedes',v_sites
      )
    );

    return jsonb_build_object(
      'ok',true,
      'codigo','CATALOG_CHANGE_DISCARDED',
      'cambio_id',v_change.id,
      'propuesta_fingerprint',v_fp,
      'estado','descartado',
      'origen',v_change.origen_propuesta,
      'incidencias_suprimidas',v_incidents
    );
  end if;

  raise exception 'SOLOG_INVALID_CATALOG_CHANGE_ACTION';
end;
$function$;

CREATE OR REPLACE FUNCTION inventario.solog_admin_catalog_mutate_v4(p_uid uuid, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fp text;
  v_kind text;
  v_subaction text;
  v_operation uuid;
  v_change inventario.cambios_catalogo%rowtype;
  v_candidate record;
  v_product inventario.catalogo%rowtype;
  v_type text;
  v_admin_fp text;
  v_data jsonb;
  v_first jsonb;
  v_second jsonb;
  v_result jsonb;
  v_change_id uuid;
begin
  if p_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  if p_action='proposal_action' then
    v_fp:=nullif(btrim(p_payload->>'propuesta_fingerprint'),'');
    v_subaction:=lower(nullif(btrim(p_payload->>'action'),''));

    if v_fp is null or length(v_fp)<>64 then
      raise exception 'SOLOG_INVALID_CATALOG_CHANGE_ID';
    end if;

    if v_subaction in ('ignore','reactivate','withdraw','discard') then
      return inventario.solog_catalog_proposal_action_v4(p_uid,p_payload);
    end if;

    if v_subaction<>'approve' then
      raise exception 'SOLOG_INVALID_CATALOG_CHANGE_ACTION';
    end if;

    select *
      into v_change
    from inventario.cambios_catalogo cc
    where cc.propuesta_fingerprint=v_fp;

    if found then
      if v_change.estado<>'pendiente' then
        raise exception 'SOLOG_CATALOG_CHANGE_NOT_PENDING';
      end if;
      v_type:=v_change.tipo;
    else
      select *
        into v_candidate
      from inventario.catalogo_candidatos() ca
      where ca.propuesta_fingerprint=v_fp;

      if not found then
        raise exception 'SOLOG_CATALOG_CHANGE_NOT_FOUND';
      end if;
      v_type:=v_candidate.tipo;
    end if;

    if v_type in ('agregar_producto','reincorporar_producto','precio') then
      raise exception 'SOLOG_CATALOG_CHANGE_RESOLUTION_REQUIRED';
    end if;

    if v_type not in ('eliminar_producto','excluir_producto','nombre','codigo') then
      raise exception 'SOLOG_INVALID_CATALOG_CHANGE_ACTION';
    end if;

    v_result:=inventario.solog_admin_catalog_mutate_v3(
      p_uid,
      'proposal_action',
      jsonb_build_object(
        'propuesta_fingerprint',v_fp,
        'action','approve'
      )
    );

    insert into inventario.auditoria(
      accion,entidad,entidad_id,actor_tipo,actor_id,datos
    )
    values(
      'approve_catalog_change_v4',
      'cambio_catalogo',
      coalesce(v_result->>'cambio_id',v_fp),
      'usuario',
      p_uid::text,
      jsonb_build_object(
        'propuesta_fingerprint',v_fp,
        'tipo',v_type,
        'modo','simple'
      )
    );

    return v_result||jsonb_build_object('resolution_mode','simple');

  elsif p_action='resolve_product' then
    v_fp:=nullif(btrim(p_payload->>'propuesta_fingerprint'),'');
    v_kind:=lower(nullif(btrim(p_payload->>'mode'),''));

    if v_fp is null or length(v_fp)<>64 or v_kind not in ('existing_group','new_unit') then
      raise exception 'SOLOG_INVALID_PRODUCT_CONFIGURATION';
    end if;

    select *
      into v_change
    from inventario.cambios_catalogo cc
    where cc.propuesta_fingerprint=v_fp;

    if found then
      if v_change.estado<>'pendiente' then
        raise exception 'SOLOG_CATALOG_CHANGE_NOT_PENDING';
      end if;
      if v_change.tipo not in ('agregar_producto','reincorporar_producto') then
        raise exception 'SOLOG_INVALID_PRODUCT_CONFIGURATION';
      end if;
      v_type:=v_change.tipo;
    else
      select *
        into v_candidate
      from inventario.catalogo_candidatos() ca
      where ca.propuesta_fingerprint=v_fp
        and ca.tipo in ('agregar_producto','reincorporar_producto');

      if not found then
        raise exception 'SOLOG_CATALOG_CHANGE_NOT_FOUND';
      end if;
      v_type:=v_candidate.tipo;
    end if;

    v_first:=inventario.solog_admin_catalog_mutate_v3(
      p_uid,
      'proposal_action',
      jsonb_build_object(
        'propuesta_fingerprint',v_fp,
        'action','approve'
      )
    );

    v_second:=inventario.solog_admin_catalog_mutate_v3(
      p_uid,
      'prepare_product',
      p_payload-'operation_id'
    );

    if coalesce(v_second->>'block_reason','')<>'' then
      raise exception 'SOLOG_CATALOG_CHANGE_RESOLUTION_INCOMPLETE';
    end if;

    v_change_id:=(v_second->>'cambio_id')::uuid;

    insert into inventario.auditoria(
      accion,entidad,entidad_id,actor_tipo,actor_id,datos
    )
    values(
      'resolve_and_approve_catalog_product_v4',
      'cambio_catalogo',
      v_change_id::text,
      'usuario',
      p_uid::text,
      jsonb_build_object(
        'propuesta_fingerprint',v_fp,
        'tipo',v_type,
        'setup',v_second->'setup'
      )
    );

    return jsonb_build_object(
      'ok',true,
      'codigo','CATALOG_PRODUCT_RESOLVED_AND_APPROVED',
      'cambio_id',v_change_id,
      'propuesta_fingerprint',v_fp,
      'estado','aprobado',
      'tipo',v_type,
      'setup',v_second->'setup',
      'block_reason',v_second->'block_reason'
    );

  elsif p_action='resolve_price' then
    return inventario.solog_catalog_price_mutate_v4(p_uid,'resolve',p_payload);

  elsif p_action='prepare_price' then
    return inventario.solog_catalog_price_mutate_v4(p_uid,'prepare',p_payload);

  elsif p_action='prepare_product' then
    return inventario.solog_admin_catalog_mutate_v3(p_uid,'prepare_product',p_payload-'operation_id');

  elsif p_action='propose_product_state' then
    begin
      v_operation:=(p_payload->>'operation_id')::uuid;
      v_change.c_interno:=(p_payload->>'c_interno')::integer;
    exception when others then
      raise exception 'SOLOG_INVALID_OPERATION';
    end;

    if v_operation is null or v_change.c_interno is null then
      raise exception 'SOLOG_INVALID_OPERATION';
    end if;

    v_subaction:=lower(nullif(btrim(p_payload->>'action'),''));
    if v_subaction not in ('exclude','reincorporate') then
      raise exception 'SOLOG_INVALID_CATALOG_CHANGE_ACTION';
    end if;

    select *
      into v_product
    from inventario.catalogo c
    where c.c_interno=v_change.c_interno
    for update;

    if not found then raise exception 'SOLOG_PRODUCT_NOT_FOUND'; end if;
    if v_subaction='exclude' and v_product.estado='Excluido' then
      raise exception 'SOLOG_CATALOG_CHANGE_NOOP';
    end if;
    if v_subaction='reincorporate' and v_product.estado<>'Excluido' then
      raise exception 'SOLOG_CATALOG_CHANGE_NOOP';
    end if;

    v_type:=case
      when v_subaction='exclude' then 'excluir_producto'
      else 'reincorporar_producto'
    end;

    if exists(
      select 1
      from inventario.cambios_catalogo cc
      where cc.c_interno=v_product.c_interno
        and cc.tipo in ('eliminar_producto','excluir_producto','reincorporar_producto')
        and cc.estado in ('pendiente','aprobado')
    ) then
      raise exception 'SOLOG_CATALOG_CHANGE_CONFLICT';
    end if;

    v_admin_fp:=inventario.solog_catalog_admin_proposal_fingerprint_v4(
      v_operation,
      v_product.c_interno,
      v_type
    );

    v_data:=jsonb_build_object(
      'producto',v_product.producto,
      'precio',v_product.precio,
      'anterior_estado',case when v_product.estado='Excluido' then 'excluido' else 'incluido' end,
      'nuevo_estado',case when v_subaction='exclude' then 'excluido' else 'incluido' end,
      'origen','productos'
    );

    if v_subaction='exclude' then
      insert into inventario.cambios_catalogo(
        propuesta_fingerprint,
        ambito,
        c_interno,
        tipo,
        estado,
        datos,
        origen_propuesta,
        aprobado_por,
        aprobado_at,
        created_at,
        updated_at
      )
      values(
        v_admin_fp,
        'producto',
        v_product.c_interno,
        v_type,
        'aprobado',
        v_data,
        'administrativo',
        p_uid,
        now(),
        now(),
        now()
      )
      returning id into v_change_id;

      insert into inventario.auditoria(
        accion,entidad,entidad_id,actor_tipo,actor_id,datos
      )
      values(
        'approve_catalog_product_state_v4',
        'cambio_catalogo',
        v_change_id::text,
        'usuario',
        p_uid::text,
        jsonb_build_object(
          'c_interno',v_product.c_interno,
          'tipo',v_type,
          'propuesta_fingerprint',v_admin_fp,
          'operation_id',v_operation
        )
      );

      return jsonb_build_object(
        'ok',true,
        'codigo','CATALOG_CHANGE_APPROVED',
        'cambio_id',v_change_id,
        'propuesta_fingerprint',v_admin_fp,
        'estado','aprobado',
        'tipo',v_type,
        'producto',v_product.producto,
        'precio',v_product.precio,
        'origen','administrativo'
      );
    end if;

    insert into inventario.cambios_catalogo(
      propuesta_fingerprint,
      ambito,
      c_interno,
      tipo,
      estado,
      datos,
      origen_propuesta,
      created_at,
      updated_at
    )
    values(
      v_admin_fp,
      'producto',
      v_product.c_interno,
      v_type,
      'pendiente',
      v_data,
      'administrativo',
      now(),
      now()
    )
    returning id into v_change_id;

    v_first:=inventario.solog_admin_catalog_mutate_v3(
      p_uid,
      'proposal_action',
      jsonb_build_object(
        'propuesta_fingerprint',v_admin_fp,
        'action','approve'
      )
    );

    v_second:=inventario.solog_admin_catalog_mutate_v3(
      p_uid,
      'prepare_product',
      (p_payload-'operation_id'-'c_interno'-'action')
      ||jsonb_build_object('propuesta_fingerprint',v_admin_fp)
    );

    if coalesce(v_second->>'block_reason','')<>'' then
      raise exception 'SOLOG_CATALOG_CHANGE_RESOLUTION_INCOMPLETE';
    end if;

    insert into inventario.auditoria(
      accion,entidad,entidad_id,actor_tipo,actor_id,datos
    )
    values(
      'resolve_and_approve_catalog_reincorporation_v4',
      'cambio_catalogo',
      v_change_id::text,
      'usuario',
      p_uid::text,
      jsonb_build_object(
        'c_interno',v_product.c_interno,
        'propuesta_fingerprint',v_admin_fp,
        'operation_id',v_operation,
        'setup',v_second->'setup'
      )
    );

    return jsonb_build_object(
      'ok',true,
      'codigo','CATALOG_PRODUCT_RESOLVED_AND_APPROVED',
      'cambio_id',v_change_id,
      'propuesta_fingerprint',v_admin_fp,
      'estado','aprobado',
      'tipo',v_type,
      'producto',v_product.producto,
      'precio',v_product.precio,
      'origen','administrativo',
      'setup',v_second->'setup',
      'block_reason',v_second->'block_reason'
    );

  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION inventario.solog_admin_catalog_read_v4(p_uid uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_state text;
  v_rows jsonb;
  v_counts jsonb;
  v_total integer;
  v_base jsonb;
begin
  if p_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  if p_action='reference' then
    return jsonb_build_object(
      'contract_version',4,
      'generated_at',now(),
      'categories',(
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id',c.id,
              'nombre',c.nombre,
              'orden',c.orden
            )
            order by c.orden,c.nombre
          ),
          '[]'::jsonb
        )
        from inventario.categorias c
        where c.activo
      ),
      'groups',(
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id',g.id,
              'nombre',g.nombre,
              'categoria_id',g.categoria_id,
              'categoria',c.nombre,
              'precio',g.precio,
              'unidades_por_paquete',g.unidades_por_paquete,
              'precio_paquete',g.precio_paquete
            )
            order by c.orden,g.nombre,g.id
          ),
          '[]'::jsonb
        )
        from inventario.grupos_conteo g
        join inventario.categorias c on c.id=g.categoria_id
        where g.activo and c.activo
      ),
      'revisions',jsonb_build_object(
        'groups',inventario.solog_revision_get('groups',null),
        'catalog',inventario.solog_revision_get('catalog',null)
      )
    );

  elsif p_action='proposals' then
    v_state:=lower(coalesce(nullif(btrim(p_payload->>'estado'),''),'pendiente'));
    if v_state not in ('pendiente','aprobado','ignorado','incorporado') then
      raise exception 'SOLOG_INVALID_CATALOG_CHANGE_STATE';
    end if;

    with auto_new as (
      select
        ca.propuesta_fingerprint,
        null::uuid cambio_id,
        ca.c_interno,
        ca.tipo,
        'pendiente'::text estado,
        'automatico'::text origen,
        ca.datos,
        ca.incidencia_origen_id,
        ca.sedes,
        ca.occurrence_count,
        ca.first_seen_at,
        ca.last_seen_at,
        null::timestamptz aprobado_at,
        null::timestamptz ignorado_at,
        null::integer version_aplicada,
        null::timestamptz incorporado_at,
        false stale,
        null::text block_reason
      from inventario.catalogo_candidatos() ca
      where not exists(
        select 1
        from inventario.cambios_catalogo cc
        where cc.propuesta_fingerprint=ca.propuesta_fingerprint
      )
    ), persisted as (
      select
        cc.propuesta_fingerprint,
        cc.id cambio_id,
        cc.c_interno,
        cc.tipo,
        cc.estado,
        cc.origen_propuesta origen,
        cc.datos,
        cc.incidencia_origen_id,
        coalesce(cc.datos#>'{_context,sedes}','[]'::jsonb) sedes,
        coalesce(
          nullif(cc.datos#>>'{_context,occurrence_count}','')::bigint,
          case when cc.incidencia_origen_id is null then 0 else 1 end
        ) occurrence_count,
        coalesce(
          nullif(cc.datos#>>'{_context,first_seen_at}','')::timestamptz,
          cc.created_at
        ) first_seen_at,
        coalesce(
          nullif(cc.datos#>>'{_context,last_seen_at}','')::timestamptz,
          cc.updated_at
        ) last_seen_at,
        cc.aprobado_at,
        cc.ignorado_at,
        cc.version_aplicada,
        cc.incorporado_at,
        case
          when cc.estado='aprobado'
            then inventario.solog_catalog_change_stale_v3(cc.id)
          else false
        end stale,
        case
          when cc.estado='aprobado'
            then inventario.solog_catalog_change_block_reason_v3(cc.id)
          else null
        end block_reason
      from inventario.cambios_catalogo cc
      where cc.ambito='producto'
        and cc.tipo in (
          'agregar_producto',
          'eliminar_producto',
          'excluir_producto',
          'reincorporar_producto',
          'nombre',
          'precio',
          'codigo'
        )
        and cc.estado<>'descartado'
    ), all_rows as (
      select * from auto_new
      union all
      select * from persisted
    ), filtered as (
      select
        a.*,
        c.producto producto_actual,
        c.c_barras c_barras_actual,
        c.precio precio_actual,
        c.marca marca_actual,
        c.estado modo_actual,
        cat.nombre categoria_actual,
        g.nombre grupo_actual,
        coalesce(a.datos->>'producto',c.producto) producto_display
      from all_rows a
      left join inventario.catalogo c on c.c_interno=a.c_interno
      left join inventario.categorias cat on cat.id=c.categoria_id
      left join inventario.grupos_conteo g on g.id=c.grupo_conteo_id
      where a.estado=v_state
        and (v_state<>'ignorado' or a.origen='automatico')
    )
    select
      count(*)::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'propuesta_fingerprint',f.propuesta_fingerprint,
            'cambio_id',f.cambio_id,
            'c_interno',f.c_interno,
            'tipo',f.tipo,
            'estado',f.estado,
            'origen',f.origen,
            'seccion',case
              when f.tipo in ('agregar_producto','precio','reincorporar_producto')
                then 'urgente'
              else 'emergente'
            end,
            'datos',f.datos,
            'producto',f.producto_display,
            'sedes',f.sedes,
            'occurrence_count',f.occurrence_count,
            'first_seen_at',f.first_seen_at,
            'last_seen_at',f.last_seen_at,
            'catalogo_actual',jsonb_build_object(
              'producto',f.producto_actual,
              'c_barras',f.c_barras_actual,
              'precio',f.precio_actual,
              'marca',f.marca_actual,
              'estado',f.modo_actual,
              'categoria',f.categoria_actual,
              'grupo',f.grupo_actual
            ),
            'stale',f.stale,
            'publicable',case
              when f.estado='aprobado' then f.block_reason is null
              else null
            end,
            'block_reason',f.block_reason,
            'setup',f.datos->'_setup',
            'price_resolution',f.datos->'_price_resolution',
            'aprobado_at',f.aprobado_at,
            'ignorado_at',f.ignorado_at,
            'version_aplicada',f.version_aplicada,
            'incorporado_at',f.incorporado_at
          )
          order by
            case when f.tipo in ('agregar_producto','precio','reincorporar_producto') then 0 else 1 end,
            f.last_seen_at desc,
            f.propuesta_fingerprint
        ),
        '[]'::jsonb
      )
      into v_total,v_rows
    from filtered f;

    if v_total>10000 then
      raise exception 'SOLOG_CATALOG_RESULT_TOO_LARGE';
    end if;

    with auto_new as (
      select ca.propuesta_fingerprint,'pendiente'::text estado,'automatico'::text origen
      from inventario.catalogo_candidatos() ca
      where not exists(
        select 1
        from inventario.cambios_catalogo cc
        where cc.propuesta_fingerprint=ca.propuesta_fingerprint
      )
    ), persisted as (
      select cc.propuesta_fingerprint,cc.estado,cc.origen_propuesta origen
      from inventario.cambios_catalogo cc
      where cc.ambito='producto'
        and cc.tipo in (
          'agregar_producto',
          'eliminar_producto',
          'excluir_producto',
          'reincorporar_producto',
          'nombre',
          'precio',
          'codigo'
        )
        and cc.estado<>'descartado'
    ), all_rows as (
      select * from auto_new
      union all
      select * from persisted
    )
    select jsonb_build_object(
      'pendiente',count(*) filter(where estado='pendiente'),
      'aprobado',count(*) filter(where estado='aprobado'),
      'ignorado',count(*) filter(where estado='ignorado' and origen='automatico'),
      'incorporado',count(*) filter(where estado='incorporado')
    )
    into v_counts
    from all_rows;

    return jsonb_build_object(
      'contract_version',4,
      'generated_at',now(),
      'estado',v_state,
      'rows',v_rows,
      'total',v_total,
      'complete',true,
      'counts',v_counts,
      'revisions',jsonb_build_object(
        'groups',inventario.solog_revision_get('groups',null),
        'catalog',inventario.solog_revision_get('catalog',null)
      )
    );

  elsif p_action='price_options' then
    return inventario.solog_catalog_price_options_v4(p_uid,p_payload);

  elsif p_action in ('status','products','publication_preview') then
    v_base:=inventario.solog_admin_catalog_read_v3(p_uid,p_action,p_payload);
    return v_base||jsonb_build_object('contract_version',4);

  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$;
