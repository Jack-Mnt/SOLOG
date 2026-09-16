# SOLOG — UX Incidencias — Supresión Multisede V1

**Proyecto:** SOLOG  
**Estado:** IMPLEMENTADO FASES 1–2 — VALIDACIÓN FASE 3 PENDIENTE
**Clasificación:** Nivel B — comportamiento UX derivado de la lógica global de Incidencias  
**Fecha:** 2026-09-16

## 1. Fuente primaria y dependencia

Este documento es la **fuente primaria del Bloque 2**.

Depende obligatoriamente de:

`docs/SOLOG_Logica_Incidencias_Acciones_Globales_V1.md`

Si existiera contradicción sobre alcance de Ignorar/Reactivar, prevalece el documento de Lógica.

## 2. Regla principal

La UI deja de presentar Ignorar/Reactivar como decisiones independientes por sede.

Concepto operativo:

> Si se ignora una familia de incidencia, se ignora en todas las sedes durante el mismo período.

## 3. Ignorada hasta

Como la supresión es global:
- existe una única fecha `until`;
- la tabla de una sede y `Todas las sedes` muestran la misma fecha;
- no se mostrará “Fechas distintas”;
- no se calculará artificialmente un máximo de fechas locales.

La columna `Ignorada hasta` representa directamente la vigencia global autoritativa.

## 4. Modal de Ignorar

El modal deja de listar un botón Ignorar por cada sede.

Debe:
- identificar la familia/producto;
- indicar que la acción afecta a **todas las sedes**;
- ofrecer una única confirmación;
- cerrarse al confirmarse correctamente.

Texto conceptual requerido:

> Esta incidencia se ignorará durante 30 días en todas las sedes.

No se requiere listar fechas por sede.

## 5. Reactivar

Reactivar:
- es una única acción global;
- no ofrece selección de sede;
- elimina anticipadamente la supresión global;
- actualiza la vista con el estado autoritativo resultante.

## 6. Estado multisede

Después de Ignorar:
- toda incidencia activa de la familia queda Suprimida.

Después de Reactivar:
- las incidencias suprimidas aplicables vuelven a Pendiente;
- incidencias históricas/resueltas no se reinterpretan artificialmente.

## 7. Fuera de alcance

- cambiar la duración de 30 días;
- redefinir qué significa Resuelta;
- cambiar la identidad `family_key`;
- modificar la composición general de StateViews;
- introducir selección parcial de sedes.

## 8. Criterios de aceptación

- una sola acción y una sola fecha global;
- ningún control por sede dentro del flujo Ignorar/Reactivar;
- la fecha mostrada coincide con la respuesta backend;
- no existen estados UX contradictorios entre tabla y modal.

> **Bloque 2 congelado.**

## 9. Estado de implementación

Implementado en `admin-work`:

- Fase 1: el agregado multisede dejó de calcular `active_suppression_until` mediante el máximo de fechas locales; solo conserva una fecha cuando las fuentes autoritativas coinciden.
- Fase 2: Ignorar presenta una única confirmación global y ya no lista acciones por sede.
- Fase 2: Reactivar actúa por familia y ya no selecciona una fuente/sede para ejecutar la mutación global.
- Se conserva `propose_delete` como acción `site-scoped`.
- No se realizaron cambios backend ni cambios sobre `master`.

Pendiente:

- Fase 3: tests completos, lint, build, `git diff --check`, revisión de regresiones y smoke humano en Preview de `admin-work`.
