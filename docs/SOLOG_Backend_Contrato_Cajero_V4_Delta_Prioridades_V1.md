# SOLOG — Backend — Contrato Cajero V4 — Delta Prioridades e Inconsistentes V1

**Estado:** CONGELADO — DESPLEGADO Y VALIDADO TÉCNICAMENTE  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — Backend / Motor / contrato Cajero  
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`

## 1. Autoridad y precedencia

Para prioridades operativas, reconteos e `Inconsistente`, este documento prevalece sobre:

1. `docs/SOLOG_Backend_Contrato_Cajero_V4.md`;
2. `docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`;
3. documentación previa que todavía describa `review → coverage → daily` o `Conteo diario` como concepto funcional vigente.

Fuente funcional:

`docs/SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`

Preflight técnico:

`docs/SOLOG_Backend_Motor_Prioridades_Preflight_V1.md`

Implementación:

- `docs/SOLOG_Backend_Motor_Prioridades_Fase1_V1.md`
- `docs/SOLOG_Backend_Motor_Prioridades_Fase2_V1.md`
- `docs/SOLOG_Backend_Motor_Prioridades_Fase3_Validacion_V1.md`

Todo el contrato V4 no reemplazado explícitamente aquí permanece vigente.

## 2. Contract version

Se conserva:

```text
contract_version = 4
```

No existe V5 por este cambio.

Se conservan las RPC públicas:

- `public.rpc_solog_cashier_bootstrap_v4(jsonb)`
- `public.rpc_solog_cashier_mutate_v4(text,jsonb)`

## 3. Prioridad funcional autoritativa

El Motor distingue internamente:

```text
1. round_coverage
2. review_for_coverage
3. review_regular
4. shift_coverage
5. none
```

Mapping público V4:

```text
round_coverage      → coverage
review_for_coverage → review
review_regular      → review
shift_coverage      → daily
none                → none
```

El frontend no reconstruye la prioridad.

## 4. Semántica de clases

### `round_coverage`

Conteo normal que todavía puede acreditar la ronda activa.

### `review_for_coverage`

Reconteo accionable cuyo grupo todavía no acredita la ronda activa.

Resolverlo cumple simultáneamente:

```text
resolver diferencia
+
acreditar ronda
```

### `review_regular`

Reconteo accionable cuyo grupo ya acredita la ronda.

No aumenta cobertura de ronda.

### `shift_coverage`

Cobertura de turno mediante conteo normal.

El valor técnico V4 `daily` se conserva por compatibilidad, pero funcionalmente significa cobertura de turno.

## 5. Recontar bloqueado por snapshot

Un caso `Recontar` sin snapshot posterior utilizable:

```text
estado_diferencia = Recontar
stock_reconteo IS NULL
primer_snapshot_posterior_id IS NULL
```

no es accionable.

No bloquea globalmente la sede.

Si no existe trabajo accionable de mayor prioridad, puede continuar `shift_coverage`.

Una sesión activa mantiene runtime congelado; la llegada posterior de un snapshot no reescribe esa sesión.

## 6. Extensión aditiva de `review_queue`

Cada elemento de:

```text
panel_state.review_queue[]
panel_delta.review_queue[]
```

puede incluir ahora obligatoriamente para elementos V4 nuevos:

```json
{
  "grupo_id": "uuid",
  "detalle_id": "uuid",
  "ultima_diferencia": 0,
  "contado_at": "timestamptz",
  "priority_class": "review_for_coverage"
}
```

Valores válidos:

```text
review_for_coverage
review_regular
```

No se añaden nuevos valores de `next_action`.

## 7. Orden dentro de `review_queue`

La cola queda ordenada:

1. `review_for_coverage`;
2. `review_regular`;
3. dentro de la misma clase: `contado_at ASC, detalle_id ASC`.

El orden visual no sustituye la validación backend.

## 8. Regla de captura frontend

Cuando:

```text
next_action = review
```

el frontend debe determinar la clase prioritaria presente en `review_queue`:

```text
si existe review_for_coverage
→ solo esos elementos son capturables/enviables

