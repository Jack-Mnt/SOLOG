# SOLOG — Integración frontend — Cajero V5 y observaciones — Fase 3 V1

**Estado:** IMPLEMENTADA EN `admin-work`; pruebas ejecutables y smoke humano PENDIENTES DE VALIDACIÓN.
**Fecha:** 2026-10-15 (America/Lima).
**Nivel:** C — escritura operativa e idempotencia.
**Fuente primaria:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.
**Delta de prevalencia para eliminar legacy:** `docs/SOLOG_Integracion_Observaciones_Diferencias_Frontend_SinLegacy_Delta_V1.md`.
**Contrato backend congelado y desplegado:** `docs/SOLOG_Backend_Observaciones_Diferencias_Implementacion_V1.md`, complementado por `docs/SOLOG_Backend_Cajero_ReviewQueue_Observaciones_Delta_V1.md`.

## 1. Trabajo frontend implementado

- `src/features/solog/cajero/cajero.v4.ts` y `cajero.v4.api.ts`: `review_queue[]` contiene y valida `motivo_diferencia` y `observacion_diferencia`, ambos nullable. La lectura/bootstrap conserva contrato V4, conforme al backend desplegado. Sin cambiar reglas del Motor.
- `cajero.v4.runtime.ts`: inicio de sesión mediante `mutateCashierV5('start')`; la captura entrega motivo y texto al coordinador, con `null` explícitos cuando no corresponde.
- `cajero.v4.storage.ts`: **un único envelope durable por sesión** de drafts, operación preparada y recibo. Versión local `2`, namespaces `solog.cashier-v5.session.v1:` y `solog.cashier-v5.start.v1:`; preparada identificada `protocol_version=5`. Sin migración ni replay dual de sesiones V4, por delta aprobado. Validación de notas y recibos V5.
- `cajero.v4.flush.ts`: captura y serialización de las observaciones en la misma operación `save_batch` o `recount_save_batch`; validación local con teórico del panel, confirmación de motivos/textos persistidos, `Resuelto` en coincidencia física, inicio/cierre V5 y UUID/payload/timestamps inmutables durante retries. `finish` guarda la versión del protocolo.
- `cajero.observacion.dialog.tsx`: nuevo diálogo accesible, cinco motivos excluyentes, validación de texto, conservación de motivo original no editable en reconteo, observación original contextual, `Resuelto` en reconteo coincidente, `Limpiar` para captura voluntaria y `Omitir producto` solo cuando la explicación es requerida por la operación.
- `cajero.v4.ui.tsx`: botón `MessageSquarePlus` habilitado, observación local por grupo, propuesta manual y apertura automática en diferencias >=12 o parejas incompletas, guardia centralizada entre `Continuar` y `Guardar` de D.1.4, omisión sin mutar drafts anteriores, reversión únicamente de edición actual.
- `cajero.capture.guard.ts`: cambios de motivo o texto con igual cantidad también requieren confirmación de salida.
- `cajero.history.ts` y `cajero.historial.tsx`: consumo de los tres campos nullable de `rpc_solog_cashier_history_v2`, validador y presentación expandida con procedencia inicial o de reconteo, sin nuevas columnas.
- `cajero.css`: estilos acotados al diálogo y texto histórico, con tokens existentes, foco, saltos de línea y adaptación responsive.

La función de cierre huérfano `rpc_solog_cashier_orphan_finish_v1` sigue existiendo como operación especializada de recuperación, ajena a V4 de escritura. El resto de las escrituras funcionales activas se dirige a `rpc_solog_cashier_mutate_v5`.

## 2. Pruebas y fixtures modificados

- `tests/fixtures/cashier-v4.mjs`: contexto nuevo en `review_queue`, fixture específico de respuesta V5.
- `tests/fixtures/cashier-v4-drafts.ts`: simulación de `save_batch`, `recount_save_batch` y `finish` con respuestas V5 y sus observaciones.
- `tests/cajero-integracion-v5.test.ts`: casos dirigidos de umbral 12, texto original bloqueado, reconteo con motivo nuevo, `Resuelto`, guardia D.1.4, diálogo, retry con payload intacto y rechazo backend.
- Tests operativos de Cajero (runtime, start, flush, contrato, orphan recovery) ajustados a la ruta de escritura V5 y nuevo contrato de lectura; `tests/cajero-v4.browser.mjs` sigue utilizando bootstrap V4 y simula escritura V5.

## 3. Límites y validación

**Verificado por inspección y diff en GitHub:**

- Archivos afectados registrados en `admin-work`.
- No aparecen marcadores de conflicto ni espacios al final de las líneas añadidas en el diff obtenido.
- Los caminos operativos `start`, `save_batch`, `recount_save_batch`, `finish` se prepararon para usar V5 en código. No se implementó una capa dual de envío V4/V5.
- `master`, Admin Control, Supabase y documentación congelada previa no fueron modificados por esta intervención frontend.

**NO verificado ni autorizado a declarar verde:**

- `bun test`, lint, build, typecheck, `git diff --check` real, navegador Playwright y smoke humano.
- Test autenticado de escritura/reconteo con snapshot real en Supabase V5 (continuaba sin fixture activa en la validación backend anterior).
- Casos visuales tablet/escritorio; cualquier ajuste compositivo posterior seguirá el smoke solicitado.

**Comandos locales recomendados:**

```powershell
git switch admin-work
git pull
bun test tests/cajero-integracion-v5.test.ts tests/cajero-observaciones-v5.test.ts tests/cajero-capture-guard-v4.test.ts tests/cajero-api-v4.test.ts tests/cajero-contract-v4.test.ts tests/cajero-drafts-storage-v4.test.ts tests/cajero-flush-drafts-v4.test.ts tests/cajero-runtime-v4.test.ts tests/cajero-post-cutover-v4.test.ts tests/cajero-orphan-recovery-v4.test.ts
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

**Smoke humano esencial:** habilitar diálogo con motivo/texto voluntario y con +12/−12; guardar, descartar u omitir desde D.1.4; verificar que un draft anterior subsiste tras omitir edición; realizar reconteo con motivo previo y reconteo sin motivo; comprobar `Resuelto`, envío, reintento y lectura en historial.

## 4. Estado y continuidad

**Fase 3:** implementada, pendiente de validaciones y smoke, no cerrada todavía.
**Fase 4 Admin Control:** no iniciada. El diseño del popup permanece por aprobar al comenzar Fase 4.
**Corte de RPC V4 y habilitación de producción:** fuera de esta fase, pendiente de aprobación separada y de merge a `master`.

Conservar todas las decisiones congeladas no reemplazadas por el delta sin legacy.
