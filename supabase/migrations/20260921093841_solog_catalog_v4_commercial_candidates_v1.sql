-- Fase 3 — Motor de candidatos comerciales y supresión exacta.

create or replace function inventario.solog_catalog_commercial_evidence_v1(
  p_c_interno integer,
  p_incident_type text,
  p_datos jsonb
)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_type text;
  v_identity jsonb;
  v_payload jsonb;
  v_fp text;
  v_data jsonb:=coalesce(p_datos,'{}'::jsonb);
begin
  if p_c_interno is null then
    return null;
  end if;

  if p_incident_type='producto_nuevo' then
    v_type:='agregar_producto';
    v_identity:=jsonb_strip_nulls(
      jsonb_build_object(
        'producto',v_data->>'producto',
        'c_barras',v_data->'c_barras',
        'precio',v_data->'precio',
        'origen_tipo',p_incident_type
      )
    );
    v_payload:=jsonb_strip_nulls(
      jsonb_build_object(
        'producto',v_data->>'producto',
        'c_barras',v_data->'c_barras',
        'precio',v_data->'precio',
        'stock_detectado',v_data->'stock',
        'origen_tipo',p_incident_type
      )
    );
  elsif p_incident_type='nombre_modificado' then
    v_type:='nombre';
    v_identity:=jsonb_build_object(
      'anterior',v_data->'anterior',
      'nuevo',v_data->'nuevo',
      'origen_tipo',p_incident_type
    );
    v_payload:=v_identity;
  elsif p_incident_type='precio_modificado' then
    v_type:='precio';
    v_identity:=jsonb_build_object(
      'anterior',v_data->'anterior',
      'nuevo',v_data->'nuevo',
      'origen_tipo',p_incident_type
    );
    v_payload:=v_identity;
  elsif p_incident_type in (
    'codigo_barras_agregado',
    'codigo_barras_eliminado',
    'codigo_barras_modificado'
  ) then
    v_type:='codigo';
    v_identity:=jsonb_build_object(
      'anterior',v_data->'anterior',
      'nuevo',v_data->'nuevo',
      'origen_tipo',p_incident_type
    );
    v_payload:=v_identity;
  else
    return null;
  end if;

  v_fp:=inventario.solog_catalog_candidate_fingerprint(
    p_c_interno,
    v_type,
    v_identity
  );

  return jsonb_build_object(
    'tipo_catalogo',v_type,
    'datos_identidad',v_identity,
    'datos_payload',v_payload,
    'propuesta_fingerprint',v_fp
  );
end;
$function$;

create or replace function inventario.catalogo_candidatos()
returns table(
  propuesta_fingerprint text,
  c_interno integer,
  tipo text,
  datos jsonb,
  incidencia_origen_id uuid,
  sedes jsonb,
  occurrence_count bigint,
  first_seen_at timestamptz,
  last_seen_at timestamptz
)
language sql
security definer
set search_path to ''
as $function$
with base as (
  select
    i.id,
    i.sede_id,
    s.nombre sede,
    i.c_interno,
    i.occurrence_count,
    i.first_seen_at,
    i.last_seen_at,
    e.evidence->>'tipo_catalogo' tipo_catalogo,
    e.evidence->'datos_payload' datos_payload,
    e.evidence->>'propuesta_fingerprint' fp
  from inventario.incidencias i
  join public.sedes s on s.id=i.sede_id
  cross join lateral (
    select inventario.solog_catalog_commercial_evidence_v1(
      i.c_interno,
      i.tipo,
      i.datos
    ) evidence
  ) e
  where i.c_interno is not null
    and i.tipo in (
      'producto_nuevo',
      'nombre_modificado',
      'precio_modificado',
      'codigo_barras_agregado',
      'codigo_barras_eliminado',
      'codigo_barras_modificado'
    )
    and i.estado in ('pendiente','suprimida')
    and e.evidence is not null
    and not exists (
      select 1
      from inventario.catalogo_supresiones_evidencia se
      where se.propuesta_fingerprint=e.evidence->>'propuesta_fingerprint'
        and se.revocado_at is null
    )
), agg as (
  select
    b.fp,
    b.c_interno,
    b.tipo_catalogo,
    (array_agg(b.datos_payload order by b.last_seen_at desc,b.id))[1] datos_payload,
    (array_agg(b.id order by b.last_seen_at desc,b.id))[1] incidencia_origen_id,
    jsonb_agg(distinct jsonb_build_object('id',b.sede_id,'nombre',b.sede)) sedes,
    sum(b.occurrence_count)::bigint occurrences,
    min(b.first_seen_at) first_seen,
    max(b.last_seen_at) last_seen
  from base b
  group by b.fp,b.c_interno,b.tipo_catalogo
)
select
  a.fp,
  a.c_interno,
  a.tipo_catalogo,
  a.datos_payload,
  a.incidencia_origen_id,
  a.sedes,
  a.occurrences,
  a.first_seen,
  a.last_seen
