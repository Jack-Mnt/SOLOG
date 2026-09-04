# Admin A4–A6 — implementación técnica contra V6

Fecha: 2026-09-04. Estado: **IMPLEMENTADAS TÉCNICAMENTE — PENDIENTES DE REVISIÓN DEL USUARIO**.

## Baseline y límites

- Branch `master`; commit `b586dd6af650a2ddd86013f1579893cba5faa43f`.
- Antes de implementar: ningún cambio tracked; únicamente `docs/SOLOG_Backend_Contratos_Optimizacion_Global_V6.md` untracked, preexistente del usuario y preservado sin modificaciones.
- Fuentes: decisiones congeladas, contrato V6 (API `contract_version=2`) y plan aprobado. V6 sustituye V5 para integración; A1–A3 permanecen aprobadas técnicamente.
- La skill Supabase orientó la comprobación solo lectura: Edge `conexion-admin` v4, `verify_jwt=true`, recuperación del artefacto con `prepared_at` persistido. También se verificó en metadatos PostgreSQL que `c_interno_original` es `text`; no se convierte a número.
- No se modificaron Supabase, datos, RPC, RLS, grants, Cron, Edge Functions, migraciones ni Storage. No se ejecutaron mutaciones productivas. No se implementó Integración Global.

## A4 — Catálogo, Grupos y publicación

### Cambios y contratos

- `rpc_solog_admin_master_read_v2`: `status`, `reference`, `groups`, `group_products`, `catalog_changes`, `publication_preview`.
- Listas con `limit=50 / offset`; filtros enviados al backend, sin cursor ni `page/page_size`. `publication_preview.preview` se consume directamente. Se conservan los siete tipos contractuales de propuesta y ámbitos producto/grupo.
- `rpc_solog_admin_master_v2`: lectura `price_mismatch_options`; mutaciones `group_change_save`, `catalog_change_action`, `resolve_group_price`, `update_package_price`.
- Creación con `member_codes` seleccionados de la lectura paginada; edición y clasificación sin reconstruir topologías 0/1/2+. Precio por paquete independiente, sin editar unidades mediante una acción inexistente.
- Aprobación de un precio agrupado conduce a las opciones backend `update_group_price / separate_sku`. La propuesta aprobada permanece recuperable si se cierra/interrumpe el flujo; se puede reabrir su resolución antes de publicar. No se presenta como publicación completada.
- El diálogo ofrece `Actualizar precio xN` usando las unidades backend; solo una confirmación explícita ejecuta la mutación de paquete. No hay cambio automático del paquete por detectar un precio unitario.
- Edge `conexion-admin` v4: únicamente `{action:'publish_catalog', operation_id}`. No timestamps, hash, rutas, archivos, uploads ni RPC internas desde cliente.
- El recibo de publicación guarda solo el UUID, con clave por usuario en `sessionStorage`, para recuperar la misma intención tras recargar la pestaña. No es una caché de catálogo. Si el almacenamiento no está disponible, se mantiene el recibo en memoria durante la instancia activa.
- Una respuesta incierta conserva UUID. Un error inicial no se asume terminal: se libera la intención solo ante rechazo explícito de preview o replay de fallo confirmado por el ledger. Un éxito con `replay:true` no aplica otra actualización local.

### Archivos principales

- `src/features/solog/admin/catalogo/admin.catalogo.v2.tsx`
- `src/features/solog/admin/grupos/admin.grupos.v2.tsx`
- `src/features/solog/admin/admin.package-price.v2.tsx`
- Adaptador/store/presentación compartidos `admin.management.*`.

### Legacy retirado y criterio

Retirados los consumidores de `catalog_reference`, `rpc_solog_catalog('reference'/'status')`, `catalog_changes`, `catalog_change_action`, `catalog_publication_preview`, `groups`, `group_products`, `group_change_save`, `group_valuation_save` y publicación sin UUID, junto con sus hooks/páginas/diálogos reemplazados.

Cumplido: no hay lectura/escritura maestro v1, consumidor nuevo de `admin_master_v2('status')`, cálculo de topología en cliente ni publicación parcial simulada. La UI usa resultados/revisiones autoritativos e invalida las lecturas que debe actualizar.

## A5 — Incidencias

### Cambios y contratos

