# SOLOG — UI Admin — Secciones y Tablas Base V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — normalización visual frontend/Admin  
**Fecha:** 2026-09-14

---

# 1. Propósito

Este documento congela el siguiente corte visual del panel Admin de SOLOG.

El objetivo es normalizar:

1. la estructura visual de las secciones;
2. la superficie de Toolbar;
3. labels de filtros/búsqueda;
4. filas auxiliares previas a tablas;
5. conteo de resultados;
6. la carcasa visual de las tablas.

Referencia visual principal:

> **Control**

Control se utiliza como referencia de composición y jerarquía, pero no obliga a que todos los módulos tengan exactamente la misma estructura funcional.

---

# 2. Fuentes y precedencia

Fuente primaria de este bloque:

- `docs/SOLOG_UI_Admin_Secciones_Tablas_Base_V1.md`

Fuentes relacionadas vigentes:

1. contratos funcionales/backend vigentes;
2. `docs/SOLOG_UI_Sistema_Visual_V1.md`;
3. `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`;
4. `docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`;
5. `docs/SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md`.

Ante contradicciones:

- contratos funcionales/backend prevalecen;
- el Sistema Visual prevalece para identidad global;
- el delta de densidad prevalece para geometría de controles;
- este documento prevalece para estructura de secciones y Table Shell.

---

# 3. Alcance dividido en dos bloques de implementación

## Bloque A — Secciones, Toolbar y jerarquía previa a tabla

Incluye:

- labels normalizados;
- estructura de sección;
- intro/descripción opcional;
- Toolbar Surface;
- búsqueda/filtros/acciones dentro del mismo lenguaje visual;
- Secondary Row para QuickFilterChip / StateView / información auxiliar;
- Result Count Row;
- spacing vertical consistente;
- aplicación proporcional en Control, Productos, Grupos, Incidencias y Catálogo.

## Bloque B — Table Shell

Incluye:

- wrapper visual de tabla;
- borde exterior;
- superficie;
- radio;
- overflow;
- relación visual con Result Count Row;
- relación visual con paginación;
- fondo/base visual del encabezado de tabla;
- consistencia del contenedor entre módulos.

---

# 4. Fuera de alcance

Queda expresamente fuera de este corte:

- ancho de columnas;
- alineación por columna;
- densidad de filas;
- altura de filas;
- tipografía específica de celdas;
- truncado de textos;
- sticky columns;
- responsive tabla → lista/card;
- acciones por fila;
- badges internos de celdas;
- rediseño de dialogs;
- drawers;
- pop-ups;
- backend;
- Supabase;
- contratos;
- lógica de negocio;
- navegación.

Estas áreas se revisarán después en el bloque:

> **Admin — Columnas y filas**

---

# 5. Labels de controles

Queda aprobado:

```css
color: var(--color-text-secondary);
font-size: 0.8rem;
font-weight: 600;
```

Aplica a:

- label de búsqueda;
- label de filtros;
- label de selects;
- labels equivalentes dentro de Toolbars.

No aplica a títulos de sección ni contenido de tabla.

---

# 6. AdminSection

Cada módulo Admin puede estructurarse conceptualmente como:

```text
Topbar de página
└─ AdminSection
   ├─ AdminSectionIntro           # opcional
   ├─ AdminToolbarSurface
   ├─ AdminSectionSecondaryRow    # opcional
   ├─ AdminResultCountRow
   └─ AdminTableSection
```

Reglas:

- no cardificar innecesariamente cada bloque;
- usar spacing, superficie y borde antes que sombra;
- mantener composición funcional especializada por módulo;
- no duplicar el título principal de Topbar.

---

# 7. AdminSectionIntro

Uso:

- únicamente cuando aporta contexto real;
- no repite el título de página;
- mantiene bajo peso visual.

Referencia:

Grupos:

> Máscara y composición derivadas del Master Data compartido. El precio unitario es informativo.

Estilo orientativo:

```css
color: var(--color-text-secondary);
font-size: 0.95rem;
line-height: 1.45;
margin: 0;
```

---

# 8. AdminToolbarSurface

Referencia visual principal:

> Control

La Toolbar debe sentirse como una única superficie coherente para:

- búsqueda;
- filtros;
- acciones.

Base visual congelada:

```css
border: 1px solid var(--color-border);
border-radius: 16px;
background: var(--color-surface);
padding: 14px 16px;
```

Spacing:

- gap principal aproximado: 12 px;
- controles alineados verticalmente;
- labels con la regla definida en este documento;
- sin sombra permanente.

Se conserva la geometría de controles definida en:

`SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`.

---

# 9. AdminSectionSecondaryRow

Se ubica fuera del Toolbar.

Puede contener:

