# SOLOG — UX Admin — Paginación Local de Tablas — Plan V1

**Proyecto:** SOLOG  
**Estado:** PLAN TÉCNICO — APROBADO  
**Clasificación:** Nivel B — implementación funcional transversal frontend  
**Fecha:** 2026-09-19

## 1. Fuente primaria

Fuente primaria obligatoria:

`docs/SOLOG_UX_Admin_Paginacion_Local_Tablas_V1.md`

Este plan no reabre ni modifica decisiones visuales ya congeladas.

Baseline inspeccionado de `admin-work`:

`37125e51e2ffc82d8996ea50c30ad4f1022080e5`

## 2. Preflight

Estado real encontrado:

- Productos ya pagina localmente a 50 mediante `paginateProducts`, pero muestra el paginador con cualquier resultado > 0.
- Control pagina localmente a 100 y conserva filtros/contadores sobre el dataset completo.
- Grupos filtra/ordena completo y renderiza todo el resultado.
- Incidencias filtra completo y renderiza todas las familias visibles.
- Catálogo separa correctamente Urgentes/Emergentes, pero renderiza completas ambas secciones.
- Dashboard `DailyDrawer` renderiza directamente el detalle diario completo; evidencia de uso confirma jornadas con más de 400 filas.
- El paginador visual existente ya está normalizado mediante `.admin-control__pagination` y botones `button button--secondary`.
- `admin.primitives.tsx` no tiene todavía primitive de paginación.
- La Fase 11 responsive ya está congelada; no debe alterarse geometría, breakpoints ni densidad.

No se detecta dependencia backend.

## 3. Restricciones de implementación

- No modificar backend, Supabase, RPC, Cajero ni Detalles.
- No modificar columnas, wrappers de tablas, badges, acciones, toolbars ni geometría responsive.
- No realizar limpieza/refactor general de `admin.css`.
- No renombrar clases visuales existentes fuera de la migración explícitamente aprobada de `.admin-control__pagination` a `.admin-pagination`.
- Preservar `admin-main-table`, `admin-table-section`, `admin-table-actions` y demás primitives ya normalizados.
- `admin.css` solo puede cambiar para incorporar `.admin-pagination` y `.navigation-button`, trasladando sin reinterpretar el tratamiento visual actual del paginador.
- No tocar paginación de detalles/modales fuera del alcance congelado.

## 4. Fase 1 — Base compartida + Productos + Control

1. Extraer la lógica genérica de `paginateProducts` a una utilidad Admin compartida:
   - página válida/clamped;
   - offset;
   - pageCount;
   - pageSize configurable.
2. Crear `AdminPagination` reutilizable conservando exactamente el markup/tratamiento visual actual.
   - `.admin-pagination`: contenedor común del paginador; reemplaza el nombre específico `.admin-control__pagination` sin cambiar geometría.
   - `.navigation-button`: clase común para los botones de navegación `Anterior` / `Siguiente`, siempre combinada con `button button--secondary`.
   - no crear variantes por módulo, dirección, estado o breakpoint.
3. Productos:
   - conservar 50;
   - mostrar paginador solo con > 50 resultados;
   - mantener filtros, orden y contadores antes de paginar.
4. Control:
   - cambiar 100 → 50;
   - eliminar hardcodes de 100 en navegación;
   - conservar su dataset completo y resumen autoritativo.

Validación dirigida: helper, Productos y Control.

## 5. Fase 2 — Grupos + Incidencias + Dashboard DailyDrawer

### Grupos
- añadir estado de página;
- paginar el resultado final de `filterAndSortGroups` a 50;
- mantener `typeCounts` y `valuationCounts` calculados sobre conjuntos completos;
- volver a página 1 al cambiar búsqueda, categoría, tipo, valorizado u orden.

### Incidencias
- añadir estado de página;
- paginar `families` a 50 después de filtros;
- mantener `stateCounts` sobre el conjunto completo;
- volver a página 1 al cambiar estado, tipo, sede/alcance o Todas las sedes;
- no tocar `FamilyDetail` ni su contrato/paginación existente.

### Dashboard — DailyDrawer
- añadir estado de página local;
- paginar `data.items` a 50 con el helper compartido;
- reutilizar `AdminPagination`;
- ocultar paginador con ≤50 filas;
- no tocar Dashboard principal, grilla quincenal, KPIs, columnas ni geometría del diálogo;
- no generar peticiones adicionales al cambiar página.

Validación dirigida: Grupos, Incidencias y Dashboard DailyDrawer.

## 6. Fase 3 — Catálogo

- conservar separación Urgentes/Emergentes;
- estado de página independiente para cada sección;
- 25 propuestas por página por sección;
- mantener el contador del header de cada sección sobre el total completo, no sobre la página;
- cambiar página en una sección no afecta la otra;
- cambiar estado de propuestas reinicia ambas páginas;
- mutaciones que reduzcan filas deben corregir páginas fuera de rango;
- no alterar estructura, columnas, acciones ni composición de las secciones.

Validación dirigida: Catálogo y casos 25/26.

## 7. Fase 4 — Validación global

Ejecutar:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Revisión de alcance:
- sin cambios backend;
- sin cambios Cajero/Detalles;
- sin cambios visuales no relacionados;
- idealmente `admin.css` sin cambios.

Smoke humano mínimo:
- Productos: 50/51;
- Control: navegación entre páginas;
- Grupos: filtro desde página > 1;
- Incidencias: cambio de estado/sede desde página > 1;
- Dashboard DailyDrawer: 50/51 y navegación con un día de alto volumen;
- Catálogo: Urgentes y Emergentes independientes 25/26;
- comprobación rápida Desktop, Tablet y Mobile para confirmar que el paginador conserva la UI ya normalizada.

## 8. Criterio de cierre

El bloque puede cerrarse cuando:
- se cumplen los límites 50/25;
- los paginadores desaparecen con una sola página;
- filtros/orden/contadores siguen operando sobre el dataset completo;
- no se generan peticiones backend al cambiar página;
- no existen regresiones visuales en las tablas ya normalizadas.


## 9. Estado de ejecución

### Fase 1 — Base compartida + Productos + Control

**CERRADA TÉCNICAMENTE.**

Validación reportada por el usuario sobre `admin-work`:
- tests dirigidos: correctos;
- `bun run lint`: correcto;
- `bun run build`: correcto;
- `git diff --check`: correcto.

### Fase 2 — Grupos + Incidencias + Dashboard DailyDrawer

**IMPLEMENTADA — PENDIENTE DE VALIDACIÓN EJECUTABLE.**

Implementado:
- Grupos: paginación local 50 posterior a filtros/orden;
- Incidencias: paginación local 50 de la tabla principal;
- Dashboard `DailyDrawer`: paginación local 50;
- reutilización exclusiva de `paginateAdminRows` y `AdminPagination`;
- sin cambios CSS, backend o composición de tablas.

La fase no se considera cerrada hasta completar tests, lint, build, `git diff --check` y smoke proporcional.
