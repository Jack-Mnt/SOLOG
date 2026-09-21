-- Fase 2 — Modelo backend e identidad para Catálogo V4.

alter table inventario.cambios_catalogo
  add column if not exists origen_propuesta text,
  add column if not exists descartado_por uuid,
  add column if not exists descartado_at timestamptz;

alter table inventario.cambios_catalogo
  drop constraint if exists cambios_catalogo_estado_check;

alter table inventario.cambios_catalogo
  add constraint cambios_catalogo_estado_check
  check (
    estado = any (
      array[
        'pendiente'::text,
        'aprobado'::text,
        'ignorado'::text,
        'descartado'::text,
        'incorporado'::text,
        'aplicado'::text
      ]
    )
  );

alter table inventario.cambios_catalogo
  add constraint cambios_catalogo_origen_propuesta_check
  check (
    origen_propuesta is null
    or origen_propuesta = any (array['automatico'::text,'administrativo'::text])
  );

alter table inventario.cambios_catalogo
  add constraint cambios_catalogo_descartado_por_fkey
  foreign key (descartado_por) references public.usuarios(id);

alter table inventario.cambios_catalogo
  add constraint cambios_catalogo_descartado_check
  check (
    estado <> 'descartado'
    or (descartado_por is not null and descartado_at is not null)
  );

create or replace function inventario.solog_catalog_change_origin_guard_v4()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_incident_type text;
begin
  if new.ambito <> 'producto'
     or new.tipo not in (
       'agregar_producto',
       'eliminar_producto',
       'excluir_producto',
       'reincorporar_producto',
       'nombre',
       'precio',
       'codigo'
     ) then
    return new;
  end if;

  if new.origen_propuesta is not null then
    return new;
  end if;

  if new.datos->'_context'->>'origen' = 'conexion' then
    new.origen_propuesta := 'automatico';
    return new;
  end if;

  if new.datos->>'origen' in (
    'productos',
    'producto_ausente_manual',
    'producto_ausente_propuesto',
    'producto_ausente_confirmado'
  ) then
    new.origen_propuesta := 'administrativo';
    return new;
  end if;

  if new.incidencia_origen_id is not null then
    select i.tipo
      into v_incident_type
    from inventario.incidencias i
    where i.id = new.incidencia_origen_id;

    if v_incident_type in (
      'producto_nuevo',
      'nombre_modificado',
      'precio_modificado',
      'codigo_barras_modificado',
      'codigo_barras_agregado',
      'codigo_barras_eliminado'
    ) then
      new.origen_propuesta := 'automatico';
      return new;
    end if;

    if v_incident_type = 'producto_ausente' then
      new.origen_propuesta := 'administrativo';
      return new;
    end if;
  end if;

  if new.tipo in ('excluir_producto','reincorporar_producto','eliminar_producto') then
    new.origen_propuesta := 'administrativo';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_solog_catalog_change_origin_guard_v4
  on inventario.cambios_catalogo;

create trigger trg_solog_catalog_change_origin_guard_v4
before insert or update of datos, incidencia_origen_id, tipo, ambito, origen_propuesta
on inventario.cambios_catalogo
for each row
execute function inventario.solog_catalog_change_origin_guard_v4();

update inventario.cambios_catalogo cc
set origen_propuesta = case
  when cc.datos->'_context'->>'origen' = 'conexion' then 'automatico'
  when cc.datos->>'origen' in (
    'productos',
    'producto_ausente_manual',
    'producto_ausente_propuesto',
    'producto_ausente_confirmado'
  ) then 'administrativo'
  when exists (
    select 1
    from inventario.incidencias i
    where i.id = cc.incidencia_origen_id
      and i.tipo in (
        'producto_nuevo',
        'nombre_modificado',
        'precio_modificado',
        'codigo_barras_modificado',
        'codigo_barras_agregado',
        'codigo_barras_eliminado'
      )
  ) then 'automatico'
  when exists (
    select 1
    from inventario.incidencias i
    where i.id = cc.incidencia_origen_id
      and i.tipo = 'producto_ausente'
  ) then 'administrativo'
  when cc.tipo in ('excluir_producto','reincorporar_producto','eliminar_producto') then 'administrativo'
  else cc.origen_propuesta
