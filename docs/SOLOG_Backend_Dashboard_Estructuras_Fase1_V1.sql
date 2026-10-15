-- SOLOG Fase 1: estructuras pasivas del Dashboard Admin.
-- Fuente funcional: docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md
-- Delta prevalente: docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md
-- Contrato tecnico: docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md
-- No altera RPC V4/ConeXion, no añade triggers operativos, no crea Cron ni datos.

CREATE FUNCTION inventario.metrics_c24_ventana_v1(
  p_variacion integer[], p_duracion_segundos integer[],
  p_ultimo_capturado_at timestamptz, p_as_of timestamptz
)
RETURNS TABLE(c24_sku numeric, intervalos_validos integer, calidad text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
  WITH piezas AS (
    SELECT p_variacion[i] AS delta,
           p_duracion_segundos[i] AS segundos,
           p_ultimo_capturado_at
             - pg_catalog.make_interval(secs => COALESCE((
                 SELECT sum(p_duracion_segundos[j])::double precision
                 FROM pg_catalog.generate_subscripts(p_duracion_segundos, 1) AS j
                 WHERE j > i
               ), 0::double precision)) AS fin_at
    FROM pg_catalog.generate_subscripts(p_variacion, 1) AS i
  ),
  vigentes AS (
    SELECT delta, segundos
    FROM piezas
    WHERE p_as_of IS NOT NULL
      AND p_ultimo_capturado_at IS NOT NULL
      AND fin_at <= p_as_of
      AND fin_at - pg_catalog.make_interval(secs => segundos::double precision)
            >= p_as_of - interval '7 days'
      AND segundos > 0
      AND delta >= 0
  ),
  resultado AS (
    SELECT count(*)::integer n,
           COALESCE(sum(delta),0)::numeric suma_delta,
           COALESCE(sum(segundos),0)::numeric suma_segundos
    FROM vigentes
  )
  SELECT CASE WHEN n >= 3 AND suma_segundos > 0
                THEN 86400::numeric * suma_delta / suma_segundos
                ELSE NULL::numeric END,
         n,
         CASE WHEN n >= 3 THEN 'medido'
              WHEN p_ultimo_capturado_at IS NOT NULL
                   AND p_as_of IS NOT NULL
                   AND p_ultimo_capturado_at < p_as_of - interval '7 days'
                THEN 'caducado'
              ELSE 'insuficiente' END
  FROM resultado;
$body$;

CREATE FUNCTION inventario.metrics_factor_c_v1(p_c24 numeric)
RETURNS smallint
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $body$
  SELECT (CASE WHEN p_c24 IS NULL OR p_c24 <= 10 THEN 1
               WHEN p_c24 <= 50 THEN 2
               ELSE 4 END)::smallint;
$body$;

CREATE FUNCTION inventario.metrics_actividad_completadas_validas_v1(
  p_habilitadas jsonb, p_completadas jsonb
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $body$
BEGIN
  IF p_habilitadas IS NULL OR p_completadas IS NULL
     OR jsonb_typeof(p_habilitadas) <> 'object'
     OR jsonb_typeof(p_completadas) <> 'object' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_completadas) AS k(clave)
    WHERE NOT p_habilitadas ? k.clave
  );
END;
$body$;

CREATE FUNCTION inventario.metrics_actividad_resumen_v1(
  p_habilitadas jsonb, p_completadas jsonb, p_retiradas jsonb
)
RETURNS TABLE(completadas integer, exigibles integer, porcentaje numeric)
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path TO ''
AS $body$
  WITH d AS (
    SELECT count(*)::integer AS exigibles
    FROM pg_catalog.jsonb_object_keys(p_habilitadas) AS k(clave)
    WHERE NOT p_retiradas ? k.clave
  ), n AS (
    SELECT count(*)::integer AS completadas
    FROM pg_catalog.jsonb_object_keys(p_completadas) AS k(clave)
    WHERE p_habilitadas ? k.clave
      AND NOT p_retiradas ? k.clave
  )
  SELECT n.completadas, d.exigibles,
         CASE WHEN d.exigibles=0 THEN NULL::numeric
              ELSE round(n.completadas::numeric * 100 / d.exigibles, 1) END
  FROM n CROSS JOIN d;
$body$;

