# SOLOG — Contratos Backend de Optimización Global V9

**Estado:** CONGELADO, DESPLEGADO Y VALIDADO  
**Fecha:** 2026-09-05  
**Proyecto Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`)  
**Nivel:** C — backend / contrato / limpieza S10-A  
**API contract version:** `2`  
**Migración desplegada:** `solog_s10a_remove_legacy_surfaces_v2`

> V9 reemplaza a V8 como fuente primaria del contrato backend/frontend. V9 no cambia la forma de las superficies V2/V8 vigentes; formaliza la retirada de superficies públicas y acciones legacy después del cierre de G3.

## 1. Precedencia

1. **`SOLOG_Backend_Contratos_Optimizacion_Global_V9.md` — VIGENTE**
2. `SOLOG_Backend_Contratos_Optimizacion_Global_V8.md` — histórico/heredado para semántica V8 no repetida aquí.
3. `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md`
4. documentación anterior — histórica cuando contradiga V9.

## 2. Contrato API

Se mantiene:

```text
contract_version = 2
```

No se introdujeron RPC nuevas ni se modificaron payloads/respuestas de las superficies V2/V8 vigentes.

## 3. Superficies públicas retiradas en S10-A

Ya no existen en `public`:

- `rpc_solog_state(text,jsonb)`
- `rpc_solog_count(text,jsonb)`
- `rpc_solog_admin(text,jsonb)`
- `rpc_solog_catalog(text,jsonb)`
- `rpc_solog_control(jsonb)`
- `rpc_solog_control_detalle(jsonb)`
- `rpc_solog_control_export(jsonb)`
- `rpc_solog_dashboard()`
- `rpc_solog_dashboard_site_activity(uuid,integer)`
- `rpc_solog_details(text,jsonb)`

La migración utilizó `DROP FUNCTION` explícito **sin `CASCADE`**. PostgreSQL no reportó dependencias bloqueantes.

## 4. `rpc_solog_cashier_mutate_v2` posterior a S10-A

La función continúa vigente.

Acciones soportadas por el contrato actual:

- `start`
- `save_batch`
- `recount_save_batch`
- `finish`

Se retiraron las ramas legacy:

- `recount_start`
- `recount_save`

Una llamada con esas acciones deja de formar parte del contrato y debe terminar en la guarda general de acción inválida.

### Semántica preservada

No se modificó:

- V8 `recovery_until`;
- entrega durante Recovery;
- límite `contado_at <= expira_at`;
- `operation_id`;
- replay;
- batch atomicity;
- locks;
- frozen session groups;
- stock teórico congelado;
- Motor V3;
- valorización;
- `finish` durante Recovery.

## 5. Superficies vigentes protegidas

Permanecen desplegadas:

- `rpc_solog_route_v2`
- `rpc_solog_cashier_bootstrap_v2`
- `rpc_solog_cashier_mutate_v2`
- `rpc_solog_cashier_history_v2`
- `rpc_solog_details_v2`
- `rpc_solog_admin_bootstrap_v2`
- `rpc_solog_operational_v2`
- `rpc_solog_control_export_v2`
- `rpc_solog_admin_master_read_v2`
- `rpc_solog_admin_master_v2`
- `rpc_solog_admin_incidents_v2`
- `rpc_solog_admin_devices_v2`
- `rpc_solog_catalog_publication_v2`
- `rpc_solog_catalog_publication_artifact_v6`
- `rpc_conexion_admin`

Las Edge Functions activas de ConeXion/publicación no forman parte de S10-A y deben conservarse.

## 6. V8 sigue vigente funcionalmente

`rpc_solog_cashier_bootstrap_v2` conserva:

- `session_capability`;
- `recovery_until`;
- `contract_version = 2`;
- ventana de recuperación de 2 horas.

`inventario.solog_cashier_session_state` sigue devolviendo `recovery_until = expira_at + 2 horas` y arrays válidos para:

- `groups`;
- `count_queue`;
- `review_queue`.

## 7. Validación S10-A realizada

### Superficies

Confirmado:

- 10/10 RPC legacy: ausentes.
- 15/15 superficies protegidas consultadas: presentes.

### Mutate V2

Confirmado por definición desplegada:

- `recount_start`: ausente.
- `recount_save`: ausente.
- `start`: presente.
- `save_batch`: presente.
- `recount_save_batch`: presente.
- `finish`: presente.
- V8 recovery de 2 horas: presente.
- `contract_version = 2`: presente.

### Bootstrap / session state

Confirmado:

- `session_capability`: presente.
- `recovery_until`: presente.
- `contract_version = 2`: presente.
- recovery de 2 horas: presente.
- sesiones reales recientes devuelven `state_recovery_until` exactamente igual a `expira_at + 2 hours`.
- `groups`, `count_queue` y `review_queue` continúan siendo arrays válidos.

### Integridad de migración

La migración aplicada no contiene DDL de tablas, triggers ni Edge Functions.

No se usó `CASCADE`.

## 8. Frontend posterior a V9

El frontend actual V8 ya consume únicamente las acciones vigentes:

- `start`
- `save_batch`
- `recount_save_batch`
- `finish`

S10-B debe retirar código frontend desmontado y mantener tests negativos que eviten reintroducir las superficies/actions eliminadas.

No debe reintroducir:

- `rpc_solog_state`
- `rpc_solog_count`
- `recount_start`
- `recount_save`

## 9. Fuera de alcance

V9 no autoriza retirar:

- tablas;
- triggers;
- helpers internos;
- Edge Functions;
- rutas `/count` o `/cajero/seguimiento`;
- saneamiento de persistencia antigua;
- superficies V2 vigentes.

## 10. Estado de documentación

- `SOLOG_Backend_Contratos_Optimizacion_Global_V9.md`: **VIGENTE**
- V8: **HISTÓRICO / HEREDADO**
- V7 e inferiores: históricos según su precedencia anterior.
- `SOLOG_Arquitectura_Limpieza_Legacy_S10_V1.md`: alcance S10 aprobado.
- S10-B frontend y S10-C documentación: todavía pendientes.

## 11. Estado de S10

- S10-A backend: **COMPLETADO Y VALIDADO**
- S10-B frontend: **PENDIENTE**
- S10-C documentación: **PENDIENTE**
- cierre total S10: **PENDIENTE**
