# SOLOG — UX Admin — Feedback de Mutaciones V1

**Proyecto:** SOLOG  
**Estado:** IMPLEMENTADO FASE 1 — FASES 2–4 PENDIENTES
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

Pendiente para Fase 2:

- aplicar la normalización a Catálogo y Productos;
- retirar exposición de `operation_id` en presenters locales de Catálogo/Productos;
- eliminar feedback duplicado entre intent local y error local;
- retirar ruido técnico de replay en publicación de Catálogo.