- `rpc_solog_admin_incidents_v2`: `summary`, `detail`, `ignore_30d`, `reactivate`, `propose_delete`.
- Una representación por `family_key` entregada por backend. No se calculan familias, frecuencias ni conteos de repetición en frontend.
- Resumen global o de sede sin fechas manuales. `+ Repeticiones` solicita detalle bajo demanda con `page/page_size=100`, cacheado por familia/sede/página.
- Supresión 30 días, reactivación y propuesta con `operation_id`, `expected_revision`, scope y sede solo cuando corresponde. La propuesta no elimina ni suprime.
- El resumen autoritativo refleja si subsiste otra supresión global/de sede; `status:'active'` de una operación no se convierte en una afirmación de reactivación universal.
- Invalidación selectiva de resumen y detalle de la familia afectada; propuesta de eliminación invalida también Catálogo. Expiración de resumen al final del período backend en Lima, tomando `generated_at` como referencia temporal y sin polling periódico.

### Archivos principales

- `src/features/solog/admin/incidencias/admin.incidencias.v2.tsx`
- `src/features/solog/admin/admin.management.v2.ts`
- `src/features/solog/admin/admin.management.store.ts`

### Legacy retirado y criterio

Retirados `rpc_solog_admin('incidents'/'incident_action')`, filtros de fecha y UI con `reviewed / ignore_15d / deleted`.

Cumplido: claves/familias backend, detalle bajo demanda, scope y revisión correctos, tres mutaciones idempotentes sin agregaciones locales.

## A6 — Dispositivos

### Cambios y contratos

- `rpc_solog_admin_devices_v2`: `list`, `authorize`, `replace`, `revoke`, `reject`.
- `list` conserva su forma real: revisiones en cada fila, sin inventar un objeto raíz `revisions`.
- Mutaciones: `{device_id, operation_id, expected_revision}`. No se envía `site_id`; backend lo deriva.
- Autorizar y reemplazar son acciones distintas con confirmación explícita. Rechazar utiliza su acción propia, no revocar.
- Se muestra el dispositivo autorizado y los pendientes de la respuesta de mutación. Como esa respuesta es más estrecha que `list`, se invalida/recarga la lista afectada para obtener nombres y campos completos, sin fabricarlos.
- Conflicto de revisión descarta la intención rechazada y recarga la lista; una nueva confirmación usa el dispositivo y revisión de la lectura actual. Los replays conservan UUID/payload y no retroceden revisiones.
- Invalidación de la sede afectada y lista global; se conservan otras sedes y módulos. Revocación de permisos invalida el shell y los datos Admin.
- Cajero no fue modificado: conserva la invalidación de caché/borradores ante el rechazo de una escritura protegida ya implementada en C1–C3. No se afirma una notificación push a otro dispositivo ni una validación productiva E2E.

### Archivos principales

- `src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx`
- `src/features/solog/admin/admin.management.store.ts`
- Integración con `admin.v2.store.ts` y `admin.v2.app.tsx`.

### Legacy retirado y criterio

Retirados bootstrap Admin legacy, `authorize_device / revoke_device` y rechazo reutilizando revocación, además de shell/contexto/páginas antiguos.

Cumplido: cuatro acciones v2 con revisión/UUID, reemplazo explícito, respuesta autoritativa, conflictos/replays e invalidación selectiva. Unicidad y locks continúan exclusivamente en backend.

## Dependencias compartidas y seguridad

- `ManagementStore` pertenece al store A1 por identidad Auth. Consultas separadas por rol/acción/payload/sede; datasets solo en memoria.
- Intenciones de mutación en memoria, separadas por dominio; un resultado desconocido impide iniciar otra intención de ese dominio hasta reintentar. No se cambia silenciosamente el contenido/revisión de un UUID.
- Pisos de revisión monotónicos; respuestas tardías después de invalidación/dispose, de otra sede/familia/página/rol o anteriores a revisiones conocidas se descartan. Replays antiguos no bajan esos pisos.
- `groups` notifica al store operacional A1; dispositivos/incidencias no vacían indiscriminadamente Dashboard/Control. Logout/scope inválido impiden reutilizar los datos.
- Se eliminó la frontera legacy de `protected-app.tsx`. Rutas no resueltas usan el resolver v2 existente; no vuelven a bootstrap general. No se editaron archivos de implementación Cajero/Detalles. Las guardas de sus entradas y de Index se adaptaron al retiro completo del provider legacy.
- Cada módulo Admin mantiene su carga lazy; presentación común y diálogo de paquete están separados para no cargar todo Grupos al abrir otro módulo. Excel sigue bajo demanda.

