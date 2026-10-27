# SOLOG — UI Cajero — Tarjeta, productos y observaciones — Parte 2 V1

**Estado:** IMPLEMENTACIÓN REGISTRADA EN `admin-work`; validaciones ejecutables y smoke visual PENDIENTES.
**Clasificación:** Nivel B. Esta Parte 2 agrupa A1 + A2; Parte 1 (A3) ya validada por el usuario.
**Fuente primaria congelada (prevalece):** `docs/SOLOG_UX_Cajero_Tarjeta_Productos_Observaciones_Delta_V1.md`.
**Baseline previo a esta implementación:** `0b435d3cda4f89838a2d01e7ea1ce15f3edf852e`.
**No autoriza:** Supabase, Motor, V5, D.1.4, Detalles, Admin, `master`, Cloudflare ni refactors no relacionados.

## Implementación A1

- `cajero.v4.ui.tsx`: sustituido `<details>` inline por IconButton **Ver productos incluidos**, inmediatamente a la izquierda de **Agregar/Editar observación**, siempre habilitado como lectura aun cuando el conteo esté bloqueado. Se conserva el estado de la cantidad, observación, borrador, cuatro KPIs y navegación.
- `cajero.productos.dialog.tsx`: componente nuevo de solo lectura, sin peticiones remotas. Muestra nombre del grupo y total de SKU; por SKU presenta nombre, código interno, marca si existe y precio unitario. Muestra configuración de paquete **exclusivamente a nivel de grupo** cuando `unidades_por_paquete` y/o `precio_paquete` no sean null. No fabrica valorizaciones SKU.
- El diálogo secundario es scrollable para grupos numerosos, usa foco inicial en Cerrar y permite Tab hacia la región scrollable, Shift+Tab, Escape, X y clic en el backdrop; restaura el foco al activador al desmontarse. Comparte la suspensión del trap de captura previamente validada, sin alterar la del diálogo de observaciones.
- `cajero.css`: tarjeta con grid de contenido intrínseco (en lugar de `minmax(11rem,1fr)`), sin centrado vertical artificial, encabezado compacto y dos IconButtons con área mínima de 44×44; mismo grid 2×2 de KPIs y sin cambios en el teclado numérico.
- No cambia la RPC ni el contrato del panel.

## Implementación A2

- `cajero.observacion.dialog.tsx`: encabezado con contexto de operación, X coherente con iconos existentes y filas de radio con clase seleccionada/bloqueada. Mantiene los cinco motivos, selección vacía por defecto, motivo fijo en reconteo, Resuelto, umbral y comportamiento Aplicar/Limpiar/Cancelar/Omitir.
- `cajero.css`: estilos de selección/hover/focus/disabled, filas táctiles más legibles, textarea y ayuda, separación del footer y acción auxiliar alineada a la izquierda. Utiliza exclusivamente tokens existentes.

## Cobertura de tests incorporada

- `tests/cajero-productos-dialog.test.ts`: un SKU, precios individuales, grupos de 2 y 32 SKU, marcas null, configuración de paquete completa/parcial/ausente, vacío, accesibilidad estática y invariantes de presentación de observaciones.
- `tests/cajero-v4.browser.mjs`: recorridos reales de producto único y grupo con 16 SKU, orden de IconButtons, ausencia de `<details>`, cuatro KPIs, paquetes, Tab/Shift+Tab, Escape, X, clic fuera, foco restaurado y ninguna llamada adicional; apertura posterior de observaciones para regresión de capas.

## Preflight y validación

- Preflight de archivo y contrato: completo; datos ya disponibles en panel V4.
- Inspección de diff remoto: realizada, sin marcadores de conflicto ni espacios finales en las líneas añadidas a los archivos afectados.
- **No ejecutado aquí:** tests Bun, lint, typecheck/build, `git diff --check` local, browser y revisión visual. No declararlos verdes.

Comandos en PowerShell:

```powershell
git switch admin-work
git pull
bun test tests/cajero-productos-dialog.test.ts tests/cajero-integracion-v5.test.ts tests/cajero-capture-guard-v4.test.ts
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Navegador (con Playwright Chromium preparado):

```powershell
bun tests/cajero-v4.browser.mjs
```

Si el archivo de navegador contiene fallos heredados ajenos a la nueva UI, aislar los casos y reportarlos; no afirmar que se ejecutaron con éxito.

## Smoke humano pendiente

Comprobar tablet/escritorio y vista compacta: proporción de tarjeta, textos largos, nombres y códigos, precios, configuración de paquete, scroll, focos, roles, apertura y cierre de diálogos, motivos seleccionados, textarea, área de acciones, motivo fijo de reconteo y D.1.4. Registrar ajustes visuales posteriores como delta, no como cambio silencioso de las reglas congeladas.

**Pendiente del bloque superior:** retomar el smoke integral de observaciones Cajero/Detalles/Admin, incluyendo roundtrip V5 autenticado en ambiente autorizado.
