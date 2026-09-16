# SOLOG — UX AdminDialog — Gestión de Foco V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
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
