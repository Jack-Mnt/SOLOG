# SOLOG — Admin Primitives de Controles — Plan de Implementación V1

**Archivo:** `SOLOG_UI_Admin_Primitives_Controles_Plan_Implementacion_V1.md`  
**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — normalización visual frontend/Admin  
**Fecha:** 2026-09-14

---

# 1. Fuente primaria

La fuente primaria funcional y visual de esta implementación es:

`docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`

Fuentes vinculantes adicionales:

- `docs/SOLOG_UI_Sistema_Visual_V1.md`
- `docs/SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md`
- `docs/Flujo_de_desarrollo_eficiente_V1.md`
- contratos funcionales/backend vigentes

Ante contradicciones:

1. contratos funcionales/backend prevalecen sobre cualquier decisión visual;
2. `SOLOG_UI_Sistema_Visual_V1.md` prevalece para lenguaje visual global;
3. `SOLOG_UI_Admin_Primitives_Controles_V1.md` prevalece para las decisiones específicas de este corte;
4. este documento prevalece únicamente para la secuencia técnica de implementación.

---

# 2. Objetivo

Implementar el primer corte de normalización visual de Admin sin entrar todavía en el rediseño minucioso de tablas, columnas, filas u overlays generales.

El objetivo técnico es consolidar:

- Button / IconButton;
- Toolbar;
- Search;
- Filters;
- PeriodFilter;
- QuickFilterChip;
- StateView;
- StatusBadge;
- AttributeBadge;
- AdminResultCount;
- AdminTableBar;
- AdminSort;
- selector de sede responsive;
- títulos redundantes dentro del alcance aprobado.

La implementación debe preservar comportamiento, handlers, estado, contratos y lógica existente.

---

# 3. Baseline técnico

El bloque de arquitectura CSS anterior está cerrado.

Admin carga actualmente:

`src/features/solog/admin/admin.css`

desde la frontera lazy:

`src/features/solog/admin/admin.v2.app.tsx`

No existe import activo de `admin.v2.css`.

Baseline validado al cierre anterior:

- `bun test --reporter=dot`: 364 passed;
- `bun run lint`: correcto;
- `bun run build`: correcto;
- `git diff --check`: correcto;
- CSS Admin emitido: 102.50 kB raw / 15.39 kB gzip.

Este baseline sirve como referencia para detectar regresiones.

---

# 4. Hallazgos del preflight

## 4.1. Primitives actuales

| Patrón aprobado | Estado actual | Ubicaciones principales |
|---|---|---|
| Button / IconButton | Clases dispersas y variantes locales | `admin.css`, módulos Admin |
| Toolbar / filters | Varios patrones locales | Control, Productos, Grupos, Incidencias |
| Search | Implementaciones locales | Control, Productos, Grupos, Incidencias |
| QuickFilterChip | Ya existe comportamiento equivalente | Control |
| StateView | Ya existe navegación local por estado | Catálogo |
| StatusBadge | Tratamientos locales | varios módulos |
| AttributeBadge | Tratamientos locales | Productos, Grupos |
| ResultCount / TableBar | Conteos/paginación locales | Control, Productos, Grupos, Incidencias |
| Sort | Selects dentro de filtros | Productos, Grupos |
| Selector de sede | Centralizado en Shell | `admin.v2.app.tsx`, `admin.site-ui.ts` |

No existe actualmente una librería de primitives Admin reutilizable.

## 4.2. CSS frente a JSX mínimo

### Principalmente CSS

- geometría/tamaños de Button;
- variantes de IconButton;
- Toolbar;
- Search;
- Filter;
- QuickFilterChip;
- StateView;
- StatusBadge;
- AttributeBadge;
- ResultCount;
- TableBar;
- responsive;
- eliminación de sombras/glows permanentes.

### JSX mínimo y localizado

- variantes semánticas;
- atributos accesibles;
- extracción de markup repetido cuando exista reutilización real;
- mover visualmente el sort fuera de Toolbar;
- selector de sede responsive;
- retirar títulos realmente duplicados.

