-- SOLOG Fase 1 — correccion de integridad.
-- Las restricciones CHECK en PostgreSQL aceptan UNKNOWN; exigir presencia completa
-- de los ocho contadores en cortes validos/corregidos.
ALTER TABLE inventario.metrics_rondas_cortes
  DROP CONSTRAINT metrics_rondas_cortes_estado;

ALTER TABLE inventario.metrics_rondas_cortes
  ADD CONSTRAINT metrics_rondas_cortes_estado CHECK (
    version_corte >= 1
    AND estado_corte IN ('valido','nd','corregido')
    AND jsonb_typeof(contribucion_turnos)='object'
    AND jsonb_typeof(hitos_at)='object'
    AND jsonb_typeof(evidencia_grupos)='array'
    AND (
      (estado_corte='nd'
       AND num_nulls(h_g,h_r,h_z,h_s,h_t,h_u,cobertura_acreditadas,cobertura_exigibles)=8)
      OR
      (estado_corte IN ('valido','corregido')
       AND num_nulls(h_g,h_r,h_z,h_s,h_t,h_u,cobertura_acreditadas,cobertura_exigibles)=0
       AND h_g>=0 AND h_r>=0 AND h_z>=0 AND h_s>=0
       AND h_t>=0 AND h_u>=0
       AND h_t=h_g+h_r+h_z+h_s
       AND h_u=h_g+h_r
       AND cobertura_exigibles>=0 AND cobertura_acreditadas>=0
       AND cobertura_acreditadas<=cobertura_exigibles)
    )
  );
