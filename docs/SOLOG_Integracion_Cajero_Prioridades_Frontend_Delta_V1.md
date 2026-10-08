# SOLOG — Integración — Cajero Prioridades Frontend — Delta V1

**Estado:** CONGELADO — FASES 1–3 IMPLEMENTADAS / VALIDACIÓN GLOBAL PENDIENTE  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Clasificación:** Nivel B — adaptación funcional frontend  
**Rama:** `admin-work`  
**Baseline de definición:** `0c3cf82f2d2a49849e1810a1832fc0d03b07c3e4`

---

## 1. Fuente primaria y precedencia

Este documento es la **fuente primaria frontend** para la adaptación del Cajero V4 al nuevo Motor de prioridades.

Contrato backend autoritativo:

`docs/SOLOG_Backend_Contrato_Cajero_V4_Delta_Prioridades_V1.md`

Fuente funcional:

`docs/SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`

Preflight que sustenta este delta:

`docs/SOLOG_Integracion_Cajero_Prioridades_Frontend_Preflight_V1.md`

Documentación anterior:

`docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`

permanece vigente únicamente donde este delta no la reemplace explícitamente.

Precedencia para este bloque:

1. `SOLOG_Backend_Contrato_Cajero_V4_Delta_Prioridades_V1.md`;
2. este delta frontend;
3. `SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`;
4. `SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`;
5. código/tests previos como baseline, no como contrato.

---

## 2. Objetivo

Adaptar el frontend Cajero V4 al backend ya desplegado y congelado, sin modificar Supabase ni crear una nueva versión de contrato.

La prioridad funcional autoritativa es:

```text
round_coverage
→ review_for_coverage
→ review_regular
→ shift_coverage
→ none
```

El wire público V4 se conserva:

```text
coverage
review
review
daily
none
```

El frontend no debe reconstruir ni reinterpretar la prioridad del Motor.

---

## 3. Contrato de `review_queue`

Se incorpora:

```ts
export type CashierV4ReviewPriorityClass =
  | 'review_for_coverage'
  | 'review_regular'
```

Todo `CashierV4ReviewQueueItem` debe contener:

```text
grupo_id
detalle_id
ultima_diferencia
contado_at
priority_class
```

Valores permitidos:

```text
review_for_coverage
review_regular
```

El parser debe exigir este campo en:

- `panel_state.review_queue[]`;
- `panel_delta.review_queue[]`.

No se permite inferir `priority_class` desde:

- posición;
- cobertura;
- fecha;
- grupo;
- diferencia;
- estado local.

---

## 4. Autoridad única frontend para subprioridad Review

Debe existir una única función pura compartida que resuelva:

```text
si existe review_for_coverage
→ prioridad review actual = review_for_coverage

si no existe y existe review_regular
→ prioridad review actual = review_regular

si la cola está vacía
→ null
```

A partir de ella debe derivarse el subconjunto:

`actionableReviewQueue`

La misma autoridad debe ser reutilizada por:

1. selectors/UI;
2. `runtime.capture('review')`;
3. flush de drafts.

No se permiten implementaciones paralelas de la misma regla.

---

## 5. Revisar — captura

Cuando:

`next_action = review`

solo pueden capturarse los elementos cuya:

`priority_class === currentReviewPriority`

Por tanto:

- si existe al menos un `review_for_coverage`, ningún `review_regular` es capturable;
- cuando desaparece `review_for_coverage`, `review_regular` pasa a ser capturable;
- el frontend debe usar el campo backend, no deducir el cambio.

`runtime.capture('review')` debe rechazar cualquier grupo/detalle que no pertenezca al subset actionable vigente.

---

## 6. Revisar — presentación

`kpis.review_pending` conserva su significado backend:

**total de reviews accionables de ambas clases**.

La lista operacional debe mostrar únicamente el subconjunto actualmente capturable.

Cuando:

```text
review_for_coverage > 0
AND review_pending > review_for_coverage
```

la UI debe comunicar de forma compacta la diferencia entre prioridad actual y total.

Copy conceptual aprobado:

```text
X prioritarios para completar la ronda
Y pendientes totales
```

Puede adaptarse gramaticalmente al singular/plural sin alterar la semántica.

No se requiere mostrar filas de menor prioridad deshabilitadas.

---

## 7. Flush autoritativo por subprioridad

La elegibilidad actual de `review` queda reemplazada.

Cuando:

`delivery.next_action === 'review'`

el coordinador debe:

