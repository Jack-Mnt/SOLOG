# SOLOG — Admin Primitives de Controles V1

**Archivo:** `SOLOG_UI_Admin_Primitives_Controles_V1.md`  
**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — normalización visual frontend/Admin  
**Fecha:** 2026-09-14

---

# 1. Propósito

Este documento congela el **primer corte de normalización visual de Admin**.

El objetivo es implementar únicamente las primitives y reglas visuales ya aprobadas antes de continuar con el rediseño detallado de tablas, columnas, filas y overlays.

Principio del corte:

> **Normalizar estructura, acciones, filtros, estados rápidos y ordenamiento antes de intervenir tablas y módulos con mayor profundidad.**

---

# 2. Fuente primaria y prioridad

Este documento es la **fuente primaria para la implementación de este primer corte de Admin**.

Fuentes relacionadas:

1. contratos funcionales/backend vigentes;
2. `docs/SOLOG_UI_Sistema_Visual_V1.md`;
3. `docs/SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md`;
4. este documento para el alcance concreto de la implementación.

Ante contradicciones:

- contratos funcionales/backend prevalecen;
- `SOLOG_UI_Sistema_Visual_V1.md` prevalece para lenguaje visual global;
- este documento prevalece para las decisiones específicas de este corte de Admin.

---

# 3. Alcance congelado

Este corte incluye únicamente:

1. Shell/Admin existente — preservar.
2. Topbar/Header — preservar estructura actual.
3. Regla de título único de página.
4. Sistema de botones.
5. Sistema de IconButton.
6. AdminToolbar.
7. AdminSearch.
8. AdminFilter.
9. PeriodFilter prioritario cuando corresponda.
10. AdminToolbarActions.
11. QuickFilterChip.
12. StateView.
13. StatusBadge.
14. AttributeBadge.
15. AdminResultCount.
16. AdminTableBar.
17. AdminSort con `ArrowDownWideNarrow`.
18. Selector de sede responsive:
    - opciones visibles en desktop;
    - dropdown en pantallas estrechas.
19. Normalización responsive de estas primitives.

---

# 4. Fuera de alcance

Quedan expresamente fuera de este corte:

- rediseño detallado de tablas;
- columnas;
- densidad de filas;
- alineación numérica;
- responsive específico de tablas;
- transformación de tablas a listas/cards;
- modal/dialog;
- drawer;
- pop-up;
- overlays;
- rediseño completo de cada módulo;
- backend;
- Supabase;
- contratos;
- lógica de negocio;
- navegación funcional.

Estas áreas se revisarán en bloques posteriores.

---

# 5. Shell y Header

## Shell

El Shell Admin actual se considera prácticamente consolidado.

Debe preservarse:

- sidebar Navy;
- navegación;
- comportamiento expandido/colapsado;
- identidad SOLOG;
- selector de apariencia;
- estructura del workspace.

No se autoriza un rediseño del Shell.

## Header / Topbar

Se preservan dos variantes:

### Módulo por sede

Debe mostrar contexto/selector de sede.

### Módulo global

Debe mostrar branding Puerto Rico en lugar de inventar un contexto `Todas las sedes`.

---

# 6. Regla de título único

Cada página Admin tendrá **un único título principal**, alojado en la Topbar.

No debe repetirse inmediatamente un segundo título equivalente dentro del contenido.

Los títulos internos solo se mantienen cuando representan **secciones reales**.

Ejemplo válido:

```text
Dispositivos

Tablets por sede
Solicitudes pendientes
```

---

# 7. Sistema de botones

Se congela:

```text
Button
├─ Primary
├─ Secondary
└─ Danger
   └─ size: Default | Compact

IconButton
└─ semantic: Default | Danger
```

---

# 8. Button Primary

Uso:

- acción principal de la página o bloque;
- una o muy pocas acciones dominantes.

Ejemplos:

- `Crear grupo`;
- `Revisar publicación`.

