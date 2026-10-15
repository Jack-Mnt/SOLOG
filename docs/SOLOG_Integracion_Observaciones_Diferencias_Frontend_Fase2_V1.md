# SOLOG — Integración Frontend — Observaciones en Detalles — Fase 2 V1

**Estado:** IMPLEMENTADA EN `admin-work`; **pruebas automatizadas y smoke humano pendientes de ejecución/confirmación local**.  
**Fecha:** 15 de octubre de 2026.  
**Nivel:** B — implementación puntual de un módulo dentro de integración Nivel C.  
**Fuente primaria única:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.  
**Plan del bloque:** `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_Plan_V1.md`.  
**Backend desplegado:** `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md`.

## Alcance implementado

1. `src/features/solog/detalles/detalles.v2.ts`: extiende **solo** `DetailsCase` con los campos `motivo_diferencia`, `observacion_diferencia`, `observacion_reconteo` como `string | null`. El parser de `detail.case` exige las claves y valida catálogo de cinco motivos, texto mínimo efectivo, motivos de observaciones iniciales y `Resuelto` únicamente con teórico y físico de reconteo iguales. `history.items`, `export`, paginación y contrato V2 de las demás acciones permanecen intactos.
2. `src/features/solog/detalles/detalles.case.tsx`: añade `DetailsCaseObservations`, presentador de solo lectura integrado debajo de las métricas actuales y antes del contexto SKU. Secciones opcionales `Conteo inicial` y `Reconteo`. El motivo registrado recién en reconteo se etiqueta como tal; los históricos sin datos no muestran sección; `Resuelto` se muestra si viene de Supabase. No existe formulario, botón adicional ni mutación desde Detalles.
3. `src/features/solog/detalles/detalles.css`: composición compacta, responsive sin ancho fijo, colores/radio mediante tokens, texto con saltos de línea y ajuste de palabras largas.
4. `tests/fixtures/details-v2.mjs`: fixture `detail` con tres campos `null` para registros anteriores.
5. `tests/details-observaciones-v1.test.ts`: pruebas dirigidas de forma del contrato y HTML de notas inicial/reconteo, motivo tardío, `Resuelto`, datos nulos y respuestas inválidas.
6. `tests/details-v2.browser.mjs`: en el flujo existente de historial expandido, mock de dos observaciones y aserción de ambas sin nuevas consultas ni navegación.

## Reglas preservadas

- Las notas pertenecen a **cada caso** y etapa de conteo, no a una propiedad global del grupo.
- `observacion_diferencia === null` y motivo no nulo identifica incorporación durante reconteo para el consumidor de lectura, sin reetiquetar el conteo inicial.
- `observacion_reconteo = 'Resuelto'` se muestra literalmente solo cuando backend declara coincidencia física, no por resolución posterior.
- No se modificó `rpc_solog_details_v2`, otros RPC, Supabase, estados del Motor, `Cajero`, `Admin Control` ni `master`.
- La fase no supone activación de escritura V5, que corresponde a la Fase 3.

## Verificación y pendientes

**Comprobado directamente en GitHub:** archivos modificados existentes y revisión de diff para estos seis archivos, sin líneas añadidas con espacios finales ni marcadores de conflicto visibles. Este chequeo dirigido **no sustituye `git diff --check`**.

**Sin ejecutar en este entorno:** Bun tests, lint, build y browser smoke, por ausencia del checkout ejecutable con dependencias. Tampoco se dispone de casos reales nuevos con observaciones para smoke conectado (los registros previos son `NULL`).

Validar localmente en `admin-work`:

```powershell
git pull
bun test tests/details-observaciones-v1.test.ts tests/details-phase1.test.ts tests/details-phase2.test.ts tests/details-phase3.test.ts tests/details-phase4.test.ts
bun run lint
bun run build
git diff --check
```

Ejecutar también el runner habitual de `tests/details-v2.browser.mjs` cuando esté disponible. Smoke humano: abrir `/detalles`, desplegar un caso, verificar ausencia de secciones vacías en un histórico y visualización con una y dos observaciones mediante fixture/mock, tablet y escritorio; confirmar que no aparecen nuevas acciones de edición. Para validación de datos reales con notas esperar capturas V5 de Fase 3.

**Cierre de Fase 2:** pendiente de la evidencia de pruebas locales y smoke; no marcar verde sin ejecutarlos.
