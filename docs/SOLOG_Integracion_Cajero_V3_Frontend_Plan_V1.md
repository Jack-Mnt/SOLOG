# SOLOG — Integración Cajero V3 Frontend — Plan V1

**Estado:** APROBADO Y CONGELADO

**Fecha:** 12 de septiembre de 2026

**Alcance:** migración exclusiva del frontend Cajero desde las RPC V2 hacia Cajero V3

## 1. Objetivo y autoridad

Migrar Cajero al flujo:

```text
bootstrap_v3 compacto sin sesión
→ start con panel congelado completo
→ navegación local sin lecturas operativas adicionales
→ save_batch / recount_save_batch con panel_delta
→ finish mínimo
→ bootstrap_v3 compacto
```

La fuente primaria es `docs/SOLOG_Backend_Cajero_Eficiencia_Contrato_V1.md`. La migración desplegada `supabase/migrations/20260912130028_solog_cashier_efficiency_contract_v3.sql` se usa únicamente como evidencia de la forma efectiva de las respuestas. Ante contradicciones con documentación o pruebas históricas, prevalece el contrato V3.

La migración frontend consumirá exclusivamente:

- `rpc_solog_cashier_bootstrap_v3`;
- `rpc_solog_cashier_mutate_v3`;
- `rpc_solog_cashier_history_v2`, que continúa vigente para Historial Hoy/Ayer.

Supabase, migraciones, RPC, tablas, Motor V3 y contratos backend quedan fuera de alcance.

## 2. Baseline técnico

### 2.1 Arquitectura actual

El módulo está concentrado en `src/features/solog/cajero/`:

- `cajero.v2.api.ts` contiene transporte y validación runtime de bootstrap/mutaciones V2.
- `cajero.v2.ts` declara los tipos wire V2.
- `cajero.v2.store.ts` es la autoridad de sesión en memoria, serializa mutaciones, conserva una intención incierta con payload y `operation_id`, controla generaciones/dispose y coordina invalidación de drafts e Historial.
- `cajero.v2.context.tsx` crea una instancia por usuario, hace el bootstrap inicial y descarta el store al desmontar.
- `cajero.session.ts` deriva localmente Conteo, Diario y Revisar desde el panel; no realiza RPC por navegación.
- `cajero.flush.ts` serializa el flush global, envía batches y elimina drafts únicamente después de confirmación autoritativa.
- `cajero.storage.ts` mantiene drafts en memoria y conserva timestamps capturados por el cliente.
- `cajero.capability.ts` y `cajero.stock.ts` restringen localmente capacidades y tiempo sin ampliar permisos backend.
- `cajero.history.ts` mantiene transporte y caché independiente sobre `rpc_solog_cashier_history_v2`.
- `cajero.inicio.tsx`, `cajero.conteo.tsx`, `cajero.diario.tsx`, `cajero.revisar.tsx` y `cajero.header.tsx` consumen el panel del store.

### 2.2 Dependencias V2 detectadas

El único transporte productivo de bootstrap/mutación Cajero V2 está en `cajero.v2.api.ts`:

```text
rpc_solog_cashier_bootstrap_v2
rpc_solog_cashier_mutate_v2
```

El runtime actual depende de estas propiedades V2:

- `contract_version = 2`;
- `session_state` en bootstrap;
- `panel_state` siempre presente, incluso antes de iniciar sesión;
- `panel_state.source` y `panel_state.frozen`;
- `state` completo devuelto por cada mutación;
- `panelFromState()` para reconstruir todo el panel después de mutar.

`CashierStore.startAndRefresh()` ejecuta `start` y luego un bootstrap adicional. `CashierDraftCoordinator` también refresca después de reintentar un `start`. Ambas lecturas contradicen el flujo V3, donde `start` ya devuelve el panel completo.

Después de `save_batch` y `recount_save_batch` no existe hoy un bootstrap explícito ordinario, pero el store reemplaza el panel usando el `state` completo de la respuesta V2. V3 exige aplicar `panel_delta` sobre el panel congelado local.

