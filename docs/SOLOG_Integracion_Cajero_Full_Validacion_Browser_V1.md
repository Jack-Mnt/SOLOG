# SOLOG — Integración Cajero Full — Validación Browser V1

**Estado:** Cuatro baterías Playwright **VALIDADAS LOCALMENTE (14/14)** en `admin-work` con **0 solicitudes externas** según ejecución comunicada el 2026-10-27. Browser simulado cerrado y aprobado; E2E autenticado aislado de Supabase pendiente. **Bloque integral aún abierto**.
**Fecha:** 2026-10-26. **Clasificación:** Nivel C por las garantías de recuperación/idempotencia que comprueba; los cambios realizados son exclusivamente de infraestructura de pruebas.

## Autoridad y alcance

1. **Fuente funcional primaria congelada:** `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`.
2. **Delta técnico implementado:** `docs/SOLOG_Correccion_Cajero_Full_Recuperacion_Incidencias_V1.md`.
3. **Backend desplegado:** `docs/SOLOG_Backend_Cajero_Full_Recovery_Finish_V1.md`.
4. **Esta nota** documenta el arnés y las evidencias de pruebas; no modifica ninguna decisión funcional ni contrato remoto.

Quedan fuera: `master`, migraciones, Supabase, Motor, V4/V5, cambios de UI, refactors generales y cualquier operación con credenciales reales.

## Preflight

- Se constató `@playwright/test` como dependencia de desarrollo y scripts de navegador existentes en `tests/*.browser.mjs`. El proyecto emplea `createServer()` de Vite, `chromium`, mocks y bloqueo explícito de tráfico externo.
- El `playwright.config.mjs` vigente apunta a `tests/browser/recovery-harness.html`, recurso no presente en la rama; la primera batería utiliza **un entry independiente**, sin modificar la configuración general.
- `src/features/solog/cajero/cajero.app.tsx` monta `FullCashierPanel` y utiliza V6/V7; el arnés reemplaza `/src/lib/supabase.ts` a nivel de red exclusivamente en el contexto de pruebas.
- `FullRuntime` usa `navigator.locks` y `localStorage` con clave por usuario/dispositivo. Los ensayos multitab usan páginas dentro del mismo contexto para que compartan ambos mecanismos.
- El smoke real previo 8/8 y los tests/lint/build se validaron por separado. **Evidencia nueva:** el usuario ejecutó `node tests/cajero-full.browser.mjs` tras fast-forward de `8bb0c80` a `1074777` y obtuvo los cuatro mensajes `PASS` y resumen `PASS: 4 escenarios Full browser simulados; 0 solicitudes externas.` No hubo evidencias de fallos ni bloqueos en esa ejecución. Este resultado valida el arnés simulado, no RPC públicas autenticadas.

## Primera batería

Archivo: `tests/cajero-full.browser.mjs`. Arranca Vite en `127.0.0.1:5212`, abre Chrome headless y simula una sesión Cajero y el contrato V6/V7. Todo el tráfico HTTP que no sea local se **bloquea**. Las RPC se interceptan y registran dentro de la simulación, sin conexión Supabase.

| Caso | Qué exige |
|---|---|
| Respuesta de `save_batch` perdida | El servidor aplica el batch una sola vez; el cliente conserva outbox y reintenta exactamente el mismo UUID/payload; la UI conserva y después retira pendientes |
| `finish` aplicado con respuesta perdida | Tras recarga, bootstrap ya no muestra la sesión, pero el journal permite reenviar el `finish` exacto; no se crea nuevo manifiesto ni nuevo UUID |
| Sesión expirada con borrador previo | Bootstrap entrega `recovery_delivery_states`; el panel registra el borrador dentro de ventana permitida y ejecuta autocierre automático; la simulación verifica la secuencia `save_batch → finish` |
| Dos pestañas en la misma sesión | Captura un borrador de cada grupo en páginas diferentes, comprueba conservación conjunta y registro en un único batch; si falla, evidencia un defecto de coordinación que **no** debe ocultarse relajando aserciones |

Se aplican fixtures de usuario, dispositivo y snapshot **ficticios**. Se prueba la UI real de `Continuar`, `Registrar conteo`, `Finalizar conteo` y reintento.

## Segunda batería — ampliación browser

