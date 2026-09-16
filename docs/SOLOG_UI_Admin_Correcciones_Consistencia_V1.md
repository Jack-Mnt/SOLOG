# SOLOG — UI Admin — Correcciones de Consistencia V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel A/B — correcciones visuales y utilidades de presentación  
**Fecha:** 2026-09-16

## 1. Fuente primaria

Este documento es la **fuente primaria del Bloque 5**.

No reabre la normalización visual general de Admin.

## 2. admin-button__actions

La marca visual especial documentada como excepción de Dashboard no debe afectar controles de Control.

Regla:
- Dashboard conserva su tratamiento contextual propio;
- Control usa Button/acciones con geometría Admin normal;
- paginación y `Descargar ajuste` de Control no deben heredar el marcador lateral exclusivo de Dashboard.

La corrección puede realizarse renombrando/aislando la clase o sustituyendo usos incorrectos, sin refactor general de CSS.

## 3. Abreviaturas de sede

Mapeo conocido:

```text
Cutervo    → CUT
Huaca      → HUA
Divino     → DIV
Unidad     → UNI
Casuarinas/Casua → CAS
```

Una sede desconocida **no puede convertirse automáticamente en CAS**.

Fallback:
- usar una abreviatura derivada del nombre disponible;
- si el nombre está vacío, mostrar `—`.

## 4. Decisión explícitamente fuera de error

La presentación del código en Incidencias **sin el prefijo “C. interno:” es deliberada**.

No debe corregirse ni tratarse como regresión dentro de este bloque.

## 5. Fuera de alcance

- rediseñar Dashboard;
- rediseñar Control;
- cambiar densidad global;
- limpiar `admin.css` en general;
- cambiar composición de tablas;
- modificar backend.

## 6. Criterios de aceptación

- Control deja de heredar la excepción visual de Dashboard;
- Dashboard conserva su excepción;
- sedes desconocidas nunca aparecen falsamente como CAS;
- se preserva deliberadamente el código de Incidencias sin prefijo.

> **Bloque 5 congelado.**
