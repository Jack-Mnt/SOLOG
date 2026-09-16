-- SOLOG Bloque 1: expose the global incidents revision in the incident summary.
-- Remote migration already applied as 20260916111254_solog_admin_incidents_v2_summary_global_revision.
-- Additive contract change only; contract_version remains 2.

do $migration$
declare
  v_def text;
  v_old constant text := '''site_id'',v_site,''families'',v_rows,
      ''revisions'',jsonb_build_object(''incidents'',inventario.solog_revision_get(''incidents'',v_site)));';
  v_new constant text := '''site_id'',v_site,''families'',v_rows,
      ''revisions'',jsonb_build_object(
        ''incidents'',inventario.solog_revision_get(''incidents'',v_site),
        ''incidents_global'',inventario.solog_revision_get(''incidents'',null)
      ));';
begin
  select pg_get_functiondef('public.rpc_solog_admin_incidents_v2(text,jsonb)'::regprocedure)
    into v_def;

  if v_def is null then
    raise exception 'rpc_solog_admin_incidents_v2 definition not found';
  end if;

  if position(v_old in v_def) = 0 then
    raise exception 'Expected summary revisions fragment not found; migration aborted';
  end if;

  if ((length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old)) <> 1 then
    raise exception 'Expected summary revisions fragment is not unique; migration aborted';
  end if;

  execute replace(v_def, v_old, v_new);
end
$migration$;
