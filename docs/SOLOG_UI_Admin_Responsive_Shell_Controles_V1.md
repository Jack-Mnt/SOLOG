# SOLOG — UI Admin — Responsive, Shell y Controles — V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — responsive y consolidación frontend/Admin  
**Fecha:** 2026-09-18

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

Los breakpoints históricos `1000/850/760/720/680/560/480` deben ser absorbidos por Tablet o Mobile durante la Fase 11. No deben permanecer como arquitectura general final.

Excepción temporal: la geometría responsive de `Dashboard %` queda pendiente de una decisión posterior y no debe reinterpretarse automáticamente en esta fase.

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
| Dashboard % | vigente actual | pendiente |

Regla general Mobile: los controles reducen **4 px** respecto de Desktop/Tablet.

**QuickFilterChip es excepción:** 32 px es su mínimo UX y no se reduce.

## 7. Consolidación de cascada

La implementación debe:

1. hacer autoritativas las geometrías vigentes en las primitives/base;
2. migrar responsive histórico a 1024/768;
3. retirar solo después los normalizadores de alta especificidad que queden redundantes;
4. preservar hover, focus, disabled y variantes semánticas;
5. evitar introducir nuevos overrides compensatorios innecesarios.

## 8. Fuera de alcance

- backend, Supabase, RPC y contratos;
- tablas y composición de columnas;
- lógica de negocio;
- rediseño de módulos;
- decisión definitiva de `Dashboard %`;
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
