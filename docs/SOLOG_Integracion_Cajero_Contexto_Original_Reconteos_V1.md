# SOLOG — Integración Cajero — Contexto original de reconteos V1

**Estado:** APROBADO Y CONGELADO — decisión del usuario del 2026-11-20. Implementación y validaciones se registrarán por fases.
**Clasificación:** Nivel C — contrato aditivo de lectura backend y restauración de UI Full.
**Rama:** `admin-work`. `master` y O1 (ciclo horario) permanecen fuera de alcance y cerrados.
**Responsable único autorizado para este bloque:** **ChatGPT** (backend y frontend). No se utilizará Codex.

## 1. Fuente primaria y precedencia

**Fuente primaria única de este bloque:** `docs/SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_V1.md`. Su precedencia se limita a la recuperación del contexto original, al contrato de lectura y a su consumo en Revisar/Captura.

Fuentes que siguen vigentes en sus dominios, **sin reemplazarlas**:
- `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`: cinco motivos, explicación y herencia; regla ±12; `Resuelto`.
- `docs/SOLOG_Backend_Cajero_ReviewQueue_Observaciones_Delta_V1.md`: precedente de lectura V4, histórico para la ruta actual Full.
- `docs/SOLOG_UI_Cajero_Revisar_Transicion_Diferencias_Delta_V1.md`: tabla, transición, colores y accesibilidad congelados.
- `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`, `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`: ciclo temporal, journal, recovery, prioridad e idempotencia.
- `docs/SOLOG_Backend_Cajero_Contrato_Consumo_Horario_V1.md`: RPC V6/V7 desplegadas. Este documento es **delta aditivo solo para lectura V6**.
- `docs/SOLOG_Integracion_Cajero_Ciclo_Horario_O1_Cierre_Formal_V1.md`: O1 permanece cerrado.

Ante contradicción con O1, no alterar sus reglas. Ante contrato backend incompleto, bloquear el consumo dependiente del frontend y resolver primero en Supabase.

## 2. Diagnóstico confirmado en preflight

- `inventario.conteo_detalle` ya contiene `stock_teorico`, `stock_fisico`, `contado_at`, `motivo_diferencia`, `observacion_diferencia` y un `id` de caso.
- `inventario.solog_session_runtime_groups.detalle_reconteo_id` vincula el grupo al caso original.
- `inventario.full_runtime_json_v2` y `inventario.full_cashier_kpi_projection_v1` no entregan los metadatos originales. `full.app.tsx` muestra placeholders en Revisar y pasa `priorReason=null`, `priorText=null` al diálogo.
- La UI V4 histórica ya incorporaba diferencia inicial, filtro por signo, motivo original no editable y explicación inicial.
- El dispatcher Full V7 permite motivo original heredado sin nueva observación para un reconteo de diferencia menor que 12, pero exige pareja motivo+texto cuando el motivo **se incorpora por primera vez**; con `dr=0` escribe `Resuelto` de forma autoritativa.
- Datos con campos `NULL` son históricos válidos y no requieren backfill.

## 3. Contrato backend aditivo congelado

**Entrada pública invariable:** `public.rpc_solog_cashier_bootstrap_v6(p_payload jsonb)`, `code=CASHIER_STATE`, `contract_version=2`.

**Salida:** `data.groups[]` de sesión activa añade **siempre** la clave `recount_origin`:

```ts
interface FullRecountOrigin {
  difference: number           // físico ORIGINAL − teórico ORIGINAL; entero con signo
  counted_at: string           // timestamp ISO UTC del conteo original
  reason: CashierDifferenceReason | null
  note: string | null          // observacion_diferencia original, no observacion_reconteo
}
type FullCashierGroup = FullGroup & {
  coverage_pending_round: boolean
  recount_origin: FullRecountOrigin | null
}
```

