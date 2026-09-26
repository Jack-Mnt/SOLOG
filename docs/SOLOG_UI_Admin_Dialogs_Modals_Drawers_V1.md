# SOLOG — UI Admin — Dialogs, Modals y Drawers — V1

**Proyecto:** SOLOG  
**Estado:** HISTÓRICO — REEMPLAZADO GLOBALMENTE POR V2  
**Clasificación:** Nivel B — UI/UX frontend/Admin  
**Fecha:** 2026-09-19  
**Rama de trabajo:** `admin-work`

## 1. Propósito

Este documento congeló el contrato visual global inicial para la normalización de Dialogs, Modals y Drawers del Admin de SOLOG.

La fuente primaria global vigente al cierre del bloque es:

`docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V2.md`

V1 se conserva únicamente como trazabilidad histórica de las decisiones iniciales.

El objetivo es establecer una base común, estable y autoritativa antes de revisar individualmente la composición de cada consumidor.

Este contrato no congela todavía la composición interna específica de cada Dialog/Drawer. Esa composición se definirá caso por caso en fases posteriores.

## 2. Fuente primaria y precedencia

Este documento fue la **fuente primaria inicial** para:

- geometría de `AdminDialog`;
- variantes `default`, `wide` y `drawer`;
- Backdrop;
- Header;
- Body;
- Footer;
- responsive de Dialog/Drawer;
- distribución global de acciones;
- scroll lock;
- ownership visual de Dialogs/Drawers.

Se conserva sin reinterpretación el contrato funcional y de accesibilidad congelado en:

- `docs/SOLOG_UX_AdminDialog_Gestion_Foco_V1.md`

Ese documento continúa siendo fuente primaria para:

- Escape;
- backdrop funcional;
- focus trap;
- foco inicial;
- restauración de foco;
- nesting;
- `inert`;
- `closeDisabled`;
- accesibilidad modal.

La fuente responsive general vigente continúa siendo:

- `docs/SOLOG_UI_Admin_Responsive_Shell_Controles_V1.md`

## 3. Primitive única

La única primitive modal del Admin es:

`AdminDialog`

No se crean primitives paralelas como:

- Modal;
- LargeDialog;
- DrawerDialog;
- ExtraWideDialog;
- XLargeDialog.

La presentación se expresa mediante `variant`.

Variantes oficiales:

- `default`;
- `wide`;
- `drawer`.

## 4. Semántica de variantes

### default

Uso principal:

- confirmaciones;
- acciones focalizadas;
- formularios cortos;
- edición simple.

Geometría Desktop/Tablet:

- ancho máximo: **560 px**;
- centrado.

### wide

Uso principal:

- workflows complejos;
- gestión;
- formularios extensos;
- listas moderadas.

Geometría Desktop/Tablet:

- ancho máximo: **820 px**;
- centrado.

### drawer

Uso principal:

- drill-down;
- tablas amplias;
- exploración de información;
- contenido predominantemente consultivo.

Geometría Desktop/Tablet:

- panel lateral derecho;
- ancho máximo global inicial: **960 px**;
- alto completo;
- sin border-radius.

El máximo de 960 px no obliga a que todos los Drawers usen ese ancho. Cada Drawer podrá evaluarse individualmente para usar un ancho menor o una estrategia como `50vw`, siempre dentro del contrato global y sin superar el máximo común.

## 5. Prohibición de tamaños locales

No se permiten overrides locales que redefinan la geometría estructural del Dialog/Drawer.

En particular, un consumidor no debe redefinir mediante `className`:

- width;
- max-width;
- height estructural;
- posicionamiento;
- border-radius;
- responsive del contenedor.

Los casos que hoy requieran una geometría mayor deben reinterpretarse mediante la variante adecuada, normalmente `drawer`.

## 6. Estructura obligatoria

Todo `AdminDialog` debe tener conceptualmente:

```text
AdminDialog
├── Header
├── Body
└── Footer
```

El Footer deja de ser opcional desde el punto de vista del contrato visual.

Si un Dialog no necesita una acción operativa adicional, debe mostrar al menos:

`Cerrar`

## 7. Backdrop

El Backdrop común debe usar:

