# SOLOG — Backend — Migración Motor Cajero — Reporte Fase 5 V1

**Estado:** VALIDADO TÉCNICAMENTE — CHECKPOINT  
**Fecha:** 30 de septiembre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C  
**Fuente primaria:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Plan:** `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 1. Objetivo

Eliminar la auto-resolución de diferencias por snapshots posteriores y convertir el snapshot posterior en una compuerta de habilitación del reconteo.

## 2. Preflight dirigido

Se identificaron dos rutas de auto-resolución:

1. `inventario.solog_aplicar_snapshot_v3`;
2. `inventario.solog_guardar_lote_cajero_v3` cuando existía un snapshot posterior al momento de guardar.

Forma histórica de casos abiertos antes de migrar:

- Recontar abiertos: 65;
- pares sede/grupo distintos: 65;
- duplicados abiertos por sede/grupo: 0;
- casos abiertos que no fueran el último detalle vigente: 0.

## 3. Migración

Migración:

`20261001041019_solog_motor_v4_snapshot_recount_gate`

Cambios:

### 3.1. Guard de integridad

Creada:

`inventario.solog_guard_recount_resolution_v4()`

Trigger:

`solog_guard_recount_resolution_v4`

Regla:

```text
Recontar
→ estado resuelto
requiere stock_reconteo != null
```

Excepción preservada:

`Recontar → Inválido`

para cambios estructurales de catálogo/grupo.

### 3.2. Aplicación de snapshot

`inventario.solog_aplicar_snapshot_v3`:

- conserva `Recontar`;
- conserva la diferencia original;
- registra `primer_snapshot_posterior_id` solo cuando el grupo tiene stock utilizable en el snapshot;
- actualiza `snapshot_posterior_id` / `stock_posterior` para trazabilidad;
- deja `auto_resueltos = 0`;
- elimina la transición automática a `Coincide`.

### 3.3. Guardado de conteo V3 durante transición

`inventario.solog_guardar_lote_cajero_v3`:

- mantiene `diferencia = 0 → Coincide`;
- mantiene `diferencia != 0 → Recontar`;
- un snapshot posterior ya existente solo registra la referencia;
- no modifica diferencia ni estado por igualdad entre stock posterior y físico;
- requiere snapshot posterior utilizable;
- actualiza `ultima_observacion_fisica_at` para compatibilidad transitoria con el nuevo estado operacional.

## 4. Validación

### Prueba transaccional con rollback

Se utilizó un `Recontar` real con snapshot posterior existente.

Se re-aplicó temporalmente el snapshot dentro de una transacción y se comprobó:

- `estado_diferencia` no cambió;
- `diferencia` no cambió;
- primer snapshot posterior no fue sustituido;
- `auto_resueltos = 0`.

Rollback: OK.

### Guard de resolución

Intento sintético:

```text
Recontar → Coincide
stock_reconteo = null
```

Resultado:

`SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT`

Guard: OK.

### Invalidación estructural

Intento transaccional:

```text
Recontar → Inválido
```

Resultado: permitido.

Rollback: OK.

### Estado real posterior

- Recontar abiertos: 65;
- accionables: 58;
- esperando snapshot posterior: 7;
- terminales Confirmada/Inconsistente sin stock_reconteo: 0;
- usuarios SOLOG activos: 0;
- sesiones activas: 0.

## 5. Helper de snapshot utilizable

`inventario.solog_stock_grupo_snapshot` devuelve NULL cuando falta detalle válido de miembros del grupo.

Por ello, una referencia solo acredita el primer snapshot posterior cuando existe una observación de stock utilizable.

Los snapshots cuyo detalle ya fue purgado por mantenimiento histórico no se reinterpretan. Los casos ya habilitados conservan la referencia almacenada y los casos aún pendientes esperan un snapshot futuro utilizable.

## 6. Estado

Fase 5 cerrada técnicamente.

No se realizó limpieza destructiva de legacy.

Siguiente fase prevista:

**Fase 6 — Cobertura + turnos + prioridad.**
