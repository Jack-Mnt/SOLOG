# SOLOG — UI Admin — Dialogs, Modals y Drawers — V2

## 1. Estado

**Estado:** VIGENTE — BLOQUE CERRADO.  
**Clasificación:** contrato UI/UX frontend consolidado.  
**Proyecto:** SOLOG.  
**Rama de cierre:** `admin-work`.

Esta V2 consolida el estado final implementado y validado de Dialogs y Drawers del Admin después de las Fases 4–12.

Es la **fuente primaria global vigente** para geometría, formato, kinds, Footer, acciones, responsive, nesting y composición transversal de estas superficies.

## 2. Precedencia documental

Prevalece:

1. `SOLOG_UI_Admin_Dialogs_Modals_Drawers_V2.md` — contrato global final.
2. Fuentes individuales de Fases 4–8 — composición específica no reemplazada.
3. `SOLOG_UI_Admin_Dialogs_Normalizacion_Formato_Kind_V1.md` — trazabilidad de Fase 9 y decisiones de normalización.
4. `SOLOG_Refactor_AdminDialog_Cleanup_Fase10_V1.md` y su delta — cleanup.
5. `SOLOG_Correccion_AdminDialog_Revision_Global_Fase11_V1.md` — correcciones puntuales de revisión global.

Quedan históricas o parcialmente reemplazadas:

- `SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`;
- el modelado legacy `variant="default|wide|drawer"`;
- Footer obligatorio / Cerrar automático;
- inventario histórico de 19 consumidores.

## 3. API estructural final

### Formato

```ts
format?: "dialog" | "drawer"
```

Default:

```text
dialog
```

### Tamaño de Dialog

```ts
size?: "default" | "wide"
```

- default → máximo 560 px;
- wide → máximo 820 px.

### Kind de Dialog

```ts
kind?: "confirmation" | "task" | "management"
```

### Drawer

```ts
format="drawer"
drawerMaxWidth={...}
```

Drawer no combina:

- `size`;
- `kind`.

`drawerMaxWidth` está limitado por la primitive a 320–960 px.

## 4. Inventario runtime final

El inventario vigente contiene **22 instancias JSX de `AdminDialog`**:

- 18 Dialogs con kind;
- 4 Drawers.

### Confirmation — 7 instancias

1. Dispositivos — autorizar / revocar / rechazar.
2. Incidencias — ignorar 30 días.
3. Incidencias — aprobar eliminación.
4. Productos — exclusión / reincorporación.
5. Categorías — descartar cambios de orden.
6. Integrantes — separar producto.
7. Catálogo — descartar propuesta.

### Task — 8 instancias

1. Descargar ajuste.
2. Crear grupo.
3. Editar grupo.
4. Configuración de valorizado.
5. Configurar producto.
6. Resolver precio — estado loading/error.
7. Resolver precio — contenido operativo.
8. Publicar catálogo.

### Management — 3 instancias

1. Administrar categorías.
2. Integrantes del grupo.
3. Configuración pendiente.

### Drawers — 4 instancias

| Superficie | Ancho |
|---|---:|
| Incidencias — Repeticiones | 520 px |
| Control — Cronología | 560 px |
| Dashboard — Detalle diario | 620 px |
| Catálogo — Detalle de propuesta | 720 px |

## 5. Estructura común

```text
Header
Body scrollable
Footer opcional
```

### Header

Responsabilidades:

- título;
- descripción secundaria opcional;
- cierre común mediante X;
- sin acciones operativas adicionales.

La X se deshabilita cuando el consumidor declara `closeDisabled`.

### Body

Es la única región principal scrollable.

Contiene según el kind:

- explicación;
- contexto;
- formularios;
- listas/tablas;
- notices;
- feedback;
- acciones locales.

### Footer

Es explícito y opcional.

Se renderiza únicamente cuando existen:

- acciones globales;
- navegación global;
- controles que gobiernan la superficie completa.

No existe botón `Cerrar` estructural automático.

## 6. Kinds

### confirmation

Ritmo base:

```text
12 px
```

Patrón:

```text
Header
Body
  explicación/consecuencia
  contexto
  notice/feedback
Footer
  secundaria
  acción final
```

Semántica:

- reversible/temporal → Primary;
- restaurativa → Primary;
- destructiva/terminal → Danger;
- revocar/rechazar autorización → Danger.

### task

Ritmo base:

```text
16 px
```

Patrón:

```text
Header
Body
  contexto
  campos/secciones
  feedback
Footer
  secundaria
  principal
```

### management

Ritmo base:

```text
16 px
```

Ownership:

- acciones de fila/locales → Body;
- acción global → Footer;
- acciones compactas → IconButton cuando corresponda.

Footer puede omitirse cuando no existen acciones globales.

## 7. Drawer

Uso:

- detalle;
- drill-down;
- exploración contextual.

Desktop/Tablet:

- lateral derecho;
- Header/Footer fijos;
- Body scrollable;
- ancho individual congelado por consumidor.

Mobile <768 px:

- fullscreen.

### Footer Drawer

