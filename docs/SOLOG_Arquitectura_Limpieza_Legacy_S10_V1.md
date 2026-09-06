# SOLOG — Arquitectura Limpieza Legacy S10 V1

**Estado:** CERRADO — IMPLEMENTADO Y VALIDADO
**Fecha:** 2026-09-05
**Proyecto:** SOLOG
**Nivel:** C — arquitectura / backend / limpieza legacy
**Fuente primaria previa:** `SOLOG_Arquitectura_Auditoria_Legacy_S10_V1.md` + auditoría independiente de Codex
**Contrato backend vigente al iniciar:** `SOLOG_Backend_Contratos_Optimizacion_Global_V8.md`
**Contrato backend posterior:** `SOLOG_Backend_Contratos_Optimizacion_Global_V9.md`

> Este documento registra el alcance autorizado y el cierre de S10. No autoriza limpieza adicional fuera de los elementos aprobados.

## 1. S10-A — Backend, responsabilidad ChatGPT

Retiradas mediante migración explícita y sin `CASCADE`:

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

En `rpc_solog_cashier_mutate_v2` se retiraron únicamente las acciones legacy:

- `recount_start`
- `recount_save`

Se preservaron:

- `start`
- `save_batch`
- `recount_save_batch`
- `finish`
- V8/V9 recovery y `recovery_until`
- idempotencia y replay
- locks
- Motor V3
- valorización
- validaciones de timestamps

No se eliminaron tablas, triggers, Edge Functions ni helpers internos no demostrados huérfanos.

### Validación S10-A

- 10/10 RPC legacy ausentes.
- Superficies V2 protegidas presentes.
- `contract_version = 2` preservado.
- `session_capability` y `recovery_until` preservados.
- Recovery de 2 horas preservado.
- Sin dependencias bloqueantes al retirar RPC legacy.

## 2. Superficies backend protegidas

Permanecen vigentes:

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

## 3. S10-B — Frontend, responsabilidad Codex

Implementado y validado.

Se retiraron exclusivamente islas/símbolos legacy de alta confianza, incluyendo:

- contexto SOLOG antiguo;
- bootstrap frontend ligado a `rpc_solog_state`;
- componentes Cajero desmontados;
- recuperación Cajero histórica;
- tabla Cajero histórica;
- helper `resolveTrustedRoute` desmontado;
- helpers/formatters Admin sin consumidor;
- reexports Admin sin consumidor;
- harness positivo del Motor/reconteo antiguo;
- selectores CSS exclusivamente ligados a componentes retirados;
- símbolos huérfanos expresamente autorizados en archivos mixtos.

Se preservaron:

- `getSologRoute` y `rpc_solog_route_v2`;
- archivos mixtos y tipos compartidos vigentes;
- `/count` y `/cajero/seguimiento`;
- tests negativos contra reintroducción de RPC/actions legacy;
- Recovery V8/V9;
- Historial y su layout manual;
- Admin/Detalles V2;
- exportadores dinámicos;
- saneamiento activo de persistencia antigua.

### Validación S10-B final

- 269 tests aprobados, 0 fallidos.
- 16/16 browser runners aprobados.
- 1160 assertions.
- Lint aprobado.
- Typecheck aprobado.
- Build aprobado.
- `git diff --check` aprobado.
- Sin referencias irresolubles.
- Cero superficies legacy retiradas en `src` y chunks de producción.
- `recount_start` y `recount_save` ausentes del runtime.
- Superficies V2/V9 presentes.

Las tres expectativas browser de Detalles detectadas durante la validación se actualizaron para reflejar cambios manuales de UI previamente realizados y aprobados por el usuario. No se modificó código fuente/UI para satisfacer esas pruebas.

## 4. S10-C — Documentación

Completado.

- README actualizado al runtime V9 actual.
- Este documento actualizado a estado cerrado.
- Se creó `SOLOG_Refactor_Limpieza_Legacy_S10_Cierre_V1.md` como cierre y trazabilidad final.
- V2–V8 permanecen como histórico/herencia según precedencia de V9.
- `SOLOG_Plan_Implementacion_Optimizacion_Global.md` se conserva como documento histórico de planificación y migración; no es autoridad sobre el runtime posterior a V9 cuando exista contradicción.

## 5. Fuera de alcance preservado

No se retiraron automáticamente:

- helpers de confianza media;
- assets;
- paquetes;
- rutas de compatibilidad;
- tablas;
- triggers;
- saneamiento activo;
- funciones internas no auditadas.

Estos elementos requieren un delta futuro si alguna vez se decide revisarlos.

## 6. Jerarquía documental posterior a S10

1. `SOLOG_Backend_Contratos_Optimizacion_Global_V9.md` — contrato backend vigente.
2. `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` — decisiones funcionales congeladas que no contradigan V9 o deltas posteriores.
3. `SOLOG_Arquitectura_Limpieza_Legacy_S10_V1.md` — alcance y resultado de S10.
4. `SOLOG_Refactor_Limpieza_Legacy_S10_Cierre_V1.md` — cierre consolidado S10.
5. V8 y anteriores — histórico/herencia según precedencia declarada.
6. `SOLOG_Plan_Implementacion_Optimizacion_Global.md` — histórico de planificación/ejecución, no descripción autoritativa del runtime actual.

## 7. Estado final

- S10-A backend: **CERRADO**
- S10-B frontend: **CERRADO**
- S10-C documentación: **CERRADO**
- S10 global: **CERRADO**

No quedan bloqueos conocidos de S10.
