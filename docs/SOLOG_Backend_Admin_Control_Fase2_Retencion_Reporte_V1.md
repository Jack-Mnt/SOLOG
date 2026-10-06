# SOLOG — Backend Admin Control — Fase 2 Retención — Reporte V1

**Estado:** COMPLETADA / DESPLEGADA / VALIDADA TÉCNICAMENTE  
**Fecha:** 6 de octubre de 2026  
**Proyecto:** SOLOG  
**Clasificación:** Nivel C — backend / retención técnica  
**Rama:** `admin-work`

## 1. Fuente primaria

Permanece como fuente primaria:

`docs/SOLOG_Backend_Admin_Control_Contrato_V1.md`

Este reporte documenta evidencia de implementación. No redefine el contrato.

## 2. Cambios desplegados

### 2.1. Incidencias

`public.rpc_solog_admin_incidents_v2`, acción `propose_delete`, dejó de depender de `inventario.snapshot_stock` para validar que un `producto_ausente` siga vigente.

La comprobación utiliza ahora:

- `inventario.stock_actual.sede_id`;
- `c_interno`;
- `snapshot_id = incidencia.ultimo_snapshot_id`;
- `producto_eliminado = true`;
- snapshot confirmado;
- ausencia de un snapshot confirmado más nuevo.

El resto del contrato V2 permanece intacto.

Validación previa al cambio:

- incidencias activas `producto_ausente`: 118;
- reconocidas por el método antiguo basado en `snapshot_stock`: 100;
- reconocidas por `stock_actual`: 118.

Después del cleanup de snapshots, las 118 continúan reconocidas por `stock_actual`.

## 3. snapshot_stock

`inventario.cleanup_snapshot_stock()` usa ahora:

```text
capturado_at < now() - interval '12 hours'
```

El job:

```text
conexion_cleanup_snapshot_stock
```

se ejecuta:

```cron
30 8,20 * * *
```

Equivalente en Lima:

- 03:30;
- 15:30.

Retención efectiva aproximada: 12–24 horas.

Ejecución de validación:

- antes: 1,940 filas;
- elegibles >12 h: 970;
- después: 970 filas;
- filas >12 h restantes: 0.

Los consumidores restantes de `snapshot_stock` son únicamente:

- `rpc_conexion_sync_snapshot_strict_v2`;
- `inventario.solog_aplicar_snapshot_v4`;
- `inventario.solog_stock_grupo_snapshot`;
- el propio cleanup.

No quedan referencias desde Incidencias.

## 4. solog_operaciones

Se creó:

`inventario.cleanup_solog_operaciones()`

Regla:

```text
created_at < now() - interval '3 days'
```

Job:

```text
solog_cleanup_operations
```

Schedule:

```cron
0 9 * * *
```

Equivalente a 04:00 Lima.

La tabla ya disponía de:

`idx_solog_operaciones_created_at`

No se creó un índice nuevo.

Ejecución de validación:

- antes: 477 filas;
- >3 días: 463;
- <=3 días: 14;
- después: 14 filas;
- >3 días restantes: 0.

No existían operaciones incompletas >3 días.

## 5. Seguridad

ACL final:

### Cleanups internos

```text
postgres únicamente
```

Sin EXECUTE para:

- PUBLIC;
- anon;
- authenticated.

### rpc_solog_admin_incidents_v2

Se conserva la ACL previa:

- postgres;
- authenticated;
- service_role.

Continúa siendo `SECURITY DEFINER` con `search_path=''` y validación interna de auth/rol/sede.

El advisor muestra el warning esperado de función SECURITY DEFINER accesible a `authenticated`; es intencional para esta RPC y no representa un cambio introducido por Fase 2.

No hubo findings de performance nuevos para los objetos de esta fase.

## 6. Sesiones y compatibilidad Motor

Al ejecutar la limpieza no existían sesiones:

```text
activo / recovery = 0
```

El TTL de 12 h permanece ampliamente por encima de las ventanas del runtime Cajero V4:

- snapshot válido aproximadamente 2 h;
- recovery adicional de 2 h.

No se modificaron Motor, Cajero, Dashboard, `conteos` ni `conteo_detalle`.

## 7. Migración

Migración desplegada:

```text
20261006095524
solog_admin_control_retention_phase2_v1
```

Archivo de repositorio:

`supabase/migrations/20261006095524_solog_admin_control_retention_phase2_v1.sql`

## 8. Resultado

**Fase 2 — COMPLETADA / DESPLEGADA / VALIDADA TÉCNICAMENTE.**

El smoke humano permanece diferido al smoke global posterior al bloque Dashboard, según:

`docs/SOLOG_Backend_Admin_Control_Validacion_Delta_V1.md`
