# SOLOG — Backend Cajero — Baseline Prioridad Operativa V4 V1

**Estado:** CONGELADO — DESPLEGADO Y VALIDADO  
**Fecha:** 2 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — backend / Motor de Conteos / prioridad operativa  
**Rama de referencia:** `admin-work`

---

## 1. Propósito

Este documento congela el nuevo baseline backend del Motor de Conteos V4 después de implementar y validar el delta de prioridad operativa.

Fuente funcional del delta:

`docs/SOLOG_Motor_Cajero_Prioridad_Operativa_Delta_V1.md`

Fuente funcional superior del Motor:

`docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`

Para la prioridad operativa, el delta V1 prevalece sobre la lógica anterior.

---

## 2. Estado de despliegue

Migración aplicada en Supabase:

`20261002151334_solog_motor_v4_operational_priority_delta_v1`

Proyecto Supabase:

`fvtohxvcvsflzmftgfzs`

Estado:

**DESPLEGADO Y VALIDADO**

---

## 3. Funciones modificadas

La implementación quedó limitada a:

- `inventario.solog_cashier_operational_summary_v4`
- `inventario.solog_cashier_panel_state_v4`

No se modificaron:

- `inventario.solog_cashier_group_actions_v4`
- `inventario.solog_cashier_panel_delta_v4`
- `inventario.solog_enforce_runtime_priority_v4`
- `public.rpc_solog_cashier_mutate_v4`
- tablas;
- columnas;
- enums;
- lifecycle;
- idempotencia.

---

## 4. Prioridad autoritativa vigente

La prioridad backend queda:

```text
1. coverage
2. review
3. daily
4. none
```

Semántica funcional:

```text
1. Conteo — cobertura normal disponible
2. Revisar — reconteos necesarios para completar cobertura
3. Revisar — demás diferencias accionables
4. Conteo diario
```

El frontend no debe reconstruir ni alterar esta prioridad.

---

## 5. Caso límite aprobado

Cuando:

```text
coverage_pending > 0
coverage_queue_pending = 0
review_pending = 0
coverage_blocked_waiting_snapshot > 0
daily_pending > 0
```

el resultado correcto es:

```text
next_action = daily
```

Esto representa trabajo diario temporal mientras la cobertura no puede progresar.

La cobertura continúa marcada como incompleta.

Cuando un snapshot posterior vuelve accionable un reconteo pendiente:

```text
next_action = review
```

y Revisar vuelve a tener prioridad sobre Diario.

---

## 6. Contrato público V4

El wire contract V4 no cambió.

RPC públicas vigentes:

- `rpc_solog_route_v2(jsonb) → jsonb`
- `rpc_solog_cashier_bootstrap_v4(jsonb) → jsonb`
- `rpc_solog_cashier_mutate_v4(text,jsonb) → jsonb`
- `rpc_solog_cashier_history_v2(jsonb) → jsonb`

Valores de `next_action`:

```text
coverage | review | daily | none
```

KPIs vigentes:

- `coverage_round`
- `coverage_total`
- `coverage_counted`
- `coverage_pending`
- `coverage_percent`
- `review_pending`
- `coverage_queue_pending`
- `daily_pending`
- `coverage_blocked_waiting_snapshot`

No se añadió ningún campo público nuevo.

---

## 7. Validación A–G

| Caso | Resultado |
|---|---|
| A. Coverage disponible + Review existente → `coverage` | PASS |
| B. Coverage agotada + Review necesario para cobertura → `review` | PASS |
| C. Cobertura completa + Review pendiente → `review` | PASS |
| D. Cobertura completa + sin Review + Daily → `daily` | PASS |
| E. Cobertura bloqueada esperando snapshot + Daily disponible → `daily` | PASS |
| F. Snapshot vuelve accionable el reconteo → `daily → review` | PASS |
| G. Sin trabajo disponible → `none` | PASS |

Los casos B–F se validaron de forma controlada sin alterar datos productivos.

---

## 8. Evidencia real observada

### Cutervo

Estado observado:

```text
coverage_queue = 430
review_queue = 58
review_for_coverage = 58
next_action = coverage
```

Confirma que Coverage mantiene prioridad aunque existan reconteos accionables necesarios para cobertura.

### Casuarinas

Estado observado:

```text
coverage_queue = 417
daily_queue = 7
next_action = coverage
```

Confirma que Daily no desplaza Coverage cuando existe trabajo normal disponible.

---

## 9. Compatibilidad con runtime congelado

La sesión continúa congelando por grupo:

```text
recount | coverage | daily | none
```

No cambia:

- snapshot congelado de sesión;
- grupos congelados;
- `groups_revision`;
- validación de prioridad;
- save_batch;
- recount_save_batch;
- finish;
- recovery;
- replay/idempotencia;
- límites temporales.

---

## 10. Estado de documentación

### Vigente

- `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
- `docs/SOLOG_Motor_Cajero_Prioridad_Operativa_Delta_V1.md`
- `docs/SOLOG_Backend_Contrato_Cajero_V4.md`
- `docs/SOLOG_Integracion_Cajero_Cutover_V4_Cierre_V1.md`

### Este documento

Este archivo es la fuente de estado para confirmar que el delta de prioridad operativa:

- ya fue desplegado;
- ya fue validado;
- ya forma parte del baseline backend vigente.

---

## 11. Deuda técnica

Continúa pendiente reconciliar el historial remoto de migraciones con el repositorio local.

Esta deuda no bloquea el runtime actual.

Antes de un futuro bloque amplio de backend conviene consolidar el historial local/remoto.

---

## 12. Cierre

**Delta de prioridad operativa — CERRADO.**

Resultado:

```text
Delta funcional congelado
+ migración aplicada
+ A–G validados
+ contrato V4 estable
+ evidencia real consistente
= NUEVO BASELINE BACKEND CONGELADO
```

A partir de este punto puede retomarse el bloque UX/UI del Cajero definido en:

`docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`
