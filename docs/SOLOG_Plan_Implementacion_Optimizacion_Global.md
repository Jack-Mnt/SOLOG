# SOLOG — Plan vigente de implementación frontend contra backend v2

**Estado vigente:** I1–I2 aprobadas y cerradas; Cajero con implementación técnica completada y validación humana pendiente; D1–D3 aprobadas técnicamente; A1–A3 implementadas técnicamente, pendientes de revisión del usuario. A4–A6 no iniciadas. Los apartados de baseline siguientes conservan el diagnóstico histórico previo a implementar. Evidencia A1–A3: `docs/SOLOG_Admin_A1_A3_Implementacion.md`.

**Fecha de baseline:** 2026-09-03.

**Contrato de integración vigente:** `docs/SOLOG_Backend_Contratos_Optimizacion_Global_V5.md`, congelado y desplegado; APIs con `contract_version = 2`. V1–V4 quedan históricas. Checkpoint A2 confirmado en solo lectura: `20260904041106_solog_shift_grid_totals_site_isolation_v5`; Totales aislados por sede sin reconstrucción frontend.

## 0. Autoridad, alcance y baseline

### Autoridad documental

1. Las decisiones funcionales provienen de `docs/SOLOG_Decisiones_Congeladas_Optimizacion_Global.md`.
2. La referencia técnica backend declarada es `docs/SOLOG_Backend_Optimizacion_Global_V1.md`.
3. Toda firma, acción, payload, respuesta, revisión, autorización, error, replay, paginación, Edge Function y Cron para integración frontend proviene de `docs/SOLOG_Backend_Contratos_Optimizacion_Global_V5.md`.
4. `docs/SOLOG_Backend_Contratos_Optimizacion_Global_V1.md` queda reemplazado/histórico y no es autoridad para consumidores nuevos.
5. El contrato documental V5 prevalece sobre cualquier supuesto anterior de este plan. El frontend no agrega wrappers, campos, acciones, normalizaciones ni fallbacks no documentados.

### Baseline Git y cambios preexistentes

- Branch: `master`.
- Commit: `d73c1d44dc81fe8216c2750f8012196c1c77a29a`.
- Working tree antes de esta corrección: limpio; sin cambios tracked ni archivos untracked.
- Documentos presentes en `docs`: decisiones congeladas, contrato V2 y este plan. Los archivos declarados `SOLOG_Backend_Optimizacion_Global_V1.md` y `SOLOG_Backend_Contratos_Optimizacion_Global_V1.md` no están presentes en este checkout; el segundo es histórico y la ausencia del primero no bloquea esta corrección porque el contrato V2 vigente documenta exhaustivamente las superficies frontend afectadas.
- Esta tarea modifica únicamente este plan y preserva el contrato V2 y las decisiones congeladas.

### Baseline del repositorio

- `src/features/solog/api.ts` y `src/features/solog/cajero/cajero.api.ts` consumen solamente contratos v1: `rpc_solog_state`, `rpc_solog_count`, `rpc_solog_details`, `rpc_solog_admin`, `rpc_solog_catalog`, `rpc_solog_dashboard`, `rpc_solog_dashboard_site_activity`, `rpc_solog_control`, `rpc_solog_control_detalle` y `rpc_solog_control_export`.
- No existe ningún consumidor RPC v2 en `src`. Las pruebas browser también interceptan v1 y deberán migrarse junto con cada módulo.
- `publishCatalog()` invoca `conexion-admin` con `{action:'publish_catalog'}` y todavía no envía el `operation_id` obligatorio de v3.
- `src/app.tsx` monta `AuthProvider` y `SologProvider` también para `/`; por ello la portada consulta sesión/estado. Detalles, Dashboard, Dispositivos y el shell Admin se importan de forma ansiosa. Cajero, Control, Catálogo, Grupos e Incidencias ya tienen límites lazy parciales.
- `src/lib/router.ts` conserva aliases legacy (`/count`, `/cajero/seguimiento` y rutas Admin antiguas). No se retirarán hasta demostrar que no tienen consumidores.
- Cajero todavía compone `bootstrap/status/groups`, refresca al recuperar foco/visibilidad y guarda actividad/buffers/expresiones/reconteos en `sessionStorage`.
- Detalles ya evita `rpc_solog_count` y carga export bajo demanda, pero usa `rpc_solog_details` v1, historia sin cursor/página v2 y no posee `detail` dedicado.
- Admin usa bootstrap general v1. Dashboard/Control/Incidencias/Dispositivos/Catálogo/Grupos conservan sus RPC/acciones v1 y sus tipos/pruebas asociados.
- El build existente mantiene un chunk inicial de 509 794 B y CSS de 153 863 B sin comprimir; `vite.config.ts` no define chunks manuales. Esta es una referencia, no un presupuesto nuevo.
- Hay pruebas Bun y smoke browser, pero `package.json` no define script `test`. La validación deberá invocar explícitamente la suite existente o añadir un script solo cuando se implemente la primera fase aprobada.

### Reglas de ejecución

- Codex no modificará Supabase, migraciones, RPC, tablas, datos, triggers, RLS, grants, Cron ni Edge Functions.
- Todas las respuestas v2 deben comprobar `contract_version === 2`. El contrato garantiza `contract_version` y `generated_at`, pero **no exige un wrapper genérico `data`**.
- `operation_id` se conserva solo al reintentar la misma intención lógica; una intención nueva genera otro UUID. Un conflicto de revisión obliga a recargar la fuente autoritativa y reintentar como operación nueva.
- Revisiones congeladas: `groups` y `catalog` globales; `operational` y `devices` por sede; `incidents` global o por sede.
- No se implementa funcionalidad nueva sobre v1. Su convivencia es temporal y solo para consumidores aún no migrados.
- Si una fase necesita un campo, acción o comportamiento no descrito en el contrato congelado, esa fase se detiene con evidencia y vuelve a ChatGPT; no se compensa en frontend.
- No se recalculan en navegador reglas del Motor V3, teóricos, estados, turnos, quincenas, cobertura ni selección del último confirmado.

# 1. Supabase — checkpoint completado / dependencias satisfechas

El checkpoint backend está completado. Esta sección registra antecedentes satisfechos, no trabajo autorizado para Codex.

## S1 — Seguridad, versión e idempotencia

**Estado: COMPLETADAS — ChatGPT / Supabase**

- Superficie v2 `SECURITY DEFINER` con `search_path=''`; RPC de usuario no ejecutables por `anon`/`PUBLIC` y sí por `authenticated` cuando corresponde.
- Tablas internas con RLS y sin acceso directo de cliente; helpers internos sin `EXECUTE` público.
- Respuestas con `contract_version: 2` y `generated_at`; ledger privado `inventario.solog_operaciones` y replay `{replay:true}`.
- Dependencia frontend satisfecha: validar la versión, respetar los errores desplegados y no asumir wrapper `data`.

## S2 — Sesión y grupos congelados

**Estado: COMPLETADAS — ChatGPT / Supabase**

- La sesión congela snapshot, catálogo, `groups_revision`, quincena, grupos, composición, SKU, precios, paquete, teóricos y elegibilidad mediante `solog_session_groups`.
- Las invariantes de producción cerraron en cero para sesiones vencidas, congelación parcial y mismatch snapshot/grupo.
- Dependencia frontend satisfecha: renderizar `session_state`/estado autoritativo; no reconstruir desde maestro vivo.

## S3 — Cajero v2

**Estado: COMPLETADAS — ChatGPT / Supabase**

- Desplegadas `rpc_solog_cashier_bootstrap_v2`, `rpc_solog_cashier_mutate_v2` y `rpc_solog_cashier_history_v2`.
- Acciones de mutación congeladas: `start`, `save_batch`, `recount_start`, `recount_save` y `finish`.
- Revalidación de dispositivo, locks, freeze y Motor V3 fueron comprobados. Falta únicamente el smoke E2E real de escritura descrito en C4/G3.

## S4 — Detalles v2

**Estado: COMPLETADAS — ChatGPT / Supabase**

- Desplegada `rpc_solog_details_v2` con `summary`, `history`, `detail`, `export` y `request_access`.
- History usa cursor keyset opaco y `page_size` 1–100. La lectura no requiere dispositivo autorizado.
- Dependencia frontend satisfecha: usar solo esas acciones y payloads.

## S5 — Fuente operacional y cobertura

**Estado: COMPLETADAS — ChatGPT / Supabase**

- Desplegadas `rpc_solog_admin_bootstrap_v2` y `rpc_solog_operational_v2`.
- Acciones operacionales: `dashboard_cards`, `shift_grid`, `daily_detail`, `control_page` y `control_detail`.
- Cuatro Cron activos: `solog_shift_early`, `solog_shift_day`, `solog_shift_night` y `conexion_cleanup_snapshot_stock`. Los turnos/cortes se resuelven en `America/Lima` y reparan cortes recientes omitidos.

