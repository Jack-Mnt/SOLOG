# SOLOG — Integración Cajero — KPIs y cobertura Full — Plan frontend P3 V1

**Estado:** PROPUESTA de plan técnico P3 — pendiente de aprobación del usuario. No implementado.
**Fecha:** 2026-10-28.
**Nivel:** B frontend, dependiente de backend Nivel C ya desplegado.
**Rama:** `admin-work`; `master` fuera de alcance.
**Fuente primaria ÚNICA prevalente:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`.
**Contrato remoto congelado:** `docs/SOLOG_Backend_Cajero_KPIs_Cobertura_Full_Contrato_V1.md`.
**Baseline remoto inspeccionado:** `1e28425bdeda933360586de72144f14d4b64d405` (antes de crear este reporte).
**Baseline del workspace local de Codex:** NO VERIFICADO. Obligatorio comprobar HEAD, branch, status y cambios preexistentes antes de cualquier implementación. Este plan se preparó mediante inspección remota del repositorio, no ejecutando Codex ni pruebas en el equipo local.

## 1. Objetivo y límites

Restituir Inicio A1/A2/B/C del Cajero histórico sobre `FullRuntime`, con cobertura oficial global de V6, avance provisional de borradores y presentación coherente con el diseño aprobado. **A2 siempre incluye Flujo Operativo.** La interfaz no inventa cobertura ni disponibilidad de captura.

No modificar backend, Supabase, RPC V6/V7, migraciones, prioridades, reglas Motor, timestamps de sesión/captura, storage/outbox, contenido de payloads V7, ciclo de recuperación/finalización, referencias del snapshot, D.1.4, Historial, Admin, `master` ni limpieza CSS global. Prohibidos refactors generales no relacionados. Preservar todos los cambios preexistentes.

Los archivos históricos V4 son solo **referencia visual**; nunca reactivar `CashierV4Runtime` ni basar la lógica en `pre_session_summary` V4. El prototipo HTML V2 aprobado aporta composición, no fuente de código/contrato.

## 2. Inspección remota y zonas de intervención

- `src/features/solog/cajero/full.contract.ts`: `FullState` y `FullGroup` actuales no validan `operational_summary` ni `coverage_pending_round`; `FullMutation.affected_groups` usa el mismo `FullGroup`. Requiere separar grupo base de grupo enriquecido **solo en V6**, mantener la estructura V7 y validar rangos/fechas/invariantes.
- `src/features/solog/cajero/full.runtime.ts`: `refreshInside` persiste `state.groups`, reconcilia confirmaciones y publica V6; `flushInside` sustituye temporalmente los grupos afectados por valores V7 **sin el booleano nuevo**, luego se refresca V6. No mezclar resumen anterior y grupos actualizados; crear un estado derivado/guardia de frescura acotado, sin alterar outbox ni firmas RPC. `FullDraft.countedAt` y `runtime.getDrafts(session_id)` ya existen.
- `src/features/solog/cajero/full.presentation.ts`: `actionable`, `actionFor` y `stockType` ya filtran prioridad y stock. Añadir aquí o en helper pequeño contiguo los selectores **puros** de cobertura provisional, estado A1/A2/B/C, contadores y seguridad temporal. No cambiar ranking de prioridades.
- `src/features/solog/cajero/full.app.tsx`: Inicio actual muestra inventario, borradores, botón de registro y grupos disponibles, pero no cobertura ni KPIs aprobados. Conserva rutas, guardia HH:59–HH+1:02, expiración/recovery y modales. Es el principal consumidor UX.
- `src/features/solog/cajero/cajero.v4.ui.tsx`, `src/operational.css`, `src/features/solog/cajero/cajero.css`: referencias existentes `CoverageSurface`, `CoverageComplete`, `HomeMetricSurface`, `OperationalFlow`, clases `cajero-coverage-card`, `cajero-progress-ring`, `cajero-home-metric`, `cajero-home-flow`, `cajero-period-complete`. Extraer componentes mínimos o recrear presentación con clases existentes; no acoplar a V4.
- `src/features/solog/cajero/full.css`: ajustes mínimos de composición e indicador confirmado/provisional, únicamente con tokens actuales. No sobreescribir estilo global.
- Tests actuales: `tests/cajero-full-presentacion-regresion.test.ts`, `tests/cajero-full-registro-autocierre.test.ts`, `tests/cajero-full-inicio-snapshot-horario.test.ts`, `tests/cajero-full.browser.mjs`. Las fixtures V6 anteriores carecen del KPI ahora obligatorio; actualizar las fixtures reales de respuesta V6 **sin debilitar validación**. No exigir el booleano a `V7.affected_groups`.

## 3. Fase P3 — Baseline local y plan sin implementación

Codex debe inspeccionar el workspace antes de editar:
1. `git branch --show-current` = `admin-work`; `git rev-parse HEAD`; `git status --short`; `git diff --stat`; `git diff --check`. No reset, checkout, stash ni sobrescritura de cambios preexistentes; informar divergencias respecto al remoto inspeccionado.
2. Inspección dirigida de los módulos, imports, tests, router, `FullRuntime` y clases CSS anteriores (no rehacer un preflight global de SOLOG).
3. Baseline técnico con comandos aplicables y ejecutados: `bun test tests/cajero-full-presentacion-regresion.test.ts tests/cajero-full-registro-autocierre.test.ts tests/cajero-full-inicio-snapshot-horario.test.ts`, `bun run lint`, `bun run build`, `git diff --check`. Anotar errores preexistentes y no corregir ajenos a este bloque.
4. Presentar plan de archivos y cambios mínimos P4/P5, riesgos/alternativas técnicas. **No implementar** hasta recibir aprobación del usuario. Si encuentra divergencia de contrato, devolver a ChatGPT; Codex no modifica backend.

## 4. Fase P4 — Contrato y proyección frontend

**P4.1: Tipos y validación V6.**
- `operational_summary` obligatorio en `CASHIER_STATE` exitoso, no en errores ni V7.
- Validar: `coverage_round in [1,2]`; timestamps ISO UTC parseables y ordenados; totales enteros seguros y no negativos; `counted + pending = total`; porcentaje 0–100 consistente con redondeo a una cifra decimal y `total=0 → percent=0`; `next_action` permitido; cada `CASHIER_STATE.groups[]` con booleano; grupos de V7 sin obligación de flag.
- Garantizar `round_starts_at <= server_now < round_ends_at` para proyección vigente. Si se recibe estado viejo o incoherente, tratarlo como error de contrato, sin pintar KPI inventado.
- Ampliar fixtures de tests Full existentes y añadir casos de parser inválido/válido, V7 intacto, estado vacío, fechas y conteos.

**P4.2: Selectores presentacionales puros.**
- Clasificar A1/A2/B/C usando presencia de sesión y `coverage_pending===0`, con estado vacío específico `coverage_total===0`.
- `provisional_unique`: borradores únicos de `view.session.session_id` con `group_id` en V6, `coverage_pending_round=true`, `countedAt` dentro de la ventana de ronda, y sin confirmación/rechazo definitivo. Recontar grupos una sola vez, no sumar `recovery`; `display_counted=min(total,official+provisional_unique)`. No modificar el resumen remoto.
- Colores azul para oficial y ámbar para provisional, con cantidades distinguibles para accesibilidad.
- Stock 0/negativo solo en estado B, de `stock_theoretical` de sesión y cola de cobertura conforme al contrato, sin contar reconteos. Los KPI de Revisar/Diario son informativos en A2; con sesión, rutas solo si la prioridad Full permite.
- Categorías/modal: progreso de **cola actual** con borradores locales y grupos actualmente disponibles. No conservar denominador histórico.

**P4.3: Frescura y concurrencia cliente.**
- El resultado V7 `affected_groups` carece de flag; no sobrescribir el campo V6 obligatorio con un delta V7. Evitar mostrar cobertura vieja como nueva durante `flushInside` y hasta `refreshInside`; respetar reintentos/receipts y no resetear journal.
- En `round_ends_at`: invalidar cobertura visible anterior y pedir V6 una vez por transición; evitar sondeo continuo, llamadas duplicadas o bucle de refresh fallido. Con red desconectada o reloj no confiable, no marcar cobertura vieja como vigente; no borrar drafts. Mantener guardias de navegación y envío.
- Tests: V7 confirmado/timeout/replay, dos pestañas con evento storage, frontera exacta de ronda, falla refresco, reconexión y cambios de sesión; preservar `FULL_DELIVERY_UNCERTAIN`.

## 5. Fase P5 — UI V4 restaurada sobre Full

**P5.1: Componentes de Inicio.**
- Cobertura horizontal con anillo a la derecha y `n/N`, porcentaje/pendientes; segmento azul oficial + ámbar provisional.
- Cobertura completa compacta solo con `coverage_pending===0` y `total>0`, nunca por borrador 100%.
- KPIs históricos de geometría/tokens; A1 y A2 muestran Flujo Operativo; A2 incluye Revisar y Diario informativos. B muestra Stock 0/negativo, Revisar y Pendientes de registro; C compacto, Revisar, Diario y Pendientes de registro. Se conserva Inventario, Apariencia, cabecera, navegación, inicio/finish y otras interacciones vigentes.
- Flujo Operativo A1/A2 solo explicativo e interactivo entre etapas, sin abrir rutas operativas. Eliminar tarjeta transitoria de `grupos disponibles` como sustituto de KPI; no eliminar señales de recovery, errores ni sesión actuales.

**P5.2: Categorías/modal y navegación contextual.**
- Restaura `n/N contados` de la cola actual, empleando borradores locales sin inventar avance confirmado. No tocar lógica de calculadora ni motivos originales de reconteo (bloque distinto).
- Stock 0/negativo solo navega a `/cajero/conteo?stock=zero|negative` si está habilitado; sincronizar el filtro con cambios de ruta/URL al navegar, sin alterar las acciones ni prioridad backend.
- Control accesible de focus, disabled/aria, accesibilidad del anillo y stepper, sin duplicar CTA.

**P5.3: Responsive y regresión.**
- Reutilizar `operational.css`, `cajero.css`, tokens del DS. Validación móvil/tablet/escritorio y paletas; sin CSS global nuevo ni modificar componentes compartidos de Admin salvo necesidad técnica demostrable.

## 6. Fase P6 — Validación/cierre, prevista

Tests dirigidos, suite `bun test`, `bun run lint`, `bun run build` (incluye `tsc -b`), `git diff --check`; `node tests/cajero-full.browser.mjs` si Playwright/browser instalados. Browser con mocks sin datos productivos para A1/A2/B/C, ronda límite, cobertura 0/0, bloqueados, borradores/confirmaciones, dos pestañas/reintentos, sesión activa/recovery, filtros por stock, rutas no habilitadas, salida HH:59–HH+1:02. Smoke humano Preview de Cloudflare aprobado por el usuario antes de cerrar.

Entregar reporte de archivos modificados, baseline final, pruebas realmente ejecutadas, errores/bloqueos y diferencias respecto a fuente primaria. No considerar probado un escenario no ejecutado. Evitar pushes intermedios innecesarios que disparen builds.

## 7. Bloqueos y decisiones existentes

- **Barrera backend liberada:** `rpc_solog_cashier_bootstrap_v6` con resumen y flag ya desplegado. Codex no debe cambiar backend.
- **No bloquear P4 por 173 migraciones históricas ausentes:** deuda global preexistente, fuera de este alcance. Las ocho Full y la nueva KPI están versionadas.
- **Bloqueo si cambió localmente FullRuntime, router o contrato:** informar archivos/diferencias y cambio mínimo; no integrar encima de cambios ajenos sin conservarlos.
- **Punto de cuidado:** la respuesta `SESSION_STARTED` y los deltas `affected_groups` no tienen KPI. Se obtiene KPI por V6 posterior; la UI debe tolerar la transición.
- **No rediseñar** la prioridad Full `round_coverage → review_for_coverage → review_regular → shift_coverage` ni los reconteos originales faltantes.
- **Punto UX específico:** cobertura global puede ser incompleta cuando no existe trabajo habilitado; KPI visible no concede ruta.

## 8. Criterio de aprobación del plan

El usuario debe aprobar el alcance de P4 (tipos/estado temporal/proyección), P5 (composición + progreso cola actual) y P6 (validación) antes de editar frontend. Codex deberá validar el baseline local real antes de cualquier implementación.
