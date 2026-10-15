-- SOLOG Fase 5G: claves UTC canónicas y primera habilitación inmutable.
-- No cambia conteos, claves de tareas semánticas ni tablas persistentes.
CREATE FUNCTION inventario.metrics_actividad_utc_key_v1(p_at timestamptz)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $f$
  SELECT to_char(p_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"');
$f$;

CREATE OR REPLACE FUNCTION inventario.metrics_actividad_tarea_clave_v1(
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
   RETURN 'daily:'||inventario.metrics_actividad_utc_key_v1(s.turno_desde)||':'||p_grupo_id::text;
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
      RETURN 'coverage:'||inventario.metrics_actividad_utc_key_v1(s.ronda_desde)||':'||p_grupo_id::text||':'||gen::text;
   END IF;
   -- El motor ya habilitó; no perder una tarea legítima si la generación
   -- administrativa falta. Identidad conservadora + calidad partial.
   RETURN 'coverage:'||inventario.metrics_actividad_utc_key_v1(s.ronda_desde)||':'||p_grupo_id::text||
          ':unversioned:'||fp;
  ELSE RETURN NULL;
 END CASE;
END;
$f$;


CREATE OR REPLACE FUNCTION inventario.metrics_actividad_acumular_v1(
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
 merged_h:=p_nuevas || existing.tareas_habilitadas;
 merged_c:=p_completadas || existing.tareas_completadas;
 merged_r:=p_retiradas || existing.tareas_retiradas;
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


CREATE OR REPLACE FUNCTION inventario.metrics_actividad_sin_sesion_v1(
 p_sede_id uuid,p_at timestamptz DEFAULT clock_timestamp()
)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_snap uuid;v_snap_at timestamptz;
 v_ctx record;v_cnt integer;v_priority text;v_queues jsonb;
 v_tasks jsonb:='{}'::jsonb;v_key text;v_n integer;
 job record;
BEGIN
 IF p_at IS NULL OR p_at<clock_timestamp()-interval '2 minutes'
    OR p_at>clock_timestamp()+interval '5 seconds' THEN
   RETURN false;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sedes WHERE id=p_sede_id AND activo)
   OR NOT EXISTS(SELECT 1 FROM public.usuarios
           WHERE sede_id=p_sede_id AND rol='cajero' AND activo)
   OR NOT EXISTS(SELECT 1 FROM inventario.dispositivos_solog
           WHERE sede_id=p_sede_id AND estado='autorizado')
 THEN RETURN false;END IF;

 -- La posibilidad de iniciar V5 requiere ausencia de otra sesión activa.
 -- Un estado 'activo' expirado es normalizado por V5 a recovery.
 IF EXISTS(SELECT 1 FROM inventario.conteos
    WHERE sede_id=p_sede_id AND estado='activo' AND expira_at>p_at)
 THEN RETURN false; END IF;

 SELECT id,capturado_at INTO v_snap,v_snap_at
 FROM inventario.snapshots
 WHERE sede_id=p_sede_id AND estado='confirmado' AND confirmado_at IS NOT NULL
 ORDER BY confirmado_at DESC,capturado_at DESC,id DESC LIMIT 1;
 IF v_snap IS NULL
    OR p_at>=inventario.solog_snapshot_expira_at(v_snap_at)-interval '5 minutes'
    OR p_at>=inventario.solog_sesion_expira_at(v_snap_at)
 THEN RETURN false;END IF;

 SELECT count(*)::integer INTO v_cnt
 FROM inventario.estado_stock_grupo
 WHERE sede_id=p_sede_id AND activo AND NOT requiere_snapshot_completo;
 IF v_cnt=0 THEN RETURN false;END IF;
 IF EXISTS(
   SELECT 1 FROM inventario.estado_stock_grupo esg
   WHERE esg.sede_id=p_sede_id AND esg.activo
     AND NOT esg.requiere_snapshot_completo
     AND inventario.solog_stock_grupo_snapshot(
            v_snap,esg.grupo_conteo_id) IS NULL
 ) THEN RETURN false; END IF;

 SELECT * INTO v_ctx FROM inventario.solog_temporal_context(p_at);
 WITH candidates AS MATERIALIZED(
   SELECT a.grupo_conteo_id,a.action,a.detalle_reconteo_id,
       inventario.solog_priority_classify_v4(
         a.action,a.coverage_complete) AS class
   FROM inventario.solog_cashier_group_actions_v4(p_sede_id,p_at) a
 ), counters AS(
   SELECT count(*) FILTER(where class='round_coverage')::integer c1,
    count(*) FILTER(where class='review_for_coverage')::integer c2,
    count(*) FILTER(where class='review_regular')::integer c3,
    count(*) FILTER(where class='shift_coverage')::integer c4
   FROM candidates
 )
 SELECT jsonb_build_object('round_coverage',c1,
    'review_for_coverage',c2,'review_regular',c3,'shift_coverage',c4),
    inventario.solog_priority_resolve_v4(c1,c2,c3,c4)
 INTO v_queues,v_priority FROM counters;
 IF v_priority='none' THEN
   -- Gate superado y ningún trabajo: representa Sin tareas verificable.
   PERFORM inventario.metrics_actividad_acumular_v1(
     p_sede_id,v_ctx.turno_desde,v_ctx.turno_hasta,
     v_ctx.turno,'none',v_queues);
   RETURN true;
 END IF;
 FOR job IN
   SELECT a.grupo_conteo_id,a.action,a.detalle_reconteo_id,
          inventario.solog_priority_classify_v4(a.action,a.coverage_complete) cls
   FROM inventario.solog_cashier_group_actions_v4(p_sede_id,p_at) a
   WHERE a.action<>'none'
 LOOP
   IF job.cls IS DISTINCT FROM v_priority THEN CONTINUE;END IF;
   IF job.action='recount' THEN
     IF job.detalle_reconteo_id IS NULL THEN CONTINUE;END IF;
     v_key:='recount:'||job.detalle_reconteo_id::text;
   ELSIF job.action='daily' THEN
     v_key:='daily:'||inventario.metrics_actividad_utc_key_v1(v_ctx.turno_desde)||':'||job.grupo_conteo_id::text;
   ELSE
     SELECT o.generacion INTO v_n
     FROM inventario.metrics_ronda_obligaciones o
     WHERE o.sede_id=p_sede_id AND o.ronda_desde=v_ctx.ronda_desde
       AND o.grupo_conteo_id=job.grupo_conteo_id
       AND o.exigible AND o.vigente_hasta IS NULL
     ORDER BY o.generacion DESC LIMIT 1;
     IF v_n IS NOT NULL THEN
       v_key:='coverage:'||inventario.metrics_actividad_utc_key_v1(v_ctx.ronda_desde)||':'||
                   job.grupo_conteo_id::text||':'||v_n::text;
     ELSE
       v_key:='coverage:'||inventario.metrics_actividad_utc_key_v1(v_ctx.ronda_desde)||':'||
              job.grupo_conteo_id::text||':unversioned';
     END IF;
   END IF;
   v_tasks:=v_tasks||jsonb_build_object(v_key,
     jsonb_build_object('group_id',job.grupo_conteo_id,
      'kind',job.cls,'habilitada_at',p_at,'source','no_session'));
 END LOOP;
 PERFORM inventario.metrics_actividad_acumular_v1(
    p_sede_id,v_ctx.turno_desde,v_ctx.turno_hasta,v_ctx.turno,
    v_priority,v_queues,v_tasks);
 RETURN true;
END;
$f$;


CREATE OR REPLACE FUNCTION inventario.metrics_actividad_retirar_obligacion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_ctx record;v_key text;
BEGIN
 IF OLD.exigible AND OLD.vigente_hasta IS NULL
   AND NEW.vigente_hasta IS NOT NULL THEN
   SELECT * INTO v_ctx FROM inventario.solog_temporal_context(clock_timestamp());
   IF OLD.ronda_desde=v_ctx.ronda_desde THEN
     v_key:='coverage:'||inventario.metrics_actividad_utc_key_v1(OLD.ronda_desde)||':'||
                 OLD.grupo_conteo_id::text||':'||OLD.generacion::text;
     UPDATE inventario.metrics_actividad_turnos
     SET tareas_retiradas=tareas_retiradas||
       jsonb_build_object(v_key,jsonb_build_object(
         'reason','structural_invalidated',
         'removed_at',clock_timestamp())),
       updated_at=clock_timestamp()
     WHERE sede_id=OLD.sede_id AND turno_desde=v_ctx.turno_desde
       AND tareas_habilitadas ? v_key
       AND NOT tareas_retiradas ? v_key;
   END IF;
 END IF;
 RETURN NEW;
END;
$f$;


REVOKE ALL ON FUNCTION inventario.metrics_actividad_utc_key_v1(timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