Debe incluir icono cuando exista una representación clara de la acción.

Visual:

- fondo `color-primary`;
- texto de contraste;
- icono + texto;
- borde coherente con el color primario;
- sin sombra en reposo;
- hover con cambio ligero y sombra discreta;
- focus explícito;
- disabled legible.

---

# 9. Button Secondary

Uso:

- acciones complementarias;
- herramientas no dominantes.

Ejemplos:

- `Descargar ajuste`;
- `Administrar categorías`.

Visual:

- fondo `surface`;
- borde;
- texto/icono con color primario;
- sin sombra en reposo;
- hover con `primary-soft/subtle`;
- sombra ligera únicamente en hover si mejora percepción.

El botón consolidado de Dashboard se utiliza como referencia principal.

---

# 10. Button Danger

Uso:

- acciones destructivas o de pérdida/revocación.

Ejemplo:

- `Revocar`.

Visual:

- semántica `danger`;
- fondo danger-soft;
- borde danger;
- texto/icono danger;
- sin glow;
- sin sombra en reposo;
- hover ligeramente más marcado.

No depende de la paleta seleccionada.

> Danger comunica consecuencia, no prioridad.

---

# 11. Tamaños

## Default

Aproximadamente:

- altura: 40 px;
- padding horizontal: 14–16 px;
- radio: 12 px;
- gap icono/texto: 7–8 px.

## Compact

Para acciones repetidas o contextos densos:

- altura: 34–36 px;
- padding horizontal: 10–12 px;
- radio: 10–12 px;
- sin sombra en reposo.

`Compact` es una densidad, no una nueva jerarquía visual.

---

# 12. IconButton

## Default

Para:

- editar;
- ver;
- expandir;
- contraer;
- cerrar;
- acciones compactas.

Visual:

- geometría consistente;
- fondo neutro;
- borde discreto;
- sin sombra en reposo;
- hover/focus visibles.

## Danger

Para acciones destructivas compactas.

Ejemplo aprobado:

- `CircleOff` para `Proponer eliminación`.

Debe usar:

- `aria-label`;
- tooltip/title apropiado;
- semántica danger;
- reposo visual contenido;
- danger-soft en hover.

Las propuestas de eliminación/exclusión no deben ocupar botones textuales largos si un IconButton accesible comunica mejor la acción.

---

# 13. Regla de sombras

Se elimina el uso de sombras/glows permanentes como recurso de jerarquía.

```text
Reposo   → sin sombra
Hover    → sombra ligera opcional
Focus    → outline/ring funcional
Disabled → sin sombra
```

---

# 14. AdminToolbar

Primitive aprobada:

```text
AdminToolbar
├─ PeriodFilter        # cuando corresponda
├─ AdminSearch
├─ AdminFilter
└─ AdminToolbarActions
```

Visual:

- superficie secundaria clara;
- borde fino;
- radio de panel;
- sin sombra en reposo;
- padding compacto;
- controles alineados;
- labels pequeñas;
- acciones a la derecha en desktop.

---

# 15. Orden de Toolbar

## Desktop normal

```text
[ Buscar........................ ] [ Filtro ] [ Filtro ] [ Acción ]
```

## Desktop con filtro de período prioritario

Cuando exista el componente específico de período y sea funcionalmente prioritario, como en Control:

```text
[ Período ] [ Buscar............ ] [ Filtro ] [ Acción ]
```

El filtro de período es la única excepción aprobada al orden normal.

---

# 16. AdminSearch

Reglas:

- icono `Search`;
- label `Buscar` cuando corresponda;
- placeholder específico del módulo;
- misma altura que selects;
- prioridad horizontal en desktop;
- mismo radio/borde que otros controles;
- focus con color de apariencia;
- sin sombra permanente.

No se aprueba botón permanente de `Restablecer filtros`.

---

# 17. AdminFilter

Tipos principales:

## Select

Para:

- Estado;
- Categoría;
- Modalidad;
- otros conjuntos relativamente amplios.