- QuickFilterChip;
- StateView;
- período visible;
- información auxiliar corta.

Orden conceptual:

```text
AdminToolbarSurface
↓
AdminSectionSecondaryRow
↓
AdminResultCountRow
↓
AdminTableSection
```

No debe convertirse en una segunda Toolbar.

---

# 10. QuickFilterChip y StateView

Se preservan las decisiones vigentes:

QuickFilterChip:

- filtro rápido;
- mismo dataset;
- 32 px;
- interactivo;
- aria-pressed cuando corresponda.

StateView:

- navegación de workflow;
- 36 px;
- semántica de tabs cuando corresponda;
- no se trata como filtro ordinario.

Este bloque solo normaliza su ubicación dentro de la estructura de sección.

---

# 11. AdminResultCountRow

Ubicación:

- inmediatamente antes de la tabla/listado.

Formato vigente:

```text
484 resultados
```

o:

```text
37 de 484 resultados
```

Puede compartir fila con:

- AdminSort;
- información auxiliar ligera;
- período mostrado.

No debe convertirse en Toolbar.

---

# 12. AdminTableSection

Este bloque congela únicamente la **carcasa visual** de la tabla.

Base visual:

```css
border: 1px solid var(--color-border);
border-radius: 14px;
background: var(--color-surface);
overflow: hidden;
```

Debe:

- separar claramente la tabla del workspace;
- mantener borde uniforme;
- usar la misma superficie en módulos comparables;
- integrarse visualmente con Result Count Row;
- preservar el overflow necesario para tablas amplias.

---

# 13. Encabezado general de tabla

En Bloque B se permite normalizar únicamente:

- fondo general del `thead`;
- borde/separación visual;
- relación con Table Shell.

No se autoriza todavía:

- decidir ancho de columnas;
- decidir alineación por tipo;
- rediseñar contenido del header;
- introducir sort por columnas.

---

# 14. Paginación

La paginación existente se preserva funcionalmente.

Este bloque solo puede normalizar:

- separación respecto a Table Shell;
- ubicación general;
- spacing;
- integración visual.

No modificar:

- cálculos;
- handlers;
- page size;
- query;
- backend.

---

# 15. Aplicación por módulo

## Control

Referencia principal.

Orden objetivo:

1. Topbar;
2. Toolbar Surface;
3. QuickFilterChip / información de período;
4. Result Count Row;
5. Table Section;
6. paginación.

Cambios mínimos: Control sirve de patrón.

## Productos

Orden objetivo:

1. Topbar;
2. Toolbar Surface;
3. Result Count Row;
4. Table Section;
5. paginación.

## Grupos

Orden objetivo:

1. Topbar;
2. AdminSectionIntro;
3. Toolbar Surface;
4. Result Count Row;
5. Table Section;
6. paginación si aplica.

## Incidencias

Orden objetivo:

1. Topbar;
2. Toolbar Surface;
3. texto operativo/explicativo;
4. Result Count Row;
5. Table/List Section.

## Catálogo

Orden objetivo:

1. Topbar;
2. StateView;
3. contenido específico del workflow;
4. Result Count Row cuando corresponda;
5. Table Section cuando exista tabla comparable.

No convertir Catálogo en Toolbar genérica.

---

# 16. Responsive

Este bloque no rediseña tablas responsive en profundidad.

Debe preservar:

- reflow de Toolbar;
- wrapping de Secondary Row;
- legibilidad de Result Count Row;
- overflow de Table Shell;
- geometría responsive ya congelada para controles.

No transformar todavía tablas en cards/listas.

---

# 17. Regla de implementación

La implementación se divide obligatoriamente en dos prompts.

## Prompt 1

Implementar exclusivamente:

> Bloque A — Secciones, Toolbar y jerarquía previa a tabla

Debe detenerse antes de Table Shell.

## Prompt 2

Solo después de validación técnica + smoke humano del Prompt 1:

> Bloque B — Table Shell

Debe detenerse antes de Columnas y filas.

---

# 18. Validación

Para cada prompt:

- `bun test --reporter=dot`;
- `bun run lint`;
- `bun run build`;
- `git diff --check`.

Smoke humano proporcional.

---

# 19. Criterio de cierre

Este bloque se considerará cerrado cuando:

1. las secciones superiores compartan lenguaje visual;
2. labels estén normalizados;
3. Toolbar Surface sea consistente;
4. Secondary Row tenga ubicación estable;
5. Result Count Row sea consistente;
6. Table Shell sea consistente;
7. no se hayan rediseñado columnas ni filas;
8. no existan regresiones funcionales.

---

# 20. Estado final

> **SOLOG — UI Admin — Secciones y Tablas Base V1: APROBADO Y CONGELADO.**