Puede contener:

- paginación/navegación global;
- switches globales;
- acciones operativas globales.

Puede omitirse completamente cuando no existe una acción útil.

## 8. Responsive final

Breakpoint contractual de Dialog/Drawer:

```css
@media (max-width: 767px)
```

### Default

- centrado;
- inset 12 px en Mobile;
- altura máxima viewport - 24 px.

### Wide

- Desktop/Tablet máximo 820 px;
- Mobile fullscreen.

### Drawer

- Desktop/Tablet lateral;
- Mobile fullscreen.

### Footer Mobile

- una columna;
- Buttons full-width;
- navigation/actions ocupan ancho completo.

### Notices dentro de Dialog Mobile

- mensaje + dismiss en primera fila;
- acción en segunda fila;
- Button de acción full-width.

## 9. Acciones

### Button

Patrón preferente:

```text
icono + texto breve
```

El icono es decorativo respecto del nombre textual y usa `aria-hidden="true"`.

Orden típico Footer:

```text
[ secundaria ] [ principal ]
```

Destructivo:

```text
[ Cancelar ] [ Danger ]
```

### IconButton

Se usa para:

- tabla/fila;
- toolbar compacta;
- acción contextual;
- acción que abre una confirmación.

Requiere `aria-label`; `title` se mantiene cuando mejora descubrimiento.

## 10. Contexto y feedback

### Contexto

`admin-dialog-context`:

- borde estándar;
- surface secondary;
- padding 12 px;
- pares dt/dd;
- dos columnas Desktop/Tablet;
- una columna Mobile.

### Help

`admin-dialog-help` se reserva a explicación secundaria discreta.

### Notices

`AdminNotice` es la superficie normalizada para:

- info;
- success;
- warning;
- error;
- retry cuando corresponda.

No se usan superficies locales de error dentro de Dialogs cuando `AdminNotice` cubre el caso.

## 11. Excepciones deliberadas

Se conservan como composición específica:

- Detalle de propuesta → ritmo vertical 24 px.
- Proposal Change → card propia.
- Evidence / Price Summary → estructuras específicas.
- Drawer Entity Summary → estructura específica.
- Dashboard Daily → Footer con resumen + paginación.
- Control Cronología → Footer con switch de quincena.
- Candidate Picker → lista interactiva densa.

Estas excepciones no justifican nuevas primitives.

## 12. Separar producto — composición definitiva

Confirmación nested:

```text
Título
Separar producto

Descripción
El producto dejará el grupo y quedará como Único.

Contexto
Producto       {producto}
C. interno     {c_interno}
Grupo nuevo    {producto}

Notice
El resto del grupo se actualizará automáticamente si su estructura cambia.

Footer
[ Cancelar ] [ Separar ]
```

`Grupo nuevo` reemplaza explícitamente la etiqueta histórica `Grupo actual`.

## 13. Infraestructura de interacción

Permanece centralizada en `AdminDialog`:

- focus entry;
- focus trap;
- restore focus;
- stack;
- topmost Escape;
- backdrop topmost;
- inert;
- scroll lock;
- Drawer enter/exit lifecycle;
- reduced-motion.

Ningún consumidor implementa traps paralelos.

## 14. Nesting

Soporta al menos tres niveles:

```text
Detalle de propuesta
└── Resolver precio
    └── Valorizado
```

y:

```text
Detalle de propuesta
└── Configurar producto
```

El cierre afecta únicamente al nivel superior activo y restaura foco al nivel inmediato anterior.

## 15. Cleanup final

Fase 10 retiró:

- CSS muerto confirmado;
- aliases legacy;
- clases JSX huérfanas;
- wrappers sin responsabilidad;
- `admin-sort__trigger` base sin CSS.

No se reorganizaron media queries ni se realizaron refactors generales.

## 16. Revisión global

Fase 11 auditó:

- Header;
- Body;
- Footer;
- format/size/kind;
- spacing;
- scroll;
- responsive;
- acciones;
- feedback;
- loading;
- error;
- empty states;
- focus;
- nesting.

Corrección resultante:

- Confirmación de Dispositivos usa `AdminNotice tone="error"` para error local.

## 17. Fuera de alcance

Este bloque no modifica:

- backend;
- Supabase;
- RPC;
- contratos de datos;
- motor de conteos;
- lógica de negocio;
- Shell/Sidebar;
- tablas globales fuera de necesidades internas de Dialog/Drawer.

## 18. Criterio de cierre Fase 12

Validación técnica requerida:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Smoke prioritario:

- 1440 px;
- 1024/1023 px;
- 768/767 px;
- 430 px;
- 375 px.

Especialmente:

- default Mobile inset;
- wide Mobile fullscreen;
- Drawer Mobile fullscreen;
- nested dialogs;
- scroll lock;
- Footer largo;
- tablas/paginación;
- pending/error/retry.

Validación final aprobada:

- validación técnica: ✅;
- smoke humano: ✅;
- documentación consolidada: ✅.

> **Bloque Admin Dialogs/Drawers: CERRADO.**