- oscuridad: **50 %**;
- blur: **4 px**.

Tratamiento objetivo:

```css
background: color-mix(
  in srgb,
  var(--color-dark-surface) 50%,
  transparent
);
backdrop-filter: blur(4px);
```

El Backdrop conserva su comportamiento funcional vigente y no altera las reglas congeladas de cierre por click.

## 8. Border radius

`default` y `wide` conservan:

`border-radius: var(--radius-panel)`

`drawer` conserva:

`border-radius: 0`

## 9. Header

Contrato visual:

- padding: **12px 16px**;
- título: **1rem**;
- descripción: **0.75rem**;
- separación título/descripción: **4 px**;
- botón cerrar a la derecha;
- borde inferior;
- sin scroll.

El Header permanece visible mientras el Body hace scroll.

## 10. Body

Contrato exterior:

- padding: **16px**;
- `min-height: 0`;
- `overflow: auto`.

El Body es el único área principal scrollable del Dialog/Drawer.

No se congela todavía una composición interior común mediante `display`, `gap` o layout obligatorio.

La composición interna se revisará individualmente por consumidor.

## 11. Footer obligatorio

El Footer forma parte estructural de todos los Dialogs/Drawers.

Desktop/Tablet:

- padding: **12px 16px**;
- borde superior;
- misma superficie del Dialog;
- gap: **8px**;
- sin scroll;
- acciones globales alineadas a la derecha.

Orden estándar:

```text
[ Secundaria ] [ Primaria ]
```

Acción destructiva:

```text
[ Cancelar ] [ Acción danger ]
```

Una sola acción:

```text
[ Cerrar ]
```

## 12. Footer Mobile

En Mobile:

- botones `width: 100%`;
- stack vertical;
- gap uniforme;
- acción secundaria arriba;
- acción primaria abajo.

Ejemplo:

```text
[ Cancelar  ]
[ Confirmar ]
```

## 13. Ownership de acciones

### Footer

Las acciones globales que afectan al Dialog completo pertenecen al Footer.

Incluye:

- Guardar;
- Crear;
- Confirmar;
- Cancelar;
- Cerrar;
- Publicar;
- Descargar;
- Aplicar;
- Preparar;
- acciones destructivas globales;
- navegación/paginación global del Dialog.

### Body

Las acciones locales permanecen en el Body.

Incluye:

- acción de una fila;
- mover una categoría;
- renombrar un elemento;
- separar un SKU;
- configurar un elemento individual;
- expandir detalles;
- controles propios de una subsección;
- acciones locales de listas o tablas.

## 14. Navegación y paginación

Si la navegación o paginación gobierna el contenido completo mostrado por el Dialog/Drawer, pertenece al Footer.

El Footer puede tener dos zonas:

```text
[ navegación / paginación ]          [ acciones ]
```

Esta composición está permitida especialmente en Drawers y superficies de exploración de datos.

La paginación perteneciente inequívocamente a un componente interno independiente puede permanecer junto a ese componente.

## 15. Responsive

Breakpoints generales únicos:

| Modo | Viewport |
|---|---|
| Desktop | `>= 1024px` |
| Tablet | `768px–1023px` |
| Mobile | `< 768px` |

No deben introducirse breakpoints históricos como:

- 1000;
- 850;
- 760;
- 720;
- 680;
- 560;
- 480.

El breakpoint `560px` actualmente presente en composición de Productos debe eliminarse durante la normalización.

## 16. Responsive por variante

### default

Desktop/Tablet:

- centrado;
- máximo 560 px.

Mobile:

- modal **inset**;
- conserva `var(--radius-panel)`;
- margen exterior visual aproximado de 12–16 px;
- max-height limitado por `100dvh`;
- Body scrollable.

No debe convertirse automáticamente en fullscreen.

### wide

Desktop/Tablet:

- centrado;
- máximo 820 px.

Mobile:

- fullscreen;
- ancho completo;
- alto completo;
- radius 0.

### drawer

Desktop/Tablet:

- lateral derecho;
- máximo global inicial 960 px;
- alto completo;
- radius 0.

Mobile:

- fullscreen;
- ancho completo;
- alto completo;
- radius 0.

## 17. Scroll lock