CREATE TABLE inventario.metrics_movimiento_sku (
  sede_id uuid NOT NULL REFERENCES public.sedes(id),
  c_interno integer NOT NULL REFERENCES inventario.catalogo(c_interno),
  variacion_stock integer[] NOT NULL DEFAULT '{}'::integer[],
  duracion_intervalo integer[] NOT NULL DEFAULT '{}'::integer[],
  ultimo_stock integer,
  ultimo_snapshot_id uuid,
  ultimo_capturado_at timestamptz,
  c24_sku numeric,
  estado_calidad text NOT NULL DEFAULT 'base',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metrics_movimiento_sku_pkey PRIMARY KEY(sede_id,c_interno),
  CONSTRAINT metrics_movimiento_arrays_validos CHECK (
    cardinality(variacion_stock)=cardinality(duracion_intervalo)
    AND cardinality(variacion_stock)<=5
    AND COALESCE(array_ndims(variacion_stock),1)=1
    AND COALESCE(array_ndims(duracion_intervalo),1)=1
    AND array_position(variacion_stock,NULL) IS NULL
    AND array_position(duracion_intervalo,NULL) IS NULL
    AND 0 <= ALL(variacion_stock)
    AND 0 < ALL(duracion_intervalo)
  ),
  CONSTRAINT metrics_movimiento_base_coherente CHECK (
    (ultimo_stock IS NULL AND ultimo_snapshot_id IS NULL AND ultimo_capturado_at IS NULL)
    OR (ultimo_stock IS NOT NULL AND ultimo_snapshot_id IS NOT NULL AND ultimo_capturado_at IS NOT NULL)
  ),
  CONSTRAINT metrics_movimiento_calidad_valida CHECK (
    estado_calidad IN ('base','insuficiente','medido','invalidado')
    AND (c24_sku IS NULL OR c24_sku>=0)
    AND (estado_calidad='medido')=(c24_sku IS NOT NULL)
    AND (estado_calidad<>'medido' OR cardinality(variacion_stock)>=3)
    AND (estado_calidad<>'invalidado' OR (
      ultimo_stock IS NULL AND ultimo_snapshot_id IS NULL
      AND ultimo_capturado_at IS NULL AND c24_sku IS NULL
      AND cardinality(variacion_stock)=0))
  )
);

CREATE TABLE inventario.metrics_calibracion_c24 (
  muestreo_at timestamptz NOT NULL,
  sede_id uuid NOT NULL REFERENCES public.sedes(id),
  c_interno integer NOT NULL,
  grupo_conteo_id uuid,
  c24_sku numeric,
  intervalos_validos smallint NOT NULL DEFAULT 0,
  calidad text NOT NULL,
  ultimo_capturado_at timestamptz,
  CONSTRAINT metrics_calibracion_c24_pkey PRIMARY KEY(muestreo_at,sede_id,c_interno),
  CONSTRAINT metrics_calibracion_c24_valida CHECK (
    intervalos_validos BETWEEN 0 AND 5
    AND calidad IN ('medido','insuficiente','caducado','invalidado')
    AND (c24_sku IS NULL OR c24_sku>=0)
    AND (calidad='medido')=(c24_sku IS NOT NULL)
    AND (calidad<>'medido' OR intervalos_validos>=3)
  )
);
CREATE INDEX metrics_calibracion_c24_sede_muestreo_group_idx
  ON inventario.metrics_calibracion_c24(sede_id,muestreo_at,grupo_conteo_id);

CREATE TABLE inventario.metrics_diferencias (
  sede_id uuid NOT NULL REFERENCES public.sedes(id),
  grupo_conteo_id uuid NOT NULL REFERENCES inventario.grupos_conteo(id),
  estado_confirmado text,
  diferencia_confirmada integer,
  valor_diferencia_confirmada numeric,
  observacion_confirmacion_id uuid,
  origen_confirmacion text,
  confirmado_fisico_at timestamptz,
  stock_teorico_confirmacion integer,
  stock_fisico_confirmacion integer,
  precio_confirmacion numeric,
  factor_v_riesgo smallint,
  validacion_tipo text NOT NULL DEFAULT 'none',
  validacion_observacion_id uuid,
  comparable boolean NOT NULL DEFAULT false,
  calidad text NOT NULL DEFAULT 'no_data',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metrics_diferencias_pkey PRIMARY KEY(sede_id,grupo_conteo_id),
  CONSTRAINT metrics_diferencias_estados CHECK (
    (estado_confirmado IS NULL OR estado_confirmado IN ('Coincide','Confirmada'))
    AND (origen_confirmacion IS NULL OR origen_confirmacion IN ('normal','recount'))
    AND validacion_tipo IN ('none','recontar','inconsistente','estructura')
    AND calidad IN ('no_data','complete','partial','invalid')
    AND (factor_v_riesgo IS NULL OR factor_v_riesgo IN (1,3,5))
    AND (precio_confirmacion IS NULL OR precio_confirmacion >= 0)
    AND (
      estado_confirmado IS NULL
      OR (diferencia_confirmada IS NOT NULL
          AND observacion_confirmacion_id IS NOT NULL
          AND confirmado_fisico_at IS NOT NULL)
    )
  )
);
CREATE INDEX metrics_diferencias_validacion_sede_idx
  ON inventario.metrics_diferencias(sede_id,validacion_tipo)
  WHERE validacion_tipo <> 'none';

