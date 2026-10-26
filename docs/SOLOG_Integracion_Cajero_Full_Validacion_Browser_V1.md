# SOLOG — Integración Cajero Full — Validación Browser V1

**Estado:** Primera y segunda baterías Playwright **VALIDADAS LOCALMENTE (9/9)** en `admin-work` el 2026-10-26. Tercera batería: **1/2 aprobado**, 1 caso falló por sincronización prematura del arnés; corregido en `c80acff8`, **pendiente de reejecución**.
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

## Tercera batería — escenarios concurrentes pendientes de ejecución

**Estado y evidencia real:** el usuario ejecutó la tercera batería el 2026-10-26 con resultado **10 PASS / 1 FAIL / 0 solicitudes externas**. Pasó el caso de recovery A con sesión B activa. Falló la primera versión del caso de segundo batch por **wait prematuro**: la espera de `pending.length === 1` podía corresponder al primer lote, antes de que se aplicara el segundo. No hubo evidencia de fallo del runtime en esa ejecución. Se corrigió el arnés en `c80acff8` para esperar expresamente **dos observaciones remotas** y una única operación pendiente de **grupo B**, con exactamente una confirmación local y un borrador pendiente. **No se ha ejecutado aún esa corrección.** Los dos casos nuevos son:

| Caso | Criterio de aceptación |
|---|---|
| Fallo de respuesta después de aplicar el **segundo** batch | Primer batch confirmado permanece intacto; el segundo conserva UUID y payload exactos durante replay; 2 observaciones únicas y 3 llamadas `save_batch` (primera, segunda y su replay) |
| Dos sesiones coexistentes: A en recovery y B activa | El autocierre de A registra y finaliza exclusivamente A; B mantiene captura habilitada, registra su borrador con identificadores propios y no mezcla observaciones ni manifiestos entre sesiones |

El nuevo arnés conserva prohibición explícita de tráfico externo y usa únicamente fixtures simuladas.

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

**Criterios de aceptación:** los nueve escenarios ya acreditados deben mantenerse en verde y los dos nuevos deben emitir `PASS`, con resumen final **11 escenarios Full browser simulados; 0 solicitudes externas**. Una falla en cualquier caso debe salir con código distinto de 0: diagnosticarla, no relajar aserciones ni tratarla como éxito.

## Pendientes — siguientes fases

- **9 escenarios browser simulados validados**; **2 casos adicionales de tercera batería pendientes de ejecución**: segundo batch ambiguo y sesión A recovery/B activa. Restan validaciones específicas en el instante exacto del vencimiento de captura y aislamiento por cambios de usuario/dispositivo, además de un caso de colisión real de envíos simultáneos entre pestañas.
- Hacer la validación autenticada con RPC públicas V6/V7, usuario/dispositivo y datos específicamente aislados. Nunca simular autorización de backend con bypass en ambiente productivo.
- Revisión global y smoke final según evidencia. No cerrar el bloque solo por tests browser simulados.

**Regla de seguridad:** no modificar fechas reales, dispositivo autorizado, hashes ni datos operativos para acelerar pruebas. Cualquier preparación de fixtures remotos deberá diseñarse y validarse por separado antes de usar el backend.