## S6 — Exportación administrativa

**Estado: COMPLETADAS — ChatGPT / Supabase**

- Desplegada `rpc_solog_control_export_v2` con los datasets `summary`, `adjustments`, `pending_recount`, `inconsistent` y `all`.
- La selección por `contado_at`, desempate, diferencia vigente y valores congelados son responsabilidad backend ya satisfecha.

## S7 — Catálogo, grupos, precios y publicación

**Estado: COMPLETADAS — ChatGPT / Supabase**

- Desplegada `rpc_solog_admin_master_v2` con `price_mismatch_options` como lectura asociada al flujo de resolución y las mutaciones `group_change_save`, `catalog_change_action`, `resolve_group_price` y `update_package_price`. La acción `status` permanece solo por compatibilidad legacy.
- Desplegada `rpc_solog_admin_master_read_v2` exclusivamente para `status`, `reference`, `groups`, `group_products`, `catalog_changes` y `publication_preview`; el frontend nuevo no consumirá `rpc_solog_admin_master_v2('status')`.
- `conexion-admin` **v3** está ACTIVE, exige JWT y `{action:'publish_catalog',operation_id}`; la publicación/reserva/replay se resuelve en backend.
- Invariantes, advisory lock común y revisiones `groups/catalog` están desplegados.

## S8 — Incidencias

**Estado: COMPLETADAS — ChatGPT / Supabase**

- Desplegada `rpc_solog_admin_incidents_v2` con `summary`, `detail`, `ignore_30d`, `reactivate` y `propose_delete`.
- `family_key` es canónica e independiente de sede; la supresión global/sede se respeta en INSERT y UPDATE/ON CONFLICT.
- La revisión `incidents` global o de sede es monotónica y nunca nula.

## S9 — Dispositivos

**Estado: COMPLETADAS — ChatGPT / Supabase**

- Desplegada `rpc_solog_admin_devices_v2` con `list`, `authorize`, `replace`, `revoke` y `reject`.
- Mutaciones con `operation_id`, `expected_revision`, lock estable de sede y respuesta autoritativa; unicidad de un autorizado por sede validada.

## S10 — Limpieza backend legacy diferida

**Gate adicional vigente:** no retirar definitivamente superficies legacy relacionadas hasta que el usuario ejecute y apruebe el smoke humano Cajero de integración final; se requiere además la evidencia de cero consumidores/dependencias.

**Estado: PENDIENTE DIFERIDO — ChatGPT / Supabase**

- No es una fase frontend ni autoriza cambios de backend a Codex.
- Solo podrá comenzar después de migrar consumidores, actualizar pruebas, observar cero tráfico/dependencias v1 y completar G1–G3.
- ChatGPT decidirá y ejecutará el retiro de RPC, helpers, triggers, grants o rutas backend legacy. Codex aportará únicamente el inventario de consumidores del repositorio y verificación read-only.
- El trigger que preserva valorización congelada en `conteo_detalle` no se considera legacy eliminable.

## Checkpoint

**COMPLETADO.** El backend v2 está desplegado y congelado; Codex puede implementar frontend después de aprobar este plan. El cierre contractual V2 fue desplegado mediante `20260903112822_solog_backend_contracts_v2_route_master_reads`: añadió `rpc_solog_route_v2` y `rpc_solog_admin_master_read_v2`, congeló los esquemas Operational exhaustivos y resolvió B1/B2. No queda el antiguo bloqueo S1–S9.

Único gate backend/entorno pendiente: smoke E2E Cajero `start → save_batch → finish → nueva sesión → recount_start → recount_save → finish`, más rechazo de reconteo en la misma sesión de origen, con snapshot cuya vigencia se compruebe de nuevo al ejecutar y dispositivo autorizado. Si revela una desviación contractual, la implementación afectada se detiene y vuelve a ChatGPT.

# 2. Index

## Fase I1 [O] — Portada pública y frontera de autenticación

- **Objetivo:** hacer `/` estática y trasladar la comprobación de sesión a `/login` sin bucles ni llamadas operativas desde la portada.
- **Estado actual encontrado:** `AuthProvider` y `SologProvider` envuelven toda la app; `/` ejecuta Auth y puede disparar `rpc_solog_state('bootstrap')`. El CTA cambia a “Ir a mi panel”. `/login` ya es la ruta canónica.
- **Cambios frontend:** separar el árbol público del protegido; dejar un único CTA “Iniciar sesión”; montar Auth al entrar a `/login`; mantener rutas protegidas bajo validación backend.
- **Contrato backend:** cuando exista una sesión Auth válida, `/login` llama exactamente `rpc_solog_route_v2(p_payload:{})`. Consume `contract_version`, `generated_at`, `identity.id`, `identity.nombre`, `identity.rol` y `route`; `cajero` resuelve `/cajero`, `moderador|admin` resuelven `/admin`. No envía rol/ruta/sede/dispositivo, no prueba RPC por error, no confía en metadata editable y no crea un consumidor nuevo de `rpc_solog_state('bootstrap')`.
- **Archivos probables:** `src/app.tsx`, `src/main.tsx`, `src/pages/home.tsx`, `src/pages/login.tsx`, `src/features/auth/context.tsx`, `src/features/solog/context.tsx`, `src/lib/router.ts` y pruebas browser de routing.
- **Dependencias/riesgos:** checkpoint V2 satisfecho; StrictMode, callback Auth duplicado, sesión expirada, `SOLOG_AUTH_REQUIRED`, `SOLOG_INVALID_PAYLOAD`, `SOLOG_USER_DISABLED`, `SOLOG_ROLE_NOT_ALLOWED` y redirección circular.
- **Validación:** `/` produce cero llamadas Supabase; `/ → /login`; sesión ausente muestra formulario; sesión válida realiza una sola resolución v2 y redirige una sola vez según los tres roles; no hay prueba de rol por error, uso de metadata ni flash de panel protegido.
- **Terminado cuando:** la portada es independiente de Auth/SOLOG, Login usa exclusivamente `rpc_solog_route_v2({})` para resolver destino y no queda consumidor de `rpc_solog_state('bootstrap')` en ese flujo.
- **Responsable:** Codex — Repositorio.

## Fase I2 [O/N] — Loader y code splitting

- **Objetivo:** cargar cada frontera Index/Cajero/Detalles/Admin bajo demanda y ofrecer un loader de marca accesible.
- **Estado actual encontrado:** loader principal reutiliza Login con “Ingresando…”; Detalles, Dashboard, Dispositivos y shell Admin son imports ansiosos. El chunk inicial existente es 509 794 B sin comprimir.
- **Cambios frontend:** loader con símbolo, puntos, texto “Cargando el panel…”, lectores de pantalla y movimiento reducido; lazy boundaries por bloque y por módulos Admin; `write-excel-file` solo en exportación. Manual chunks **[N]** únicamente si el análisis del grafo lo justifica; no elevar/silenciar el warning.
- **Contrato backend:** ninguno adicional; cargar un chunk nunca debe ejecutar una RPC antes de entrar al módulo.
- **Archivos probables:** `src/app.tsx`, páginas, shell Admin, módulos export, estilos y `vite.config.ts` solo si la medición lo exige.
- **Dependencias/riesgos:** I1; imports compartidos que vuelvan a arrastrar Supabase o Excel, error de chunk y preload automático.
- **Validación:** waterfall frío por ruta, mapa de chunks, loader accesible, `/` sin módulos operativos, Excel descargado solo al solicitar exportación.
- **Terminado cuando:** existen boundaries verificables y el bundle inicial disminuye sin ocultar advertencias.
- **Responsable:** Codex — Repositorio.

# 3. Cajero

**Estado del bloque Cajero:** `IMPLEMENTACIÓN TÉCNICA COMPLETADA — VALIDACIÓN HUMANA PENDIENTE`. C4 aprobada técnicamente. El smoke de `SOLOG_Cajero_C4_Smoke_Humano.md` se difiere a integración final: no bloquea D1–D3, A1–A6 ni integración independiente de su resultado. Sigue siendo gate obligatorio antes del cierre definitivo de G3, cierre global y S10 / retirada definitiva de superficies legacy relacionadas. El flujo Cajero no está validado E2E contra producción hasta ejecución y aprobación explícita del usuario. No modificar Cajero salvo incompatibilidad concreta de integración.

## Fase C1 [O] — Adaptador v2, tipos y bootstrap único