from agg a;
$function$;

create or replace function inventario.solog_guardar_incidencia_normalizada()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_canon jsonb;
  v_anterior text;
  v_nuevo text;
  v_commercial jsonb;
  v_catalog_fp text;
begin
  v_canon:=inventario.solog_incidencia_datos_canonicos(new.tipo,new.datos);

  if tg_op='INSERT' then
    if new.tipo='precio_modificado' then
      begin
        if (new.datos->>'anterior')::numeric=(new.datos->>'nuevo')::numeric then
          return null;
        end if;
      exception when others then
        null;
      end;
    elsif new.tipo='codigo_barras_modificado' then
      v_anterior:=v_canon->>'anterior';
      v_nuevo:=v_canon->>'nuevo';
      if v_anterior is not null and v_nuevo is not null and v_anterior=v_nuevo then
        return null;
      end if;
    elsif new.tipo='nombre_modificado' then
      v_anterior:=v_canon->>'anterior';
      v_nuevo:=v_canon->>'nuevo';
      if v_anterior is not null and v_nuevo is not null and v_anterior=v_nuevo then
        return null;
      end if;
    end if;
  end if;

  new.fingerprint:=encode(
    extensions.digest(
      concat_ws(
        '|',
        new.sede_id::text,
        coalesce(new.c_interno::text,''),
        coalesce(new.c_interno_original,''),
        new.tipo,
        coalesce(v_canon::text,'{}')
      ),
      'sha256'
    ),
    'hex'
  );

  new.family_key:=encode(
    extensions.digest(
      concat_ws(
        '|',
        new.tipo,
        coalesce(
          new.c_interno::text,
          nullif(btrim(new.c_interno_original),''),
          coalesce(v_canon::text,'{}')
        )
      ),
      'sha256'
    ),
    'hex'
  );

  v_commercial:=inventario.solog_catalog_commercial_evidence_v1(
    new.c_interno,
    new.tipo,
    new.datos
  );
  v_catalog_fp:=v_commercial->>'propuesta_fingerprint';

  if new.estado in ('pendiente','suprimida')
     and v_catalog_fp is not null
     and exists (
       select 1
       from inventario.catalogo_supresiones_evidencia se
       where se.propuesta_fingerprint=v_catalog_fp
         and se.revocado_at is null
     ) then
    new.estado:='suprimida';
  elsif new.estado in ('pendiente','suprimida')
     and exists(
       select 1
       from inventario.exclusiones_incidencias e
       where e.family_key=new.family_key
         and e.revocada_at is null
         and now()>=e.desde_at
         and now()<e.hasta_at
         and (e.sede_id is null or e.sede_id=new.sede_id)
     ) then
    new.estado:='suprimida';
  end if;

  return new;
end;
$function$;

