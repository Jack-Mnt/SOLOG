# SOLOG — Integración de observaciones — Fase 4 Admin Control — V1

**Estado:** IMPLEMENTADA EN `admin-work`; validación técnica ejecutable y smoke global PENDIENTES.
**Fecha:** 2026-10-15. **Nivel:** B, dentro del bloque Nivel C.
**Fuente primaria única del bloque:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.
**Delta visual provisional:** `docs/SOLOG_UI_AdminControl_Observaciones_Popup_Delta_V1.md`.
**Backend desplegado:** `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md` y delta de cronología
`docs/SOLOG_Backend_Observaciones_Diferencias_Cronologia_Delta_V1.md`.

## 1. Implementación realizada

1. `src/features/solog/admin/admin.v2.ts`: tipos y validación de `observaciones.inicial` / `observaciones.reconteo` en `chronology[]`. Ambos pueden ser `null`; cuando existen exigen motivo válido cuando corresponda, texto >=3 caracteres efectivos y fecha válida. Rechaza motivos contradictorios, `Resuelto` fuera de `Coincide` y observaciones humanas en un evento `Coincide` generado exclusivamente por snapshot.
2. `src/features/solog/admin/control/admin.control.v2.tsx`: añade un IconButton `Info` **solo** en los eventos con anotaciones. La activación abre un panel contextual no modal en el mismo evento; presenta un motivo común (si existe) y dos secciones diferenciadas con el texto y fecha de Lima: `Conteo inicial` y `Reconteo`. Se cierra con el botón X, Escape, clic o foco exterior. Escape no debe cerrar el drawer padre. Se admite una sola apertura simultánea.
3. `src/features/solog/admin/admin.css`: estilos localizados en el bloque `admin-control-chronology__observation-*`, sin ancho fijo y reutilizando los tokens del Design System.
4. `tests/fixtures/admin-v2.mjs`: fixtures con cero, una y dos observaciones, más un evento con anotación en `previous_counts`.
5. `tests/admin-control-observaciones-v1.test.ts`: pruebas de contrato, fechas, procedencia, restricciones y render estático.
6. `tests/admin-v2.browser.mjs`: pruebas de clic, Escape (sin cerrar drawer), X, clic fuera, uno/dos textos, datos de quincena anterior y ausencia de RPC adicionales.

## 2. Invariantes preservadas

- Sin modificaciones a Supabase, migraciones, permisos, Motor o endpoints de Control.
- Mantiene la respuesta `contract_version=2` y la RPC pública `rpc_solog_admin_control_v1`.
- Mantiene `row_id`, los estados de cronología, timestamps, colores, orden, `current_biweekly` y `previous_counts`.
- Mantiene el filtrado, la paginación de Control, sus métricas, exportación y reutilización de caché.
- `Coincide` por reconteo puede mostrar **ambos** momentos sin crear eventos artificiales.
- Ningún evento automático de snapshot hereda una nota humana.

## 3. Control de cambios

Se actuó directamente en `admin-work`, conservando cambios concurrentes no relacionados: se observaron documentos nuevos de otro bloque backend de Dashboard durante la ejecución, y **no fueron modificados** por esta fase.

La composición visual queda **provisional**, como aprobó el usuario al decidir que la revisión y ajustes visuales se realizarán en un smoke integral al terminar las cuatro fases.

## 4. Verificación y tareas pendientes

**Inspección efectuada:** lectura de fuente primaria, delta y contrato desplegado; revisión de componentes existentes y estructura del drawer; revisión de diff remoto limitado a los archivos afectados por esta fase.

**Sin validación ejecutada desde este entorno:** `bun test`, lint, typecheck/build, `git diff --check`, Playwright y smoke humano. No se dispone de un checkout ejecutable ni de Bun para SOLOG aquí. No declarar estos controles aprobados antes de recibir resultados locales.

**Comandos sugeridos para `admin-work`:**

```powershell
git switch admin-work
git pull
bun test tests/admin-control-observaciones-v1.test.ts tests/admin-control-v3.test.ts
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

El recorrido Playwright existente de `tests/admin-v2.browser.mjs` / `tests/admin-control-v3.browser.mjs` debe ejecutarse con los parámetros de browser habituales del repositorio (`SOLOG_PLAYWRIGHT_MODULE`, `SOLOG_TEST_BROWSER`).

## 5. Revisión global y smoke integral posteriores

Con pruebas técnicas conformes, hacer **un único smoke humano transversal**:

- **Cajero:** motivo voluntario, diferencias +/-12, reconteo con motivo previo y nuevo, `Resuelto`, omisión, guardar/descartar D.1.4, envío V5, reintentos y persistencia.
- **Detalles:** textos inicial/reconteo diferenciados, `Resuelto` y registros históricos nulos.
- **Admin Control:** ícono solo en eventos con nota, fechas originales de ambos contextos, `Coincide` con dos explicaciones, snapshot sin nota, cierre accesible y ambas quincenas.
- **Visual:** tablet/escritorio y ajuste de geometría/densidad/tokens acorde a la revisión del usuario.

**Pendiente adicional de alto impacto:** validar escritura y lectura autenticada de `rpc_solog_cashier_mutate_v5` mediante una sesión y snapshots autorizados en un entorno seguro. Los unit tests y mocks no equivalen a ese roundtrip.

Después del smoke y sus deltas visuales, realizar revisión global proporcional y pedir el cierre expreso del bloque. No hacer merge a `master` ni reactivar despliegues por esta fase.