si no existe review_for_coverage
y existe review_regular
→ review_regular es capturable/enviable
```

El frontend no debe permitir seleccionar ni enviar una clase inferior mientras exista una superior.

El backend rechaza violaciones con:

`SOLOG_SESSION_PRIORITY_CONFLICT`

## 9. Flush y drafts persistidos

La subprioridad aplica también al envío de drafts persistidos.

No basta con filtrar únicamente la UI.

Cuando el delivery state indique `next_action=review`:

- primero son elegibles drafts cuyo `detalle_id/grupo_id` pertenece a `review_for_coverage`;
- agotada esa clase, pasan a ser elegibles los `review_regular`;
- retries conservan payload/operation_id conforme a idempotencia V4.

## 10. Runtime privado

`inventario.solog_session_runtime_groups` congela:

```text
accion
priority_class
```

`priority_class` es `NOT NULL`.

Coherencia:

```text
coverage ↔ round_coverage
recount  ↔ review_for_coverage | review_regular
daily    ↔ shift_coverage
none     ↔ none
```

Una acción consumida pasa conjuntamente a:

```text
accion = none
priority_class = none
```

## 11. Inconsistente

`Inconsistente` es terminal para el caso que produjo el reconteo, no para el grupo.

Se conserva:

```text
Inconsistente
→ estado_stock_grupo.estado = Cambio_reciente
```

El grupo debe volver a observarse posteriormente.

## 12. Bloqueo temporal de Inconsistente

Si el último caso relevante del grupo está `Inconsistente` y:

```text
recontado_at ∈ turno actual
```

el grupo no puede recibir un conteo normal durante ese mismo turno.

No se modifica:

`ultimo_conteo_at`

El bloqueo es derivado, no persistido como nuevo estado.

Al comenzar el siguiente turno:

```text
recontado_at ∉ turno actual
```

el bloqueo desaparece y el grupo vuelve a competir como `shift_coverage` según la prioridad normal.

Error de defensa en profundidad:

`SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`

## 13. Observaciones físicas

Se mantiene:

```text
conteo normal
→ puede actualizar ultimo_conteo_at
→ actualiza ultima_observacion_fisica_at

reconteo
→ NO modifica ultimo_conteo_at
→ puede actualizar ultima_observacion_fisica_at
```

Por tanto un reconteo puede acreditar una ronda sin consumir el conteo normal del turno.

## 14. KPI V4 preservados

No cambian los nombres del wire:

- `coverage_round`
- `coverage_total`
- `coverage_counted`
- `coverage_pending`
- `coverage_percent`
- `review_pending`
- `coverage_queue_pending`
- `daily_pending`
- `coverage_blocked_waiting_snapshot`

Semánticamente:

- `review_pending` = total accionable de ambas clases de review;
- `daily_pending` representa cobertura de turno pendiente en el contrato V4.

## 15. Invariantes preservados

Este delta no cambia:

- dos rondas por quincena;
- ventanas de turno;
- máximo un conteo normal por grupo/turno;
- reconteo no consume el cupo normal;
- snapshot posterior no auto-resuelve;
- sesión posterior para reconteo;
- resolución `Coincide / Confirmada / Inconsistente`;
- idempotencia V4;
- lifecycle activo/recovery/finalizado/expirado;
- runtime congelado por sesión;
- shape de payloads de mutación.

## 16. Estado de validación

Backend:

```text
Desplegado: SÍ
Validación técnica global: PASS
Contrato: CONGELADO
Frontend consumidor: PENDIENTE DE ADAPTAR
Smoke humano final: PENDIENTE DEL HANDOFF FRONTEND
```

El frontend puede implementarse contra este contrato sin asumir cambios backend adicionales.
