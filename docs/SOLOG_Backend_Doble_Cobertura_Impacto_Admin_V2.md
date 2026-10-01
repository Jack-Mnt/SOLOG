# SOLOG — Backend — Doble cobertura — Impacto futuro en Admin V2

**Estado:** VIGENTE — HANDOFF PARA ADAPTACIÓN FUTURA DE ADMIN  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Alcance:** impacto del Motor/Cajero V4 ya desplegado sobre SOLOG Admin  
**Sustituye:** `docs/SOLOG_Backend_Doble_Cobertura_Impacto_Admin_V1.md`  
**No es fuente primaria del bloque Cajero/Motor.**

## 1. Estado backend actual

El Motor/Cajero V4 ya fue desplegado y validado.

La limpieza destructiva de Fase 10 eliminó físicamente el modelo legacy de cobertura y runtime.

SOLOG Admin permanece desactivado y fuera del bloque actual.

## 2. Cobertura vigente

La cobertura quincenal se divide en dos rondas temporales:

- Cobertura quincenal 1;
- Cobertura quincenal 2.

La autoridad operacional ya no es un booleano persistido.

Se eliminó de `inventario.estado_stock_grupo`:

- `cobertura_periodo`;
- `cobertura_periodo_desde`.

La cobertura se deriva con:

`ultima_observacion_fisica_at`

contra la ventana temporal de la ronda correspondiente.

`ultimo_conteo_at` permanece separado para la regla de máximo un conteo normal por turno.

## 3. Objetos legacy ya eliminados

Ya no existen:

- `inventario.solog_daily_coverage_base`;
- `inventario.solog_daily_coverage_groups`;
- `inventario.solog_shift_coverage`;
- `inventario.solog_session_groups`;
- `inventario.solog_cobertura`;
- `public.rpc_solog_operational_v2`;
- `public.rpc_solog_details_v2`;
- RPC Cajero V2/V3;
- cron `solog_shift_early/day/night`.

Admin no puede reintroducir dependencia sobre estos objetos.

## 4. Modelo operacional que sí permanece

Fuentes autoritativas relevantes:

- `inventario.estado_stock_grupo`;
- `inventario.conteos`;
- `inventario.conteo_detalle`;
- `inventario.snapshots`;
- Motor temporal V4;
- helpers/RPC que se definan específicamente para Admin.

Estado vigente de `estado_stock_grupo`:

- sede_id;
- grupo_conteo_id;
- stock_actual;
- snapshot_id;
- estado;
- ultimo_conteo_at;
- ultimo_conteo_detalle_id;
- activo;
- updated_at;
- requiere_snapshot_completo;
- ultima_observacion_fisica_at.

## 5. Historial

Los hechos históricos siguen preservados en:

- `inventario.conteos`;
- `inventario.conteo_detalle`;
- snapshots y referencias asociadas.

Septiembre y períodos anteriores no deben reinterpretarse retroactivamente como Cobertura 1 / Cobertura 2.

El modelo nuevo rige desde el período iniciado el 1 de octubre de 2026.

## 6. Trabajo requerido al retomar Admin

Antes de reactivar Admin:

1. usar como fuente el contrato backend V4 congelado;
2. realizar preflight específico de Admin;
3. inventariar módulos, KPI y llamadas RPC actuales;
4. reemplazar consumidores de `rpc_solog_operational_v2` y `rpc_solog_details_v2`;
5. definir contrato backend Admin para Cobertura 1 / Cobertura 2;
6. definir UX/KPI/tablas/comparativas de ambas rondas;
7. migrar consumidores;
8. validar que no existan referencias a objetos legacy eliminados;
9. realizar validación técnica y smoke antes de reactivar Admin.

## 7. Decisiones todavía no definidas para Admin

Este handoff no define:

- KPI combinado entre rondas;
- porcentaje 0–200%;
- representación visual;
- comparación histórica entre R1 y R2;
- nuevas RPC de Admin.

Estas decisiones pertenecen al futuro bloque de definición Admin.

## 8. Estado documental

`SOLOG_Backend_Doble_Cobertura_Impacto_Admin_V1.md` queda **HISTÓRICO / REEMPLAZADO**.

Esta V2 es la nota vigente para retomar la adaptación de Admin.
