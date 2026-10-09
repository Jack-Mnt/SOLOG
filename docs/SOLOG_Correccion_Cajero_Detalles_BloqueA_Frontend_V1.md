# SOLOG — Corrección Cajero y Detalles — Bloque A Frontend V1

**Estado:** CONGELADO — ALCANCE APROBADO, IMPLEMENTACIÓN PENDIENTE
**Fecha:** 2026-10-09
**Rama:** `admin-work`
**Clasificación:** Nivel B — correcciones frontend y optimización de caché.

## 1. Fuente primaria y precedencia

Este archivo es la **fuente primaria exclusiva de este bloque**; prevalece solamente en los cuatro cambios aquí descritos. Continúan vigentes las fuentes congeladas anteriores para motor, backend V4, historia, UI/UX y accesibilidad en todo lo que este delta no modifica. En particular, `docs/SOLOG_Backend_Contrato_Cajero_V4.md` sigue siendo autoridad del wire contract, y `docs/SOLOG_Logica_Cajero_Autocierre_Recovery_V1.md` de recovery.

## 2. Alcance aprobado

### A1 — Detalles: tiempo relativo y vigencia del stock
- Actualmente `detalles.panel.tsx` calcula tiempo y alerta con `summary.generated_at`, congelados hasta la próxima consulta.
- El tiempo relativo debe progresar en la interfaz sin polling backend, usando tiempo del cliente ajustado por `serverOffsetMs` ya disponible.
- Recalcular texto y umbral de obsolescencia cuando transcurre tiempo (cadencia adecuada a minutos), incluyendo cruces de 2 horas.
- Mantener los estados de stock actuales: disponible = success; desactualizado = warning; no disponible = neutro.
- No alterar ni forzar nueva descarga de summary por cada tick; limpiar cualquier suscripción/intervalo al desmontar.

### A2 — Detalles: accesibilidad del modal Historial
- Mantener foco dentro del diálogo mientras está abierto, incluida navegación Tab y Shift+Tab.
- Escape cierra; inicializar foco dentro; restaurar foco al control invocador al cerrar si sigue disponible.
- Conservar bloqueo de scroll, etiquetas ARIA, teclado e interacciones actuales; evitar que un rerender o recarga del historial robe innecesariamente el foco.
- Reutilizar patrones de modal existentes y soportar ausencia temporal de controles enfocables.

### A3 — Cajero: caché selectiva de Historial
- Actualmente el `store.subscribe` de `cajero.v4.runtime.ts` ejecuta `history.clear()` ante toda notificación del store.
- Evitar invalidar Historial por estados no relacionados (loading, errores y otros cambios puramente locales).
- Conservar caché de Hoy/Ayer al navegar de vuelta cuando no hayan cambiado datos relevantes.
- Invalidar cuando mutaciones, revisión operacional autoritativa, cambio de identidad/sede/dispositivo o fechas Lima puedan volver obsoletas las entradas.
- Preservar detección de cambios externos, coherencia entre lecturas concurrentes, protección ante respuestas tardías y reglas de `CashierHistoryCache`; usar su `invalidate` cuando corresponda.
- No introducir polling permanente, nuevos RPC, persistencia extra ni alterar conteos o idempotencia.

### A4 — Detalles: terminología
- Cambiar etiqueta visible `Conteo diario pendiente` a `Cobertura de turno pendiente`.
- Conservar sin cambios nombre y semántica del campo backend `conteo_diario_pendientes`.

## 3. Exclusiones expresas
- No implementar soporte visual ni modificación de contrato para `Inválido`; queda pendiente definición específica.
- No tocar autocierre, recuperación sin scope, `logoutSafe`, `finish` ni otras reglas de recovery.
- No rediseñar flujo operativo / selector de etapas de Cajero; queda en backlog UX.
- No modificar Supabase, RPC, RLS, tablas, datos, migraciones ni contratos backend.
- No refactors generales, limpieza CSS no relacionada ni cambios en `master`.

## 4. Preflight y riesgos
- Confirmar baseline HEAD y worktree de `admin-work` antes de editar; preservar cambios preexistentes.
- Comprobar disponibilidad real y ciclo de vida de `serverOffsetMs` en Detalles; si no está accesible al componente, informar el mínimo ajuste de frontend.
- Comprobar cómo se propagan `revisions.operational` y los resultados de mutaciones en Cajero antes de decidir triggers de invalidación. Una modificación que no tenga revisión no debe causar datos silenciosamente obsoletos.
- Confirmar patrón existente de trap/restauración de foco para no crear un segundo patrón divergente.
- Reportar incompatibilidades bloqueantes antes de cambiar este alcance.

## 5. Validación
- Tests dirigidos: cambio del reloj sin llamadas nuevas; estado antes/después del umbral; stock sin snapshot; cleanup del timer.
- Tests modal: Tab / Shift+Tab, Escape, cierre y retorno de foco, rerender y ausencia de controles enfocables.
- Tests de caché: navegación repetida; loading/error no invalidan; nueva mutación sí invalida; cambios externos detectados; cambio de fecha Lima; respuestas in-flight obsoletas; cambio de identidad.
- Ejecutar test subset afectado, suite total, lint, typecheck, build y `git diff --check`; registrar fallos preexistentes separadamente.
- Smoke humano: Detalles stock y diálogo con teclado; Cajero Historial Hoy/Ayer y actualización tras operación.
- Informar archivos modificados, pruebas y resultados. No afirmar validación visual o smoke si no se realizó.

## 6. Secuencia
1. Codex establece baseline y presenta plan técnico acotado, sin implementar.
2. Usuario aprueba el plan.
3. Codex implementa por partes A1/A4, A2, A3 con pruebas.
4. ChatGPT contrasta implementación con esta fuente; usuario ejecuta smoke cuando corresponda.
5. Cierre explícito del bloque.
