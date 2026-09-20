# SOLOG — Detalles → Cajero — Continuidad de autorización V1

**Estado:** IMPLEMENTADO — PENDIENTE DE VALIDACIÓN TÉCNICA  
**Clasificación:** Nivel B — corrección de flujo UX/frontend  
**Fecha:** 2026-09-19

## 1. Problema

Desde `/detalles`, un dispositivo sin autorización puede solicitar acceso correctamente, pero el flujo queda bloqueado después de registrar la solicitud:

- una solicitud `pendiente` no ofrece una acción para consultar si ya fue autorizada;
- un dispositivo ya `autorizado` no ofrece continuidad hacia `/cajero`;
- una autorización inmediata devuelta por `request_access` puede depender temporalmente de datos locales anteriores hasta consultar nuevamente el resumen.

## 2. Decisiones congeladas

1. Una solicitud pendiente ofrece **Consultar autorización**.
2. La consulta reutiliza `summary` de `rpc_solog_details_v2`; no se crea RPC nueva.
3. Mientras se consulta, el panel permanece montado y la acción muestra **Consultando…**.
4. Si continúa pendiente, se informa que la solicitud sigue pendiente.
5. Si el dispositivo actual queda autorizado para la sede, se ofrece **Ir a Cajero**.
6. La navegación usa el router frontend existente hacia `/cajero`.
7. Cajero conserva su bootstrap como validación autoritativa; si el dispositivo no está autorizado, devuelve a `/detalles`.
8. Si `request_access` devuelve `authorized`, Detalles sincroniza inmediatamente el `summary` autoritativo.
9. No se modifica backend, Supabase, RPC ni contratos.
10. No se reabre el bloque global de estados de carga/error.

## 3. Alcance implementado

- `detalles.panel.tsx`: acciones de consulta y continuidad.
- `detalles.hook.ts`: consulta explícita y sincronización posterior a autorización inmediata.
- `detalles.store.ts`: coherencia local del dispositivo mientras se completa la sincronización autoritativa.
- test dirigido del flujo Detalles → Cajero.

## 4. Criterios de aceptación

- pendiente → puede consultar autorización sin recargar la página;
- pendiente sin cambios → permanece pendiente con feedback;
- autorizado para la sede → muestra **Ir a Cajero**;
- `/cajero` vuelve a validar autorización;
- autorización inmediata no deja un estado local incoherente;
- no hay cambios backend ni de contratos;
- tests dirigidos, lint, build y `git diff --check` pasan.
