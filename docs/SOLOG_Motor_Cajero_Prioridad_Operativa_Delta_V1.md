# SOLOG — Motor Cajero — Delta de Prioridad Operativa V1

**Estado:** CONGELADO — DELTA APROBADO — SIN IMPLEMENTAR  
**Fecha:** 2 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — lógica de Motor / prioridad operativa / backend  
**Rama:** `admin-work`

---

## 1. Propósito

Este documento congela un delta sobre la prioridad operativa del Motor de Conteos V4.

No reemplaza el Motor completo. Modifica únicamente la prioridad entre Cobertura, Revisar y Conteo diario.

La fuente funcional superior continúa siendo:

`docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`

Para la prioridad operativa descrita aquí, este delta prevalece sobre la sección equivalente de dicha fuente.

Todo lo no reemplazado explícitamente permanece vigente.

---

## 2. Motivo

La prioridad anterior era:

```text
Revisar
→ Cobertura
→ Conteo diario
```

La decisión revisada busca primero construir la base física más completa posible de la ronda antes de dedicar trabajo a confirmar diferencias que no son necesarias para completar cobertura.

Al mismo tiempo, un reconteo puede ser necesario para cerrar cobertura cuando un grupo no puede acreditarse mediante un conteo normal.

---

## 3. Prioridad operativa nueva

La prioridad autoritativa queda:

```text
1. Conteo — cobertura normal disponible
2. Revisar — reconteos necesarios para completar cobertura
3. Revisar — demás diferencias accionables
4. Conteo diario
```

El backend continúa siendo la única autoridad de `next_action`.

El frontend no debe reconstruir ni inferir esta prioridad.

---

## 4. Definiciones

### 4.1. Coverage normal disponible

Grupo con:

```text
coverage_complete = false
pending_recount = false
counted_in_shift = false
```

Debe pertenecer a:

```text
coverage
```

### 4.2. Revisar necesario para cobertura

Grupo con:

```text
coverage_complete = false
recount_actionable = true
```

Debe permanecer operativamente como:

```text
recount
```

pero su prioridad es superior a cualquier otro Revisar y a Conteo diario cuando ya no existe Coverage normal disponible.

No se introduce obligatoriamente un nuevo valor público de `next_action`.

### 4.3. Revisar normal

Grupo con:

```text
coverage_complete = true
recount_actionable = true
```

Permanece en Revisar, después de resolver cualquier reconteo necesario para completar cobertura.

### 4.4. Conteo diario

Grupo elegible según la lógica vigente de Conteo diario:

```text
coverage_complete = true
estado_stock = Cambio_reciente
counted_in_shift = false
sin recount pendiente
```

Permanece como acción `daily`.

---

## 5. Regla autoritativa de selección

El orden lógico queda:

```text
si coverage_queue > 0
→ next_action = coverage

si coverage_queue = 0
y existe recount accionable con coverage_complete = false
→ next_action = review

si existen otros recount accionables
→ next_action = review

si existe daily_queue > 0
→ next_action = daily

si no existe trabajo operativo disponible
→ next_action = none
```

---

## 6. Caso límite aprobado — cobertura bloqueada esperando snapshot

Caso:

```text
coverage_pending > 0
coverage_queue = 0
recount_for_coverage_actionable = 0
coverage_blocked_waiting_snapshot > 0
daily_queue > 0
```

Decisión aprobada:

```text
Como no existe ninguna acción disponible para completar cobertura en ese momento,
se permite Conteo diario temporalmente.
```

Resultado:

```text
next_action = daily
```

Esto NO significa que la cobertura esté completa.

Los KPI deben seguir reflejando:

```text
coverage_pending > 0
coverage_blocked_waiting_snapshot > 0
```

Cuando posteriormente exista un snapshot que vuelva accionable un reconteo necesario para cobertura, Revisar recupera prioridad sobre Conteo diario.

---

## 7. Contrato público

La intención es preservar el contrato público V4 existente.

Valores vigentes:

```text
next_action = review | coverage | daily | none
```

No se aprueba en este delta:

- nueva RPC pública;
- nuevo estado de sesión;
- nueva tabla;
- nuevo valor público de `next_action`;
- cambio de estructura JSON del contrato V4.

Si el preflight de implementación demuestra que alguno de estos cambios es imprescindible, el trabajo debe detenerse y volver a definición antes de modificar backend.

---

## 8. Superficies backend afectadas

El preflight técnico identificó como mínimo:

- `inventario.solog_cashier_group_actions_v4`;
- `inventario.solog_cashier_operational_summary_v4`;
- `inventario.solog_cashier_panel_state_v4`;
- `inventario.solog_enforce_runtime_priority_v4`.

La implementación debe preservar:

- frozen runtime por sesión;
- idempotencia;
- lifecycle;
- ventanas temporales;
- reglas de cobertura;
- reglas de reconteo;
- máximo un conteo normal por turno;
- reconteo sin consumo de cupo normal.

---

## 9. Casos de aceptación

### A. Coverage normal disponible

```text
coverage_queue > 0
+ review accionable existente
→ next_action = coverage
```

### B. Coverage normal agotada + reconteo necesario para cobertura

```text
coverage_queue = 0
+ coverage_pending > 0
+ recount accionable de grupo no cubierto
→ next_action = review
```

### C. Cobertura completa + review pendiente

```text
coverage_pending = 0
+ review accionable > 0
→ next_action = review
```

### D. Cobertura completa + sin review + daily

```text
coverage_pending = 0
+ review accionable = 0
+ daily_queue > 0
→ next_action = daily
```

### E. Cobertura bloqueada esperando snapshot + daily disponible

```text
coverage_pending > 0
+ coverage_queue = 0
+ recount_for_coverage_actionable = 0
+ coverage_blocked_waiting_snapshot > 0
+ daily_queue > 0
→ next_action = daily
```

### F. Aparece snapshot posterior

```text
estado anterior:
daily temporal

nuevo snapshot
→ recount_for_coverage_actionable > 0
→ next_action = review
```

### G. Sin trabajo disponible

```text
coverage_queue = 0
review accionable = 0
daily_queue = 0
→ next_action = none
```

---

## 10. Estado

Este delta queda **CONGELADO — APROBADO — SIN IMPLEMENTAR**.

La siguiente fase debe ser:

1. preparar migración backend;
2. desplegar;
3. validar escenarios sintéticos;
4. comprobar que el contrato V4 público permanece estable;
5. congelar nuevo baseline;
6. volver al bloque UX/UI del Cajero.
