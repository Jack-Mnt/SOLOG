-- SOLOG A3: RPC aditiva de historial condicional, migracion remota 20261124025038.
-- Contrato primario: docs/SOLOG_Backend_Cajero_Historial_Condicional_RPC_V3_V1.md
-- V2, V6, V7 y Motor permanecen intactos.
CREATE OR REPLACE FUNCTION public.rpc_solog_cashier_history_v3(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_rol text;
  v_sede uuid;
  v_activo boolean;
  v_period text;
  v_now timestamptz := now();
  v_date date;
  v_from timestamptz;
  v_to timestamptz;
  v_items jsonb;
  v_if_date date;
  v_if_etag text;
  v_has_condition boolean;
  v_etag text;
  v_oper_rev bigint;
begin
  if v_uid is null then
    raise exception 'SOLOG_AUTH_REQUIRED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'SOLOG_INVALID_PAYLOAD';
  end if;

  select u.rol::text, u.sede_id, u.activo
    into v_rol, v_sede, v_activo
  from public.usuarios u
  where u.id = v_uid;
  if not found or not coalesce(v_activo, false) then
    raise exception 'SOLOG_USER_DISABLED';
  end if;
  if v_rol <> 'cajero' or v_sede is null then
    raise exception 'SOLOG_OPERATIONAL_ROLE_REQUIRED';
  end if;

  -- A3 solo acepta el periodo y un par condicional completo.
  if exists (
    select 1
    from jsonb_object_keys(p_payload) as k(key)
    where k.key not in ('period', 'if_date', 'if_etag')
  ) then
    raise exception 'SOLOG_INVALID_HISTORY_PAYLOAD';
  end if;

  v_period := lower(coalesce(nullif(btrim(p_payload->>'period'), ''), 'today'));
  if v_period = 'today' then
    v_date := (v_now at time zone 'America/Lima')::date;
  elsif v_period = 'yesterday' then
    v_date := (v_now at time zone 'America/Lima')::date - 1;
  else
    raise exception 'SOLOG_INVALID_HISTORY_PERIOD';
  end if;

  v_has_condition := p_payload ? 'if_date' or p_payload ? 'if_etag';
  if v_has_condition then
    if not (p_payload ? 'if_date' and p_payload ? 'if_etag')
      or jsonb_typeof(p_payload->'if_date') <> 'string'
      or jsonb_typeof(p_payload->'if_etag') <> 'string' then
      raise exception 'SOLOG_INVALID_HISTORY_CONDITIONAL';
    end if;
    v_if_etag := p_payload->>'if_etag';
    if v_if_etag !~ '^[0-9a-f]{64}$'
      or (p_payload->>'if_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'SOLOG_INVALID_HISTORY_CONDITIONAL';
    end if;
    begin
      v_if_date := (p_payload->>'if_date')::date;
    exception when others then
      raise exception 'SOLOG_INVALID_HISTORY_CONDITIONAL';
    end;
    if to_char(v_if_date, 'YYYY-MM-DD') <> p_payload->>'if_date' then
      raise exception 'SOLOG_INVALID_HISTORY_CONDITIONAL';
    end if;
  end if;

  v_from := v_date::timestamp at time zone 'America/Lima';
  v_to := (v_date + 1)::timestamp at time zone 'America/Lima';

  -- Proyeccion V2 completa, orden total estable. Se materializa UNA vez
  -- y se usa tanto para el ETag como para la respuesta "full".
  select coalesce(jsonb_agg(jsonb_build_object(
    'detalle_id',cd.id,'grupo_id',cd.grupo_conteo_id,'grupo',cd.grupo_nombre,'categoria',cd.categoria_nombre,
    'stock_teorico',cd.stock_teorico,'stock_fisico',cd.stock_fisico,'diferencia',cd.diferencia,'estado_diferencia',cd.estado_diferencia,
    'precio',cd.precio,'valor_diferencia',cd.valor_diferencia,'contado_at',cd.contado_at,
    'snapshot_referencia_id',cd.snapshot_referencia_id,'primer_snapshot_posterior_id',cd.primer_snapshot_posterior_id,
    'snapshot_posterior_id',cd.snapshot_posterior_id,'stock_posterior',cd.stock_posterior,
    'snapshot_reconteo_id',cd.snapshot_reconteo_id,'stock_teorico_reconteo',cd.stock_teorico_reconteo,
    'stock_reconteo',cd.stock_reconteo,'recontado_at',cd.recontado_at,
    'motivo_diferencia',cd.motivo_diferencia,
    'observacion_diferencia',cd.observacion_diferencia,
    'observacion_reconteo',cd.observacion_reconteo
  ) order by cd.contado_at desc,cd.id desc),'[]'::jsonb)
    into v_items
  from inventario.conteo_detalle cd
  join inventario.conteos c on c.id = cd.conteo_id
  where c.sede_id = v_sede and c.usuario_id = v_uid
    and cd.estado_diferencia <> 'Inválido'
    and cd.contado_at >= v_from and cd.contado_at < v_to;

  v_etag := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'projection','cashier_history_v3_1',
      'user_id',v_uid,'site_id',v_sede,
      'period',v_period,'date',v_date,
      'items',v_items
    )::text, 'UTF8'),
    'sha256'
  ),'hex');

  -- La revision operacional es informativa: no decide "not_modified".
  v_oper_rev := inventario.solog_revision_get('operational',v_sede);

  return jsonb_build_object(
    'contract_version',3,
    'generated_at',v_now,
    'period',v_period,'date',v_date,
    'status',case when v_has_condition
                       and v_if_date = v_date
                       and v_if_etag = v_etag
                  then 'not_modified' else 'full' end,
    'etag',v_etag,
    'revisions',jsonb_build_object('operational',v_oper_rev),
    'items',case when v_has_condition
                      and v_if_date = v_date
                      and v_if_etag = v_etag
                 then null::jsonb else v_items end
  );
end;
$function$

revoke all on function public.rpc_solog_cashier_history_v3(jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_solog_cashier_history_v3(jsonb)
  to authenticated, service_role;
