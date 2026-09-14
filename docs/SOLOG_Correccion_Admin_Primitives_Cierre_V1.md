# SOLOG — Corrección Admin Primitives — Cierre V1

**Estado:** APROBADO — DELTA de cierre  
**Fecha:** 2026-09-14  
**Fuente primaria base:** `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`

Este documento modifica únicamente los puntos indicados aquí. Todo lo no reemplazado explícitamente conserva plena vigencia.

## 1. Tamaño de Button

Se revierte el tamaño base de los botones de acción Admin al tamaño previo consolidado:

- altura base: 38 px;
- padding: 8 px 12 px;
- radio: 10 px;
- tipografía: 0.82rem.

Las reglas base deben usar baja especificidad para no sobrescribir tamaños especializados ya existentes en módulos maduros.

Los controles propios del sidebar mantienen sus dimensiones especializadas actuales. No se crea una clase `button--sidebar` mientras no exista un consumidor real que la necesite.

## 2. Iconos

Todo **Button de acción** de Admin debe incluir un icono Lucide coherente con su acción.

No aplica a controles cuya semántica no es un Button de acción:

- tabs / StateView;
- QuickFilterChip;
- opciones de menú/listbox;
- selectores segmentados;
- opciones numéricas de selección;
- selector de sede;
- botones puramente iconográficos, que ya usan IconButton.

## 3. Correcciones de cierre

- completar navegación por teclado de `AdminSort` con ArrowUp, ArrowDown, Home y End;
- usar roving tabindex en `AdminSort`;
- cerrar `AdminSort` al abandonar el menú con Tab/foco;
- completar roving `tabIndex` en StateView de Catálogo;
- añadir icono Search a las búsquedas de Productos y Grupos;
- añadir icono al Primary `Revisar publicación`;
- retirar CSS muerto de `.admin-toolbar__sort`;
- reemplazar referencias CSS huérfanas `--color-warning-strong`, `--color-success-strong`, `--radius-card` y `--shadow-soft` por tokens vigentes equivalentes;
- añadir pruebas dirigidas para estas primitives y reglas.

## 4. Fuera de alcance

- backend;
- Supabase;
- contratos;
- lógica de negocio;
- tablas, columnas y filas;
- rediseño de módulos;
- dialogs/drawers como sistema;
- refactors generales.

## 5. Validación

Después del delta deben aprobar:

- `bun test --reporter=dot`;
- `bun run lint`;
- `bun run build`;
- `git diff --check`;
- smoke humano final del bloque Admin.