CREATE TABLE inventario.metrics_episodios (
  episodio_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id uuid NOT NULL REFERENCES public.sedes(id),
  grupo_conteo_id uuid NOT NULL REFERENCES inventario.grupos_conteo(id),
  apertura_at timestamptz NOT NULL,
  cierre_at timestamptz,
  observacion_apertura_id uuid NOT NULL,
  observacion_cierre_id uuid,
  ultima_observacion_at timestamptz NOT NULL,
  secuencia integer NOT NULL,
  operativamente_visible_desde timestamptz,
  calidad text NOT NULL DEFAULT 'complete',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metrics_episodios_rango CHECK (
    secuencia >= 1
    AND ultima_observacion_at>=apertura_at
    AND (cierre_at IS NULL OR cierre_at>=apertura_at)
    AND (cierre_at IS NULL OR ultima_observacion_at<=cierre_at)
    AND calidad IN ('complete','partial','invalid')
  ),
  CONSTRAINT metrics_episodios_secuencia_unica UNIQUE(sede_id,grupo_conteo_id,secuencia)
);
CREATE UNIQUE INDEX metrics_episodios_un_abierto_idx
  ON inventario.metrics_episodios(sede_id,grupo_conteo_id) WHERE cierre_at IS NULL;
CREATE INDEX metrics_episodios_sede_grupo_apertura_idx
  ON inventario.metrics_episodios(sede_id,grupo_conteo_id,apertura_at DESC);
CREATE INDEX metrics_episodios_sede_cierre_idx
  ON inventario.metrics_episodios(sede_id,cierre_at) WHERE cierre_at IS NOT NULL;

CREATE TABLE inventario.metrics_rondas (
  sede_id uuid NOT NULL REFERENCES public.sedes(id),
  ronda_desde timestamptz NOT NULL,
  ronda_hasta timestamptz NOT NULL,
  periodo_desde date NOT NULL,
  periodo_hasta date NOT NULL,
  ronda smallint NOT NULL,
  estado text NOT NULL DEFAULT 'abierta',
  total_exigibles integer NOT NULL DEFAULT 0,
  total_acreditadas integer NOT NULL DEFAULT 0,
  hito_50_at timestamptz,
  hito_90_at timestamptz,
  hito_100_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cerrado_at timestamptz,
  CONSTRAINT metrics_rondas_pkey PRIMARY KEY(sede_id,ronda_desde),
  CONSTRAINT metrics_rondas_validacion CHECK (
    ronda_hasta>ronda_desde
    AND periodo_hasta>=periodo_desde
    AND ronda IN (1,2)
    AND estado IN ('abierta','cerrando','cerrada','sin_datos')
    AND total_exigibles>=0
    AND total_acreditadas>=0
    AND total_acreditadas<=total_exigibles
    AND (hito_90_at IS NULL OR hito_50_at IS NOT NULL)
    AND (hito_100_at IS NULL OR hito_90_at IS NOT NULL)
    AND (hito_90_at IS NULL OR hito_90_at>=hito_50_at)
    AND (hito_100_at IS NULL OR hito_100_at>=hito_90_at)
  )
);
CREATE INDEX metrics_rondas_sede_fecha_idx
  ON inventario.metrics_rondas(sede_id,ronda_desde DESC);

