# SOLOG — Arquitectura Limpieza Legacy S10 V1

**Estado:** CONGELADO — ALCANCE APROBADO
**Fecha:** 2026-09-05
**Proyecto:** SOLOG
**Nivel:** C — arquitectura / backend / limpieza legacy
**Fuente primaria previa:** `SOLOG_Arquitectura_Auditoria_Legacy_S10_V1.md` + auditoría independiente de Codex
**Contrato backend vigente al iniciar:** `SOLOG_Backend_Contratos_Optimizacion_Global_V8.md`

> Este documento autoriza únicamente el alcance S10 descrito aquí. No autoriza limpieza masiva, eliminación de tablas, triggers, Edge Functions ni compatibilidades activas.

## 1. S10-A — Backend, responsabilidad ChatGPT

Retirar mediante migración explícita y sin `CASCADE`:

- `rpc_solog_state`
- `rpc_solog_count`
- `rpc_solog_admin`
- `rpc_solog_catalog`
- `rpc_solog_control`
- `rpc_solog_control_detalle`
- `rpc_solog_control_export`
- `rpc_solog_dashboard`
- `rpc_solog_dashboard_site_activity`
- `rpc_solog_details`

Modificar `rpc_solog_cashier_mutate_v2` únicamente para retirar las acciones legacy:

- `recount_start`
- `recount_save`

Preservar sin cambios funcionales:

- `start`
- `save_batch`
- `recount_save_batch`
- `finish`
- V8 recovery / `recovery_until`
- idempotencia y replay
- locks
- Motor V3
- valorización
- validaciones de timestamps

No eliminar tablas, triggers, helpers internos no demostrados huérfanos, Edge Functions, RPC V2/V8 vigentes ni funciones de ConeXion.

Todo `DROP FUNCTION` debe ejecutarse sin `CASCADE`. Si PostgreSQL detecta una dependencia real, detener ese objeto y reevaluar.

## 2. Superficies backend protegidas

Conservar:

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
- Edge `conexion-auth`
- Edge `conexion-sync`
- Edge `conexion-admin`

## 3. S10-B — Frontend, responsabilidad Codex posterior

Después de desplegar y validar S10-A, retirar exclusivamente islas/símbolos de confianza alta, preservando archivos mixtos, tests negativos y compatibilidades activas.

## 4. S10-C — Documentación

Después de backend y frontend verdes, actualizar README y trazabilidad, conservando V2–V7 como históricos y documentando el contrato posterior.

## 5. Fuera de alcance

No retirar automáticamente helpers de confianza media, assets, paquetes, rutas de compatibilidad, tablas, triggers, saneamiento activo ni funciones internas no auditadas.

## 6. Criterios de validación S10-A

1. Las 10 RPC legacy ya no existen.
2. `rpc_solog_cashier_mutate_v2` ya no contiene `recount_start` ni `recount_save`.
3. `start`, `save_batch`, `recount_save_batch`, `finish` continúan presentes.
4. `contract_version = 2`.
5. Bootstrap V8 conserva `session_capability` y `recovery_until`.
6. No cambian tablas ni Edge Functions.
7. Las funciones V2 protegidas permanecen desplegadas.
8. Validación sintética sin dejar datos persistidos.
9. Sin dependencias rotas.

## 7. Orden de ejecución

1. Congelar este alcance.
2. Ejecutar S10-A en Supabase.
3. Validar S10-A.
4. Congelar contrato backend posterior.
5. Entregar S10-B a Codex.
6. Validar frontend.
7. Ejecutar S10-C.
8. Cerrar S10.
