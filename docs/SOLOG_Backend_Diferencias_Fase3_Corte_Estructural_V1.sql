-- Marca prospectiva de invalidacion estructural; evita reutilizar evidencias
-- de una generación anterior incluso si la composición vuelve a coincidir.
ALTER TABLE inventario.metrics_diferencias
 ADD COLUMN estructura_cambio_at timestamptz;

CREATE OR REPLACE FUNCTION inventario.metrics_diferencias_reconciliar_v1(
  p_sede_id uuid,p_grupo_id uuid
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE
 v_eligible boolean;
 v_codes integer[];
 v_price numeric;
 v_confirmation record;
 v_latest record;
 v_validation text:='none';
 v_ok boolean:=false;
 v_quality text:='no_data';
 v_v smallint;
 v_corte_estructura timestamptz;
 v_pendiente_estructura boolean:=false;
BEGIN
 SELECT e.elegible,e.codigos_internos,e.precio_unitario
 INTO v_eligible,v_codes,v_price
 FROM inventario.metrics_grupo_elegibilidad_v1(p_grupo_id) e;

 IF NOT EXISTS(SELECT 1 FROM public.sedes WHERE id=p_sede_id) OR
    NOT EXISTS(SELECT 1 FROM inventario.grupos_conteo WHERE id=p_grupo_id)
 THEN RAISE EXCEPTION 'SOLOG_METRICS_UNKNOWN_GROUP_OR_SITE'; END IF;

 SELECT d.estructura_cambio_at,(d.validacion_tipo='estructura')
 INTO v_corte_estructura,v_pendiente_estructura
 FROM inventario.metrics_diferencias d
 WHERE d.sede_id=p_sede_id AND d.grupo_conteo_id=p_grupo_id;

 v_v:=CASE WHEN v_price IS NULL OR v_price<0 THEN NULL
      WHEN v_price<=14 THEN 1 WHEN v_price<40 THEN 3 ELSE 5 END;

 -- El resultado físico nunca se deduce del estado mutable después de snapshots.
 -- Una observación inicial d0<>0 que aparece como Coincide SIN dr
 -- fue reconciliada teóricamente; no certifica coincidencia ni obligación nueva.
 WITH physical AS (
   SELECT cd.id,co.sede_id,cd.grupo_conteo_id,
       cd.contado_at physical_at,0::integer event_order,
       cd.codigos_internos IS NOT DISTINCT FROM v_codes same_members,
       CASE WHEN cd.stock_fisico=cd.stock_teorico THEN 'Coincide'
            WHEN cd.recontado_at IS NULL AND cd.estado_diferencia='Coincide'
              THEN 'none'
            ELSE 'Recontar' END physical_state,
       cd.stock_fisico-cd.stock_teorico raw_diff,
       cd.stock_teorico theoretical,cd.stock_fisico physical,
       cd.precio,cd.unidades_por_paquete,cd.precio_paquete,
       'normal'::text origin,
       cd.id::text || ':normal' event_key
   FROM inventario.conteo_detalle cd
   JOIN inventario.conteos co ON co.id=cd.conteo_id
   WHERE co.sede_id=p_sede_id AND cd.grupo_conteo_id=p_grupo_id
     AND (v_corte_estructura IS NULL OR cd.contado_at>=v_corte_estructura)
   UNION ALL
   SELECT cd.id,co.sede_id,cd.grupo_conteo_id,
       cd.recontado_at,1::integer,
       cd.codigos_internos IS NOT DISTINCT FROM v_codes,
       CASE WHEN cd.stock_reconteo=cd.stock_teorico_reconteo THEN 'Coincide'
            WHEN (cd.stock_fisico::bigint-cd.stock_teorico::bigint) *
                 (cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)>0
                 THEN 'Confirmada'
            ELSE 'Inconsistente' END,
       CASE WHEN cd.stock_reconteo=cd.stock_teorico_reconteo THEN 0
            WHEN (cd.stock_fisico::bigint-cd.stock_teorico::bigint) *
                 (cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)>0
                 THEN (CASE WHEN abs(cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)
                               <abs(cd.stock_fisico::bigint-cd.stock_teorico::bigint)
                            THEN cd.stock_reconteo-cd.stock_teorico_reconteo
                            ELSE cd.stock_fisico-cd.stock_teorico END)
            ELSE cd.stock_reconteo-cd.stock_teorico_reconteo END,
       cd.stock_teorico_reconteo,cd.stock_reconteo,cd.precio,
       cd.unidades_por_paquete,cd.precio_paquete,
       'recount',cd.id::text||':recount'
   FROM inventario.conteo_detalle cd
   JOIN inventario.conteos co ON co.id=coalesce(cd.reconteo_conteo_id,cd.conteo_id)
   WHERE co.sede_id=p_sede_id AND cd.grupo_conteo_id=p_grupo_id
     AND cd.recontado_at IS NOT NULL AND cd.stock_reconteo IS NOT NULL
     AND cd.stock_teorico_reconteo IS NOT NULL
     AND (v_corte_estructura IS NULL OR cd.recontado_at>=v_corte_estructura)
 ), ordered AS (
   SELECT * FROM physical
 )
 SELECT *
 INTO v_latest
 FROM ordered
 ORDER BY physical_at DESC,event_order DESC,id DESC LIMIT 1;

 -- No usar una confirmación de una estructura distinta como vigente.
 WITH confirmed AS (
   SELECT cd.id,cd.contado_at physical_at,0::integer event_order,
          'Coincide'::text physical_state,0::integer raw_diff,
          cd.stock_teorico theoretical,cd.stock_fisico physical,
          cd.precio,cd.unidades_por_paquete,cd.precio_paquete,'normal'::text origin
   FROM inventario.conteo_detalle cd
   JOIN inventario.conteos co ON co.id=cd.conteo_id
   WHERE co.sede_id=p_sede_id AND cd.grupo_conteo_id=p_grupo_id
      AND cd.codigos_internos IS NOT DISTINCT FROM v_codes
      AND (v_corte_estructura IS NULL OR cd.contado_at>=v_corte_estructura)
      AND cd.stock_fisico=cd.stock_teorico
   UNION ALL
   SELECT cd.id,cd.recontado_at,1,
       CASE WHEN cd.stock_reconteo=cd.stock_teorico_reconteo THEN 'Coincide'
            ELSE 'Confirmada' END,
       CASE WHEN cd.stock_reconteo=cd.stock_teorico_reconteo THEN 0
            WHEN abs(cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint) <
                 abs(cd.stock_fisico::bigint-cd.stock_teorico::bigint)
            THEN cd.stock_reconteo-cd.stock_teorico_reconteo
            ELSE cd.stock_fisico-cd.stock_teorico END,
       cd.stock_teorico_reconteo,cd.stock_reconteo,cd.precio,
       cd.unidades_por_paquete,cd.precio_paquete,'recount'
   FROM inventario.conteo_detalle cd
   JOIN inventario.conteos co ON co.id=coalesce(cd.reconteo_conteo_id,cd.conteo_id)
   WHERE co.sede_id=p_sede_id AND cd.grupo_conteo_id=p_grupo_id
     AND cd.codigos_internos IS NOT DISTINCT FROM v_codes
     AND (v_corte_estructura IS NULL OR cd.recontado_at>=v_corte_estructura)
     AND cd.recontado_at IS NOT NULL AND cd.stock_reconteo IS NOT NULL
     AND cd.stock_teorico_reconteo IS NOT NULL
     AND (
       cd.stock_reconteo=cd.stock_teorico_reconteo
       OR ((cd.stock_fisico::bigint-cd.stock_teorico::bigint) *
           (cd.stock_reconteo::bigint-cd.stock_teorico_reconteo::bigint)>0)
     )
 )
 SELECT * INTO v_confirmation FROM confirmed
 ORDER BY physical_at DESC,event_order DESC,id DESC LIMIT 1;

 v_ok:=coalesce(v_eligible,false)
     AND v_confirmation.id IS NOT NULL
     AND (v_latest.id IS NULL OR coalesce(v_latest.same_members,false));

 IF NOT coalesce(v_eligible,false) THEN
   v_validation:='none';
   v_quality:='invalid';
 ELSIF v_latest.id IS NULL THEN
   v_validation:=CASE WHEN coalesce(v_pendiente_estructura,false)
        THEN 'estructura' ELSE 'none' END;
   v_quality:=CASE WHEN coalesce(v_pendiente_estructura,false)
        THEN 'invalid' ELSE 'no_data' END;
 ELSIF NOT coalesce(v_latest.same_members,false) THEN
   v_validation:='estructura'; v_quality:='invalid'; v_ok:=false;
 ELSIF v_latest.physical_state='Recontar'
      AND (v_confirmation.id IS NULL OR
          (v_latest.physical_at,v_latest.event_order,v_latest.id)>
          (v_confirmation.physical_at,v_confirmation.event_order,v_confirmation.id)) THEN
   v_validation:='recontar'; v_quality:='complete';
 ELSIF v_latest.physical_state='Inconsistente'
      AND (v_confirmation.id IS NULL OR
          (v_latest.physical_at,v_latest.event_order,v_latest.id)>
          (v_confirmation.physical_at,v_confirmation.event_order,v_confirmation.id)) THEN
   v_validation:='inconsistente'; v_quality:='complete';
 ELSE
   v_validation:='none'; v_quality:='complete';
 END IF;

 INSERT INTO inventario.metrics_diferencias AS m (
   sede_id,grupo_conteo_id,estado_confirmado,diferencia_confirmada,
   valor_diferencia_confirmada,observacion_confirmacion_id,
   origen_confirmacion,confirmado_fisico_at,
   stock_teorico_confirmacion,stock_fisico_confirmacion,precio_confirmacion,
   factor_v_riesgo,validacion_tipo,validacion_observacion_id,
   comparable,calidad,updated_at
 ) VALUES(
   p_sede_id,p_grupo_id,
   CASE WHEN v_ok THEN v_confirmation.physical_state ELSE NULL END,
   CASE WHEN v_ok THEN v_confirmation.raw_diff ELSE NULL END,
   CASE WHEN v_ok THEN inventario.solog_calcular_valor_diferencia(
       v_confirmation.raw_diff,v_confirmation.precio,
       v_confirmation.unidades_por_paquete,v_confirmation.precio_paquete) END,
   CASE WHEN v_ok THEN v_confirmation.id ELSE NULL END,
   CASE WHEN v_ok THEN v_confirmation.origin ELSE NULL END,
   CASE WHEN v_ok THEN v_confirmation.physical_at ELSE NULL END,
   CASE WHEN v_ok THEN v_confirmation.theoretical ELSE NULL END,
   CASE WHEN v_ok THEN v_confirmation.physical ELSE NULL END,
   CASE WHEN v_ok THEN v_confirmation.precio ELSE NULL END,
   v_v,v_validation,
   CASE WHEN v_validation<>'none' THEN
     coalesce(v_latest.id,(SELECT m.validacion_observacion_id
         FROM inventario.metrics_diferencias m
         WHERE m.sede_id=p_sede_id AND m.grupo_conteo_id=p_grupo_id))
   ELSE NULL END,
   v_ok,v_quality,pg_catalog.clock_timestamp()
 )
 ON CONFLICT(sede_id,grupo_conteo_id) DO UPDATE SET
   estado_confirmado=excluded.estado_confirmado,
   diferencia_confirmada=excluded.diferencia_confirmada,
   valor_diferencia_confirmada=excluded.valor_diferencia_confirmada,
   observacion_confirmacion_id=excluded.observacion_confirmacion_id,
   origen_confirmacion=excluded.origen_confirmacion,
   confirmado_fisico_at=excluded.confirmado_fisico_at,
   stock_teorico_confirmacion=excluded.stock_teorico_confirmacion,
   stock_fisico_confirmacion=excluded.stock_fisico_confirmacion,
   precio_confirmacion=excluded.precio_confirmacion,
   factor_v_riesgo=excluded.factor_v_riesgo,
   validacion_tipo=excluded.validacion_tipo,
   validacion_observacion_id=excluded.validacion_observacion_id,
   comparable=excluded.comparable,
   calidad=excluded.calidad,
   updated_at=excluded.updated_at;
END;
$body$;


CREATE OR REPLACE FUNCTION inventario.metrics_grupo_invalidar_estructura_v1(p_grupo uuid)
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
    validacion_tipo,comparable,calidad,estructura_cambio_at
  )
  SELECT s.id,p_grupo,v_factor,'none',false,
    CASE WHEN coalesce(v_elegible,false) THEN 'no_data' ELSE 'invalid' END,
    pg_catalog.clock_timestamp()
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
    estructura_cambio_at=pg_catalog.clock_timestamp(),
    updated_at=pg_catalog.clock_timestamp();

  UPDATE inventario.metrics_episodios e
  SET operativamente_visible_desde=NULL,
      updated_at=pg_catalog.clock_timestamp()
  WHERE e.grupo_conteo_id=p_grupo AND e.cierre_at IS NULL;
END;
$body$;

