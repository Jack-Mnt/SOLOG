# SOLOG — Corrección Cajero — Ruta Full y tarjeta de productos V1

**Estado:** corregido en `admin-work`; pruebas ejecutables y smoke visual PENDIENTES.
**Fecha:** 2026-10-27.
**Tipo:** delta puntual de integración frontend sobre Parte 2 (Nivel B).
**Fuente primaria congelada:** `docs/SOLOG_UX_Cajero_Tarjeta_Productos_Observaciones_Delta_V1.md`. Se conserva íntegra.
**Referencias:** `docs/SOLOG_Correccion_Cajero_Restauracion_Interfaz_Full_Parcial_V1.md` (rutamiento actual) y `docs/SOLOG_UI_Cajero_Tarjeta_Productos_Observaciones_Parte2_V1.md` (implementación anterior en UI V4, insuficiente para runtime Full).

## Diagnóstico reproducible

Las capturas de smoke posteriores a Parte 2 seguían mostrando un `<details><summary>Productos incluidos</summary>` y un único botón de observación, pese a haber actualizado `src/features/solog/cajero/cajero.v4.ui.tsx`.

La inspección del bootstrap de ruta verificó la cadena real:

```
src/features/solog/cajero/cajero.app.tsx
→ FullCashierPanel
→ src/features/solog/cajero/full.app.tsx
→ CaptureDialog
```

`full.app.tsx` mantenía el disclosure antiguo. El frontend V4 dejó de ser la ruta operativa de Cajero después del cambio a **Full Runtime** con lecturas RPC V6 y escrituras RPC V7. La inspección previa de Parte 2 no siguió el punto de montaje activo y por eso el código actualizado no aparecía en el navegador. No era un fallo de recarga ni de CSS.

## Corrección aplicada

1. `full.app.tsx`: sustituido disclosure por **Ver productos incluidos** a la izquierda de **Agregar observación**. Reutiliza la tarjeta compacta de `cajero.css`; añade montaje condicional del diálogo y suspende el manejador superior de Tab/Escape del modal padre mientras el secundario está abierto.
2. `cajero.productos.dialog.tsx`: normaliza internamente el shape de lectura de **FullGroup** y **CashierV4Group** sin duplicar el diálogo. `FullGroup.members[]` dispone de `c_interno`, `product`, `barcode`, `price`; NO trae `marca`. No se inventa una marca. La configuración de paquete proviene de `units_per_package`/`package_price` del grupo, nunca del SKU. `CashierV4Group` conserva su shape original.
3. `tests/cajero-productos-dialog.test.ts`: render de FullGroup real, dos precios, grupo, paquetes y nulabilidad.
4. `tests/cajero-full.browser.mjs`: nuevos recorridos sobre **la UI efectivamente montada** (Full V6/V7), con 1/16 SKU, 4 KPIs, orden de botones, ausencia de disclosure, Tab/Shift+Tab, Escape, X, clic exterior, restauración de foco y confirmación de no RPC/no borradores alterados.

**No se modificaron:** Full Runtime, contratos V6/V7, backend, Motor, captura, guardia D.1.4, validación de motivo, escritura, recuperación, outbox, `master` o despliegues.

## Prevalencia y estado documental

Este archivo corrige la **selección de la superficie operativa** para Parte 2. En caso de contradicción con el reporte anterior `SOLOG_UI_Cajero_Tarjeta_Productos_Observaciones_Parte2_V1.md`, prevalece **solo para la ruta activa Full**. La fuente funcional UX V1 sigue congelada y no se reinterpreta. La UI V4 permanece en el repositorio como código preexistente, pero no autoriza a marcar validada la pantalla visible de Full.

El contrato Full V6/V7 tiene límites independientes documentados (contexto de reconteo, KPI global y otros), fuera del alcance de esta corrección. No inferir campos ausentes para resolverlos.

## Validación pendiente en entorno de desarrollo

```powershell
git switch admin-work
git pull --ff-only
git grep -n -F "Ver productos incluidos" -- src/features/solog/cajero/full.app.tsx
bun test tests/cajero-productos-dialog.test.ts tests/cajero-full-presentacion-regresion.test.ts
bun test --reporter=dot
bun run lint
bun run build
git diff --check
bun tests/cajero-full.browser.mjs
```

**Nota:** ejecutar el browser smoke real en entorno con Playwright Chromium instalado y configurar `SOLOG_TEST_BROWSER` si corresponde. Sin estos resultados no declarar validación técnica. Tras éxito, repetir smoke visual de grupo único y agrupado y dialog de observaciones. El problema original quedará corregido solo cuando el DOM real no muestre `details` y muestre los dos IconButtons y el diálogo de productos.

## Regresión evitada

Antes de volver a modificar una pantalla de SOLOG, validar primero su punto de montaje efectivo en `cajero.app.tsx` y el contrato de lectura del runtime; no asumir que el nombre de un archivo V4 identifica la UI activa.
