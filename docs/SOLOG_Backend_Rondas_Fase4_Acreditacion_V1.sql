-- SOLOG Fase 4B — acreditación e invalidación estructural localizada.
CREATE FUNCTION inventario.metrics_ronda_recalcular_v1(
 p_sede_id uuid,p_ronda_desde timestamptz,p_event_at timestamptz DEFAULT clock_timestamp()
)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_required integer; v_done integer; v_r inventario.metrics_rondas%rowtype;
BEGIN
 SELECT * INTO v_r FROM inventario.metrics_rondas
 WHERE sede_id=p_sede_id AND ronda_desde=p_ronda_desde FOR UPDATE;
 IF NOT FOUND OR v_r.estado<>'abierta' THEN RETURN; END IF;

 SELECT count(*)::integer,
        count(*) FILTER (WHERE acreditada_at IS NOT NULL)::integer
 INTO v_required,v_done
 FROM inventario.metrics_ronda_obligaciones
 WHERE sede_id=p_sede_id AND ronda_desde=p_ronda_desde
   AND vigente_hasta IS NULL AND exigible;

 UPDATE inventario.metrics_rondas
 SET total_exigibles=v_required,total_acreditadas=v_done,
   hito_50_at=CASE WHEN hito_50_at IS NULL AND v_required>0
                       AND 2*v_done>=v_required
       THEN greatest(p_event_at,ronda_desde)
       ELSE hito_50_at END,
   hito_90_at=CASE WHEN hito_90_at IS NULL AND v_required>0
                       AND 10*v_done>=9*v_required
       THEN greatest(p_event_at,coalesce(hito_50_at,ronda_desde))
       ELSE hito_90_at END,
   hito_100_at=CASE WHEN hito_100_at IS NULL AND v_required>0
                        AND v_done=v_required
       THEN greatest(p_event_at,coalesce(hito_90_at,
                         coalesce(hito_50_at,ronda_desde)))
       ELSE hito_100_at END,
   updated_at=clock_timestamp()
 WHERE sede_id=p_sede_id AND ronda_desde=p_ronda_desde;
END;
$f$;

CREATE FUNCTION inventario.metrics_ronda_grupo_cambio_v1(
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
           evidencia_desde_at=CASE WHEN new_e THEN rr.ronda_desde END,
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
                rr.ronda_desde,new_e,new_fp,CASE WHEN new_e THEN rr.ronda_desde END);
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

CREATE FUNCTION inventario.metrics_ronda_acreditar_v1(
 p_sede_id uuid,p_grupo_id uuid,p_observacion_id uuid,
 p_tipo_observacion text,p_fisico_at timestamptz,
 p_codigos integer[]
)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE ctx record; rd inventario.metrics_rondas%rowtype;
  ob inventario.metrics_ronda_obligaciones%rowtype;
  evt_turn text; evt_fp text;
BEGIN
 IF p_tipo_observacion NOT IN ('normal','recount')
    OR p_fisico_at IS NULL OR p_observacion_id IS NULL THEN
    RAISE EXCEPTION 'SOLOG_ROUND_INVALID_EVIDENCE';
 END IF;
 SELECT * INTO ctx FROM inventario.solog_temporal_context(p_fisico_at);
 IF ctx.ronda_hasta<=clock_timestamp() THEN
   -- Evidencia tardía de corte anterior: no reabrir ni alterar cierre.
   -- Se concilia mediante corte versionado en flujo excepcional.
   RETURN false;
 END IF;
 PERFORM inventario.metrics_ronda_asegurar_v1(p_sede_id,p_fisico_at);
 SELECT * INTO rd FROM inventario.metrics_rondas
 WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde FOR UPDATE;
 IF NOT FOUND OR rd.estado<>'abierta' THEN RETURN false; END IF;

 SELECT * INTO ob FROM inventario.metrics_ronda_obligaciones
 WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
   AND grupo_conteo_id=p_grupo_id AND exigible
   AND vigente_desde<=p_fisico_at
   AND (vigente_hasta IS NULL OR vigente_hasta>p_fisico_at)
 ORDER BY generacion DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 evt_fp:=md5(array_to_string(p_codigos,','));
 IF p_codigos IS NULL OR evt_fp IS DISTINCT FROM ob.composicion_fingerprint
    OR ob.evidencia_desde_at IS NULL OR p_fisico_at<ob.evidencia_desde_at
 THEN RETURN false; END IF;

 IF ob.acreditada_at IS NULL OR p_fisico_at<ob.acreditada_at THEN
   SELECT turno INTO evt_turn FROM inventario.solog_temporal_context(p_fisico_at);
   UPDATE inventario.metrics_ronda_obligaciones
   SET acreditada_at=p_fisico_at,
       observacion_id=p_observacion_id,
       tipo_observacion=p_tipo_observacion,
       turno_contribuyente=evt_turn,
       estado_calidad='complete',
       updated_at=clock_timestamp()
   WHERE sede_id=p_sede_id AND ronda_desde=ctx.ronda_desde
     AND grupo_conteo_id=p_grupo_id AND generacion=ob.generacion;
   PERFORM inventario.metrics_ronda_recalcular_v1(
       p_sede_id,ctx.ronda_desde,p_fisico_at);
   RETURN true;
 END IF;
 RETURN false;
END;
$f$;

REVOKE ALL ON FUNCTION
 inventario.metrics_ronda_recalcular_v1(uuid,timestamptz,timestamptz),
 inventario.metrics_ronda_grupo_cambio_v1(uuid,timestamptz),
 inventario.metrics_ronda_acreditar_v1(uuid,uuid,uuid,text,timestamptz,integer[])
FROM PUBLIC,anon,authenticated,service_role;