Después de `finish`, `cajero.flush.ts` ejecuta un refresh. Esa secuencia continúa siendo válida si primero se confirma la respuesta mínima V3 y luego se realiza un único bootstrap compacto.

### 2.3 Estado, drafts, recovery e Historial reutilizables

Se pueden conservar:

- una instancia de store por usuario y el descarte por epoch/generation;
- intención única con `operation_id`, payload serializado y retry exacto;
- validación de usuario, sede, dispositivo, sesión y revisiones;
- máximo de 500 items y validación de pertenencia a las colas;
- timestamps originales en los drafts y payloads;
- drafts exclusivamente en memoria;
- flush serializado y eliminación de drafts tras confirmación;
- aislamiento por usuario/sede/dispositivo/sesión;
- recovery V8: captura deshabilitada y entrega pendiente habilitada;
- derivación local de Conteo, Diario y Revisar desde el panel congelado;
- invalidación selectiva de Historial por revisión, fecha y detalle;
- Historial Hoy/Ayer mediante V2.

### 2.4 Diferencias frente a V3

| Área | Runtime actual V2 | Contrato V3 |
| --- | --- | --- |
| Bootstrap sin sesión | panel completo pre-sesión | `panel_state = null` y `pre_session_summary` compacto |
| Dispositivo no autorizado | forma basada en panel V2 | panel y resumen nulos |
| Restauración | `session_state` y panel | una sola copia completa en `panel_state` |
| Start | mutación y bootstrap posterior | respuesta de start instala el panel directamente |
| Save/Recount | reemplazo desde `response.state` completo | aplicación local de `panel_delta` |
| KPI | llegan dentro del state completo | `panel_delta.kpis` autoritativo reemplaza KPI local |
| Finish | store espera semántica de state | respuesta mínima y bootstrap compacto posterior |
| Contrato | versión 2 | versión 3 |

`cajero.inicio.tsx` calcula el resumen pre-sesión desde grupos completos mediante `deriveCajeroProgress`. Debe consumir `pre_session_summary` cuando no hay sesión. Durante sesión puede seguir derivando filtros locales desde los grupos congelados, mientras los KPI base proceden del backend.

### 2.5 Pruebas acopladas al contrato anterior

Las pruebas y fixtures con dependencias explícitas de `session_state`, `response.state`, `panelFromState`, RPC V2 o bootstrap post-start incluyen principalmente:

- `tests/fixtures/cashier-v4.mjs`;
- `tests/cajero-v4.test.ts` y `tests/cajero-v4.browser.mjs`;
- `tests/cajero-v7-delta.test.ts`;
- `tests/cajero-v8.test.ts` y `tests/cajero-v8.browser.mjs`;
- `tests/cajero-flush.test.ts`;
- `tests/cajero-progress.browser.mjs`;
- `tests/cajero-session-entry.browser.mjs`;
- `tests/global-g1.test.ts` y `tests/global-g2.test.ts`;
- `tests/details-phase1.browser.mjs`, por su mock global del bootstrap Cajero;
- `tests/s10-frontend.test.ts`, que congela todavía el nombre de la RPC V2.

Las pruebas funcionales de cálculo, captura, navegación, recovery, expiración, aislamiento, flush e Historial siguen siendo relevantes; deben migrarse de fixture/transport sin relajar sus invariantes.

## 3. Arquitectura frontend objetivo

### 3.1 Modelo V3

Crear tipos wire discriminados por acción:

- `CashierBootstrapV3` con `panel_state` nullable y `pre_session_summary` nullable;
- `CashierStartResult` con `stock` y panel completo;
- `CashierSaveBatchResult` y `CashierRecountBatchResult` con `items`, `panel_delta`, capacidad y revisiones;
- `CashierFinishResult` con estado/finalización mínimos;
- unión `CashierMutationResult` discriminada por `action`.