> Nota de ejecución aprobada: C1 → C2 → C3 se implementan y activan como bloque coordinado, conservando sus criterios separados; C1 no se cierra con escrituras legacy activas. Para Cajero prevalece el contrato de integración V4 (API `contract_version=2`): grupos, SKU, colas y KPI se consumen siempre de `panel_state`, diferenciando `pre_session/frozen=false` de `session/frozen=true`. Tras mutaciones se aplica el `state` autoritativo; V4 sincroniza cobertura sin modificar el denominador congelado. C4 no forma parte de esta ejecución.

- **Objetivo:** sustituir `rpc_solog_state/status/groups` por una sola lectura autoritativa v2 para todo el panel.
- **Estado actual encontrado:** `cajero.api.ts` usa `rpc_solog_state` para `groups/status` y el contexto general hace bootstrap adicional; no hay tipos ni llamadas v2.
- **Cambios frontend:** crear `rpc_solog_cashier_bootstrap_v2` con `p_payload:{device_token?}`; comprobar `contract_version === 2` y usar directamente `identity`, `site`, `device`, `start_capability`, `session_state` si existe, `revisions.groups/devices/operational` y `server_now`. Derivar vistas/KPI solo de esa respuesta; no exigir wrapper `data` ni campos no documentados.
- **Archivos probables:** `src/features/solog/api.ts`, `types.ts`, `context.tsx`, `cajero/cajero.api.ts`, `cajero.types.ts`, `cajero.session.ts`, Inicio/Conteo/Revisar y pruebas Cajero.
- **Dependencias/riesgos:** S2/S3 completadas; respuesta tardía de otro usuario/sede/dispositivo/sesión, StrictMode y token opcional/ausente.
- **Validación:** una sola RPC al entrar, cero RPC generales adicionales para KPI/listas, rechazo explícito de versión distinta y pruebas con `start_capability.allowed=false`.
- **Terminado cuando:** el panel inicial se representa desde `rpc_solog_cashier_bootstrap_v2` sin combinar estado v1.
- **Responsable:** Codex — Repositorio.

## Fase C2 [O] — Store de memoria, aislamiento e invalidación

- **Objetivo:** reutilizar el bootstrap entre rutas y conservar borradores solo en memoria con scope completo.
- **Estado actual encontrado:** `cajero.session.ts` cachea parcialmente por vista/snapshot; `cajero.storage.ts` y actividad usan `sessionStorage`; existen refetch por `focus/visibilitychange`.
- **Cambios frontend:** store por `user|site|device|session|groups_revision|operational_revision`; eliminar persistencia de buffers/expresiones/reconteos/actividad operativa; conservar solo el token de dispositivo permitido. Quitar refetch por foco/pestaña. Limpiar al guardar, descartar, expirar, logout, revocación, cambio de scope o desmontaje definitivo.
- **Contrato backend:** usar solo revisiones `groups/devices/operational` realmente devueltas; nunca fabricar una revisión.
- **Archivos probables:** `cajero.session.ts`, `cajero.storage.ts`, `cajero.recovery.ts`, calculadora/captura, contextos, `device.ts` y pruebas.
- **Dependencias/riesgos:** C1; dos tabs, logout en vuelo, tablet compartida, reload y revocación offline.
- **Validación:** ningún borrador en local/sessionStorage/IndexedDB; navegación interna conserva y reload pierde; cero refetch por foco; aislamiento por todos los scopes.
- **Terminado cuando:** memoria es la única fuente de borradores y cada evento invalida solo su scope.
- **Responsable:** Codex — Repositorio.

## Fase C3 [O] — Mutaciones v2, replay y Motor autoritativo

- **Objetivo:** migrar inicio, conteo, reconteo y cierre con payloads exactos, sin recalcular Motor V3 ni refrescar todo el panel.
- **Estado actual encontrado:** `rpc_solog_count` recibe acciones v1; reconteo usa `recount`, no `recount_save`; no existen `operation_id`/`expected_groups_revision` y hay refresh generales.
- **Cambios frontend:** usar `rpc_solog_cashier_mutate_v2(p_action,p_payload)` únicamente con:

| Acción | Payload adicional a `operation_id` + `device_token` |
|---|---|
| `start` | ninguno; no enviar `conteo_id` ni revisión |
| `save_batch` | `conteo_id`, `expected_groups_revision`, `items[]` con `client_observation_id`, `grupo_id`, `stock_fisico >= 0`, `contado_at`; máximo 500 |
| `recount_start` | `conteo_id`, `detalle_id`, `expected_groups_revision` |
| `recount_save` | `conteo_id`, `detalle_id`, `expected_groups_revision`, `stock_fisico >= 0`, `contado_at` |
| `finish` | `conteo_id`, `expected_groups_revision` |

- Conservar `operation_id` durante retry de la misma intención; `replay:true` es éxito comprometido. Un conflicto de revisión recarga bootstrap y la nueva intención usa otro UUID. Aplicar la respuesta autoritativa sin inventar un formato `delta`.
- Presentar solo `Coincide`, `Recontar`, `Confirmada` e `Inconsistente` devueltos; no calcular `Dr`, signo, magnitud, teórico ni diferencia.
- **Errores explícitos:** manejar los códigos congelados por V2, en especial `SOLOG_SESSION_CONFLICT`, `SOLOG_SESSION_EXPIRED`, `SOLOG_SESSION_REVISION_CONFLICT`, `SOLOG_GROUPS_REVISION_CONFLICT`, `SOLOG_RECOUNT_NOT_PENDING`, `SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN`, `SOLOG_DEVICE_UNAUTHORIZED` y `SOLOG_INVALID_OPERATION`.
- **Archivos probables:** `cajero.api.ts`, `cajero.session.ts`, `cajero.types.ts`, Conteo/Revisar/dialogs/header, `errors.ts` y pruebas motor/integration.
- **Dependencias/riesgos:** C1–C2; doble pulsación, timeout tras commit, respuestas invertidas, expiración, grupo fuera del freeze y revocación en escritura.
- **Validación:** payload por acción, límite 500, replay, conflictos, respuesta tardía, colas sin refetch y prohibición de reconteo en sesión origen.
- **Terminado cuando:** no quedan llamadas operativas v1 en Cajero y cada mutación/retry converge al backend.
- **Responsable:** Codex — Repositorio.

## Fase C4 [O] — Historial, temporización y gate E2E

- **Objetivo:** completar historial Hoy/Ayer y reloj de vigencia; preparar el smoke humano del flujo real sin ejecutarlo desde Codex.
- **Estado actualizado C4:** historial migrado a `rpc_solog_cashier_history_v2` según V4 y definición desplegada inspeccionada en solo lectura. Respuesta `contract_version/generated_at/period/date/items/revisions.operational`, sin `categoria_id` ni wrapper legacy. Caché en memoria por identidad/sede/dispositivo y fecha, compartida entre sesiones operativas de la misma página (el historial pertenece al usuario, no a una sesión individual); borradores y panel sí mantienen aislamiento de sesión. Se conserva la navegación existente.
- **Cambios frontend:** `rpc_solog_cashier_history_v2` recibe exactamente `p_payload:{period:'today'|'yesterday'}`; carga completa bajo demanda y cache por período/revisión/scope. Usar `server_now` para las bandas 0–1:30, >1:30–1:50, >1:50–1:57 y countdown desde 1:57; backend decide expiración/cierre.
- **Dependencias/riesgos:** C1–C3; snapshot casi vencido, reloj desviado, app suspendida y medianoche Lima.
- **Validación:** Today/Yesterday por `contado_at` del usuario/sede; invalidación solo del período afectado; fake timers; cero llamada por navegación/foco.
- **Gate obligatorio:** `PENDIENTE — smoke test humano por dispositivo autorizado`. Codex no ejecuta escrituras de prueba reales. El usuario revalida snapshot confirmado/vigente al ejecutar `start → save_batch → finish → snapshot posterior → nueva sesión → recount_start → recount_save → finish`; comprueba la prohibición en sesión de origen. Guía: `docs/SOLOG_Cajero_C4_Smoke_Humano.md`.
- **Terminado técnicamente cuando:** historial/temporización y validaciones automatizadas/simuladas pasan. El cierre definitivo del bloque Cajero y G3 requiere reporte aprobado del smoke humano; su ausencia no es defecto de implementación. Si aparece incompatibilidad real backend/contrato, detener y devolver a ChatGPT.
- **Responsable:** Codex — Repositorio; gate con Validación compartida.

# 4. Detalles

