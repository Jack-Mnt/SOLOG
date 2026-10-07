# SOLOG — Backend — Motor Prioridades — Preflight Técnico V1

**Estado:** PREFLIGHT COMPLETADO — CONTRATO ADITIVO PROPUESTO / IMPLEMENTACIÓN PENDIENTE  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — Motor / backend  
**Rama:** `admin-work`

## 1. Fuente primaria funcional

Fuente primaria:

`docs/SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`

Este reporte no reemplaza la fuente primaria. Documenta el baseline real, dependencias, bloqueos técnicos y propuesta de implementación.

## 2. Baseline Supabase

Proyecto: `fvtohxvcvsflzmftgfzs`.

Al ejecutar el preflight:

- sesiones `activo/recovery`: 0;
- filas en `inventario.solog_session_runtime_groups`: 0;
- el historial de migraciones incluye Motor V4 y el delta operacional previo;
- `rpc_solog_details_v2` existe intencionalmente por la migración `restore_solog_details_v2_for_motor_v4`;
- `rpc_solog_details_v2` no debe eliminarse dentro de este bloque.

Baseline operacional observado:

- Cutervo: 488 grupos; 430 `round_coverage`; 58 `review_for_coverage`; `next_action=coverage`;
- Casuarinas: 488 grupos cubiertos; 37 `review_regular`; 34 `shift_coverage`; `next_action=review`;
- Divino/Huaca/Unidad sin universo operativo vigente en el corte observado.

Estos escenarios sirven como regresiones reales: el delta no debe cambiar sus `next_action` actuales.

## 3. Funciones directamente afectadas

### 3.1. `inventario.solog_cashier_group_actions_v4`

Cambio obligatorio:

- conservar su firma pública/interna actual;
- derivar el bloqueo temporal después de `Inconsistente`;
- impedir `daily`/cobertura de turno si el último caso relevante está `Inconsistente` y `recontado_at` pertenece al turno actual.

No debe modificar `ultimo_conteo_at`.

### 3.2. `inventario.solog_cashier_operational_summary_v4`

Cambio obligatorio:

- clasificar internamente las acciones en:
  - `round_coverage`;
  - `review_for_coverage`;
  - `review_regular`;
  - `shift_coverage`;
- resolver el orden aprobado mediante una única autoridad de prioridad.

El shape público actual puede mantenerse.

### 3.3. `inventario.solog_cashier_panel_state_v4`

Cambio obligatorio:

- distinguir las dos subclases de `review`;
- conservar `next_action = review|coverage|daily|none`;
- exponer suficiente metadata para que frontend pueda respetar la subprioridad;
- no reconstruir prioridad con un CASE independiente del helper autoritativo.

### 3.4. `inventario.solog_enforce_runtime_priority_v4`

Cambio crítico:

- validar la `priority_class` concreta del grupo frente a la clase global autorizada;
- no aceptar `review_regular` mientras exista `review_for_coverage`;
- continuar rechazando saltos de coverage/review/daily mediante `SOLOG_SESSION_PRIORITY_CONFLICT`.

### 3.5. `inventario.solog_assert_normal_count_turn_v4`

Cambio recomendado como invariante de datos:

- además del máximo de un conteo normal por turno, rechazar un nuevo conteo normal cuando el último caso relevante terminó `Inconsistente` mediante un reconteo del mismo turno.

Esto proporciona defensa en profundidad aunque exista un error futuro en la cola/UI.

### 3.6. `public.rpc_solog_cashier_mutate_v4`

Cambio en `start`:

- congelar la nueva clasificación privada de prioridad por grupo junto con `accion`.

La resolución actual:

`Inconsistente → estado_stock_grupo.estado = Cambio_reciente`

permanece correcta y no debe rediseñarse.

## 4. Funciones indirectamente afectadas

### `inventario.solog_cashier_panel_delta_v4`

Puede conservar su shape y heredar `review_queue`, KPI y `next_action` desde `panel_state`.

### `public.rpc_solog_cashier_bootstrap_v4`

Puede conservar contrato V4; hereda summary/panel actualizados.

### `public.rpc_solog_details_v2`

Es una superficie restaurada intencionalmente en V4, no un objeto muerto.

Su acción `summary` consume `solog_cashier_operational_summary_v4`. Como el shape del summary se mantiene, no requiere cambio estructural, pero debe entrar en smoke de regresión.

## 5. Funciones sin cambio funcional esperado

- `inventario.solog_sync_physical_observation_v4`;
- `inventario.solog_aplicar_snapshot_v4`;
- `inventario.solog_guard_recount_resolution_v4`;
- `inventario.solog_validate_session_observation_v4`;
- `inventario.solog_temporal_context`;
- lifecycle activo/recovery/finalizado/expirado;
- idempotencia V4.

En particular:

- reconteo sigue sin modificar `ultimo_conteo_at`;
- reconteo sí puede avanzar `ultima_observacion_fisica_at`;
- snapshot posterior habilita reconteo y no auto-resuelve.

## 6. Runtime privado propuesto

Añadir a `inventario.solog_session_runtime_groups`:

`priority_class text NOT NULL`

Valores:

- `round_coverage`;
- `review_for_coverage`;
- `review_regular`;
- `shift_coverage`;
- `none`.

Debe existir un CHECK de valores y un CHECK de coherencia con `accion`:

- `coverage ↔ round_coverage`;
- `recount ↔ review_for_coverage | review_regular`;
- `daily ↔ shift_coverage`;
- `none ↔ none`.

No se recomienda un índice nuevo: el runtime esperado es pequeño y ya existe índice por `conteo_id, accion, grupo_conteo_id`.