El validador runtime debe comprobar `contract_version = 3`, coherencia de las tres formas de bootstrap, forma específica de cada acción, timestamps, revisiones, unicidad/referencias del panel y estructura del delta. No debe duplicar reglas del Motor ni inventar KPI.

### 3.2 Autoridad de estado

El store seguirá siendo la única autoridad frontend. Mantendrá el último bootstrap V3 y, cuando exista sesión, un `panel_state` completo congelado. No conservará `session_state` ni un state completo paralelo.

La transición de estado será:

- bootstrap: reemplazo autoritativo completo;
- start confirmado/replay: instalar directamente `stock`, `session_capability`, revisiones y `panel_state` de la respuesta;
- save/recount confirmado/replay: aplicar el delta al panel de la misma sesión, reemplazar KPI y capacidad/revisiones;
- finish confirmado/replay: cerrar la intención y registrar la confirmación antes del bootstrap post-finish; el fallo de ese bootstrap es un fallo de sincronización, no una finalización incierta.

### 3.3 Aplicación idempotente de `panel_delta`

Un reducer puro e inmutable debe:

- aplicar cada `groups_patch` por `grupo_id`, preservando campos congelados no incluidos;
- retirar de `count_queue` los IDs de `count_queue_remove`;
- retirar de `review_queue` los detalles de `review_queue_remove`;
- reemplazar por completo los KPI locales con `panel_delta.kpis`;
- rechazar deltas de sesión/revisión/contexto incompatibles antes de publicarlos.

Patch, remoción por ID y reemplazo de KPI deben producir el mismo resultado si se aplica nuevamente un replay sobre el mismo estado ya actualizado. No habrá incrementos optimistas de cobertura, pendientes o resultados.

### 3.4 Idempotencia, concurrencia y ciclo de vida

- Una intención incierta conserva exactamente `operation_id`, acción, payload y timestamps.
- Retry de transporte usa el mismo payload y UUID.
- Respuesta autoritativa, incluido replay, cierra la intención.
- Un payload distinto nunca reutiliza el UUID.
- El store continúa serializando mutaciones y el flush continúa serializando batches.
- Una respuesta de otro usuario/sede/dispositivo/sesión, inferior a las revisiones observadas o posterior a dispose se descarta.
- El bootstrap inicial y los refresh explícitos continúan deduplicándose.
- No se añade polling ni persistencia durable de drafts.

## 4. Plan de implementación

### Fase 1 — Contrato frontend V3 y modelo de deltas

**Objetivo exacto**

Incorporar el contrato wire V3, su transporte, validadores runtime y un reducer puro de `panel_delta`, sin activar todavía la nueva API en la UI productiva.

**Archivos principales esperados**

- Crear `src/features/solog/cajero/cajero.v3.ts`.
- Crear `src/features/solog/cajero/cajero.v3.api.ts`.
- Crear `src/features/solog/cajero/cajero.v3.panel.ts` si el reducer no queda suficientemente aislado en el modelo.
- Crear fixture V3 específico en `tests/fixtures/`.
- Crear `tests/cajero-contract-v3.test.ts` y pruebas unitarias del reducer.

**Cambios concretos**

- Tipar las tres formas coherentes de bootstrap: pre-sesión, no autorizado y sesión/recovery.
- Tipar por separado start, save, recount y finish.
- Validar ausencia conceptual de `session_state` y de state/panel completo en save/recount/finish.
- Implementar llamadas a `rpc_solog_cashier_bootstrap_v3` y `rpc_solog_cashier_mutate_v3`.
- Implementar aplicación inmutable e idempotente de patches, remociones y KPI autoritativos.
- Mantener la API V2 activa solo durante esta fase para no dejar el flujo productivo parcialmente migrado.

**Debe permanecer intacto**

Store productivo, UI, navegación, Motor, drafts, flush, recovery e Historial V2.

**Tests dirigidos**

