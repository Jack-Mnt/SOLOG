-- SOLOG Fase 6C — episodios operativos, recurrencia e importancia.
CREATE FUNCTION inventario.metrics_dashboard_episodes_v1(
 p_site uuid,p_scope text,p_sort text,p_limit int,p_cursor jsonb,p_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_anchor timestamptz:=coalesce((p_cursor->>'anchor')::timestamptz,p_at);
 v_rows jsonb;v_count integer;v_more boolean; v_next text;
 c0 numeric;c1 numeric;c2 numeric;cid text;
BEGIN
 WITH source AS MATERIALIZED (
  SELECT ep.episodio_id,ep.grupo_conteo_id,gr.grupo_nombre,
   ep.apertura_at,ep.cierre_at,
   round((extract(epoch from coalesce(ep.cierre_at,v_anchor)-ep.apertura_at)/3600)::numeric,2) duration_hours,
   coalesce((
    SELECT count(*)::integer FROM inventario.metrics_episodios newer
    WHERE newer.sede_id=ep.sede_id AND newer.grupo_conteo_id=ep.grupo_conteo_id
      AND newer.apertura_at >= v_anchor-interval '45 days'
      AND newer.apertura_at<=v_anchor
      AND EXISTS(
       SELECT 1 FROM inventario.metrics_episodios older
       WHERE older.sede_id=newer.sede_id
         AND older.grupo_conteo_id=newer.grupo_conteo_id
         AND older.cierre_at IS NOT NULL
         AND older.cierre_at<newer.apertura_at)
   ),0) AS recurrences,
   gr.riesgo_nivel,CASE
     WHEN gr.estado_confirmado IS DISTINCT FROM 'Confirmada'
       THEN 'pending_confirmation'
     WHEN gr.riesgo_puntaje IS NULL THEN 'not_available'
     ELSE 'available' END AS risk_status
  FROM inventario.metrics_episodios ep
  JOIN inventario.metrics_dashboard_grupos_v1(p_site,v_anchor) gr
    ON gr.grupo_id=ep.grupo_conteo_id
  WHERE ep.sede_id=p_site AND ep.created_at<=v_anchor
     AND (
       (p_scope='open' AND ep.cierre_at IS NULL
          AND ep.operativamente_visible_desde IS NOT NULL
          AND ep.operativamente_visible_desde<=v_anchor)
       OR (p_scope='closed' AND ep.cierre_at IS NOT NULL
          AND ep.cierre_at<=v_anchor
          AND ep.cierre_at>=v_anchor-interval '45 days')
     )
 ), scored AS (
  SELECT src.*,
    (extract(epoch from coalesce(cierre_at,v_anchor)-apertura_at)/86400)::numeric persistence_days,
    CASE WHEN p_scope='closed' THEN extract(epoch from cierre_at)::numeric
      WHEN p_sort='recurrence' THEN recurrences::numeric
      WHEN p_sort='persistence'
        THEN (extract(epoch from v_anchor-apertura_at)/86400)::numeric
      ELSE (recurrences+1)::numeric *
        (extract(epoch from v_anchor-apertura_at)/86400)::numeric END k0,
    CASE WHEN p_scope='closed' THEN
        (extract(epoch from cierre_at-apertura_at)/3600)::numeric
      ELSE (extract(epoch from v_anchor-apertura_at)/86400)::numeric END k1,
    recurrences::numeric k2
  FROM source src
 ), filtered AS (
  SELECT * FROM scored
  WHERE p_cursor IS NULL OR
    (k0,k1,k2,episodio_id::text) <
      ((p_cursor->'keys'->>0)::numeric,
       (p_cursor->'keys'->>1)::numeric,
       (p_cursor->'keys'->>2)::numeric,
        p_cursor->'keys'->>3)
 ), page AS (
   SELECT *,row_number() OVER(ORDER BY k0 DESC,k1 DESC,k2 DESC,episodio_id::text DESC) rn
   FROM filtered ORDER BY k0 DESC,k1 DESC,k2 DESC,episodio_id::text DESC
   LIMIT p_limit+1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
     'episode_id',episodio_id,'group_id',grupo_conteo_id,'group_name',grupo_nombre,
     'opened_at',apertura_at,'closed_at',cierre_at,'recurrences_45d',recurrences,
     'duration_hours',duration_hours,'risk_level',riesgo_nivel,
     'risk_status',risk_status) ORDER BY rn)
     FILTER(where rn<=p_limit),'[]'::jsonb),
   count(*)>p_limit,
   max(k0) FILTER(where rn=p_limit),max(k1) FILTER(where rn=p_limit),
   max(k2) FILTER(where rn=p_limit),max(episodio_id::text) FILTER(where rn=p_limit)
 INTO v_rows,v_more,c0,c1,c2,cid FROM page;
 IF v_more THEN v_next:=inventario.metrics_dashboard_cursor_make_v1(
     'episodes',p_site,p_sort,p_scope,v_anchor,c0,c1,c2,cid);END IF;
 SELECT count(*)::integer INTO v_count
 FROM inventario.metrics_episodios ep
 JOIN inventario.grupos_conteo g ON g.id=ep.grupo_conteo_id AND g.activo
 WHERE ep.sede_id=p_site AND ep.created_at<=v_anchor
  AND EXISTS(SELECT 1 FROM inventario.catalogo c WHERE c.grupo_conteo_id=g.id
    AND c.estado<>'Excluido')
  AND ((p_scope='open' AND ep.cierre_at IS NULL
       AND ep.operativamente_visible_desde IS NOT NULL
       AND ep.operativamente_visible_desde<=v_anchor)
     OR (p_scope='closed' AND ep.cierre_at IS NOT NULL
       AND ep.cierre_at BETWEEN v_anchor-interval '45 days' AND v_anchor));
 RETURN jsonb_build_object('site_id',p_site,'scope',p_scope,'sort',p_sort,
   'rows',v_rows,'next_cursor',v_next,'total',v_count);
END;
$f$;
REVOKE ALL ON FUNCTION
 inventario.metrics_dashboard_episodes_v1(uuid,text,text,int,jsonb,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