1. resolver `currentReviewPriority` desde `delivery.review_queue`;
2. seleccionar exclusivamente items de esa clase;
3. hacer match por `detalle_id + grupo_id`;
4. preparar batches solo con drafts de esa clase;
5. respetar `CASHIER_V4_BATCH_LIMIT`;
6. adoptar el `panel_delta` confirmado;
7. recalcular la subprioridad antes del siguiente batch.

Secuencia válida:

```text
review_for_coverage batch(es)
→ panel_delta
→ review_regular batch(es)
```

Un `review_regular` nunca debe adelantarse a un `review_for_coverage`.

---

## 8. Operaciones preparadas e idempotencia

No se modifica el contrato de operaciones preparadas.

Si existe `record.prepared`:

- conservar `operation_id`;
- conservar payload;
- conservar items;
- conservar timestamps;
- conservar retry/replay actual.

No replanificar ni sustituir una operación preparada aunque cambie posteriormente la cola visible.

Si el backend rechaza una operación por prioridad:

`SOLOG_SESSION_PRIORITY_CONFLICT`

se mantiene la política existente de refresh, preservando la evidencia local.

---

## 9. Persistencia local

No se cambia:

- versión top-level del storage;
- prefix;
- scope;
- estructura de drafts;
- estructura de prepared operation.

`priority_class` forma parte de cada item de `review_queue` guardado en `delivery_state`.

No se crea migración destructiva.

### Snapshot legacy sin `priority_class`

Si un delivery snapshot local contiene `review_queue` sin `priority_class`:

- no inferir prioridad;
- no borrar drafts;
- no purgar storage;
- no autorizar flush de review con autoridad ambigua.

Comportamiento obligatorio:

**fail-closed conservando datos**.

El cutover backend se realizó con:

```text
sesiones activo/recovery = 0
runtime rows = 0
```

por lo que no existía una sesión backend viva que requiriera migración durante el despliegue.

---

## 10. Error `Inconsistente`

Añadir política Cajero V4 para:

`SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`

Copy aprobado:

```text
Este grupo debe volver a contarse en el siguiente turno. Actualiza el panel.
```

Política:

```text
retryable = false
requiresRefresh = true
sessionInvalid = false
```

No modificar la política global de otros módulos.

---

## 11. Terminología funcional visible

Se reemplaza:

```text
Cobertura quincenal
→ Cobertura de ronda

Conteo diario
→ Cobertura de turno
```

Labels de cobertura:

```text
Cobertura de ronda 1
Cobertura de ronda 2
```

Copy funcional:

```text
coverage:
Completa los grupos pendientes de la cobertura de la ronda.

daily:
Registra los grupos habilitados para un conteo normal en este turno.
```

La ruta y el wire técnico no cambian.

---

## 12. Compatibilidad técnica preservada

No renombrar en este bloque:

- `next_action='daily'`;
- `daily_queue`;
- `daily_pending`;
- ruta `/cajero/diario`;
- nombres internos V4 que reflejan directamente el wire backend.

La interfaz visible puede decir **Cobertura de turno** aunque el identificador técnico continúe siendo `daily`.

---

## 13. Home y flujo operativo

Se conserva la estructura actual:

```text
coverage
→ review
→ daily
```

No se añaden dos pasos visuales separados para:

- `review_for_coverage`;
- `review_regular`.

Ambos continúan representados por:

`Revisar`

El backend mantiene:

`next_action = review`

para ambas clases.

Solo cambia:

- semántica de la captura dentro de Revisar;
- copy de cobertura de ronda/turno.

---

## 14. Navegación

No cambia la lógica de routing:

```text
coverage → /cajero/conteo
review   → /cajero/revisar
daily    → /cajero/diario
none     → /cajero
```

La ruta `/cajero/diario` conserva el path, pero su label visible pasa a:

`Cobertura de turno`

`panel.next_action` continúa siendo la autoridad de navegación.

---

## 15. Store y reducer

No se introduce estado derivado de prioridad.

El store debe continuar:

- reemplazando queues desde panel completo;
- reemplazando queues desde `panel_delta`;
- conservando delivery state por sesión;
- conservando snapshots recovery.

Al tipar `priority_class`, el valor se propaga dentro de la cola existente.

No se rediseña `CashierV4DeliveryState`.

---

## 16. Fixtures contractuales

Los fixtures previos que representen estados incompatibles con el nuevo Motor deben actualizarse.

### Invariantes

#### `next_action=coverage`

```text
coverage_queue.length > 0
```