- contrato 3 y rechazo de contrato/acción/formas incoherentes;
- bootstrap compacto autorizado, no autorizado y sesión/recovery;
- start con panel completo;
- save/recount con delta y finish mínimo;
- patch que preserva datos congelados;
- remoción de colas;
- KPI reemplazados, no sumados;
- replay/doble aplicación idempotente;
- rechazo de IDs, duplicados, timestamps o revisiones incompatibles;
- transporte con nombres RPC V3 y mocks, sin llamadas reales a Supabase.

**Validaciones de cierre**

Tests nuevos, pruebas unitarias Cajero afectadas, TypeScript, lint y `git diff --check`.

**Riesgos/dependencias**

La validación no debe ser más restrictiva que el contrato. Esta fase es dependencia obligatoria de las fases 2 y 3.

### Fase 2 — Bootstrap, start y restauración V3

**Objetivo exacto**

Cambiar la autoridad activa de bootstrap/start a V3, instalar directamente el panel devuelto por start y adaptar la UI al resumen compacto y al panel nullable.

**Archivos principales esperados**

- `src/features/solog/cajero/cajero.v2.store.ts` o su reemplazo V3, sin mantener dos stores activos.
- `src/features/solog/cajero/cajero.v2.context.tsx` y `cajero.app.tsx`.
- `src/features/solog/cajero/cajero.session.ts`.
- `src/features/solog/cajero/cajero.capability.ts`.
- `src/features/solog/cajero/cajero.stock.ts`.
- `src/features/solog/cajero/cajero.inicio.tsx`.
- `src/features/solog/cajero/cajero.header.tsx`, `cajero.tsx` y guardas de vistas operativas cuando proceda.
- Pruebas unitarias/browser de entrada e inicio.

**Cambios concretos**

- Bootstrap inicial mediante V3 y normalización de sus tres estados válidos.
- Tratar `panel_state = null` como estado normal antes de sesión o sin autorización.
- Renderizar Inicio pre-sesión desde `pre_session_summary`, incluidos conteos por stock, sin reconstruir grupos.
- Instalar el panel completo de `start` en una única transición local.
- Eliminar el bootstrap inmediato posterior a start y el estado `pendingCapabilitySession` que solo justificaba esa segunda lectura, si deja de tener función.
- Restaurar tras reload desde el panel completo del bootstrap activo/recovery.
- Mantener navegación Conteo/Diario/Revisar local y protegerla cuando no existe panel de sesión.
- Usar `stock` y capacidades V3 como autoridad sin ampliar permisos localmente.

**Debe permanecer intacto**

UI visual salvo estados necesarios, rutas, recuperación V8, temporizadores, aislamiento, drafts en memoria, Historial V2 y reglas del Motor.

**Tests dirigidos**

- una RPC de bootstrap al montar;
- pre-sesión compacta sin grupos;
- no autorizado sin fuga de resumen/panel;
- start instala panel y no ejecuta bootstrap posterior;
- replay de start;
- reload con sesión activa y recovery;
- navegación local sin RPC adicionales;
- capability active/recovery/expired;
- cambio de identidad/dispositivo/sede y respuesta tardía tras dispose.

**Validaciones de cierre**

Pruebas de bootstrap/start/session-entry y browser relacionadas, TypeScript, lint, build y `git diff --check`.

**Riesgos/dependencias**

El panel nullable afecta varios consumidores. El cambio debe ser atómico: ningún componente operativo puede asumir panel pre-sesión. El transporte V3 de Fase 1 debe estar cerrado antes de activar esta fase.

### Fase 3 — Mutaciones incrementales, flush y KPI

**Objetivo exacto**

Migrar `save_batch` y `recount_save_batch` al delta V3, preservando drafts, timestamps, idempotencia, atomicidad y recuperación.

**Archivos principales esperados**

- Store Cajero activo.
- `src/features/solog/cajero/cajero.flush.ts`.
- `src/features/solog/cajero/cajero.session.ts`.
- `src/features/solog/cajero/cajero.progress.ts` y vistas solo si necesitan aceptar el panel V3.
- `src/features/solog/cajero/cajero.storage.ts` únicamente si los tipos de confirmación lo exigen.
- Fixtures y pruebas de flush, delta, progress, Conteo y Revisar.

