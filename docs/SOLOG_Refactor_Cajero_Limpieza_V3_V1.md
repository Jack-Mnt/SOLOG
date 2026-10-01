# SOLOG — Refactor Cajero — Limpieza V3 V1

**Estado:** CONGELADO — FUENTE PRIMARIA PARA FASE 13.6  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** B — refactor/cleanup estructural frontend  
**Rama:** `admin-work`

---

## 1. Objetivo

Eliminar del repositorio productivo y de la suite activa el runtime Cajero V3 y sus artefactos obsoletos después del cutover validado a Cajero V4.

La fase debe dejar una arquitectura coherente:

```text
Cajero productivo
→ V4

Historial
→ RPC V2 read-only

Route
→ RPC V2
```

La limpieza no cambia reglas funcionales, UX aprobada, contrato backend ni comportamiento operativo V4.

---

## 2. Precedencia

Para cualquier contradicción:

1. `docs/SOLOG_Backend_Contrato_Cajero_V4.md`
2. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
3. `docs/SOLOG_Correccion_Cajero_Runtime_V4_PostCutover_V1.md`
4. `docs/SOLOG_Integracion_Cajero_Recovery_Estado_Operacional_V1.md`
5. `docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`
6. este documento para cleanup/refactor

Este documento no redefine comportamiento funcional.

---

## 3. Baseline confirmado por preflight

El entry productivo actual monta Cajero V4.

No existen consumidores productivos conocidos de:

- `CajeroV3Provider`;
- `useCajeroV3`;
- `rpc_solog_cashier_bootstrap_v3`;
- `rpc_solog_cashier_mutate_v3`.

Los archivos V3 permanecen físicamente únicamente como baseline anterior y dependencias legacy.

---

## 4. Cluster legacy candidato a eliminación

Codex debe verificar referencias reales antes de borrar, pero el cluster esperado incluye:

### Runtime/contrato V3

- `cajero.v3.ts`
- `cajero.v3.api.ts`
- `cajero.v3.context.tsx`
- `cajero.v3.panel.ts`
- `cajero.v3.store.ts`
- `cajero.capability.ts`

### Orquestación/storage V3

- `cajero.session.ts`
- `cajero.flush.ts`
- `cajero.storage.ts`
- `cajero.types.ts`
- `cajero.progress.ts`

### UI V3 reemplazada

- `cajero.tsx`
- `cajero.inicio.tsx`
- `cajero.conteo.tsx`
- `cajero.diario.tsx`
- `cajero.revisar.tsx`
- `cajero.header.tsx`
- `cajero.operativo.tsx`
- `cajero.captura.dialog.tsx`

No borrar un archivo únicamente por su nombre: confirmar primero que no tiene consumidores vigentes.

---

## 5. Módulos compartidos/current que deben preservarse

La implementación V4 todavía consume módulos sin sufijo V4 que son compartidos y vigentes:

- `cajero.calculadora.tsx`
- `cajero.historial.tsx`
- `cajero.history.ts`
- `cajero.stock.ts`
- `cajero.utils.ts`
- `cajero.css`
- `cajero.app.tsx`

También se preserva todo el cluster `cajero.v4.*`.

---

## 6. Desacople necesario antes de borrar tipos V3

### `cajero.stock.ts`

Actualmente mezcla helpers compartidos con un helper V3 que depende de `CashierV3Bootstrap`.

Eliminar únicamente la porción V3 si no tiene consumidores vigentes.

Los helpers usados por V4 deben mantenerse.

### `cajero.calculadora.tsx`

Actualmente toma `CajeroCalculatorKey` desde `cajero.types.ts`.

Mover/definir ese tipo en una ubicación vigente y mínima, preferentemente junto a la lógica compartida que lo consume.

No mantener `cajero.types.ts` solo por un tipo de calculadora.

### `cajero.utils.ts`

Actualmente combina:

- utilidades compartidas todavía usadas por V4;
- utilidades V3/legacy;
- tipos importados desde `cajero.types.ts`.

Mantener únicamente exports con consumidores vigentes o pruebas todavía justificadas.

Los helpers V4/shared conocidos incluyen, entre otros:

- iconografía de categoría;
- expresión/calculadora;
- validación de conteo físico cuando tenga consumidor vigente;
- preview de valorización;
- formateo de moneda/diferencia;
- clases visuales de diferencia usadas por Historial.

No conservar tipos o helpers V3 solo para mantener tests históricos.

