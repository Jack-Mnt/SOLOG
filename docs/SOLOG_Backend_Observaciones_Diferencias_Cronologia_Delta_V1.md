# SOLOG — Backend — Observaciones de Diferencias — Cronología — Delta V1

**Estado:** IMPLEMENTADO EN BACKEND; COMPOSICIÓN VISUAL NO CONGELADA.
**Fecha:** 14 de octubre de 2026.
**Nivel:** C — contrato de lectura.
**Fuente primaria:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.
**Contrato remoto:** `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md`.

## 1. Motivo del delta

La fuente primaria (§6.1) observó una incompatibilidad: en `Coincide` resuelto mediante reconteo la cronología de Admin no dispone siempre de un evento inicial separado.

El usuario decidió **revisar visualmente esta situación cuando se trabaje el módulo Admin Control**, considerando como posibilidad un popup con un motivo y dos explicaciones redactadas. No aprobó añadir un evento nuevo automáticamente.

## 2. Resolución técnica aplicada al backend

Se congela únicamente lo **efectivamente desplegado**:

- Conservar sin cambios el número, orden, estado y fecha de los eventos de la cronología existente.
- Devolver en cada evento un objeto aditivo `observaciones` con `inicial` y `reconteo`, ambos nulos u objetos `{ motivo, texto, registrada_at }`.
- Las anotaciones iniciales se devuelven para eventos de captura inicial; las de reconteo para los de resolución por reconteo.
- En el evento ya existente `Coincide` por reconteo pueden viajar **ambos contextos** con fechas distintas, sin representar que fueron registrados a la misma hora.
- Los eventos de resolución automática por snapshot no heredan una observación capturada manualmente.

El contrato de lectura es aditivo, mantiene `contract_version=2` y no exige cambios inmediatos al frontend antiguo.

## 3. Decisiones expresamente pendientes

- Dónde colocar el icono en la composición Admin Control.
- Si se muestra un popup que admite simultáneamente un motivo y dos explicaciones.
- Si se necesita crear un evento histórico adicional para representar el primer conteo.
- Geometría, responsive, interacción, foco y cierre del popup.

**No convertir estas ideas pendientes en requisitos ni generar eventos adicionales sin aprobación.**

Este delta prevalece exclusivamente sobre la solución preferida **no aprobada** de añadir un evento `Recontar` en la fuente primaria (§6.1). El resto de la fuente primaria continúa vigente.
