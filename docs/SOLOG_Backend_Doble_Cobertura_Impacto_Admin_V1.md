# SOLOG — Backend — Doble cobertura — Impacto futuro en Admin V1

**Estado:** NOTA DE IMPACTO — FUERA DEL BLOQUE ACTUAL / PENDIENTE DE RETOMAR  
**Fecha:** 30 de septiembre de 2026  
**Proyecto:** SOLOG  
**Alcance:** handoff para futura adaptación de SOLOG Admin  
**No es fuente primaria del bloque Cajero/Motor actual.**

---

## 1. Contexto

El Motor/Cajero será migrado a un modelo nuevo de cobertura quincenal con dos rondas temporales dentro de la misma quincena:

- Cobertura quincenal 1.
- Cobertura quincenal 2.

Octubre de 2026 inicia directamente bajo el modelo nuevo. El historial anterior conserva su semántica histórica.

SOLOG Admin permanece desactivado y fuera del bloque de implementación actual. Su adaptación se realizará después de cerrar backend + Cajero.

---

## 2. Cambio de modelo relevante para Admin

El modelo nuevo elimina como autoridad operacional:

- `estado_stock_grupo.cobertura_periodo`;
- `estado_stock_grupo.cobertura_periodo_desde`.

La cobertura pasa a derivarse temporalmente a partir de una referencia autoritativa de última observación física válida del grupo, combinada con la ronda quincenal correspondiente.

Se mantiene separada la referencia del último conteo normal utilizada para la regla de máximo un conteo normal por turno.

Consecuencia: cualquier módulo Admin que hoy consuma cobertura quincenal desde los booleanos anteriores deberá migrarse al contrato nuevo.

---

## 3. Superficies backend actuales afectadas

Durante el preflight del 30/09/2026 se confirmó que las siguientes superficies actuales dependen directa o indirectamente de la semántica legacy de cobertura:

- `inventario.solog_cobertura`;
- `public.rpc_solog_operational_v2`;
- `public.rpc_solog_details_v2`;
- funciones de resumen/estado Cajero V2/V3;
- funciones de refresh operacional de grupos;
- otras funciones que lean `cobertura_periodo` / `cobertura_periodo_desde`.

Las superficies que sigan siendo necesarias para Admin deberán adaptarse o sustituirse antes de reactivar Admin.

---

## 4. Métricas/tablas retiradas

El nuevo backend no conservará como fuente vigente:

- `inventario.solog_daily_coverage_base`;
- `inventario.solog_daily_coverage_groups`;
- `inventario.solog_shift_coverage`.

Sus datos actuales se consideran métricas incompletas y no se migrarán como histórico autoritativo.

Admin no debe diseñarse posteriormente dependiendo de estas tablas.

---

## 5. Cobertura que deberá exponer Admin

La adaptación futura de Admin deberá trabajar, como mínimo, con las dos rondas explícitas:

- Cobertura quincenal 1.
- Cobertura quincenal 2.

La representación, KPI consolidado, tablas y comparación entre rondas quedan deliberadamente sin definir en este documento.

No se debe inferir una métrica global 0–200 % ni un KPI combinado hasta realizar el bloque específico de definición de Admin.

---

## 6. Historial

Los hechos históricos se preservan en las tablas autoritativas de conteo, especialmente:

- `inventario.conteos`;
- `inventario.conteo_detalle`;
- snapshots y referencias asociadas.

Los datos anteriores al cutover no deben reinterpretarse retroactivamente como Cobertura 1 / Cobertura 2.

El nuevo modelo comienza a regir desde la quincena iniciada el 1 de octubre de 2026.

---

## 7. Regla para retomar Admin

Antes de reactivar SOLOG Admin:

1. usar como fuente el contrato backend definitivo desplegado del nuevo Motor;
2. realizar preflight específico de Admin;
3. inventariar cada KPI/RPC/vista que todavía asuma la cobertura legacy;
4. definir UX de Cobertura quincenal 1 y Cobertura quincenal 2;
5. migrar consumidores;
6. validar que no queden lecturas de columnas, tablas o RPC retiradas.

Hasta entonces, SOLOG Admin debe permanecer fuera del bloque y desactivado.
