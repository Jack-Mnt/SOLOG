# SOLOG — Corrección Cajero — Instancia única — Revisión global V1

**Estado:** REVISIÓN GLOBAL COMPLETADA; **SMOKE HUMANO EN TABLET PENDIENTE**. No cerrar todavía.
**Fecha:** 2026-10-28.
**Rama:** `admin-work`.
**HEAD auditado:** `2c2ceb2b931b635052385109cf0ba527aa36b691`.
**Clasificación:** Nivel B con riesgos de concurrencia.
**Fuente primaria FUNCIONAL CONGELADA (prevalece):** `docs/SOLOG_UX_Cajero_Instancia_Unica_Tablet_V1.md`.
**Referencia técnica:** `docs/SOLOG_Arquitectura_Cajero_Instancia_Unica_Preflight_V1.md`.
**Este documento:** registro de evidencia y aceptación; no sustituye ni redefine la fuente congelada.

## 1. Alcance revisado

Comparación `05f060e638523d092005e788fa950f7b30f0eb2a...admin-work`:

| Archivo | Cambio | Evaluación |
| --- | --- | --- |
| `src/features/solog/cajero/cajero.instance.ts` | Coordinador Web Locks; adquisición `ifAvailable`, release, drenaje y cambio de identidad | Dentro de alcance |
| `src/features/solog/cajero/cajero.app.tsx` | Compuerta antes de token, journal, FullRuntime y panel | Dentro de alcance |
| `tests/cajero-instance.test.ts` | 7 escenarios de tenencia, StrictMode, fallo y drenaje | Dentro de alcance |
| `tests/cajero-full-registro-autocierre.test.ts` | 3 escenarios adicionales con dos runtimes, storage/mutex compartidos, V7 incierta | Dentro de alcance |
| `tests/cajero-full.browser.mjs` | 6 escenarios de interfaz de instancia única y contadores por pestaña | Dentro de alcance |
| `tests/cajero-runtime-v4.test.ts` | Ajuste de aserción estructural del montaje Full | Dentro de alcance |

Sin cambios de `full.runtime.ts`, `full.app.tsx`, `protected-app.tsx`, `src/features/auth/context.tsx`, backend, migraciones, RPC, RLS, PWA, manifest o service worker.

## 2. Invariantes y controles inspeccionados

1. **Instancia única:** constante `solog.cashier.instance.v1` por origen y partición del navegador; distinta del mutex `solog.full2.${userId}.${deviceToken}`.
2. **Fail-closed:** no se construye `FullRuntime` en la secundaria o cuando Web Locks falla.
3. **Sin transferencia automática:** bloqueada hasta pulsar `Reintentar`; no se libera por `blur`, `hidden` ni temporizador.
4. **Drenaje:** se cuentan trabajos admitidos desde antes del mutex hasta su terminación; al salir se cierran nuevas admisiones y se retiene el lock mientras termine trabajo en curso. Cambio de identidad revoca nuevas RPC del dueño anterior.
5. **Conservación de datos:** no se alteran los métodos de `FullRuntime`, journals, UUID, payload y flujos de recovery.
6. **Ámbito:** la compuerta solo está en Cajero. No se introdujo bloqueo en Auth, Admin o Detalles.
7. **Sin caché adicional:** ninguna modificación de frecuencia de V6, historial O2 o instalación PWA.

## 3. Evidencia técnica

**Reportada por la persona que ejecutó las pruebas en su equipo (no reproducida por esta revisión):**
- Tras Fase 3 y corrección de test desactualizado: `bun test`, lint y build en verde.
- Tras Fase 4: `node tests/cajero-full.browser.mjs`, `bun test`, lint, build y `git diff --check` en verde.
- No se publican métricas inventadas de tiempo o Egress.

**Verificada en GitHub por revisión estática:**
- El diff completo del bloque contiene los seis archivos identificados y ningún archivo backend.
- La suite browser usa fixtures V6/V7 locales y atribuye cada RPC a su pestaña; la secundaria comprueba cero llamadas V6/V7 y cero escrituras de journal Full.
- Los dos tests browser antiguos de dos operadores simultáneos fueron sustituidos, preservando la serialización e idempotencia en las pruebas de `FullRuntime`.
- No se modificaron rutas de Auth/Admin ni lógica de cálculo de Cajero.

