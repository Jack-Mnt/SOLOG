# SOLOG — UI Cajero — Conflictos B5 — Validación Fase 4 V1

**Estado:** IMPLEMENTADA. Validación dirigida, lint, build, `git diff --check` y smoke Chromium **APROBADOS**. **Suite global NO aprobada** por un fallo de Admin fuera del alcance; revisar en Fase 5.
**Fecha:** 2026-11-16 (America/Lima).
**Rama:** `admin-work`. **Baseline inicial:** `19e991e9fb4a0858a86fb6cc6c1263db6baa34fa`.
**Fuente primaria funcional:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
**Contrato backend:** `docs/SOLOG_Backend_Cajero_Contrato_Consumo_Horario_V1.md`.
**Evidencia CI:** https://github.com/Jack-Mnt/SOLOG/actions/runs/44013754845

## 1. Alcance ejecutado

Archivos de frontend y pruebas:
- `src/features/solog/cajero/full.runtime.ts`
- `src/features/solog/cajero/full.app.tsx`
- `tests/cajero-full-conflictos-b5.test.ts` (nuevo)
- `tests/cajero-full.browser.mjs`
- `.github/workflows/solog-cajero-full-v3-contracts.yml`

No se modificó Supabase, tablas, funciones, permisos, Motor, Admin ni `master`.

## 2. Comportamiento implementado

1. V7 conserva en cada `start/save_batch/recount_save_batch/finish` rechazado definitivamente el receipt recibido: `request_id`, `server_now`, `action_required`, `errors`, `errors_total`, `errors_truncated` y código.
2. El journal `solog.full2` mantiene compatibilidad con instancias anteriores sin receipts y agrega un archivo local `archivedConflicts` opcional. No se borran históricos por migración.
3. Solo se permite separar `save_batch` cuando V7 rechaza de forma definitiva con `NORMAL_COUNT_ALREADY_IN_SHIFT` o `NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`, indica `manual_review`, una única causa no truncada y `p_payload.items[N]` válido, y todos los ítems se corresponden con los borradores originales, sin confirmaciones remotas ni otras operaciones de esa sesión.
4. La resolución **requiere confirmación humana**. Una única escritura de journal archiva el rechazo original con su payload **sin device_token** y la observación conflictiva, elimina únicamente la operación rechazada y ese borrador, y deja los otros borradores con mismos UUID, datos y timestamps. **No ejecuta V7 automáticamente**.
5. Los demás borradores solo se reenvían por acción humana posterior mediante `Registrar conteo`, previa revalidación V6 de elegibilidad. Se mantiene atomicidad de batch y no se atribuye confirmación a un rechazo.
6. Si falta índice, receipt, certeza de rechazo, acción `manual_review` o coincide un ítem confirmado, el journal conserva todo y prohíbe separación. Timeouts y errores retryable mantienen UUID/payload para replay exacto.
7. La UI distingue texto de duplicado frente a inconsistencia, incluye modal de resolución y acceso al diagnóstico exportable. El archivo local no es observación oficial remota y no desaparece al reabrir sesión.

## 3. Evidencia técnica

Ejecución: [CI SOLOG Cajero Full V3 #44013754845](https://github.com/Jack-Mnt/SOLOG/actions/runs/44013754845).

| Verificación | Resultado |
|---|---|
| Pruebas dirigidas Full + B5 | **69 pass / 0 fail**, 7 archivos |
| Lint | **PASS** |
| Typecheck / build | **PASS**, Vite construido |
| Git diff --check | **PASS** |
| Smoke Chromium simulado | **35 pass / 0 fail**, 0 solicitudes externas |
| Suite global | **875 pass / 1 fail**, 876 tests / 97 archivos — **NO APROBADA** |

El escenario Chromium B5 confirmó: 2 borradores agrupados, rechazo de todo el lote sin observaciones confirmadas, identificación de `items[1]`, apertura del panel de incidencias, archivo local con consentimiento, cero escrituras V7 automáticas, y reenvío explícito posterior del borrador válido preservando `client_observation_id` y `contado_at`.

**Fallo global independiente:** `tests/admin-control-v3.test.ts`, test «V10 dataset completo, payload mínimo y caché…», lanza `Payload control_groups incompatible con contrato Admin.` La prueba utiliza un rango fijo `2026-10-01` a `2026-10-05` y el validador tiene reglas de rango relativas a la fecha corriente. Es una causa plausible de la discrepancia respecto de las ejecuciones globales aprobadas el 2026-11-12. El error fue reproducido en múltiples ejecuciones de GitHub Actions posteriores; no se modificaron archivos de Admin durante esta fase. **Corregir o estabilizar la fixture de Admin mediante una tarea puntual independiente y validarla**, sin ampliar B5 silenciosamente.

## 4. Límites y siguiente paso

- **Fase 4:** validaciones de su alcance aprobadas. La prueba global mantiene un fallo ajeno y requiere resolución antes del cierre global de O1.
- **Fase 5:** auditoría global de contratos, journaling, prioridad y recovery; solución autorizada del test global de Admin como bloqueo de validación; simulación integral y smoke humano.
- No está validado todavía un `start` V3 real con snapshot reciente ni operaciones B5 de escritura remota bajo datos operativos; el smoke ejecutado usa V6/V7 simuladas.
- SOLOG permanece cerrado hasta completar frontend, backend E2E y smoke humano. No fusionar/promover cambios por el mero cierre dirigido.