end
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
  and cc.origen_propuesta is null;

do $$
begin
  if exists (
    select 1
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
      and cc.origen_propuesta is null
  ) then
    raise exception 'SOLOG_CATALOG_V4_ORIGIN_BACKFILL_INCOMPLETE';
  end if;
end;
$$;

alter table inventario.cambios_catalogo
  add constraint cambios_catalogo_origen_requerido_v4_check
  check (
    ambito <> 'producto'
    or tipo not in (
      'agregar_producto',
      'eliminar_producto',
      'excluir_producto',
      'reincorporar_producto',
      'nombre',
      'precio',
      'codigo'
    )
    or origen_propuesta in ('automatico','administrativo')
  );

create table if not exists inventario.catalogo_supresiones_evidencia (
  id uuid primary key default gen_random_uuid(),
  propuesta_fingerprint text not null,
  cambio_id uuid not null references inventario.cambios_catalogo(id) on delete restrict,
  modo text not null check (modo in ('ignorado','descartado')),
  creado_por uuid not null references public.usuarios(id),
  creado_at timestamptz not null default now(),
  revocado_por uuid null references public.usuarios(id),
  revocado_at timestamptz null,
  constraint catalogo_supresiones_evidencia_fingerprint_check
    check (length(propuesta_fingerprint)=64),
  constraint catalogo_supresiones_evidencia_revocacion_check
    check (
      (revocado_por is null and revocado_at is null)
      or
      (revocado_por is not null and revocado_at is not null)
    ),
  constraint catalogo_supresiones_evidencia_descartado_terminal_check
    check (
      modo <> 'descartado'
      or (revocado_por is null and revocado_at is null)
    )
);

create unique index if not exists catalogo_supresiones_evidencia_activa_uq
  on inventario.catalogo_supresiones_evidencia(propuesta_fingerprint)
  where revocado_at is null;

create index if not exists idx_catalogo_supresiones_evidencia_cambio
  on inventario.catalogo_supresiones_evidencia(cambio_id, creado_at desc);

create or replace function inventario.solog_catalog_admin_proposal_fingerprint_v4(
  p_operation_id uuid,
  p_c_interno integer,
  p_tipo text
)
returns text
language sql
immutable
set search_path to ''
as $function$
  select encode(
    extensions.digest(
      concat_ws(
        '|',
        'catalog-admin',
        p_operation_id::text,
        p_c_interno::text,
        p_tipo
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

with migrated as (
  update inventario.cambios_catalogo cc
     set estado='descartado',
         descartado_por=cc.ignorado_por,
         descartado_at=cc.ignorado_at,
         datos=(cc.datos-'_setup'-'_price_resolution'),
         updated_at=now()
   where cc.estado='ignorado'
     and cc.origen_propuesta='administrativo'
     and cc.ignorado_por is not null
     and cc.ignorado_at is not null
  returning cc.id,cc.c_interno,cc.tipo,cc.descartado_por,cc.descartado_at
)
insert into inventario.auditoria(
  accion,entidad,entidad_id,actor_tipo,actor_id,datos
)
select
  'migrate_catalog_ignored_to_discarded_v4',
  'cambio_catalogo',
  m.id::text,
  'sistema',
  m.descartado_por::text,
  jsonb_build_object(
    'c_interno',m.c_interno,
    'tipo',m.tipo,
    'descartado_at',m.descartado_at,
    'motivo','legacy_administrativo_no_recuperable'
  )
from migrated m;

revoke all on table inventario.catalogo_supresiones_evidencia from anon, authenticated;
revoke execute on function inventario.solog_catalog_admin_proposal_fingerprint_v4(uuid,integer,text) from public, anon, authenticated;
revoke execute on function inventario.solog_catalog_change_origin_guard_v4() from public, anon, authenticated;
