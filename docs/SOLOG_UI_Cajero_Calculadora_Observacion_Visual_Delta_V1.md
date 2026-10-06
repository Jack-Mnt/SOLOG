# SOLOG — UI Cajero — Calculadora y Reserva de Observación — Delta V1

**Estado:** CONGELADO — DECISIÓN APROBADA
**Fecha:** 6 de octubre de 2026
**Proyecto:** SOLOG
**Clasificación:** Nivel B — UX/UI frontend Cajero
**Rama:** `admin-work`

---

## 1. Alcance y precedencia

Este delta congela exclusivamente la Fase 2.5 — composición visual de la calculadora de conteo y reserva visual de la futura acción de observaciones.

Para este alcance prevalece sobre cualquier dirección general contenida en:

- `docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`
- `docs/SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`

El resto de decisiones vigentes permanece sin cambios.

No modifica backend, Supabase, Motor V4, contratos públicos ni persistencia de drafts.

---

## 2. Dispositivo objetivo

La composición se diseña para tablet, tablet horizontal y desktop.

No se agregan adaptaciones específicas para mobile en esta fase.

---

## 3. Calculadora

La calculadora adopta una matriz visual de cinco columnas y cuatro filas:

```text
7 | 8 | 9 | ×6  | ×
4 | 5 | 6 | ×12 | ×
1 | 2 | 3 | ×15 | +
C | 0 | ⌫ | ×24 | +
```

### 3.1. Multiplicadores rápidos

Se congelan:

- `×6`;
- `×12`;
- `×15`;
- `×24`.

Los multiplicadores agregan una operación a la expresión existente; no sustituyen directamente el valor.

Ejemplo:

```text
3 + ×24
=> 3 × 24
=> 72
```

La representación visual usa el símbolo `×`.

### 3.2. Operadores generales

- `×` ocupa visualmente dos filas;
- `+` ocupa visualmente dos filas;
- ambos conservan el tratamiento visual de operador.

### 3.3. Controles

La fila inferior contiene:

- `C`;
- `0`;
- Backspace;
- `×24`.

`C` usa tratamiento danger-soft.

Backspace usa un icono de `lucide-react` y conserva el nombre accesible `Borrar último carácter`.

### 3.4. Display

Se conserva la separación actual entre:

- expresión;
- resultado evaluado.

No se modifica el límite máximo de conteo ni la semántica del evaluador.

---

## 4. Reserva visual — Observación

La tarjeta de información del grupo incorpora en la esquina superior derecha un IconButton de 44 × 44 px.

Características:

- icono `MessageSquarePlus`;
- `aria-label="Agregar observación (próximamente)"`;
- estado `disabled`;
- sin `onClick`;
- sin modal;
- sin estado local;
- sin badge;
- sin persistencia;
- sin modificación del draft.

El objetivo es reservar la geometría definitiva para una futura implementación funcional de observaciones.

---

## 5. Fuera de alcance

No modificar:

- backend o Supabase;
- modelo de datos;
- contrato de conteos;
- Motor V4;
- lógica de envío;
- navegación del modal;
- responsive mobile;
- limpieza CSS general.

La implementación funcional de observaciones deberá abordarse posteriormente como un bloque independiente con contrato backend propio.
