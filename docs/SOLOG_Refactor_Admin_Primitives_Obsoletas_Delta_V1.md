# SOLOG — Refactor Admin — Primitives Obsoletas — Delta V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — refactor frontend/Admin  
**Fecha:** 2026-09-18  

## 1. Propósito

Este delta formaliza el retiro de primitives y variantes de densidad que quedaron obsoletas después de la normalización posterior de Admin.

Todo lo no reemplazado explícitamente por este delta continúa vigente.

## 2. Precedencia

Este delta prevalece, únicamente para los puntos cubiertos aquí, sobre:

- `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`
- `docs/SOLOG_UI_Admin_Secciones_Tablas_Base_V1.md`
- `docs/SOLOG_UI_Admin_Primitives_Controles_Plan_Implementacion_V1.md`

Continúa vigente como fuente de geometría y responsive:

- `docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`

## 3. Result Count y AdminTableBar

Se retiran del sistema Admin:

- `AdminResultCount`;
- `AdminResultCountRow`;
- `AdminTableBar`;
- clases CSS `admin-result-count`, `admin-result-count-row` y `admin-table-bar`.

Motivo:

- no tienen consumidores runtime actuales;
- la eliminación visible del conteo de resultados fue una decisión posterior intencional;
- el patrón vigente coloca `AdminSort` directamente en `AdminSectionSecondaryRow` cuando corresponde.

Composición vigente:

```text
AdminToolbar
↓
AdminSectionSecondaryRow
   ├─ QuickFilterChip / StateView / información auxiliar
   └─ AdminSort cuando corresponda
↓
AdminTableSection
```

## 4. Button Compact

Se retira la variante explícita `button--compact`.

La densidad de Button queda gobernada por el sistema visual vigente:

- Admin normal: 36 px;
- viewport <= 560 px: 32 px;
- Sidebar: familia independiente.

No existe consumidor runtime actual que requiera una variante manual Compact.

## 5. IconButton Compact

Se retira:

- `IconButtonSize`;
- prop `size` de `IconButton`;
- clase `icon-button--compact`.

Semántica vigente de IconButton:

```text
Default | Primary | Danger
```

La densidad queda gobernada por contexto y responsive, no por una prop de tamaño manual.

## 6. Fuera de alcance

No modificar:

- backend;
- Supabase;
- contratos remotos;
- lógica de negocio;
- navegación;
- semántica Default / Primary / Danger de IconButton;
- geometría vigente de 36 px / 32 px;
- Sidebar;
- QuickFilterChip;
- StateView;
- AdminSort;
- Table Shell.

## 7. Validación

Después de implementar:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Smoke dirigido:

- Control;
- Productos;
- Grupos;
- Incidencias;
- Catálogo;
- acciones IconButton;
- AdminSort;
- responsive <= 560 px.

## 8. Estado final

> **SOLOG — Refactor Admin — Primitives Obsoletas — Delta V1: APROBADO Y CONGELADO.**
