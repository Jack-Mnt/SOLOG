CREATE OR REPLACE FUNCTION inventario.metrics_dashboard_cursor_make_v1(
 p_action text,p_site uuid,p_sort text,p_context text,p_anchor timestamptz,
 k0 numeric,k1 numeric,k2 numeric,k3 text)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
 SELECT replace(encode(convert_to(jsonb_build_object('v',1,'action',p_action,
   'site',p_site,'sort',p_sort,'context',p_context,'anchor',p_anchor,
   'keys',jsonb_build_array(k0,k1,k2,k3))::text,'UTF8'),'base64'), E'\n', '');
$body$;
