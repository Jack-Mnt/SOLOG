# SOLOG — UI Admin — Controles, Densidad y Responsive — Delta V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — delta visual frontend/Admin  
**Fecha:** 2026-09-14

## 1. Fuente primaria y precedencia

Este documento es un **delta** sobre:

1. `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`
2. `docs/SOLOG_Correccion_Admin_Primitives_Cierre_V1.md`

Para las decisiones cubiertas aquí, este delta prevalece. Todo lo que no reemplaza explícitamente continúa vigente.

## 2. Geometría común Admin

En viewport normal:

| Control | Geometría |
|---|---|
| Button Primary / Secondary / Danger | 36 px alto · padding 8px 12px · radio 8px · 0.8rem |
| Input / Select / Search de filtros | 36 px alto · radio 8px · 0.8rem |
| IconButton | 36 × 36 px · radio 8px |
| Icono de Button / IconButton | 16 × 16 px |
| QuickFilterChip | 32 px alto |
| StateView | 36 px alto |
| SiteContext visible | 40 px alto · 84 px aprox. de ancho · mínimo 80 px · radio 12 px · 0.9rem · peso ~640 |
| Controles de Sidebar | 44 px alto · icono ~20 px |

Los controles propios del Sidebar constituyen una familia independiente y no heredan la densidad del contenido Admin.

## 3. Responsive compacto

En viewport de **560 px o menos**, cuando ayude a reducir altura vertical:

- Button → 32 px;
- Input / Select / Search de filtros → 32 px;
- IconButton → 32 × 32 px;
- iconos permanecen en 16 × 16 px.

Excepciones:

- QuickFilterChip permanece en 32 px;
- StateView permanece en 36 px;
- SiteContext permanece en 40 px;
- Sidebar permanece en 44 px.

## 4. Hover, focus y disabled

### Reposo

- sin glow;
- sin desplazamiento;
- sin sombra de elevación como jerarquía.

### Hover

Primary:
- background y border → primary-hover.

Secondary / IconButton:
- background → primary-subtle;
- border → primary;
- texto/icono → primary-active.

Danger:
- background danger-soft más marcado;
- border → danger;
- texto/icono → danger-hover.

### Focus-visible

El focus se diferencia del hover mediante:

- outline externo de 2 px;
- offset de 2 px;
- no depende solo del cambio de fondo.

### Disabled

- sin hover;
- sin sombra;
- legible.

## 5. Dashboard

El botón `Descargar ajuste` conserva su señal lateral específica, reducida a:

`box-shadow: inset 4px 0 var(--color-primary)`.

Esta señal no se generaliza al resto de Buttons.

## 6. SiteContext — variante B

El selector de sede se integra visualmente con la Topbar Navy.

### Inactivo

- superficie Navy/transparente muy leve;
- borde blanco de baja opacidad;
- texto blanco atenuado.

### Hover

- background `dark-surface-hover`;
- borde primary atenuado;
- texto blanco.

### Activo

- background primary mezclado sutilmente con Navy;
- borde primary;
- texto blanco.

La sede sigue siendo **contexto**, no CTA ni filtro ordinario.

En <=680 px se conserva el dropdown responsive con la misma fuente de verdad y el mismo tratamiento Navy.

## 7. Fuera de alcance

No modificar:

- backend;
- Supabase;
- contratos;
- lógica de negocio;
- navegación;
- tablas, columnas o filas;
- dialogs/drawers como sistema;
- composición funcional de módulos.

## 8. Validación

- `bun test --reporter=dot`
- `bun run lint`
- `bun run build`
- `git diff --check`
- smoke dirigido de botones, filtros, SiteContext, QuickFilterChip, StateView, Dashboard y Sidebar.
