# SOLOG — Integración Cajero Full — Validación Browser V1

**Estado:** Primera batería Playwright **VALIDADA LOCALMENTE (4/4)** en `admin-work` según ejecución del usuario el 2026-10-26. Segunda batería ampliada pendiente de ejecución.
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

**Estado:** cinco casos adicionales IMPLEMENTADOS pero **SIN EJECUCIÓN LOCAL ACREDITADA**; no se modifica runtime, UI ni backend. Continúan ejecutándose con el mismo entry y dentro del aislamiento de tráfico externo.

| Caso | Evidencia buscada |
|---|---|
| Reconteo Full | UI de `Revisar`, borrador de reconteo, mutación `recount_save_batch` con `detalle_id`, manifiesto y cierre `finish` |
| Prioridad cambiante | Borradores de clases distintas: confirmar primer grupo, refrescar V6 y emitir segundo batch sin adelantar la prioridad inferior |
| Rechazo definitivo | `PRIORITY_CONFLICT` de V7 conserva la operación `rejected`; no la reintenta ni permite `finish` |
| Escritura de localStorage fallida | Inyección de `QuotaExceededError` al intentar guardar borrador: error visible, cero borradores ficticios y cero `save_batch` |
| Límite exacto de entrega | A `session_expires_at + 2 horas`, los borradores no generan nuevas mutaciones y conservan evidencia |

**Ampliación del caso de `finish` ya validado:** en la segunda ejecución, el arnés simula además recarga **después del fin de la ventana de entrega**, para verificar que únicamente se reenvía el mismo UUID de `finish` ya aceptado. El resultado anterior 4/4 no acredita esta variante nueva.

El fixture se limita a un backend simulado con respuestas V6/V7 de prueba. Las garantías del reloj de servidor, persistencia remota y autorización real solo se acreditan en tests autenticados controlados.

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

**Criterios de aceptación:** los cuatro casos originales superados localmente deben continuar en verde, los cinco nuevos deben emitir `PASS`, el resumen debe anunciar **9 escenarios Full browser simulados** y **0 solicitudes externas**. Una falla en cualquier caso debe salir con código distinto de 0: diagnosticarla, no relajar aserciones ni tratarla como éxito.

## Pendientes — siguientes fases

- Extensión browser ya implementada, pendiente de ejecutar: reconteo, prioridad cambiante, rechazo definitivo, límite +2h y almacenamiento fallido. **Todavía falta**: recovery A con sesión B activa, reloj en el instante exacto del vencimiento de captura, fallo del segundo lote y aislamiento por cambios de usuario/dispositivo.
- Hacer la validación autenticada con RPC públicas V6/V7, usuario/dispositivo y datos específicamente aislados. Nunca simular autorización de backend con bypass en ambiente productivo.
- Revisión global y smoke final según evidencia. No cerrar el bloque solo por tests browser simulados.

**Regla de seguridad:** no modificar fechas reales, dispositivo autorizado, hashes ni datos operativos para acelerar pruebas. Cualquier preparación de fixtures remotos deberá diseñarse y validarse por separado antes de usar el backend.
