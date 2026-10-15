-- SOLOG Fase 3D — backfill inicial SOLO de hechos físicos disponibles.
-- Preserva conteos/snapshots V5; no fabrica cronología ni confirmaciones por snapshot.
-- Los resultados de catálogo actuales condicionan comparabilidad.
-- No poblar episodios históricos no sustentados: se derivan de d0/dr fechados.

INSERT INTO inventario.metrics_diferencias AS dst (
  sede_id,grupo_conteo_id,estado_confirmado,factor_v_riesgo,
  validacion_tipo,comparable,calidad
)
SELECT
 s.id,g.id,NULL::text,
 CASE WHEN g.precio IS NULL OR g.precio<0 THEN NULL::smallint
      WHEN g.precio<=14 THEN 1::smallint
      WHEN g.precio<40 THEN 3::smallint
      ELSE 5::smallint END,
 'none',false,
 CASE WHEN g.activo AND EXISTS(
   SELECT 1 FROM inventario.catalogo c
   WHERE c.grupo_conteo_id=g.id AND c.estado<>'Excluido'
 ) THEN 'no_data' ELSE 'invalid' END
FROM public.sedes s CROSS JOIN inventario.grupos_conteo g
ON CONFLICT(sede_id,grupo_conteo_id) DO NOTHING;

DO $body$
DECLARE g record;
BEGIN
  FOR g IN
    SELECT DISTINCT co.sede_id,cd.grupo_conteo_id
    FROM inventario.conteo_detalle cd
    JOIN inventario.conteos co ON co.id=cd.conteo_id
    ORDER BY co.sede_id,cd.grupo_conteo_id
  LOOP
    PERFORM inventario.metrics_diferencias_reconciliar_v1(g.sede_id,g.grupo_conteo_id);
    PERFORM inventario.metrics_episodios_reconciliar_v1(g.sede_id,g.grupo_conteo_id);
  END LOOP;
END;
$body$;
