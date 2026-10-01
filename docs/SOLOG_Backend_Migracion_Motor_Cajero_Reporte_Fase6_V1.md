# SOLOG — Backend — Migración Motor Cajero — Reporte Fase 6 V1

**Estado:** VALIDADO TÉCNICAMENTE — CHECKPOINT  
**Fecha:** 30 de septiembre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C  
**Fuente primaria:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Plan:** `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 1. Objetivo

Implementar en backend la lógica autoritativa de:

- cobertura quincenal por ronda;
- máximo un conteo normal por turno;
- reconteo como observación física válida;
- prioridad global `review → coverage → daily`;
- invalidación transitoria de cobertura legacy mientras aún existe el modelo anterior.

## 2. Migraciones

### 2.1. Motor principal

`20261001050316_solog_motor_v4_coverage_turn_priority`

### 2.2. Corrección de semántica NULL

`20261001050418_solog_motor_v4_group_actions_null_semantics`

Durante la primera validación se detectó que grupos sin historial previo producían `NULL` en los booleanos temporales. Se corrigió para que ausencia de timestamp signifique:

- no cubierto;
- no contado en el turno.

## 3. Nuevos componentes internos

### 3.1. Acciones por grupo

`inventario.solog_cashier_group_actions_v4(sede, at)`

Deriva por grupo:

- cobertura de la ronda;
- conteo normal consumido en el turno;
- reconteo pendiente;
- reconteo accionable;
- acción congelable:

```text
recount
coverage
daily
none
```

Precedencia por grupo:

```text
recount accionable
→ recount

recount no accionable
→ none

no cubierto + turno normal disponible
→ coverage

cubierto + Cambio_reciente + turno normal disponible
→ daily

resto
→ none
```

### 3.2. Resumen operacional

`inventario.solog_cashier_operational_summary_v4(sede, at)`

Expone internamente:

- período;
- ronda;
- turno;
- cobertura total/contada/pendiente;
- review pending;
- coverage queue pending;
- daily pending;
- cobertura bloqueada esperando snapshot;
- `next_action`.

Prioridad:

```text
review
→ coverage
→ daily
→ none
```

`daily` solo puede ser `next_action` cuando la cobertura de la ronda está completa.

## 4. Invariante de turno

Creado:

`inventario.solog_assert_normal_count_turn_v4()`

Trigger:

`solog_assert_normal_count_turn_v4`

Regla:

> un grupo no puede recibir dos inserciones de conteo normal dentro del mismo turno operativo y sede.

La verificación utiliza el timestamp real `contado_at` y la ventana autoritativa del turno, por lo que las entregas tardías no dependen del orden de llegada al servidor.

Índice añadido:

`idx_conteo_detalle_group_counted_v4`

## 5. Sincronización de observación física

Creado:

`inventario.solog_sync_physical_observation_v4()`

Triggers:

- `solog_sync_physical_observation_insert_v4`;
- `solog_sync_physical_observation_recount_v4`.

Conteo normal:

- actualiza `ultimo_conteo_at`;
- actualiza `ultima_observacion_fisica_at`;
- actualiza el último detalle normal solo si la observación es temporalmente más reciente.

Reconteo:

- actualiza `ultima_observacion_fisica_at`;
- no modifica `ultimo_conteo_at`.

Esto permite que el reconteo cubra una ronda sin consumir el cupo normal del turno.

## 6. Puente transitorio de invalidación legacy

Creado:

`inventario.solog_legacy_coverage_invalidation_bridge_v4()`

Mientras las columnas legacy existan, invalida `ultima_observacion_fisica_at` ante:

- activación/desactivación de grupo;
- entrada a `requiere_snapshot_completo`;
- invalidación de cobertura dentro del mismo período por lógica estructural legacy.

Este bridge es transitorio y deberá retirarse en la limpieza de Fase 10 junto con las columnas legacy.

## 7. Validación con datos reales

### 7.1. Estado inicial de octubre

A `2026-10-01 00:01 America/Lima`:

#### Cutervo

- cobertura: 0/488;
- review accionable: 58;
- coverage queue: 430;
- `next_action = review`.

Esto valida que `Revisar` prevalece incluso con cobertura incompleta.

#### Casuarinas

- cobertura: 0/488;
- review accionable: 0;
- esperando snapshot: 7;
- coverage queue: 481;
- `next_action = coverage`.

Esto valida que los reconteos no accionables no reciben conteo normal y que el resto de grupos pendientes sí entra a cobertura.

### 7.2. Prioridad daily

Prueba sintética transaccional con rollback:

- cobertura R1 = 100%;
- review accionable = 0;
- grupos `Cambio_reciente` disponibles;
- resultado: `next_action = daily`.

Resultado: OK.

### 7.3. Cambio R1 → R2

Prueba transaccional:

- todos los grupos observados dentro de R1;
- R1 antes del límite: 100%;
- al comenzar R2: `coverage_counted = 0`;
- ninguna observación R1 preacredita R2.

Resultado: OK.

### 7.4. Máximo un conteo normal por turno

Prueba transaccional:

- primer conteo en turno `day`: permitido;
- segundo conteo del mismo grupo/sede dentro de `day`: bloqueado con `SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT`;
- nuevo conteo en turno `night`: permitido.

Rollback: OK.

### 7.5. Reconteo como cobertura

Prueba transaccional sobre un reconteo real:

- `recontado_at` dentro de R1 actualiza `ultima_observacion_fisica_at`;
- el grupo queda cubierto en R1;
- `ultimo_conteo_at` no cambia.

Resultado: OK.

### 7.6. Invalidación estructural

Prueba transaccional del bridge legacy:

- cobertura vigente;
- invalidación estructural dentro del mismo período;
- `ultima_observacion_fisica_at → NULL`.

Resultado: OK.

## 8. Histórico previo

Se detectaron 26 combinaciones históricas sede/grupo/turno con más de un conteo normal; máximo 3 conteos.

No se modificaron porque pertenecen a la lógica anterior.

Verificación:

- último duplicado histórico: 21 de septiembre de 2026;
- duplicados desde el cutover del 1 de octubre: 0.

El nuevo guard impide repetir ese comportamiento en el Motor nuevo.

## 9. Estado real posterior

- usuarios SOLOG activos: 0;
- sesiones activas: 0;
- runtime V4: 0 filas;
- Recontar abiertos: 65;
- accionables: 58;
- esperando snapshot: 7;
- snapshots: 44;
- conteos: 67;
- conteo_detalle: 914;
- estado_stock_grupo: 976;
- `solog_session_groups` legacy: 32562, todavía preservada.

No se ejecutó limpieza destructiva.

## 10. Estado

Fase 6 cerrada técnicamente.

Siguiente fase:

**Fase 7 — Sesiones active/recovery.**
