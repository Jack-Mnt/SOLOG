# SOLOG — Integración frontend de observaciones — Fase 1 V1

**Estado:** IMPLEMENTACIÓN PREPARATORIA EN `admin-work`; **validación técnica ejecutable pendiente**.  
**Fecha:** 14 de octubre de 2026.  
**Clasificación:** Nivel C, integración frontend.  
**Fuente primaria única:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.  
**Delta aprobado para no mantener legacy:** `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_SinLegacy_Delta_V1.md`.  
**Backend desplegado:** `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md`.

## 1. Alcance implementado

- `src/features/solog/cajero/cajero.observaciones.v5.ts`: catálogo cerrado de cinco motivos; tipos inicial/reconteo, comprobación de `trim()` y explicación mínima de tres caracteres; `Resuelto` reservado para resultados del backend.
- `src/features/solog/cajero/cajero.v4.ts`: tipos de request y response V5, conservando bootstrap y modelo de panel V4 vigentes.
- `src/features/solog/cajero/cajero.v4.api.ts`: `mutateCashierV5` y `parseCashierV5Mutation`, RPC `rpc_solog_cashier_mutate_v5`, validación estricta de notas, tipos y `contract_version=5`.
- `src/features/solog/cajero/cajero.v4.store.ts`: adopción del shape de respuesta V5, sin alterar prioridades, ventanas ni cálculos del Motor.
- `src/features/solog/cajero/cajero.v4.errors.ts`: mensajes funcionales de siete errores V5.
- `src/features/solog/cajero/cajero.v5.batch.ts`: formato V5 de lote preparado, validación de claves exactas, serialización/restauración, identidad y payload inmutables, storage atómico de operación preparada + recibo.
- `tests/cajero-observaciones-v5.test.ts`: pruebas dirigidas de catálogo, transporte RPC, respuestas, payload, inmutabilidad, serialización y storage.

## 2. Límite consciente de esta fase

El envío operativo, `cajero.v4.runtime.ts`, `cajero.v4.flush.ts` y la calculadora **no fueron reencaminados todavía a V5**. La UI actual no recoge motivo/texto y V5 **rechaza autoritativamente** diferencias altas sin explicación. Cambiar el endpoint antes del diálogo causaría un estado híbrido defectuoso.

La Fase 3 debe conectar **simultáneamente** captura local de observaciones, drafts persistidos, preparación/enviado de lotes, recibos, inicio/cierre V5 e historial Cajero. Como está aprobado, no se desarrollará soporte legacy V4 en el producto terminado. La existencia transitoria del transporte V4 en esta etapa **no** es una política de compatibilidad de producción.

El almacenamiento preparado de V5 tiene validador propio y no pretende aún ser el almacenamiento de toda la sesión; en Fase 3 se integrará con los borradores, control de entrega y ciclo completo de recuperación. No afirmar que ese ciclo está validado ni que V5 ya opera en Cajero.

## 3. Validación realizada y pendiente

**Comprobado por lectura GitHub:**
- Los siete archivos fuente/test declarados existen en `admin-work`.
- Presencia de tipos, rutas V5, validadores, storage e informes.
- No hay conflictos de fusión visibles en los archivos inspeccionados.
- No se modificó `master`, Supabase ni interfaces visuales desde esta fase.

**Sin poder ejecutar en este entorno:** `bun test`, `bun run lint`, `bun run build`, `git diff --check` y E2E autenticado. El entorno de la sesión no tiene un checkout local completo ni Bun disponible; consultar el repositorio por API no equivale a ejecutar pruebas. No existen checks de GitHub Actions en el HEAD consultado.

**Comandos sugeridos para el checkout local en `admin-work`:**

```powershell
bun test tests/cajero-observaciones-v5.test.ts tests/cajero-api-v4.test.ts tests/cajero-contract-v4.test.ts tests/cajero-drafts-storage-v4.test.ts tests/cajero-flush-drafts-v4.test.ts tests/cajero-runtime-v4.test.ts
bun run lint
bun run build
git diff --check
```

Si alguno falla, corregir y repetir antes de considerar la Fase 1 validada. No activar V5 operativa por este reporte.

## 4. Puerta para Fase 2 y Fase 3

- Fase 2 (Detalles) solo depende de su RPC de lectura V2 desplegada y puede avanzar cuando las validaciones técnicas de Fase 1 estén aceptadas.
- Fase 3 debe usar un único camino de escritura V5 y cerrar el reemplazo del envío V4; no mantener un dispatcher de fallback legacy.
- Requiere prueba autenticada de `save_batch` / `recount_save_batch` antes de activar el flujo real.
- Respetar el delta del diseño de cronología: Admin no se diseña hasta la Fase 4.

**Cierre funcional:** pendiente de validaciones; no afirmar que el bloque o la fase tienen smoke aprobado.
