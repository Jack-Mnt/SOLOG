# Cambios de Supabase requeridos por SOLOG

Canal de coordinación con ChatGPT. Codex no debe ejecutar cambios remotos de Supabase.

## Estado actual

> No hay cambios de Supabase requeridos actualmente para continuar con la implementación frontend de SOLOG.

## Resueltos

### `Contar detalladamente`

`public.rpc_solog_state`, acción `groups`, devuelve para cada grupo:

```text
conteo_origen_id
estado_diferencia
stock_fisico_original
contado_at_original
```

El frontend envía `conteo_origen_id` como `conteo_id` en `public.rpc_solog_count`, acción `recount`. No se requiere acceso directo a tablas.

### Categorías operativas

`public.rpc_solog_state`, acción `bootstrap`, define `categorias` con `id`, `nombre`, `orden` y `grupos_inventariables`.

### Dispositivos pendientes

`public.rpc_solog_admin`, acción `bootstrap`, define cada solicitud pendiente con ID, sede, solicitante, fecha de solicitud y último acceso.

### Backend V1 ya disponible

- acceso seguro sin exponer directamente `inventario`;
- consulta de catálogo, stock y grupos mediante `rpc_solog_state`;
- cálculo dinámico del stock teórico agrupado;
- atribución de usuario y sede en backend;
- sesiones y escrituras transaccionales mediante `rpc_solog_count`;
- estados de conteo y diferencia;
- autorización de tablets con `inventario.dispositivos_solog`;
- motor automático de diferencias e integración con snapshots de ConeXion;
- administración y reportes mediante `rpc_solog_admin`;
- pruebas sintéticas e integrales del Backend V1.