CREATE TABLE inventario.metrics_ronda_obligaciones (
  sede_id uuid NOT NULL,
  ronda_desde timestamptz NOT NULL,
  grupo_conteo_id uuid NOT NULL REFERENCES inventario.grupos_conteo(id),
  generacion integer NOT NULL,
  vigente_desde timestamptz NOT NULL,
  vigente_hasta timestamptz,
  exigible boolean NOT NULL,
  composicion_fingerprint text,
  acreditada_at timestamptz,
  observacion_id uuid,
  tipo_observacion text,
  turno_contribuyente text,
  estado_calidad text NOT NULL DEFAULT 'no_data',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metrics_ronda_obligaciones_pkey
    PRIMARY KEY(sede_id,ronda_desde,grupo_conteo_id,generacion),
  CONSTRAINT metrics_ronda_obligaciones_ronda_fk
    FOREIGN KEY(sede_id,ronda_desde)
    REFERENCES inventario.metrics_rondas(sede_id,ronda_desde),
  CONSTRAINT metrics_ronda_obligaciones_validacion CHECK (
    generacion>=1
    AND (vigente_hasta IS NULL OR vigente_hasta>vigente_desde)
    AND (tipo_observacion IS NULL OR tipo_observacion IN ('normal','recount'))
    AND (turno_contribuyente IS NULL OR turno_contribuyente IN ('early','day','night'))
    AND estado_calidad IN ('no_data','complete','partial','invalid')
    AND ((acreditada_at IS NULL AND observacion_id IS NULL
          AND tipo_observacion IS NULL AND turno_contribuyente IS NULL)
      OR (acreditada_at IS NOT NULL AND observacion_id IS NOT NULL
          AND tipo_observacion IS NOT NULL AND turno_contribuyente IS NOT NULL))
  )
);
CREATE UNIQUE INDEX metrics_ronda_obligaciones_una_vigente_idx
  ON inventario.metrics_ronda_obligaciones(sede_id,ronda_desde,grupo_conteo_id)
  WHERE vigente_hasta IS NULL;
CREATE INDEX metrics_ronda_obligaciones_vigencia_idx
  ON inventario.metrics_ronda_obligaciones(sede_id,ronda_desde,vigente_desde,vigente_hasta);

CREATE TABLE inventario.metrics_rondas_cortes (
  sede_id uuid NOT NULL,
  ronda_desde timestamptz NOT NULL,
  version_corte smallint NOT NULL,
  corte_at timestamptz NOT NULL,
  generado_at timestamptz NOT NULL DEFAULT now(),
  estado_corte text NOT NULL,
  motivo_calidad text,
  h_g integer, h_r integer, h_z integer, h_s integer, h_t integer, h_u integer,
  cobertura_acreditadas integer,
  cobertura_exigibles integer,
  contribucion_turnos jsonb NOT NULL DEFAULT '{}'::jsonb,
  hitos_at jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidencia_grupos jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT metrics_rondas_cortes_pkey PRIMARY KEY(sede_id,ronda_desde,version_corte),
  CONSTRAINT metrics_rondas_cortes_ronda_fk
    FOREIGN KEY(sede_id,ronda_desde)
    REFERENCES inventario.metrics_rondas(sede_id,ronda_desde),
  CONSTRAINT metrics_rondas_cortes_estado CHECK (
    version_corte>=1
    AND estado_corte IN ('valido','nd','corregido')
    AND jsonb_typeof(contribucion_turnos)='object'
    AND jsonb_typeof(hitos_at)='object'
    AND jsonb_typeof(evidencia_grupos)='array'
    AND (
      (estado_corte='nd'
       AND h_g IS NULL AND h_r IS NULL AND h_z IS NULL
       AND h_s IS NULL AND h_t IS NULL AND h_u IS NULL
       AND cobertura_acreditadas IS NULL AND cobertura_exigibles IS NULL)
      OR
      (estado_corte IN ('valido','corregido')
       AND h_g>=0 AND h_r>=0 AND h_z>=0 AND h_s>=0
       AND h_t>=0 AND h_u>=0
       AND h_t=h_g+h_r+h_z+h_s
       AND h_u=h_g+h_r
       AND cobertura_exigibles>=0 AND cobertura_acreditadas>=0
       AND cobertura_acreditadas<=cobertura_exigibles)
    )
  )
);
CREATE INDEX metrics_rondas_cortes_recientes_idx
  ON inventario.metrics_rondas_cortes(sede_id,ronda_desde DESC,version_corte DESC);