---

# 5. Regla especial — ControlPeriodSelect

Existe un componente específico de período dentro de:

`src/features/solog/admin/control/admin.control.v2.tsx`

Debe preservarse íntegramente su comportamiento.

Actualmente participa en:

- estado local `period`;
- rango personalizado `from` / `to`;
- validación;
- cache por payload;
- construcción del payload de `control_groups`;
- habilitación de contenido;
- reinicialización por sede mediante `key={site}`.

El plan exige:

- reutilizar `ControlPeriodSelect`;
- NO reemplazarlo por un select genérico;
- NO duplicar su lógica;
- NO mover su lógica a una primitive;
- mantenerlo primero en la Toolbar de Control;
- adaptar únicamente presentación/clases/integración visual cuando sea necesario;
- preservar fechas custom, validación y comportamiento por sede.

La discrepancia histórica con referencias a `admin.control.period.ts` no constituye bloqueo. Si una prueba inspecciona una ruta obsoleta, debe actualizarse solo en lo estrictamente necesario, preservando la intención original.

---

# 6. Restricciones generales

Durante esta implementación:

- no modificar backend;
- no modificar Supabase;
- no modificar contratos;
- no modificar lógica de negocio;
- no modificar navegación funcional;
- no rediseñar tablas/columnas/filas;
- no trabajar dialogs, drawers, pop-ups ni overlays generales;
- no hacer refactors generales no relacionados;
- preservar cambios preexistentes;
- preservar composiciones especializadas de cada módulo;
- no introducir nuevas abstracciones sin reutilización real.

Si surge un bloqueo que exige cambiar una decisión congelada, detenerse y reportarlo. No rediseñar automáticamente.

---

# 7. Regla de abstracción

No toda primitive visual debe convertirse en un componente React.

Criterio:

- extraer componente React cuando exista reutilización real de markup, comportamiento o accesibilidad;
- usar CSS común/modificadores cuando eso sea suficiente;
- evitar una librería excesiva de componentes presentacionales triviales;
- primitives React deben ser pequeñas, controladas por props, sin hooks propios de negocio y sin estado funcional.

Un archivo como `admin.primitives.tsx` puede utilizarse si el inventario confirma que reduce duplicación real.

---

# 8. Excepción autorizada — AdminSort

Aunque overlays generales están fuera de alcance, se autoriza explícitamente:

`AdminSort → IconButton ArrowDownWideNarrow → popover/menu mínimo anclado`

Este popover forma parte de la primitive `AdminSort`.

Puede:

- mostrar las opciones de orden existentes;
- marcar la opción activa;
- permitir volver a `Predeterminado`;
- cerrar por selección, click externo y Escape cuando corresponda;
- mantener accesibilidad mínima necesaria.

No puede utilizarse como excusa para:

- crear un sistema general de Popover;
- rediseñar pop-ups de Incidencias;
- intervenir dialogs;
- intervenir drawers;
- normalizar overlays de otros módulos.

---

# 9. Dashboard y Dispositivos

Dashboard y Dispositivos son referencias visualmente maduras.

No crear una `AdminToolbar` allí solo por uniformidad.

Solo se permite normalizar:

- Button;
- IconButton;
- Badge;
- controles ya existentes;

cuando correspondan directamente a primitives congeladas.

No modificar su composición consolidada sin necesidad concreta.

---

# 10. Fases de implementación

## Fase A — Inventario ejecutable y contrato de primitives

### Objetivo

Crear la matriz definitiva de consumidores y variantes antes de reutilizar markup o alterar producción.

### Trabajo

1. Catalogar cada:
   - Button;
   - IconButton;
   - Toolbar;
   - Search;
   - Filter;
   - QuickFilterChip;
   - StateView;
   - StatusBadge;
   - AttributeBadge;
   - ResultCount;
   - sort;
   - selector de sede relacionado.

