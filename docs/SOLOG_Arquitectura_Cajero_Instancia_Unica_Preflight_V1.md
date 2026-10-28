# SOLOG — Arquitectura Cajero — Instancia única — Preflight técnico V1

**Estado:** PREFLIGHT TÉCNICO COMPLETADO, SOLO LECTURA. **No es autorización de implementación ni plan aprobado**.
**Fecha:** 2026-10-28.
**Clasificación:** Nivel B de implementación frontend, con riesgos de concurrencia/consistencia propios de Nivel C.
**Rama y baseline inspeccionado:** `admin-work` @ `0d3c84c23d045b1fd9cb2319bcc8edbf30094016`.
**Fuente primaria funcional congelada y prevalente para esta implementación:** `docs/SOLOG_UX_Cajero_Instancia_Unica_Tablet_V1.md`.
**Contratos vigentes, sin cambios:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md` y V6/V7.
**Preflight transversal de Egress (no es implementación O1 completa):** `docs/SOLOG_Optimizacion_Cajero_Refrescos_V6_Preflight_V1.md`.
**No mezclar:** instalación PWA formal, manifest, service worker, caché offline, cambios a O1.3/O1.4 ni optimización de endpoints no aprobada.

## 1. Evidencia de repositorio

- `src/features/solog/cajero/cajero.app.tsx`: `Owner` crea `new FullRuntime(..., localStorage, ...)` al montarse; a continuación monta `FullCashierPanel`. Debe introducirse compuerta **previa al constructor**. No inicializar device token ni leer/escribir journal mientras está bloqueado.
- `src/features/solog/cajero/full.app.tsx`: un `useEffect` de montaje llama `runtime.refresh()` (V6); sus listeners, timers y mutaciones solo deben existir en la pestaña propietaria.
- `src/features/solog/cajero/full.runtime.ts`: mutex transaccional `navigator.locks.request(this.key, run)`, cuya clave es `solog.full2.${userId}.${deviceToken}`. El mutex de propietario debe tener **otro nombre**, sin colisión, bloqueo anidado ni cambios a este lock.
- `src/protected-app.tsx`: Cajero se monta de forma diferida al acceder a rutas Cajero; login, Admin y Detalles son rutas diferentes. Proteger **solo el montaje de Cajero**, nunca el proveedor de autenticación global.
- `src/main.tsx`: `<StrictMode>` activo; efectos pueden montar/desmontar/remontar en pruebas y desarrollo. Evitar un doble dueño efímero o bloquear el remount legítimo.
- `tests/cajero-full.browser.mjs`: Chromium con un `browserContext`, mock V6/V7, contador `fake.bootstrapAttempts` y pruebas multi-tab en líneas aproximadamente 960 y 993. Estas **presuponen dos interfaces Cajero activas**, contrarias al nuevo requisito.
- `index.html` contiene iconos; `vite.config.ts` usa React sin plugin PWA y no hay manifest ni service worker en la rama. Instalación formal **fuera de O1**.

## 2. Comportamiento aprobado, con guías técnicas

- **Ámbito**: una sola instancia `Cajero` por **origen y partición de almacenamiento/perfil Chrome**. Usar nombre constante independiente de userId y deviceToken, para no admitir dos instancias operativas tras cambios de identidad dentro del mismo contexto de navegación.
- **Adquisición**: Web Locks `navigator.locks.request(nombre,{mode:'exclusive',ifAvailable:true}, callback)`. `ifAvailable` no espera, entrega `null` a la segunda instancia. No usar `steal`, TTL de `localStorage`, heartbeat como autoridad ni takeover automático.
- **Tenencia**: callback mantiene una promesa pendiente durante la vida operativa del componente. La promesa que devuelve `navigator.locks.request` no resuelve hasta **la liberación del bloqueo**, de modo que no debe esperarse como condición para renderizar el propietario.
- **Desmontaje**: liberar al desmontar efectivamente Cajero o salir del contexto. Evitar cierre del lock y remount simultáneos durante StrictMode; cancelar continuaciones tardías y limpiar callbacks. Si hay V7 o reconciliación en vuelo al salir de Cajero, el plan debe explicar cómo no habilitar segundo propietario hasta que la operación termine o quede durable/reconciliable. Un cierre abrupto del proceso lo resuelve el navegador, manteniendo protecciones backend/idempotencia.
- **Secundaria**: vista de «SOLOG Cajero ya está abierto en otra ventana», sin `FullRuntime`, sin V6/V7, sin timers y sin `localStorage.setItem` de journal. Botón `Reintentar` **manual**. Nunca forzar cierre de la primera. No ofrecer un logout global desde la segunda sin estudiar sus efectos, ya que Auth está sincronizada entre pestañas.
- **Errores**: ausencia/error de Web Locks → fail-closed para el runtime; mensaje claro y salida segura. El bloqueo no impide la fase Auth ni las rutas no Cajero.
- **Suspensión**: `hidden` o `blur` no liberan la tenencia. App instalada y pestaña convencional pueden compartir el mismo origen, pero el smoke Android debe verificar el alcance real según instalación/perfil; otra tablet/navegador no se bloquea.

Referencias externas verificadas el 2026-10-28:
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- MDN `request()`: https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request
- Especificación W3C: https://www.w3.org/TR/web-locks/
- Instalación como app: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

## 3. Incompatibilidad de pruebas que debe atender el plan de Codex

- `tests/cajero-full.browser.mjs`: caso «dos pestañas con Registrar simultáneo» abre A y B y ejecuta V7 desde ambas; caso «dos pestañas: borradores de grupos distintos y un único batch» también presupone 2 operadores. **La política aprobada impide esos escenarios de UI**.
- Adaptación mínima exigida: convertir esos escenarios browser en pruebas de **una propietaria / otra bloqueada / ningún V6/V7 de la bloqueada / reintento manual tras liberar**. **Preservar la cobertura de lock transaccional V7 y de idempotencia** en pruebas unitarias/integración de `FullRuntime`, utilizando dos runtimes simulados con el mismo `FullLock` y datos compartidos, cuando corresponda.
- Añadir pruebas: dos pestañas en carrera (una sola), refresco/desmontaje y StrictMode, suspensión/segundo plano sin liberación, cambio de usuario, salida de ruta, espera por mutación en vuelo, pérdida de respuesta, outbox persistido, recovery, perfil/origen distintos (en alcance simulado posible), bloqueo y reintento manual.
- El harness `createPage()` hoy espera `Inicio` por defecto; debe admitir con intención una segunda página bloqueada, sin debilitar aserciones de los demás escenarios.

## 4. Riesgos que no deben resolverse con suposiciones

1. **Deadlock**: lock de propietaria mantenido mientras se solicitan locks transaccionales; nombres distintos y comprobación de orden.
2. **StrictMode**: adquisición/resolución tardías tras cleanup. Requiere estado/generación de intento y un protocolo de liberación estable.
3. **In-flight**: si se desmonta la propietaria y se concede otra antes de finalizar V7, puede quedar operación no conciliada. No retirar ni acelerar funciones existentes de registro/finish/retry por esta mejora.
4. **Múltiples perfiles/orígenes**: Web Locks no garantiza exclusividad global; comunicación/autoridad backend vigente.
5. **Aplicación Android instalada**: dependiendo de Chrome y del empaquetado puede haber distinción entre atajo, WebAPK y almacenamiento separado. Prueba humana en tablet necesaria; no prometer comportamiento no verificado.
6. **Sesión Auth compartida**: cerrar sesión en pestaña bloqueada podría terminar la sesión en la propietaria; no exponer esa acción inadvertidamente.
7. **Egress**: ahorro solo de segunda instancia y eco cruzado. Polling horario, refresh de foco y V6 de mutaciones continúan por fuera de esta fase.

## 5. Planificación exigida a Codex, no ejecución

**Paso siguiente:** Codex debe establecer HEAD/baseline actual (no suponer que sigue siendo el de este informe), leer fuente primaria, inspeccionar solo las dependencias acotadas, y entregar:
1. Diseño de guard y tenencia Web Lock; nombres y ciclo de vida; cómo funciona en StrictMode.
2. Orden de integración sin tocar `FullRuntime` salvo necesidad técnica mínima justificada.
3. Migración de los dos tests multitab para no perder cobertura de concurrencia V7.
4. Fases cortas con archivos, riesgos y pruebas; estrategia de rollback.
5. Bloqueos técnicos concretos y cambios mínimos recomendados.

**No implementar ni modificar backend** antes de aprobación del plan. PWA es backlog independiente.

## 6. Criterios de verificación previstos

- Unit/integration de guard y carrera; browser test Chrome 1 propietaria + 1 bloqueada sin V6/V7 de B.
- Operar en A con B bloqueada; background A no libera; cerrar A, pulsar reintentar B → una sola V6 inicial de recuperación, sin pérdida de outbox.
- StrictMode/refresh/reload/navegación, cross-tab y mutation in-flight sin doble propietaria.
- `bun test`, `bun run lint`, `bun run build`, `git diff --check` y `node tests/cajero-full.browser.mjs`.
- Smoke Android Chrome (pestaña + app desde icono), diferentes orígenes (preview/producción), fallos de red/suspensión y verificación de que Admin/Detalles no se bloquean.
- Baseline y después: V6 por escenario y ningún V6/V7 desde segunda instancia; métricas de Egress de red sin asumir que bytes SQL son bytes HTTP.
