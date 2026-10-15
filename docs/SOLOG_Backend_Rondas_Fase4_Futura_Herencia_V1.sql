CREATE OR REPLACE FUNCTION inventario.metrics_ronda_grupo_cambio_v1(
 p_grupo_id uuid,p_efectivo_at timestamptz DEFAULT clock_timestamp()
)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE rr record; old_o inventario.metrics_ronda_obligaciones%rowtype;
  new_e boolean;new_fp text;new_codes integer[];v_start timestamptz;v_next integer;
  v_updated integer:=0;
BEGIN
 IF p_grupo_id IS NULL THEN RETURN 0; END IF;
 SELECT exigible,fingerprint,codigos INTO new_e,new_fp,new_codes
 FROM inventario.metrics_ronda_grupo_estado_v1(p_grupo_id);
 IF NOT FOUND THEN RETURN 0; END IF;

 FOR rr IN SELECT sede_id,ronda_desde,ronda_hasta FROM inventario.metrics_rondas
    WHERE estado='abierta' AND ronda_hasta>p_efectivo_at
    ORDER BY sede_id,ronda_desde
 LOOP
   PERFORM 1 FROM inventario.metrics_rondas
    WHERE sede_id=rr.sede_id AND ronda_desde=rr.ronda_desde FOR UPDATE;
   SELECT * INTO old_o FROM inventario.metrics_ronda_obligaciones
    WHERE sede_id=rr.sede_id AND ronda_desde=rr.ronda_desde
      AND grupo_conteo_id=p_grupo_id AND vigente_hasta IS NULL FOR UPDATE;

   IF FOUND AND old_o.exigible IS NOT DISTINCT FROM new_e
      AND old_o.composicion_fingerprint IS NOT DISTINCT FROM new_fp THEN
     CONTINUE;
   END IF;

   IF rr.ronda_desde>p_efectivo_at THEN
     -- Ronda futura preparada: actualizar su estado de partida sin inventar generaciones.
     IF FOUND THEN
       UPDATE inventario.metrics_ronda_obligaciones
       SET exigible=new_e,composicion_fingerprint=new_fp,
           evidencia_desde_at=CASE WHEN new_e THEN COALESCE(
             (SELECT CASE WHEN previous.exigible
                  AND previous.composicion_fingerprint=new_fp
                  THEN previous.evidencia_desde_at END
              FROM inventario.metrics_ronda_obligaciones previous
              WHERE previous.sede_id=rr.sede_id
                AND previous.grupo_conteo_id=p_grupo_id
                AND previous.ronda_desde<rr.ronda_desde
              ORDER BY previous.ronda_desde DESC,
                       previous.generacion DESC LIMIT 1),
             rr.ronda_desde) END,
           acreditada_at=NULL,observacion_id=NULL,tipo_observacion=NULL,
           turno_contribuyente=NULL,estado_calidad='no_data',
           updated_at=clock_timestamp()
       WHERE sede_id=rr.sede_id AND ronda_desde=rr.ronda_desde
         AND grupo_conteo_id=p_grupo_id AND vigente_hasta IS NULL;
     ELSE
       INSERT INTO inventario.metrics_ronda_obligaciones(
        sede_id,ronda_desde,grupo_conteo_id,generacion,
        vigente_desde,exigible,composicion_fingerprint,evidencia_desde_at
       ) VALUES(rr.sede_id,rr.ronda_desde,p_grupo_id,1,
                rr.ronda_desde,new_e,new_fp,CASE WHEN new_e THEN COALESCE(
             (SELECT CASE WHEN previous.exigible
                  AND previous.composicion_fingerprint=new_fp
                  THEN previous.evidencia_desde_at END
              FROM inventario.metrics_ronda_obligaciones previous
              WHERE previous.sede_id=rr.sede_id
                AND previous.grupo_conteo_id=p_grupo_id
                AND previous.ronda_desde<rr.ronda_desde
              ORDER BY previous.ronda_desde DESC,
                       previous.generacion DESC LIMIT 1),
             rr.ronda_desde) END);
     END IF;
   ELSE
     v_start:=p_efectivo_at;
     IF FOUND THEN
       v_start:=greatest(v_start,old_o.vigente_desde+interval '1 microsecond');
       UPDATE inventario.metrics_ronda_obligaciones
         SET vigente_hasta=v_start,updated_at=clock_timestamp()
       WHERE sede_id=rr.sede_id AND ronda_desde=rr.ronda_desde
         AND grupo_conteo_id=p_grupo_id AND generacion=old_o.generacion;
       v_next:=old_o.generacion+1;
     ELSE
       SELECT coalesce(max(generacion),0)+1 INTO v_next
       FROM inventario.metrics_ronda_obligaciones
       WHERE sede_id=rr.sede_id AND ronda_desde=rr.ronda_desde
         AND grupo_conteo_id=p_grupo_id;
     END IF;
     INSERT INTO inventario.metrics_ronda_obligaciones(
       sede_id,ronda_desde,grupo_conteo_id,generacion,vigente_desde,
       exigible,composicion_fingerprint,evidencia_desde_at,estado_calidad
     ) VALUES(rr.sede_id,rr.ronda_desde,p_grupo_id,v_next,v_start,
             new_e,new_fp,CASE WHEN new_e THEN v_start END,'no_data');
   END IF;
   PERFORM inventario.metrics_ronda_recalcular_v1(
       rr.sede_id,rr.ronda_desde,p_efectivo_at);
   v_updated:=v_updated+1;
 END LOOP;
 RETURN v_updated;
END;
$f$;

