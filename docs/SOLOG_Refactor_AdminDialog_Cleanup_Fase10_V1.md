# SOLOG — Refactor AdminDialog Cleanup Fase 10 V1

## 1. Estado y propósito

**Estado:** CONGELADA / APROBADA PARA IMPLEMENTACIÓN.  
**Clasificación:** Nivel B — refactor estructural frontend sin cambio funcional.  
**Proyecto:** SOLOG.  
**Rama de trabajo:** `admin-work`.  
**Baseline de congelación:** `6eb9484844cabf90ba13355f51ec91d35a66d86d`.

Esta fuente define el alcance ejecutable de la **Fase 10 — Cleanup agresivo** del bloque Admin Dialogs/Drawers.

El objetivo es retirar deuda técnica confirmada después de cerrar y validar la Fase 9, sin alterar comportamiento, geometría, contratos, UX, responsive ni lógica funcional.

---

## 2. Fuente primaria y precedencia

Para **Fase 10**, esta es la fuente primaria:

`docs/SOLOG_Refactor_AdminDialog_Cleanup_Fase10_V1.md`

Precedencia:

1. Esta fuente prevalece para el inventario y alcance de cleanup de Fase 10.
2. `docs/SOLOG_UI_Admin_Dialogs_Normalizacion_Formato_Kind_V1.md` continúa siendo autoritativa para los contratos funcionales y visuales congelados en Fase 9.
3. `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md` conserva valor histórico/roadmap; su §10 queda concretado por esta fuente.
4. Las fuentes de Fases 4–9 siguen vigentes para comportamiento no reemplazado explícitamente.

Ante contradicción, **Fase 10 no autoriza reinterpretar decisiones visuales o funcionales cerradas en Fase 9**.

---

## 3. Decisiones congeladas

### 3.1. CSS muerto a retirar

Eliminar completamente los selectores y reglas asociadas confirmados sin consumidor vigente:

- `.admin-catalog__proposal-context`;
- `.admin-export-dialog__fields`;
- `.admin-export-dialog__fields > label`;
- `.admin-v2-kpis`;
- `.admin-v2-json`;
- `.admin-v2-data`;
- `.admin-v2-data dd`.

Además, retirar `.admin-export-dialog__fields` de aliases compartidos de hover/focus, preservando la rama vigente de `.admin-toolbar`.

### 3.2. Clases JSX huérfanas a retirar

Eliminar únicamente las clases sin regla ni responsabilidad vigente:

- `admin-categories__row--editing`;
- `admin-control__tone--*`;
- `admin-incidents__state`;
- `admin-incidents__state--*`;
- `admin-catalog__proposal-change-section`;
- `admin-products`;
- `admin-products__section`;
- `admin-device-badge`;
- `admin-device-badge--authorized`;
- `admin-device-badge--empty`.

Los estados/tonos deben seguir representándose mediante los contratos compartidos ya vigentes, por ejemplo:

- `admin-status-badge`;
- `admin-status-badge--*`;
- clases funcionales que sí conservan CSS.

### 3.3. JSX muerto / wrappers innecesarios

Se aprueba:

- retirar el `span` vacío de Device Badge en Dispositivos;
- retirar el wrapper interno de Productos cuya única responsabilidad era `admin-products__section`;
- retirar el Fragment trivial que envuelve únicamente `admin-device-card__person`.

No se autoriza eliminar wrappers con semántica, ARIA, layout o comportamiento vigente.

---

## 4. Elementos que se conservan explícitamente

Aunque su nombre pueda parecer histórico, se conservan porque tienen consumidor o responsabilidad vigente:

- `admin-v2-actions`;
- `admin-appearance*`;
- `admin-v2-form`;
- `admin-v2-picker`;
- `admin-dialog-context`;
- `admin-dialog-help`;
- `admin-dialog__footer-actions`;
- clases dinámicas `admin-dialog--kind-*`;
- tonos de `AdminNotice`;
- tonos de `admin-status-badge`;
- clases de diferencias numéricas;
- estilos responsive actuales.

`admin-appearance*` permanece activo mediante `PaletteSwitcher variant="sidebar"`.

---

## 5. Duplicados, overrides y media queries

El preflight no encontró bloques CSS exactamente duplicados dentro del alcance.

Las repeticiones observadas corresponden principalmente a:

- regla base + responsive;
- regla base + reduced-motion;
- especializaciones por módulo.

Por tanto:

- no fusionar bloques CSS solo para reducir líneas;
- no reorganizar media queries;
- no consolidar selectores si no existe deuda funcional/técnica demostrada;
- no convertir Fase 10 en un refactor estilístico general.

---

## 6. Tests

Los tests históricos de Fases 3–9 se conservan como cobertura de regresión y trazabilidad.

Solo se actualizarán si una aserción depende directamente de una clase o estructura retirada por esta fuente.

No consolidar ni eliminar suites únicamente por antigüedad.

---

## 7. Fuera de alcance

Fase 10 no modifica:

- `admin.dialog.focus.ts`;
- `admin.dialog.stack.ts`;
- `admin.dialog.scroll.ts`;
- primitive `AdminDialog`;
- primitive `IconButton`;
- primitive `AdminNotice`;
- tablas globales del Admin;
- Shell;
- Sidebar;
- `PaletteSwitcher`;
- backend;
- Supabase;
- RPC;
- stores;
- contratos de datos;
- lógica de negocio;
- responsive contractual;
- geometría de Dialogs/Drawers;
- nesting/foco/cierre;
- spacing y composición ya validados en Fase 9.

No se permiten refactors generales no relacionados.

---

## 8. Plan congelado

### 10.1 — CSS muerto y aliases

- retirar los bloques CSS confirmados;
- limpiar aliases de `admin-export-dialog__fields`;
- preservar exactamente las ramas vigentes;
- no modificar responsive ni reglas compartidas activas.

### 10.2 — JSX huérfano y wrappers

- retirar clases JSX sin CSS;
- eliminar Device Badge vacío;
- simplificar wrapper de Productos;
- retirar Fragment trivial de Dispositivos;
- preservar semántica, ARIA, estados y comportamiento.

### 10.3 — Auditoría post-cleanup

Cruzar nuevamente:

```text
CSS → consumidores
consumidores → CSS
```

Objetivo:

- detectar nuevos huérfanos creados por el cleanup;
- comprobar que ningún selector retirado conserva consumidor real;
- comprobar que ninguna clase retirada era requisito de test/UX.

No ampliar automáticamente el alcance con nuevos candidatos: cualquier hallazgo adicional se reporta antes de eliminarlo.

### 10.4 — Validación y cierre

Mínimo técnico:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Smoke dirigido:

- Categorías;
- Control;
- Incidencias;
- Catálogo — Proposal Drawer;
- Productos;
- Dispositivos.

Fase 10 solo se cierra después de validación técnica y smoke proporcional.

---

## 9. Criterio de aceptación

La implementación es correcta cuando:

1. el inventario aprobado desaparece;
2. no cambia el comportamiento visible validado en Fase 9;
3. no se introducen nuevas abstractions/primitives;
4. no se modifican contratos funcionales;
5. no se altera backend;
6. no aparecen regresiones en tests, lint, build o smoke;
7. cualquier hallazgo adicional se trata como delta y no como ampliación silenciosa.

> **Fase 10 — alcance congelado.**
