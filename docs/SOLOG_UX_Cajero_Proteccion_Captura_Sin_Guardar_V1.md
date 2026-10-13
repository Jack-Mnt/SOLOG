# SOLOG — D.1.4 Protección de captura sin guardar V1

## Estado
Decisiones aprobadas. Implementación frontend en `admin-work`; sin cambios de backend ni motor.

## Fuente primaria
Este documento es la fuente primaria del cambio D.1.4. Conserva vigentes todos los contratos y decisiones de Cajero V4 que no modifica expresamente.

## Alcance funcional
- Proteger cantidades introducidas o modificadas que aún no fueron guardadas al abandonar el producto.
- Interceptar X, Escape, clic exterior, Regresar, flecha de retorno, Anterior, selección de otro producto y Siguiente cuando corresponde.
- No alterar el comportamiento de Continuar: captura y avanza sin confirmación extra.
- Si no existe edición pendiente, completar la salida inmediatamente.
- Si existe edición pendiente, mostrar tres acciones: Cancelar (seguir editando), Descartar (desechar únicamente la entrada no guardada y completar salida) y Guardar (persistir por la misma operación `runtime.capture` y completar salida).
- Deshabilitar Guardar cuando la cantidad no sea válida o el runtime no permita capturar.
- Ante error al guardar, permanecer en el producto y presentar el error; no descartar otras observaciones.
- Una cantidad nueva cero es válida. Expresiones diferentes que resulten en la misma cantidad ya guardada no constituyen modificación. Borrar una cantidad guardada sí constituye edición.
- Descartar una edición de una observación previamente guardada preserva el borrador persistido original.

## Fuera de alcance
No modificar Supabase, RPC, prioridades del motor, persistencia, idempotencia, envío por lotes, navegación general ni contenido de otras pantallas. No cambiar `master`.

## Implementación
- `src/features/solog/cajero/cajero.v4.ui.tsx`: confirmación y guardia de navegación.
- `src/features/solog/cajero/cajero.capture.guard.ts`: función pura para detectar cambios.
- `tests/cajero-capture-guard-v4.test.ts`: pruebas unitarias de detección.

## Validación pendiente
Ejecutar localmente `bun test tests/cajero-capture-guard-v4.test.ts`, la suite de Cajero V4, `bun run lint`, `bun run build`, `git diff --check` y smoke visual (Escape, X, clic exterior, Regresar, Anterior, cambio de producto, Continuar, Guardar/Descartar/Cancelar y fallo de persistencia).

La mera existencia de pruebas no acredita que hayan sido ejecutadas.