2. Identificar:
   - módulos consumidores;
   - clases CSS actuales;
   - handlers/estado asociados;
   - variantes funcionales;
   - duplicaciones reales;
   - patrones que deben permanecer locales.

3. Identificar títulos de contenido que dupliquen realmente la Topbar.

4. Definir la API mínima propuesta para primitives reutilizables:
   - props;
   - variantes;
   - tamaño;
   - atributos accesibles;
   - clases/modificadores.

5. Identificar qué debe resolverse con:
   - CSS únicamente;
   - JSX mínimo;
   - componente React reutilizable.

6. Confirmar específicamente el contrato existente de `ControlPeriodSelect`.

### No modificar

- producción;
- comportamiento;
- modelos de sort;
- payloads;
- `ControlPeriodSelect`;
- tablas;
- columnas;
- filas;
- dialogs/overlays;
- backend.

### Validación

La fase es principalmente de inspección. Si se genera únicamente documentación/inventario y no se toca producción:

- `git diff --check` sobre cualquier archivo creado/modificado;
- pruebas adicionales solo si una modificación técnica real las hace necesarias.

### Entregable

Reporte de Fase A con:

- matriz por módulo;
- API mínima recomendada;
- mapa CSS vs JSX vs componente;
- archivos probables;
- riesgos;
- bloqueos;
- discrepancias encontradas;
- recomendación concreta para Fase B.

### Criterio de cierre

Existe un inventario suficientemente preciso para implementar sin inferir sobre la marcha.

**Después de Fase A, detenerse y esperar aprobación.**

---

## Fase B — Primitive base y CSS común de Admin

### Objetivo

Normalizar las primitives comunes aprobadas.

### Alcance

- Button;
- IconButton;
- AdminToolbar;
- AdminSearch;
- AdminFilter;
- AdminToolbarActions;
- StatusBadge;
- AttributeBadge;
- AdminResultCount;
- AdminTableBar.

### Trabajo

- crear componentes React solo donde el inventario confirme reutilización real;
- crear/modificar clases base en `admin.css`;
- mantener handlers y estado en sus módulos;
- incorporar Primary / Secondary / Danger;
- incorporar Default / Compact;
- IconButton Default / Danger;
- eliminar sombras/glows permanentes dentro del alcance;
- preservar overrides locales especializados.

### Riesgo principal

Abstracción excesiva.

### Mitigación

API mínima, sin estado funcional, sin hooks de negocio y sin generalización prematura.

### Criterio de cierre

Las primitives base existen y pueden adoptarse sin cambiar funcionalidad.

---

## Fase C — Toolbars y filtros por módulos

### Objetivo

Aplicar la estructura congelada a los módulos que ya presentan patrones claros.

### Orden recomendado

1. Control;
2. Productos;
3. Grupos;
4. Incidencias;
5. Catálogo únicamente en superficies de filtro reales;
6. Dashboard/Dispositivos únicamente para normalizar controles existentes, nunca para crear Toolbar artificial.

### Reglas

- Control conserva `ControlPeriodSelect` primero;
- desktop normal: Search → Filters → Actions;
- Control/período prioritario: Period → Search → Filters → Actions;
- estrecho: Filters → Search → Actions;
- no introducir botón permanente de restablecer filtros.

### No modificar

- custom period;
- búsquedas;
- valores de filtros;
- payloads;
- exportación;
- tablas;
- paginación.

### Criterio de cierre

Toolbars equivalentes funcionalmente, responsive y sin cambios de contrato.

---

## Fase D — QuickFilterChip, StateView, badges y conteos

### Objetivo

Aplicar la semántica aprobada.

### Control

Usar `QuickFilterChip`:

- mismo dataset;
- filtro rápido;
- contador;
- color semántico;
- `aria-pressed`;
- estado activo.

### Catálogo

Usar `StateView`:

- navegación local;
- workflow por estados;
- contador;
- estado activo estructural;
- no tratarlo como filtro del mismo dataset.

### Badges

Normalizar:

- `StatusBadge`;
- `AttributeBadge`.