Mientras exista al menos un `AdminDialog` abierto, el documento subyacente debe permanecer sin scroll.

El mecanismo debe ser **stack-aware**:

```text
padre abierto
→ body bloqueado

hijo abierto
→ body continúa bloqueado

nieto abierto
→ body continúa bloqueado

cerrar nieto
→ body continúa bloqueado

cerrar hijo
→ body continúa bloqueado

cerrar último dialog
→ restaurar exactamente el estado previo
```

Este comportamiento no debe interferir con la gestión de foco ya congelada.

## 18. Contrato funcional congelado

Este bloque no reinterpreta ni modifica:

- Escape;
- cierre por backdrop;
- focus trap;
- foco inicial;
- restauración de foco;
- dialogs anidados;
- `inert`;
- `closeDisabled`;
- `role="dialog"`;
- `aria-modal="true"`;
- `aria-labelledby`;
- `aria-describedby`.

## 19. className

`className` permanece permitido como hook específico de consumidor.

Puede utilizarse para:

- composición interna;
- estilos de contenido del Body;
- elementos específicos del módulo;
- comportamiento visual local no estructural.

No puede redefinir:

- ancho estructural;
- alto estructural;
- posicionamiento;
- border-radius;
- Header;
- Footer;
- comportamiento responsive del Dialog/Drawer.

## 20. Drawer del Sidebar

El Drawer Mobile del Sidebar no forma parte de este bloque.

Ese Drawer pertenece al contrato de Shell/Sidebar ya cerrado en Fase 11.

En este documento, `drawer` se refiere exclusivamente a:

`<AdminDialog variant="drawer">`

## 21. Composición individual todavía abierta

Este documento no congela todavía la composición interna definitiva de los consumidores.

Podrán revisarse individualmente:

- jerarquía;
- spacing;
- agrupaciones;
- disposición de formularios;
- disposición de tablas;
- composición exacta del Footer;
- ubicación concreta de acciones locales;
- ancho específico de cada Drawer dentro del máximo de 960 px;
- eventual uso de `50vw`;
- reevaluación de variante cuando esté justificada por el contenido.

## 22. Mapeo inicial recomendado

Este mapeo sirve como baseline de revisión y puede ajustarse durante la evaluación individual sin romper el contrato global.

| Consumidor | Variante inicial recomendada |
|---|---|
| Configuración de valorizado | `default` |
| Catálogo · propuesta | `wide` |
| Resolver precio | `wide` |
| Publicar catálogo | `wide` |
| Descargar ajuste | `default` |
| Cronología | `drawer` |
| Dashboard · detalle | `drawer` |
| Confirmación de dispositivo | `default` |
| Administrar categorías | `wide` |
| Integrantes de grupo | `wide` |
| Crear grupo | `wide` |
| Editar grupo | `default` |
| Incidencias · repeticiones | `drawer` |
| Ignorar 30 días | `default` |
| Proponer eliminación | `default` |
| Configurar producto | `default` |
| Excluir / reincorporar producto | `default` |
| Configuración pendiente | `default` |

`Configuración pendiente` se mantiene inicialmente en `default` porque su volumen esperado difícilmente supera aproximadamente 10 productos simultáneos.

## 23. Restricciones

Fuera de alcance durante la normalización global:

- backend;
- Supabase;
- RPC;
- contratos de datos;
- lógica de negocio;
- rediseño funcional;
- librerías externas de dialogs;
- portals nuevos;
- migración a otra primitive modal;
- cambios de tablas no requeridos por la composición del Dialog;
- reapertura del contrato de foco.

## 24. Baseline técnico del bloque

Preflight inicial:

- rama: `admin-work`;
- primitive: `AdminDialog`;
- variantes existentes: `default | wide | drawer`;
- consumidores identificados: **19**;
- `admin.css` en el preflight: **2528 líneas**.

El número de líneas es una métrica de seguimiento, no un objetivo de diseño.

## 25. Estado final

> **SOLOG — UI Admin — Dialogs, Modals y Drawers V1: APROBADO Y CONGELADO.**

La siguiente etapa puede definir el plan de implementación. La composición específica de cada consumidor permanece abierta hasta su revisión individual.
