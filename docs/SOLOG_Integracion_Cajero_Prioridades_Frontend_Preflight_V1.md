# SOLOG — Integración — Cajero Prioridades Frontend — Preflight V1

**Estado:** PREFLIGHT COMPLETADO — IMPLEMENTACIÓN FRONTEND PENDIENTE  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Clasificación:** Nivel B — adaptación funcional frontend a backend desplegado  
**Rama:** `admin-work`  
**HEAD inspeccionado:** `66d5588a62fd5ac5c27c4a6924f11669dc444e3f`

---

## 1. Fuente primaria

Contrato backend desplegado y congelado:

`docs/SOLOG_Backend_Contrato_Cajero_V4_Delta_Prioridades_V1.md`

Fuente funcional:

`docs/SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`

El documento anterior:

`docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`

permanece vigente únicamente donde no contradiga el delta nuevo.

Quedan reemplazadas, entre otras, sus reglas antiguas:

- prioridad `review → coverage → daily`;
- terminología funcional `Cobertura quincenal`;
- terminología funcional `Conteo diario`;
- `review_queue` sin subprioridad.

---

## 2. Objetivo frontend

Adaptar Cajero V4 al backend ya desplegado sin modificar Supabase ni crear V5.

La prioridad autoritativa es:

```text
round_coverage
→ review_for_coverage
→ review_regular
→ shift_coverage
→ none
```

Wire público preservado:

```text
coverage
review
review
daily
none
```

La adaptación debe respetar `review_queue[].priority_class` tanto en captura como en flush/retry.

---

## 3. Baseline actual del frontend

Módulos V4 actuales:

- `cajero.v4.ts`
- `cajero.v4.api.ts`
- `cajero.v4.selectors.ts`
- `cajero.v4.flush.ts`
- `cajero.v4.runtime.ts`
- `cajero.v4.store.ts`
- `cajero.v4.storage.ts`
- `cajero.v4.navigation.ts`
- `cajero.v4.errors.ts`
- `cajero.v4.ui.tsx`

La estructura modular existente es suficiente. No se requiere refactor general.

---

## 4. Hallazgo contractual principal — parser

### Estado actual

`CashierV4ReviewQueueItem` contiene:

```text
grupo_id
detalle_id
ultima_diferencia
contado_at
```

El parser `queues()` ignora actualmente campos adicionales.

Por tanto el backend ya puede enviar `priority_class` sin romper el frontend actual, pero el frontend no tiene autoridad tipada para consumirlo.

### Cambio requerido

Añadir:

```ts
type CashierV4ReviewPriorityClass =
  | 'review_for_coverage'
  | 'review_regular'
```

y:

```ts
CashierV4ReviewQueueItem.priority_class
```

El parser de respuestas backend debe exigir:

```text
review_for_coverage | review_regular
```

en todo elemento nuevo de `panel_state.review_queue` y `panel_delta.review_queue`.

No inferir la clase desde cobertura, fechas o posición en la cola.

---

## 5. Hallazgo crítico — selección de Revisar

### Estado actual

`selectCashierV4ReviewEntries(panel)` devuelve toda la cola.

`runtime.capture('review', ...)` busca el grupo dentro de esa cola completa.

Consecuencia actual:

si coexisten:

```text
review_for_coverage
+
review_regular
```

el runtime puede capturar cualquiera de los dos.

El backend ya rechaza el segundo caso mientras exista el primero.

### Cambio requerido

Crear una única lógica frontend pura para resolver la subprioridad de review:

```text
si review_queue contiene review_for_coverage
→ current_review_priority = review_for_coverage

else si contiene review_regular
→ current_review_priority = review_regular

else
→ null
```

Y derivar:

`actionableReviewQueue`

filtrando únicamente la clase actual.

Esta lógica debe ser compartida por:

- selectors/UI;
- `runtime.capture('review')`;
- flush de drafts.

No duplicar tres implementaciones.

---

## 6. UI Revisar

### Comportamiento obligatorio

Solo la clase vigente debe ser capturable.

Recomendación mínima:

- mantener `selectCashierV4ReviewEntries` como vista de todos los pendientes;
- añadir `selectCashierV4ActionableReviewEntries`;
- usar la variante actionable para la lista/captura operacional;
- mantener `kpis.review_pending` como total backend.

### Transparencia UX recomendada

Cuando exista `review_for_coverage` y además haya `review_regular`, la pantalla puede indicar de forma compacta:

```text
X prioritarios para completar la ronda
Y pendientes totales
```

No es necesario mostrar/deshabilitar todas las filas de menor prioridad.

Esto evita una discrepancia aparente entre:

- Home: `review_pending` total;
- Revisar: subconjunto actualmente accionable.

No se requiere rediseño visual.

---

## 7. Hallazgo crítico — flush

### Estado actual

`eligible(record)` hace:

```text
next_action = review
→ cualquier draft presente en review_queue
```

No considera `priority_class`.

Además conserva el orden local de captura, no el orden autoritativo del backend.

Un batch puede por tanto intentar enviar un `review_regular` antes de un `review_for_coverage` y recibir:

`SOLOG_SESSION_PRIORITY_CONFLICT`

### Cambio requerido

Cuando:

`delivery.next_action === 'review'`

el flush debe:

1. obtener la clase prioritaria de `delivery.review_queue`;
2. construir el conjunto `detalle_id + grupo_id` solo de esa clase;
3. filtrar drafts contra ese conjunto;
4. preparar batches únicamente de esa clase;
5. después de cada `panel_delta`, recalcular la clase antes del siguiente batch.

Esto permite:

```text
review_for_coverage batch(es)
→ delta backend
→ review_regular batch(es)
```

sin reconstruir prioridad localmente más allá del campo explícito del backend.

---

## 8. Prepared operations e idempotencia

No cambiar.

Si ya existe:

`record.prepared`

se conserva exactamente:

- `operation_id`;
- payload;
- timestamps;
- items.

No se debe reescribir una operación preparada por detectar una subprioridad distinta posteriormente.

El backend sigue siendo autoridad y puede responder:

`SOLOG_SESSION_PRIORITY_CONFLICT`

La política existente ya exige refresh para este error.

---

## 9. Nuevo error backend

El backend puede devolver:

`SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`

### Cambio requerido

Añadir política específica en `cajero.v4.errors.ts`.

Copy recomendado:

```text
Este grupo debe volver a contarse en el siguiente turno. Actualiza el panel.
```

Recomendación de política:

```text
requiresRefresh = true
sessionInvalid = false
retryable = false
```

Este error debe ser excepcional porque la cola backend ya excluye el grupo en el mismo turno; sirve como defensa ante estado stale/race.

No hace falta modificar el mapa global de otros módulos.

---

## 10. Terminología visible

Las precisiones funcionales aprobadas reemplazan:

```text
Cobertura quincenal
→ Cobertura de ronda

Conteo diario
→ Cobertura de turno
```

### Cambios visibles requeridos

`cashierV4CoverageLabel`:

```text
Cobertura de ronda 1
Cobertura de ronda 2
```

Home / navegación / módulo:

```text
Conteo diario
→ Cobertura de turno
```

Descripción de coverage:

```text
Completa los grupos pendientes de la cobertura de la ronda.
```

Descripción de turno:

```text
Registra los grupos habilitados para un conteo normal en este turno.
```

### Compatibilidad técnica

No renombrar en este bloque:

- ruta `/cajero/diario`;
- `next_action='daily'`;
- `daily_queue`;
- `daily_pending`;
- funciones/variables técnicas V4 que reflejen el wire.

Son identificadores de compatibilidad, no copy funcional.

---

## 11. Flujo operativo Home

El orden visual actual ya es:

```text
coverage
→ review
→ daily
```

Por tanto la composición del flujo no requiere reordenamiento.

Solo necesita actualización semántica de labels.

La división:

```text
review_for_coverage
→ review_regular
```

no necesita convertirse en dos pasos visuales del Home.

El backend continúa exponiendo ambos como:

`next_action=review`

---

## 12. Navegación

No requiere cambio lógico.

El routing continúa siendo autoritativo por:

`panel.next_action`

y:

- `coverage → /cajero/conteo`
- `review → /cajero/revisar`
- `daily → /cajero/diario`
- `none → /cajero`

Solo cambia el label visible de `/cajero/diario` a **Cobertura de turno**.

No renombrar la ruta.

---

## 13. Store y reducer

No requieren rediseño.

Actualmente:

- panel completo reemplaza queues;
- panel delta reemplaza queues;
- delivery state conserva la cola recibida;
- recovery mantiene su snapshot de delivery por sesión.

Al tipar `priority_class`, el store la propagará sin lógica nueva.

No añadir prioridad derivada al state.

---

## 14. Storage

El shape top-level no cambia.

`priority_class` vive dentro de cada item existente de `review_queue`.

Por tanto:

- no se recomienda bump del storage;
- no se recomienda nuevo prefix;
- no se purgan drafts;
- no se migran payloads preparados.

### Registros históricos

Un registro local creado antes del despliegue podría contener un `review_queue` sin `priority_class`.

Dato de cutover backend:

```text
sesiones activo/recovery = 0
runtime rows = 0
```

Por tanto no existía una sesión backend viva que necesitara migración durante el despliegue.

Recomendación fail-closed:

- no inferir una clase ausente;
- conservar el almacenamiento sin borrado silencioso;
- un snapshot ambiguo no debe autorizar flush de review.

Debe añadirse test explícito para este caso.

---

## 15. Tests/fixtures — contradicción real detectada

Los fixtures actuales todavía codifican la prioridad antigua.

Ejemplo actual:

```text
next_action = review
coverage_queue = [grupo]
```

Esto es imposible bajo el Motor nuevo si existe cobertura directa accionable.

También existen expectativas del tipo:

```text
review → coverage → daily → none
```

que ya no son fuente de verdad.

### Nuevo invariante de fixtures

#### `next_action=coverage`

Puede coexistir con reviews/daily, pero:

`coverage_queue.length > 0`

#### `next_action=review`

Debe tener:

```text
coverage_queue.length = 0
review_queue.length > 0
```