## Chips

Solo para conjuntos pequeños y de uso rápido cuando realmente funcionen como selección/filtro.

La sede no se trata como filtro ordinario: es contexto de página.

---

# 18. AdminToolbarActions

Las acciones van a la derecha en desktop.

Regla orientativa:

- 0–2 acciones principales visibles.

Si existen demasiadas acciones, deben reevaluarse como:

- acción de fila;
- IconButton;
- menú;
- otra sección;
- dialog.

---

# 19. QuickFilterChip

Caso de referencia: Control.

Representa un subconjunto del **mismo dataset**.

Ejemplo:

```text
[ Total 26 ] [ Coinciden 15 ] [ Recontar 11 ] [ Confirmadas 0 ]
```

Características:

- interactivo;
- contador visible;
- color semántico cuando aporta significado;
- hover;
- focus;
- estado activo;
- `aria-pressed` cuando corresponda;
- sin sombra permanente.

Los colores de Control se preservan porque aportan información operativa.

---

# 20. StateView

Caso de referencia: Catálogo.

Representa estados/vistas de una secuencia o workflow.

Ejemplo:

```text
Pendientes
Aprobados
Ignorados
Incorporados
```

No debe tratarse como filtro del mismo dataset.

Características:

- navegación local entre vistas;
- contador;
- responsive;
- estado activo más estructural que QuickFilterChip;
- semántica tipo tabs cuando técnicamente corresponda;
- color semántico moderado.

---

# 21. StatusBadge

Representa estado informativo y no es interactivo.

Ejemplos:

- Pendiente;
- Confirmada;
- Coincide;
- Ignorada;
- Autorizado.

Características:

- compacto;
- semántico;
- sin hover de botón;
- sin cursor pointer;
- sin sombra;
- interpretable sin depender únicamente del color.

---

# 22. AttributeBadge

Representa una propiedad, no un estado ni filtro.

Ejemplos:

- Único;
- Agrupado;
- Manual;
- Automático.

Características:

- pequeño;
- fondo neutro o primary-soft muy leve;
- sin sombra;
- sin hover;
- sin apariencia de CTA.

`Único` en Grupos debe perder el glow/jerarquía excesiva actual.

---

# 23. Ubicación de QuickFilterChip / StateView

No deben integrarse dentro de `AdminToolbar`.

Orden aprobado:

```text
AdminToolbar
↓
QuickFilterChip / StateView
↓
AdminTableBar
↓
Tabla / contenido
```

---

# 24. AdminResultCount

Formato:

```text
37 de 484 resultados
```

Si no existe filtro:

```text
484 resultados
```

Ubicación:

- parte superior izquierda inmediatamente antes de la tabla/listado.

No mostrar frases técnicas relacionadas con estado interno de carga/backend.

---

# 25. AdminTableBar

Primitive aprobada:

```text
AdminTableBar
├─ AdminResultCount
└─ AdminSort
```

Visual:

```text
37 de 484 resultados                         [ Ordenar ]
────────────────────────────────────────────────────────
Tabla
```

---

# 26. AdminSort

El ordenamiento deja de tratarse como filtro de Toolbar.

Se utilizará:

- `IconButton Default`;
- icono `ArrowDownWideNarrow`;
- esquina superior derecha de la tabla/listado.

Debe incluir:

- `aria-label="Ordenar resultados"`;
- tooltip `Ordenar`;
- estado activo cuando existe orden distinto del predeterminado;
- menú/popover con opciones específicas del módulo.

Debe existir `Predeterminado`.

Cuando el orden esté activo:

- icono puede usar `color-primary`;
- fondo `primary-subtle`;
- tooltip puede reflejar el orden efectivo.

---

# 27. Orden global vs orden de columnas

## Orden global del dataset

Usa `AdminSort`.

## Ordenamiento por columna

Pertenece al header de la tabla y se definirá en el bloque posterior de Tablas/Columnas.