**Ejecución D1–D3:** implementación técnica realizada contra V4, pendiente de revisión/aprobación del usuario. Baseline `master` / `a36449ce8209ef04e86170e40f6bf0dd0024246a`, working tree inicialmente limpio. Las descripciones «Estado actual encontrado» siguientes documentan el baseline anterior a esta implementación. Ahora las cinco acciones consumen exclusivamente `rpc_solog_details_v2`: entrada sin `SologProvider`, historial 100/cursor opaco y detalle en memoria bajo demanda, exportación de ambas quincenas y solicitud idempotente. Export v2 no incluye `balance_valorizado`; no se sintetiza. Validación: 148 pruebas unitarias, browser simulado D1–D3 con inspección XLSX, regresiones Login/Index/Cajero, lint/TypeScript/build/diff. No se modificó backend ni código Cajero. Sin prueba E2E productiva de Cajero.

## Fase D1 [O] — Adaptador v2, entrada aislada y summary

- **Objetivo:** montar `/detalles` con cuenta cajero válida, sin autorización de dispositivo para lectura y con una sola carga mínima.
- **Estado actual encontrado:** el módulo usa `rpc_solog_details` v1 y comparte `SologProvider`/bootstrap general; ya evita mutaciones de conteo.
- **Cambios frontend:** crear `rpc_solog_details_v2(p_action,p_payload)`; para `summary` enviar solo `{device_token?}`. Consumir sede, cobertura, último snapshot, pendientes y estado de acceso/dispositivo que la respuesta entregue; validar `contract_version === 2` sin wrapper genérico.
- **Archivos probables:** `src/pages/detalles.tsx`, `features/solog/detalles/detalles.hook.ts`, `detalles.panel.tsx`, `api.ts`, `types.ts`, `app.tsx` y pruebas Details.
- **Dependencias/riesgos:** S4 completada; cuenta/sede/rol cambiados, sesión Auth vencida y cache del usuario anterior.
- **Validación:** una RPC `summary` al entrar; cero `history/detail/export` iniciales; dispositivo no autorizado todavía puede leer; ninguna llamada a Cajero/Control.
- **Terminado cuando:** Detalles funciona desde su contrato v2 aislado y no monta ni modifica Motor, sesiones, conteos, buffers o snapshots.
- **Responsable:** Codex — Repositorio.

## Fase D2 [O] — History con cursor opaco y detail bajo demanda

- **Objetivo:** paginar el historial sin N+1 y cachear cada página/caso dentro del módulo.
- **Estado actual encontrado:** `history` v1 usa `{periodo}`, devuelve períodos completos y no existe adaptador `detail`.
- **Cambios frontend:** usar acciones exactas:
  - `history`: `{period:'today'|'yesterday',page_size:1..100,cursor?}`;
  - `detail`: `{case_id}`.
- Tratar `next_cursor` como string opaco: no decodificar, combinar ni reutilizar con otro período/revisión. `SOLOG_PAGE_CURSOR_INVALID` limpia solo las páginas de ese período y reinicia desde la primera. Cache por `user|site|period|operational_revision|cursor` y `case_id|operational_revision` hasta reload/salida.
- **Archivos probables:** `detalles.historial.dialog.tsx`, `detalles.hook.ts`, nuevo detalle/cache si hace falta, `api.ts`, `types.ts` y pruebas phase3/browser.
- **Dependencias/riesgos:** D1; 0/100/101 filas, cursor obsoleto, respuestas fuera de orden y caso de otra sede.
- **Validación:** páginas sin duplicados/saltos; máximo 100; detalle solo al abrir y una vez por revisión; Today/Ayer backend; logout/salida limpia cache.
- **Terminado cuando:** lista y detalle usan exclusivamente `rpc_solog_details_v2`, sin N+1 ni precarga.
- **Responsable:** Codex — Repositorio.

## Fase D3 [O] — Export y request_access exactos

- **Objetivo:** ejecutar las acciones restantes bajo demanda respetando que solo la solicitud es una mutación idempotente.
- **Estado actual encontrado:** export v1 usa payload vacío; solicitud v1 envía token sin `operation_id` y solo deduplica mientras está en vuelo.
- **Cambios frontend:** `export` envía exactamente `{period:'current_biweekly'|'previous_biweekly'}`, sin inventar `operation_id`; `request_access` envía `{operation_id,device_token}` y conserva UUID en retries de la misma intención. Usar `replay:true` cuando se devuelva y no reinterpretar errores.
- **Archivos probables:** `detalles.export.hook.ts`, `detalles.export.ts`, `detalles.panel.tsx`, `detalles.hook.ts`, API/tipos/errores y pruebas phase4/browser.
- **Dependencias/riesgos:** D1–D2; popup/descarga bloqueada, retry después de commit, token inválido y export grande.
- **Validación:** una llamada por acción; las dos quincenas Lima; replay sin duplicación; export permitido sin dispositivo autorizado; ningún acceso a `rpc_solog_control_export_v2`.
- **Terminado cuando:** las cinco acciones reales de `rpc_solog_details_v2` están integradas y ninguna amplía permisos operativos.
- **Responsable:** Codex — Repositorio.

# 5. Admin

## Fase A1 [O] — Bootstrap v2, shell y cache común

**Implementación coordinada A1–A3 (baseline `master` / `a36449ce8209ef04e86170e40f6bf0dd0024246a`):** shell operacional v2, store en memoria por identidad/rol/consulta y revisiones; acceso directo a `/admin` y `/admin/control` sin bootstrap general. A4–A6 mantienen únicamente sus consumidores preexistentes en la frontera legacy diferida; al regresar desde ella se invalida Admin porque sus mutaciones aún no notifican revisiones al store v2. No se implementa A4–A6 ni se retira backend legacy. Cambios de Detalles y documentos preexistentes preservados.

- **Objetivo:** cargar únicamente identidad/permisos/sedes/revisiones comunes y dejar cada módulo bajo demanda.
- **Estado actual encontrado:** `getSologAdminBootstrap()` llama `rpc_solog_admin('bootstrap')` y el provider recibe coberturas/dispositivos/sesiones amplios; Dashboard y Dispositivos son imports ansiosos.
- **Cambios frontend:** `rpc_solog_admin_bootstrap_v2` recibe `p_payload:{}`, sin campos adicionales. Consumir identidad, permisos, `allowed_sites`, revisiones globales `groups/catalog` y revisiones `operational/devices/incidents` por sede. Store en memoria por `user|role|module|site|period|filters|revision`; “Actualizado” usa `generated_at` y fecha snapshot cuando la RPC del módulo la exponga.
- **Archivos probables:** `admin.layout*`, `admin.operational.provider.tsx`/context/header, `admin.solog.hook.ts`, `api.ts`, `types.ts`, páginas Admin y pruebas.
- **Dependencias/riesgos:** S5 completada; rol moderador/admin, sede no permitida, revisiones por sede y respuestas tardías.
- **Validación:** una RPC al entrar; ningún dataset de módulo precargado; aislamiento y limpieza en refresh/reload/salida/logout; code split por módulo.
- **Terminado cuando:** shell usa exclusivamente bootstrap v2 y volver a un módulo reutiliza solo su cache vigente.
- **Responsable:** Codex — Repositorio.

## Fase A2 [O] — Dashboard y turnos con rpc_solog_operational_v2

**Actualización V5:** bloqueo de `shift_grid.data.totals` resuelto por ChatGPT/Supabase; implementación consume `data.shifts` y `data.totals` sin sumas ni reparación cliente. Tarjetas y detalle diario ya sustituyen los consumidores Dashboard v1.

- **Objetivo:** reemplazar KPIs globales por tarjetas de sede, histórico de turnos y drawer diario desde la fuente backend compartida.
- **Estado actual encontrado:** `rpc_solog_dashboard`/`rpc_solog_dashboard_site_activity` v1 alimentan KPIs globales y actividad del día; no hay grid histórico.
- **Cambios frontend:** usar únicamente `rpc_solog_operational_v2` con los contratos exhaustivos V2: `dashboard_cards` recibe `{}` (sin `site_id`) y devuelve `sites[]` con coberturas, pendientes, snapshot nullable y `operational_revision`; `shift_grid` recibe `{site_id,period?}`, donde `period` es `current_biweekly|previous_biweekly` y el default backend es `current_biweekly`; su respuesta consume exactamente `site_id`, `period.key/from/to`, `data.shifts[]`, `data.totals[]` y `revisions.operational/groups`; `daily_detail` recibe `{site_id,origin_date}` y consume su `summary`, `items[]` y revisión operational. La propiedad `data` es exclusiva de `shift_grid`, no un wrapper genérico.
- Tarjeta por sede: cobertura quincenal hasta completar, luego “Completada” y cobertura diaria principal. Grid Early `[00:00,07:30)`, Day `[07:30,15:30)`, Night `[15:30,00:00)` y Total sin duplicar grupos. `+` carga drawer de origen con estado vigente, KPI Por recontar/Confirmadas/Inconsistentes y columnas congeladas.
- Acción “DESCARGAR AJUSTE” reutiliza el modal propietario de A3 con sede preseleccionada.
- **Archivos probables:** `admin.dashboard.*`, `src/pages/admin.dashboard.tsx`, cache A1, componentes compartidos A3 y pruebas dashboard/browser.
- **Dependencias/riesgos:** A1 y checkpoint V2 satisfecho; revisión `operational` por sede, revisión `groups`, respuesta tardía, snapshot `null`, Night atribuida al día de inicio, denominador cero y detalle repetido.
- **Validación:** payload `{}` de tarjetas; `site_id` obligatorio y ambos períodos/default en grid; forma exacta de las tres respuestas; sin KPIs globales; cuts reproducibles; Total correcto; una llamada por expansión/drawer/revisión; Dashboard=Control para misma sede/origen.
- **Terminado cuando:** no quedan llamadas Dashboard v1, los tipos corresponden a los esquemas V2 exactos y toda cifra proviene de las tres acciones operacionales desplegadas.
- **Responsable:** Codex — Repositorio.