Sin volverlos interactivos cuando no lo son.

### Resultados

Añadir/normalizar:

- `AdminResultCount`;
- `AdminTableBar`;

sin rediseñar tabla o filas.

### Criterio de cierre

Chips, StateViews y badges tienen roles visuales y semánticos distintos, manteniendo conteos correctos.

---

## Fase E — AdminSort, títulos y selector de sede responsive

### Objetivo

Completar los controles congelados sin alterar lógica.

### AdminSort

- mover visualmente el orden global fuera de Toolbar;
- usar `ArrowDownWideNarrow`;
- reutilizar estados/setters/opciones existentes;
- preservar comparadores y orden predeterminado;
- usar únicamente el popover mínimo autorizado;
- incluir `Predeterminado`.

### Títulos

Eliminar solo títulos de contenido que dupliquen inmediatamente la Topbar.

Preservar títulos de secciones reales.

### Selector de sede

Desktop:

- sedes visibles.

Pantalla estrecha:

- dropdown.

Debe reutilizar:

- `orderedAdminSites`;
- `adminSiteLabel`;
- selección/estado actual;
- accesibilidad;
- contexto actual.

### Criterio de cierre

Ningún cambio en comparadores, orden predeterminado, navegación ni selección de sede.

---

## Fase F — Regresión técnica y validación humana

### Validaciones automáticas

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

### Smoke humano

Validar:

- Shell;
- sidebar;
- paletas;
- selector de sede desktop/estrecho;
- Dashboard;
- Control;
- Catálogo;
- Productos;
- Grupos;
- Incidencias;
- Dispositivos;
- Button;
- IconButton;
- hover/focus/disabled;
- `ControlPeriodSelect`;
- rango custom;
- cambio de sede;
- QuickFilterChip;
- StateView;
- ResultCount;
- TableBar;
- AdminSort;
- navegación y recarga directa.

### Criterio de cierre

- sin regresión funcional;
- sin cambios backend;
- sin cambios fuera de controls/primitives;
- tablas/columnas/filas siguen fuera de alcance.

---

# 11. Riesgos conocidos

## Cascada CSS

`admin.css` contiene reglas históricas y locales.

Mitigación:

- primitives base con especificidad controlada;
- modificadores explícitos;
- no depender de aumentar especificidad indiscriminadamente.

## Sort

Productos y Grupos ya poseen lógica real.

Mitigación:

- reutilizar estado/modelos/opciones actuales;
- cambiar solo la interacción/presentación.

## Control

El período forma parte de la consulta.

Mitigación:

- preservar `ControlPeriodSelect` y todo su flujo.

## Selector de sede

Es contexto funcional, no un simple filtro.

Mitigación:

- mantener fuente, orden, label y selección actuales.

## StateView vs QuickFilterChip

No son equivalentes.

Mitigación:

- conservar semántica y estado propios de cada módulo.

## Tests acoplados

Algunas pruebas pueden inspeccionar rutas, clases o componentes concretos.

Mitigación:

- actualizar solo expectativas afectadas;
- no debilitar cobertura;
- preservar intención funcional.

---

# 12. Política de desviaciones

Si Codex encuentra un bloqueo que exige modificar una decisión congelada:

1. detener esa parte de la fase;
2. describir el bloqueo;
3. explicar por qué impide continuar;
4. proponer el cambio mínimo necesario;
5. devolver la decisión a ChatGPT/usuario.

No rediseñar automáticamente.

---

# 13. Secuencia de aprobación

El plan está aprobado y congelado.

La ejecución comienza únicamente por:

> **Fase A — Inventario ejecutable y contrato de primitives**

Al terminar Fase A:

- entregar reporte;
- no iniciar Fase B;
- esperar aprobación explícita.

Las fases siguientes se ejecutarán de manera secuencial con revisión proporcional.

---

# 14. Estado

> **SOLOG — Admin Primitives de Controles — Plan de Implementación V1: APROBADO Y CONGELADO.**
