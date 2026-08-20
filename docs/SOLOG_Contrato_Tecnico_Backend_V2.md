# SOLOG V2 — Contrato técnico Backend ↔ Frontend

**Estado:** vigente  
**Fecha de sincronización:** 2026-08-20  
**RPC públicas:** `rpc_solog_state`, `rpc_solog_count`, `rpc_solog_admin`

Este documento describe únicamente el contrato V2 consumido por el frontend. V2 es incompatible con V1. El frontend no accede directamente a `inventario` ni replica reglas de negocio del backend.

## 1. Modelo operativo

Existe una sesión general activa por sede. No tiene tipo ni categoría. Sus únicos estados son `activo`, `finalizado` y `expirado`. Una quincena puede acumular cobertura a través de varias sesiones.

La vista es navegación transitoria dentro de la sesión:

```text
categoria
stock_cero
cambios_recientes
stock_negativo
contar_detalladamente
```

Categorías y Stock 0 forman el conteo principal. Las otras tres vistas solo están disponibles cuando `cobertura_quincenal.completa` es verdadera.

## 2. Convención RPC

Todas las RPC reciben `p_action text`, `p_payload jsonb` y devuelven `jsonb`. Requieren una sesión Auth válida. Las acciones operativas que lo indican reciben el token persistente de la tablet.

## 3. `rpc_solog_state`

### `bootstrap`

Para un cajero se envía `{ "device_token": "..." }`. La respuesta operativa contiene:

- `usuario`, `sede` y `dispositivo` resueltos por backend;
- `sesion_activa`, nula o con ID, estado activo, snapshot y horas de inicio/vencimiento;
- `stock`: disponibilidad, IDs/fechas del snapshot, `snapshot_confirmado_at`, `expira_at`, versión y `puede_iniciar_conteo`;
- `server_now`;
- `cobertura_diaria`;
- `cobertura_quincenal`, incluida `completa` y el período `primera`/`segunda`;
- `categorias` ordenadas por backend con `id`, `nombre`, `orden` y `pendientes`;
- contadores de `stock_cero`, `cambios_recientes`, `stock_negativo` y `contar_detalladamente`.

Cada cobertura entrega `grupos_contados`, `grupos_totales`, `pendientes` y `porcentaje`. El frontend no recalcula estos valores.

### `groups`

Categoría:

```json
{
  "device_token": "...",
  "vista": "categoria",
  "categoria_id": "uuid"
}
```

Otras vistas:

```json
{ "device_token": "...", "vista": "stock_cero" }
```

La respuesta incluye `conteo_id`, vista, snapshot y `grupos`. Cada grupo entrega ID, nombre, categoría, precio, `stock_teorico`, productos y estado contado. En `contar_detalladamente` entrega además `detalle_id`, `estado_diferencia`, `stock_fisico_original` y `contado_at_original`.

## 4. `rpc_solog_count`

### `start`

```json
{ "device_token": "..." }
```

Devuelve `COUNT_STARTED`, `conteo_id`, snapshot de referencia/confirmación, `iniciado_at`, `expira_at` y `server_now`. No recibe tipo ni categoría.

### `save_batch`

Categoría:

```json
{
  "device_token": "...",
  "conteo_id": "uuid",
  "vista": "categoria",
  "categoria_id": "uuid",
  "items": [
    { "grupo_id": "uuid", "stock_fisico": 18, "contado_at": "timestamptz" }
  ]
}
```

Para `stock_cero`, `cambios_recientes` y `stock_negativo` se omite `categoria_id`. El máximo es 500 items y cada llamada es transaccional. La respuesta `COUNT_BATCH_SAVED` contiene los items confirmados con `detalle_id`, valores teórico/físico, diferencia, precio, valor, estado y hora; también `guardados`, `sesion_expirada` y `server_now`.

El frontend elimina de la cola solo los items de una llamada confirmada. Ante error conserva íntegro el batch rechazado.

### `recount`

```json
{
  "device_token": "...",
  "conteo_id": "uuid de sesión general",
  "detalle_id": "uuid de observación original",
  "stock_fisico": 18,
  "contado_at": "timestamptz"
}
```

El reconteo es individual. No usa `save_batch`, `conteo_origen_id` ni `grupo_id` como identidad.

### `finish`

```json
{ "device_token": "...", "conteo_id": "uuid" }
```

Devuelve `COUNT_FINISHED`, `estado = finalizado` y `finalizado_at`. La cobertura quincenal continúa independientemente.

## 5. Tiempo y persistencia local

El frontend calcula `serverOffset = Date.parse(server_now) - Date.now()` y registra cada hora física con `Date.now() + serverOffset`. La cola `solog.pending-counts.v2` contiene solo pendientes y está asociada a un único `conteo_id`. Datos de otra sesión nunca se mezclan ni se envían automáticamente.

El temporizador usa `stock.expira_at`. No produce polling. Al vencer se bloquean capturas nuevas y puede enviarse una captura anterior durante la tolerancia que determine el backend.

## 6. `rpc_solog_admin`

`bootstrap` devuelve usuario administrador/moderador, sedes y dispositivos pendientes. Cada sede expone `cobertura_quincenal`, `cobertura_diaria`, `sesion_activa` general y dispositivo autorizado.

`authorize_device` y `revoke_device` mantienen la administración de tablets. `report` conserva `summary`, `counts`, `differences`, `history` y `pos_adjustments`. El reporte `counts` ya no entrega tipo/categoría y usa estados activo/finalizado/expirado; muestra grupos registrados y snapshot. Las filas de detalle de los demás reportes incluyen su propio `id` y conservan datos de SKU, stock posterior y reconteo.

## 7. Errores relevantes

Además de errores de Auth, dispositivo, sesión, grupo y reconteo, V2 contempla:

```text
SOLOG_SNAPSHOT_EXPIRED
SOLOG_SNAPSHOT_EXPIRING
SOLOG_INVALID_BATCH_PAYLOAD
SOLOG_BATCH_TOO_LARGE
SOLOG_INVALID_BATCH_ITEM
SOLOG_INVALID_COUNT_TIMESTAMP
SOLOG_DUPLICATE_GROUP_IN_BATCH
SOLOG_GROUP_ALREADY_COVERED_QUINCENA
SOLOG_QUINCENAL_COVERAGE_REQUIRED
SOLOG_COUNT_EXPIRED
```

Un error de batch implica que ningún item de esa llamada quedó confirmado.
