# SOLOG — UI Dashboard — Fase 5: Drawer diario y consolidación V1

**Estado:** IMPLEMENTACIÓN FRONTEND REGISTRADA — **NO VALIDADA TÉCNICAMENTE** (Fase 6 pendiente).  
**Rama:** `admin-work`; `master` intacta.  
**Fecha:** 2026-10-16, America/Lima.  
**Baseline remoto al iniciar:** `df5a6633475956aeec3059871fc33dfc06598280`.  
**Fuente primaria UI:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md` — congelada.  
**Contrato técnico RPC:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` — congelado.  
**Diseño:** `src/foundations.css`, `src/features/solog/admin/admin.css`, `AdminDialog` y primitivas Admin reutilizadas.  
**Referencia exploratoria:** `docs/prototipos/SOLOG_UI_Dashboard_Prototipo_Final_V1.html` — NO productiva.  

## 1. Archivos y cambios

| Archivo | Cambio |
|---|---|
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.day.tsx` | Nuevo Drawer de fecha única, carga `day` y `day_observations` por sede/fecha, tabla de diferencias confirmadas y observaciones físicas, cursores y errores |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.day.css` | Nuevos estilos locales del Drawer con tokens existentes, tablas normalizadas y responsive |
| `src/features/solog/admin/dashboard/admin.dashboard.metrics.cards.tsx` | Sustituye aviso provisional de fecha por `DashboardDayDrawer`; selección de día sin filtro de turno |
| `src/features/solog/admin/dashboard/admin.dashboard.v2.tsx` | Importa CSS local del Drawer |
| `src/features/solog/admin/admin.css` | Limpia 6760 caracteres de selectores exclusivos del Dashboard heredado; preserva CSS compartido de Control y el Admin |
| `tests/admin-dashboard-v3.test.ts` | Sustituye expectativas legacy `dashboard_cards/shift_grid` por contrato Dashboard V1, acciones permitidas, envoltorio y paneles nuevos |
| `tests/admin-dialog-phase12-closure.test.ts` | Actualiza ruta de inventario de Drawer a `admin.dashboard.metrics.day.tsx`, manteniendo intactos los números y decisiones de AdminDialog V2 |
| `tests/admin-v2.browser.mjs` | Deja como recorrido **Control**; elimina pasos de Dashboard heredado que exigían Snapshot y Drawer antiguo |
| `tests/admin-dashboard-metrics.browser.mjs` | Nuevo harness Dashboard V1, con datos MOCK exclusivamente en pruebas y bloqueo de tráfico externo |
| `tests/admin-dashboard-v3.browser.mjs` | Entry point apunta al nuevo harness de Dashboard V1 |

## 2. Drawer de una fecha (acción day)

- Se abre desde el botón de encabezado de día o cualquier celda de Actividad. **Siempre** recibe `site_id` y `date`, sin `turno`, así que el contenido comprende las físicas de todo ese día.
- Reutiliza `AdminDialog format="drawer"` y sus mecanismos existentes de enfoque, Escape, apilamiento, bloqueo del scroll, cierre y restauración del foco; el ancho es 820 px dentro del máximo permitido de 960 px.
- Muestra `physical_activity.groups_observed/counts/recounts` y `episodes.opened/closed/open_at_day_end` (este último corresponde al cierre de la fecha consultada).
- Renderiza el conjunto **íntegro**, autoritativo, de `confirmed_differences` con nombre, instante físico de confirmación, diferencia y valorizado congelado. **No pagina** confirmaciones ni reconsulta `group_details`. `confirmed_total` indica la cardinalidad.
- `day.quality='no_data'` comunica falta de evidencia como N/D, no como 0 comprobado. Para `partial` expone una advertencia de información histórica parcial. Todos los tiempos aparecen en `America/Lima`.

## 3. Observaciones físicas (acción day_observations)

