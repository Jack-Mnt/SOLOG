# SOLOG — UI Operacional — Tarjeta Stock/Inventario — Delta V1

**Estado:** CONGELADO — APROBADO
**Fecha:** 7 de octubre de 2026
**Proyecto:** SOLOG
**Clasificación:** Nivel B — normalización estructural frontend
**Rama:** `admin-work`

## 1. Fuente primaria y precedencia

Este delta modifica únicamente la semántica y composición de la tarjeta compartida de stock/inventario definida en:

- `docs/SOLOG_UI_Operacional_Normalizacion_Cajero_Detalles_V1.md`

Para este alcance prevalece sobre su sección 3.5. Todo lo demás permanece vigente.

## 2. Composición compartida

Cajero y Detalles deben usar la misma estructura visual:

- tarjeta;
- estado;
- icono;
- copy;
- acciones opcionales.

Ambas superficies deben mostrar icono.

Se mantienen las clases compartidas actuales `cajero-stock-card*`; el refactor de namespace queda fuera de alcance.

## 3. Estados visuales

La tarjeta base sin modificador representa ausencia de snapshot y se muestra neutral.

`cajero-stock-card--updated` representa snapshot existente y vigente:
- borde success;
- fondo success-soft;
- icono success.

`cajero-stock-card--stale` representa snapshot existente pero desactualizado:
- borde warning;
- fondo warning-soft;
- icono warning.

No usar `--stale` para el caso donde nunca existió snapshot.

## 4. Regla de desactualización

En Detalles, donde se dispone de `ultimo_snapshot.confirmado_at` y `generated_at`, un snapshot se considera desactualizado cuando:

`generated_at - confirmado_at >= 2 horas`.

Si falta snapshot, el estado es neutral/no disponible.

En Cajero se reutiliza el estado operativo vigente del stock y su expiración autoritativa para decidir si la tarjeta está desactualizada; no se modifica backend ni contrato.

## 5. Copy

Detalles:
- vigente: `Última actualización de stock`;
- desactualizado: `Stock desactualizado`;
- sin snapshot: `Stock no disponible`.

Cajero:
- vigente: `Inventario cargado`;
- desactualizado: `Inventario desactualizado`;
- sin snapshot: `No hay inventario cargado`.

## 6. Fuera de alcance

- refactor de namespace;
- cambios backend/Supabase;
- cambios de Motor;
- nuevos CTA;
- cambios generales de responsive;
- rediseño de otras tarjetas.

## 7. Validación

- tests dirigidos Cajero y Detalles;
- browser smoke Cajero y Detalles;
- lint;
- build;
- `git diff --check`;
- smoke humano transversal posterior.
