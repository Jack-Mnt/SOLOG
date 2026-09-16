# SOLOG — UX AdminDialog — Gestión de Foco V1

**Proyecto:** SOLOG  
**Estado:** CERRADO — VALIDADO TÉCNICA Y HUMANAMENTE EN PREVIEW
**Clasificación:** Nivel B — primitive transversal de UX/accesibilidad  
**Fecha:** 2026-09-16

## 1. Fuente primaria

Este documento es la **fuente primaria del Bloque 3** para `AdminDialog`.

No autoriza rediseños visuales de los modales.

## 2. Escape

Cuando existen diálogos anidados:
- únicamente el diálogo superior puede responder a `Escape`;
- un solo `Escape` cierra como máximo un diálogo;
- el padre permanece abierto.

La misma regla aplica al cierre mediante backdrop.

## 3. Foco

`AdminDialog` debe resolver de forma común:
- entrada de foco al abrir;
- focus trap dentro del diálogo superior;
- restauración del foco al elemento que lo abrió;
- exclusión del padre del ciclo de tabulación mientras exista un hijo activo.

## 4. Diálogos anidados

Deben funcionar correctamente al menos:
- Catálogo → detalle → configuración de producto;
- Catálogo → resolución de precio → valorizado;
- cualquier otro modal hijo abierto desde un `AdminDialog`.

## 5. Limpieza

Los traps manuales locales que queden redundantes después de centralizar el comportamiento deben retirarse únicamente cuando las pruebas demuestren equivalencia.

No se permiten refactors generales de dialogs no relacionados.

## 6. Accesibilidad

Se preservan:
- `role="dialog"`;
- `aria-modal="true"`;
- `aria-labelledby`;
- `aria-describedby` cuando exista descripción;
- botón de cierre accesible.

## 7. Fuera de alcance

- cambiar dimensiones;
- cambiar layout visual;
- cambiar contenido de los modales;
- introducir una librería externa de dialogs salvo necesidad técnica demostrada y aprobación posterior.

## 8. Criterios de aceptación

1. Escape cierra solo el diálogo superior.
2. Tab/Shift+Tab no escapan del diálogo superior.
3. Al cerrar, el foco vuelve al disparador válido.
4. Los flujos anidados no cierran accidentalmente el padre.
5. No hay regresiones en Control, Catálogo, Productos, Grupos, Incidencias ni Dispositivos.

> **Bloque 3 congelado.**

## 9. Estado de implementación

### Fase 1 — Ownership y cierre

Implementado en `admin-work`:

- pila común de ownership para `AdminDialog`;
- únicamente el diálogo superior procesa `Escape`;
- un `Escape` cierra como máximo un diálogo;
- eventos de teclado ya consumidos mediante `defaultPrevented` no cierran el diálogo;
- el cierre por backdrop solo actúa sobre el diálogo superior;
- `closeDisabled` continúa bloqueando Escape y backdrop;
- los diálogos inferiores quedan `inert` mientras exista un hijo superior;
- no se modificó el diseño visual ni los consumidores.

Validación:

- tests dirigidos Fase 1: **3 pass / 0 fail**;
- `bun run lint`: correcto;
- `bun run build`: correcto;
- `git diff --check`: correcto.

### Fase 2 — Gestión de foco

Implementado en `admin-work`:

- captura del elemento que abrió el diálogo;
- foco inicial común al abrir;
- respeto de elementos que ya recibieron foco mediante `autoFocus`;
- focus trap del diálogo superior con `Tab` y `Shift+Tab`;
- wrap entre primer y último elemento enfocables;
- fallback al propio `role="dialog"` mediante `tabIndex={-1}` cuando no existen controles enfocables;
- restauración del foco al disparador válido al cerrar;
- reactivación del diálogo padre al cerrarse un hijo;
- protección específica para la doble ejecución de efectos de `React.StrictMode`, sin reemplazar el disparador original.

### Fase 3 — Integración anidada

Validado en `admin-work`:

- Catálogo → detalle → configuración de producto;
- Catálogo → detalle → resolución de precio;
- resolución de precio → configuración de valorizado;
- pila de tres niveles con reactivación del padre inmediato;
- `AdminSort` conserva su manejo local de `Escape`;
- `AdminDialog` respeta `event.defaultPrevented` y no interfiere con controles internos;
- no se encontraron traps locales de diálogo redundantes que debieran retirarse;
- no fue necesario modificar consumidores ni introducir una librería externa.

Validación dirigida Fases 2–3:

- **68 pass / 0 fail** en 11 archivos de tests relacionados;
- `bun run lint`: correcto, sin advertencias;
- `bun run build`: correcto;
- `git diff --check`: correcto.

### Fase 4 — Validación global

Validación técnica completada en `admin-work`:

- suite global: **371 pass / 9 fail**;
- los 9 fallos corresponden exclusivamente a los casos G2 de formato horario ya presentes en el baseline productivo;
- `bun run lint`: correcto;
- `bun run build`: correcto;
- revisión final de regresiones y alcance del Bloque 3: sin incompatibilidades nuevas detectadas;
- no se modificó backend, diseño visual ni contratos de consumidores.

Cierre:

- smoke humano completado con éxito en el Preview de `admin-work`;
- foco inicial, focus trap, restauración de foco, Escape y backdrop funcionan según lo congelado;
- los flujos anidados de Catálogo y valorizado se validaron correctamente;
- no se detectaron regresiones funcionales atribuibles al Bloque 3;
- el Bloque 3 queda cerrado y congelado en su estado actual.