- La tabla se consulta al disponer del resumen de día, con `limit:25` y `cursor:null` inicial; no reutiliza `observations_initial_cursor` de `day` como si fuera una página.
- Tipo de captura `normal|recount` representado como Conteo/Reconteo; resultado físico `Coincide|Recontar|Confirmada|Inconsistente` autoritativo, con teórico, físico y diferencia.
- `next_cursor` permanece opaco y se reenvía sin mutaciones. Carga incremental de 25; la deduplicación usa `observation_id:kind:observed_at`, porque un reconteo puede conservar el mismo detalle original.
- Cambio de fecha/sede recrea el Drawer mediante `key` única. Error de página posterior conserva las observaciones previas visibles y ofrece reiniciar la lista; las ventanas no se presentan como snapshot MVCC atómico.
- Ningún dato ficticio se incorporó al módulo productivo. Los mocks existen solo en tests.

## 4. Consolidación CSS y tests

- Se retiraron del CSS compartido los selectores obsoletos `.admin-dashboard*`, `.admin-dashboard-daily*` y `.dashboard-period-switch`, con sus estilos responsive específicos. Se conservaron deliberadamente `.admin-button__actions` (usado por Control), `.admin-control-chronology__empty`, `.admin__percentage-action` y `.admin-v2-card`. No hubo cambios en `foundations.css`, el Shell o las primitivas.
- Revisión selectiva de consumidores JSX/Admin antes de retirar CSS: **no se identificaron usos de los selectores Dashboard eliminados** en los módulos revisados. La búsqueda fue por archivos del Admin, no una prueba de uso de estilos por navegador.
- Los tests legacy del Store Admin V2 que cubren `shift_grid/daily_detail` **se conservan** como tests de sus contratos todavía vigentes y no se reescriben para la nueva RPC.
- El harness `tests/admin-v2.browser.mjs` conserva las simulaciones de Control; el nuevo `tests/admin-dashboard-metrics.browser.mjs` debe verificar `overview`, `risk`, `rounds`, `episodes`, `activity`, `day` y `day_observations` de forma aislada, sin tocar producción.

## 5. Alcance y bloqueos

- Se integran las **siete acciones** de `metrics_dashboard_v1` en el frontend. No se modificó la RPC, esquema SQL, permisos, datos de producción ni las funciones Admin V2.
- No se tocaron `master`, páginas de Control/Catálogo/Productos/Grupos/Incidencias, Header, Sidebar, componentes globales de accesibilidad ni la identidad gráfica.
- La inspección remota de GitHub verificó presencia de archivos, SHA y conexiones principales de imports y JSX; el working tree local del usuario no es visible.
- **No se ha probado aún** que el programa compile, cumpla lint ni se renderice correctamente. Los tests nuevos están escritos y pendientes de ejecución. Su contenido MOCK no certifica disponibilidad/permiso real de la RPC en un navegador autenticado.

## 6. Siguiente paso aprobado — Fase 6

Realizar validación técnica consolidada antes de pedir smoke humano:

1. Baseline local o descargable comprobado frente a `admin-work`; `git diff --check`, limpieza y dependencia.
2. `bun test --reporter=dot` completo; actualizar únicamente assertions incompatibles por el reemplazo aprobado, preservar pruebas de módulos ajenos.
3. `bun run lint` y `bun run build` (TypeScript `tsc -b` + Vite), corregir cualquier hallazgo.
4. Ejecutar browser mock Dashboard V1 y Control, en resoluciones desktop/tablet/móvil, comprobar acciones/cursor/foco/Drawer/scroll, regresiones CSS.
5. Revisar la compatibilidad runtime del contrato real V1 con autorización Admin si hay acceso habilitado; si no, señalar explícitamente limitación sin activar cuentas.
6. Repetir comprobaciones afectadas tras las correcciones, emitir reporte de evidencia. Solo después solicitar smoke humano de Fase 7.

**Resultado de Fase 5:** código productivo y tests/harness escritos en `admin-work`; **validación formal y aceptación humana aún pendientes**.
