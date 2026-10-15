-- SOLOG Fase 3C — hooks de hechos físicos y cambios estructurales.
-- No reescribe funciones V4/V5 ni modifica sus reglas ni sus retornos.

CREATE FUNCTION inventario.metrics_observacion_fisica_hook_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE v_sede uuid;
BEGIN
  IF TG_OP='UPDATE' AND (
     NEW.recontado_at IS NOT DISTINCT FROM OLD.recontado_at
     OR NEW.recontado_at IS NULL
  ) THEN RETURN NEW; END IF;

  SELECT co.sede_id INTO v_sede
  FROM inventario.conteos co
  WHERE co.id=coalesce(
    CASE WHEN TG_OP='UPDATE' THEN NEW.reconteo_conteo_id ELSE NULL END,
    NEW.conteo_id
  );
  IF v_sede IS NULL THEN RAISE EXCEPTION 'SOLOG_METRICS_PHYSICAL_WITHOUT_SITE'; END IF;
  PERFORM inventario.metrics_diferencias_reconciliar_v1(v_sede,NEW.grupo_conteo_id);
  PERFORM inventario.metrics_episodios_reconciliar_v1(v_sede,NEW.grupo_conteo_id);
  RETURN NEW;
END;
$body$;

CREATE FUNCTION inventario.metrics_grupo_invalidar_estructura_v1(p_grupo uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE v_elegible boolean;v_codes integer[];v_precio numeric;v_factor smallint;
BEGIN
  IF p_grupo IS NULL THEN RETURN; END IF;
  SELECT elegible,codigos_internos,precio_unitario
  INTO v_elegible,v_codes,v_precio
  FROM inventario.metrics_grupo_elegibilidad_v1(p_grupo);
  v_factor:=CASE WHEN v_precio IS NULL OR v_precio<0 THEN NULL
      WHEN v_precio<=14 THEN 1 WHEN v_precio<40 THEN 3 ELSE 5 END;

  INSERT INTO inventario.metrics_diferencias AS d(
    sede_id,grupo_conteo_id,factor_v_riesgo,
    validacion_tipo,comparable,calidad
  )
  SELECT s.id,p_grupo,v_factor,'none',false,
    CASE WHEN coalesce(v_elegible,false) THEN 'no_data' ELSE 'invalid' END
  FROM public.sedes s
  ON CONFLICT(sede_id,grupo_conteo_id) DO UPDATE SET
    factor_v_riesgo=excluded.factor_v_riesgo,
    comparable=false,
    validacion_tipo=CASE
       WHEN coalesce(v_elegible,false) AND
           (d.observacion_confirmacion_id IS NOT NULL
            OR d.validacion_observacion_id IS NOT NULL)
         THEN 'estructura' ELSE 'none' END,
    validacion_observacion_id=CASE
       WHEN coalesce(v_elegible,false)
         THEN coalesce(d.validacion_observacion_id,d.observacion_confirmacion_id)
       ELSE NULL END,
    calidad='invalid',
    updated_at=pg_catalog.clock_timestamp();

  UPDATE inventario.metrics_episodios e
  SET operativamente_visible_desde=NULL,
      updated_at=pg_catalog.clock_timestamp()
  WHERE e.grupo_conteo_id=p_grupo AND e.cierre_at IS NULL;
END;
$body$;

CREATE FUNCTION inventario.metrics_catalogo_cambio_grupo_hook_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE v_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    FOR v_id IN
      SELECT DISTINCT g.id FROM (
        SELECT o.grupo_conteo_id id
        FROM metrics_old_catalog_rows o
        JOIN metrics_new_catalog_rows n USING(c_interno)
        WHERE (o.estado='Excluido') IS DISTINCT FROM (n.estado='Excluido')
           OR o.grupo_conteo_id IS DISTINCT FROM n.grupo_conteo_id
        UNION
        SELECT n.grupo_conteo_id
        FROM metrics_old_catalog_rows o
        JOIN metrics_new_catalog_rows n USING(c_interno)
        WHERE (o.estado='Excluido') IS DISTINCT FROM (n.estado='Excluido')
           OR o.grupo_conteo_id IS DISTINCT FROM n.grupo_conteo_id
      ) g WHERE g.id IS NOT NULL
    LOOP
      PERFORM inventario.metrics_grupo_invalidar_estructura_v1(v_id);
    END LOOP;
  ELSIF TG_OP='INSERT' THEN
    FOR v_id IN SELECT DISTINCT grupo_conteo_id FROM metrics_new_catalog_rows
       WHERE grupo_conteo_id IS NOT NULL
    LOOP PERFORM inventario.metrics_grupo_invalidar_estructura_v1(v_id); END LOOP;
  ELSE
    FOR v_id IN SELECT DISTINCT grupo_conteo_id FROM metrics_old_catalog_rows
       WHERE grupo_conteo_id IS NOT NULL
    LOOP PERFORM inventario.metrics_grupo_invalidar_estructura_v1(v_id); END LOOP;
  END IF;
  RETURN NULL;
END;
$body$;

CREATE FUNCTION inventario.metrics_grupo_precio_estado_hook_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE v_factor smallint;
BEGIN
  IF OLD.activo IS DISTINCT FROM NEW.activo THEN
    PERFORM inventario.metrics_grupo_invalidar_estructura_v1(NEW.id);
  ELSIF OLD.precio IS DISTINCT FROM NEW.precio THEN
    v_factor:=CASE WHEN NEW.precio IS NULL OR NEW.precio<0 THEN NULL
      WHEN NEW.precio<=14 THEN 1 WHEN NEW.precio<40 THEN 3 ELSE 5 END;
    UPDATE inventario.metrics_diferencias
    SET factor_v_riesgo=v_factor,updated_at=pg_catalog.clock_timestamp()
    WHERE grupo_conteo_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER trg_metrics_observacion_normal_v1
AFTER INSERT ON inventario.conteo_detalle FOR EACH ROW
EXECUTE FUNCTION inventario.metrics_observacion_fisica_hook_v1();

CREATE TRIGGER trg_metrics_observacion_reconteo_v1
AFTER UPDATE OF recontado_at ON inventario.conteo_detalle
FOR EACH ROW WHEN (OLD.recontado_at IS DISTINCT FROM NEW.recontado_at AND NEW.recontado_at IS NOT NULL)
EXECUTE FUNCTION inventario.metrics_observacion_fisica_hook_v1();

CREATE TRIGGER trg_metrics_catalogo_update_grupos_v1
AFTER UPDATE ON inventario.catalogo
REFERENCING OLD TABLE AS metrics_old_catalog_rows NEW TABLE AS metrics_new_catalog_rows
FOR EACH STATEMENT
EXECUTE FUNCTION inventario.metrics_catalogo_cambio_grupo_hook_v1();

CREATE TRIGGER trg_metrics_catalogo_insert_grupos_v1
AFTER INSERT ON inventario.catalogo
REFERENCING NEW TABLE AS metrics_new_catalog_rows
FOR EACH STATEMENT
EXECUTE FUNCTION inventario.metrics_catalogo_cambio_grupo_hook_v1();

CREATE TRIGGER trg_metrics_catalogo_delete_grupos_v1
AFTER DELETE ON inventario.catalogo
REFERENCING OLD TABLE AS metrics_old_catalog_rows
FOR EACH STATEMENT
EXECUTE FUNCTION inventario.metrics_catalogo_cambio_grupo_hook_v1();

CREATE TRIGGER trg_metrics_grupo_precio_estado_v1
AFTER UPDATE OF precio,activo ON inventario.grupos_conteo
FOR EACH ROW
WHEN (OLD.precio IS DISTINCT FROM NEW.precio OR OLD.activo IS DISTINCT FROM NEW.activo)
EXECUTE FUNCTION inventario.metrics_grupo_precio_estado_hook_v1();

REVOKE ALL ON FUNCTION
  inventario.metrics_observacion_fisica_hook_v1(),
  inventario.metrics_grupo_invalidar_estructura_v1(uuid),
  inventario.metrics_catalogo_cambio_grupo_hook_v1(),
  inventario.metrics_grupo_precio_estado_hook_v1()
FROM PUBLIC,anon,authenticated,service_role;
