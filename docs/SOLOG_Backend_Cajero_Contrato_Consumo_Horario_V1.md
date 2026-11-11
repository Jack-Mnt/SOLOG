# SOLOG — Backend Cajero — Contrato de consumo horario Full V1

**Estado:** CONTRATO DE CONSUMO V6/V7 CONGELADO — DEPLOYED / VERIFIED SHAPE. **Pruebas E2E con snapshot fresco y Motor no concluidas.**
**Fecha:** 2026-11-11. **Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`.
**Fuente funcional primaria:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
**Delta vigente de activación:** `docs/SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md` (anula exclusivamente la transición `dual`).
**Uso:** contrato desplegado que consumirá Codex en `admin-work`. Codex no modifica Supabase, RPC, permisos, schemas ni funciones. Si detecta un defecto backend, debe detenerse e informarlo.

## 1. Autoridad y activación

- **Servidor:** PostgreSQL/Supabase, zona temporal `America/Lima`; controla permisos, reloj, selección, intervalo, expiración, prioridad y persistencia.
- **Modo activo:** `inventario.full_cashier_hourly_config_v3.mode='required'`, comprobado; los nuevos `start` Full V2 son rechazados.
- **No se utilizó `dual`.** La migración 03 fue omitida y reemplazada; 04 directa está registrada.
- **`full_settings.policy_version=2`** continúa vigente para el backend Full global; **`full_session_windows.policy_version=3`** identifica la política temporal *solo de sesiones nuevas* de Cajero.
- **`contract_version=2`** del envelope público sigue intacto; no confundir con `policy_version=3`.
- **RPC públicas preexistentes:** `public.rpc_solog_cashier_bootstrap_v6(p_payload jsonb)` y `public.rpc_solog_cashier_mutate_v7(p_action text,p_payload jsonb)`. Ninguna API paralela.

## 2. V6 — lectura de estado

El envelope de `CASHIER_STATE` mantiene `ok`, `code`, `contract_version`, `request_id`, `server_now`, `retryable`, `action_required`, `errors` y `data`. `data` añade obligatoriamente en modo `required`:

```ts
type CashierStartOfferV3 = {
  policy_version: 3;
  cycle_started_at: string; // UTC ISO, umbral HH:59 previo al ciclo
  status: 'new' | 'fallback' | 'unavailable';
  snapshot_id: string | null; // UUID solo si puede iniciar
  requires_confirmation: boolean;
  can_start: boolean;
  capture_ends_at: string | null; // UTC ISO, proyección
  block_reason: string | null;
};
```

Invariantes:
- `status='new'` con `can_start=true`: iniciar sin modal, con la referencia ofrecida.
- `status='fallback'` con `can_start=true`: modal con «Esperar 30 segundos» o aceptación explícita de «Utilizar inventario válido».
- `status='unavailable'`: `can_start=false`, `snapshot_id=null`, indicar causa. `capture_ends_at` es una proyección, nunca permiso del frontend.
- En modo `required`, `data.capabilities.can_start_session` refleja la elegibilidad V3 y `block_reason` refleja la causa autoritativa.
- `data.stock.is_fallback` **no** reemplaza `start_offer.status`: sigue significando la edad legacy del snapshot.
- La única actualización V6 tras optar por esperar ocurre al finalizar **cada** periodo voluntario de 30 segundos; se retira el polling de 8 segundos de la guardia antigua.

## 3. V7 — inicio versionado

```ts
type CashierStartRequestV3 = {
  operation_id: string; // UUID inmutable desde preparación hasta replay
  device_token: string; // el existente del dispositivo autorizado
  expected_snapshot_id: string; // UUID de V6
  expected_cycle_started_at: string; // UTC ISO de V6
  selected_as: 'new' | 'fallback'; // elección aprobada
};
```

- V7 valida bajo transacción y bloqueo de sede: identidad, dispositivo, sesión activa/recovery, hora HH:57, 180 segundos mínimos, stock confirmado/compatible, revisión/catalogación, selección exacta de snapshot, generación y modalidad.
- No cambia silenciosamente de snapshot. Si cambia la oferta o el ciclo, devuelve conflicto recuperable; frontend consulta V6 y pide nueva elección.
- Solo éxito `SESSION_STARTED` crea sesión/ventana V3 con referencia y grupos congelados.
- `start` nuevo sin campos V3, aunque tenga payload V2 válido, devuelve `START_POLICY_UPGRADE_REQUIRED`. **El navegador fusionado hasta este momento envía V2 y no debe reabrirse.**
- Replays `operation_id` ya confirmados siguen respondiéndose antes de validar reglas de horario nuevas. Resultado incierto: reintentar **exactamente** UUID/payload original.
- Outbox V2 preexistente sin V3 que aún no fue aplicado se trata como rechazo conocido solo cuando la respuesta autoritativa demuestre no aplicación; no inventar UUID de reemplazo automático.

## 4. V7 — otras acciones conservadas

`save_batch`, `recount_save_batch`, `finish` mantienen sus contratos previamente desplegados, máximo 500 ítems por batch y el journal persistente `solog.full2`. Capturas válidas en `[iniciado_at,session_expires_at)` pueden entregarse antes de `pending_delivery_until=session_expires_at+2h`. Prioridad y elegibilidad son autoritativas, no inferidas por el cliente.

Las reservas de reconteo Full se conservan durante recovery y se liberan al confirmar detalle o al finalizar/expirar definitivamente. Un conteo normal duplicado no sustituye al primer confirmado por turno; rechazo definitivo se mantiene como evidencia local.

**Errores incorporados o diferenciados:** `START_WINDOW_CLOSED`, `START_CAPTURE_TOO_SHORT`, `SNAPSHOT_SELECTION_CHANGED`, `START_POLICY_NOT_ENABLED`, `START_POLICY_UPGRADE_REQUIRED`, `SESSION_RECOVERY_PENDING`, `NORMAL_COUNT_ALREADY_IN_SHIFT` y `NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT`. Las causas funcionales no se reintentan como si fueran errores de red.

Para batches rechazados, `errors[].field_path` puede identificar `p_payload.items[N]` de forma determinista; puede faltar si no se conoce el ítem. No reconstruir un lote cuyo resultado sea incierto ni considerar registrado ningún elemento de un batch definitivamente rechazado. Confirmación y segmentación segura solo tras acreditar que la operación original no se aplicó.

## 5. Fronteras operativas y validación

- Inicio aceptable solo antes de HH:57, con al menos 180 segundos efectivos. `session_expires_at=min(HH:00 siguiente, capturado_at+2h,fin de turno)`.
- No abrir nueva sesión automáticamente. Sin cron nuevo. Las ventanas de sesiones V2 históricas no se migran.
- El backend V3 está **desplegado y en `required`**. Se verificaron JSON Schema, cálculos temporales, ofertas sintéticas en `required`, V6 `CASHIER_STATE`, V7 rechazo de start V2 y rechazo V3 por stock vencido en contexto autenticado reversible.
- **No validados aún:** un inicio V3 exitoso real (todos los snapshots actuales están vencidos), carreras ConeXion/V7, entrega de batch real, reconteos, manifiesto `finish` y recovery. Este documento congela el *wire contract*, no certifica la ejecución E2E del Motor.
- Reapertura requiere nuevo snapshot confirmado compatible, frontend V3 implementado y validado, pruebas E2E y smoke humano aprobados.

**Referencia de evidencia:** `docs/SOLOG_Backend_Cajero_Reporte_Validacion_Required_V1.md`. En cualquier incompatibilidad concreta se suspende el trabajo dependiente y se solicita corrección backend mediante ChatGPT; no reinterpretar decisiones funcionales congeladas.
