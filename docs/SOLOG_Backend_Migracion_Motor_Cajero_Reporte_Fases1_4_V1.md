# SOLOG — Backend — Migración Motor Cajero — Reporte Fases 1 a 4 V1

**Estado:** VALIDADO TÉCNICAMENTE — CHECKPOINT  
**Fecha:** 30 de septiembre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C  
**Fuente primaria:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Plan:** `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 1. Fase 0 — Backup + baseline

- Plan congelado.
- Baseline registrado en repositorio.
- El usuario confirmó la continuación posterior al procedimiento de backup local.
- El archivo ZIP permanece fuera del repositorio.
- La existencia física y checksum del ZIP no son verificables desde este entorno y se consideran confirmados por el usuario.

## 2. Fase 1 — Mantenimiento SOLOG

Estado previo:

- admin activos: 1
- moderador activos: 1
- cajeros activos: 5
- sesiones activas: 0

Acción:

- los 7 usuarios SOLOG fueron establecidos en `activo=false`.

Verificación:

- usuarios SOLOG activos: 0
- sesiones activas: 0

## 3. Fase 2 — Foundation temporal

Migración:

`20261001040048_solog_motor_v4_temporal_foundation`

Cambios principales:

- creada `inventario.solog_temporal_context(timestamptz)`;
- `solog_sesion_expira_at` limita la captura a la menor fecha entre +1 h 59 min y medianoche Lima;
- añadido `estado_stock_grupo.ultima_observacion_fisica_at`;
- añadidos a `conteos`: ronda, límites de ronda, turno y límites de turno;
- `conteos.estado` admite `recovery`;
- constraints temporales e índices runtime añadidos.

Casos verificados:

- 01/10 00:00 Lima → Ronda 1, early;
- 07/10 23:59:59 → Ronda 1, night;
- 08/10 00:00 → Ronda 2, early;
- 16/10 → nueva quincena, Ronda 1;
- 24/10 → Ronda 2 para quincena 16–31;
- 22/02/2027 → Ronda 2 para quincena 16–28;
- expiración de captura a 22:30 Lima → 00:00;
- 67 sesiones históricas conservan nuevo basis temporal en null y continúan válidas.

## 4. Fase 3 — Runtime de sesión nuevo

Migración:

`20261001040150_solog_motor_v4_session_runtime`

Creada:

`inventario.solog_session_runtime_groups`

Acción operacional única:

- `recount`
- `coverage`
- `daily`
- `none`

Se incluyeron constraints, índices y limpieza automática del runtime cuando una sesión pasa a:

- `finalizado`;
- `expirado`.

Validaciones:

- runtime inicial: 0 filas;
- prueba sintética de lifecycle: OK;
- al expirar sesión sintética, runtime eliminado: OK;
- reconteos cross-site históricos: 0;
- reconteos abiertos preservados: 65.

## 5. Fase 4 — Backfill de datos reales

Migración:

`20261001040308_solog_motor_v4_backfill_observation_state`

Fuente de reconstrucción:

`inventario.conteo_detalle` + `inventario.conteos`.

Resultados:

- filas `estado_stock_grupo`: 976;
- grupos con historial físico: 496;
- `ultimo_conteo_at` ya coincidía con historial: 0 discrepancias previas;
- `ultima_observacion_fisica_at` poblada: 496;
- discrepancias posteriores de `ultimo_conteo_at`: 0;
- discrepancias posteriores de `ultima_observacion_fisica_at`: 0;
- octubre Ronda 1 ya cubiertos: 0.

Histórico preservado:

- snapshots: 44;
- conteos: 67;
- conteo_detalle: 914;
- solog_session_groups legacy: 32562 (todavía no eliminada).

Reconteos abiertos preservados:

- total: 65;
- accionables: 58;
- esperando snapshot posterior: 7.

## 6. Estado

Fases 1, 2, 3 y 4 cerradas técnicamente.

Todavía no se ha ejecutado limpieza destructiva de legacy.

El siguiente bloque previsto es Fase 5 — Motor de snapshots y diferencias.
