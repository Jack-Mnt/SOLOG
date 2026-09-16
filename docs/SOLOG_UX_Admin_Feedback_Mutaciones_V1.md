# SOLOG — UX Admin — Feedback de Mutaciones V1

**Proyecto:** SOLOG  
**Estado:** IMPLEMENTADO FASES 1–3 — FASE 4 PENDIENTE
**Clasificación:** Nivel B — normalización UX de feedback administrativo  
**Fecha:** 2026-09-16

## 1. Fuente primaria y precedencia

Este documento es la **fuente primaria del Bloque 4** para presentación y ciclo de vida del feedback de mutaciones Admin.

Para textos específicos de Incidencias prevalece:

`docs/SOLOG_Logica_Incidencias_Acciones_Globales_V1.md`

## 2. Principio

Cada operación administrativa debe presentar **un único feedback visible y comprensible**.

La idempotencia interna no debe filtrarse como ruido técnico.

## 3. Operation ID

`operation_id`:
- se conserva internamente;
- continúa utilizándose para retry/replay/idempotencia;
- no se muestra en el feedback normal de Catálogo, Productos, Incidencias o Dispositivos.

Solo podría mostrarse en una futura superficie explícitamente técnica/de diagnóstico.

## 4. Notices duplicados

Una misma mutación no debe producir el mismo estado simultáneamente:
- en la página;
- y dentro del modal.

Dispositivos debe tener una única superficie autoritativa de feedback por operación.

## 5. Identidad del notice

Descartar un notice no puede silenciar una operación futura que produzca el mismo texto.

Cada ocurrencia debe tener identidad propia, separada del contenido textual.

## 6. Retry

Cuando una operación sea reintentable:
- el botón Retry conserva la misma intención y el mismo `operation_id`;
- no crea una nueva mutación;
- la UI puede ocultar el identificador técnico sin perder idempotencia.

## 7. Presentación

Usar la primitive compartida `AdminNotice` o su evolución compatible para:
- success;
- info;
- warning;
- error.

No se requiere uniformar todos los textos en este bloque si ya existe copy funcional aprobado; sí se elimina exposición técnica innecesaria y duplicación.

## 8. Fuera de alcance

- cambiar semántica de mutaciones;
- cambiar contratos backend;
- cambiar idempotencia;
- rediseñar visualmente todos los módulos;
- crear un centro global de notificaciones.

## 9. Criterios de aceptación

- un feedback visible por operación;
- ningún `operation_id` expuesto en UI normal;
- notices idénticos consecutivos pueden mostrarse independientemente;
- retry conserva la operación original;
- sin feedback duplicado en Dispositivos.

> **Bloque 4 congelado.**

## 10. Estado de implementación

### Fase 1 — Base compartida de feedback

Implementado en `admin-work`:

- `MutationNotice` usa la primitive compartida `AdminNotice`;
- pending, error y success se representan mediante una única superficie compartida;
- `operation_id` permanece interno y ya no se muestra en `MutationNotice`;
- el indicador técnico `replay` dejó de presentarse en el feedback compartido;
- cada intento conserva el mismo `operation_id` interno y recibe una ocurrencia visual distinta;
- cada success confirmado incrementa una ocurrencia por dominio, independiente del texto visible;
- descartar una ocurrencia no silencia un retry posterior ni una operación futura con el mismo mensaje;
- retry continúa ejecutando la intención original y conserva payload e idempotencia;
- los metadatos de intento/ocurrencia son exclusivamente frontend y no modifican RPC ni contratos backend.

Validación dirigida:

- **53 pass / 0 fail** en 5 archivos de tests relacionados;
- `bun run lint`: correcto;
- `bun run build`: correcto;
- `git diff --check`: correcto.

### Fase 2 — Catálogo y Productos

Implementado en `admin-work`:

- presenter compartido `CatalogMutationNotice` para Catálogo, Productos y configuración de producto;
- `operation_id` deja de mostrarse en presenters locales;
- los errores retryable quedan en la superficie autoritativa del intent y no se duplican como error local;
- `catalogMutationError` solo publica error local cuando la intención fue descartada por un fallo definitivo;
- publicación de Catálogo deja de mostrar el identificador de operación;
- publicación de Catálogo deja de mostrar `replay` como detalle técnico;
- estados de publicación pendiente/error/result se presentan mediante `AdminNotice`;
- retry conserva la intención original y el mismo `operation_id` interno.

### Fase 3 — Incidencias y Dispositivos

Implementado en `admin-work`:

- Incidencias separa la identidad del notice de su texto mediante un contador de ocurrencias locales;
- successes consecutivos con el mismo copy vuelven a mostrarse aunque una ocurrencia previa haya sido descartada;
- errores retryable de Incidencias no pueden ocultar la única acción de retry;
- retry de Incidencias usa `retryMutation("incidents")` y recupera el copy aprobado según la acción original;
- Ignorar 30 días reintenta la intención retenida en lugar de crear una mutación nueva;
- Proponer eliminación conserva la confirmación inicial y reutiliza la intención original en retry;
- los tres textos congelados de Incidencias permanecen sin cambios;
- Dispositivos muestra el feedback dentro del modal mientras este está abierto y el success en la página después del cierre;
- el modal de Dispositivos no presenta un resultado anterior y no duplica el error retryable;
- `AdminNotice` permite omitir dismiss en feedback retryable para evitar estados bloqueados sin acción visible.

Validación dirigida Fases 2–3:

- **103 pass / 0 fail** en 10 archivos de tests relacionados;
- `bun run lint`: correcto;
- `bun run build`: correcto;
- `git diff --check`: correcto.

Pendiente para Fase 4:

- auditoría global final de feedback Admin;
- suite global completa contra baseline;
- revisión de alcance y regresiones;
- smoke humano en Preview de `admin-work`;
- cierre definitivo del Bloque 4.