---

## 7. Tests

La limpieza debe ser **semántica**, no una eliminación por patrón de nombre.

### Eliminar

Tests cuya única autoridad sea:

- RPC/contrato V3;
- store/provider V3;
- panel delta V3;
- count_queue/cobertura V3;
- storage/flush V3;
- UI V3 reemplazada;
- fixtures V3 sin consumidores.

Ejemplos candidatos:

- `cajero-contract-v3.test.ts`
- `cajero-bootstrap-start-v3.test.ts`
- `cajero-finish-v3.test.ts`
- `cajero-incremental-v3.test.ts`
- `cajero-motor-v3.test.ts`
- `cajero-panel-delta-v3.test.ts`
- `cajero-v3-1.test.ts`
- `cajero-v3.test.ts`
- `cajero-v3.browser.mjs`
- `tests/fixtures/cashier-v3.mjs`

### Revisar antes de decidir

Tests con nombres históricos o de fases pueden contener todavía cobertura útil de módulos compartidos.

Si prueban una conducta todavía usada por V4:

- migrar su dependencia a módulos vigentes;
- renombrar solo si mejora claridad;
- conservar la cobertura relevante.

Si prueban únicamente comportamiento reemplazado, eliminarlos.

No conservar tests que obliguen a mantener código V3 muerto.

---

## 8. Browser tests legacy

Revisar scripts browser históricos del Cajero.

Mantener como smoke autoritativo:

`tests/cajero-v4.browser.mjs`

Los browser tests anteriores pueden eliminarse si su flujo ya está reemplazado y no cubren una superficie compartida exclusiva.

No dejar wrappers que importen un browser test legacy únicamente por compatibilidad histórica.

---

## 9. Fixture V3

`tests/fixtures/cashier-v3.mjs` debe desaparecer cuando el último consumidor V3 haya sido eliminado.

No migrar datos V3 a fixtures V4 salvo que un caso funcional vigente necesite realmente esa cobertura.

---

## 10. CSS

No hacer una limpieza general de `cajero.css`.

Solo pueden retirarse selectores cuando Codex demuestre que pertenecen exclusivamente a componentes V3 eliminados y que el smoke V4 no los usa.

Ante duda, conservar el selector para una limpieza visual posterior.

---

## 11. Criterio de cero referencias

Al terminar, el código productivo y tests vigentes no deben contener dependencias runtime de:

- `CashierV3`;
- `CajeroV3Provider`;
- `useCajeroV3`;
- `cajero.v3.*`;
- `cajero.session`;
- `cajero.flush` V3;
- `cajero.storage` V3;
- `cajero.types` V3;
- `cajero.progress`;
- `cashier-v3.mjs`;
- `rpc_solog_cashier_bootstrap_v3`;
- `rpc_solog_cashier_mutate_v3`.

Las apariciones en documentación histórica no obligan a modificarse.

---

## 12. Invariantes

La limpieza debe conservar:

1. runtime Cajero V4;
2. start persistente;
3. recovery + active aislados;
4. prepared operations/idempotencia;
5. logout seguro;
6. residues `finished` no bloqueantes;
7. queues y `next_action` autoritativos;
8. Historial V2;
9. Route V2;
10. UI/UX productiva validada en 13.5/13.5A.

No reinterpretar el motor durante cleanup.

---

## 13. Estrategia de implementación

Orden recomendado:

1. establecer baseline y mapa de referencias;
2. desacoplar módulos compartidos de tipos V3;
3. eliminar cluster runtime/UI V3;
4. eliminar o migrar tests legacy;
5. eliminar fixture/browser wrappers V3;
6. revisar imports/exports muertos resultantes;
7. ejecutar búsquedas de cero referencias;
8. validar suite completa y browser smoke V4;
9. revisar diff global.

No realizar refactors generales no necesarios para conseguir el cleanup.

---

## 14. Gate de cierre 13.6

Debe cumplirse todo:

- build sin V3;
- lint sin V3;
- tests V4 completos;
- suite global en verde;
- browser smoke V4 en verde;
- `git diff --check` limpio;
- cero consumidores productivos V3;
- cero tests activos que dependan del runtime V3;
- módulos compartidos vigentes sin imports hacia `cajero.v3*` ni `cajero.types.ts` legacy;
- backend/Supabase sin cambios.

Después de 13.6 corresponde la validación global de la migración antes del smoke real.
