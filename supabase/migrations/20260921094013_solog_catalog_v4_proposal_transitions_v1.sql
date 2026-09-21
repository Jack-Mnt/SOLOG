-- Fase 4 — Motor de transiciones de propuestas para Catálogo V4.
-- Superficie interna; la RPC pública V4 se incorpora en Fase 6.

create or replace function inventario.solog_catalog_proposal_action_v4(
  p_uid uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
      if v_change.estado<>'pendiente' then
        raise exception 'SOLOG_CATALOG_CHANGE_NOT_PENDING';
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

revoke execute on function inventario.solog_catalog_proposal_action_v4(uuid,jsonb)
from public, anon, authenticated;
