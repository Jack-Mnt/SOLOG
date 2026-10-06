# SOLOG — UI Cajero — Historial — Revisión Visual Post-Motor — Delta V1

**Estado:** CONGELADO — DECISIÓN APROBADA
**Fecha:** 6 de octubre de 2026
**Proyecto:** SOLOG
**Clasificación:** Nivel B — UX/UI frontend Cajero
**Rama:** `admin-work`

---

## 1. Alcance y precedencia

Este delta congela exclusivamente la Fase 2.4 — revisión visual de Historial.

Para este alcance prevalece sobre cualquier dirección general contenida en:

- `docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`
- `docs/SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`

El resto de decisiones vigentes permanece sin cambios.

No modifica backend, Motor V4, `rpc_solog_cashier_history_v2`, caché, fechas ni lógica de carga.

---

## 2. Dispositivo objetivo

SOLOG Cajero se diseña principalmente para tablet.

También se admite tablet horizontal y desktop.

Mobile no es un objetivo de diseño específico. En esta fase:

- no se agregan adaptaciones para móvil;
- no se modifican breakpoints existentes;
- cualquier limpieza o consolidación de CSS responsive mobile queda diferida a Fase 2.7.

---

## 3. Arquitectura de Historial preservada

Se conserva:

- selector `Hoy / Ayer`;
- `Todas / Por categorías`;
- categorías expandibles;
- tabla `Nombre | Diferencia | Valorizado`;
- expansión de detalle;
- diferencia;
- valorizado;
- colores por signo;
- información de conteo y reconteo.

No se rediseña Historial.

---

## 4. Acción de expansión

Se sustituye la representación textual:

```text
+ / −
```

por iconos de `lucide-react`:

```text
cerrado -> ChevronRight
abierto -> ChevronDown
```

El botón conserva:

- `44 x 44 px`;
- `aria-expanded`;
- nombre accesible `Expandir/Contraer detalle de ...`;
- icono decorativo con `aria-hidden`.

La cuarta celda del encabezado permanece visualmente vacía.

---

## 5. Evidencia de reconteo

La existencia del bloque de reconteo no debe inferirse desde el estado final.

Un reconteo puede producir:

```text
Coincide | Confirmada | Inconsistente
```

Por tanto, Historial considera que existe evidencia de reconteo cuando al menos uno de estos campos está presente:

```text
recontado_at
snapshot_reconteo_id
stock_reconteo
```

Cuando existe evidencia, se muestran los campos vigentes:

- Hora de reconteo;
- Stock posterior;
- Reconteo.

Esto incluye correctamente el caso `Coincide` producido por `dr = 0`.

---

## 6. Layout del detalle

Se conserva el layout actual de tres columnas.

No se introduce adaptación adicional para móvil.

---

## 7. Fuera de alcance

No modificar:

- contrato History V2;
- backend o Supabase;
- Motor V4;
- nombres de columnas;
- categorías;
- lógica de caché;
- carga Hoy/Ayer;
- tokens o limpieza CSS;
- breakpoints responsive existentes.

La limpieza responsive/mobile se evaluará en Fase 2.7.
