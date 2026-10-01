# SOLOG — Backend — Migración Motor Cajero — Reporte Fase 9 V1

**Estado:** VALIDADO TÉCNICAMENTE — GATE PRE-LIMPIEZA  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C  
**Fuente primaria:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Plan:** `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 1. Objetivo

Realizar una validación backend global antes de ejecutar la limpieza destructiva de Fase 10.

La Fase 9 no elimina todavía tablas, columnas, RPC ni cron legacy.

## 2. Estado real previo/posterior

Después de todas las pruebas transaccionales:

- usuarios SOLOG activos: 0;
- sesiones active: 0;
- sesiones recovery: 0;
- sesiones finalizadas: 54;
- sesiones expiradas: 13;
- snapshots: 44;
- snapshot_stock persistente: 0;
- conteos: 67;
- conteo_detalle: 914;
- estado_stock_grupo: 976;
- runtime V4: 0;
- solog_session_groups legacy: 32562;
- solog_daily_coverage_base: 13;
- solog_daily_coverage_groups: 6326;
- solog_shift_coverage: 7.

Reconteos abiertos preservados:

- total: 65;
- accionables: 58;
- esperando snapshot: 7.

Integridad:

- detalles sin conteo: 0;
- detalles sin grupo: 0;
- referencias de snapshot huérfanas: 0;
- discrepancias `ultimo_conteo_at` vs histórico: 0;
- discrepancias `ultima_observacion_fisica_at` vs histórico: 0.

## 3. Octubre / doble cobertura

Validación real a `2026-10-01 00:01 America/Lima`:

### Casuarinas

- ronda: 1;
- cobertura: 0/488;
- review accionable: 0;
- coverage queue: 481;
- waiting snapshot: 7;
- next_action: `coverage`.

### Cutervo

- ronda: 1;
- cobertura: 0/488;
- review accionable: 58;
- coverage queue: 430;
- next_action: `review`.

Octubre nace directamente bajo Cobertura quincenal 1 y no hereda cobertura de septiembre.

## 4. Temporalidad

Se validaron límites exactos en `America/Lima`:

- 00:00 → early;
- 07:29:59 → early;
- 07:30 → day;
- 15:29:59 → day;
- 15:30 → night;
- 07/10 23:59:59 → Ronda 1;
- 08/10 00:00 → Ronda 2;
- 16/10 → nueva quincena, Ronda 1;
- 24/10 → Ronda 2 para 16–31;
- 22/02/2027 → Ronda 2 para 16–28.

Prueba transaccional R1 → R2:

- R1 100% antes del corte;
- R2 0% inmediatamente después;
- sin reset masivo de filas;
- cobertura derivada por timestamp.

Resultado: OK.

## 5. Diferencias / snapshot posterior / reconteos

Se ejecutó un flujo E2E con RPC V4 y rollback:

```text
start
→ coverage
→ save_batch con diferencia != 0
→ Recontar sin snapshot posterior
→ snapshot posterior confirmado y utilizable
→ sigue Recontar
→ primer_snapshot_posterior_id registrado
→ mismo conteo intenta recontar
→ bloqueado
→ finish
→ nueva sesión
→ review
→ recount_save_batch
```

Validaciones:

- diferencia no cero → `Recontar`;
- sin posterior → no accionable;
- posterior utilizable → habilita;
- posterior no auto-resuelve;
- reconteo misma sesión → `SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN`;
- sesión posterior → permitido.

Resoluciones verificadas en un mismo batch:

### Coincide

`dr = 0`

Resultado:

- estado: `Coincide`;
- diferencia final: 0.

### Confirmada

`d0` y `dr` mismo signo.

Resultado:

- estado: `Confirmada`;
- signo preservado;
- magnitud final <= magnitud original.

### Inconsistente

`d0` y `dr` con signos incompatibles.

Resultado:

- estado: `Inconsistente`;
- diferencia final = `dr`.

## 6. Observación física y turno

Se verificó que el reconteo:

- actualiza `ultima_observacion_fisica_at`;
- no modifica `ultimo_conteo_at`.

Por tanto:

- acredita cobertura;
- no consume el cupo normal del turno.

Guard de turno revalidado:

- segundo conteo normal del mismo grupo/sede/turno → bloqueado;
- turno posterior → permitido.

Resultado: OK.

## 7. Recovery y concurrencia

Revalidación independiente:

```text
activo → recovery
```

A partir de `expira_at`:

- `capture_allowed = false`;
- `pending_delivery_allowed = true`;
- runtime se conserva.

Se verificó:

```text
1 active + 1 recovery
```

en la misma sede.

Delivery válido:

```text
observed_at < expira_at
delivery_at > expira_at
```

Resultado: permitido dentro de recovery.

Al finalizar recovery:

- `recovery → expirado`;
- runtime eliminado.

Resultado: OK.

## 8. Guards contractuales

### Autenticación / mantenimiento

- sin `auth.uid()` → `SOLOG_AUTH_REQUIRED`;
- cajero con `activo=false` → `SOLOG_USER_DISABLED`.

### Batch

501 items:

`SOLOG_INVALID_BATCH_PAYLOAD`

### Revisión congelada

`expected_groups_revision` incorrecta:

`SOLOG_GROUPS_REVISION_CONFLICT`

### Aislamiento

Cajero intentando mutar sesión de otra sede:

`SOLOG_SESSION_NOT_FOUND`

### Idempotencia

Ya validado E2E en Fase 8:

- mismo operation_id + mismo payload → replay;
- mismo operation_id + payload distinto → conflicto;
- sin duplicación de detalle.

## 9. Seguridad

RPC públicas V4:

```text
rpc_solog_cashier_bootstrap_v4
rpc_solog_cashier_mutate_v4
```

Permisos:

- anon: no EXECUTE;
- PUBLIC: no EXECUTE;
- authenticated: EXECUTE.

Además:

- schema `inventario` no concede USAGE a anon/authenticated/PUBLIC;
- runtime V4 no concede SELECT/INSERT/UPDATE/DELETE directo a anon/authenticated;
- helpers internos V4 quedaron con EXECUTE revocado para anon/authenticated/PUBLIC.

Se ejecutaron advisors de seguridad y rendimiento. La herramienta no devolvió hallazgos nuevos atribuibles al Motor V4.

## 10. Hallazgo y corrección durante Fase 9

Se detectó una incompatibilidad en:

`inventario.trg_conteo_detalle_snapshot_valorizacion()`

Problema:

el trigger consultaba primero `solog_session_groups`; en sesiones V4 no existía fila legacy, por lo que podía caer al catálogo vivo y reemplazar metadata congelada de la sesión.

Esto violaba el contrato:

> cambios de catálogo posteriores a start no deben reescribir el runtime activo.

Corrección aplicada:

```text
1. solog_session_runtime_groups
2. solog_session_groups legacy
3. catálogo vivo como último fallback
```

Prueba transaccional:

- runtime congela nombre original;
- catálogo vivo cambia temporalmente;
- se inserta detalle;
- detalle conserva metadata congelada V4.

Resultado: OK.

## 11. Independencia del contrato V4

Se inspeccionaron:

- `rpc_solog_cashier_bootstrap_v4`;
- `rpc_solog_cashier_mutate_v4`;
- panel/delta V4;
- actions/summary V4;
- lifecycle V4.

Resultado:

- referencias a `cobertura_periodo*`: 0;
- referencias a `solog_session_groups`: 0;
- referencias a `solog_daily_coverage_*`: 0;
- referencias a `solog_shift_coverage`: 0.

Por tanto el Motor/Cajero V4 puede sobrevivir a la limpieza legacy.

## 12. Inventario de legacy para Fase 10

### Columnas `cobertura_periodo*`

Todavía las consumen:

- `conexion_admin_catalog`;
- `solog_aplicar_snapshot_v3`;
- `solog_cashier_pre_session_state`;
- `solog_cashier_pre_session_summary_v3`;
- `solog_cashier_session_kpis_v3`;
- `solog_cashier_session_state`;
- `solog_catalog_refresh_operational_groups_v3`;
- `solog_cobertura`;
- `solog_groups_refresh_operational_v1`;
- `solog_guardar_lote_cajero_v3`;
- `solog_legacy_coverage_invalidation_bridge_v4`;
- `solog_session_group_sync_coverage_v4`;
- `rpc_solog_cashier_mutate_v2`;
- `rpc_solog_cashier_mutate_v3`;
- `rpc_solog_details_v2`;
- `rpc_solog_operational_v2`.

### `solog_session_groups`

Todavía lo consumen:

- `solog_cashier_session_kpis_v3`;
- `solog_cashier_session_state`;
- `trg_conteo_detalle_snapshot_valorizacion` como fallback transitorio;
- Cajero V2/V3.

### Daily / shift legacy

Consumidores:

- `solog_ensure_daily_coverage_base`;
- `solog_capture_shift_coverage`;
- `solog_run_shift_cut`;
- `rpc_solog_operational_v2`.

Cron:

- `conexion_cleanup_snapshot_stock` → activo, independiente y debe conservarse;
- `solog_shift_early` → inactivo;
- `solog_shift_day` → inactivo;
- `solog_shift_night` → inactivo.

## 13. Adaptaciones necesarias antes de DROP

No deben borrarse sin sustitución:

### `solog_aplicar_snapshot_v3`

Debe reescribirse para operar sin `cobertura_periodo*`.

La ronda se deriva por `ultima_observacion_fisica_at`; no requiere reset quincenal.

### Refresh de catálogo/grupos

Deben sustituir invalidación legacy por semántica V4 explícita, incluida `ultima_observacion_fisica_at` cuando un cambio estructural invalide la observación previa.

### `conexion_admin_catalog`

Debe conservar su responsabilidad de publicación de catálogo, pero dejar de escribir columnas de cobertura legacy.

### Trigger de valorización

Ya soporta runtime V4. En Fase 10 se elimina únicamente el fallback a `solog_session_groups`.

## 14. Índices redundantes detectados

En `conteo_detalle`:

```text
idx_conteo_detalle_group_counted_v4
idx_conteo_detalle_grupo_contado
```

son equivalentes.

En Fase 10 debe quedar uno solo.

También existe redundancia previa en `instalaciones(sede_id)`, fuera del alcance directo del Motor; no bloquea este bloque.

## 15. Criterios de aceptación

Estado al terminar Fase 9:

- criterios 1–17: validados;
- criterio 18: pendiente por diseño, se ejecuta en Fase 10;
- criterio 19: validado, 0 sesiones activas;
- criterio 20: validado, histórico y relaciones preservadas.

## 16. Gate

**Fase 9: APROBADA TÉCNICAMENTE.**

El backend está listo para ejecutar la limpieza destructiva controlada de Fase 10.

Condición de seguridad externa:

el backup local ZIP de Fase 0 debe seguir disponible. Su existencia física no puede verificarse desde este entorno y se mantiene bajo la confirmación del usuario.

Siguiente fase:

**Fase 10 — Limpieza destructiva de legacy.**
