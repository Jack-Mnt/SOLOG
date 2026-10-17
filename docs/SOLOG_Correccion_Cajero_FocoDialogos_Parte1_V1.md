# SOLOG — Corrección Cajero — Foco y teclado en diálogos anidados — Parte 1 V1

**Estado:** IMPLEMENTADO EN `admin-work`; validación ejecutable local y smoke por teclado PENDIENTES.
**Clasificación:** Nivel B, Parte 1 (A3) del delta UX Cajero.
**Baseline inspeccionado:** `6699805bb946973ef3faa2f61d99d32c87e21bd8`.
**Fuente primaria única:** `docs/SOLOG_UX_Cajero_Tarjeta_Productos_Observaciones_Delta_V1.md`.
**Fuera de alcance:** A1 tarjeta/productos, A2 refinamiento visual, Motor, negocio, D.1.4 salvo foco, Supabase, `master`.

## Implementación

1. `src/features/solog/cajero/cajero.v4.ui.tsx`: referencia sincronizada con el diálogo de observaciones; cuando está abierto, el manejador global de teclado del modal de captura **no** procesa Tab ni Escape. Al cerrarse, vuelve a ser dueño del teclado de captura/confirmación D.1.4.
2. `src/features/solog/cajero/cajero.observacion.dialog.tsx`: foco inicial en botón Cerrar; recuperación del foco al elemento activador si continúa montado; trap simétrico en Tab/Shift+Tab, excluyendo controles deshabilitados y contando **todos los radios nativos como un único tab stop** (el seleccionado o, si ninguno, el primero habilitado). Escape cierra solo el diálogo superior. Flechas y Espacio se dejan al comportamiento nativo del input radio; no se fuerza Tab entre los cinco motivos. `tabIndex=-1` en el contenedor permite un fallback cuando no haya controles disponibles.
3. `tests/cajero-v4.browser.mjs`: pruebas Playwright con mocks y sin tráfico externo de entrada/salida del grupo radio, navegación por flechas, Tab y Shift+Tab simétricos, focos inicial y restaurado, Escape anidado, diálogo obligatorio/omisión, confirmación D.1.4 y motivo previo bloqueado en reconteo. Se actualiza la expectativa obsoleta del botón de observaciones deshabilitado.

## Validaciones

- **Inspección GitHub:** comparación de diff desde baseline: tres archivos de código/prueba afectados, sin conflictos ni espacios finales observados en líneas añadidas.
- **No ejecutado en esta sesión:** suite Bun, lint, build, `git diff --check` real ni Playwright. No declarar verde hasta evidencia local.
- Pruebas dirigidas:
  ```powershell
  git switch admin-work
  git pull
  bun test tests/cajero-integracion-v5.test.ts tests/cajero-capture-guard-v4.test.ts
  bun run lint
  bun run build
  git diff --check
  ```
- Prueba real de teclado con browser instalado y variables de entorno habituales del repositorio:
  ```powershell
  bun tests/cajero-v4.browser.mjs
  ```
  Verificar el script completo. Su suite histórica contiene escenarios de recovery que pueden requerir mantenimiento independiente de fixtures V5 si no se ejecutaron tras el cambio de protocolo; informar evidencia antes de ampliar alcance.

## Aceptación pendiente

1. Tab desde X entra una sola vez en grupo de radios; flechas cambian la selección; Tab pasa a textarea; Shift+Tab retorna al motivo seleccionado.
2. Tab/Shift+Tab circulan dentro del diálogo sin llegar a calculadora, con `Aplicar` deshabilitado cuando no corresponde.
3. En motivo de reconteo bloqueado, Tab omite radios y salta a textarea (o siguiente botón habilitado).
4. Escape en observaciones deja captura abierta y restaura foco; desde diálogo obligatorio abierto por Guardar, un Escape cierra observaciones, segundo Escape cierra confirmación D.1.4.
5. Clic en Omitir no dispara mutación y respeta draft anterior.
6. No cambios visuales ni de composición antes de Parte 2.

**Próxima acción:** recibir validación local. Tras aprobación de Parte 1, ejecutar A1+A2 como Parte 2 y después un smoke visual humano.
