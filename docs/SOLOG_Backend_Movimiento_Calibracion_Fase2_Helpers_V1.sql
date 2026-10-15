-- SOLOG Dashboard Fase 2A. Funciones internas sin conexiones operativas.
-- La integración del lote ConeXion y la activación Cron van en migraciones posteriores.

CREATE FUNCTION inventario.metrics_movimiento_aplicar_snapshot_v1(p_snapshot_id uuid)
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
    c24_sku,estado_calidad,updated_at
  )
  SELECT p.sede_id,p.c_interno,p.deltas5,p.segundos5,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.stock END,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.snapshot_id END,
         CASE WHEN p.producto_eliminado THEN NULL ELSE p.capturado_at END,
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
    c24_sku=EXCLUDED.c24_sku,
    estado_calidad=EXCLUDED.estado_calidad,
    updated_at=EXCLUDED.updated_at;

  GET DIAGNOSTICS v_actualizados=ROW_COUNT;
  RETURN v_actualizados;
END;
$body$;

CREATE FUNCTION inventario.metrics_movimiento_snapshot_stock_hook_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE v_id uuid;
BEGIN
  IF TG_OP<>'INSERT' OR TG_LEVEL<>'STATEMENT' THEN
    RAISE EXCEPTION 'SOLOG_METRICS_INVALID_TRIGGER_CONTEXT';
  END IF;
  FOR v_id IN
    SELECT DISTINCT n.snapshot_id
    FROM metrics_new_snapshot_rows n
    JOIN inventario.snapshots s ON s.id=n.snapshot_id
    WHERE s.estado='procesando'
  LOOP
    PERFORM inventario.metrics_movimiento_aplicar_snapshot_v1(v_id);
  END LOOP;
  RETURN NULL;
END;
$body$;

CREATE FUNCTION inventario.metrics_movimiento_catalogo_estado_hook_v1()
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
        c24_sku=NULL,estado_calidad='invalidado',
        updated_at=pg_catalog.clock_timestamp()
    WHERE m.c_interno=NEW.c_interno;
  END IF;
  RETURN NEW;
END;
$body$;

CREATE FUNCTION inventario.metrics_movimiento_grupo_v1(
  p_sede_id uuid,p_grupo_conteo_id uuid,p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE(c24_grupo numeric, factor_c smallint, calidad text,
  sku_medidos integer,sku_incluidos integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
  WITH miembros AS (
    SELECT c.c_interno FROM inventario.catalogo c
    JOIN inventario.grupos_conteo g ON g.id=c.grupo_conteo_id
    WHERE c.grupo_conteo_id=p_grupo_conteo_id
      AND c.estado<>'Excluido' AND g.activo
  ), mediciones AS (
    SELECT v.c24_sku FROM miembros m
    CROSS JOIN LATERAL inventario.metrics_movimiento_c24_efectivo_v1(
      p_sede_id,m.c_interno,p_as_of
    ) v
  ), agg AS (
    SELECT count(*)::integer AS total,
           count(c24_sku)::integer AS medidos,
           sum(c24_sku) AS c24
    FROM mediciones
  )
  SELECT a.c24,
         inventario.metrics_factor_c_v1(a.c24),
         CASE WHEN a.medidos=0 THEN 'insuficiente'
              WHEN a.medidos<a.total THEN 'parcial'
              ELSE 'completa' END,
         a.medidos,a.total
  FROM agg a;
$body$;

CREATE FUNCTION inventario.metrics_calibracion_c24_tomar_muestra(
  p_at timestamptz DEFAULT pg_catalog.clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE
  v_slot timestamptz;
  v_insertados integer;
BEGIN
  IF p_at IS NULL OR p_at>pg_catalog.clock_timestamp()+interval '5 minutes' THEN
    RAISE EXCEPTION 'SOLOG_CALIBRATION_INVALID_TIMESTAMP';
  END IF;
  -- Slot fijo 6h a HH:05 Lima. Un mismo slot se registra una vez.
  v_slot:=pg_catalog.date_bin('6 hours',p_at,
    '2000-01-01 05:05:00+00'::timestamptz);
  INSERT INTO inventario.metrics_calibracion_c24(
    muestreo_at,sede_id,c_interno,grupo_conteo_id,c24_sku,
    intervalos_validos,calidad,ultimo_capturado_at
  )
  SELECT v_slot,m.sede_id,m.c_interno,c.grupo_conteo_id,
         e.c24_sku,e.intervalos_validos,
         CASE WHEN m.estado_calidad='invalidado' THEN 'invalidado'
              ELSE e.calidad END,
         m.ultimo_capturado_at
  FROM inventario.metrics_movimiento_sku m
  JOIN inventario.catalogo c ON c.c_interno=m.c_interno
    AND c.estado<>'Excluido'
  CROSS JOIN LATERAL inventario.metrics_movimiento_c24_efectivo_v1(
    m.sede_id,m.c_interno,p_at
  ) e
  ON CONFLICT(muestreo_at,sede_id,c_interno) DO NOTHING;
  GET DIAGNOSTICS v_insertados=ROW_COUNT;
  RETURN v_insertados;
END;
$body$;

REVOKE ALL ON FUNCTION
  inventario.metrics_movimiento_aplicar_snapshot_v1(uuid),
  inventario.metrics_movimiento_snapshot_stock_hook_v1(),
  inventario.metrics_movimiento_catalogo_estado_hook_v1(),
  inventario.metrics_movimiento_grupo_v1(uuid,uuid,timestamptz),
  inventario.metrics_calibracion_c24_tomar_muestra(timestamptz)
FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON FUNCTION inventario.metrics_movimiento_aplicar_snapshot_v1(uuid)
IS 'SOLOG: solo durante estado procesando, antes de stock_actual, en transaccion ConeXion.';
COMMENT ON FUNCTION inventario.metrics_calibracion_c24_tomar_muestra(timestamptz)
IS 'SOLOG: solo inserta muestras en tabla auxiliar, no modifica proyecciones, D/V/R ni datos operativos.';
