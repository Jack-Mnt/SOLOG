# SOLOG — Optimización Cajero — Refrescos V6 — Delta de preflight V2

**Estado:** DELTA DE PREFLIGHT, EXPLORACIÓN / PROPUESTAS PENDIENTES DE APROBACIÓN. **NO CONGELADO. NO IMPLEMENTAR TODAVÍA.**
**Fecha:** 2026-10-28.
**Rama observada:** `admin-work`.
**HEAD verificado:** `52814cc7cea003d59e81f56d219773990ae1ebdc`.
**Clasificación:** Nivel B frontend, con invariantes de consistencia/recovery y límites de Nivel C; no se autoriza cambio backend.
**Preflight base:** `docs/SOLOG_Optimizacion_Cajero_Refrescos_V6_Preflight_V1.md` (conservado como evidencia histórica; las hipótesis de dos pestañas operativas ya no corresponden).
**Fuente primaria funcional vigente:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`, contrato `docs/SOLOG_Backend_Cajero_KPIs_Cobertura_Full_Contrato_V1.md` y delta de sede.
**Bloque funcional CERRADO y prevalente:** `docs/SOLOG_UX_Cajero_Instancia_Unica_Tablet_V1.md`. No reabrir ni rediseñar.
**Referencia histórica anterior:** `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` (2026-09-03); las prohibiciones genéricas sobre refresco al foco y actualización tras V7 no deben imponerse sobre el contrato Full posterior, que requiere recuperación, round y reconciliación.
**Fuente primaria NUEVA de implementación O1 pendiente:** solo se creará/congelará después de que el usuario apruebe los comportamientos que faltan.

## 1. Cambio de contexto desde preflight V1

La instancia única Cajero se implementó, pasó pruebas de navegador y smoke Chrome/Android 7/7, y se cerró formalmente. En cada origen/partición de Chrome, una segunda ventana Cajero **no monta FullRuntime, no llama V6/V7 y no escribe el journal Full**.

Consecuencias:
- La posible cascada V6↔storage entre **dos Cajeros operativos** del preflight V1 está mitigada estructuralmente; no debe presentarse como ahorro pendiente de O1.
- Los eventos `focus`, `visibilitychange`, `online` y los refrescos por reloj siguen pudiendo solicitar V6 redundantes **dentro del propietario**.
- `refreshInside()` continúa haciendo `persist(next)` aun si no hay cambios; eliminar la escritura idéntica mejora higiene/localStorage y publicaciones innecesarias, pero **no se atribuirá automáticamente un ahorro de Egress**.
- Los tests de navegador de O1 deben respetar la instancia única; no reconstruir las viejas pruebas de dos operadores UI.

## 2. Preflight dirigido del código vigente

`src/features/solog/cajero/full.app.tsx`:
- Montaje `useEffect` → `refresh()`.
- `focus` y `visibilitychange` visible → `refresh()` independientes; `online` → `refresh()`.
- `storage` sobre la clave del journal → `refresh()`; con instancia única el evento no supone otro Cajero operativo.
- Límite de ronda `round_ends_at`: `lastRoundRefresh` se marca **antes** de `runtime.refresh()`; fallo no dispone de reintento automático de esa frontera.
- Sin sesión, durante `minute_59` / `waiting_new_snapshot`, `setInterval(8_000)` hace V6, además de otros eventos; el flag `inflight` pertenece a ese efecto, no deduplica otros disparadores.
- `setInterval(250)` actualiza reloj UI **sin consulta por sí solo**; retry prepared 30s existe para conciliación, no retirar.

`src/features/solog/cajero/full.runtime.ts`:
- `refreshInside()` concilia `confirmed`, `panels` y `drafts` y llama siempre a `persist(next)`, que escribe `localStorage` y publica.
- `start`, `sendPending`, `finish`, `resumePrepared` usan `refreshInside()` en puntos relevantes de validez, prioridades, manifests y replays. **No eliminar sus V6 ni deduplicarlas por TTL**.
- El mutex transaccional y el wrapper de tenencia del bloque cerrado se conservan intactos.

`src/features/solog/cajero/full.start-gate.ts`:
- HH:59 bloqueado sin excepción; HH+1:00–01:59 requiere snapshot nuevo confirmado; HH+1:02 habilita respaldo, siempre sujeto a comprobación remota.
- El sondeo solo permite detectar más pronto la confirmación; no concede autorización por sí mismo.

## 3. Evidencia previa cuantitativa — no reutilizar como baseline nuevo

Preflight V1 (~24 h de desarrollo, 2026-10-27/28): 362 llamadas HTTP V6, 170 en HH:59/00/01/02 (~47%). Eran pruebas, no cinco sedes en producción. El promedio SQL histórico ~76,2 ms y proyección de JSON sin comprimir ~354.845 B con 493 grupos **no equivalen a tiempos HTTP ni Egress facturado**. Medir de nuevo los escenarios comparables del propietario único.

Teórico en 180 s: 8 s ≈22 V6; 15 s ≈12; 20 s ≈9, sin contar cambios de fase, navegación o V6 de reconciliación. La reducción en una ventana de sondeo aislada no es reducción porcentual del Egress global.

## 4. Propuesta renovada, NO aprobada

**O1R.1 — Baseline reproducible (primero):** añadir instrumentación solo a tests de navegador para contabilizar RPC V6 por causa/grupo de causas, estado de sesión, RPC V7, tamaño de respuesta y momentos de cambio horario; incluir StrictMode, foco+visible+online, retorno con error, ronda, recovery y reloj. Separar métricas simuladas de mediciones HTTP reales; no generar telemetría persistente ni escribir datos de prueba en remoto.

**O1R.2 — Journal solo cuando cambia:** no hacer `localStorage.setItem` con contenido semánticamente idéntico tras V6; **sí** actualizar y publicar `bootstrap`, reloj, `coverageFresh` y estado UI. Conservar persistencia completa de cualquier cambio en pending, confirmed, drafts y panels, con comparación dentro del lock transaccional.

**O1R.3 — Consolidación de disparadores pasivos:** fusionar eventos `focus`/`visible`/`online` del mismo retorno y lecturas pasivas redundantes; una V6 puede cubrir múltiples señales. Evitar poner una caché TTL genérica sobre `runtime.refresh()`: los refresh obligatorios desde mutaciones, replays, conciliación, start/finish, ronda, revocación o recovery permanecen correctos. Si ocurre un cambio real mientras la lectura está en vuelo, revalidar al concluir según necesidad para no perder invalidaciones. No introducir polling de fondo ni refresco por navegación interna.

**O1R.4 — Sondeo horario:** comparar 8/15/20 segundos con simulación determinista; **recomendación inicial sujeta a aprobación: 15 s** para reducir llamadas durante la ventana con un retraso normal de detección de hasta ~15 s. No modificar HH:59, HH+1:02 ni la comprobación de autorización en backend.

**O1R.5 — Resiliencia de cambio de ronda y revisión:** si V6 falla justo en `round_ends_at`, evitar que una marca previa de éxito silencie el reintento necesario. Mantener KPI de cobertura no fresco cuando no se ha confirmado el nuevo estado; reintento acotado o acción manual, sin generar sondeo agresivo.

**O1R.6 — Validación y cierre:** `bun test`, lint, build, `git diff --check`, navegador Playwright Full, casos de transición/recovery/errores, medición comparable V6 y smoke de transición en Preview. La instancia única sigue en la fuente cerrada, no se reimplementa.

## 5. Contratos y riesgos que no deben cambiar

- `rpc_solog_cashier_bootstrap_v6` puede cambiar estados remotos de sesiones vencidas (`active`→`recovery` / `expired`); no es un GET puramente cacheable.
- `rpc_solog_cashier_mutate_v7` conserva idempotencia, UUID/payload, outbox y replays; V6 posterior puede ser necesario para prioridades/confirmación.
- Debe persistir `America/Lima`, fecha/stock confirmado por backend, horarios HH:59/00/01/02, congelamiento de referencia, cierre automático y prohibición de capturas fuera de sesión.
- Restringir cambios a Cajero Full y sus tests. Prohibidos cambios en Supabase, RLS, SQL, Auth, Admin, Detalles, Connector/ConeXion, PWA, O2 historial, O3 bootstrap incremental.
- Los detalles de rendimiento sin fuente real no deben presentarse como métricas facturadas.
- La política de una única instancia ya está cerrada y no se vuelve a explorar en O1.

## 6. Decisiones requeridas

1. ¿Aprobar O1R.1–O1R.3 y O1R.5–O1R.6 conservando los límites de este delta?
2. ¿Aprobar **15 s** como cadencia por defecto, o mantener **8 s** / elegir **20 s**?
3. Tras la aprobación, congelar un Markdown específico de implementación y ejecutar el flujo de baseline→plan→aprobación→fases. No implementar propuestas ahora.