## Fase A3 [O] — Control y exportación administrativa

**Implementación:** lista y cronología v2 con caché; filtros/página en backend, exportación autoritativa bajo demanda y modal compartido con A2. Cinco hojas sin recalcular valores o seleccionar el último resultado en frontend. Cierre técnico sujeto al reporte de pruebas y revisión del usuario; no autoriza A4.

- **Objetivo:** migrar lista/detalle a la fuente operacional y producir las cinco hojas desde la RPC dedicada.
- **Estado actual encontrado:** Control usa `rpc_solog_control`, `rpc_solog_control_detalle` y `rpc_solog_control_export` v1; pagina 50 y el libro solo tiene Resumen/Ajustes.
- **Cambios frontend:** `control_page` recibe exactamente `{site_id,period,state,search?,page,page_size,date_from?,date_to?}`: `period` es `today|last_week|current_biweekly|previous_biweekly|custom`, `page_size <= 100`, custom máximo 92 días y fechas solo para custom. Es paginación por `page`, **no cursor**. `control_detail` recibe `{site_id,group_id}`.
- `rpc_solog_control_export_v2` recibe exactamente `{site_id,period:'current_biweekly'|'previous_biweekly'}`, sin `operation_id`. Modal único “DESCARGAR AJUSTE” con “Período actual quincenal”/“Período anterior quincenal”. Formatear, sin reseleccionar filas, `summary`→Resumen, `adjustments`→Ajustes, `pending_recount`→Por recontar, `inconsistent`→Inconsistentes sin valorización y `all`→Todas.
- **Archivos probables:** `admin.control.*`, `src/pages/admin.control.tsx`, módulos export, tipos/API, componentes compartidos A2 y pruebas control/browser.
- **Dependencias/riesgos:** A1–A2, S5/S6 completadas; páginas/filtros en vuelo, custom inválido, último confirmado cero, reconteo posterior y archivo grande.
- **Validación:** payloads exactos; resumen/filas filtrados igual; detalle bajo demanda; cinco nombres/columnas/orden; apertura Excel; Dashboard/Control coinciden; export una sola RPC.
- **Terminado cuando:** Control/export no llaman v1 y el workbook concilia con los cinco datasets sin reglas Motor en frontend.
- **Responsable:** Codex — Repositorio.

## Fase A4 [O] — Catálogo, grupos, precios y conexion-admin v3

- **Objetivo:** migrar maestro/publicación a las acciones desplegadas sin crear caminos frontend alternativos.
- **Estado actual encontrado:** API usa `rpc_solog_catalog`/`rpc_solog_admin` con `catalog_changes`, `catalog_change_action`, `groups`, `group_products`, `group_change_save` y `group_valuation_save`; publicación v2 no envía operation ID.
- **Cambios frontend — lecturas:** usar exclusivamente `rpc_solog_admin_master_read_v2` para:
  - `status:{}` → `catalog.version_actual`, `catalog.publicado_at` y revisiones `groups/catalog`;
  - `reference:{}` → `categories[]`, `groups[]`, precios/datos de paquete y revisiones;
  - `groups:{categoria_id?,precio?,tipo?,buscar?,limit?,offset?}`;
  - `group_products:{categoria_id?,grupo_id?,estado?,buscar?,limit?,offset?}`;
  - `catalog_changes:{c_interno?,tipo?,estado?,producto?,ambito?,limit?,offset?}`;
  - `publication_preview:{}` → proyección autoritativa exactamente dentro de `preview`.
  Las tres listas usan `limit` 1..50 (default 50) y `offset >= 0`; no convertirlas a cursor ni `page/page_size`. Estas lecturas no reciben `operation_id` ni revisión esperada. No crear consumidor nuevo de `rpc_solog_admin_master_v2('status')`.
- **Cambios frontend — resolución/mutaciones:** conservar `rpc_solog_admin_master_v2` solo para la lectura vinculada `price_mismatch_options` y las mutaciones `group_change_save`, `catalog_change_action`, `resolve_group_price`, `update_package_price`. Toda mutación incluye `operation_id` y `expected_groups_revision`. Respetar:
  - `price_mismatch_options:{propuesta_fingerprint}`;
  - `resolve_group_price:{propuesta_fingerprint,resolution:'update_group_price'|'separate_sku'}`;
  - `update_package_price:{grupo_id,precio_paquete}`;
  - `group_change_save` conserva campos vigentes y agrega `member_codes` al crear agrupado.
- Publicar mediante `conexion-admin` v3 con `{action:'publish_catalog',operation_id}`; retry usa el mismo UUID. No subir directamente, no usar upsert ni invocar la RPC interna de publicación.
- **Archivos probables:** `admin.catalogo.*`, `admin.grupos.*`, `api.ts`, `types.ts`, `errors.ts` y pruebas admin-groups/publication.
- **Dependencias/riesgos:** A1, S7 y checkpoint V2 satisfechos; paginación offset concurrente, `groups/catalog` obsoletas, operación en progreso, reserva en conflicto y respuesta perdida tras commit.
- **Validación:** seis lecturas y formas de respuesta exactas; límites/offset/filtros; `preview` sin normalización; acciones/payloads de resolución/mutación exactos; opciones de precio, paquete independiente, replay Edge, revisión recargada tras conflicto e invariantes reflejadas desde backend.
- **Terminado cuando:** Catálogo/Grupos no realizan lecturas v1 ni crean un consumidor nuevo de `admin_master_v2('status')`, no quedan escrituras maestro v1 ni publicación sin operation ID y el frontend nunca simula una mutación parcial.
- **Responsable:** Codex — Repositorio.

## Fase A5 [O] — Incidencias por familia

- **Objetivo:** consumir familias canónicas, detalle paginado y tres acciones idempotentes.
- **Estado actual encontrado:** `rpc_solog_admin('incidents'/'incident_action')` usa filas/campos v1, filtros de fecha y decisiones `reviewed/ignore_15d/deleted`.
- **Cambios frontend:** `rpc_solog_admin_incidents_v2`:
  - `summary:{site_id?}`, sin fechas; omitir sede para scope global;
  - `detail:{family_key,site_id?,page,page_size}` con `page_size <= 100`; usa páginas, **no cursor**;
  - `ignore_30d|reactivate|propose_delete:{family_key,scope:'global'|'site',site_id solo site,operation_id,expected_revision}`.
- Usar revisión `incidents` global para scope global y de sede para scope site. `propose_delete` no elimina ni suprime. Invalidar solo el summary/familia/scope afectados.
- **Archivos probables:** `admin.incidencias.*`, API/tipos/errores y pruebas nuevas/browser.
- **Dependencias/riesgos:** A1, S8 completada; family desaparecida, dos admins, scope/revisión equivocados y respuesta tardía.
- **Validación:** cero filtros fecha; una fila/family; detalle solo con `+`; páginas; 30 días/reactivación/propuesta; replay y `SOLOG_INCIDENT_*` exactos.
- **Terminado cuando:** no quedan acciones/filtros v1 y global/sede se aíslan por revisión.
- **Responsable:** Codex — Repositorio.

## Fase A6 [O] — Dispositivos y propagación de revocación

