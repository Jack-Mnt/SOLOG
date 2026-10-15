-- SOLOG Fase 4D: hooks solo analíticos, sin reemplazar Motor V5.
CREATE FUNCTION inventario.metrics_ronda_fisica_trigger_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE v_sede_id uuid;
BEGIN
 IF TG_OP='INSERT' THEN
   SELECT sede_id INTO v_sede_id FROM inventario.conteos
   WHERE id=NEW.conteo_id;
   PERFORM inventario.metrics_ronda_acreditar_v1(
     v_sede_id,NEW.grupo_conteo_id,NEW.id,'normal',
     NEW.contado_at,NEW.codigos_internos
   );
 ELSIF NEW.recontado_at IS DISTINCT FROM OLD.recontado_at
   AND NEW.recontado_at IS NOT NULL THEN
   SELECT sede_id INTO v_sede_id FROM inventario.conteos
   WHERE id=coalesce(NEW.reconteo_conteo_id,NEW.conteo_id);
   PERFORM inventario.metrics_ronda_acreditar_v1(
     v_sede_id,NEW.grupo_conteo_id,NEW.id,'recount',
     NEW.recontado_at,NEW.codigos_internos
   );
 END IF;
 RETURN NEW;
END;
$body$;

CREATE FUNCTION inventario.metrics_ronda_catalogo_trigger_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE g uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
   FOR g IN
    SELECT DISTINCT id FROM (
      SELECT o.grupo_conteo_id AS id
      FROM metrics_ronda_catalog_old o
      JOIN metrics_ronda_catalog_new n USING(c_interno)
      WHERE (o.estado='Excluido') IS DISTINCT FROM (n.estado='Excluido')
         OR o.grupo_conteo_id IS DISTINCT FROM n.grupo_conteo_id
      UNION
      SELECT n.grupo_conteo_id
      FROM metrics_ronda_catalog_old o
      JOIN metrics_ronda_catalog_new n USING(c_interno)
      WHERE (o.estado='Excluido') IS DISTINCT FROM (n.estado='Excluido')
         OR o.grupo_conteo_id IS DISTINCT FROM n.grupo_conteo_id
    ) changed WHERE id IS NOT NULL
   LOOP PERFORM inventario.metrics_ronda_grupo_cambio_v1(g,clock_timestamp());END LOOP;
 ELSIF TG_OP='INSERT' THEN
   FOR g IN SELECT DISTINCT grupo_conteo_id FROM metrics_ronda_catalog_new
     WHERE grupo_conteo_id IS NOT NULL
   LOOP PERFORM inventario.metrics_ronda_grupo_cambio_v1(g,clock_timestamp()); END LOOP;
 ELSIF TG_OP='DELETE' THEN
   FOR g IN SELECT DISTINCT grupo_conteo_id FROM metrics_ronda_catalog_old
     WHERE grupo_conteo_id IS NOT NULL
   LOOP PERFORM inventario.metrics_ronda_grupo_cambio_v1(g,clock_timestamp()); END LOOP;
 END IF;
 RETURN NULL;
END;
$body$;

CREATE FUNCTION inventario.metrics_ronda_grupo_trigger_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
BEGIN
 IF TG_OP='INSERT' OR OLD.activo IS DISTINCT FROM NEW.activo THEN
  PERFORM inventario.metrics_ronda_grupo_cambio_v1(NEW.id,clock_timestamp());
 END IF;
 RETURN NEW;
END;
$body$;

CREATE TRIGGER trg_metrics_rondas_fisica_normal_v1
AFTER INSERT ON inventario.conteo_detalle FOR EACH ROW
EXECUTE FUNCTION inventario.metrics_ronda_fisica_trigger_v1();

CREATE TRIGGER trg_metrics_rondas_fisica_reconteo_v1
AFTER UPDATE OF recontado_at ON inventario.conteo_detalle FOR EACH ROW
WHEN (OLD.recontado_at IS DISTINCT FROM NEW.recontado_at
  AND NEW.recontado_at IS NOT NULL)
EXECUTE FUNCTION inventario.metrics_ronda_fisica_trigger_v1();

CREATE TRIGGER trg_metrics_rondas_catalogo_insert_v1
AFTER INSERT ON inventario.catalogo
REFERENCING NEW TABLE AS metrics_ronda_catalog_new
FOR EACH STATEMENT
EXECUTE FUNCTION inventario.metrics_ronda_catalogo_trigger_v1();

CREATE TRIGGER trg_metrics_rondas_catalogo_update_v1
AFTER UPDATE ON inventario.catalogo
REFERENCING OLD TABLE AS metrics_ronda_catalog_old
NEW TABLE AS metrics_ronda_catalog_new
FOR EACH STATEMENT
EXECUTE FUNCTION inventario.metrics_ronda_catalogo_trigger_v1();

CREATE TRIGGER trg_metrics_rondas_catalogo_delete_v1
AFTER DELETE ON inventario.catalogo
REFERENCING OLD TABLE AS metrics_ronda_catalog_old
FOR EACH STATEMENT
EXECUTE FUNCTION inventario.metrics_ronda_catalogo_trigger_v1();

CREATE TRIGGER trg_metrics_rondas_grupo_insert_v1
AFTER INSERT ON inventario.grupos_conteo FOR EACH ROW
EXECUTE FUNCTION inventario.metrics_ronda_grupo_trigger_v1();

CREATE TRIGGER trg_metrics_rondas_grupo_activo_v1
AFTER UPDATE OF activo ON inventario.grupos_conteo
FOR EACH ROW WHEN (OLD.activo IS DISTINCT FROM NEW.activo)
EXECUTE FUNCTION inventario.metrics_ronda_grupo_trigger_v1();

REVOKE ALL ON FUNCTION
 inventario.metrics_ronda_fisica_trigger_v1(),
 inventario.metrics_ronda_catalogo_trigger_v1(),
 inventario.metrics_ronda_grupo_trigger_v1()
FROM PUBLIC,anon,authenticated,service_role;