**Estado:** cinco casos adicionales **VALIDADOS LOCALMENTE (5/5)** junto con los cuatro originales. El usuario ejecutó `node tests/cajero-full.browser.mjs` sobre el HEAD `a8cd8a5e` y obtuvo **9 PASS, 0 FAIL y 0 solicitudes externas**. No hubo cambios en runtime, UI ni backend.

| Caso | Evidencia buscada |
|---|---|
| Reconteo Full | UI de `Revisar`, borrador de reconteo, mutación `recount_save_batch` con `detalle_id`, manifiesto y cierre `finish` |
| Prioridad cambiante | Borradores de clases distintas: confirmar primer grupo, refrescar V6 y emitir segundo batch sin adelantar la prioridad inferior |
| Rechazo definitivo | `PRIORITY_CONFLICT` de V7 conserva la operación `rejected`; no la reintenta ni permite `finish` |
| Escritura de localStorage fallida | Inyección de `QuotaExceededError` al intentar guardar borrador: error visible, cero borradores ficticios y cero `save_batch` |
| Límite exacto de entrega | A `session_expires_at + 2 horas`, los borradores no generan nuevas mutaciones y conservan evidencia |

**Ampliación del caso de `finish` ya validado:** en la segunda ejecución, el arnés simula además recarga **después del fin de la ventana de entrega**, para verificar que únicamente se reenvía el mismo UUID de `finish` ya aceptado. El resultado anterior 4/4 no acredita esta variante nueva.

El fixture se limita a un backend simulado con respuestas V6/V7 de prueba. Las garantías del reloj de servidor, persistencia remota y autorización real solo se acreditan en tests autenticados controlados.

## Tercera batería — escenarios concurrentes validados

**Estado y evidencia real:** en la primera ejecución de la tercera batería se obtuvo **10 PASS / 1 FAIL / 0 solicitudes externas** por sincronización prematura del test del segundo batch, no por fallo demostrado de runtime. Se corrigió la espera en `c80acff8` para distinguir la única operación pendiente del segundo lote mediante sus identificadores y confirmaciones. **El usuario reejecutó después de esa corrección (2026-10-26), obteniendo 11 PASS / 0 FAIL / 0 solicitudes externas.** Por tanto los dos casos nuevos están validados:

| Caso | Criterio de aceptación |
|---|---|
| Fallo de respuesta después de aplicar el **segundo** batch | Primer batch confirmado permanece intacto; el segundo conserva UUID y payload exactos durante replay; 2 observaciones únicas y 3 llamadas `save_batch` (primera, segunda y su replay) |
| Dos sesiones coexistentes: A en recovery y B activa | El autocierre de A registra y finaliza exclusivamente A; B mantiene captura habilitada, registra su borrador con identificadores propios y no mezcla observaciones ni manifiestos entre sesiones |

El nuevo arnés conserva prohibición explícita de tráfico externo y usa únicamente fixtures simuladas.

## Cuarta batería — límites y aislamiento (validada)

**Estado:** tres pruebas adicionales **validadas localmente (3/3) el 2026-10-27**, junto a once anteriores en verde: resultado final **14 PASS / 0 FAIL / 0 solicitudes externas**. Solo se amplió `tests/cajero-full.browser.mjs`; frontend, Motor y backend permanecieron intactos.

| Caso | Criterio de aceptación |
|---|---|
| `session_expires_at` exacto | A igualdad exacta del timestamp, `capture_allowed = false`; se conserva `contado_at` de un borrador anterior; `save_batch` y `finish` cierran sin crear captura posterior |
| Outboxes ajenos por usuario y por dispositivo | Dos journals de identidad distinta persisten sin ser modificados ni reintentados; solo se registra el borrador del usuario/dispositivo actuales. Esto no sustituye una prueba real de cambio de autenticación |
| Dos pestañas y clicks concurrentes en `Registrar conteo` | Se retiene deliberadamente la respuesta del primer `save_batch` **ya aplicado**, se pulsa Registrar en la segunda pestaña mientras el lock sigue ocupado y después se libera la respuesta; debe haber un solo batch y cero duplicaciones |

**Criterio de ejecución cumplido:** once pruebas anteriores en verde, tres nuevas aprobadas y resumen `PASS: 14 escenarios Full browser simulados; 0 solicitudes externas.` La barrera del ensayo multitab retuvo deliberadamente el receipt del primer lote mientras la segunda pestaña ejecutaba Registrar, confirmando el único batch.

## Ejecución local

Desde `admin-work`, con dependencias ya instaladas y Google Chrome disponible:

