# SOLOG — Integración Cajero — E2: Validación segura sin entorno aislado V1

**Estado:** REVISIÓN E2 completada para el alcance no destructivo; **sin E2E externo de fallos de red ni concurrencia real**.
**Fecha:** 2026-11-20 (America/Lima).
**Clasificación:** Nivel C — validación conceptual/técnica de casos límite; **sin implementación**.
**Backend:** Supabase `fvtohxvcvsflzmftgfzs`. **Repositorio:** `Jack-Mnt/SOLOG`, rama `admin-work`.
**Contexto de restricción:** no se dispone de entorno aislado; el usuario decidió continuar con las comprobaciones seguras disponibles, sin crearlo.

## 1. Fuentes y precedencia

- **Funcional principal de O1 (horario, B4/B5):** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
- **Funcional principal de entrega/recovery:** `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`.
- **Contrato desplegado:** `docs/SOLOG_Backend_Cajero_Contrato_Consumo_Horario_V1.md`.
- **Delta de activación:** `docs/SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md` (política `required`).
- **Evidencia backend anterior:** `docs/SOLOG_Backend_Cajero_E1_Recovery_Idempotencia_B4_B5_Validacion_V1.md`.
- Este documento registra alcance y evidencia adicional; **no sustituye** fuentes congeladas ni concede permiso para modificar backend o frontend.

## 2. Baseline y CI verificadas

- Commit de código `5d10b19963183de6670a6c2c53ac14ece14192ad`, presente tanto en `master` como en `admin-work` antes del reporte E1.
- Comparación GitHub `84f2c4d1c7502ab949e4f57051e02894b14c815a…5d10b19963183de6670a6c2c53ac14ece14192ad`: **solo 2 archivos de documentación añadidos**, ningún cambio de código. Por ello la CI previa es aplicable al código desplegado.
- CI [#44196074189](https://github.com/Jack-Mnt/SOLOG/actions/runs/44196074189), completada correctamente sobre `84f2c4d1`: pruebas dirigidas Full **70 PASS**, global Bun **877 PASS**, Chromium simulado **35 PASS**, lint, typecheck/build y diff-check todos **PASS**.
- **La CI no se reejecutó en E2**: se revisó su evidencia previa y se verificó que no hubo modificaciones de código posteriores.

## 3. Revisión de frontend y escenarios simulados

Inspección directa en `admin-work` de:
- `src/features/solog/cajero/full.runtime.ts`: `solog.full2`, persistencia del UUID/payload previo a V7, `flushInside`, `resumePrepared`, `sendPending`, `finish`, priorización y resolución B5.
- `src/features/solog/cajero/full.app.tsx`: reintento preparado, recuperación al volver a conexión/foco, autocierre por vencimiento, fallback y modal, protección logout, Web Locks.
- `src/features/solog/cajero/full.start-dialog.tsx`, `full.conflict-dialog.tsx` y parser de contrato.
- `tests/cajero-full-registro-autocierre.test.ts`, `tests/cajero-full-conflictos-b5.test.ts`, `tests/cajero-full.browser.mjs`.

| Escenario | Evidencia presente | Tipo / alcance |
|---|---|---|
| Respuesta perdida tras `save_batch`, `finish` y `start` | UUID/payload preservados, replay y receipt reconciliado | Bun + Chromium **simulados** |
| Recovery de borrador anterior a expiración | Envío autorizado, cierre y ausencia de captura nueva | Chromium **simulado** |
| Límite exacto `pending_delivery_until` | No preparar nuevo envío, conservar borrador | Chromium **simulado** |
| B5 definitivo | Rechazo de lote, `field_path`, separación solo con confirmación humana, no envío automático | Bun + Chromium **simulados** |
| Fallback | Aceptación explícita, 30 s de espera con una V6, sin V7 automático, Escape/Tab | Chromium **simulado** |
| Pérdida de persistencia local | No inventa borrador ni llama V7 | Chromium **simulado** |
| Dos ventanas / instancia única | Ventana secundaria sin V6/V7; transferencia manual, UUID conservados, fallback sin Web Locks | Chromium con navegador real y servidor **simulado** |
| Cambio de prioridad entre batches | Refresco autoritativo; dos batches en orden correcto | Bun + Chromium **simulados** |
| Reconteo `recount_save_batch` | Se prepara y finaliza con manifest | Chromium **simulado** |

**Distinción indispensable:** estos casos corren en un navegador real, pero interceptan/simulan las RPC. No prueban cortes externos en Supabase ni simultaneidad de transacciones PostgreSQL.

**Observación existente fuera del alcance de E2:** `full.app.tsx` conserva el texto provisional `Motivo y diferencia inicial: pendiente de contrato de lectura.` para reconteos. Ya está documentado como dependencia de contexto original y no apareció por E2; la ruta de envio está simulada, pero la información original del caso no está disponible para la UI. No inventar ese contexto ni ampliar un contrato backend sin un bloque independiente.

## 4. Pruebas backend adicionales sin escritura

Se ejecutaron **7/7 escenarios sintéticos por SELECT** sobre `inventario.full_cashier_start_offer_v3` y `inventario.full_window_v3` desplegadas, usando tiempos y snapshots sintéticos *solo como argumentos*, con ID de sede y usuario autorizado real para la evaluación de oferta:

1. Nuevo snapshot a HH:00:30 → `new`, inicio elegible, sin confirmación.
2. Captura de la generación anterior a HH:00:30 → `fallback`, inicio elegible, `requires_confirmation=true`.
3. HH:56:59.999 → inicio elegible.
4. HH:57:00 → `unavailable / START_WINDOW_CLOSED`.
5. Quedan menos de 180 s de stock → `unavailable / START_CAPTURE_TOO_SHORT`.
6. Fin de turno 08:00 → `session_expires_at=08:00`.
7. Fin de turno 16:00 → `session_expires_at=16:00`.

**Todos los predicados esperados coincidieron con las respuestas.** No se generaron sesiones ni se modificaron snapshots.

Consulta remota independiente 2026-11-20 14:42 (America/Lima):
- Política `required`; **3 sesiones V3** históricas, **0 activo/recovery**.
- **0 reservas B4** y **0 conflictos remotos**.
- **0** ventanas con referencia, expiración o plazo de entrega incoherentes.

## 5. Dictamen y riesgos residuales

**E2 no destructivo: APROBADO** dentro del alcance de inspección + CI preexistente y 7 casos sintéticos por lectura. No se detectó defecto nuevo demostrable que obligue a modificar el backend o frontend en este alcance.

**NO verificado por falta de aislamiento / prueba integrada de fallo:**
- Timeout real después de que la RPC confirme, seguido de replay en conexión nueva con JWT/dispositivo reales.
- Dos transacciones de PostgreSQL compitiendo por la misma reserva B4.
- Batch B5 completo rechazado por la RPC real con `field_path` y resolución humana en producción.
- Sesión recovery real de múltiples tareas con fallo de red y vencimiento límite.
- Fallback con snapshot vigente real en una ventana natural, sin tocar datos de operación.

**Riesgo reconocido:** producción y Preview comparten backend y el mismo código base; **no provocar artificialmente estos fallos en registros operativos**. Las pruebas transaccionales del reporte E1, los tests simulados y el smoke normal del usuario son evidencia acumulada, pero no equivalen a los escenarios excluidos.

**Siguiente paso recomendado:** ejecutar E3 — revisión global proporcional, matriz de aceptación por evidencia y propuesta de cierre de O1 con **riesgos residuales explícitos sujetos a aprobación del usuario**. No declarar O1 cerrado ni eliminar los pendientes por su imposibilidad de prueba.
