# SOLOG — Integración — Cajero Prioridades Frontend — Fase 5 Revisión V1

**Estado:** REVISIÓN GLOBAL ESTÁTICA PASS / VALIDACIÓN EJECUTABLE PENDIENTE  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** B — adaptación funcional frontend  
**Rama:** `admin-work`

## 1. Fuente primaria

`docs/SOLOG_Integracion_Cajero_Prioridades_Frontend_Delta_V1.md`

Contrato backend congelado:

`docs/SOLOG_Backend_Contrato_Cajero_V4_Delta_Prioridades_V1.md`

## 2. Alcance revisado

Se revisaron conjuntamente las Fases 1–4:

- tipado y parser de `review_queue[].priority_class`;
- error policy de `Inconsistente`;
- fixtures V4;
- autoridad única de subprioridad Review;
- runtime capture;
- flush/replanificación;
- UI Revisar;
- terminología visible;
- persistencia/recovery;
- compatibilidad legacy fail-closed.

No se realizaron cambios backend.

## 3. Resultado funcional

Prioridad frontend implementada:

```text
coverage
→ review_for_coverage
→ review_regular
→ daily
→ none
```

El frontend continúa consumiendo el wire V4:

```text
coverage | review | daily | none
```

La división `review_for_coverage / review_regular` se obtiene exclusivamente desde
`review_queue[].priority_class`.

## 4. Autoridad única Review

Confirmado:

- `cashierV4CurrentReviewPriority()` resuelve la clase prioritaria;
- `cashierV4ActionableReviewQueue()` filtra el subset ejecutable;
- UI, runtime y flush reutilizan esa autoridad;
- no existe una segunda reconstrucción de prioridad basada en KPI, fecha, posición o cobertura.

El caso legacy sin `priority_class` devuelve `null` y cola accionable vacía.

## 5. Runtime

`runtime.capture('review')` consume únicamente
`selectCashierV4ActionableReviewEntries()`.

Un `review_regular` no puede capturarse mientras exista
`review_for_coverage`.

## 6. Flush

El flush:

1. lee `next_action` backend;
2. si es `review`, obtiene el subset accionable mediante la autoridad compartida;
3. prepara únicamente drafts de esa clase;
4. después de cada `panel_delta`, vuelve a planificar desde el nuevo delivery state;
5. preserva prepared operations, operation_id, payload y timestamps en retry.

Caso de batch cubierto por tests:

```text
501 review_for_coverage
→ 500
→ 1
→ review_regular
```

El orden local de captura no puede adelantar la clase inferior.

## 7. Persistencia y recovery

`priority_class` se conserva en snapshots delivery nuevos.

Para snapshots locales anteriores al delta:

- storage acepta únicamente ausencia de `priority_class` como compatibilidad histórica;
- no rellena ni migra el campo;
- no reescribe el envelope;
- conserva drafts;
- selectors fallan cerrado;
- flush no genera request.

El parser de respuestas backend continúa siendo estricto.

## 8. UI

Revisar muestra únicamente el subset accionable.

Cuando existen ambas subclases:

```text
X prioritarios para completar la ronda · Y pendientes totales
```

`review_pending` continúa representando el total backend.

Terminología visible vigente:

```text
Cobertura de ronda
Cobertura de turno
```

Se conservan por compatibilidad:

```text
daily
daily_queue
daily_pending
/cajero/diario
```

## 9. Regresiones de tests detectadas y corregidas en Fase 5

Se detectaron dos fuentes históricas todavía desactualizadas:

- `tests/cajero-capability-selectors-v4.test.ts`
- `tests/cajero-state-v4.test.ts`

Correcciones:

- `Cobertura quincenal` → `Cobertura de ronda`;
- tests de KPI de cobertura usan explícitamente `next_action=coverage`;
- fixture de tres colas usa estado `coverage`, donde pueden coexistir trabajos inferiores;
- secuencia reducer corregida de `review → coverage → daily → none` a
  `coverage → review → daily → none`.

## 10. Revisión de consumidores

Se revisaron todos los consumidores de `review_queue` dentro de Cajero V4.

Usos restantes de la cola completa son intencionales:

- store: persistencia/propagación autoritativa;
- `selectCashierV4ReviewEntries`: vista total;
- Capture: lookup del detalle de un grupo ya filtrado como actionable;
- finish: impedir cierre mientras exista cualquier draft de review todavía perteneciente a la cola.

Ninguno permite saltar la subprioridad operacional.

## 11. Alcance y cambios paralelos

Durante la implementación existieron commits paralelos relacionados con:

- normalización de tarjeta Stock/Inventario;
- Detalles;
- `operational.css`;
- tests de esas superficies.

Esos cambios se preservaron y no forman parte de este bloque de prioridades.

No se modificó:

- Supabase;
- migraciones;
- RPC;
- Dashboard/Admin;
- lifecycle;
- idempotencia.

## 12. Diff check estático

Se inspeccionaron los patches añadidos desde el baseline del delta.

Se detectó y corrigió un único trailing whitespace en el documento fuente.

Después de la corrección no queda un hallazgo funcional conocido atribuible al bloque.

## 13. Validación ejecutable pendiente

Este entorno no dispone de Bun y el HEAD actual no tiene workflow/check automático asociado.

Por tanto NO se consideran ejecutados todavía:

- tests;
- lint;
- build;
- `git diff --check`.

Validación requerida en entorno local:

```bash
bun test tests/cajero-contract-v4.test.ts \
  tests/cajero-error-policy-v4.test.ts \
  tests/cajero-capability-selectors-v4.test.ts \
  tests/cajero-state-v4.test.ts \
  tests/cajero-queue-mapping-v4.test.ts \
  tests/cajero-runtime-v4.test.ts \
  tests/cajero-flush-drafts-v4.test.ts \
  tests/cajero-drafts-storage-v4.test.ts \
  tests/cajero-recovery-delivery-state-v4.test.ts \
  tests/cajero-navigation-v4.test.ts

bun test tests/cajero-v4.browser.mjs
bun run lint
bun run build
git diff --check
```

Después debe ejecutarse un smoke humano corto.

## 14. Estado

```text
Implementación Fases 1–4: COMPLETA
Revisión global estática: PASS
Regresiones estáticas detectadas: CORREGIDAS
Backend adicional: NO REQUERIDO
Tests ejecutables: PENDIENTES
Lint: PENDIENTE
Build: PENDIENTE
git diff --check real: PENDIENTE
Smoke humano: PENDIENTE
Bloque: NO CERRADO AÚN
```
