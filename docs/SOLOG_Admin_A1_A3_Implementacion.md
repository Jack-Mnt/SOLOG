# Admin A1–A3 — implementación técnica para revisión

## Baseline y autoridad

- Branch `master`, commit `a36449ce8209ef04e86170e40f6bf0dd0024246a`.
- Working tree con implementación D1–D3 y notas Cajero/plan preexistentes; preservadas. V5 era un documento untracked del usuario y no fue editado.
- Contrato primario: `SOLOG_Backend_Contratos_Optimizacion_Global_V5.md`; `contract_version = 2`.
- Corrección `20260904041106_solog_shift_grid_totals_site_isolation_v5` confirmada mediante lectura de la definición desplegada. Sin escrituras backend, migraciones, datos preparados ni llamadas operativas reales.

## A1 — shell, contrato y store

- Entrada directa `/admin` y `/admin/control` con un bootstrap administrativo mínimo; sin `rpc_solog_state` ni bootstrap administrativo v1 en estas rutas.
- `rpc_solog_admin_bootstrap_v2(p_payload:{})`: identidad y permisos backend, sedes autorizadas y revisiones. No se usa metadata editable ni dispositivo para autorizar lecturas Admin.
- Store en memoria por instancia Auth/usuario, rol y consulta estable (acción, sede, período, filtros/página). Deduplicación de solicitudes y caché mantenida durante navegación Dashboard/Control.
- Invalidación por `groups` global y `operational` por sede; rechazo de revisiones inferiores, scopes distintos y respuestas pendientes sustituidas. Revisiones `catalog/devices/incidents` se conservan desde bootstrap sin crear consumidores de módulos aún diferidos.
- Refresh, salida y logout invalidan datos y solicitudes pendientes. Errores de autorización retiran datos visibles. Estado Actualizado usa `generated_at`.
- Archivos: `admin.v2.ts`, `admin.v2.store.ts`, `admin.v2.context.tsx`, `admin.v2.app.tsx`, `admin.v2.css`, entrada Admin de `src/protected-app.tsx`.

## A2 — Dashboard

- `rpc_solog_operational_v2`: `dashboard_cards:{}`, `shift_grid:{site_id,period}`, `daily_detail:{site_id,origin_date}`.
- Tarjetas por sede sin agregados globales; cobertura quincenal como barra hasta completar y luego Completada + barra diaria.
- Grid bajo demanda para ambas quincenas. Consume exclusivamente `data.shifts` y `data.totals`; no suma turnos, reconstruye denominadores ni rellena Totales. Corte ausente se muestra como no disponible, no como cero inventado.
- Drawer por fecha de origen con KPI/columnas autoritativos y caché por sede/fecha/revisión. Snapshot nullable y timestamp de confirmación visibles.
- Modal de descarga propietario A3 con sede preseleccionada.
- Archivos: `dashboard/admin.dashboard.v2.tsx`, `src/pages/admin.dashboard.tsx`, utilidades de presentación v2.

## A3 — Control y exportación

- `rpc_solog_operational_v2`: `control_page` con sede, período, estado, búsqueda opcional, página y tamaño 100; fechas solo para custom (UI máximo 92 días). `control_detail:{site_id,group_id}` bajo demanda.
- Resumen y filas provienen de la misma respuesta; filtros/orden/resoluciones backend. No N+1 ni mezcla de páginas/scopes.
- `rpc_solog_control_export_v2({site_id,period})` siempre bajo demanda, sin `operation_id` y sin reutilizar filas visuales.
- Modal único Dashboard/Control; Excel y escritor cargados dinámicamente. Cinco hojas: Resumen, Ajustes, Por recontar, Inconsistentes y Todas.
- Orden y selección de filas conservados exactamente como los datasets backend, sin volver a elegir último confirmado o recalcular diferencias/valoración. Inconsistentes sin valorizado ni columna Stock posterior y con las seis etiquetas congeladas de conteo/reconteo.
- Archivos: `control/admin.control.v2.tsx`, `admin.control.v2.export-dialog.tsx`, `admin.control.v2.export.ts`, `src/pages/admin.control.tsx`.

## Consumidores retirados y compatibilidad temporal

- Retiradas las llamadas y wrappers de `rpc_solog_dashboard`, `rpc_solog_dashboard_site_activity`, `rpc_solog_control`, `rpc_solog_control_detalle`, `rpc_solog_control_export` y sus hooks/vistas sustituidos. Archivos versionados recuperables mediante Git.
- Los consumidores preexistentes de bootstrap general/admin y módulos Catálogo/Grupos/Incidencias/Dispositivos permanecen solo en la frontera legacy diferida A4–A6; no se crean contratos ni consumidores RPC v1 nuevos.
- El store v2 permanece por encima de esa frontera. Al volver de un módulo diferido se invalida conservadoramente Admin, ya que sus mutaciones legacy todavía no notifican revisiones. Es compatibilidad temporal, no implementación anticipada de A4–A6.
- No se retiró ninguna superficie backend. S10 sigue perteneciendo a ChatGPT/Supabase y exige cero consumidores y sus gates.

## Validaciones

- `bun test`: 156 aprobadas, 0 fallidas; 579 aserciones, 23 archivos. Se sustituyeron los criterios Dashboard/Control v1 y se añadieron pruebas v2 de contrato, scopes, revisiones, concurrencia, paginación y workbook.
- `bun run lint`: aprobado, sin avisos. `bunx tsc -b`: aprobado. `bun run build`: aprobado. `git diff --check`: aprobado.
- `tests/admin-v2.browser.mjs`: Auth y RPC simuladas, bloqueo de toda URL externa no simulada. Bootstrap mínimo, lazy por módulos, dos sedes, Total cero y Total distinto de suma de turnos, ambas quincenas, drawer cacheado, 100+1, cronología cacheada, custom, exportación de ambas quincenas/vacía y revocación de acceso.
- XLSX descargados y descomprimidos: cinco nombres de hojas, diferencia numérica autoritativa y columnas exactas de Inconsistentes comprobadas. Revisión visual escritorio/tablet.
- Escenario Admin: 16 llamadas simuladas y 73 230 bytes JSON de respuesta, incluyendo refresh/rechazo y tres exportaciones. Entrada inicial: bootstrap + tarjetas, sin grid, detalle, exportación ni módulos A4–A6. Esto no es una medición de egress productivo.
- Regresiones browser simuladas Index, Cajero C1–C4 y Detalles D1–D3: aprobadas. Ningún archivo fuente de Cajero o Detalles modificado en este bloque.
- Build separa shell Admin, Dashboard, Control y escritor Excel; la librería Excel permanece bajo demanda.

## Estado y límites

- A1–A3 implementadas técnicamente para revisión; no se avanzó a A4–A6.
- Sin nuevos bloqueos contractuales detectados. No se afirma validación E2E de producción ni se realizó un despliegue frontend.
- Cajero: IMPLEMENTACIÓN TÉCNICA COMPLETADA — VALIDACIÓN HUMANA PENDIENTE. Su smoke humano sigue diferido a integración final y continúa siendo gate de cierre definitivo G3/global/S10 relacionado.
