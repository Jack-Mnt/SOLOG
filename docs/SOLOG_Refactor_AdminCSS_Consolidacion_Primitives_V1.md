# SOLOG — Refactor AdminCSS — Consolidación de Primitives V1

**Proyecto:** SOLOG  
**Estado:** APROBADO, CONGELADO Y RECONCILIADO CON FASE 11  
**Clasificación:** Nivel B — refactor frontend/Admin  
**Fecha:** 2026-09-19  

## 1. Propósito

Consolidar cascada activa de primitives Admin sin cambiar geometría, semántica ni resultado visual.

## 2. Fuente primaria

Para geometría, responsive y comportamiento visual prevalece:

`docs/SOLOG_UI_Admin_Responsive_Shell_Controles_V1.md`

Para decisiones de primitives no reemplazadas por esa fuente continúan vigentes:

- `docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`
- `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`

Este documento conserva valor como registro del refactor de consolidación, pero sus decisiones históricas quedan reconciliadas por el estado final de Fase 11.

## 3. Alcance reconciliado

La arquitectura final de consolidación queda:

1. `admin-toolbar` es responsable del layout compartido de toolbar: `display`, alineación, wrap y gap.
2. `admin-toolbar-surface` es responsable de la superficie visual: padding, borde, radio, background y sombra.
3. `admin-filter-bar` conserva únicamente comportamiento específico de FilterBar; no recrea una segunda superficie visual.
4. `StateView` y `QuickFilterChip` conservan sus geometrías autoritativas en sus propias primitives.
5. `admin-quick-filter-chips` mantiene su comportamiento contextual sin redefinir la primitive.
6. Las variables `--admin-control-height`, `--admin-control-radius` y `--admin-control-border` fueron retiradas.
7. Responsive global converge a `1024/768` y las reglas locales de módulo permanecen junto a sus módulos cuando no son duplicación global.
8. La consolidación no modifica semántica, handlers ni lógica funcional.

## 4. Estado final de la cascada

La afirmación histórica de que debían conservarse normalizadores de alta especificidad queda superada por Fase 11.

Estado vigente:

- Button e IconButton obtienen su geometría de las primitives/base autoritativas;
- Inputs / Select / Search usan la geometría común Admin y el responsive Mobile de 32 px;
- los normalizadores geométricos de alta especificidad fueron retirados cuando dejaron de ser necesarios;
- se conservan overrides específicos solo cuando expresan semántica, contexto o una excepción aprobada;
- SiteContext y Sidebar/Drawer mantienen familias geométricas independientes.

## 5. Fuera de alcance

- backend / Supabase / RPC;
- JSX y TypeScript;
- cambios funcionales o de lógica;
- rediseño de módulos;
- tablas y composición de columnas;
- backend / Supabase / RPC;
- refactors generales no relacionados.

Durante Fase 11 se autorizó además eliminar CSS muerto o inequívocamente redundante encontrado durante el recorrido, siempre que no alterara comportamiento.

## 6. Validación

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Smoke dirigido:

- Toolbar y filtros;
- QuickFilterChip en Control, Productos y Grupos;
- StateView en Catálogo e Incidencias.

## 7. Estado final

La reconciliación de Fase 11 deja `admin.css` en **2468 líneas**, frente a un baseline aproximado de **3427 líneas**, para una reducción acumulada aproximada de **959 líneas (~28.0 %)**.

> **SOLOG — Refactor AdminCSS — Consolidación de Primitives V1: APROBADO, CONGELADO Y RECONCILIADO CON FASE 11.**
