# SOLOG — UI Admin — Responsive, Shell y Controles — V1

**Proyecto:** SOLOG  
**Estado:** APROBADO, CONGELADO Y EJECUTADO  
**Clasificación:** Nivel B — responsive y consolidación frontend/Admin  
**Fecha:** 2026-09-19

## 1. Fuente primaria y precedencia

Este documento es la **fuente primaria de la Fase 11** para responsive, Shell, Header, Sidebar/Drawer, SiteContext y densidad responsive de controles Admin.

Prevalece, únicamente en esos puntos, sobre:

1. `docs/SOLOG_UI_Admin_Shell_Sidebar_SiteContext_Delta_V1.md`
2. `docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`
3. `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`

Las decisiones de tablas, módulos, lógica, backend y cualquier materia no reemplazada explícitamente continúan vigentes.

## 2. Breakpoints generales

Admin utilizará únicamente estos modos generales:

| Modo | Viewport |
|---|---|
| Desktop | `>= 1024px` |
| Tablet | `768px–1023px` |
| Mobile | `< 768px` |

La implementación debe converger a los cortes estándar equivalentes a Tailwind `lg=1024` y `md=768`.

Los breakpoints históricos `1000/850/760/720/680/560/480` fueron absorbidos por Tablet o Mobile durante la Fase 11. No forman parte de la arquitectura general final.

`Dashboard %` constituye una excepción explícita a la densidad general: el área interactiva de la acción que ocupa la celda conserva **48 px** de alto. Esta geometría fue aprobada deliberadamente y no debe normalizarse a 36/32 px.

## 3. Shell y Sidebar

### Desktop

- Sidebar expandido: 200 px.
- Sidebar colapsado: 64 px.
- El usuario puede alternar manualmente ambos estados.

### Tablet

- Sidebar forzado a 64 px.
- No puede expandirse manualmente.
- El control de expandir/contraer no se muestra.
- Navegación, cuenta, logout y PaletteSwitcher continúan funcionales en modo compacto.

### Mobile

- El Sidebar deja de ocupar track permanente del layout.
- Se presenta como Drawer overlay.
- El Drawer reutiliza el mismo contenido y navegación del Sidebar; no se duplica la navegación.
- El activador será el **isotipo SOLOG**.
- El Drawer debe cerrarse mediante navegación, backdrop y `Escape`, y devolver el foco al activador.
- El control de expandir/contraer no existe en Mobile.

## 4. Header

El Header conserva en todos los modos:

- altura fija: **64 px**;
- sticky;
- Navy vigente;
- sin segunda línea;
- sin wrapping.

### Desktop / Tablet

- no se añade isotipo SOLOG al Header;
- se conserva Título + Puerto Rico o Título + SiteContext.

### Mobile

Composición objetivo:

`[ isotipo SOLOG ] [ título ] [ Puerto Rico / SiteContext ]`

- el isotipo abre el Drawer;
- el título ocupa el espacio flexible restante;
- Puerto Rico y SiteContext pueden reducir tamaño para impedir wrapping;
- el Header no debe superar 64 px.

## 5. SiteContext

### Desktop / Tablet

- botones visibles;
- alto: 40 px;
- tratamiento Navy vigente.

### Mobile

- se usa el `select` responsive existente;
- alto: 36 px;
- misma selección y fuente de verdad;
- tratamiento Navy;
- no se muestran simultáneamente botones y select.

## 6. Densidad de controles

| Control | Desktop / Tablet | Mobile |
|---|---:|---:|
| Button | 36 px | 32 px |
| IconButton | 36 × 36 px | 32 × 32 px |
| Input / Select / Search | 36 px | 32 px |
| StateView | 36 px | 32 px |
| SiteContext | 40 px | 36 px |
| Controles Sidebar / Drawer | 44 px | 40 px |
| QuickFilterChip | 32 px | 32 px |
| Dashboard % | 48 px | 48 px |

Regla general Mobile: los controles reducen **4 px** respecto de Desktop/Tablet.

**QuickFilterChip es excepción:** 32 px es su mínimo UX y no se reduce.

## 7. Consolidación de cascada

La implementación final de Fase 11 deja:

1. geometrías vigentes autoritativas en las primitives/base;
2. responsive general normalizado a `1024/768`;
3. normalizadores históricos de alta especificidad retirados cuando quedaron redundantes;
4. hover, focus, disabled y variantes semánticas preservados;
5. `admin-toolbar` como layout compartido;
6. `admin-toolbar-surface` como superficie visual;
7. `admin-filter-bar` limitado a comportamiento específico, sin recrear una segunda superficie;
8. `--admin-control-height`, `--admin-control-radius` y `--admin-control-border` eliminados;
9. SiteContext con una única fuente de verdad responsive.

## 8. Fuera de alcance

- backend, Supabase, RPC y contratos;
- tablas y composición de columnas;
- lógica de negocio;
- rediseño de módulos;
- refactors generales no relacionados.

## 9. Validación

Tras cada parte de Fase 11 debe realizarse un fast smoke proporcional.

Puntos de corte prioritarios:

- 1440;
- 1024 / 1023;
- 768 / 767;
- 430;
- 375.

Validación técnica final:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```


## 10. Cierre de Fase 11

Estado consolidado al cierre:

- `admin.css`: **2468 líneas**;
- baseline aproximado previo a la limpieza: **3427 líneas**;
- reducción acumulada aproximada: **959 líneas (~28.0 %)**;
- breakpoints generales vigentes: únicamente `1024/768`;
- variables locales `--admin-control-*`: eliminadas;
- Button/IconButton: `36 px` Desktop/Tablet y `32 px` Mobile;
- SiteContext: `40 px` Desktop/Tablet y `36 px` Mobile;
- Sidebar/Drawer: `44 px` Desktop/Tablet y `40 px` Mobile;
- QuickFilterChip: `32 px`;
- Dashboard `%`: área interactiva `48 px`;
- tablas y composición de columnas permanecieron fuera del alcance de esta fase.

Fase 11 queda cerrada a nivel de implementación CSS y documentación. La validación técnica final y el smoke humano deben ejecutarse sobre el checkout local antes de considerar cerrado el ciclo de validación.