No se deben implementar ambas soluciones simultáneamente salvo necesidad real.

---

# 28. Responsive de Toolbar

Admin sigue siendo desktop-first.

## Desktop

```text
Search → Filters → Actions
```

o:

```text
Period → Search → Filters → Actions
```

cuando exista período prioritario.

## Pantallas estrechas

Orden aprobado:

```text
Filters
↓
Search
↓
Actions
↓
QuickFilterChip / StateView
↓
AdminTableBar
```

La intención es permitir primero acotar por filtros y después buscar específicamente.

No comprimir controles hasta volverlos incómodos solo para mantener una fila.

---

# 29. Selector de sede responsive

## Desktop / ancho suficiente

Mantener opciones visibles:

```text
Sede   Cutervo | Huaca | Divino | Unidad | Casua
```

## Pantallas estrechas

Convertir a dropdown:

```text
Sede
[ Cutervo                         v ]
```

Debe preservar:

- mismas sedes;
- misma selección;
- misma lógica;
- mismo contrato.

Es un cambio únicamente de presentación.

---

# 30. Responsive de chips/vistas

QuickFilterChip y StateView deben permanecer visibles.

No convertirlos a dropdown en pantallas estrechas.

Preferencia:

- wrap antes que scroll horizontal;
- mantener cantidades visibles;
- mantener acceso de un toque.

La sede sí cambia a dropdown; los estados/vistas no.

---

# 31. Módulos de referencia

| Módulo | Madurez aproximada | Rol |
|---|---:|---|
| Shell | 99% | Preservar |
| Dispositivos | 99% | Cards, Danger, secciones |
| Dashboard | 90% | Botón consolidado |
| Control | 80% | Toolbar, período, chips, resultados |
| Catálogo | 50% | StateView / workflow |
| Grupos | 30% | Normalización importante |
| Productos | 20% | Normalización importante |
| Incidencias | 10% | Mayor simplificación visual |

---

# 32. Regla de implementación de este corte

Este bloque **no autoriza todavía el rediseño minucioso de cada módulo**.

La implementación debe:

1. crear/normalizar las primitives aprobadas;
2. aplicarlas donde el patrón sea claro y no cambie funcionalidad;
3. eliminar inconsistencias visuales directamente relacionadas con este documento;
4. preservar composiciones especializadas;
5. detenerse antes de intervenir tablas/columnas en profundidad.

Si aparece una decisión que depende del diseño futuro de tablas, debe dejarse intacta y reportarse.

---

# 33. Validación requerida

Como mínimo:

- `bun test --reporter=dot`;
- `bun run lint`;
- `bun run build`;
- `git diff --check`.

Smoke humano:

- Shell;
- Dashboard;
- Control;
- Catálogo;
- Productos;
- Grupos;
- Incidencias;
- Dispositivos;
- responsive desktop/estrecho;
- selector de sede responsive;
- paletas;
- hover/focus/disabled;
- QuickFilterChip;
- StateView;
- AdminSort.

No deben realizarse cambios backend.

---

# 34. Criterio de cierre

Este primer corte se considerará cerrado cuando:

1. Button/IconButton tengan lenguaje común;
2. Toolbar/filtros/búsqueda estén normalizados;
3. QuickFilterChip y StateView estén diferenciados;
4. badges informativos tengan jerarquía consistente;
5. AdminResultCount esté normalizado;
6. ordenamiento global esté separado de filtros;
7. selector de sede sea responsive;
8. no existan regresiones funcionales;
9. tablas/columnas permanezcan fuera de alcance salvo ajustes mínimos de integración.

---

# 35. Siguiente bloque

Después de implementar, validar y cerrar este documento se abrirá:

> **Admin — Tablas, columnas y filas**

Ese bloque se definirá con mayor minuciosidad antes de cualquier implementación.

---

# 36. Estado final

> **SOLOG — Admin Primitives de Controles V1: APROBADO Y CONGELADO.**