**No verificado directamente:** ejecución de Bun/Playwright en este entorno, comprobación real de Web Locks en Chrome Android instalado, trazas de tráfico/egress contra Supabase, convivencia app instalada+pestaña y suspensión Android.

## 4. Smoke humano pendiente — Chrome Android

Utilizar **SOLOG Preview de la misma rama/origen** y una **tablet Android con Chrome**. Evitar producción y conteos reales en las pruebas que escriban. No mezclar dominio Preview y producción para comprobar exclusividad: tienen orígenes diferentes.

1. **Dos pestañas, mismo Chrome/origen/perfil:** abrir Cajero A, abrir Cajero B. A permanece operativa; B muestra «SOLOG Cajero ya está abierto en otra ventana» y `Reintentar`. B no muestra controles de conteo.
2. **Sin takeover por segundo plano:** pasar de A a B, dejar A en segundo plano y pulsar `Reintentar` en B. B sigue bloqueada. Regresar a A: continúan navegación y estado.
3. **Liberación controlada:** cerrar A realmente (no solo cambiar de app), pulsar `Reintentar` en B. B adquiere control, carga V6 y presenta estado vigente; sin cierre forzado ni transferencia espontánea.
4. **Borradores:** si existe un entorno con sesión de prueba, guardar un borrador en A sin registrar; cerrar A y continuar manualmente en B. Debe conservar valor/UUID lógico y permitir registrar una sola vez. No crear conteos ficticios en producción.
5. **Recarga/cierre inesperado:** con borrador de prueba, actualizar A o terminar Chrome y volver a abrir; verificar recuperación segura. La reactivación puede requerir cierre real del proceso y `Reintentar` manual; si queda bloqueada persistentemente sin propietario vivo, documentar.
6. **App desde icono + pestaña convencional:** abrir el mismo origen en ambos. Verificar si Chrome comparte el Web Lock; registrar versión Android, Chrome y tipo de instalación (acceso directo o app instalada). Si son particiones diferentes, **no prometer exclusividad transversal**.
7. **Navegación y salida:** salir de Cajero hacia una ruta legítima de Admin/Detalles (según permisos), verificar que la restricción no los bloquea. Probar cierre de sesión sin operaciones pendientes.
8. **Origen/perfil diferente:** Preview y producción, dos perfiles o navegadores distintos **no están cubiertos por un mismo Web Lock**. La autoridad remota de sesión sigue en Supabase; no debe interpretarse como defecto de la compuerta.

**Aceptación de smoke:** exactamente una instancia operativa en los contextos que realmente comparten Web Locks; secundaria sin V6/V7, adquisición manual tras liberar, ninguna pérdida ni duplicación de borradores/operaciones, sin bloqueo de Admin/Detalles.

## 5. Riesgos residuales conocidos

- Android puede suspender una ventana en vez de cerrarla; **no** liberar por `visibilitychange` ni imponer TTL porque podría crear dos propietarios. El usuario debe volver a la principal o cerrarla realmente.
- Los datos remotos y permisos continúan sujetos a Supabase y a V6/V7; Web Locks no coordina tablets distintas ni origines/perfiles distintos.
- La experiencia formal de PWA, el manifiesto y cualquier soporte offline pertenecen a un bloque independiente.
- El control de focus/visibility, la deduplicación del journal y el sondeo horario de O1 siguen **pendientes**, fuera de esta implementación.

## 6. Cierre

**Pendiente de resultados del smoke humano de tablet.** Si se detecta un fallo, abrir corrección dirigida con evidencia (pasos exactos, Android/Chrome, tipo de instalación y capturas, sin datos sensibles). Si el smoke pasa, registrar aceptación y cerrar explícitamente el bloque de instancia única sin reabrir su especificación; continuar O1 con los optimizadores restantes.
