# SOLOG Admin — Contrato de Incidencias y Catálogo V1

**Estado:** vigente
**Fecha de sincronización:** 2026-08-22
**Backend:** `rpc_solog_admin` y Edge Function `conexion-admin`

Este documento describe el contrato consumido por el frontend administrativo para Incidencias, gestión de propuestas de Catálogo y publicación controlada de una nueva versión oficial.

## 1. Límites de integración

- El frontend invoca las acciones administrativas mediante `public.rpc_solog_admin(p_action, p_payload)`.
- El backend valida sesión, usuario activo y rol administrativo.
- El frontend NO modifica el catálogo directamente.
- El frontend NO accede a `inventario.cambios_catalogo` ni a ninguna otra tabla de `inventario`.
- El frontend NO publica archivos directamente a Storage.
- La publicación futura se delega exclusivamente a `conexion-admin`.
- No se ejecutan decisiones ni publicaciones como pruebas contra datos reales.

## 2. Incidencias

### 2.1 Tipos administrativos

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

Los cambios `producto_nuevo`, `nombre_modificado`, `precio_modificado` y los cambios de código de barras pertenecen a Catálogo, no a Incidencias.

### 2.2 Consulta `incidents`

Filtros opcionales: `sede_id`, `tipo`, `estado`, `c_interno`, `producto`, `desde` y `hasta`. La paginación usa `limit` (máximo 50) y `offset`.

La respuesta contiene `rows`, `limit`, `offset` y `counts`. Las filas conservan la nullabilidad del backend para sede, código interno, producto, stock, categoría, grupo, snapshots y señal de producto eliminado. `datos` se transporta como `Record<string, unknown>` porque puede contener JSON parcial específico de la incidencia.

### 2.3 Acción `incident_action`

Payload:

```json
{
  "incident_id": "uuid",
  "decision": "reviewed | ignore_15d | deleted"
}
```

Reglas:

- `reviewed` se usa con código interno inválido/duplicado y stock inválido.
- `ignore_15d` y `deleted` se usan con producto ausente.
- El frontend no define decisiones adicionales.

## 3. Catálogo

### 3.1 Clasificación

```text
Cambios urgentes: agregar_producto | eliminar_producto
Cambios pendientes: nombre | precio | codigo
```

Las secciones son `urgente` y `pendiente`. Los estados son `pendiente`, `aprobado`, `ignorado` e `incorporado`.

> Aprobar no incorpora ni modifica el catálogo actual. Un cambio solo está incorporado cuando el backend publica y confirma una nueva versión.

### 3.2 Consulta `catalog_changes`

Filtros opcionales: `seccion`, `tipo`, `estado`, `c_interno` y `producto`, además de `limit` y `offset`.

Cada fila se identifica de forma exacta mediante `propuesta_fingerprint`. Incluye la propuesta, sedes, ocurrencias, fechas, estado del catálogo actual y fechas/versiones de decisión. `datos` permanece como `Record<string, unknown>` para tolerar las distintas formas parciales por tipo.

### 3.3 Acción `catalog_change_action`

Decisiones admitidas:

```text
approve → Aprobar
ignore  → Ignorar la propuesta exacta
```

Payload base:

```json
{
  "propuesta_fingerprint": "...",
  "decision": "approve | ignore"
}
```

Ignorar se aplica únicamente a ese fingerprint; no ignora cambios futuros del mismo SKU.

## 4. Configuración de producto nuevo

Al aprobar `agregar_producto`, el payload añade `config` con `marca`, `categoria_id`, `estado` y `grupo_conteo_id`.

```text
Único    → grupo_conteo_id = null
Agrupado → grupo_conteo_id obligatorio
Excluido → grupo_conteo_id = null
```

La unión TypeScript impide asociar un grupo a `Único`/`Excluido` y exige uno para `Agrupado`.

`catalog_reference` entrega exclusivamente las categorías y grupos necesarios para el formulario futuro, manteniendo como opcionales `orden` y `activo` según el contrato backend.

## 5. Preview y publicación

### 5.1 `catalog_publication_preview`

Es una lectura: valida cambios aprobados y devuelve la versión actual/nueva, versión de esquema, SKU actuales/resultantes, total, resumen y errores.

`NO_APPROVED_CATALOG_CHANGES` es un estado funcional esperado cuando no existen propuestas aprobadas; no implica un fallo inesperado de infraestructura.

### 5.2 Edge Function `conexion-admin`

La publicación usa:

```json
{ "action": "publish_catalog" }
```

Solo admite un JWT válido de un usuario `admin` activo. Un `moderador` puede consultar, aprobar e ignorar propuestas, pero la interfaz no le ofrece la acción de publicación.

Errores funcionales contemplados:

```text
AUTH_REQUIRED
AUTH_INVALID
USER_DISABLED
ADMIN_REQUIRED
NO_APPROVED_CATALOG_CHANGES
CATALOG_UPLOAD_FAILED
CATALOG_COMMIT_FAILED
INVALID_CATALOG_PREVIEW
```

