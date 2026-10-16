# SOLOG — UI Dashboard — Fase 6: Validación técnica consolidada V1

**Estado:** VALIDACIÓN TÉCNICA CONSOLIDADA APROBADA; **SMOKE HUMANO PENDIENTE (FASE 7)**.
**Fecha:** 2026-10-16, America/Lima.
**Rama exclusiva:** `admin-work`. `master` no se modificó.
**Fuente primaria UI vigente:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md` (congelada).
**Contrato RPC vigente:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` (congelado).
**Backend:** sin cambios; ninguna migración, RPC, permiso, RLS o Edge Function modificada.
**HEAD DE CÓDIGO VALIDADO:** `bbc6f0ff79dca7cceecfa80830d67d0cd083e423`.
**CI de validación final:** [GitHub Actions · run 38973746979](https://github.com/Jack-Mnt/SOLOG/actions/runs/38973746979) — **conclusion: success**. Los commits posteriores que solo incorporen este reporte no forman parte del árbol validado, aunque no alteran el código.
**Baseline antes de Fases 0–5:** `4cb3e9f4b63cc7c2de681ef70b8fa7d1bed47944`.

## 1. Validaciones efectivamente ejecutadas

| Control | Resultado probado | Evidencia |
|---|---|---|
| `bun install --frozen-lockfile` | PASS | Workflow GitHub Actions del run final |
| `bun test --reporter=dot` | **789 pass / 0 fail**, 87 archivos | Run final |
| `bun run lint` | **PASS, cero errores y cero advertencias ESLint** | Run final |
| `bun run build` | **PASS**, incluye `tsc -b` y build Vite | Run final |
| `git diff --check 4cb3e9f4... HEAD` | PASS, sin whitespace/hunks incorrectos | Run final |
| Navegador Dashboard V1 | PASS, mock HTTP sin tráfico a producción | `tests/admin-dashboard-v3.browser.mjs` → `tests/admin-dashboard-metrics.browser.mjs` |
| Navegador Control V2 | PASS, regresión de Control incluyendo filtros, cronología y exportación | `tests/admin-v2.browser.mjs` |
| Responsive Dashboard | PASS, 1440 / 1024 / 850 / 430 px, sin overflow de documento/body | Mismo browser harness Dashboard |
| Matriz Actividad | PASS, scroll interno en 20 días, carga 5→10→15→20 | Mismo browser harness |
| Cambio de sede | PASS, expansión exclusiva, limpieza del panel anterior | Mismo browser harness |
| Drawer | PASS, apertura desde fecha, físicas sin filtro de turno, carga inicial/segunda página y Escape | Mismo browser harness |

La última ejecución simulada registró las acciones:
`bootstrap:1`, `overview:1`, `risk:3`, `rounds:1`, `episodes:2`, `activity:4`, `day:1`, `day_observations:2`. **Llamadas a producción: 0.**

Responsive (valores `viewport / document / body`): 1440/1440/1440, 1024/1024/1024, 850/850/850 y 430/430/430. La matriz tiene ancho desplazable interno y no arrastra el documento.

## 2. Incidencias detectadas y resueltas

La primera batería completa produjo **772 aprobadas, 17 fallidas**, TypeScript bloqueado, cuatro errores de lint y fallos en `git diff --check`. No se ocultaron fallos ni se aceptaron tests obsoletos como fuente funcional.

1. **Bootstrap/StrictMode:** el Dashboard inicialmente quedaba cargando porque el Store V1 se disponía durante el montaje simulado de React 19. Solución: `useAdminQuery('bootstrap', {})` con suscripción reactiva y `DashboardMetricsStore.mount()`, con generación de montaje y disposición diferida mediante microtarea. Verificado por navegador y sin advertencias React en el último lint.
2. **Tipos:** eliminado `nInteger` no utilizado de `admin.dashboard.metrics.contract.ts`. Build/typecheck aprobados después.
3. **Estados en efectos:** diferida la publicación de estados derivados de carga y paginación mediante microtareas controladas; `useDashboardMetrics` conserva retención de clave/sede/acción y retry explícito.
4. **Tests obsoletos:** referencias estáticas a `daily_detail`, `shift_grid`, KPI anterior y `AdminExportDialog` del Dashboard actualizadas a `metrics_dashboard_v1`, nuevos subcomponentes, `AdminDialog` de fecha, tablas `admin-main-table` / `admin-auxiliary-table` y paginación keyset. Los tests de las interfaces heredadas **que Control todavía utiliza no se eliminaron**.
5. **Control custom:** un test dependía de fechas históricas que habían quedado fuera de la ventana de validación; se actualizaron exclusivamente sus datos y expectativas, no el validador/backend.
6. **Espacios finales:** limpiados exclusivamente en la fuente primaria UI y los reportes F3–F5 para cumplir `git diff --check`.
7. **Harness navegador:** la prueba del Dashboard nuevo se independizó de Control. Se verifican las siete acciones con fixtures solo en tests, sin invocar Supabase real.
8. **React warning:** la gestión de generación de montaje se trasladó al Store de Dashboard para evitar escribir en un objeto devuelto por un hook. Lint final sin advertencias.

Secuencia de control en GitHub Actions: fallos iniciales → 784/789 aprobados → 789/789 aprobados → navegador y responsive aprobados → **run final completamente verde**. No se declara validado nada que no haya ejecutado el job.

## 3. Design System y regresiones

- `src/foundations.css` conserva la fuente autoritativa de tokens de SOLOG.
- El Dashboard usa `admin-v2-card`, `admin-main-table`, `admin-auxiliary-table`, `AdminBinarySwitch`, `AdminSort`, `AdminDialog`, `QueryState`, controles `button` y estilos `solog-dash__*` aislados; no se creó un Design System paralelo.
- CSS heredado `admin-dashboard*` se retiró cuando ya no había consumidores, preservando controles compartidos de Control. La regresión Control V2 validó cronología y exportación.
- No se alteró `master`, el Shell, Sidebar, Header, Catálogo, Productos, Grupos, Incidencias ni Supabase.

## 4. Alcance y límites de la evidencia

- Los tests de navegador se ejecutaron contra **respuestas simuladas de la RPC V1**. Esto verifica integración React/DTO/UX de las acciones, pero **no demuestra** permisos, disponibilidad HTTP real, egress o integridad de datos de producción para una cuenta Admin autorizada.
- No se habilitó ninguna cuenta ni se realizaron cambios de backend para el test. El **smoke humano de Fase 7** debe comprobar sesión autorizada y datos reales en Preview.
- Aunque los 4 tamaños pasaron el control de overflow e interacciones, la aprobación visual humana de textos, densidad, sensación de interacción y precisión real requiere la Fase 7.
- GitHub Actions se configuró con **trigger exclusivo de cambios al archivo del workflow**, para evitar ejecuciones innecesarias con cada push de `admin-work`. No activa despliegues Cloudflare.

## 5. Paso siguiente: Fase 7, smoke humano

El usuario debe verificar en Preview o en el entorno autorizado:

1. Acceso Admin y 5 sedes, expansión/colapso, barra de ronda y KPI con calidad parcial/N/D.
2. Riesgo: 6 registros iniciales, orden y siguiente cursor; Rondas: hitos de 50/90/100 como duración real y gráfico histórico disponible/N/D.
3. Episodios: ámbitos abiertos/cerrados, 25 por página, calidad y persistencia; Actividad: 5/10/15/20 fechas Lima, turnos en filas, `Sin tareas` vs `N/D`.
4. Drawer de **fecha única**: conteos/reconteos, episodios, confirmaciones completas, observaciones paginadas; cierre por Escape/X/backdrop y retorno del foco.
5. Desktop/tablet/móvil con matriz desplazable solo internamente; Control y exportación intactos.
6. Comprobar **HTTP real** de `metrics_dashboard_v1` con rol permitido y datos remotos sin errores de RLS. Registrar cualquier caso sin datos en lugar de fabricar cifras.

**Resultado:** Fase 6 **técnicamente aprobada** con evidencia de CI; Fase 7 **sin ejecutar**, pendiente de smoke y aceptación explícita del usuario. No fusionar con `master` ni declarar cierre del Dashboard todavía.
