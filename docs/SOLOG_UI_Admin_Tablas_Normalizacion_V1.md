# SOLOG — UI Admin — Normalización de Tablas V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — normalización frontend/Admin  
**Fecha:** 2026-09-18

## 1. Propósito

Normalizar las tablas principales del Admin sin modificar la composición funcional de la información ya aprobada.

Este bloque puede modificar:

- markup HTML interno;
- clases CSS;
- semántica de `th`, `td`, `span`, `small`, `strong`, `p`, wrappers y botones;
- densidad visual;
- alineación;
- tipografía;
- acciones de fila;
- sticky header;
- hover/focus de tabla.

No puede modificar:

- columnas;
- orden de columnas;
- datos mostrados;
- acciones disponibles;
- filtros;
- sort;
- paginación;
- modales/drawers como composición funcional;
- backend, Supabase, RPC o contratos.

## 2. Fuente primaria y precedencia

Este documento es la fuente primaria para la normalización de las tablas principales Admin.

Continúan vigentes, salvo en los puntos reemplazados explícitamente aquí:

1. `docs/SOLOG_UI_Admin_Composicion_Tablas_V1.md`
2. `docs/SOLOG_UI_Admin_Secciones_Tablas_Base_V1.md`
3. `docs/SOLOG_Correccion_Admin_Primitives_Tablas_V1.md`
4. `docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`

La composición de columnas y contenido congelada previamente no se reabre.

## 3. Tablas incluidas

Solo las tablas principales de:

- Dashboard;
- Control;
- Catálogo;
- Productos;
- Grupos;
- Incidencias.

Dispositivos queda fuera porque no contiene tablas principales.

También quedan fuera de la normalización principal:

- tablas dentro de modales;
- tablas dentro de drawers;
- tablas dentro de dialogs;
- tablas auxiliares o de detalle.

## 4. Nueva separación de responsabilidades

La clase histórica:

`admin-v2-table`

se retira.

Se divide en dos familias explícitas.

### 4.1. `admin-main-table`

Se utilizará exclusivamente en las tablas principales cubiertas por este bloque.

Es la clase autoritativa para:

- densidad de filas;
- tipografía;
- sticky header;
- hover;
- celdas de identidad;
- numéricos;
- columna de acciones;
- IconButton dentro de tabla;
- accesibilidad estructural.

### 4.2. `admin-auxiliary-table`

Se utilizará para tablas auxiliares:

- modales;
- drawers;
- dialogs;
- detalles secundarios;
- popups equivalentes.

En este bloque se permite una normalización mínima para dejar preparada la familia:

- overflow horizontal;
- tabla al 100%;
- border-collapse coherente;
- padding básico de celdas;
- border-bottom;
- vertical-align;
- tipografía base.

No se aplican todavía a `admin-auxiliary-table`:

- contrato completo de acciones;
- sticky header obligatorio;
- hover uniforme;
- utilities de identidad;
- alineación numérica común;
- rediseño de detalles internos.

Eso quedará para un bloque posterior específico.

## 5. Contrato base de `admin-main-table`

Para tablas ordinarias:

- padding de `th/td`: 8px 12px;
- font-size de cuerpo: 0.8rem;
- vertical-align: middle;
- border-bottom: 1px solid `var(--color-border)`;
- fondo base: `var(--color-surface)`.

Dashboard conserva excepciones de matriz numérica cuando sean necesarias.

## 6. Thead y sticky header

Todas las tablas principales normalizan el header:

- `position: sticky`;
- `top: 0`;
- z-index suficiente para permanecer por encima del tbody;
- fondo `var(--color-surface-secondary)`;
- color `var(--color-text-secondary)`;
- font-size: 0.75rem;
- font-weight: 600;
- border-bottom coherente con Table Shell.

Dashboard puede mantener una excepción adicional para su primera columna sticky y sus intersecciones de z-index.

## 7. Semántica HTML

Se normaliza:

- encabezados de columna → `<th scope="col">`;
- identidad principal de fila cuando corresponda → `<th scope="row">`;
- celdas de datos → `<td>`.

Control e Incidencias deben añadir `scope="col"` en sus headers.

Dashboard debe usar `scope="row"` para Madrugada, Día, Noche y Total.

Cambiar el elemento HTML está permitido si no modifica el contenido ni la composición aprobada.

## 8. Identidad principal/secundaria

Se introducen clases comunes de bajo nivel:

- `admin-table-cell-stack`;
- `admin-table-cell-primary`;
- `admin-table-cell-secondary`.

Contrato:

- stack vertical;
- principal como identidad visual;
- secundario con color `text-secondary`;
- sin introducir datos nuevos;
- wrapping/truncado según el contexto existente.

Estas utilities pueden reemplazar patrones equivalentes de Catálogo e Incidencias.

También pueden reutilizarse en celdas de información primaria/secundaria que tengan la misma mecánica visual, sin confundir semánticas distintas.

## 9. Numéricos

