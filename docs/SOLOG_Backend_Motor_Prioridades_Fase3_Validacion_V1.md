# SOLOG — Backend — Motor Prioridades — Fase 3 Validación V1

**Estado:** CERRADA — VALIDACIÓN BACKEND GLOBAL PASS  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — Motor / backend  
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`

## 1. Fuente primaria

`docs/SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`

Contrato backend resultante:

`docs/SOLOG_Backend_Contrato_Cajero_V4_Delta_Prioridades_V1.md`

## 2. Estrategia de validación

Se utilizaron:

- datos reales únicamente para lecturas y regresiones;
- fixtures SQL dentro de `BEGIN … ROLLBACK`;
- sesiones, detalles, snapshots y dispositivos sintéticos no persistentes;
- wrappers públicos con contexto real de cajero;
- advisors finales de Supabase.

No se dejaron datos de prueba.

## 3. Regresión real de sedes

### Cutervo

```text
coverage_total         = 488
coverage_counted       = 0
coverage_queue_pending = 430
review_pending         = 58
next_action            = coverage
```

Clasificación:

```text
round_coverage       = 430
review_for_coverage  = 58
review_regular       = 0
shift_coverage       = 0
```

PASS.

### Casuarinas

```text
coverage_total         = 488
coverage_counted       = 488
review_pending         = 37
daily_pending          = 34
next_action            = review
```

Clasificación:

```text
round_coverage       = 0
review_for_coverage  = 0
review_regular       = 37
shift_coverage       = 34
```

PASS.

Divino, Huaca y Unidad permanecieron en `next_action=none` en el corte observado.

## 4. Prioridad transaccional completa

Fixture con las cuatro clases simultáneas.

Validado:

```text
round_coverage
→ review_for_coverage
→ review_regular
→ shift_coverage
```

Casos comprobados:

- `round_coverage` bloquea un conteo normal de `shift_coverage`;
- `review_regular` es rechazado mientras existe `review_for_coverage`;
- al consumir `review_for_coverage`, `review_regular` pasa a ser autoritativo;
- agotados los reviews, `shift_coverage` queda habilitado.

Error esperado:

`SOLOG_SESSION_PRIORITY_CONFLICT`

PASS.

## 5. `review_queue[].priority_class`

Se construyó un panel congelado con ambas subclases.

Validado que `review_queue` expone:

- `review_for_coverage`;
- `review_regular`.

También se validó el orden por prioridad.

PASS.

## 6. Recontar esperando snapshot

Se creó un conteo con diferencia sin snapshot posterior:

```text
Recontar
primer_snapshot_posterior_id = NULL
```

Con `shift_coverage` disponible:

```text
next_action = daily
coverage_blocked_waiting_snapshot >= 1
```

El caso bloqueado no detuvo la sede.

PASS.

## 7. Inconsistente

Se creó un caso transaccional:

```text
conteo normal
→ Recontar
→ reconteo
→ Inconsistente
```

Validado:

- `ultimo_conteo_at` no cambia con el reconteo;
- `ultima_observacion_fisica_at` avanza;
- mismo turno: grupo no obtiene acción normal;
- siguiente turno: grupo vuelve a `daily/shift_coverage` si sigue `Cambio_reciente`.

PASS.

## 8. Defensa en profundidad

Se intentó insertar directamente un segundo conteo normal después de un `Inconsistente` del mismo turno.

Resultado esperado:

`SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`

PASS.

## 9. Lifecycle

Se finalizó la sesión sintética.

Validado:

```text
finalizado
→ runtime eliminado
```

PASS.

## 10. `rpc_solog_details_v2(summary)`

Se ejecutó con contexto real de cajero.

Validado:

- `contract_version=2`;
- summary presente;
- lectura de `revisar_pendientes`;
- dependencia de `solog_cashier_operational_summary_v4` sin regresión.

PASS.

## 11. Bootstrap V4 público

Se creó dentro de una transacción:

- dispositivo autorizado con token sintético;
- sesión activa;
- runtime completo de 488 grupos.

Se llamó:

`public.rpc_solog_cashier_bootstrap_v4`

Validado:

- `contract_version=4`;
- `panel_state` presente;
- `source=session`;
- `frozen=true`;
- `review_queue[].priority_class` válido;
- ACL pública preservada.

PASS.

## 12. Start V4 end-to-end

El detalle del último snapshot real había sido eliminado por TTL, por lo que se construyó un snapshot confirmado fresco transaccional desde `stock_actual`.

Cobertura:

```text
SKU requeridos             = 970
SKU faltantes stock_actual = 0
```

Se ejecutó:

`rpc_solog_cashier_mutate_v4('start', ...)`

Validado:

- respuesta V4;
- `replay=false`;
- panel presente;
- runtime creado para todo el universo operacional;
- `priority_class NOT NULL`;
- coherencia `accion ↔ priority_class`;
- extensión de review válida.

PASS.

## 13. Idempotencia

### Helper base

Validado:

```text
operation_begin inicial → NULL
operation_finish        → persiste respuesta
mismo request/op id     → replay exacto
payload distinto        → SOLOG_IDEMPOTENCY_CONFLICT
```

PASS.

### RPC `start`

Se repitió exactamente el mismo `operation_id + payload`.

Resultado:

```text
replay = true
mismo conteo_id
```

PASS.

## 14. Finish V4 end-to-end

Sobre la sesión creada por `start` se ejecutó:

`rpc_solog_cashier_mutate_v4('finish', ...)`

Validado:

- `action=finish`;
- `status=finalizado`;
- runtime eliminado.

PASS.

## 15. Post-rollback

Después de todas las pruebas:

```text
sesiones activo/recovery = 0
runtime rows             = 0
phase3:idempotency rows  = 0
```

El dispositivo autorizado de Casuarinas recuperó su hash original.

Los KPI/next_action reales de Cutervo y Casuarinas permanecieron iguales al baseline.

PASS.

## 16. Seguridad y permisos

Los helpers internos de prioridad:

- no son SECURITY DEFINER;
- no tienen EXECUTE para PUBLIC;
- no tienen EXECUTE para anon;
- no tienen EXECUTE para authenticated.

RPC públicas Cajero:

- continúan SECURITY DEFINER;
- `authenticated` conserva EXECUTE;
- `anon` y PUBLIC no tienen EXECUTE.

PASS.

## 17. Advisors

No se detectaron hallazgos de seguridad nuevos asociados a:

- `solog_priority_*`;
- `solog_runtime_priority_class_v4`;
- `priority_class`.

El advisor de performance sigue mencionando índices históricos no utilizados de `solog_session_runtime_groups`; son preexistentes y no fueron creados por este delta.

No constituyen bloqueo para este cierre.

## 18. Frontend parser

El parser V4 actual lee los campos conocidos del elemento de `review_queue` y no rechaza propiedades adicionales.

Por tanto la extensión aditiva backend no rompe el frontend desplegado.

Sin embargo, el frontend actual todavía no utiliza `priority_class` para limitar selección/flush.

Eso queda como handoff obligatorio posterior.

## 19. Resultado

```text
Prioridad Motor             PASS
Subprioridad review         PASS
Snapshot bloqueado          PASS
Inconsistente mismo turno   PASS
Inconsistente siguiente     PASS
Observaciones físicas       PASS
Panel V4                    PASS
Bootstrap V4                PASS
Start V4                    PASS
Replay V4                   PASS
Finish V4                   PASS
Details V2                  PASS
Lifecycle/runtime cleanup   PASS
ACL                         PASS
Advisors del delta          PASS
Rollback/limpieza           PASS
```

**FASE 3 CERRADA.**

Backend del delta:

**DESPLEGADO, VALIDADO TÉCNICAMENTE Y CON CONTRATO CONGELADO.**

El siguiente bloque permitido es el handoff frontend Cajero. Codex no debe modificar backend.
