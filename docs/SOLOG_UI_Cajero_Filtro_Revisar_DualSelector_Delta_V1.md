# SOLOG — UI Cajero — Filtro Revisar DualSelector — Delta V1

**Estado:** CONGELADO — DECISIÓN APROBADA
**Fecha:** 5 de octubre de 2026
**Proyecto:** SOLOG
**Nivel:** B — UX/UI frontend Cajero
**Rama:** `admin-work`

---

## 1. Alcance y precedencia

Este delta congela exclusivamente la Fase 2.2 — filtro de `Revisar`.

Para este alcance prevalece sobre la dirección anterior `Todos | Faltantes | Sobrantes` documentada en:

- `docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`
- `docs/SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`

El resto de decisiones de esas fuentes permanece vigente.

No modifica backend, Motor V4, contrato público, runtime, store ni elegibilidad.

---

## 2. Decisión UX

Se conserva la composición compacta:

```text
[ + ] [ − ]
```

pero pasa a comportarse formalmente como un `DualSelector`.

Semántica:

- `+` = mostrar sobrantes, `ultima_diferencia > 0`;
- `−` = mostrar faltantes, `ultima_diferencia < 0`;
- ambos activos = mostrar todos los casos de `review_queue`;
- estado inicial = ambos activos;
- nunca se permite dejar ambos inactivos.

Cada opción es independiente y usa semántica de toggle con `aria-pressed`.

---

## 3. Invariante de negocio

`review_queue` contiene únicamente diferencias iniciales distintas de cero.

```text
d0 = 0  -> Coincide
d0 != 0 -> Recontar
```

Por tanto, un caso válido de `Revisar` pertenece exactamente a una de dos clases:

- faltante;
- sobrante.

No existe una tercera clase válida con `ultima_diferencia === 0`.

---

## 4. Composición

- el `DualSelector` de Revisar se ubica dentro del heading, en la esquina superior derecha, equivalente a la posición de `Hoy/Ayer` en Historial;
- Revisar e Historial usan la misma clase base `.cajero-segmented-control` para normalizar geometría y estados visuales;
- ancho mínimo por segmento: `76px` en desktop/tablet y `64px` en móvil `<=460px`;
- alto mínimo por segmento: `44px`;
- contenedor: `gap: 2px`, `padding: 3px`, borde y radius compartidos;
- Revisar puede usar un modificador exclusivamente tipográfico para `+/-`, sin alterar geometría;
- sin contadores;
- sin cambio de representación responsive;
- estado activo visible mediante el patrón existente;
- foco visible;
- no cambiar tabla ni columnas de Revisar.

---

## 5. Fuera de alcance

No modificar en esta fase:

- transición visual `-4 -> -2` de Fase 2.3;
- modal de reconteo;
- Historial;
- Calculadora;
- terminología general;
- limpieza CSS final.
