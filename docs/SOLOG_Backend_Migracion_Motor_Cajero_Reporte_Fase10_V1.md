# SOLOG — Backend — Migración Motor Cajero — Reporte Fase 10 V1

**Estado:** CERRADA — LIMPIEZA LEGACY VALIDADA  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C  
**Fuente primaria:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Plan:** `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 1. Objetivo

Eliminar físicamente el modelo legacy sustituido por el Motor/Cajero V4, después de adaptar y validar las responsabilidades backend que seguían siendo vigentes.

## 2. Sustituciones realizadas antes del DROP

Se crearon:

- `inventario.solog_aplicar_snapshot_v4(uuid)`;
- `inventario.solog_catalog_refresh_operational_groups_v4(uuid[], uuid[])`;
- `inventario.solog_groups_refresh_operational_v4(uuid[])`.

Se adaptaron:

- `inventario.solog_evaluar_snapshot`;
- `inventario.conexion_admin_catalog`;
- `inventario.solog_admin_groups_mutate_v1`;
- `inventario.trg_conteo_detalle_snapshot_valorizacion`.

### Snapshot V4

`solog_aplicar_snapshot_v4`:

- actualiza stock y snapshot operacional;
- conserva `ultima_observacion_fisica_at` ante un snapshot ordinario;
- invalida observación física únicamente ante cambios estructurales/gating;
- mantiene `Cambio_reciente`;
- registra snapshot posterior utilizable;
- no auto-resuelve `Recontar`.

`solog_evaluar_snapshot` dejó de crear métricas diarias legacy y consume ahora `solog_aplicar_snapshot_v4`.

### Refresh de catálogo/grupos V4

Los refresh estructurales:

- invalidan `Recontar` afectados como `Inválido`;
- invalidan `ultima_observacion_fisica_at`;
- utilizan `requiere_snapshot_completo` como gate;
- actualizan estado operacional sin columnas de cobertura legacy;
- bump de revisión operacional conservado.

### Metadata congelada

`trg_conteo_detalle_snapshot_valorizacion` usa:

```text
solog_session_runtime_groups
→ catálogo vivo como fallback
```

Se eliminó el fallback a `solog_session_groups`.

## 3. Gate previo al DROP

Antes de eliminar columnas/tablas se validó con transacciones + rollback:

- snapshot V4 aplica correctamente;
- `solog_evaluar_snapshot` enruta a V4;
- snapshot ordinario no borra observación física;
- no existe auto-resolución;
- refresh de grupo V4 invalida observación estructural;
- refresh de catálogo V4 ejecuta correctamente.

Durante esta validación se detectó que `cobertura_periodo_desde` seguía siendo `NOT NULL`.

Se realizó el paso transitorio mínimo:

- retirar `NOT NULL` de `cobertura_periodo`;
- retirar `NOT NULL` de `cobertura_periodo_desde`.

Los datos legacy permanecieron intactos hasta el DROP definitivo.

## 4. Limpieza destructiva

La limpieza se ejecutó dentro de una única transacción.

### 4.1. Cron retirado

Eliminados:

- `solog_shift_early`;
- `solog_shift_day`;
- `solog_shift_night`.

Conservado:

- `conexion_cleanup_snapshot_stock` — activo.

### 4.2. RPC públicas retiradas

Eliminadas:

- `public.rpc_solog_cashier_bootstrap_v2`;
- `public.rpc_solog_cashier_bootstrap_v3`;
- `public.rpc_solog_cashier_mutate_v2`;
- `public.rpc_solog_cashier_mutate_v3`;
- `public.rpc_solog_details_v2`;
- `public.rpc_solog_operational_v2`.

### 4.3. Helpers legacy retirados

Eliminados, entre otros:

- `solog_cashier_panel_state_v3`;
- `solog_cashier_pre_session_state`;
- `solog_cashier_pre_session_summary_v3`;
- `solog_cashier_session_capability_v3`;
- `solog_cashier_session_kpis_v3`;
- `solog_cashier_session_state`;
- `solog_guardar_lote_cajero_v3`;
- `solog_cobertura`;
- `solog_capture_shift_coverage`;
- `solog_ensure_daily_coverage_base`;
- `solog_run_shift_cut`;
- `solog_aplicar_snapshot_v3`;
- `solog_catalog_refresh_operational_groups_v3`;
- `solog_groups_refresh_operational_v1`;
- bridges/triggers transitorios de cobertura.

### 4.4. Tablas eliminadas

Eliminadas:

- `inventario.solog_session_groups`;
- `inventario.solog_daily_coverage_base`;
- `inventario.solog_daily_coverage_groups`;
- `inventario.solog_shift_coverage`.

### 4.5. Columnas eliminadas

Eliminadas de `inventario.estado_stock_grupo`:

- `cobertura_periodo`;
- `cobertura_periodo_desde`.

Modelo vigente final:

- `sede_id`;
- `grupo_conteo_id`;
- `stock_actual`;
- `snapshot_id`;
- `estado`;
- `ultimo_conteo_at`;
- `ultimo_conteo_detalle_id`;
- `activo`;
- `updated_at`;
- `requiere_snapshot_completo`;
- `ultima_observacion_fisica_at`.

### 4.6. Índice duplicado

Se eliminó:

`idx_conteo_detalle_group_counted_v4`

Se conserva:

`idx_conteo_detalle_grupo_contado(grupo_conteo_id, contado_at DESC)`.

## 5. Validaciones post-limpieza

### Ausencia física de legacy

- tablas legacy restantes: 0;
- columnas legacy restantes: 0;
- RPC Cajero V2/V3 restantes: 0;
- referencias textuales backend a `cobertura_periodo*`: 0;
- referencias a `solog_session_groups`: 0;
- referencias a daily coverage legacy: 0;
- referencias a shift coverage legacy: 0.

### Smoke snapshot

Prueba sintética mínima con rollback:

- snapshot V4 sin columnas legacy: OK;
- grupos actualizados: OK;
- auto-resolución: 0.

### Smoke runtime

Prueba sintética mínima con rollback:

- sesión V4;
- runtime V4;
- cambio temporal del catálogo vivo;
- insert de `conteo_detalle`;
- metadata congelada preservada.

Resultado: OK.

## 6. Integridad histórica posterior

Estado real:

- snapshots: 44;
- conteos: 67;
- conteo_detalle: 914;
- estado_stock_grupo: 976;
- runtime V4: 0;
- sesiones active: 0;
- sesiones recovery: 0;
- usuarios SOLOG activos: 0.

Reconteos:

- abiertos: 65;
- accionables: 58;
- esperando snapshot: 7.

Integridad:

- detalles sin conteo: 0;
- detalles sin grupo: 0;
- referencias de snapshot huérfanas: 0;
- discrepancias `ultimo_conteo_at`: 0;
- discrepancias `ultima_observacion_fisica_at`: 0.

## 7. Seguridad

RPC Cajero vigentes:

- `public.rpc_solog_cashier_bootstrap_v4`;
- `public.rpc_solog_cashier_mutate_v4`.

ACL:

- anon: no EXECUTE;
- PUBLIC: no EXECUTE;
- authenticated: EXECUTE.

Las RPC son `SECURITY DEFINER` de forma deliberada y validan internamente:

- `auth.uid()`;
- usuario activo;
- rol cajero;
- sede;
- dispositivo autorizado;
- ownership de sesión.

El advisor de Supabase las marca genéricamente por ser funciones `SECURITY DEFINER` ejecutables por `authenticated`; este acceso es intencional para la API Cajero V4.

Otros hallazgos de seguridad reportados corresponden a superficies preexistentes fuera de este bloque.

## 8. Performance

El advisor detectó inicialmente dos FK sin índice en `solog_session_runtime_groups`:

- `grupo_conteo_id`;
- `categoria_id`.

Se añadieron:

- `idx_solog_session_runtime_group_fk_v4`;
- `idx_solog_session_runtime_category_fk_v4`.

Revalidación:

los dos hallazgos desaparecieron del advisor.

Los hallazgos restantes pertenecen a tablas/políticas preexistentes fuera de este bloque.

## 9. Criterio de aceptación 18

El criterio:

> columnas/tablas/RPC legacy retiradas no tienen consumidores vigentes

queda validado a nivel backend:

- objetos retirados físicamente;
- 0 referencias backend restantes;
- Motor/Cajero V4 independiente del modelo eliminado.

El frontend actual todavía debe migrarse al contrato V4 en las fases posteriores del plan; SOLOG continúa en mantenimiento, por lo que no existe consumidor operativo habilitado contra el contrato antiguo.

## 10. Estado

**Fase 10 cerrada.**

El backend quedó libre del modelo de cobertura/runtime anterior.

Siguiente fase del plan:

**Fase 11 — congelar el contrato backend realmente desplegado.**