## 6. Acciones administrativas disponibles

Las acciones anteriores continúan vigentes:

```text
bootstrap
authorize_device
revoke_device
report
```

Las nuevas acciones preparadas son:

```text
incidents
incident_action
catalog_reference
catalog_changes
catalog_change_action
catalog_publication_preview
```

## 7. Interfaz administrativa — Fase 2

La navegación interna del Admin contiene:

```text
Resumen
Conteos
Diferencias
Historial
Ajuste POS
Incidencias
Catálogo
Dispositivos
```

Incidencias y Catálogo se cargan bajo demanda. No crean rutas nuevas ni modifican el resolver de acceso por rol.

### 7.1 Bandeja de Incidencias

- Abre por defecto con `estado = pendiente`.
- Consulta filtros server-side para sede, tipo, estado, código interno, producto y rango de detección.
- Usa páginas de hasta 50 filas y conserva filtros después de una acción.
- Muestra contadores entregados por backend, tabla accesible, detalle técnico y estados de carga/error/vacío.
- `reviewed` solo aparece para código inválido/duplicado y stock inválido.
- `ignore_15d` y `deleted` solo aparecen para producto ausente.
- Cada acción requiere confirmación y luego recarga filas y contadores desde backend.

### 7.2 Gestión de Catálogo

- Abre por defecto en propuestas pendientes.
- Permite consultar pendientes, aprobadas, ignoradas e incorporadas.
- Los pendientes se separan visualmente en cambios urgentes y cambios pendientes.
- Los filtros de sección, tipo, estado, código interno y producto se procesan en backend.
- La tabla y el detalle muestran el catálogo actual, la propuesta, sedes, ocurrencias y fechas de decisión.
- Solo las propuestas `pendiente` ofrecen Aprobar e Ignorar.
- Aprobar o ignorar recarga la bandeja; no se realizan actualizaciones optimistas.

### 7.3 Formulario Agregar producto

Las referencias se solicitan bajo demanda al abrir una propuesta `agregar_producto`. El formulario presenta los datos detectados y solicita marca, categoría, modalidad y, cuando corresponde, grupo.

Para `Agrupado`, los grupos visibles deben coincidir con la categoría y precio detectados. Sin grupo compatible no se permite continuar. Antes de enviar se presenta un resumen de confirmación.

## 8. Publicación controlada — Fase 3

La publicación vive dentro de `Admin → Catálogo`; no crea una ruta ni un módulo administrativo independiente.

### 8.1 Semántica y permisos

```text
Pendiente   → cambio detectado
Aprobado    → aceptado para una versión futura
Incorporado → incluido en una versión oficial publicada
```

`Aprobado` no equivale a `Incorporado`. Aprobar una propuesta no modifica `inventario.catalogo`, no crea un archivo y no publica una versión.

- Admin: consulta, decide, prepara preview y publica.
- Moderador: consulta y decide, pero no dispone del botón `Crear nuevo catálogo`.
- Cajero: continúa sin acceso al área Admin.

### 8.2 Preview

El botón `Crear nuevo catálogo` se habilita únicamente para admin y cuando `catalog_changes.counts.aprobado` es mayor que cero. Primero consume `catalog_publication_preview`; nunca publica directamente.

Un preview válido muestra las versiones actual/nueva, `schema_version`, SKU actuales/resultantes, total y desglose calculado por backend. Si `ok = false`, se muestran los errores recibidos y no se habilita publicación. `NO_APPROVED_CATALOG_CHANGES` se presenta como el estado funcional “No hay cambios aprobados pendientes de incorporar”.

### 8.3 Confirmación y publicación

La confirmación final invoca exclusivamente `conexion-admin` con:

```json
{ "action": "publish_catalog" }
```

El frontend no envía versión, SKU, cambios, hash ni archivo. Durante preview/publicación se bloquean envíos duplicados y no existen timeout artificial, reintento automático, polling ni Realtime.

Si la publicación devuelve `CATALOG_PUBLISHED`, la interfaz muestra la versión real, recarga `catalog_changes` y abre la vista `incorporado`. Las filas incorporadas muestran `version_aplicada` e `incorporado_at` devueltos por backend.

Ante un rechazo entre preview y publicación, el preview anterior se invalida y Catálogo se refresca. El backend sigue siendo autoridad para conflictos, concurrencia y asignación de versión.

### 8.4 Errores funcionales

La interfaz traduce mediante `errors.ts`:

```text
AUTH_REQUIRED
AUTH_INVALID
USER_DISABLED
ADMIN_REQUIRED
NO_APPROVED_CATALOG_CHANGES
INVALID_CATALOG_PREVIEW
CATALOG_UPLOAD_FAILED
CATALOG_COMMIT_FAILED
```

No se muestran stack traces ni información sensible.

### 8.5 Límites

- No existe rollback, comparación de versiones o descarga manual de `.prcatalog`.
- No se implementa un historial nuevo de versiones.
- No existe edición directa del catálogo, Storage o tablas desde frontend.
- No hay Realtime ni polling.
