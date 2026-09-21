-- Fase 6 — Lecturas y transporte público Catálogo V4.

create or replace function inventario.solog_admin_catalog_read_v4(
  p_uid uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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

  elsif p_action in ('status','products','price_options','publication_preview') then
    v_base:=inventario.solog_admin_catalog_read_v3(p_uid,p_action,p_payload);
    return v_base||jsonb_build_object('contract_version',4);

  else
    raise exception 'SOLOG_INVALID_ACTION';
  end if;
end;
$function$;

revoke execute on function inventario.solog_admin_catalog_read_v4(uuid,text,jsonb)
from public, anon, authenticated;

create or replace function public.rpc_solog_admin_catalog_read_v4(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_active boolean;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
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

  return inventario.solog_admin_catalog_read_v4(v_uid,lower(btrim(coalesce(p_action,''))),p_payload);
end;
$function$;

revoke all on function public.rpc_solog_admin_catalog_read_v4(text,jsonb) from public, anon;
grant execute on function public.rpc_solog_admin_catalog_read_v4(text,jsonb) to authenticated;

create or replace function public.rpc_solog_admin_catalog_v4(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_active boolean;
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_operation uuid;
  v_expected_catalog bigint;
  v_expected_groups bigint;
  v_replay jsonb;
  v_result jsonb;
  v_response jsonb;
begin
  if v_uid is null then raise exception 'SOLOG_AUTH_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
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

  if v_action not in (
    'proposal_action',
    'resolve_product',
    'resolve_price',
    'propose_product_state',
    'prepare_product',
    'prepare_price'
  ) then
    raise exception 'SOLOG_INVALID_ACTION';
  end if;

  begin
    v_operation:=(p_payload->>'operation_id')::uuid;
    v_expected_catalog:=(p_payload->>'expected_catalog_revision')::bigint;
    v_expected_groups:=(p_payload->>'expected_groups_revision')::bigint;
  exception when others then
    raise exception 'SOLOG_INVALID_OPERATION';
  end;

  if v_operation is null
     or v_expected_catalog is null
     or v_expected_groups is null then
    raise exception 'SOLOG_INVALID_OPERATION';
  end if;

  v_replay:=inventario.solog_operation_begin(
    'catalog:v4:'||v_action,
    v_uid,
    v_operation,
    p_payload
  );

  if v_replay is not null then
    return v_replay||jsonb_build_object('replay',true);
  end if;

  if not pg_try_advisory_xact_lock(1397705807,4702) then
    raise exception 'SOLOG_LOCK_CONFLICT_RETRYABLE';
  end if;

  if v_expected_catalog<>inventario.solog_revision_get('catalog',null)
     or v_expected_groups<>inventario.solog_revision_get('groups',null) then
    raise exception 'SOLOG_MASTERDATA_REVISION_CONFLICT';
  end if;

  v_result:=inventario.solog_admin_catalog_mutate_v4(
    v_uid,
    v_action,
    p_payload-'expected_catalog_revision'-'expected_groups_revision'
  );

  v_response:=jsonb_build_object(
    'contract_version',4,
    'generated_at',now(),
    'replay',false,
    'result',v_result,
    'revisions',jsonb_build_object(
      'catalog',inventario.solog_revision_get('catalog',null),
      'groups',inventario.solog_revision_get('groups',null)
    )
  );

  return inventario.solog_operation_finish(
    'catalog:v4:'||v_action,
    v_uid,
    v_operation,
    v_response
  );
end;
$function$;

revoke all on function public.rpc_solog_admin_catalog_v4(text,jsonb) from public, anon;
grant execute on function public.rpc_solog_admin_catalog_v4(text,jsonb) to authenticated;