## Validaciones

### Automatizadas

- Suite completa: **196 aprobadas, 0 fallidas, 741 aserciones, 25 archivos**.
- Dirigidas nuevas: **40 pruebas** en `admin-management.test.ts` y `admin-management-isolation.test.ts`; además cuatro guardas actualizadas en `admin-groups-contract.test.ts`.
- Cubren diez lecturas, once mutaciones, límites de paginación, scopes, revocación, conflictos, transporte normalizado, replays, UUID/payload estable, invalidez de respuestas tardías, caducidad del período y recuperación/errores de Edge.
- `bun run lint`: exit 0, sin advertencias.
- `bunx tsc -b`: exit 0.
- `bun run build`: exit 0; chunks independientes Catálogo 11.00 kB, Grupos 8.33 kB, Incidencias 4.63 kB, Dispositivos 3.81 kB, sin gzip. Tamaños de esta compilación, no objetivo de egress productivo.
- `git diff --check`: exit 0.

### Browser simulado

- `tests/admin-management.browser.mjs`: **PASS**, 65 llamadas simuladas / 25,858 bytes de respuestas / cero llamadas productivas / cero errores de página.
- Catálogo: aprobar precio, opciones/resolución, preview, error de publicación, recarga de página y recuperación con UUID idéntico/replay.
- Grupos: edición con pérdida de respuesta y replay, creación con `member_codes`, clasificación y precio por paquete.
- Incidencias: resumen, detalle repetido servido desde caché, Ignore 30d con replay, Reactivate, Propose deletion.
- Dispositivos: conflicto de autorización, reemplazo con respuesta perdida y replay, revocación, rechazo; respuesta simulada coherente con lista posterior.
- Regresión `admin-v2.browser.mjs`: PASS A1–A3; Dashboard/Control/turnos/detalles y Excel, 16 llamadas simuladas.
- Regresiones `index-phase1.browser.mjs`, `cajero-v4.browser.mjs`, `details-v2.browser.mjs`: PASS. Portada con cero Supabase; Cajero con bootstrap/historial/replay/expiración; Detalles con cursor, caché, acceso y Excel.
- Capturas revisadas de Catálogo, Incidencias y Dispositivos; sin recortes funcionales detectados en viewport de escritorio.
- Son pruebas de frontend con fixtures. No prueban locks/concurrencia real del servidor ni constituyen E2E productivo. Los bytes medidos son del escenario sintético, no egress real de Supabase.

## Auditoría final, desviaciones y pendientes

- **Consumidores v1 restantes en Admin: ninguno.** Retirados 16 exports de transporte legacy/reemplazados de `api.ts`. No hay acceso frontend directo a `inventario`, uploads de catálogo ni uso de RPC internas.
- Los tipos/helpers puros históricos que aún no transportan datos no se convierten en contratos nuevos ni justifican retirar backend. El `getSologBootstrap` residual fuera del árbol Admin permanece como código histórico no montado; no se ejecuta para resolver rutas actuales.
- Los archivos frontend retirados estaban limpios en baseline y son recuperables desde Git. No se borraron superficies backend: S10 sigue diferido y exige auditoría de consumidores/dependencias externas.
- Se hicieron únicamente las adaptaciones compartidas necesarias del shell/store/routing y sus guardas. No hubo refactor general ni nuevas decisiones de producto.
- No aparecieron incompatibilidades backend nuevas. V6 resolvió el bloqueo de publicación preparada; los ajustes detectados fueron de implementación/fixtures frontend y quedaron corregidos.
- **Integración Global no iniciada.** Esperar revisión y aprobación de A4–A6.
- Cajero conserva `IMPLEMENTACIÓN TÉCNICA COMPLETADA — VALIDACIÓN HUMANA PENDIENTE`. Smoke real: `PENDIENTE — smoke test humano por dispositivo autorizado`, diferido a integración final. Sigue bloqueando el cierre definitivo de G3, cierre global y S10 relacionado, no estos trabajos técnicos.