**Cambios concretos**

- Sustituir toda dependencia de `response.state`/`panelFromState` por el reducer de delta.
- Validar que respuesta y delta pertenecen al conteo, revisión y contexto vigentes.
- Publicar panel, capacidad y revisiones en una transición coherente antes de notificar consumidores.
- Reemplazar KPI con los recibidos; no incrementar cobertura ni pendientes localmente.
- Mantener el payload exacto y los timestamps originales durante retry/replay.
- Retirar drafts normales/reconteo solo a partir de `items` confirmados.
- Conservar invalidación selectiva de Historial usando items/timestamps autoritativos.
- Evitar bootstrap después de save/recount y cualquier RPC al cambiar entre Conteo, Diario y Revisar.

**Debe permanecer intacto**

Calculadora/captura, reglas de stock físico, Motor V3, batch máximo, atomicidad, memoria efímera de drafts, Historial V2 y UI visual.

**Tests dirigidos**

- save y recount de uno/múltiples items;
- patch parcial que conserva nombre, SKU, precio y snapshot congelados;
- remoción correcta de colas;
- KPI autoritativos y replay sin doble conteo;
- flush normal/global y limpieza solo tras confirmación;
- transporte incierto y retry con mismo UUID/payload/timestamps;
- payload distinto con intención pendiente rechazado;
- recovery permite entrega y prohíbe captura;
- expiración final impide entrega;
- respuesta obsoleta o de otra sesión descartada;
- cero bootstrap adicionales y cero llamadas reales a Supabase en tests.

**Validaciones de cierre**

Suites de delta, flush, recovery, capture, progress y browser relacionadas; TypeScript, lint, build y `git diff --check`.

**Riesgos/dependencias**

El orden observable debe seguir siendo: delta autoritativo adoptado, luego eliminación de drafts confirmados. Un replay debe converger al mismo panel aun cuando la respuesta original se haya perdido.

### Fase 4 — Finish, integración, limpieza V2 y validación global

**Objetivo exacto**

Cerrar la finalización V3, validar el flujo completo, retirar el consumo V2 de bootstrap/mutación y conservar únicamente Historial V2.

**Archivos principales esperados**

- Store/context y `cajero.flush.ts`.
- Todas las pruebas/fixtures Cajero aún acopladas a V2.
- `tests/s10-frontend.test.ts` y mocks transversales estrictamente afectados.
- Eliminar `cajero.v2.api.ts`, `cajero.v2.ts`, `panelFromState` y fixtures/helpers exclusivos V2 cuando ya no tengan consumidores.
- Renombrar archivos store/context solo si evita referencias V2 reales y el diff sigue siendo dirigido; no hacerlo por estética.

**Cambios concretos**

- Confirmar finish desde su respuesta mínima, cerrar la intención y luego ejecutar un bootstrap V3 compacto.
- Si el bootstrap post-finish falla, conservar finish como confirmado y presentar fallo de sincronización recuperable; no retransmitir finish ni crear otro UUID por ese fallo.
- Validar finish replay, expirado/finalizado y logout seguro.
- Revalidar recovery V8, reload, flush global e Historial Hoy/Ayer.
- Eliminar nombres RPC V2 de la superficie Cajero activa y expectativas antiguas de bootstrap post-start/state completo.
- Mantener `rpc_solog_cashier_history_v2` y su caché sin cambios contractuales.
- Ejecutar búsqueda estática final y retirar solo código V2 sin consumidores reales.

**Debe permanecer intacto**

Motor V3, historial V2, UI/UX, rutas, Admin, Detalles, Index, drafts en memoria y backend.

**Tests dirigidos y globales**

