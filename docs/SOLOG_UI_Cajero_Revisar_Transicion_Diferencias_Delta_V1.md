# SOLOG — UI Cajero — Revisar — Transición de Diferencias — Delta V1

**Estado:** CONGELADO — DECISIÓN APROBADA
**Fecha:** 6 de octubre de 2026
**Proyecto:** SOLOG
**Clasificación:** Nivel B — UX/UI frontend Cajero
**Rama:** `admin-work`

---

## 1. Alcance y precedencia

Este delta congela exclusivamente la Fase 2.3 — representación de transición de diferencias en `Revisar`.

Para este alcance prevalece sobre cualquier dirección más general contenida en:

- `docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`
- `docs/SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`

El resto de decisiones vigentes permanece sin cambios.

No modifica backend, Motor V4, contratos públicos, runtime ni lógica de elegibilidad.

---

## 2. Estructura preservada

La tabla mantiene exactamente:

```text
Nombre | Última diferencia | Diferencia actual
```

No se agrega una nueva columna.

---

## 3. Semántica de datos

- `Última diferencia` muestra `review_queue[].ultima_diferencia` y corresponde a la diferencia inicial autoritativa `d0`.
- `Diferencia actual` muestra el candidato local calculado desde el draft de reconteo:
  `stock_fisico_reconteo_draft - stock_teorico_sesion_actual`.
- Mientras no exista draft local válido, `Diferencia actual` muestra `—`.
- Cuando existe draft local, `Diferencia actual` muestra `→ valor`.

Ejemplo:

```text
Producto A | -4 | → -2
```

La flecha es únicamente presentacional. El frontend no debe inferir ni mostrar anticipadamente `Coincide`, `Confirmada` o `Inconsistente`.

---

## 4. Colores

Se restaura el tratamiento ya existente mediante `getCajeroDifferenceClass`:

- negativo → danger / rojo;
- cero → success / verde;
- positivo → primary / azul.

Se aplica tanto a `Última diferencia` como al valor de `Diferencia actual`.

La flecha `→` permanece neutra con color de texto secundario.

---

## 5. Accesibilidad

La fila expone un nombre accesible con contexto suficiente.

Sin draft:

```text
Revisar <grupo>, última diferencia -4, sin reconteo actual
```

Con draft:

```text
Revisar <grupo>, última diferencia -4, diferencia actual -2
```

La flecha visual usa `aria-hidden`.

---

## 6. Responsive

- no cambiar anchos de columnas;
- no agregar columna;
- la transición usa `white-space: nowrap`;
- preservar los breakpoints actuales de la tabla.

---

## 7. Fuera de alcance

No modificar en esta fase:

- resolución backend de diferencias;
- `review_queue`;
- modal de reconteo;
- nombres de columnas;
- Historial;
- Calculadora;
- terminología general;
- limpieza CSS global.