CREATE TABLE inventario.metrics_actividad_turnos (
  sede_id uuid NOT NULL REFERENCES public.sedes(id),
  turno_desde timestamptz NOT NULL,
  turno_hasta timestamptz NOT NULL,
  turno text NOT NULL,
  prioridad_actual text NOT NULL DEFAULT 'none',
  grupos_cobertura integer NOT NULL DEFAULT 0,
  grupos_reconteo_cobertura integer NOT NULL DEFAULT 0,
  grupos_reconteo_regular integer NOT NULL DEFAULT 0,
  grupos_cobertura_turno integer NOT NULL DEFAULT 0,
  tareas_habilitadas jsonb NOT NULL DEFAULT '{}'::jsonb,
  tareas_completadas jsonb NOT NULL DEFAULT '{}'::jsonb,
  tareas_retiradas jsonb NOT NULL DEFAULT '{}'::jsonb,
  transiciones_prioridad jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado text NOT NULL DEFAULT 'en_curso',
  calidad text NOT NULL DEFAULT 'no_data',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cerrado_at timestamptz,
  CONSTRAINT metrics_actividad_turnos_pkey PRIMARY KEY(sede_id,turno_desde),
  CONSTRAINT metrics_actividad_turnos_valida CHECK (
    turno_hasta>turno_desde
    AND turno IN ('early','day','night')
    AND prioridad_actual IN
      ('round_coverage','review_for_coverage','review_regular','shift_coverage','none')
    AND grupos_cobertura>=0
    AND grupos_reconteo_cobertura>=0
    AND grupos_reconteo_regular>=0
    AND grupos_cobertura_turno>=0
    AND estado IN ('en_curso','cerrado_provisional','cerrado')
    AND calidad IN ('no_data','complete','partial')
    AND jsonb_typeof(tareas_habilitadas)='object'
    AND jsonb_typeof(tareas_completadas)='object'
    AND jsonb_typeof(tareas_retiradas)='object'
    AND jsonb_typeof(transiciones_prioridad)='array'
    AND inventario.metrics_actividad_completadas_validas_v1(
      tareas_habilitadas,tareas_completadas
    )
  )
);
CREATE INDEX metrics_actividad_sede_turno_idx
  ON inventario.metrics_actividad_turnos(sede_id,turno_desde DESC);

CREATE FUNCTION inventario.metrics_movimiento_c24_efectivo_v1(
  p_sede_id uuid, p_c_interno integer, p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE(c24_sku numeric, intervalos_validos integer, calidad text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $body$
  SELECT CASE WHEN m.estado_calidad='invalidado' THEN NULL::numeric
              ELSE v.c24_sku END,
         COALESCE(v.intervalos_validos,0),
         CASE WHEN m.estado_calidad='invalidado' THEN 'invalidado'
              WHEN m.sede_id IS NULL THEN 'insuficiente'
              ELSE v.calidad END
  FROM (SELECT 1) AS root
  LEFT JOIN inventario.metrics_movimiento_sku AS m
    ON m.sede_id=p_sede_id AND m.c_interno=p_c_interno
  LEFT JOIN LATERAL inventario.metrics_c24_ventana_v1(
    m.variacion_stock,m.duracion_intervalo,m.ultimo_capturado_at,p_as_of
  ) AS v ON true;
$body$;

-- Defensa en profundidad. Ningún cliente obtiene acceso directo.
ALTER TABLE inventario.metrics_movimiento_sku ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.metrics_calibracion_c24 ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.metrics_diferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.metrics_episodios ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.metrics_rondas ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.metrics_ronda_obligaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.metrics_rondas_cortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario.metrics_actividad_turnos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  inventario.metrics_movimiento_sku,
  inventario.metrics_calibracion_c24,
  inventario.metrics_diferencias,
  inventario.metrics_episodios,
  inventario.metrics_rondas,
  inventario.metrics_ronda_obligaciones,
  inventario.metrics_rondas_cortes,
  inventario.metrics_actividad_turnos
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  inventario.metrics_c24_ventana_v1(integer[],integer[],timestamptz,timestamptz),
  inventario.metrics_factor_c_v1(numeric),
  inventario.metrics_actividad_completadas_validas_v1(jsonb,jsonb),
  inventario.metrics_actividad_resumen_v1(jsonb,jsonb,jsonb),
  inventario.metrics_movimiento_c24_efectivo_v1(uuid,integer,timestamptz)
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE inventario.metrics_calibracion_c24 IS
  'SOLOG: auxiliar efimera de calibracion C, independiente y eliminable. No debe alimentar RPC operativas.';
COMMENT ON TABLE inventario.metrics_actividad_turnos IS
  'SOLOG: un acumulador por sede/turno; prioridad runtime y tareas habilitadas reales, sin escrituras hasta Fase 4.';
COMMENT ON TABLE inventario.metrics_rondas_cortes IS
  'SOLOG: cortes as-of por version, no reconstruir historicos con el estado mutado actual.';
