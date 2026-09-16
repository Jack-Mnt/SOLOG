# SOLOG — UX Admin — Feedback de Mutaciones V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
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