- **Objetivo:** migrar lista/autorizar/reemplazar/revocar/rechazar con revisión de sede y estado autoritativo.
- **Estado actual encontrado:** `rpc_solog_admin` v1 autoriza/revoca; el hook modela rechazo reutilizando rutas legacy y no envía operación/revisión.
- **Cambios frontend:** `rpc_solog_admin_devices_v2` con `list:{site_id?}` y mutaciones exactas `{device_id,operation_id,expected_revision}` para `authorize|replace|revoke|reject`. No enviar sede en mutación; backend la deriva. Aplicar dispositivo autorizado/pendientes retornados y la revisión `devices`.
- Propagar revocación/reemplazo al store Cajero: limpiar cache/borradores al recibirla; el siguiente protected write sigue siendo la garantía backend.
- **Archivos probables:** `admin.dispositivos.*`, `src/pages/admin.dispositivos.tsx`, cache A1, `device.ts`, contexto/Cajero y pruebas.
- **Dependencias/riesgos:** A1, C2–C3, D3, S9 completada; dos admins, pestaña dormida, retry y dispositivo previo con request en vuelo.
- **Validación:** acciones/payloads/replay; `SOLOG_DEVICE_REVISION_CONFLICT` recarga lista y usa nueva intención; una tablet por sede; escritura Cajero rechazada tras revocación.
- **Terminado cuando:** no quedan mutaciones device v1 y todos los consumidores convergen al dispositivo autoritativo.
- **Responsable:** Codex — Repositorio.

# 6. Integración global final

## Fase G1 [O] — Contratos, revisiones, aislamiento y respuestas tardías

- **Objetivo:** demostrar que los cinco bloques consumen `contract_version = 2` sin mezclar usuario, sede, dispositivo, sesión o revisión.
- **Cobertura:** caches Cajero/Detalles/Admin; revisiones `groups/catalog/operational/devices/incidents` según scope; respuesta tardía; logout; expiración Auth/sesión; revocación/reemplazo; success/replay; actualización explícita.
- **Reglas:** ninguna respuesta v2 se normaliza a un wrapper inventado; cada módulo usa su forma real. Una respuesta cuyo scope/revisión ya no coincide se descarta. Un conflicto obliga a recargar solo la fuente autoritativa afectada; no se convierte en éxito ni se reintenta automáticamente con la misma intención obsoleta.
- **Validación:** matrices multiusuario, multisede, multidispositivo, multisesión y dos tabs; carreras de navegación/logout; replay de cada mutación; sesión que expira durante request; revocación durante borrador/guardado.
- **Terminado cuando:** no existe fuga de cache ni aplicación de respuestas antiguas, y todos los consumidores v2 rechazan versiones distintas de 2.
- **Responsable:** Validación compartida; correcciones frontend en su fase propietaria.

## Fase G2 [O] — Coherencia funcional entre bloques

- **Objetivo:** comprobar Motor, períodos, Dashboard/Control, exportaciones, Incidencias y Catálogo/Grupos como un flujo único.
- **Cobertura:** `America/Lima`; rangos quincenales y turnos; origen por `contado_at` con estado vigente posterior; Dashboard=Control; cinco hojas Admin; export Detalles; `family_key`/scope; revisiones maestro; publicación `conexion-admin` v3; paquete independiente; revocación device.
- **Validación:** bordes 1/15/16/fin de mes, 07:30/15:30/00:00; Total sin duplicar grupos; último confirmado cero; reconteo en otra quincena; inconsistentes sin valorización; ignore 30 d/reactivate/propose; dos admins con revisiones obsoletas; replay Edge y mutaciones.
- **Límite:** el frontend no valida invariantes reejecutando Motor ni reconstruye histórico con catálogo/stock actual. Una discordancia de datos vuelve a ChatGPT con request/response y revisión.
- **Terminado cuando:** UI, exportaciones y módulos coinciden con la misma evidencia backend para sede/período/origen.
- **Responsable:** Validación compartida.

## Fase G3 [O/L] — Rendimiento, suites, smoke Cajero y evidencia legacy

**Gate de cierre:** el smoke humano Cajero está diferido a esta integración. Su ejecución y aprobación explícita bloquean el cierre definitivo de G3, el cierre global y S10, no las tareas independientes ni D1–D3/A1–A6.

- **Objetivo:** cerrar egress, code splitting, pruebas y transición v1→v2 antes de solicitar limpieza backend.
- **Egress esperado por interacción:** Index 0 llamadas Supabase; Login solo Auth y una `rpc_solog_route_v2({})` cuando la sesión válida esté disponible; Cajero 1 bootstrap y 0 por navegación/foco; history bajo demanda; Detalles 1 summary y una por página/caso/acción; Admin 1 bootstrap y una carga inicial por módulo, con detalles/exportaciones solo al pedir. Registrar bytes comprimidos reales y p50/p95, no estimarlos por filas.
- **Code splitting:** medir chunks fríos Index/Cajero/Detalles/Admin y carga tardía de Excel. No silenciar warnings ni introducir refactor general.
- **Pruebas:** TypeScript, lint, build, `bun test` explícito, browser/smoke, contratos de payload, errores, accesibilidad, absence de N+1/refetch, caches, Excel y logs de red. Si se añade script `test` será parte de la implementación aprobada, no de este plan.
- **Gate Cajero:** al ejecutar, comprobar de nuevo que el snapshot sigue vigente y usar dispositivo autorizado para `start → save_batch → finish → nueva sesión → recount_start → recount_save → finish`; comprobar además `SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN` en la sesión de origen. Sin este gate verde no concluyen C4/G3.
- **Legacy [L]:** buscar consumidores en `src/tests` y aportar evidencia. Codex solo retira aliases/código cliente cuya ausencia de consumidores esté demostrada. Después, ChatGPT ejecuta S10 sobre backend y Codex reinspecciona en solo lectura. No planificar ni ejecutar retiro backend desde esta fase.
- **Terminado cuando:** suites y smoke están verdes, la tabla de llamadas/bytes/chunks demuestra la mejora, no hay N+1/refetch innecesario y existe inventario cero-consumidor para cada objeto a retirar.
- **Responsable:** Validación compartida; Codex — Repositorio para cliente, ChatGPT — Supabase para S10.

## Manejo de errores desplegados

El adaptador común debe conservar el `code` backend y mapear únicamente estos códigos documentados, sin inventar equivalencias:

- Auth/rol/routing: `SOLOG_AUTH_REQUIRED`, `SOLOG_INVALID_PAYLOAD`, `SOLOG_USER_DISABLED`, `SOLOG_ROLE_NOT_ALLOWED`, `SOLOG_OPERATIONAL_ROLE_REQUIRED`, `SOLOG_ADMIN_ROLE_REQUIRED`.
- Dispositivo: `SOLOG_DEVICE_UNAUTHORIZED`, `SOLOG_DEVICE_REVISION_CONFLICT`, `SOLOG_PENDING_DEVICE_NOT_FOUND`, `SOLOG_DEVICE_NOT_REVOCABLE`.
- Sesión/stock: `SOLOG_SESSION_CONFLICT`, `SOLOG_SESSION_EXPIRED`, `SOLOG_SESSION_REVISION_CONFLICT`, `SOLOG_STOCK_EXPIRED`, `SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY`.
- Grupos: `SOLOG_GROUPS_REVISION_CONFLICT`, `SOLOG_MASTERDATA_REVISION_CONFLICT`, `SOLOG_GROUP_INVARIANT`, `SOLOG_LOCK_CONFLICT_RETRYABLE`.
- Reconteo: `SOLOG_RECOUNT_NOT_PENDING`, `SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN`.
- Paginación: `SOLOG_INVALID_PAGE_SIZE`, `SOLOG_PAGE_CURSOR_INVALID`.
- Lecturas maestras: `SOLOG_INVALID_ACTION`, `SOLOG_INVALID_GROUP_FILTER`, `SOLOG_INVALID_GROUP_TYPE`, `SOLOG_INVALID_GROUP_PRODUCT_FILTER`, `SOLOG_INVALID_PRODUCT_MODE`, `SOLOG_INVALID_CATALOG_FILTER`, `SOLOG_INVALID_CATALOG_CHANGE_STATE`, `SOLOG_INVALID_CATALOG_CHANGE_SCOPE`, `SOLOG_INVALID_CATALOG_CHANGE_TYPE`.
- Operacional: `SOLOG_INVALID_SITE`, `SOLOG_SITE_FORBIDDEN`, `SOLOG_INVALID_DATE_RANGE`, `SOLOG_INVALID_DIFFERENCE_STATE`, `SOLOG_EXPORT_PERIOD_INVALID`, `SOLOG_INVALID_GROUP`, además de `SOLOG_INVALID_PAGE_SIZE` y `SOLOG_INVALID_ACTION` ya compartidos.
- Incidencias: `SOLOG_INCIDENT_FAMILY_NOT_FOUND`, `SOLOG_INVALID_INCIDENT_SCOPE`, `SOLOG_INCIDENT_ACTION_NOT_ALLOWED`.
- Publicación: `SOLOG_OPERATION_IN_PROGRESS`, `SOLOG_CATALOG_RESERVATION_CONFLICT`.
- Operación/idempotencia: `SOLOG_INVALID_OPERATION` y el conflicto que emita el ledger al reutilizar un UUID con otra intención; no asignarle un nombre no documentado.