La DDL debe abortar si al momento de implementación existen sesiones activas/recovery o runtime residual, salvo un plan de migración explícito.

## 7. Autoridad única propuesta

Crear helpers internos equivalentes a:

1. clasificar `action + coverage_complete → priority_class`;
2. mapear `priority_class → rank`;
3. mapear `priority_class → acción pública`;
4. resolver la clase prioritaria de un runtime congelado.

La precedencia vive en un solo helper/ranking compartido.

`operational_summary`, `panel_state` y `enforce_runtime_priority` deben consumir esa autoridad y no mantener órdenes independientes.

## 8. Bloqueo de contrato detectado

El contrato V4 actual expone:

- `next_action = review`;
- `review_queue[]` sin subtipo.

El frontend actual considera cualquier elemento de `review_queue` capturable cuando `next_action=review`.

Por tanto, únicamente endurecer el trigger produciría una UX incorrecta: el usuario podría seleccionar un `review_regular` y recibir `SOLOG_SESSION_PRIORITY_CONFLICT` mientras aún existan `review_for_coverage`.

## 9. Solución de contrato recomendada

Mantener:

- `contract_version = 4`;
- mismas RPC;
- mismos valores de `next_action`;
- mismas colas.

Extender aditivamente cada elemento de `review_queue` con:

`priority_class = "review_for_coverage" | "review_regular"`

La validación frontend V4 actual tolera campos adicionales en el objeto, por lo que el backend puede desplegar la extensión sin romper el parser existente.

Después de congelar backend, el frontend deberá:

- capturar primero únicamente `review_for_coverage` si existe alguno;
- permitir `review_regular` cuando ya no exista `review_for_coverage`;
- aplicar la misma selección al flush de drafts persistidos;
- mantener `next_action=review`.

No se recomienda ocultar dinámicamente grupos o reescribir `accion` para evitar el cambio frontend: complicaría el runtime congelado y degradaría la transparencia del contrato.

## 10. KPI

Se preserva la semántica pública existente:

- `review_pending` = total de casos accionables de revisar;
- `coverage_queue_pending` = cobertura normal directa pendiente en el runtime/summary correspondiente;
- `daily_pending` conserva el nombre técnico V4 pero semánticamente representa cobertura de turno;
- `coverage_blocked_waiting_snapshot` conserva su propósito.

No se requiere exponer nuevos KPI para implementar el delta.

## 11. Compatibilidad y migración

No se requiere:

- nueva RPC pública;
- `contract_version=5`;
- nuevos estados de diferencia;
- nuevos estados de sesión;
- cambiar payloads de mutaciones;
- alterar `ultimo_conteo_at`;
- alterar reglas de resolución de diferencias.

La extensión de `review_queue` es aditiva.

## 12. Matriz mínima de regresión

Deben validarse al menos:

1. Cutervo actual: `round_coverage` prevalece sobre `review_for_coverage`.
2. Casuarinas actual: `review_regular` prevalece sobre `shift_coverage`.
3. `round_coverage=0 + review_for_coverage>0 + review_regular>0` → solo la primera subclase es aceptada por el guard.
4. agotado `review_for_coverage` → `review_regular`.
5. review bloqueado sin snapshot no bloquea `shift_coverage`.
6. `Inconsistente` en turno actual → no nuevo conteo normal.
7. siguiente turno → grupo vuelve a ser elegible como cobertura de turno si sigue `Cambio_reciente`.
8. reconteo no cambia `ultimo_conteo_at`.
9. reconteo sí actualiza `ultima_observacion_fisica_at`.
10. panel/bootstrap mantienen contrato V4 parseable.
11. `rpc_solog_details_v2(summary)` sigue funcionando.
12. idempotencia de `save_batch/recount_save_batch` sin regresión.
13. runtime se elimina al finalizar/expirar como antes.

## 13. Estado del preflight

Resultado:

- contradicciones funcionales: resueltas;
- lifecycle: compatible;
- schema: cambio privado pequeño;
- contrato público: requiere extensión aditiva de `review_queue`;
- frontend: requerirá delta pequeño después de congelar backend;
- datos vivos: sin sesiones/runtime que requieran migración al momento del preflight;
- bloqueo técnico crítico: ninguno si se aprueba la extensión aditiva V4.

## 14. Plan de implementación propuesto

### Fase 1 — Fundación privada

- guard pre-implementación de sesiones/runtime vacíos;
- columna `priority_class` + constraints;
- helpers autoritativos de clasificación/ranking/mapping;
- validación SQL aislada.

### Fase 2 — Motor y prioridad

- adaptar `group_actions_v4`;
- adaptar `operational_summary_v4`;
- adaptar `panel_state_v4`;
- adaptar `enforce_runtime_priority_v4`;
- adaptar `assert_normal_count_turn_v4`;
- congelar `priority_class` en `rpc_solog_cashier_mutate_v4(start)`;
- añadir `priority_class` a `review_queue`.

### Fase 3 — Validación backend

- ejecutar matriz de regresión;
- smoke con Cutervo/Casuarinas sin alterar conteos reales;
- verificar ACL/funciones/advisors;
- validar wrappers públicos y detalles V2;
- congelar contrato backend actualizado.

### Fase 4 — Handoff frontend

Solo después del backend desplegado/validado:

- delta de tipos/selectores/flush Cajero;
- frontend filtra la subprioridad de `review`;
- Codex no modifica backend.

## 15. Decisión pendiente antes de implementar

Aprobar la extensión aditiva:

`review_queue[].priority_class`

sin cambiar `contract_version=4`.

Esta es la única decisión de contrato pendiente detectada por el preflight.