Puede coexistir con trabajo review/daily de menor prioridad.

#### `next_action=review`

```text
coverage_queue.length = 0
review_queue.length > 0
```

Puede contener ambas subclases review.

Si contiene `review_for_coverage`, esa es la única subclase capturable.

#### `next_action=daily`

```text
coverage_queue.length = 0
review_queue.length = 0
daily_queue.length > 0
```

#### `next_action=none`

No existe trabajo accionable.

Los casos esperando snapshot no se presentan como review accionable.

---

## 17. Tests obligatorios

La implementación debe cubrir al menos:

### Contrato/parser

- `priority_class` requerido;
- ambos valores permitidos;
- valor ausente/inválido rechazado;
- panel y delta.

### Selectors

- resolver clase review actual;
- preservar cola completa;
- derivar subset actionable;
- transición `review_for_coverage → review_regular`.

### Runtime

- captura permitida solo para subclase vigente;
- captura regular bloqueada mientras exista for-coverage.

### Flush

- `coverage → review_for_coverage → review_regular → daily → none`;
- no mezclar subclases en un mismo batch;
- orden local de drafts no puede saltar prioridad;
- múltiples batches respetan clase;
- panel delta provoca replanificación;
- prepared retry conserva payload exacto.

### Storage/recovery

- `priority_class` persiste en delivery state;
- active → recovery conserva metadata;
- snapshot legacy ambiguo bloquea planificación sin borrar drafts.

### UI

- lista Revisar usa subset actionable;
- Home conserva total review;
- indicador prioritario/total cuando aplique;
- labels `Cobertura de ronda`;
- labels `Cobertura de turno`.

### Error policy

- `SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`.

### Browser

Actualizar los smoke/fixtures afectados sin reducir cobertura útil.

---

## 18. Alcance técnico esperado

Archivos núcleo probables:

```text
src/features/solog/cajero/cajero.v4.ts
src/features/solog/cajero/cajero.v4.api.ts
src/features/solog/cajero/cajero.v4.selectors.ts
src/features/solog/cajero/cajero.v4.flush.ts
src/features/solog/cajero/cajero.v4.runtime.ts
src/features/solog/cajero/cajero.v4.errors.ts
src/features/solog/cajero/cajero.v4.ui.tsx
src/features/solog/cajero/cajero.v4.navigation.ts
tests/fixtures/cashier-v4.mjs
tests/fixtures/cashier-v4-drafts.ts
```

Tests V4 afectados de forma esperada:

```text
tests/cajero-contract-v4.test.ts
tests/cajero-queue-mapping-v4.test.ts
tests/cajero-flush-drafts-v4.test.ts
tests/cajero-runtime-v4.test.ts
tests/cajero-error-policy-v4.test.ts
tests/cajero-drafts-storage-v4.test.ts
tests/cajero-recovery-delivery-state-v4.test.ts
tests/cajero-navigation-v4.test.ts
tests/cajero-v4.browser.mjs
```

El inventario definitivo debe establecerlo Codex contra el repo local antes de implementar.

---

## 19. Fuera de alcance

- Supabase/backend;
- nuevas RPC;
- V5;
- cambios de Motor;
- Admin/Dashboard;
- History V2;
- lifecycle/recovery;
- idempotencia;
- renombrado técnico global de `daily`;
- renombrado de `/cajero/diario`;
- refactor general;
- rediseño visual general;
- Design System salvo necesidad estricta demostrada.

Si Codex encuentra una dependencia backend no prevista, debe detenerse y devolver el bloqueo a ChatGPT.

---

## 20. Validación requerida

Antes del cierre deben pasar, proporcionalmente:

- tests V4 Cajero afectados;
- suite completa;
- lint;
- build;
- `git diff --check`;
- revisión de diff;
- smoke browser existente;
- smoke humano posterior.

No considerar validado lo que no pudo ejecutarse.

---

## 21. Estado congelado

```text
Definición funcional: APROBADA
Preflight frontend: COMPLETADO
Contrato backend: CONGELADO Y DESPLEGADO
Delta frontend: CONGELADO
Implementación frontend Fase 1: COMPLETADA
Implementación frontend Fase 2: COMPLETADA
Implementación frontend Fase 3: COMPLETADA
Validación global Fase 4: PENDIENTE
Backend adicional: NO REQUERIDO
```

Cualquier cambio posterior debe tratarse como delta sobre este documento y conservar vigente todo lo no reemplazado explícitamente.