## Bloqueos y gates

### B1 — Resolver de destino en Login

**RESUELTO — ChatGPT / Supabase.** `rpc_solog_route_v2({})` está desplegada y congelada; I1 puede migrar el resolver completamente a v2 sin `rpc_solog_state('bootstrap')`.

### B2 — Esquemas Operational y lecturas Maestro

**RESUELTO — ChatGPT / Supabase.** V2 congela los esquemas exhaustivos de `dashboard_cards`, `shift_grid`, `daily_detail`, `control_page` y `control_detail`, y despliega `rpc_solog_admin_master_read_v2` con seis acciones de lectura. A2 y A4 ya no están condicionadas por B2.

### GATE-E2E — Escritura Cajero

- **Evidencia:** el checkpoint validó lectura e invariantes, pero no pudo ejecutar un happy path con token autorizado real.
- **Impacto:** no bloquea la aprobación del plan ni trabajo independiente, pero bloquea el cierre C4/G3.
- **Requisito:** revalidar en ese momento snapshot vigente y dispositivo autorizado; aportar evidencia del flujo completo y del rechazo de reconteo en la sesión de origen.

## Matriz de contratos frontend ↔ backend

| Consumidor | Superficie congelada | Acción/payload exacto | Revisión/idempotencia | Fase |
|---|---|---|---|---|
| Portada `/` | Ninguna | Ninguno | No aplica | I1 |
| Login/routing | `rpc_solog_route_v2(p_payload)` | `{}` → `identity{id,nombre,rol}` y `route`; solo después de sesión Auth válida | lectura v2; `contract_version=2` | I1 |
| Cajero bootstrap | `rpc_solog_cashier_bootstrap_v2(p_payload)` | `{device_token?}` | respuesta: groups/devices/operational; `contract_version=2` | C1 |
| Cajero start | `rpc_solog_cashier_mutate_v2('start',p_payload)` | `{operation_id,device_token}` | replay por operation ID | C3 |
| Cajero batch | `rpc_solog_cashier_mutate_v2('save_batch',p_payload)` | `{operation_id,device_token,conteo_id,expected_groups_revision,items[<=500]}` | groups + replay | C3 |
| Cajero inicia reconteo | `rpc_solog_cashier_mutate_v2('recount_start',p_payload)` | `{operation_id,device_token,conteo_id,detalle_id,expected_groups_revision}` | groups + replay | C3 |
| Cajero guarda reconteo | `rpc_solog_cashier_mutate_v2('recount_save',p_payload)` | `{operation_id,device_token,conteo_id,detalle_id,expected_groups_revision,stock_fisico,contado_at}` | groups + replay | C3 |
| Cajero finish | `rpc_solog_cashier_mutate_v2('finish',p_payload)` | `{operation_id,device_token,conteo_id,expected_groups_revision}` | groups + replay | C3 |
| Historial Cajero | `rpc_solog_cashier_history_v2(p_payload)` | `{period:'today'|'yesterday'}` | lectura scoped | C4 |
| Detalles summary | `rpc_solog_details_v2('summary',p_payload)` | `{device_token?}` | lectura sin device autorizado | D1 |
| Detalles history | `rpc_solog_details_v2('history',p_payload)` | `{period,page_size:1..100,cursor?}` | cursor opaco con revisión operational | D2 |
| Detalles detail | `rpc_solog_details_v2('detail',p_payload)` | `{case_id}` | lectura scoped | D2 |
| Detalles export | `rpc_solog_details_v2('export',p_payload)` | `{period:'current_biweekly'|'previous_biweekly'}` | sin operation ID documentado | D3 |
| Detalles access | `rpc_solog_details_v2('request_access',p_payload)` | `{operation_id,device_token}` | replay | D3 |
| Admin bootstrap | `rpc_solog_admin_bootstrap_v2(p_payload)` | `{}` | groups/catalog globales; operational/devices/incidents por sede | A1 |
| Dashboard | `rpc_solog_operational_v2(p_action,p_payload)` | `dashboard_cards:{}`; `shift_grid:{site_id,period?}`; `daily_detail:{site_id,origin_date}`; formas de respuesta exactas V2 | operational por sede; groups en cards/grid | A2 |
| Control | `rpc_solog_operational_v2(p_action,p_payload)` | `control_page:{site_id,period,date_from/date_to solo custom,state,search?,page,page_size<=100}`; `control_detail:{site_id,group_id}` | operational por sede | A3 |
| Export Admin | `rpc_solog_control_export_v2(p_payload)` | `{site_id,period:'current_biweekly'|'previous_biweekly'}` | sin operation ID documentado | A3 |
| Maestro lectura | `rpc_solog_admin_master_read_v2(p_action,p_payload)` | `status:{}`; `reference:{}`; `groups`, `group_products`, `catalog_changes` con filtros + `limit/offset<=50`; `publication_preview:{}` → `preview` | groups/catalog; sin operation ID ni expected revision | A4 |
| Maestro opción de precio | `rpc_solog_admin_master_v2(p_action,p_payload)` | `price_mismatch_options:{propuesta_fingerprint}` | lectura ligada a resolución | A4 |
| Maestro mutación | `rpc_solog_admin_master_v2(p_action,p_payload)` | `group_change_save`, `catalog_change_action`, `resolve_group_price`, `update_package_price` + `operation_id` + `expected_groups_revision` y campos específicos documentados | groups + replay | A4 |
| Publicación | Edge `conexion-admin` v3 | `{action:'publish_catalog',operation_id}` | JWT admin; replay/reserva | A4 |
| Incidencias lectura | `rpc_solog_admin_incidents_v2` | `summary:{site_id?}`; `detail:{family_key,site_id?,page,page_size<=100}` | incidents global/sede | A5 |
| Incidencias mutación | `rpc_solog_admin_incidents_v2` | `ignore_30d|reactivate|propose_delete:{family_key,scope,site_id solo site,operation_id,expected_revision}` | incidents del scope + replay | A5 |
| Dispositivos lectura | `rpc_solog_admin_devices_v2('list',p_payload)` | `{site_id?}` | devices por sede | A6 |
| Dispositivos mutación | `rpc_solog_admin_devices_v2` | `authorize|replace|revoke|reject:{device_id,operation_id,expected_revision}` | devices + replay | A6 |

## Matriz de despliegue frontend

| Orden | Responsable | Cambio | Condición previa | Validación | Punto de retorno |
|---:|---|---|---|---|---|
| 0 | ChatGPT / Supabase | Cierre contractual V2 ya desplegado (`20260903112822_solog_backend_contracts_v2_route_master_reads`) | S1–S9 completadas | B1/B2 resueltos y contrato V2 congelado | Backend ya desplegado; no acción Codex |
| 1 | Codex | I1 portada/frontera y I2 loader/chunks | Plan aprobado; checkpoint V2 satisfecho | Network 0 en `/`, route v2, accesibilidad, chunks | Revertir solo boundary |
| 2 | Codex | C1 adaptador/bootstrap | S3 completada | Contract v2, una RPC | Mantener consumidor Cajero v1 temporal |
| 3 | Codex | C2 memoria/cache | C1 | Storage/aislamiento/refetch | Restaurar store anterior antes de migrar mutaciones |
| 4 | Codex | C3 mutaciones | C1–C2 | Payloads, replay, conflictos, Motor autoritativo | Revertir módulo a v1 sin mezclar estados |
| 5 | Codex + Validación | C4/history/timer y GATE-E2E cuando haya entorno | Vigencia de snapshot revalidada + device autorizado | Flujo completo y rechazo en sesión de origen | Detener; volver a ChatGPT si es backend |
| 6 | Codex | D1–D3 | S4 completada | Summary, cursor<=100, detail, export/access | Revertir módulo Detalles completo a v1 |
| 7 | Codex | A1 shell/bootstrap | S5 completada | Carga mínima/cache/revisiones | Revertir shell, no mezclar bootstrap |
| 8 | Codex | A2 Dashboard | A1; contrato Operational V2 satisfecho | Payloads/formas exactas, turnos/drawer/Dashboard=Control | Mantener Dashboard v1 aislado |
| 9 | Codex | A3 Control/export | A1–A2, S6 | Page<=100, 92 d, cinco hojas | Mantener Control/export v1 aislados |
| 10 | Codex | A4 maestro/publicación | A1; `admin_master_read_v2` satisfecho | Lecturas limit/offset, revisiones, opciones, preview y Edge replay | Mantener módulo v1 aislado |
| 11 | Codex | A5 incidencias y A6 dispositivos | A1 | Scope/pages/replay/revocación | Revertir cada módulo independientemente |
| 12 | Validación compartida | G1–G3 | Todos los consumidores v2 | Suites, E2E, egress, chunks, seguridad | Reabrir fase propietaria |
| 13 | ChatGPT — Supabase | S10 legacy backend | Cero consumidores/tráfico/dependencias demostrado | Retiro objeto por objeto + smoke | Restaurar objeto concreto |
| 14 | Codex + Validación | Retiro frontend legacy demostrado | S10 coordinada | `rg`/tests/build/smoke sin v1 | Restaurar alias/adaptador concreto |