- `action='recount'` con `recount_detail_id` autorizado y válido: objeto no nulo obtenido del caso vinculado (`conteo_detalle.id`).
- Todas las demás acciones: **`recount_origin=null`** (sin arrastrar datos históricos).
- Conservar valores nulos históricos de `reason` y `note`. No inventar motivos, fechas o notas.
- Calcular `difference` usando columnas `stock_fisico - stock_teorico` originales, **no** `conteo_detalle.diferencia`, que puede sufrir transiciones posteriores.
- Autoridad y privacidad: exposición limitada al grupo de runtime de la sesión autenticada/sede; verificar que el caso original pertenece a la misma sede. No conceder ACL nuevas al cliente ni acceso directo al esquema `inventario`.
- **No se modifican:** V7, Motor, prioridades, conteos, tablas, `full_runtime_json_v2`, `affected_groups`, sesiones de recovery y manifiestos, temporización, historiales generales ni RPC pública nueva.
- Implementar preferentemente en `inventario.full_cashier_kpi_projection_v1` mediante un `LEFT JOIN` por PK del detalle original, agregando la clave en su proyección `groups`. Preservar semántica KPI y `coverage_pending_round`.
- La ausencia imprevista del objeto en un grupo de reconteo habilitado debe tratarse como incompatibilidad de lectura, **no** inventar contenido ni permitir cambiar motivo.

## 4. UX y comportamiento Full congelados

1. En `Revisar`, sustituir «Verificar/Disponible» por **Diferencia inicial** y **Diferencia actual**. Esta última se calcula exclusivamente del borrador local `physical - stock_theoretical`, o `—` si no existe. No anticipar estados terminales.
2. Restaurar filtro de sobrantes (+) y faltantes (−) con ambos activos inicialmente, sin permitir que ambos queden desactivados. Mantener prioridades/acciones autoritativas; filtro solo visual.
3. Tarjeta de captura: mostrar **Diferencia inicial: d0**; los KPI de la tarjeta conservan stock teórico de **la sesión actual**.
4. Diálogo de observación: `priorReason=origin.reason`, `priorText=origin.note`. Mostrar el texto original como información histórica, sin copiarlo a `observacion_reconteo`. Si existe motivo heredado, fijarlo no editable y conservarlo. Si no existe, permitir registrar motivo nuevo con nota válida.
5. Regla de captura local:
   - Conteo normal: pareja `reason+note` o ambos nulos, con explicación obligatoria al ser `|d|>=12`.
   - Reconteo `dr=0`: guardar `reason=null, note=null` como payload de reconteo (V7 hereda motivo y establece `Resuelto`); UI informa resolución.
   - Reconteo `dr≠0`, **motivo previo existente** y `|dr|<12`: permitir `note=null`, sin fabricar nueva observación; motivo previo se conserva en backend. Si se redacta una nota voluntaria: texto válido de al menos 3 caracteres.
   - Reconteo `dr≠0`, **sin motivo previo**: `reason+note` nuevos deben venir juntos, o ambos nulos si `|dr|<12`.
   - Reconteo `|dr|>=12`: exige motivo efectivo (heredado o nuevo) y nota nueva ≥3 caracteres.
   - Prohibir cambio de motivo heredado y cualquier copia automática de `origin.note` como nota nueva.
6. Mantener D.1.4, acción Omitir, journal `solog.full2`, UUID/contado_at inmutables, prioridad y bloqueo de cierre con pendientes. No reabrir O1.

## 5. Fases y pruebas

- **R1 — Congelación (ChatGPT):** este documento y baseline real.
- **R2 — Backend (ChatGPT):** migración SQL mínima, despliegue Supabase, verificación de permisos, metadatos `null`/no nulos y consistencia de KPI. Registrar migración exacta en `supabase/migrations`. **Congelar y validar contrato antes de frontend**.
- **R3 — Frontend (ChatGPT):** actualizar contrato, parser, runtime, Revisar/captura y diálogo, manteniendo los consumidores V7 compatibles. Corregir únicamente el CSS imprescindible. No usar Codex.
- **R4 — Validación (ChatGPT):** pruebas dirigidas, Bun global, lint, build, `git diff --check`, Chromium y revisión de CI; si un test no se pudo ejecutar, marcar pendiente, no darlo por aprobado.
- **R5 — Smoke del usuario:** probar cuando el Motor habilite reconteo real; no forzar cambios de prioridad ni alterar datos operativos.

**Fuera de alcance:** cambios funcionales de Admin, Motor, sesiones horarias, cron, permisos, Conexión, migración de journal, limpieza CSS, global refactor, despliegue de `master` o fusión automática.
