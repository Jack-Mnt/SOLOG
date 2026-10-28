# SOLOG — UX Cajero — Instancia única en tablet — V1

**Estado:** VIGENTE — IMPLEMENTACIÓN APROBADA, VALIDADA Y CERRADA (2026-10-28). Las decisiones funcionales de esta V1 permanecen congeladas.
**Fecha:** 2026-10-28.
**Clasificación:** Nivel B funcional de coordinación entre contextos, con riesgo de concurrencia y recovery que exige pruebas propias.
**Fuente primaria específica de la instancia única:** este documento.
**Fuente de preflight O1:** `docs/SOLOG_Optimizacion_Cajero_Refrescos_V6_Preflight_V1.md`.
**Autoridad global sin cambios:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md` y los contratos V6/V7 desplegados. Ante contradicción, no alterar invariantes de Motor, sesión, outbox o idempotencia.

## Contexto de producto aprobado

SOLOG Cajero se utilizará principalmente en **tablets con Chrome**, abierto desde el icono como una aplicación. No se busca un flujo de trabajo con varias pestañas operativas.

La **política funcional aprobada** es: **una sola instancia operativa de SOLOG Cajero por origen y perfil/partición de Chrome**. Cuando otra pestaña o ventana de la misma aplicación y partición intente operar simultáneamente, la segunda queda bloqueada **sin transferencia automática ni cierre forzado de la primera**. Esta política solo rige para Cajero; Admin y otras plataformas no se bloquean.

La exclusividad de navegador no sustituye la autorización ni la concurrencia entre **dispositivos, perfiles, navegadores o instalaciones con almacenamiento separado**. El backend Full continúa siendo la autoridad.

## Requisitos aprobados para comportamiento

1. Adquirir un lock **exclusivo de larga duración** antes de montar `FullRuntime` o lanzar V6; nombre distinto del lock existente de transacciones del runtime. No introducir deadlock con los `navigator.locks` actuales.
2. La instancia propietaria puede operar normalmente, navegar en Cajero, registrar, cerrar, actualizar y reconciliar con todas las protecciones Full existentes.
3. Una segunda instancia de Cajero que no adquiere el lock muestra una pantalla explicativa («SOLOG Cajero ya está abierto en otra ventana»), sin ejecutar V6, mutaciones, timers de Cajero ni escribir el journal Full.
4. No robar el lock, forzar cierre, transferir automáticamente el control ni crear un timeout que pueda dejar dos propietarios concurrentes. La secundaria puede permitir **reintentar manualmente** la adquisición después de cerrar la principal.
5. Al desmontarse/cerrarse efectivamente la instancia propietaria, liberar el lock; la secundaria deberá volver a comprobar el backend y recuperar el journal de forma segura antes de operar. Cierre inesperado y suspensión de Android requieren pruebas reales; no prometer liberación inmediata mientras la app siga viva en segundo plano.
6. No descartar borradores locales, UUID, manifests ni operaciones en outbox durante la adquisición, denegación o liberación del lock. No deshabilitar `navigator.locks` de transacciones, replays o recuperación.
7. Si Web Locks está ausente o falla, **no habilitar una instancia operativa insegura**; mostrar error explícito y una salida segura. HTTPS es necesario.
8. El alcance de la restricción es la operación **Cajero**; no bloquear login general, Admin ni `/detalles` por el solo hecho de existir una instancia Cajero abierta.
9. Las reglas del dispositivo, usuario, sede y sesión continúan en Supabase. No utilizar `localStorage` como lock autoritativo, ni asumir bloqueo entre dispositivos.

## Evidencia y cautelas del preflight

- Actual `src/features/solog/cajero/cajero.app.tsx`: construye `FullRuntime` al montar Owner; la compuerta debe interponerse **antes** de ese montaje y del primer efecto V6 de `FullCashierPanel`.
- Actual `src/features/solog/cajero/full.runtime.ts`: `navigator.locks.request(this.key, run)` protege las operaciones, por lo que la propiedad de instancia necesita otro nombre y ciclo de vida.
- Repo actual: `index.html` enlaza iconos; NO se halló `manifest.webmanifest`, `manifest.json`, service worker ni plugin PWA en `vite.config.ts`.
- Chrome puede instalar un sitio como app o acceso sin manifest, pero un manifiesto es lo apropiado para nombre, iconos, `start_url`, `scope` y modo standalone controlables. Instalar como app **no** implica soporte offline ni exclusividad entre contextos.
- Web Locks coordina contextos que comparten **origen y storage bucket**. No garantiza exclusividad entre perfiles de Chrome, navegadores distintos, incógnito, dispositivos distintos ni, sin smoke real, entre todas las modalidades de app instalada en Android.
- Background/suspensión: una instancia propietaria que solo está en segundo plano conserva potencialmente su lock; el usuario deberá volver a ella o cerrarla. No implementar liberación automática únicamente por `visibilitychange`.

## Fuera del alcance de esta decisión

**Instalabilidad PWA formal** (manifest, `display: standalone`, `start_url`, `scope`, WebAPK y soporte offline) **no queda aprobada como implementación dentro de O1**; debe pasar preflight funcional/UX propio. En especial, cachear RPC/HTML del Cajero offline sin contrato adicional puede dar una apariencia falsa de autorización y queda expresamente prohibido por este bloque.

También fuera: cambiar V6/V7, SQL, permisos, condiciones del Motor, política de sesiones por sede, cron, Auth y el login, modo offline, cierre remoto entre dispositivos, refactor general.

## Pruebas mínimas antes del cierre

- Dos tabs misma origin/perfil: exactamente una adquiere control; secundaria sin V6 ni mutaciones.
- App instalada Chrome Android + pestaña Chrome del mismo origen/perfil: verificar experimentalmente el bloqueo mutuo.
- Segunda pestaña bloqueada mientras propietaria está en background; sin takeover automático.
- Cierre real del propietario: toma de control manual y V6 de conciliación, sin duplicaciones.
- Refresh/crash y StrictMode: sin dobles propietarios ni starvation permanente; sin bloqueo infinito cuando no exista propietario vivo.
- Cambio de usuario/sede, logout y remount: no heredar autoridad incorrecta.
- Borrador local y operación V7 incierta: mantienen UUID/payload/retry y reconciliación segura al recuperar el control.
- Chrome Android instalado, Chrome tab, Preview y dominio de producción: documentar límites de origen, Chrome profile y experiencia real.
- Baseline de solicitudes V6 comparado contra la situación pre-cambio; no atribuir ahorros de sondeo horario a la restricción de pestañas.

## Registro de cierre (2026-10-28)

- **Implementación:** fases 1–4 completadas en `admin-work`; checkpoint de código y pruebas `2c2ceb2b931b635052385109cf0ba527aa36b691`.
- **Validación técnica:** suite Bun, lint, build, `git diff --check` y navegador Full/Playwright reportados en verde por el usuario.
- **Revisión global:** completada sin bloqueos contractuales nuevos.
- **Smoke humano:** los siete puntos en Chrome/Android fueron reportados como aprobados por el usuario el 2026-10-28.
- **Resultado:** bloque de instancia única **CERRADO**; no reabrir ni reinterpretar esta V1 sin bug, regresión, evidencia nueva o cambio de requisitos aprobado.
- **Evidencia de revisión y aceptación:** `docs/SOLOG_Correccion_Cajero_Instancia_Unica_Revision_Global_V1.md` (registro secundario, no sustituye esta fuente primaria).
- **Trabajo independiente pendiente:** optimización de refrescos/sondeo V6 dentro de O1 y eventual instalación PWA formal. No forman parte del cierre de instancia única.
