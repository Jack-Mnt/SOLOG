# SOLOG — Refactor Limpieza Legacy S10 — Cierre V1

**Estado:** CERRADO
**Fecha:** 2026-09-05
**Proyecto:** SOLOG
**Nivel:** C — arquitectura / backend / frontend legacy

## 1. Objetivo cerrado

S10 tuvo como objetivo retirar superficies backend y código frontend legacy después de completar la migración hacia contratos V2/V8/V9, sin cambiar comportamiento funcional vigente, UI, UX, datos ni arquitectura activa.

## 2. Fuentes de autoridad

- `SOLOG_Backend_Contratos_Optimizacion_Global_V9.md` — contrato backend vigente.
- `SOLOG_Arquitectura_Limpieza_Legacy_S10_V1.md` — alcance y resultado de S10.
- `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` — decisiones funcionales vigentes que no contradigan V9.

V8 y versiones anteriores quedan como histórico/herencia según la precedencia declarada en V9.

`SOLOG_Plan_Implementacion_Optimizacion_Global.md` queda como documento histórico de planificación y ejecución. Sus descripciones de baselines V1/V6, RPC legacy, persistencia antigua o gates ya cerrados no deben utilizarse para interpretar el runtime posterior a V9.

## 3. S10-A — Backend

Estado: **COMPLETADO Y VALIDADO**.

Se retiraron las RPC públicas legacy:

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

De `rpc_solog_cashier_mutate_v2` se retiraron las acciones unitarias legacy:

- `recount_start`
- `recount_save`

Se preservó el contrato actual:

- `start`
- `save_batch`
- `recount_save_batch`
- `finish`
- Recovery V8/V9
- Motor V3
- idempotencia/replay
- locks
- valorización
- validación de timestamps.

No se eliminaron tablas, triggers, Edge Functions ni helpers internos no demostrados huérfanos.

## 4. S10-B — Frontend

Estado: **COMPLETADO Y VALIDADO**.

Se retiró exclusivamente frontend legacy de alta confianza: contexto/bootstrap antiguo, componentes y helpers desmontados, reexports sin consumidor, formatters Admin históricos, harness positivo del flujo de reconteo antiguo y CSS exclusivo de componentes eliminados.

Se preservaron compatibilidades y superficies activas, incluidos:

- `rpc_solog_route_v2`;
- clientes V2/V9;
- `/count`;
- `/cajero/seguimiento`;
- tests negativos contra reintroducción de legacy;
- Recovery;
- Historial;
- Admin/Detalles V2;
- tipos compartidos;
- exportadores dinámicos;
- saneamiento activo.

Validación final:

- 269 tests aprobados.
- 1160 assertions.
- 16/16 browser runners aprobados.
- lint aprobado.
- typecheck aprobado.
- build aprobado.
- `git diff --check` aprobado.
- cero superficies legacy retiradas en `src` y chunks.
- `recount_start`/`recount_save` ausentes del runtime.

## 5. S10-C — Documentación

Estado: **COMPLETADO**.

Se actualizó `README.md` para describir:

- contratos V2/V9 actuales;
- RPC vigentes;
- drafts en memoria;
- mutación batch de reconteos;
- Recovery;
- módulos Admin y Detalles;
- compatibilidades activas;
- jerarquía documental vigente.

También se actualizó `SOLOG_Arquitectura_Limpieza_Legacy_S10_V1.md` a estado cerrado.

## 6. Elementos deliberadamente no limpiados

Quedaron fuera de S10 por diseño:

- helpers de confianza media;
- tipos parcialmente compartidos;
- assets sin consumidor local probado;
- paquetes;
- rutas de compatibilidad;
- tablas;
- triggers;
- helpers internos SQL;
- saneamiento de persistencia antigua todavía activo.

Cualquier limpieza posterior de estos elementos requiere un delta nuevo y evidencia específica.

## 7. Estado final

S10 queda **CERRADO GLOBALMENTE**.

No quedan pendientes técnicos ni documentales dentro del alcance aprobado.

El siguiente trabajo sobre SOLOG debe tratarse como un bloque nuevo e independiente. En particular, cualquier revisión visual/UI del Admin no forma parte de S10 y debe partir de sus decisiones de diseño vigentes sin reinterpretar la lógica/UX ya aprobada.
