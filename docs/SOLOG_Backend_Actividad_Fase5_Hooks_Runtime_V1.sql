-- Fase 5B — captura transaccional sin modificar RPC Cajero V5.
-- Ingesta de runtime; observación aceptada antes de sg.priority_class -> none.

CREATE FUNCTION inventario.metrics_actividad_runtime_insert_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE id uuid;
BEGIN
 FOR id IN SELECT DISTINCT conteo_id FROM metrics_runtime_nuevos
 LOOP
   PERFORM inventario.metrics_actividad_refrescar_sesion_v1(id);
 END LOOP;
 RETURN NULL;
END;
$f$;

CREATE FUNCTION inventario.metrics_actividad_runtime_actualizar_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE
 session_data inventario.conteos%rowtype;
 active_class text;
 queue jsonb;
BEGIN
 IF OLD.priority_class IS NOT DISTINCT FROM NEW.priority_class
   AND OLD.accion IS NOT DISTINCT FROM NEW.accion THEN RETURN NEW;END IF;
 SELECT * INTO session_data FROM inventario.conteos WHERE id=NEW.conteo_id;
 IF session_data.id IS NULL OR session_data.turno_desde IS NULL THEN RETURN NEW;END IF;
 active_class:=inventario.solog_runtime_priority_class_v4(NEW.conteo_id);
 IF active_class IS DISTINCT FROM OLD.priority_class THEN
   PERFORM inventario.metrics_actividad_refrescar_sesion_v1(NEW.conteo_id);
 ELSE
   -- Si sigue la misma clase, la habilitación no cambia.
   -- Refrescar solo los cuatro contadores diagnósticos sin duplicar JSONB.
   SELECT jsonb_build_object(
     'round_coverage',count(*) FILTER(where priority_class='round_coverage'),
     'review_for_coverage',count(*) FILTER(where priority_class='review_for_coverage'),
     'review_regular',count(*) FILTER(where priority_class='review_regular'),
     'shift_coverage',count(*) FILTER(where priority_class='shift_coverage')
   ) INTO queue FROM inventario.solog_session_runtime_groups
   WHERE conteo_id=NEW.conteo_id;
   UPDATE inventario.metrics_actividad_turnos
   SET grupos_cobertura=(queue->>'round_coverage')::integer,
       grupos_reconteo_cobertura=(queue->>'review_for_coverage')::integer,
       grupos_reconteo_regular=(queue->>'review_regular')::integer,
       grupos_cobertura_turno=(queue->>'shift_coverage')::integer,
       updated_at=clock_timestamp()
   WHERE sede_id=session_data.sede_id AND turno_desde=session_data.turno_desde;
 END IF;
 RETURN NEW;
END;
$f$;

CREATE FUNCTION inventario.metrics_actividad_fisica_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE session_id uuid; event_at timestamptz;kind text;
BEGIN
 IF TG_OP='INSERT' THEN
   session_id:=NEW.conteo_id;event_at:=NEW.contado_at;kind:='normal';
 ELSE
   IF NEW.recontado_at IS NOT DISTINCT FROM OLD.recontado_at
     OR NEW.recontado_at IS NULL THEN RETURN NEW;END IF;
   session_id:=NEW.reconteo_conteo_id;event_at:=NEW.recontado_at;
   kind:='recount';
 END IF;
 IF session_id IS NOT NULL THEN
   -- V5 todavía no actualizó sg a none; se captura clase exacta autorizada.
   PERFORM inventario.metrics_actividad_refrescar_sesion_v1(
       session_id,NEW.id,kind,event_at);
 END IF;
 RETURN NEW;
END;
$f$;

CREATE FUNCTION inventario.metrics_actividad_fin_sesion_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
BEGIN
 IF OLD.estado IN ('activo','recovery')
    AND NEW.estado IN ('finalizado','expirado')
    AND OLD.estado IS DISTINCT FROM NEW.estado
 THEN
   -- BEFORE: aún existe runtime y prioridades habilitadas de la sesión.
   PERFORM inventario.metrics_actividad_refrescar_sesion_v1(OLD.id);
 END IF;
 RETURN NEW;
END;
$f$;

CREATE TRIGGER trg_metrics_actividad_runtime_start_v1
AFTER INSERT ON inventario.solog_session_runtime_groups
REFERENCING NEW TABLE AS metrics_runtime_nuevos
FOR EACH STATEMENT
EXECUTE FUNCTION inventario.metrics_actividad_runtime_insert_v1();

CREATE TRIGGER trg_metrics_actividad_runtime_priority_v1
AFTER UPDATE OF accion,priority_class ON inventario.solog_session_runtime_groups
FOR EACH ROW
WHEN (OLD.accion IS DISTINCT FROM NEW.accion
      OR OLD.priority_class IS DISTINCT FROM NEW.priority_class)
EXECUTE FUNCTION inventario.metrics_actividad_runtime_actualizar_v1();

CREATE TRIGGER trg_metrics_actividad_normal_v1
AFTER INSERT ON inventario.conteo_detalle FOR EACH ROW
EXECUTE FUNCTION inventario.metrics_actividad_fisica_v1();

CREATE TRIGGER trg_metrics_actividad_recount_v1
AFTER UPDATE OF recontado_at ON inventario.conteo_detalle FOR EACH ROW
WHEN (OLD.recontado_at IS DISTINCT FROM NEW.recontado_at
   AND NEW.recontado_at IS NOT NULL)
EXECUTE FUNCTION inventario.metrics_actividad_fisica_v1();

CREATE TRIGGER trg_metrics_actividad_fin_sesion_v1
BEFORE UPDATE OF estado ON inventario.conteos FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado
  AND OLD.estado IN ('activo','recovery')
  AND NEW.estado IN ('finalizado','expirado'))
EXECUTE FUNCTION inventario.metrics_actividad_fin_sesion_v1();

REVOKE ALL ON FUNCTION
 inventario.metrics_actividad_runtime_insert_v1(),
 inventario.metrics_actividad_runtime_actualizar_v1(),
 inventario.metrics_actividad_fisica_v1(),
 inventario.metrics_actividad_fin_sesion_v1()
FROM PUBLIC,anon,authenticated,service_role;
