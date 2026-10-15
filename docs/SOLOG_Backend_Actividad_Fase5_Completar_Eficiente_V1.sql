-- Fase 5H: evitar barrer el runtime completo en cada detalle aceptado.
-- Los habilitados ya se capturaron en start o cambio de prioridad.
CREATE OR REPLACE FUNCTION inventario.metrics_actividad_refrescar_sesion_v1(
 p_conteo_id uuid,
 p_completar_detalle_id uuid DEFAULT NULL,
 p_completar_tipo text DEFAULT NULL,
 p_completar_at timestamptz DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE session_data inventario.conteos%rowtype;
        runtime_row record;
        v_priority text;
        v_key text;v_class text;
        v_en jsonb:='{}'::jsonb;
        v_co jsonb:='{}'::jsonb;
        v_counts jsonb:='{}'::jsonb;
        v_completion_key text;
        v_completion_class text;
        v_completion_group uuid;
BEGIN
 SELECT * INTO session_data FROM inventario.conteos WHERE id=p_conteo_id;
 IF NOT FOUND OR session_data.turno_desde IS NULL THEN RETURN;END IF;
 IF session_data.estado NOT IN ('activo','recovery') AND
    p_completar_detalle_id IS NULL THEN RETURN;END IF;
 v_priority:=inventario.solog_runtime_priority_class_v4(p_conteo_id);
 SELECT jsonb_build_object(
  'round_coverage',count(*) FILTER(where priority_class='round_coverage'),
  'review_for_coverage',count(*) FILTER(where priority_class='review_for_coverage'),
  'review_regular',count(*) FILTER(where priority_class='review_regular'),
  'shift_coverage',count(*) FILTER(where priority_class='shift_coverage')
 ) INTO v_counts FROM inventario.solog_session_runtime_groups
 WHERE conteo_id=p_conteo_id;
 IF p_completar_detalle_id IS NULL THEN
 FOR runtime_row IN
   SELECT sg.grupo_conteo_id,sg.accion,sg.priority_class,
          sg.detalle_reconteo_id
   FROM inventario.solog_session_runtime_groups sg
   WHERE sg.conteo_id=p_conteo_id AND sg.priority_class=v_priority
      AND sg.accion<>'none'
 ORDER BY sg.grupo_conteo_id
 LOOP
   v_key:=inventario.metrics_actividad_tarea_clave_v1(
             p_conteo_id,runtime_row.grupo_conteo_id);
   IF v_key IS NULL THEN CONTINUE;END IF;
   v_en:=v_en||jsonb_build_object(v_key,
     jsonb_build_object('group_id',runtime_row.grupo_conteo_id,
       'kind',runtime_row.priority_class,
       'habilitada_at',clock_timestamp(),
       'source','session'));
 END LOOP;
 END IF;
 IF p_completar_detalle_id IS NOT NULL THEN
   IF p_completar_tipo NOT IN ('normal','recount')
       OR p_completar_at IS NULL THEN
       RAISE EXCEPTION 'SOLOG_ACTIVITY_INVALID_COMPLETION'; END IF;
   IF p_completar_tipo='recount' THEN
     SELECT cd.grupo_conteo_id INTO v_completion_group
     FROM inventario.conteo_detalle cd
     WHERE cd.id=p_completar_detalle_id
       AND cd.reconteo_conteo_id=p_conteo_id;
   ELSE
     SELECT cd.grupo_conteo_id INTO v_completion_group
     FROM inventario.conteo_detalle cd
     WHERE cd.id=p_completar_detalle_id
       AND cd.conteo_id=p_conteo_id;
   END IF;
   IF v_completion_group IS NULL THEN
     RAISE EXCEPTION 'SOLOG_ACTIVITY_COMPLETION_NOT_IN_SESSION';END IF;
   SELECT sg.priority_class INTO v_completion_class
   FROM inventario.solog_session_runtime_groups sg
   WHERE sg.conteo_id=p_conteo_id AND sg.grupo_conteo_id=v_completion_group;
   v_completion_key:=inventario.metrics_actividad_tarea_clave_v1(
      p_conteo_id,v_completion_group);
   IF v_completion_class IS NULL OR v_completion_class<>v_priority
     OR v_completion_key IS NULL THEN
     RAISE EXCEPTION 'SOLOG_ACTIVITY_PRIORITY_NOT_AUTHORIZED'; END IF;
   v_en:=v_en || jsonb_build_object(v_completion_key,
     jsonb_build_object('group_id',v_completion_group,
         'kind',v_completion_class,
         'habilitada_at',clock_timestamp(),
         'source','session'));
   v_co:=jsonb_build_object(v_completion_key,
     jsonb_build_object('evidencia_id',p_completar_detalle_id,
      'tipo_ejecucion',p_completar_tipo,
      'observada_at',p_completar_at,
      'clase_v4_ejecutada',v_completion_class));
 END IF;
 PERFORM inventario.metrics_actividad_acumular_v1(
    session_data.sede_id,session_data.turno_desde,session_data.turno_hasta,
    session_data.turno,v_priority,v_counts,v_en,v_co,'{}'::jsonb,'session');
END;
$f$;

