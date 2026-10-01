# SOLOG — Backend — Migración Motor Cajero — Baseline V1

**Estado:** REGISTRADO — FASE 0  
**Fecha:** 30 de septiembre de 2026  
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`  
**Rama:** `admin-work`  
**HEAD tras congelar plan:** `7b8f8b1ecdeb254df877ffac82cdd1f9ae69d455`

## 1. Fuente primaria y plan

- Fuente primaria: `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
- Plan congelado: `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 2. Conteos de referencia

| Tabla | Filas |
|---|---:|
| `inventario.snapshots` | 44 |
| `inventario.conteos` | 67 |
| `inventario.conteo_detalle` | 914 |
| `inventario.estado_stock_grupo` | 976 |
| `inventario.solog_session_groups` | 32562 |
| `inventario.solog_daily_coverage_base` | 13 |
| `inventario.solog_daily_coverage_groups` | 6326 |
| `inventario.solog_shift_coverage` | 7 |

## 3. Reconteos abiertos

- abiertos totales: 65;
- accionables con snapshot posterior: 58;
- esperando snapshot posterior: 7.

Estos casos pertenecen a `conteo_detalle` y deben preservarse durante la migración.

## 4. Sesiones

La sesión residual detectada durante preflight fue normalizada a `expirado`.

Baseline de gate:

```text
sesiones activas = 0
```

## 5. Usuarios SOLOG

Estado previo al mantenimiento:

| Rol | Activos |
|---|---:|
| admin | 1 |
| moderador | 1 |
| cajero | 5 |

Todos los usuarios registrados están actualmente activos. Este estado debe restaurarse cuando corresponda abrir las validaciones frontend.

## 6. Backup local

El backup local pre-migración debe producir:

- `roles.sql`;
- `schema.sql`;
- `data.sql`;
- `manifest.txt`;
- `SHA256SUMS.txt`;
- ZIP final con SHA-256.

El gate de Fase 0 no se considera completado hasta verificar el ZIP generado en el PC del usuario.

## 7. Estado

Baseline registrado. No ejecutar DDL destructivo ni desactivar usuarios hasta verificar el backup local.