## Matriz de trazabilidad funcional

| Requisito congelado | Propietario/fase | Validación |
|---|---|---|
| 2.1 ConeXion/SOLOG; no escribir POS/`stock_actual` | S1–S9 completadas; G2 | Frontend solo RPC/Edge públicas |
| 2.2 `físico - teórico` y signos | S3/S6 completadas; C3, A2–A3, G2 | UI/Excel contra estado backend |
| 2.3 quincenas, origen y Lima | S3–S6 completadas; C4, D2–D3, A2–A3, G2 | Bordes 1/15/16/EOM y turnos |
| 2.4 egress, páginas, on-demand, no N+1 | C1/C4, D1–D3, A1–A6, G3 | Llamadas y bytes reales |
| 2.5 cuenta/dispositivo/rol/sede backend | S1/S3/S4/S9 completadas; I1, C3, D1, A1/A6, G1 | Matriz de permisos/scopes |
| 2.6 cache/aislamiento/no persistencia | C2, D2, A1, G1 | Usuario/sede/device/sesión/revisión |
| 3–8 Index | I1–I2 | Portada 0 RPC, login, loader, bundle |
| 9–13 Cajero bootstrap/sesión/Conteo/Revisar | S2–S3 completadas; C1/C3 | Freeze, cola, estados y posterioridad |
| 14 borradores | C2 | Memoria únicamente y limpieza |
| 15 historial Cajero | C4 | Hoy/Ayer completo bajo demanda |
| 16 temporización | C4 | 1:30/1:50/1:57/2:00 con server_now |
| 17 validaciones Cajero | C1–C4, G1/G3 | Suites + E2E obligatorio |
| 18–19 responsabilidad/aislamiento Detalles | D1/D3 | Cuenta válida sin device; cero Motor |
| 20–21 páginas/cache/egress Detalles | D2–D3 | Cursor opaco, <=100, detail/export on demand |
| 22 validaciones Detalles | D1–D3, G1 | Rol/sede/período/cursor |
| 23 arquitectura Admin | A1 | Bootstrap mínimo, módulos/cache |
| 24.1–24.4 Dashboard/turnos/drawer | A2 | Tarjetas, Total, origen/estado vigente |
| 24.5 Cron histórico | S5 completada; A2/G2 | Tres cuts + cleanup activos y reproducibles |
| 24.6–24.7 fuente/descarga compartida | A2–A3 | Dashboard=Control; modal único |
| 25.1 Control | A3 | Filtro/orden/página backend y detail on demand |
| 25.2–25.4 modal/cinco hojas/consistencia | S6 completada; A3/G2 | Conciliación completa del workbook |
| 26.1–26.4 maestro/precios/invariantes/activación | S7 completada; A4/G2 | Revisiones, opciones y Edge v3 |
| 27.1–27.3 incidencias | S8 completada; A5/G2 | Family, página, scope, 30 d/replay |
| 28 dispositivos | S9 completada; A6/C2/C3/G1 | Un device/sede y revocación |
| 29 locks/deadlocks | S7/S9 completadas; G2 | Conflictos de dominio; no lógica cliente |
| 30 retiro legacy | S10, G3 | Consumidores/pruebas/tráfico cero antes de retirar |
| 31.1 idempotencia | C3, D3, A4–A6, G1/G2 | UUID por intención y replay |
| 31.2 locks | S2/S3/S7–S9 completadas; G2 | Frontend maneja conflicto, no reordena Motor |
| 31.3 datos obsoletos | C1–C3, D2, A1–A6, G1 | Revisiones/respuestas tardías |
| 31.4 históricos congelados | S2–S6 completadas; A2–A3/G2 | No reconstrucción cliente |
| 32 fuera de alcance | Todas | Diff limitado a integración frontend |

### Criterios globales de aceptación

| Criterio 33 | Fase(s) | Evidencia de cierre |
|---:|---|---|
| 1 | Todas | Criterio verificable por fase |
| 2 | I1 | Network Supabase = 0 en `/` |
| 3 | C1 | Un bootstrap v2 estable |
| 4 | S2 completada; C3/G1 | Sin mezcla de snapshot/grupo/precio/revisión |
| 5 | C1/C4, D2, A1–A3, G3 | Menos llamadas/bytes/preloads |
| 6 | C2, D2, A1, G1 | Cache scoped e invalidación selectiva |
| 7 | A2–A3 | Fuente operacional compartida y export separada |
| 8 | S5 completada; A2/G2 | Turnos/Total/Cron reproducibles |
| 9 | S6 completada; A3/G2 | Cinco hojas conciliadas |
| 10 | S8 completada; A5/G2 | Supresión 30 d/reactivación |
| 11 | S7 completada; A4/G2 | Maestro atómico y sin estado parcial |
| 12 | S10/G3 | Cero legacy después de migrar consumidores |
| 13 | S2/S3/S7–S9 completadas; G1/G2 | Resultados deterministas; sin deadlocks |
| 14 | G3 | TypeScript/lint/build/unit/integration/contract/smoke |
| 15 | G1–G3 | Revisión global sin regresiones |

## Correcciones respecto del plan anterior

- S1–S9 pasaron de trabajo pendiente a **COMPLETADAS — ChatGPT / Supabase**; S10 quedó limitada a limpieza backend legacy posterior.
- Se retiraron propuestas de tablas, migraciones, locks, RLS, grants, Cron y Edge que ya no corresponden a Codex.
- Se eliminó el sobre hipotético `data`, `expected_revisions` genérico y códigos de error no congelados.
- Se sustituyeron nombres hipotéticos por las doce RPC v2 públicas reales y `conexion-admin` v3.
- Cajero quedó limitado a tres RPC y cinco acciones de mutación; se eliminó la acción hipotética `discard` y se corrigió `recount`→`recount_save`.
- Se corrigió idempotencia: no todas las lecturas/exportaciones reciben `operation_id`; solo los payloads documentados lo usan.
- Detalles quedó en una RPC con cursor opaco solo en history y `page_size <= 100`; export no recibe operation ID y request_access sí recibe token+operation ID.
- Control e Incidencias usan paginación por `page`, no cursor. Control custom queda limitado a 92 días.
- Admin quedó ligado a bootstrap, operational, export, devices, incidents y master v2; publicación usa JWT y operation ID en Edge v3.
- El estado backend ya reconoce freeze/revisiones/helpers cerrados, cuatro Cron activos, incidencias globales corregidas e invariantes de producción en cero.
- Legacy deja de ser una fase de eliminación frontend indiscriminada: cada objeto exige consumidor/tráfico/dependencia cero y el retiro backend vuelve a ChatGPT.
- El cierre contractual V2 resolvió B1 mediante `rpc_solog_route_v2` y B2 mediante esquemas Operational exhaustivos más `rpc_solog_admin_master_read_v2`; V1 queda histórico.

## Resumen de fases

- **Antecedentes completados:** S1–S9 — COMPLETADAS — ChatGPT / Supabase.
- **Backend diferido:** S10 — limpieza legacy, ChatGPT / Supabase, solo después de G3.
- **Frontend aprobado:** I1–I2 cerradas; D1–D3 aprobadas técnicamente. C1–C4 con implementación técnica completada y validación humana pendiente.
- **Frontend implementado para revisión:** A1–A3, bloque coordinado contra V5.
- **Implementación Codex pendiente:** A4–A6 (3 fases), no autorizadas en esta ejecución.
- **Integración compartida pendiente:** G1–G3 (3 fases).
- **Total del plan:** 6 bloques; 28 hitos/fases nominales; se conservan los límites y responsables originales.
- **Bloqueos contractuales:** ninguno nuevo; bloqueo A2 resuelto por V5. El smoke humano Cajero continúa como gate antes del cierre definitivo de G3, cierre global y S10 relacionado, no bloquea fases independientes.
- **Aprobación:** A1–A3 esperan revisión del usuario. No avanzar a A4 ni ejecutar el smoke real Cajero sin la aprobación correspondiente.
