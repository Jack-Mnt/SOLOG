-- SOLOG Fase 5D: retiro inequívoco de cobertura y cierre provisional recuperable.

CREATE FUNCTION inventario.metrics_actividad_retirar_obligacion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_ctx record;v_key text;
BEGIN
 IF OLD.exigible AND OLD.vigente_hasta IS NULL
   AND NEW.vigente_hasta IS NOT NULL THEN
   SELECT * INTO v_ctx FROM inventario.solog_temporal_context(clock_timestamp());
   IF OLD.ronda_desde=v_ctx.ronda_desde THEN
     v_key:='coverage:'||OLD.ronda_desde::text||':'||
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

CREATE TRIGGER trg_metrics_actividad_retiro_estructura_v1
AFTER UPDATE OF vigente_hasta ON inventario.metrics_ronda_obligaciones
FOR EACH ROW WHEN (OLD.exigible
 AND OLD.vigente_hasta IS NULL AND NEW.vigente_hasta IS NOT NULL)
EXECUTE FUNCTION inventario.metrics_actividad_retirar_obligacion_v1();

CREATE FUNCTION inventario.metrics_actividad_cerrar_pendientes_v1(
 p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE site record;v_provisional integer:=0;v_definitivo integer:=0;
  n integer;
BEGIN
 IF p_as_of IS NULL OR p_as_of>clock_timestamp()+interval '5 minutes'
   OR p_as_of<clock_timestamp()-interval '24 hours'
 THEN RAISE EXCEPTION 'SOLOG_ACTIVITY_INVALID_CLOSURE_TIME';END IF;
 -- Turno sin sesión: solo registra si los gates V5 realmente permiten iniciar.
 FOR site IN SELECT id FROM public.sedes WHERE activo ORDER BY id LOOP
   PERFORM inventario.metrics_actividad_sin_sesion_v1(site.id,p_as_of);
 END LOOP;
 UPDATE inventario.metrics_actividad_turnos a
 SET estado='cerrado_provisional',
     cerrado_at=coalesce(a.cerrado_at,clock_timestamp()),
     updated_at=clock_timestamp()
 WHERE a.turno_hasta<=p_as_of AND a.estado='en_curso';
 GET DIAGNOSTICS v_provisional=ROW_COUNT;

 UPDATE inventario.metrics_actividad_turnos a
 SET estado='cerrado',updated_at=clock_timestamp()
 WHERE a.estado='cerrado_provisional'
   AND a.turno_hasta+interval '4 hours'<=p_as_of
   AND NOT EXISTS(
    SELECT 1 FROM inventario.conteos c
    WHERE c.sede_id=a.sede_id AND c.turno_desde=a.turno_desde
      AND c.estado IN ('activo','recovery')
      AND c.expira_at+interval '2 hours'>p_as_of
   );
 GET DIAGNOSTICS v_definitivo=ROW_COUNT;
 RETURN jsonb_build_object('provisional_closed',v_provisional,
   'final_closed',v_definitivo,'as_of',p_as_of);
END;
$f$;

REVOKE ALL ON FUNCTION
 inventario.metrics_actividad_retirar_obligacion_v1(),
 inventario.metrics_actividad_cerrar_pendientes_v1(timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
