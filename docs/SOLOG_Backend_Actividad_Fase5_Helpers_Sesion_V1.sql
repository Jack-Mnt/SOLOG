-- SOLOG Dashboard Fase 5A — acumulación compacta Activity, aislada de V5.
-- Fuente funcional: SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md §4.
-- No se reescribe Motor V5, no se backfillea Activity histórica.

CREATE FUNCTION inventario.metrics_actividad_tarea_clave_v1(
 p_conteo_id uuid,p_grupo_id uuid
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE s inventario.conteos%rowtype;
        sg inventario.solog_session_runtime_groups%rowtype;
        gen integer; fp text;
BEGIN
 SELECT * INTO s FROM inventario.conteos WHERE id=p_conteo_id;
 SELECT * INTO sg FROM inventario.solog_session_runtime_groups
  WHERE conteo_id=p_conteo_id AND grupo_conteo_id=p_grupo_id;
 IF s.id IS NULL OR sg.conteo_id IS NULL THEN RETURN NULL;END IF;
 CASE sg.accion
  WHEN 'recount' THEN
   IF sg.detalle_reconteo_id IS NULL THEN RETURN NULL;END IF;
   RETURN 'recount:'||sg.detalle_reconteo_id::text;
  WHEN 'daily' THEN
   RETURN 'daily:'||s.turno_desde::text||':'||p_grupo_id::text;
  WHEN 'coverage' THEN
   fp:=md5(array_to_string(sg.codigos_internos,','));
   SELECT o.generacion INTO gen FROM inventario.metrics_ronda_obligaciones o
   WHERE o.sede_id=s.sede_id AND o.ronda_desde=s.ronda_desde
     AND o.grupo_conteo_id=p_grupo_id
     AND o.composicion_fingerprint=fp
     AND o.vigente_desde<=s.iniciado_at
     AND (o.vigente_hasta IS NULL OR o.vigente_hasta>s.iniciado_at)
   ORDER BY o.generacion DESC LIMIT 1;
   IF gen IS NOT NULL THEN
      RETURN 'coverage:'||s.ronda_desde::text||':'||p_grupo_id::text||':'||gen::text;
   END IF;
   -- El motor ya habilitó; no perder una tarea legítima si la generación
   -- administrativa falta. Identidad conservadora + calidad partial.
   RETURN 'coverage:'||s.ronda_desde::text||':'||p_grupo_id::text||
          ':unversioned:'||fp;
  ELSE RETURN NULL;
 END CASE;
END;
$f$;

CREATE FUNCTION inventario.metrics_actividad_acumular_v1(
 p_sede uuid,p_turno_desde timestamptz,p_turno_hasta timestamptz,p_turno text,
 p_prioridad text,p_cola jsonb,
 p_nuevas jsonb DEFAULT '{}'::jsonb,
 p_completadas jsonb DEFAULT '{}'::jsonb,
 p_retiradas jsonb DEFAULT '{}'::jsonb,
 p_fuente text DEFAULT 'session'
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE existing inventario.metrics_actividad_turnos%rowtype;
       merged_h jsonb;merged_c jsonb;merged_r jsonb;
       v_new_status text;
       v_quality text;
       v_at timestamptz:=clock_timestamp();
       v_priority text;
BEGIN
 IF p_turno_desde IS NULL OR p_turno_hasta<=p_turno_desde
    OR p_turno NOT IN ('early','day','night')
    OR p_prioridad NOT IN ('round_coverage','review_for_coverage',
                           'review_regular','shift_coverage','none')
    OR p_fuente NOT IN ('session','no_session')
    OR jsonb_typeof(p_nuevas)<>'object'
    OR jsonb_typeof(p_completadas)<>'object'
    OR jsonb_typeof(p_retiradas)<>'object'
    OR jsonb_typeof(p_cola)<>'object' THEN
     RAISE EXCEPTION 'SOLOG_ACTIVITY_INVALID_ACCUMULATION';
 END IF;
 INSERT INTO inventario.metrics_actividad_turnos(
    sede_id,turno_desde,turno_hasta,turno,prioridad_actual,
    calidad,estado
 ) VALUES(
    p_sede,p_turno_desde,p_turno_hasta,p_turno,'none',
    CASE WHEN p_turno_desde<v_at-interval '1 minute' THEN 'partial' ELSE 'complete' END,
    CASE WHEN p_turno_hasta<=v_at THEN 'cerrado_provisional' ELSE 'en_curso' END
 ) ON CONFLICT(sede_id,turno_desde) DO NOTHING;
 SELECT * INTO existing FROM inventario.metrics_actividad_turnos
 WHERE sede_id=p_sede AND turno_desde=p_turno_desde FOR UPDATE;
 merged_h:=existing.tareas_habilitadas || p_nuevas;
 merged_c:=existing.tareas_completadas || p_completadas;
 merged_r:=existing.tareas_retiradas || p_retiradas;
 IF NOT inventario.metrics_actividad_completadas_validas_v1(merged_h,merged_c) THEN
    RAISE EXCEPTION 'SOLOG_ACTIVITY_COMPLETED_WITHOUT_ENABLEMENT';
 END IF;
 v_quality:=CASE WHEN existing.calidad='partial'
     OR (p_nuevas::text LIKE '%unversioned%')
     THEN 'partial' ELSE existing.calidad END;
 UPDATE inventario.metrics_actividad_turnos
 SET tareas_habilitadas=merged_h,
     tareas_completadas=merged_c,
     tareas_retiradas=merged_r,
     prioridad_actual=p_prioridad,
     grupos_cobertura=coalesce((p_cola->>'round_coverage')::integer,0),
     grupos_reconteo_cobertura=coalesce((p_cola->>'review_for_coverage')::integer,0),
     grupos_reconteo_regular=coalesce((p_cola->>'review_regular')::integer,0),
     grupos_cobertura_turno=coalesce((p_cola->>'shift_coverage')::integer,0),
     calidad=v_quality,
     estado=CASE WHEN p_turno_hasta<=v_at
       THEN 'cerrado_provisional' ELSE 'en_curso' END,
     updated_at=v_at
 WHERE sede_id=p_sede AND turno_desde=p_turno_desde;
END;
$f$;

CREATE FUNCTION inventario.metrics_actividad_refrescar_sesion_v1(
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

REVOKE ALL ON FUNCTION
 inventario.metrics_actividad_tarea_clave_v1(uuid,uuid),
 inventario.metrics_actividad_acumular_v1(uuid,timestamptz,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,text),
 inventario.metrics_actividad_refrescar_sesion_v1(uuid,uuid,text,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
