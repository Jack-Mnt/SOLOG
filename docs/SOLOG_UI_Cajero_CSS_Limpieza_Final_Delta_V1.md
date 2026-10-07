# SOLOG — UI Cajero — CSS Limpieza Final — Delta V1

**Estado:** CONGELADO — DECISIÓN APROBADA  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Clasificación:** Nivel B — limpieza estructural frontend Cajero  
**Rama:** `admin-work`

---

## 1. Alcance y precedencia

Este delta congela la Fase 2.7 — CSS final del Cajero.

Para este alcance prevalece sobre:

- `docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`
- `docs/SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`

Los deltas de las fases 2.1–2.6 permanecen vigentes salvo ajustes puramente estructurales de CSS descritos aquí.

No modifica backend, Supabase, Motor V4, contratos, reglas operativas ni navegación.

---

## 2. Objetivo

Dejar el CSS del Cajero representando el estado actual de la interfaz y no la acumulación histórica V3 → V4 → parches posteriores.

La limpieza se divide en tres fases:

1. **2.7.1 — limpieza estructural**
2. **2.7.2 — consolidación y cascade**
3. **2.7.3 — validación y cierre**

---

## 3. Fase 2.7.1 — limpieza estructural

### 3.1. Eliminar CSS realmente muerto

Retirar selectores sin consumidor actual, incluyendo bloques V3 reemplazados por la UI V4 vigente.

Ejemplos identificados:

- sesión/KPI/progreso V3;
- selectores de categoría V3;
- estados de fila reemplazados;
- helpers de captura ya no renderizados;
- variantes de stock-card ya no utilizadas;
- reglas de calculadora sin clase emisora;
- comentarios CSS desactivados sin valor documental.

### 3.2. Eliminar clases JSX sin efecto

Retirar únicamente clases que no tengan selector ni función contractual.

Confirmadas:

- `is-multiplier`;
- `cajero-stock-card--updated`;
- `cajero-review` si continúa sin consumidor CSS.

No eliminar hooks con uso real o dinámico.

### 3.3. Responsive

SOLOG Cajero mantiene como objetivo principal tablet y secundario tablet horizontal / desktop.

Por tanto, en `cajero.css`:

- retirar adaptaciones específicas `<=460px`;
- retirar adaptaciones específicas `<=599px`;
- retirar reglas `<=600px` que solo respondan a composición mobile histórica;
- conservar ajustes `<=720px` cuando sigan siendo útiles para tablet estrecha;
- conservar `<=899px`, `>=900px`, `>=1200px` cuando sean vigentes;
- conservar `prefers-reduced-motion`.

No se limpia responsive compartido de `operational.css` en 2.7.1 porque también lo consume Detalles.

### 3.4. Indicador de stock del header

Se restaura como composición base el sistema compacto por puntos.

Estados visuales:

- verde: actualizado;
- amarillo: próximo/crítico;
- rojo: desactualizado;
- countdown: mostrar el tiempo visible cuando corresponda.

Reglas:

- en estados normales no mostrar texto dentro del botón;
- mantener el pop-up explicativo existente;
- mantener significado accesible mediante `aria-label`;
- el countdown sí permanece visible;
- eliminar la media query histórica que ocultaba texto según viewport, porque ya no existen dos composiciones distintas.

### 3.5. Duplicados obvios

Se pueden retirar en 2.7.1 únicamente duplicados exactos o inequívocos que ya provea `operational.css`.

No realizar todavía una consolidación amplia de cascade.

---

## 4. Fase 2.7.2 — consolidación y cascade

Queda congelado para la siguiente fase:

- revisar duplicados restantes entre `cajero.css` y `operational.css`;
- preservar `operational.css` como base compartida cuando Detalles dependa de ella;
- revisar cascade y orden final;
- normalizar hardcodes solo cuando exista token semántico vigente;
- revisar breakpoints tablet;
- no rediseñar componentes.

---

## 5. Fase 2.7.3 — validación y cierre

Validaciones mínimas:

- tests dirigidos de Cajero;
- browser smoke V4;
- lint;
- build;
- `git diff --check`;
- smoke humano en tablet portrait, tablet horizontal y desktop.

Revisar expresamente:

- header, punto, countdown y pop-up;
- Inicio;
- Conteo;
- modal/calculadora;
- Revisar;
- Historial;
- navegación;
- recovery/alerts cuando sea viable.

---

## 6. Fuera de alcance

No realizar en este bloque:

- cambios backend/Supabase;
- cambios de Motor V4;
- cambios de contrato;
- rediseño funcional;
- refactor general del Design System;
- container queries;
- limpieza general de Detalles;
- eliminación indiscriminada de `operational.css`;
- soporte mobile específico nuevo.