create or replace function inventario.solog_catalog_suppression_incident_sync_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op='INSERT' and new.revocado_at is null then
    update inventario.incidencias i
       set estado='suprimida',
           updated_at=now()
     where i.c_interno is not null
       and i.tipo in (
         'producto_nuevo',
         'nombre_modificado',
         'precio_modificado',
         'codigo_barras_agregado',
         'codigo_barras_eliminado',
         'codigo_barras_modificado'
       )
       and i.estado in ('pendiente','suprimida')
       and (
         inventario.solog_catalog_commercial_evidence_v1(
           i.c_interno,
           i.tipo,
           i.datos
         )->>'propuesta_fingerprint'
       )=new.propuesta_fingerprint;

    return new;
  end if;

  if tg_op='UPDATE'
     and old.revocado_at is null
     and new.revocado_at is not null then
    update inventario.incidencias i
       set estado='pendiente',
           updated_at=now()
     where i.c_interno is not null
       and i.tipo in (
         'producto_nuevo',
         'nombre_modificado',
         'precio_modificado',
         'codigo_barras_agregado',
         'codigo_barras_eliminado',
         'codigo_barras_modificado'
       )
       and i.estado='suprimida'
       and (
         inventario.solog_catalog_commercial_evidence_v1(
           i.c_interno,
           i.tipo,
           i.datos
         )->>'propuesta_fingerprint'
       )=new.propuesta_fingerprint
       and not exists (
         select 1
         from inventario.catalogo_supresiones_evidencia se
         where se.propuesta_fingerprint=new.propuesta_fingerprint
           and se.revocado_at is null
       );

    return new;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_solog_catalog_suppression_incident_sync_v1
  on inventario.catalogo_supresiones_evidencia;

create trigger trg_solog_catalog_suppression_incident_sync_v1
after insert or update of revocado_at
on inventario.catalogo_supresiones_evidencia
for each row
execute function inventario.solog_catalog_suppression_incident_sync_v1();

create or replace function inventario.solog_catalog_change_suppression_compat_v4()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid;
  v_mode text;
begin
  if new.origen_propuesta<>'automatico' then
    return new;
  end if;

  if new.estado='ignorado'
     and (tg_op='INSERT' or old.estado is distinct from new.estado) then
    v_actor:=new.ignorado_por;
    v_mode:='ignorado';
  elsif new.estado='descartado'
     and (tg_op='INSERT' or old.estado is distinct from new.estado) then
    v_actor:=new.descartado_por;
    v_mode:='descartado';
  else
    return new;
  end if;

  if v_actor is null then
    raise exception 'SOLOG_CATALOG_SUPPRESSION_ACTOR_REQUIRED';
  end if;

  insert into inventario.catalogo_supresiones_evidencia(
    propuesta_fingerprint,
    cambio_id,
    modo,
    creado_por,
    creado_at
  )
  values(
    new.propuesta_fingerprint,
    new.id,
    v_mode,
    v_actor,
    coalesce(
      case when v_mode='ignorado' then new.ignorado_at else new.descartado_at end,
      now()
    )
  )
  on conflict (propuesta_fingerprint)
    where revocado_at is null
  do nothing;

  return new;
end;
$function$;

drop trigger if exists trg_solog_catalog_change_suppression_compat_v4
  on inventario.cambios_catalogo;

create trigger trg_solog_catalog_change_suppression_compat_v4
after insert or update of estado
on inventario.cambios_catalogo
for each row
execute function inventario.solog_catalog_change_suppression_compat_v4();

insert into inventario.catalogo_supresiones_evidencia(
  propuesta_fingerprint,
  cambio_id,
  modo,
  creado_por,
  creado_at
)
select
  cc.propuesta_fingerprint,
  cc.id,
  'ignorado',
  cc.ignorado_por,
  coalesce(cc.ignorado_at,cc.updated_at,now())
from inventario.cambios_catalogo cc
where cc.estado='ignorado'
  and cc.origen_propuesta='automatico'
  and cc.ignorado_por is not null
on conflict (propuesta_fingerprint)
  where revocado_at is null
do nothing;

revoke execute on function inventario.solog_catalog_commercial_evidence_v1(integer,text,jsonb) from public, anon, authenticated;
revoke execute on function inventario.solog_catalog_suppression_incident_sync_v1() from public, anon, authenticated;
revoke execute on function inventario.solog_catalog_change_suppression_compat_v4() from public, anon, authenticated;
