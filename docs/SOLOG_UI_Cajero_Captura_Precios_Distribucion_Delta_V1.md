# SOLOG — UI Cajero — Distribución y precios de productos — Delta V1

**Estado:** implementado en `admin-work`, validación técnica y smoke visual pendientes.
**Fecha:** 2026-10-27. **Clasificación:** Nivel A (ajuste puntual de composición y pruebas).
**Fuente primaria funcional vigente:** `docs/SOLOG_UX_Cajero_Tarjeta_Productos_Observaciones_Delta_V1.md`.
**Prevalencia:** este delta sustituye **solo** la posición de calculadora/navegación y la composición de filas/precios del detalle de productos. Todo lo demás de la fuente primaria permanece congelado.

## Aclaración aprobada

La definición del grupo obliga a que sus productos compartan el mismo precio unitario; no se presenta una alternativa de «precios variables». Un grupo puede tener `unidades_por_paquete` y/o `precio_paquete`. Esa configuración pertenece al **grupo**, no a cada SKU.

## Cambio implementado

1. `src/features/solog/cajero/cajero.css`: la fila informativa del grid de captura absorbe el espacio vertical sobrante, manteniendo la tarjeta arriba y la calculadora inmediatamente sobre la navegación junto al borde inferior. En alturas pequeñas se conserva el desplazamiento vertical del modal.
2. `src/features/solog/cajero/cajero.productos.dialog.tsx`: el encabezado muestra `Precio unitario` del **grupo** (V4: `precio`; Full V6/V7: `price`) y, si existen, `Unidades por paquete` / `Precio por paquete`. Se elimina el bloque inferior duplicado de configuración de paquete. Cada fila muestra `Código #...` a la izquierda y **nombre del SKU** a la derecha; marca opcional bajo el nombre cuando el contrato V4 la entregue, sin inventarla para Full.
3. `tests/cajero-productos-dialog.test.ts`: fixtures con precios homogéneos, grupos con paquete completo/parcial/ausente, 1/2/32 SKU, composición código/nombre y tarifa única.
4. `tests/cajero-full.browser.mjs`: fixture Full con tarifa homogénea y assertions de precio en encabezado, ausencia de precios por fila y cercanía de navegación al pie del modal.

No cambia Motor, RPC, RLS, Supabase, captura, valoración ni la lógica de los paquetes. No se modifica `master` ni se habilitan despliegues.

## Validación requerida

```powershell
git switch admin-work
git pull --ff-only
bun test tests/cajero-productos-dialog.test.ts
bun test --reporter=dot
bun run lint
bun run build
git diff --check
bun tests/cajero-full.browser.mjs
```

**No validado desde el entorno de GitHub:** estos comandos requieren ejecución local con Bun y Playwright. Tras resultado técnico correcto, el usuario confirmará mediante smoke visual en tablet/escritorio la posición inferior de la calculadora y el nuevo listado compacto.