Puede contener ambas subclases; si existe `review_for_coverage`, esa es la única capturable.

#### `next_action=daily`

Debe tener:

```text
coverage_queue.length = 0
review_queue.length = 0
daily_queue.length > 0
```

#### `next_action=none`

No hay trabajo accionable.

Puede existir trabajo bloqueado esperando snapshot, pero no aparece como review accionable.

---

## 16. Tests mínimos a adaptar

### Contrato

`tests/cajero-contract-v4.test.ts`

Añadir:

- `priority_class` requerido;
- valores válidos;
- rechazo de valor ausente/inválido;
- panel delta con metadata nueva.

### Queue mapping

`tests/cajero-queue-mapping-v4.test.ts`

Añadir:

- cola completa conserva orden backend;
- clase activa se resuelve correctamente;
- actionable entries contienen solo la clase superior;
- transición a regular cuando desaparece `review_for_coverage`.

### Flush

`tests/cajero-flush-drafts-v4.test.ts`

Sustituir la expectativa antigua por:

```text
coverage
→ review_for_coverage
→ review_regular
→ daily
→ none
```

Añadir:

- drafts regular no se envían junto a review_for_coverage;
- orden local de captura no puede saltar prioridad;
- múltiples batches >500 respetan la subclase;
- retry de prepared conserva payload aunque cambie la cola;
- delta replanifica clase tras confirmación.

### Runtime/UI

`tests/cajero-runtime-v4.test.ts`

Añadir:

- `runtime.capture('review')` rechaza grupo regular mientras exista for-coverage;
- UI Revisar muestra/captura únicamente el subconjunto vigente;
- copy `Cobertura de ronda`;
- copy `Cobertura de turno`.

### Error policy

`tests/cajero-error-policy-v4.test.ts`

Añadir:

`SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`.

### Storage/recovery

`tests/cajero-drafts-storage-v4.test.ts`  
`tests/cajero-recovery-delivery-state-v4.test.ts`

Validar:

- `priority_class` se conserva en delivery snapshots;
- no se pierde entre active → recovery;
- snapshot legacy ambiguo no se interpreta como autoridad.

### Browser

`tests/cajero-v4.browser.mjs`

Actualizar únicamente labels/escenarios afectados; conservar smoke de navegación y captura.

---

## 17. Archivos de impacto probable

### Obligatorios

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

### Tests afectados

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

### Probablemente sin cambio funcional

```text
cajero.v4.store.ts
cajero.v4.capability.ts
cajero.v4.context.tsx
cajero.history.ts
```

Codex debe confirmar el inventario local antes de implementar.

---

## 18. Fuera de alcance

- cualquier cambio Supabase/backend;
- contract version V5;
- renombrar `daily` en el wire;
- renombrar `/cajero/diario`;
- rediseño visual general;
- Admin/Dashboard;
- History V2;
- cambios de lifecycle/recovery;
- cambios de idempotencia;
- refactor general del Cajero.

Si Codex detecta necesidad backend, debe detenerse y devolver el bloqueo a ChatGPT.

---

## 19. Riesgos

### R1 — UI y flush divergen

**Alto** si cada uno implementa su propio filtro.

Mitigación:

una sola función pura de subprioridad usada por ambos.

### R2 — fixtures siguen aceptando estados imposibles

**Alto** porque puede producir tests verdes con comportamiento inválido.

Mitigación:

reconstruir fixtures alrededor de invariantes del contrato nuevo.

### R3 — registro local histórico sin `priority_class`

**Bajo/moderado** por el cutover sin sesiones vivas.

Mitigación:

fail-closed, preservar datos, no inferir ni borrar.

### R4 — confusión de copy total vs subset actionable

**Moderado**.

Mitigación:

mantener `review_pending` como total y exponer de forma compacta el número prioritario cuando difiera.

### R5 — renombrado técnico innecesario

**Moderado**.

Mitigación:

cambiar solo copy visible; preservar wire/rutas `daily`.

---

## 20. Resultado del preflight

No existe bloqueo backend.

El contrato desplegado es suficiente.

No se requiere una nueva RPC ni otro cambio de Supabase.

La adaptación frontend puede mantenerse como un delta Nivel B acotado.

Decisiones técnicas recomendadas:

1. tipar y validar `review_queue[].priority_class`;
2. crear una única selección de subprioridad review;
3. reutilizarla en UI, runtime capture y flush;
4. mantener `review_pending` como total;
5. no cambiar idempotencia/prepared operations;
6. añadir política para `SOLOG_NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`;
7. actualizar copy a `Cobertura de ronda` y `Cobertura de turno`;
8. mantener `daily` y `/cajero/diario` como identificadores técnicos;
9. corregir fixtures contractuales antes de evaluar la suite.

## 21. Estado

```text
Backend: DESPLEGADO / CONGELADO
Preflight frontend: COMPLETADO
Bloqueos backend: 0
Contradicciones frontend detectadas: SÍ
Implementación frontend: NO INICIADA
```

Siguiente paso:

congelar el delta frontend y preparar el prompt para que Codex establezca baseline local y produzca un plan técnico. Codex no debe implementar todavía.