Para tablas principales ordinarias se introduce:

`admin-table-number`

Contrato:

- `text-align: right`;
- `font-variant-numeric: tabular-nums`.

Se aplica a valores numéricos comparables como:

- diferencia;
- valorizado;
- precio;
- cantidades numéricas cuando corresponda.

Dashboard conserva alineación centrada en su matriz numérica.

## 10. Hover de filas

En tablas principales ordinarias:

`tbody tr:hover → var(--color-surface-secondary)`

Motivo:

- la fila completa no representa una acción;
- evita sugerir que toda la fila es clickeable.

Dashboard puede conservar tratamiento propio.

## 11. Acciones dentro de tablas

Regla general:

> Una acción ordinaria dentro de una tabla principal debe usar `IconButton`.

La primitive `IconButton` se amplía a:

`Default | Primary | Warning | Danger`

Semántica:

- Default → acción neutra/informativa;
- Primary → acción positiva/reversible destacada;
- Warning → acción preventiva o de supresión temporal;
- Danger → acción destructiva.

Debe conservar:

- `aria-label`;
- `title` cuando ayude;
- estado disabled;
- focus-visible;
- icono Lucide;
- lógica/handler existente.

## 12. Wrapper de acciones

Se introducen:

- `admin-table-action-cell`;
- `admin-table-actions`.

Contrato:

- celda de acciones centrada;
- acciones en inline-flex/flex;
- gap: 6px;
- nowrap;
- IconButton usa la geometría Admin vigente;
- responsive <=560 px conserva la geometría responsive ya congelada.

## 13. Excepción — Dashboard porcentaje

El control de porcentaje del Dashboard no es un IconButton puro porque necesita mostrar el porcentaje.

Se normaliza como acción especializada reutilizable:

`admin__percentage-action`

Su responsabilidad es representar:

`[ porcentaje + icono ]`

Puede reutilizarse posteriormente en otros contextos donde una acción necesite mostrar un porcentaje.

No debe heredar semántica de IconButton puro.

## 14. Excepción — Grupos / Integrantes

El control Integrantes conserva:

- icono `Package`;
- hover `PackageOpen`;
- cantidad o etiqueta `Único`;
- handler/modal existente.

No se convierte a IconButton porque la cantidad visible es información necesaria.

## 15. Módulos

### Dashboard

- usar `admin-main-table`;
- sticky header normalizado;
- row headers semánticos;
- conservar matriz centrada;
- conservar primera columna sticky;
- reemplazar la falsa clase `icon-button` del porcentaje por `admin__percentage-action`.

### Control

- usar `admin-main-table`;
- añadir `scope="col"`;
- normalizar numéricos a derecha;
- acción Detalle → `IconButton`;
- columna de acción → contrato común.

### Catálogo

- usar `admin-main-table`;
- preservar `Tipo | Producto | Cambio | Origen | Acción`;
- conservar lectura accesible anterior → nuevo;
- acción Eye → `IconButton Default`;
- identidad principal/secundaria → utilities comunes.

### Productos

- usar `admin-main-table`;
- preservar composición actual;
- conservar `IconButton Primary/Danger`;
- aplicar contrato común de acciones;
- precio → numeric utility.

### Grupos

- usar `admin-main-table`;
- preservar Integrantes especializado;
- conservar Pencil y CircleDollarSign como IconButton;
- aplicar wrapper común de acciones;
- Valorizado → alineación numérica coherente sin eliminar información secundaria.

### Incidencias

- usar `admin-main-table`;
- preservar columnas y acciones actuales por StateView;
- añadir `scope="col"`;
- identidad Producto/código → utilities comunes;
- botones manuales → `IconButton`;
- Ignorar 30 días → `variant="warning"`;
- eliminar wrappers históricos de acciones cuando sean reemplazados por el patrón común.

## 16. Tablas auxiliares

Las tablas excluidas de este bloque deben migrar nominalmente de:

`admin-v2-table`

a:

`admin-auxiliary-table`

sin rediseñar su composición.

Se permite únicamente ajustar su CSS base para evitar depender de la clase retirada.

## 17. Fuera de alcance

- cambiar composición de columnas;
- cambiar información visible;
- crear o eliminar acciones;
- cambiar StateView;
- modificar filtros;
- modificar sort;
- modificar paginación;
- convertir tablas responsive en cards;
- rediseñar dialogs/drawers;
- backend/Supabase;
- refactors generales.

## 18. Validación requerida

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Smoke humano mínimo:

- Dashboard;
- Control;
- Catálogo;
- Productos;
- Grupos;
- Incidencias;
- sticky headers;
- scroll horizontal;
- IconButton Default/Primary/Warning/Danger;
- hover de filas;
- foco por teclado;
- tablas auxiliares en al menos un dialog/drawer para comprobar ausencia de regresión.

## 19. Estado final

> **SOLOG — UI Admin — Normalización de Tablas V1: APROBADO Y CONGELADO.**