- flujo bootstrap compacto → start → navegación → save → recount → finish → bootstrap compacto;
- finish confirmado con bootstrap posterior exitoso/fallido y retry solo de sincronización;
- recovery, expiración, idempotencia y aislamiento;
- Historial Hoy/Ayer V2;
- pruebas browser Cajero disponibles;
- búsqueda estática: ninguna llamada a bootstrap/mutate V2, ningún `session_state`, ninguna dependencia de mutation `state`;
- comprobar que la única RPC Cajero V2 restante sea history V2;
- suite Cajero completa y suite global para detectar regresiones.

**Validaciones de cierre**

`bun test` dirigido y completo, `tsc -b`, `eslint .`, `bun run build` o `bunx vite build` para aislar un baseline TypeScript conocido, y `git diff --check`.

**Riesgos/dependencias**

Los mocks browser globales pueden contener RPC V2 aunque la prueba no sea exclusivamente de Cajero; deben actualizarse sin ampliar cambios a otros módulos. La limpieza solo procede después de demostrar ausencia de consumidores.

## 5. Criterios globales de aceptación

- Cajero activo usa `rpc_solog_cashier_bootstrap_v3` y `rpc_solog_cashier_mutate_v3`.
- `rpc_solog_cashier_history_v2` permanece operativo y es la única RPC V2 Cajero vigente en frontend.
- No existe `session_state` en el modelo activo.
- Start no provoca un bootstrap redundante.
- Save/recount no esperan ni reconstruyen un state completo.
- Todo `panel_delta` se aplica de forma idempotente y KPI se reemplaza autoritativamente.
- Finish confirmado no se vuelve incierto por fallo del bootstrap posterior.
- Conteo, Diario y Revisar navegan localmente sin RPC adicionales.
- Recovery V8, drafts en memoria, timestamps, scopes e idempotencia se preservan.
- Tests no realizan llamadas reales a Supabase.
- No se introducen polling, persistencia durable ni cambios visuales ajenos a V3.

## 6. Legacy temporal y retirada

Hasta completar la Fase 4 pueden permanecer temporalmente, con consumidores identificados:

- tipos/API V2 usados por el runtime anterior mientras se activa V3 por fases;
- fixture `tests/fixtures/cashier-v4.mjs` y tests históricos aún no migrados;
- nombres históricos de archivos store/context si renombrarlos no aporta una eliminación funcional.

Después de la migración son candidatos a eliminación:

- `cajero.v2.api.ts`;
- `cajero.v2.ts`;
- `panelFromState`;
- campos, ramas y validadores de `session_state`/mutation `state`;
- mocks que esperan bootstrap post-start;
- aserciones que consideran bootstrap/mutate V2 la autoridad actual.

No es candidato a eliminación `cajero.history.ts` ni `rpc_solog_cashier_history_v2`.

## 7. Riesgos y bloqueos

### Riesgos frontend

- Propagación de `panel_state` nullable a componentes que hoy lo consideran obligatorio.
- Aplicar un delta a un panel de otra sesión o revisión si no se valida el contexto antes de publicar.
- Duplicar KPI si se conserva algún incremento local además del reemplazo autoritativo.
- Borrar drafts antes de validar los items confirmados.
- Confundir fallo de bootstrap post-finish con incertidumbre de finish.
- Mantener mocks globales V2 que oculten consumo legacy real.

Estos riesgos están cubiertos por los límites de fase y las pruebas indicadas.

### Bloqueos backend

No se encontró ningún bloqueo. El contrato y la migración desplegada ofrecen bootstrap compacto, panel de start/restauración, deltas de save/recount, finish mínimo, revisiones, capacidades e idempotencia suficientes para la migración frontend.

**Backend V3 compatible; implementación frontend puede continuar contra el contrato congelado.**

## 8. Fuera de alcance

- Cualquier modificación a Supabase, SQL, migraciones, RPC, tablas o contratos.
- Cambios a Motor V3 y sus decisiones.
- Cambios contractuales a Historial V2.
- Rediseño visual o de navegación.
- Polling o persistencia durable de drafts.
- Refactors generales y cambios a Admin, Detalles o Index que no sean una adaptación estrictamente necesaria de un mock/entrada Cajero.
