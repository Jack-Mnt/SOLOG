# SOLOG — Optimización Cajero — Refrescos V6 — Preflight V1

**Estado:** PREFLIGHT COMPLETADO (SOLO LECTURA). Las soluciones descritas son **PROPUESTAS, NO APROBADAS NI CONGELADAS**; no implementar aún.
**Fecha:** 2026-10-28.
**Clasificación:** Nivel C por concurrencia, caducidad, recovery y autorización; implementación potencialmente frontend B con backend intacto si las pruebas lo permiten.
**Rama observada:** `admin-work`, HEAD `871d626b8a98e75b0f0556c05cf63728fc47c34f`.
**Fuente primaria funcional existente:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md` y contrato `docs/SOLOG_Backend_Cajero_KPIs_Cobertura_Full_Contrato_V1.md`; para sede, contrato delta `docs/SOLOG_Backend_Cajero_Full_Header_Sede_Contrato_V1.md`.
**Referencia histórica:** `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` (2026-09-03), en la que se desaprueba el refresco por foco y polling agresivo. En caso de contradicción, **no aplicar mecánicamente la regla histórica**: la semántica Full más reciente de recovery y V6/V7 exige análisis y decisión explícita.
**Método:** GitHub y Supabase consultados en solo lectura; sin migraciones, cambios frontend ni escrituras de inventario. Sin pruebas de navegador ejecutadas en este preflight.

## 1. Inventario de llamadas y disparadores

`src/features/solog/cajero/full.app.tsx`:
- **Montaje**: `refresh()` inicial dentro de `useEffect`; react StrictMode puede provocar más de una lectura al desarrollar.
- **Foco**: `window.focus` → `resume()` → V6.
- **Visibilidad**: `document.visibilitychange` → `resume()`; si la pestaña queda visible → V6.
- **Reconexión**: `window.online` → V6; resetea marca de autocierre.
- **Storage entre pestañas**: cualquier `StorageEvent` con la clave del journal Full dispara V6.
- **Cambio de ronda**: efecto por `round_ends_at` solicita una lectura tras el borde de ronda.
- **Ventana snapshot horario**: sin sesión, fases `minute_59` y `waiting_new_snapshot` crean `setInterval(8_000)` para V6, sin consulta dentro de cada render de UI.
- **Retry explícito**: reintentar sincronización genera V6.
- **Auto-cierre**: al llegar a expiración, llama a `finish()`, que realiza reconciliaciones y V6. Los ticks de pantalla de 250 ms por sí solos no consultan Supabase.

`src/features/solog/cajero/full.runtime.ts`:
- `start()`: V6 → V7(`start`) → V6.
- `registerInside()`: reconcilia pendientes → V6; por cada lote V7(`save_batch`/`recount_save_batch`) → V6, para reevaluar prioridad.
- `finish()`: también llama `registerInside`; luego V7(`finish`) y V6; los replays conservan UUID/payload.
- `refreshInside()`: V6, actualiza confirmaciones y `panels`, después **siempre** invoca `persist(next)` aun si el journal resultó idéntico.
- `persist()`: ejecuta `storage.setItem(this.key, serialized)`, dispara cambios entre pestañas, además de `publish()`.
- `navigator.locks` serializa operaciones entre pestañas para la misma clave; **no deduplica** V6 solicitadas por eventos diferentes.
- `resumePrepared()`: una lectura tras cada ámbito pendiente; no alterar sin contrato de reconciliación.

`src/protected-app.tsx`: tras Auth, `rpc_solog_route_v2` resuelve destino; no es foco O1.
`src/features/solog/cajero/cajero.history.ts`: `rpc_solog_cashier_history_v2` (optimización O2, fuera del alcance O1).

## 2. Evidencia cuantitativa

`extensions.pg_stat_statements`: para el patrón PostgREST de V6, 622 llamadas acumuladas desde el reset 2026-08-18, media SQL ~76,2 ms, máximo ~769,5 ms. Esta ventana mezcla pruebas y actividad histórica y **no equivale a p95 ni a tiempo HTTP**.

Logs `edge_logs` de Supabase en la ventana consultada de ~24 h (2026-10-27/28):
- 362 peticiones HTTP a `/rest/v1/rpc/rpc_solog_cashier_bootstrap_v6`.
- 170/362 (~47 %) cayeron en los minutos HH:59, HH+1:00, HH+1:01 y HH+1:02.
- Una sesión de autenticación/usuario identificable en ese conjunto de eventos (identificadores no reproducidos aquí). Por tratarse de desarrollo/pruebas, **no extrapolar a operación estable**.
- `edge_logs` del API Gateway no ofrecen bytes de respuesta para calcular Egress real: según documentación vigente de Supabase, deben instrumentarse Network del navegador y métricas del dashboard de Egress.

Tamaño estimado en JSON PostgreSQL **sin comprimir**, lectura SQL sobre sesión histórica de 493 grupos: proyección con 493 grupos ~354.845 bytes; sin sesión activa el estado Full observado en las cinco sedes ~1.123 bytes de media. **No son bytes de salida de red facturados**, y no reflejan una sesión activa actualmente (al preflight había cero sesiones activas).

Teórico de polling 180 s: 8 s ≈22 consultas; 15 s ≈12; 20 s ≈9. La reducción de llamadas afectaría solo al sondeo, no a V6 de mutaciones o reconciliación; cambiar el intervalo aumenta el retraso potencial para detectar snapshot nuevo.

## 3. Hallazgos y riesgos

### H1 — eventos UI solapados (confirmado estructuralmente)
`focus` + `visibilitychange` pueden producir dos V6 por un solo regreso. `online` puede coincidir. Falta una coalescencia por motivo/ventana y protección contra refresh duplicado. El `gate` serializa, pero puede ejecutar cada consulta.

### H2 — eco entre pestañas por escritura de journal igual (confirmado en código, frecuencia NO medida)
`refreshInside` persiste siempre: V6 de pestaña A → `setItem` → `storage` en B → V6 en B → `setItem` → `storage` en A. Es un **riesgo de cascada** que requiere test determinista con dos pestañas y contador de RPC. **No afirmar un bucle infinito reproducido** sin ese test. No suprimir notificaciones reales de drafts, pending, confirmed o panels cambiados.

### H3 — sondeo durante transición horaria (confirmado)
Polling de 8 s en la ventana `HH:59–HH+1:02`, sin sesión y condicionado al estado del gate. En logs se observa concentración significativa. Alargar intervalo sin acuerdo afecta cuánto espera el cajero un snapshot confirmado. La autorización final continúa en backend.

### H4 — bootstrap V6 con efectos de estado (confirmado SQL)
`rpc_solog_cashier_bootstrap_v6` llama a `inventario.full_cashier_dispatch_v2`. Antes de la rama `bootstrap` comprueba usuario/dispositivo, bloquea la sede `FOR UPDATE` y tiene `UPDATE inventario.conteos` para pasar sesiones expiradas a `recovery` o `expirado` cuando corresponda. **No tratar V6 como un GET sin efectos**. No reemplazarlo por un TTL ciego que impida observar vencimientos, revocación, cambio de snapshot o sesión concurrente.

### H5 — refresco al cambio de ronda (confirmado)
`lastRoundRefresh` guarda el `round_ends_at` antes de intentar V6; si falla, no reintenta automáticamente por esa misma frontera. Puede recuperar mediante foco/reconexión/manual. Mejorar resiliencia requeriría condición de reintento limitada, sin nuevo polling agresivo.

### H6 — V6 protegido junto a V7 (confirmado)
`start`, `save_batch`, `recount_save_batch`, `finish`, replay y confirmaciones perdidas usan V6 para prioridad, manifest, referencia y sincronización. La optimización O1 **no debe eliminar ni posponer** lecturas imprescindibles. Un resumen V6 anterior no autoriza V7; V7 no lleva `coverage_pending_round` ni summary.

### H7 — StrictMode y efectos de inicio (probable, requiere medición)
El test de error transitorio del browser ya debía mantener el fallo hasta retry por relecturas de StrictMode; falta medir cuántos V6 se producen al montar y remontar el panel en navegador real.

## 4. Propuestas técnicas (pendientes de aprobación)

**P1 — Instrumentar baseline antes de optimizar (recomendado):**
- En tests browser, registrar V6 por motivo: `initial`, `focus`, `visible`, `online`, `storage`, `round`, `hourly`, `mutation/reconcile`, `manual`.
- Medir `request count`, payload JSON/transferidos Network, respuesta stale, errores, reintentos y tiempo hasta snapshot nuevo con simulación temporal.
- Dos pestañas, StrictMode, transición HH:59/00/01/02 y sesión activa/recovery.
- Solo instrumentación de pruebas; sin telemetría persistente ni datos reales en logs de prueba.

**P2 — Suprimir escrituras locales sin cambio (recomendado):**
- Comparar journal semántico antes de persistir. Si es igual, no `localStorage.setItem` ni `storage` cruzado; **sí** publicar el nuevo bootstrap V6, server_now y relojes.
- Mantener `persist` real e íntegro si cambió alguna confirmación, pending, rejected, panel o draft.
- Comparación bajo `navigator.locks`; no romper `read()`, aislamiento de usuario/device/session ni recuperación.

**P3 — Coalescer refrescos de eventos, sin sacrificar seguridad (recomendado):**
- Dedupe `focus/visible/online` del mismo regreso y `storage` redundante; in-flight singleflight o cola consolidada, con refresco final cuando el estado cambió durante una consulta.
- **NUNCA** deduplicar o retrasar llamadas V6 de `start/finish/register`, confirmaciones V7, replay, errores de autorización, expiración/recovery o invalidación de ronda.
- Mantener actualización al regresar de pestaña ausente; evitar cambios de ruta con consultas nuevas.
- El refresh manual y retry de operaciones inciertas no pueden verse bloqueados por TTL de refresco visual.

**P4 — Ajustar sondeo horario (opciones UX pendientes):**
- A: mantener 8 s (sin regresión de latencia; menor ahorro).
- B: probar 15 s (≈12 lecturas/3 min, retraso de detección hasta ~15 s en condiciones normales).
- C: probar 20 s (≈9 lecturas/3 min, retraso hasta ~20 s).
- En B/C conservar el borde de HH+1:02, autorización en V6/V7, refresh manual y retorno visible. No trasladar la autorización al frontend ni activar Realtime nuevo sin decisión específica.

**P5 — Resiliencia de ronda y validación:**
- En fallo V6 de cambio de ronda, mantener `coverageFresh=false` y habilitar retry acotado o manual; no exponer KPI antiguo.
- Suite Bun, lint, build, diff check, Playwright Chrome con RPC mocks; smoke humano del flujo horario real en Preview.

## 5. Exclusiones expresas

No cambiar RPC, Supabase SQL, migraciones, Auth, `route_v2`, historial/cache O2, contrato incremental O3, lógica/orden de prioridades Full, paginación de grupos, cron, sesiones, duración del turno, RPC V7, timestamps, referencias, outbox/idempotencia, autocierre, permisos, CSS, Admin, Detalles ni ConeXion. Hallazgos nuevos que no bloqueen O1 van a backlog.

## 6. Decisiones que faltan para congelar O1

1. Aprobar **P2 + P3** (eliminar escrituras idénticas y consolidar eventos, preservando refresh obligatorios).
2. Elegir **cadencia** para la detección de snapshot nuevo durante ventana horaria: 8, 15 o 20 s, o autorizar comparación experimental y decidir después de los tests P1.
3. Confirmar que el objetivo prioritario es **menos solicitudes**, sin ceder más de la latencia elegida ni reducir seguridad.
4. Tras aprobación, congelar una fuente primaria de implementación específica; este preflight **no** cumple ese papel.

## 7. Criterios de aceptación sugeridos

- Una carga inicial lógica por panel cuando el estado de autenticación ya está resuelto.
- `focus` y `visibilitychange` simultáneos no generan V6 duplicados.
- Dos pestañas sin cambios no desencadenan cascada de V6 por storage.
- Cuando cambia un draft o confirmación, otra pestaña observa/reconcilia con las garantías existentes.
- Polling en ventana según cadencia elegida; el primer V6 tras snapshot nuevo no excede el retraso esperado en condiciones normales.
- Inicio en HH:59 bloqueado; no habilitar hasta snapshot confirmado válido o respaldo HH+1:02 autorizado.
- Pérdida de respuesta V7 no duplica operaciones, nunca borra journal ni salta V6 necesario.
- Exactamente al vencer sesión/entrega y al cambiar de ronda la UI no ofrece acciones fuera de autorización.
- El ahorro se acredita con conteos RPC comparables antes/después; Egress medido en Network o métricas reales, no desde JSON teórico.
