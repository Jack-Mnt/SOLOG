-- Distingue snapshot procesado y referencia comparable; ausente nunca equivale a stock 0 medido.
ALTER TABLE inventario.metrics_movimiento_sku
 ADD COLUMN ultimo_snapshot_procesado_id uuid;
COMMENT ON COLUMN inventario.metrics_movimiento_sku.ultimo_snapshot_procesado_id
 IS 'Idempotencia de ingesta, aun cuando producto_ausente invalida la ultima referencia comparable.';

-- SOLOG Fase 2: la misma captura no recalcula intervalos ni borra la ventana en llamadas repetidas.
CREATE OR REPLACE FUNCTION inventario.metrics_movimiento_aplicar_snapshot_v1(p_snapshot_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE
  v_sede_id uuid;
  v_capturado_at timestamptz;
  v_version_catalogo integer;
  v_actualizados integer;
BEGIN
  SELECT s.sede_id,s.capturado_at,s.version_catalogo
  INTO v_sede_id,v_capturado_at,v_version_catalogo
  FROM inventario.snapshots s
  WHERE s.id=p_snapshot_id AND s.estado='procesando';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLOG_METRICS_SNAPSHOT_NOT_PROCESSING';
  END IF;

  -- Precondición estructural: no calcular variaciones tras reemplazar stock_actual.
  IF EXISTS(
    SELECT 1 FROM inventario.stock_actual a
    WHERE a.sede_id=v_sede_id AND a.snapshot_id=p_snapshot_id
  ) THEN
    RAISE EXCEPTION 'SOLOG_METRICS_SNAPSHOT_STOCK_ALREADY_APPLIED';
  END IF;

  WITH entrantes AS MATERIALIZED (
    SELECT ss.c_interno,ss.stock,ss.producto_eliminado,
           v_sede_id AS sede_id, v_capturado_at AS capturado_at,
           p_snapshot_id AS snapshot_id
    FROM inventario.snapshot_stock ss
    JOIN inventario.catalogo_version_skus cvs
      ON cvs.version=v_version_catalogo
     AND cvs.c_interno=ss.c_interno
     AND cvs.estado='incluido'
    JOIN inventario.catalogo c ON c.c_interno=ss.c_interno
     AND c.estado<>'Excluido'
    WHERE ss.snapshot_id=p_snapshot_id
      AND NOT EXISTS(
        SELECT 1 FROM inventario.metrics_movimiento_sku already
        WHERE already.sede_id=v_sede_id AND already.c_interno=ss.c_interno
          AND already.ultimo_snapshot_procesado_id=p_snapshot_id
      )
  ),
  antecedentes AS (
    SELECT e.*,
           m.ultimo_stock,m.ultimo_snapshot_id,m.ultimo_capturado_at,
           m.variacion_stock,m.duracion_intervalo,
           sa.stock AS stock_anterior,sa.snapshot_id AS snapshot_anterior,
           sa.observed_at AS captura_anterior,
           sa.producto_eliminado AS anterior_no_observado,
           (
             NOT e.producto_eliminado
             AND m.ultimo_stock IS NOT NULL
             AND sa.snapshot_id=m.ultimo_snapshot_id
             AND sa.observed_at=m.ultimo_capturado_at
             AND sa.producto_eliminado IS FALSE
             AND e.capturado_at>m.ultimo_capturado_at
             AND abs(e.stock::bigint-m.ultimo_stock::bigint)<=2147483647::bigint
           ) IS TRUE AS comparable
    FROM entrantes e
    LEFT JOIN inventario.metrics_movimiento_sku m
      ON m.sede_id=e.sede_id AND m.c_interno=e.c_interno
    LEFT JOIN inventario.stock_actual sa
      ON sa.sede_id=e.sede_id AND sa.c_interno=e.c_interno
  ),
  arrays AS (
    SELECT a.*,
      CASE WHEN a.comparable THEN
        coalesce(a.variacion_stock,'{}'::integer[])
        || ARRAY[abs(a.stock::bigint-a.ultimo_stock::bigint)::integer]
      ELSE '{}'::integer[] END AS deltas_ext,
      CASE WHEN a.comparable THEN
        coalesce(a.duracion_intervalo,'{}'::integer[])
        || ARRAY[extract(epoch FROM (a.capturado_at-a.ultimo_capturado_at))::integer]
      ELSE '{}'::integer[] END AS segundos_ext
    FROM antecedentes a
  ),
  preparados AS (
    SELECT a.*,
      ARRAY(
        SELECT x.v FROM pg_catalog.unnest(a.deltas_ext)
        WITH ORDINALITY AS x(v,pos)
        WHERE x.pos>greatest(pg_catalog.cardinality(a.deltas_ext)-5,0)
        ORDER BY x.pos
      ) AS deltas5,
      ARRAY(
        SELECT x.v FROM pg_catalog.unnest(a.segundos_ext)
        WITH ORDINALITY AS x(v,pos)
        WHERE x.pos>greatest(pg_catalog.cardinality(a.segundos_ext)-5,0)
        ORDER BY x.pos
      ) AS segundos5
    FROM arrays a
  )
  INSERT INTO inventario.metrics_movimiento_sku(
    sede_id,c_interno,variacion_stock,duracion_intervalo,
    ultimo_stock,ultimo_snapshot_id,ultimo_capturado_at,
    ultimo_snapshot_procesado_id,c24_sku,estado_calidad,updated_at
  )
  SELECT p.sede_id,p.c_interno,p.deltas5,p.segundos5,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.stock END,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.snapshot_id END,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.capturado_at END,
         p.snapshot_id,
         CASE WHEN p.producto_eliminado THEN NULL ELSE c.c24_sku END,
         CASE WHEN p.producto_eliminado THEN 'insuficiente'
              WHEN pg_catalog.cardinality(p.deltas5)=0 THEN 'base'
              WHEN c.c24_sku IS NULL THEN 'insuficiente'
              ELSE 'medido' END,
         pg_catalog.clock_timestamp()
  FROM preparados p
  CROSS JOIN LATERAL inventario.metrics_c24_ventana_v1(
    p.deltas5,p.segundos5,
    CASE WHEN p.producto_eliminado THEN NULL ELSE p.capturado_at END,
    p.capturado_at
  ) c
  ON CONFLICT(sede_id,c_interno) DO UPDATE SET
    variacion_stock=EXCLUDED.variacion_stock,
    duracion_intervalo=EXCLUDED.duracion_intervalo,
    ultimo_stock=EXCLUDED.ultimo_stock,
    ultimo_snapshot_id=EXCLUDED.ultimo_snapshot_id,
    ultimo_capturado_at=EXCLUDED.ultimo_capturado_at,
    ultimo_snapshot_procesado_id=EXCLUDED.ultimo_snapshot_procesado_id,
    c24_sku=EXCLUDED.c24_sku,
    estado_calidad=EXCLUDED.estado_calidad,
    updated_at=EXCLUDED.updated_at;

  GET DIAGNOSTICS v_actualizados=ROW_COUNT;
  RETURN v_actualizados;
END;
$body$;


-- Un SKU excluido o reincorporado pierde toda su referencia previa de Movimiento.
CREATE OR REPLACE FUNCTION inventario.metrics_movimiento_catalogo_estado_hook_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado
     AND (OLD.estado='Excluido' OR NEW.estado='Excluido') THEN
    UPDATE inventario.metrics_movimiento_sku m
    SET variacion_stock='{}'::integer[],
        duracion_intervalo='{}'::integer[],
        ultimo_stock=NULL,ultimo_snapshot_id=NULL,ultimo_capturado_at=NULL,
        ultimo_snapshot_procesado_id=NULL,
        c24_sku=NULL,estado_calidad='invalidado',
        updated_at=pg_catalog.clock_timestamp()
    WHERE m.c_interno=NEW.c_interno;
  END IF;
  RETURN NEW;
END;
$body$;