```powershell
git pull --ff-only origin admin-work
node tests/cajero-full.browser.mjs
bun run lint
bun run build
git diff --check
```

El navegador por defecto es Chrome. Se admite `SOLOG_TEST_BROWSER` con ruta absoluta a un ejecutable Chromium/Chrome alternativo. Si no hay Chrome, debe instalarse un navegador Playwright o configurarse explícitamente un ejecutable disponible, sin cambiar la lógica de pruebas.

**Criterios de aceptación browser simulado, cumplidos:** **14/14 PASS**, cero solicitudes externas, sin fallos reportados por el arnés. El usuario ejecutó `git pull --ff-only origin admin-work` y `node tests/cajero-full.browser.mjs` el 2026-10-27 y aportó la salida completa. Esto no demuestra autorización, recepción o persistencia en Supabase real.

## Preflight E2E autenticado real — 2026-10-27 (solo lectura)

**Estado:** preflight inicial realizado, **sin autorización para mutaciones de prueba ni entorno aislado identificado**. No se cambió esquema, usuarios, dispositivos, sesiones o funciones.

- Proyecto Supabase actual SOLOG: `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`), operativo, con **1 sesión activa y 0 en recovery** en el momento de la consulta. Los números son puntuales y pueden cambiar.
- En la cuenta figuran dos proyectos: `PuertoRicoOnline` y `ControlA-PR`; **no hay constancia de que el segundo sea un staging de SOLOG** y no debe reutilizarse sin decisión explícita.
- Datos agregados de `PuertoRicoOnline`: 5 sedes activas, 2 usuarios Cajero activos, 2 dispositivos autorizados y una instalación Full habilitada. Estos datos no demuestran disponer de una sede, cajero o dispositivo **exclusivos para pruebas**.
- Entradas públicas: `rpc_solog_cashier_bootstrap_v6(p_payload jsonb)` y `rpc_solog_cashier_mutate_v7(p_action text,p_payload jsonb)`; `authenticated` tiene permiso `EXECUTE`, `anon` no.
- Advertencia de inventario de Supabase: `inventario.solog_session_runtime_groups` tiene RLS desactivado. Comprobación SQL independiente: `anon` y `authenticated` no disponen de `USAGE` directo sobre el esquema ni `SELECT/INSERT` directo sobre la tabla. **No asumir exposición real directa a Data API sin verificar configuraciones adicionales**; tratar auditoría RLS/permisos como tema independiente, sin aplicar RLS a ciegas.
- **Limitación para staging local:** `supabase/migrations` en `admin-work` contiene 22 archivos, el último fechado 2026-10-15; la historia remota registra las migraciones Full posteriores del 2026-10-22 y 2026-10-25, ausentes del árbol local. No asumir que `supabase db reset` sobre un entorno vacío reconstruye V6/V7. Debe reconciliarse el esquema/migraciones antes de usar un staging desde cero, sin sobrescribir la historia de producción.
- El smoke humano Full **8/8** más contraste remoto de tres observaciones y un `finish` ya acredita el flujo autenticado básico. El E2E adicional debe concentrarse en **replay, respuestas perdidas, vencimiento, recovery y autorización**, no repetir el flujo normal sin propósito.

**Bloqueo:** no ejecutar mutaciones reales destructivas ni manipular fechas/caducidades/sesiones operativas. Antes de tests autenticados avanzados se necesita aislar backend y datos, definir limpieza y rollback, y comprobar permisos y fixtures. Preferencia propuesta, **no aprobada**: entorno staging Supabase propio de SOLOG o Supabase local reproducible con esquema/migraciones y datos ficticios. No utilizar `ControlA-PR` como staging por inferencia.

## Pendientes — siguientes fases

- **14 escenarios browser simulados validados; fase browser simulada cerrada.** La simulación de claves de journals distintas no sustituye un cambio real de sesión autenticada; las carreras entre pestañas del mismo navegador no representan concurrencia multi-dispositivo remota.
- Hacer la validación autenticada con RPC públicas V6/V7, usuario/dispositivo y datos específicamente aislados. Nunca simular autorización de backend con bypass en ambiente productivo.
- Revisión global y smoke final según evidencia. No cerrar el bloque solo por tests browser simulados.

**Regla de seguridad:** no modificar fechas reales, dispositivo autorizado, hashes ni datos operativos para acelerar pruebas. Cualquier preparación de fixtures remotos deberá diseñarse y validarse por separado antes de usar el backend.
