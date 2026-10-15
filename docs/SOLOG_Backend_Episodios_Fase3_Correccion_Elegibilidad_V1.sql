-- SOLOG Fase 3B — episodios físicos con apertura/cierre verificables.
-- Reconciliación LOCAL por sede+grupo a partir de hechos originales;
-- proyección idempotente con UUID determinista por observación de apertura.

CREATE OR REPLACE FUNCTION inventario.metrics_episodios_reconciliar_v1(
 p_sede_id uuid,p_grupo_id uuid
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE
  ev record;
  v_eligible boolean;
  v_codes integer[];
  v_price numeric;
  v_prev_id uuid;
  v_prev_visible timestamptz;
  v_prev_last timestamptz;
  v_open_id uuid;
  v_last_at timestamptz;
  v_last_codes integer[];
  v_seq integer:=0;
BEGIN
  SELECT elegible,codigos_internos,precio_unitario
  INTO v_eligible,v_codes,v_price
  FROM inventario.metrics_grupo_elegibilidad_v1(p_grupo_id);
  IF NOT EXISTS(SELECT 1 FROM public.sedes WHERE id=p_sede_id)
    OR NOT EXISTS(SELECT 1 FROM inventario.grupos_conteo WHERE id=p_grupo_id)
  THEN RAISE EXCEPTION 'SOLOG_METRICS_UNKNOWN_GROUP_OR_SITE'; END IF;

  -- Con el lock de escritura por sede que ya toma V5, este bloqueo de
  -- proyección asegura consistencia de re-ejecuciones para la misma pareja.
  PERFORM 1 FROM inventario.metrics_diferencias d
  WHERE d.sede_id=p_sede_id AND d.grupo_conteo_id=p_grupo_id FOR UPDATE;

  SELECT e.episodio_id,e.operativamente_visible_desde,e.ultima_observacion_at
  INTO v_prev_id,v_prev_visible,v_prev_last
  FROM inventario.metrics_episodios e
  WHERE e.sede_id=p_sede_id AND e.grupo_conteo_id=p_grupo_id
    AND e.cierre_at IS NULL;

  DELETE FROM inventario.metrics_episodios e
  WHERE e.sede_id=p_sede_id AND e.grupo_conteo_id=p_grupo_id;

  FOR ev IN
    WITH physical AS (
      SELECT cd.id,cd.contado_at physical_at,0 AS order_kind,
        cd.stock_fisico::bigint-cd.stock_teorico::bigint delta,
        cd.codigos_internos
      FROM inventario.conteo_detalle cd
      JOIN inventario.conteos co ON co.id=cd.conteo_id
      WHERE co.sede_id=p_sede_id AND cd.grupo_conteo_id=p_grupo_id
      UNION ALL
      SELECT cd.id,cd.recontado_at,1,
        cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint,
        cd.codigos_internos
      FROM inventario.conteo_detalle cd
      JOIN inventario.conteos co
        ON co.id=coalesce(cd.reconteo_conteo_id,cd.conteo_id)
      WHERE co.sede_id=p_sede_id AND cd.grupo_conteo_id=p_grupo_id
        AND cd.recontado_at IS NOT NULL AND cd.stock_reconteo IS NOT NULL
        AND cd.stock_teorico_reconteo IS NOT NULL
    )
    SELECT id,physical_at,order_kind,delta,codigos_internos
    FROM physical ORDER BY physical_at,order_kind,id
  LOOP
    v_last_at:=ev.physical_at;
    v_last_codes:=ev.codigos_internos;

    IF ev.delta<>0 THEN
      IF v_open_id IS NULL THEN
        v_seq:=v_seq+1;
        v_open_id:=md5(
          p_sede_id::text||'|'||p_grupo_id::text||'|'||
          ev.id::text||'|'||ev.order_kind::text
        )::uuid;
        INSERT INTO inventario.metrics_episodios(
          episodio_id,sede_id,grupo_conteo_id,
          apertura_at,observacion_apertura_id,ultima_observacion_at,
          secuencia,operativamente_visible_desde,calidad
        ) VALUES(
          v_open_id,p_sede_id,p_grupo_id,ev.physical_at,
          ev.id,ev.physical_at,v_seq,NULL,
          'complete'
        );
      ELSE
        UPDATE inventario.metrics_episodios
        SET ultima_observacion_at=ev.physical_at,updated_at=pg_catalog.clock_timestamp()
        WHERE episodio_id=v_open_id;
      END IF;
    ELSIF v_open_id IS NOT NULL THEN
      UPDATE inventario.metrics_episodios
      SET cierre_at=ev.physical_at,
          observacion_cierre_id=ev.id,
          ultima_observacion_at=ev.physical_at,
          updated_at=pg_catalog.clock_timestamp()
      WHERE episodio_id=v_open_id;
      v_open_id:=NULL;
    END IF;
  END LOOP;

  -- Excluir/inactivar nunca cierra episodio físico. Rehabilitar NO
  -- resucita un episodio antiguo si no hubo nueva observación compatible.
  IF v_open_id IS NOT NULL AND coalesce(v_eligible,false)
     AND v_last_codes IS NOT DISTINCT FROM v_codes THEN
    IF v_prev_id=v_open_id THEN
      IF v_prev_visible IS NOT NULL THEN
        UPDATE inventario.metrics_episodios
        SET operativamente_visible_desde=v_prev_visible
        WHERE episodio_id=v_open_id;
      ELSIF v_prev_last IS NOT NULL AND v_last_at>v_prev_last THEN
        UPDATE inventario.metrics_episodios
        SET operativamente_visible_desde=v_last_at
        WHERE episodio_id=v_open_id;
      END IF;
    ELSE
      UPDATE inventario.metrics_episodios
      SET operativamente_visible_desde=apertura_at
      WHERE episodio_id=v_open_id;
    END IF;
  END IF;

  RETURN v_seq;
END;
$body$;

REVOKE ALL ON FUNCTION inventario.metrics_episodios_reconciliar_v1(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;
