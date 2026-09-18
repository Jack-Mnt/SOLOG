# SOLOG — Refactor AdminCSS — Consolidación de Primitives V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — refactor frontend/Admin  
**Fecha:** 2026-09-18  

## 1. Propósito

Consolidar cascada activa de primitives Admin sin cambiar geometría, semántica ni resultado visual.

## 2. Fuente primaria

Para geometría y comportamiento visual prevalece:

`docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`

Este documento prevalece únicamente para el alcance de consolidación CSS descrito aquí.

## 3. Alcance aprobado

1. Consolidar la superficie base de `admin-filter-bar`, absorbiendo propiedades desktop que actualmente recibe de un bloque posterior compartido con `admin-toolbar`.
2. Integrar la geometría congelada de `StateView` en su regla base y retirar el override desktop redundante.
3. Integrar la geometría congelada de `QuickFilterChip` en su regla base.
4. Mantener `flex: 1` como comportamiento contextual de chips dentro de `admin-quick-filter-chips`.
5. No modificar semántica, handlers, JSX, responsive ni lógica funcional.

## 4. Cascada que se conserva intencionalmente

No se absorben todavía los overrides de alta especificidad de:

- Button;
- IconButton;
- Inputs / Select / Search;
- módulos específicos.

Esos overrides siguen siendo necesarios porque actualmente neutralizan geometrías locales históricas. Su retiro se evaluará durante la consolidación por módulos y responsive.

## 5. Fuera de alcance

- backend / Supabase / RPC;
- JSX y TypeScript;
- Shell / Sidebar / SiteContext;
- módulos específicos;
- media queries;
- Dashboard;
- dialogs;
- cambios visuales;
- refactors generales.

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

> **SOLOG — Refactor AdminCSS — Consolidación de Primitives V1: APROBADO Y CONGELADO.**
