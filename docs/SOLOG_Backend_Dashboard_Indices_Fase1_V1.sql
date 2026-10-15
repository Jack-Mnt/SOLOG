-- SOLOG Fase 1: índices FK derivados del advisor de Supabase.
-- Solo tablas metrics_*; no modifica estructuras ni índices preexistentes.

CREATE INDEX metrics_movimiento_sku_codigo_fk_idx
  ON inventario.metrics_movimiento_sku(c_interno);

CREATE INDEX metrics_diferencias_grupo_fk_idx
  ON inventario.metrics_diferencias(grupo_conteo_id);

CREATE INDEX metrics_episodios_grupo_fk_idx
  ON inventario.metrics_episodios(grupo_conteo_id);

CREATE INDEX metrics_ronda_obligaciones_grupo_fk_idx
  ON inventario.metrics_ronda_obligaciones(grupo_conteo_id);
