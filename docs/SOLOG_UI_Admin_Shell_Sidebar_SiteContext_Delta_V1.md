# SOLOG — UI Admin — Shell, Sidebar y SiteContext — Delta V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — ajuste y consolidación frontend/Admin  
**Fecha:** 2026-09-18  

## 1. Fuente primaria

Este documento es la fuente primaria de la Fase 9 para Shell, Sidebar y SiteContext.

Para geometría general de controles continúa vigente:

`docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`

Ante contradicción puntual sobre los elementos cubiertos por este delta, prevalece este documento.

## 2. 9A — Shell / Header desktop

El Header desktop queda congelado con:

- altura mínima: 64 px;
- padding: 12 px 24 px;
- gradient Navy vigente;
- sin shadow;
- border-bottom vigente;
- comportamiento sticky actual preservado.

El padding vertical de 12 px permite que un SiteContext de 40 px encaje exactamente en 64 px cuando no existe wrapping.

El contenido principal conserva su padding desktop efectivo actual; solo se consolida la cascada sin rediseñarlo.

## 3. 9B — Sidebar

Ancho total estructural:

- expandido: 200 px;
- colapsado: 64 px.

Padding horizontal del Sidebar:

- 8 px en ambos estados.

La medida corresponde al track total del Sidebar, no al ancho útil interior.

Se congela además:

- controles principales del Sidebar: 44 px de alto;
- iconos principales: 20 px;
- apariencia visual actual de tabs;
- estado activo actual con señal lateral Primary;
- comportamiento expandido/colapsado actual;
- logout, selector de apariencia y navegación sin cambios funcionales.

Los overrides históricos de 232/210/190 px y 68 px dejan de ser vigentes. Los breakpoints no deben modificar los anchos 200/64 px.

El selector de apariencia no se rediseña en esta fase.

## 4. 9C — SiteContext desktop

El SiteContext desktop conserva la variante Navy vigente:

- alto: 40 px;
- ancho aproximado: 84 px;
- mínimo: 80 px;
- padding: 8 px 10 px;
- radio: 12 px;
- superficie Navy/transparente;
- hover Navy;
- activo Primary + Navy;
- focus visible Primary Bright.

Se consolida esta variante como definición base desktop.

El `select` responsive de SiteContext queda fuera de esta fase y se mantiene para la Fase 11.

## 5. Consolidación CSS

La implementación debe:

- absorber overrides desktop históricos en las reglas base;
- retirar reglas que queden completamente redundantes;
- preservar el resultado visual salvo las nuevas medidas aprobadas de Header y Sidebar;
- preservar la estructura JSX y toda lógica funcional;
- preservar media queries no relacionadas.

## 6. Fuera de alcance

No modificar:

- backend, Supabase, RPC o contratos;
- JSX/TypeScript;
- Dashboard;
- módulos Admin;
- dialogs;
- Button/IconButton del contenido;
- PaletteSwitcher;
- SiteContext responsive;
- responsive general salvo retirar overrides de ancho de Sidebar incompatibles con 200/64 px;
- lógica de navegación o autorización.

## 7. Validación

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Smoke dirigido:

- Header en rutas Admin;
- Sidebar expandido 200 px;
- Sidebar colapsado 64 px;
- navegación y estado activo;
- logout;
- PaletteSwitcher sin regresión;
- Control e Incidencias con SiteContext;
- cambio de sede;
- viewport desktop y estrecho para confirmar que el ancho del Sidebar permanece 200/64 px.

## 8. Estado final

> **SOLOG — UI Admin — Shell, Sidebar y SiteContext — Delta V1: APROBADO Y CONGELADO.**
