# SOLOG — Backend — Motor Prioridades — Fase 1 V1

**Estado:** IMPLEMENTADA Y VALIDADA TÉCNICAMENTE  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — Motor / backend  
**Rama documental:** `admin-work`  
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`

## 1. Fuente primaria

`docs/SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`

Preflight:

`docs/SOLOG_Backend_Motor_Prioridades_Preflight_V1.md`

Esta Fase 1 no cambia todavía el comportamiento público del Cajero.

## 2. Alcance ejecutado

Se implementó únicamente la fundación privada requerida por el delta:

- columna privada `priority_class` en `inventario.solog_session_runtime_groups`;
- constraint de dominio para las clases aprobadas;
- helper de clasificación;
- helper de ranking;
- helper de mapping a acción pública V4;
- helper único de resolución por conteos de clases;
- revocación de `EXECUTE` para `PUBLIC`, `anon` y `authenticated`.

No se modificaron todavía:

- `solog_cashier_group_actions_v4`;
- `solog_cashier_operational_summary_v4`;
- `solog_cashier_panel_state_v4`;
- `solog_enforce_runtime_priority_v4`;
- `solog_assert_normal_count_turn_v4`;
- `rpc_solog_cashier_mutate_v4`;
- frontend Cajero.

## 3. Estado transitorio de `priority_class`

La columna se introdujo como:

`priority_class text NULL`

de forma deliberada.

Motivo:

el `start` V4 desplegado todavía no conoce este campo. Declararlo `NOT NULL` en Fase 1 rompería la creación de nuevas sesiones entre Fase 1 y Fase 2.

Constraint vigente:

`priority_class IS NULL OR priority_class IN (round_coverage, review_for_coverage, review_regular, shift_coverage, none)`

En Fase 2, después de adaptar `start`, se deberá:

1. garantizar que toda fila nueva recibe `priority_class`;
2. validar coherencia con `accion`;
3. añadir constraint de coherencia;
4. ejecutar `SET NOT NULL`.

## 4. Helpers desplegados

### `inventario.solog_priority_classify_v4(action, coverage_complete)`

Mapping:

- `coverage → round_coverage`;
- `recount + coverage_complete=false → review_for_coverage`;
- `recount + coverage_complete=true → review_regular`;
- `daily → shift_coverage`;
- `none → none`.

Entradas inválidas fallan explícitamente.

### `inventario.solog_priority_rank_v4(priority_class)`

Ranking:

- round_coverage = 10;
- review_for_coverage = 20;
- review_regular = 30;
- shift_coverage = 40;
- none = 50.

### `inventario.solog_priority_public_action_v4(priority_class)`

Mapping wire V4:

- round_coverage → coverage;
- review_for_coverage → review;
- review_regular → review;
- shift_coverage → daily;
- none → none.

### `inventario.solog_priority_resolve_v4(...)`

Orden autoritativo:

`round_coverage → review_for_coverage → review_regular → shift_coverage → none`

Rechaza conteos NULL o negativos.

## 5. Seguridad

Los cuatro helpers son:

- `SECURITY INVOKER`;
- `IMMUTABLE`;
- schema interno `inventario`;
- sin `EXECUTE` para `PUBLIC`, `anon` ni `authenticated`.

Esto los alinea con el patrón de helpers internos del Motor V4.

Los advisors no reportaron hallazgos nuevos atribuibles a `solog_priority_*` ni a `priority_class`.

Los avisos existentes del proyecto permanecen fuera del alcance de este delta.

## 6. Validación funcional aislada

Resultado de helpers:

```text
coverage,false          → round_coverage
recount,false           → review_for_coverage
recount,true            → review_regular
daily,true              → shift_coverage
none,true               → none

ranks                  → 10 / 20 / 30 / 40
public actions         → coverage / review / review / daily

resolve(2,3,4,5)       → round_coverage
resolve(0,3,4,5)       → review_for_coverage
resolve(0,0,4,5)       → review_regular
resolve(0,0,0,5)       → shift_coverage
resolve(0,0,0,0)       → none
```

Los guards de entradas inválidas fueron probados y pasaron.

## 7. Regresión V4

Antes y después de Fase 1:

### Cutervo

```text
coverage_total = 488
coverage_counted = 0
coverage_queue_pending = 430
review_pending = 58
next_action = coverage
```

Sin cambio.

### Casuarinas

```text
coverage_total = 488
coverage_counted = 488
review_pending = 37
daily_pending = 34
next_action = review
```

Sin cambio.

Divino, Huaca y Unidad continúan con `next_action=none` en el corte observado.

Por tanto Fase 1 no alteró la conducta pública actual.

## 8. Runtime

Al inicio y al cierre de la fase:

```text
sesiones activo/recovery = 0
runtime rows             = 0
```

No fue necesario migrar sesiones vivas.

## 9. Compatibilidad Supabase

Se revisó el changelog vigente antes de la DDL. Los breaking changes recientes de Postgres/Supabase no afectan esta modificación: no se crean tablas públicas, extensiones, operadores personalizados ni índices de los tipos señalados por el release reciente.

## 10. Migración local

La DDL fue aplicada y validada directamente en Supabase mediante SQL, siguiendo el flujo de iteración backend.

La sincronización del cambio hacia el historial local de migraciones del repositorio queda pendiente de realizar mediante el flujo CLI recomendado (`supabase db pull ... --local --yes`) antes del cierre completo del bloque backend.

No se creó manualmente un filename de migración.

## 11. Cierre

**Fase 1 — CERRADA.**

Resultado:

```text
Fundación privada creada
+ dominio de priority_class preparado
+ helpers autoritativos desplegados
+ permisos internos corregidos
+ regresión pública sin cambios
+ runtime limpio
= FASE 1 VALIDADA
```

La Fase 2 puede comenzar sobre esta base.
