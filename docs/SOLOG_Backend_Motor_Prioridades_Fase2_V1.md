# SOLOG — Backend — Motor Prioridades — Fase 2 V1

**Estado:** IMPLEMENTADA — VALIDACIÓN TÉCNICA DE FASE COMPLETADA / REGRESIÓN GLOBAL FASE 3 PENDIENTE  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — Motor / backend  
**Rama documental:** `admin-work`  
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`

## 1. Fuente primaria

`docs/SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`

Preflight:

`docs/SOLOG_Backend_Motor_Prioridades_Preflight_V1.md`

Fundación:

`docs/SOLOG_Backend_Motor_Prioridades_Fase1_V1.md`

## 2. Alcance ejecutado

La Fase 2 activó en el Motor V4 la prioridad aprobada:

```text
round_coverage
→ review_for_coverage
→ review_regular
→ shift_coverage
→ none
```

Se mantuvo el wire público V4:

```text
coverage
review
review
daily
none
```

La única extensión aditiva aprobada es:

```text
review_queue[].priority_class =
  review_for_coverage
  | review_regular
```

No se creó V5 ni una nueva RPC pública.

## 3. Cambios de schema/runtime

`inventario.solog_session_runtime_groups.priority_class` quedó endurecido a:

```text
NOT NULL
```

Se añadieron/validaron dos contratos:

1. dominio permitido:
   - `round_coverage`
   - `review_for_coverage`
   - `review_regular`
   - `shift_coverage`
   - `none`

2. coherencia obligatoria con `accion`:
   - `coverage ↔ round_coverage`
   - `recount ↔ review_for_coverage | review_regular`
   - `daily ↔ shift_coverage`
   - `none ↔ none`

No quedó runtime legacy ni prioridad nula.

## 4. Autoridad única

Se añadió:

`inventario.solog_runtime_priority_class_v4(conteo_id)`

Esta función resuelve la prioridad de una sesión congelada usando el helper autoritativo de Fase 1.

`solog_cashier_operational_summary_v4`, `solog_cashier_panel_state_v4` y `solog_enforce_runtime_priority_v4` consumen ahora la autoridad compartida en vez de mantener órdenes independientes.

El helper es interno:

- SECURITY INVOKER;
- sin EXECUTE para PUBLIC;
- sin EXECUTE para anon;
- sin EXECUTE para authenticated.

## 5. `solog_cashier_group_actions_v4`

Se incorporó el bloqueo derivado:

```text
estado_diferencia = Inconsistente
AND recontado_at ∈ turno actual
→ acción normal = none
```

Esto impide que un grupo marcado `Cambio_reciente` vuelva a entrar en cobertura de turno durante el mismo turno del reconteo inconsistente.

No se modificó `ultimo_conteo_at`.

## 6. `solog_cashier_operational_summary_v4`

Ahora separa internamente:

- `review_for_coverage`;
- `review_regular`.

Luego resuelve:

```text
round_coverage
→ review_for_coverage
→ review_regular
→ shift_coverage
```

El shape público permanece igual.

`review_pending` continúa representando el total de reviews accionables.

## 7. `solog_cashier_panel_state_v4`

El runtime congelado conserva `priority_class`.

`review_queue[]` incorpora:

```json
{
  "priority_class": "review_for_coverage"
}
```

o:

```json
{
  "priority_class": "review_regular"
}
```

La cola se ordena primero por prioridad y después por fecha/id.

`next_action` continúa siendo:

```text
review | coverage | daily | none
```

## 8. `solog_enforce_runtime_priority_v4`

El guard ya no valida únicamente la acción pública.

Ahora exige:

```text
priority_class del grupo
=
priority_class global autorizada
```

Consecuencia:

- un `review_regular` no puede ejecutarse mientras exista `review_for_coverage`;
- `daily` no puede ejecutarse mientras exista cualquier clase superior;
- cobertura de ronda continúa prevaleciendo.

El error de contrato se mantiene:

`SOLOG_SESSION_PRIORITY_CONFLICT`

## 9. `solog_assert_normal_count_turn_v4`

Se añadió defensa en profundidad.

Si existe para el grupo un caso:

```text
Inconsistente
+ recontado_at dentro del turno del nuevo conteo normal
```

el INSERT se rechaza con:

`SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`

La invariante previa de máximo un conteo normal por grupo/turno permanece intacta.

## 10. `rpc_solog_cashier_mutate_v4(start)`

El `start` ahora congela para cada runtime:

```text
accion
priority_class
```

La clasificación se deriva de:

`solog_priority_classify_v4(a.action,a.coverage_complete)`

Al consumir un conteo normal o reconteo, el runtime actualiza conjuntamente:

```text
accion = none
priority_class = none
```

Esto mantiene el constraint de coherencia durante toda la sesión.

## 11. Compatibilidad pública y ACL

Se preservó:

- `contract_version=4`;
- `rpc_solog_cashier_bootstrap_v4`;
- `rpc_solog_cashier_mutate_v4`;
- payloads de mutación;
- `next_action`;
- nombres de colas;
- ACL públicas existentes.

Comprobado:

- RPC bootstrap/mutate siguen SECURITY DEFINER;
- `anon` sin EXECUTE;
- `PUBLIC` sin EXECUTE;
- `authenticated` conserva EXECUTE;
- helpers internos siguen sin exposición directa.

## 12. Regresión operacional inmediata

### Cutervo

Después de Fase 2:

```text
round_coverage       = 430
review_for_coverage  = 58
review_regular       = 0
shift_coverage       = 0
next_action          = coverage
```

Resultado esperado y sin regresión.

### Casuarinas

```text
round_coverage       = 0
review_for_coverage  = 0
review_regular       = 37
shift_coverage       = 34
next_action          = review
```

Resultado esperado y sin regresión.

Divino, Huaca y Unidad continúan en `none` bajo el corte observado.

## 13. Estado runtime al cierre

```text
sesiones activo/recovery = 0
runtime rows             = 0
priority_class NULL      = 0
```

## 14. Advisors

Los advisors no mostraron hallazgos de seguridad nuevos atribuibles a:

- `solog_priority_*`;
- `solog_runtime_priority_class_v4`;
- `priority_class`.

Los avisos globales preexistentes permanecen fuera de alcance.

El advisor de performance continúa mencionando índices históricos de `solog_session_runtime_groups`; no se añadió un índice nuevo para `priority_class` porque el runtime por sesión es pequeño y el acceso principal ya está acotado por `conteo_id`.

## 15. Incidencia de despliegue

El primer intento de Fase 2 abortó dentro de la transacción porque un parche textual sobre `rpc_solog_cashier_mutate_v4` no coincidió con el formato almacenado.

La transacción se revirtió completamente:

```text
runtime helper inexistente
priority_class seguía nullable
sin cambios parciales
```

Se corrigió usando coincidencias multilínea literales y la segunda ejecución se aplicó atómicamente.

## 16. Riesgo transitorio frontend

El frontend Cajero V4 actual tolera el campo adicional, pero todavía no utiliza:

`review_queue[].priority_class`

Por ello, si antes del handoff frontend una sesión llegara a contener simultáneamente:

```text
review_for_coverage
+
review_regular
```

la UI podría mostrar ambos. El backend conservaría la corrección y rechazaría un `review_regular` adelantado con `SOLOG_SESSION_PRIORITY_CONFLICT`.

La cola backend queda ordenada por prioridad, lo que reduce el riesgo, pero no sustituye la adaptación frontend.

El frontend no debe modificarse hasta cerrar la validación backend y congelar el contrato actualizado.

## 17. Pendiente para Fase 3

La Fase 3 debe ejecutar la matriz completa de regresión:

1. prioridad combinada entre las cuatro clases;
2. transición `review_for_coverage → review_regular`;
3. review esperando snapshot no bloquea cobertura de turno;
4. Inconsistente mismo turno bloqueado;
5. Inconsistente siguiente turno elegible;
6. `ultimo_conteo_at` preservado;
7. `ultima_observacion_fisica_at` actualizada por reconteo;
8. bootstrap/panel parseables;
9. `rpc_solog_details_v2(summary)`;
10. idempotencia;
11. lifecycle y cleanup runtime;
12. advisors finales.

## 18. Cierre

**Fase 2 — IMPLEMENTADA.**

No se considera cerrado el bloque backend completo hasta completar Fase 3 y actualizar/congelar el contrato backend consumidor.
