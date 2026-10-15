-- SOLOG Fase 5C: sin sesión, habilitar SOLO tras gates efectivos V5.
-- No se llama solog_session_capability_v4: puede normalizar/escribir sesiones.
-- La fuente de acciones/prioridad es solog_cashier_group_actions_v4.
CREATE FUNCTION inventario.metrics_actividad_sin_sesion_v1(
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
     v_key:='daily:'||v_ctx.turno_desde::text||':'||job.grupo_conteo_id::text;
   ELSE
     SELECT o.generacion INTO v_n
     FROM inventario.metrics_ronda_obligaciones o
     WHERE o.sede_id=p_sede_id AND o.ronda_desde=v_ctx.ronda_desde
       AND o.grupo_conteo_id=job.grupo_conteo_id
       AND o.exigible AND o.vigente_hasta IS NULL
     ORDER BY o.generacion DESC LIMIT 1;
     IF v_n IS NOT NULL THEN
       v_key:='coverage:'||v_ctx.ronda_desde::text||':'||
                   job.grupo_conteo_id::text||':'||v_n::text;
     ELSE
       v_key:='coverage:'||v_ctx.ronda_desde::text||':'||
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

CREATE FUNCTION inventario.metrics_actividad_instalacion_evento_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
BEGIN
 -- Ultimo paso de ConeXion V2, después de aplicar stock/grupos.
 IF OLD.ultimo_acceso_at IS DISTINCT FROM NEW.ultimo_acceso_at THEN
   PERFORM inventario.metrics_actividad_sin_sesion_v1(NEW.sede_id,clock_timestamp());
 END IF;
 RETURN NEW;
END;
$f$;

CREATE FUNCTION inventario.metrics_actividad_sesion_fin_evento_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
BEGIN
 IF OLD.estado IS DISTINCT FROM NEW.estado
    AND NEW.estado IN ('finalizado','expirado','recovery') THEN
   PERFORM inventario.metrics_actividad_sin_sesion_v1(NEW.sede_id,clock_timestamp());
 END IF;
 RETURN NEW;
END;
$f$;

CREATE TRIGGER trg_metrics_actividad_instalacion_evento_v1
AFTER UPDATE OF ultimo_acceso_at ON inventario.instalaciones
FOR EACH ROW WHEN (OLD.ultimo_acceso_at IS DISTINCT FROM NEW.ultimo_acceso_at)
EXECUTE FUNCTION inventario.metrics_actividad_instalacion_evento_v1();

CREATE TRIGGER trg_metrics_actividad_sesion_fin_evento_v1
AFTER UPDATE OF estado ON inventario.conteos
FOR EACH ROW WHEN (OLD.estado IS DISTINCT FROM NEW.estado
   AND NEW.estado IN ('finalizado','expirado','recovery'))
EXECUTE FUNCTION inventario.metrics_actividad_sesion_fin_evento_v1();

REVOKE ALL ON FUNCTION
 inventario.metrics_actividad_sin_sesion_v1(uuid,timestamptz),
 inventario.metrics_actividad_instalacion_evento_v1(),
 inventario.metrics_actividad_sesion_fin_evento_v1()
FROM PUBLIC,anon,authenticated,service_role;
