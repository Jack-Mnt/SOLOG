# SOLOG — Backend Cajero — Contexto original de reconteos: validación V1

**Estado:** R2 BACKEND DESPLEGADO Y VALIDADO — 2026-11-20 (America/Lima). **Frontend y smoke se validan por separado.**
**Fuente primaria congelada:** `docs/SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_V1.md`.
**Proyecto:** Supabase `fvtohxvcvsflzmftgfzs`.
**Migración remota aplicada:** `20261120213428_solog_cajero_full_recount_origin_v1`.
**SQL versionado:** `supabase/migrations/20261120213428_solog_cajero_full_recount_origin_v1.sql`, misma definición `CREATE OR REPLACE FUNCTION` aplicada remotamente.

## 1. Alcance real

- Única función reemplazada: `inventario.full_cashier_kpi_projection_v1(p_site uuid,p_session uuid,p_now timestamptz)`.
- `CASHIER_STATE.groups[]` añade `recount_origin` con `difference` original, `counted_at` UTC, `reason` y `note`, o valor JSON `null`.
- `difference` se calcula de `conteo_detalle.stock_fisico - conteo_detalle.stock_teorico`, nunca de una diferencia final transformada.
- El contexto se obtiene exclusivamente del `detalle_reconteo_id` de los grupos de runtime, comprobando grupo, sesión y sede de origen mediante joins.
- No se modificaron RPC públicas, `full_runtime_json_v2`, `affected_groups` V7, tablas, RLS, contratos de mutación, Motivos, Motor, Cron ni permisos.

## 2. Evidencia transaccional posterior al despliegue

Se ejecutó una prueba real de lectura contra `inventario.full_cashier_state_v3`, usando una sesión y tres grupos **sintéticos** dentro de una subtransacción PostgreSQL descartada mediante excepción explícita.

| Verificación | Resultado |
|---|---|
| Tres grupos de sesión recuperados | 3/3 |
| Dos reconteos con objeto `recount_origin` | 2/2 |
| Diferencia inicial y motivo/nota no nulos coinciden con origen | PASS |
| Motivo y nota originales `NULL` se devuelven como JSON null | PASS |
| Grupo de cobertura devuelve `recount_origin=null` | PASS |
| Todos los grupos exponen la clave y `coverage_pending_round` | PASS |
| Sesiones y grupos sintéticos tras rollback | 0 / 0 |

**Resultado de la función de ensayo:** `PASS_ROLLED_BACK`, `error=null`, todos los predicados verdaderos.
La prueba utiliza casos existentes de Cutervo y no crea reconteos físicos, no mueve prioridades, no manipula snapshots confirmados ni persiste ninguna captura.

## 3. Compatibilidad y permisos

- `inventario.full_cashier_kpi_projection_v1` sigue siendo una función de lectura `STABLE`, `SECURITY INVOKER`; sin privilegios EXECUTE de `anon` ni `authenticated`.
- La RPC pública `rpc_solog_cashier_bootstrap_v6` sigue siendo el único camino de lectura autenticado; sus controles existentes no cambiaron.
- Lectura remota de control: tres sesiones V3 reales históricas finalizadas, 0 sesiones activas/recovery, 0 reservas B4 y 0 conflictos persistidos después de la migración.
- `full_settings.policy_version` y `full_cashier_hourly_config_v3.mode='required'` sin cambios.

## 4. Límite y dependencia

Este resultado valida el shape y contenido backend con SQL real reversible. **No es E2E de navegador autenticado** ni acredita por sí mismo el flujo de reconteo de UI. R3/R4 deben consumir el contrato desplegado y comprobar modal, motivo heredado, diferencia actual, validación ±12, serialización del mismo payload y tests.
No desplegar `master` ni reabrir O1 como consecuencia de esta migración.
