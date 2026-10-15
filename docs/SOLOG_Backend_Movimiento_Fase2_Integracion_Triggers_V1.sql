-- SOLOG Dashboard Fase 2B — hooks mínimos, transaccionales y set-based.
-- AFTER INSERT STATEMENT: corre después de materializar snapshot_stock y antes del upsert stock_actual de ConeXion V2.
-- Referencing transition relation ofrece el lote entero, sin trigger por SKU.
CREATE TRIGGER trg_metrics_movimiento_snapshot_stock_v1
AFTER INSERT ON inventario.snapshot_stock
REFERENCING NEW TABLE AS metrics_new_snapshot_rows
FOR EACH STATEMENT
EXECUTE FUNCTION inventario.metrics_movimiento_snapshot_stock_hook_v1();

-- Invalida SKU en cambios de inclusión/exclusión sin reinterpretar otros cambios del catálogo.
CREATE TRIGGER trg_metrics_movimiento_catalogo_estado_v1
AFTER UPDATE OF estado ON inventario.catalogo
FOR EACH ROW
WHEN (
  OLD.estado IS DISTINCT FROM NEW.estado
  AND (OLD.estado='Excluido' OR NEW.estado='Excluido')
)
EXECUTE FUNCTION inventario.metrics_movimiento_catalogo_estado_hook_v1();
