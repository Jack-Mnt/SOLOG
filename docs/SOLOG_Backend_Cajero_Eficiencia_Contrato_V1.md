# SOLOG — Backend Cajero Eficiencia — Contrato V1

**Estado:** CONGELADO, DESPLEGADO Y VALIDADO — BACKEND LISTO PARA INTEGRACIÓN FRONTEND  
**Fecha:** 12 de septiembre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — backend / contrato Cajero / eficiencia y consistencia  
**API vigente disponible:** Cajero V3 `contract_version = 3` en paralelo a V2  
**Migración desplegada:** `20260912130028_solog_cashier_efficiency_contract_v3`  
**Fuente primaria:** este documento

---

## 1. Propósito y alcance

Cajero V3 reduce egress, serialización PostgreSQL, reconstrucciones completas de estado y tamaño de recibos idempotentes sin modificar Motor V3 ni las reglas funcionales del Cajero.

Patrón anterior:

```text
bootstrap completo
→ mutación
→ state completo
→ refresh/bootstrap completo
```

Patrón V3:

```text
bootstrap compacto sin sesión
→ start con panel congelado completo
→ navegación local
→ save/recount con deltas autoritativos
→ finish mínimo
→ bootstrap compacto
```

Supabase continúa siendo autoridad de autenticación, sede, dispositivo, sesión, timestamps, revisiones, colas, KPI y resultados del Motor.

V3 se despliega en paralelo a V2. El frontend actual continúa usando V2 hasta la migración frontend aprobada. `rpc_solog_cashier_history_v2` permanece vigente.

---

## 2. Precedencia

Para la futura integración frontend de Cajero:

1. **Este documento** — fuente primaria V3.
2. `SOLOG_Backend_Contratos_Runtime_Actual_V1.md` — runtime general no sustituido aquí.
3. `SOLOG_Backend_Contratos_Optimizacion_Global_V8.md` — semántica de recovery heredada.
4. `SOLOG_Correccion_Cajero_Smoke_E2E_V1.md` — comportamiento funcional/UI no sustituido.
5. Documentación anterior — histórica cuando contradiga V3.

V3 no modifica Motor V3.

---

## 3. Invariantes preservados

Se mantienen:

- usuario derivado de `auth.uid()`;
- rol Cajero y usuario activo validados en backend;
- sede derivada del usuario;
- autorización mediante `device_token`;
- una sesión activa por sede;
- `snapshot_referencia_id` congelado;
- `version_catalogo` congelada;
- `groups_revision` congelada;
- grupos/SKU/precios/stock teórico congelados por sesión;
- máximo 500 items por batch;
- `operation_id` idempotente;
- mismo UUID + mismo payload → replay;
- mismo UUID + payload distinto → `SOLOG_IDEMPOTENCY_CONFLICT`;
- Conteo y Revisar continúan siendo atómicos;
- recovery V8;
- drafts exclusivamente en memoria frontend;
- Historial Hoy/Ayer mediante V2;
- ausencia de polling.

---

## 4. Snapshot y ventana temporal

El runtime vigente conserva:

```text
snapshot_expira_at = capturado_at + 2 h
sesion_expira_at   = capturado_at + 1 h 59 min
```

El bloqueo de ConeXion impide confirmar un nuevo snapshot de la sede antes de dos horas desde el anterior.

Por tanto, durante la ventana de captura no aparece un snapshot posterior que deba reinterpretar la sesión.

Durante recovery sí puede existir un snapshot posterior. Puede ser usado por backend para resolver diferencias, pero:

- no sustituye `snapshot_referencia_id`;
- no habilita nuevas capturas;
- no obliga a recargar el panel completo.

---

## 5. Cobertura de sesión — invariante validado

Durante la implementación se confirmó que el runtime ya contiene:

```text
trigger: solog_session_group_sync_coverage_v4
BEFORE UPDATE ON inventario.solog_session_groups
```

Regla:

```text
old.requiere_conteo = true
AND new.requiere_conteo = false
→ new.cobertura_periodo = true
```

El supuesto error de cobertura identificado durante exploración no existía en el runtime vigente.

V3 **preserva** este trigger y no introduce una segunda lógica de cobertura.

Los KPI V3 se calculan después de persistir los cambios usando la copia congelada de la sesión.

---

# 6. Superficie pública V3

## 6.1 Bootstrap

```sql
public.rpc_solog_cashier_bootstrap_v3(
  p_payload jsonb default '{}'
)
```

Payload opcional:

```json
{
  "device_token": "..."
}
```

## 6.2 Mutaciones

```sql
public.rpc_solog_cashier_mutate_v3(
  p_action text,
  p_payload jsonb default '{}'
)
```

Acciones:

```text
start
save_batch
recount_save_batch
finish
```

## 6.3 Historial

No cambia:

```sql
public.rpc_solog_cashier_history_v2(p_payload jsonb)
```

---

# 7. Bootstrap V3

## 7.1 Respuesta común

Devuelve:

```text
contract_version = 3
generated_at
server_now
revisions
identity
site
device
stock
start_capability
session_capability
pre_session_summary
panel_state
```

No existe `session_state`.

## 7.2 Sin sesión + dispositivo autorizado

`panel_state = null`.

`pre_session_summary` contiene únicamente agregados:

```json
{
  "groups_total": 484,
  "coverage_counted": 120,
  "coverage_percent": 24.8,
  "count_pending": 364,
  "review_pending": 8,
  "stock_types": {
    "positive": { "total": 400, "covered": 100 },
    "zero": { "total": 70, "covered": 18 },
    "negative": { "total": 14, "covered": 2 }
  }
}
```

No envía grupos, SKU, productos ni precios completos.

## 7.3 Dispositivo no autorizado

Devuelve identidad/sede/dispositivo/capacidades, pero:

```text
panel_state = null
pre_session_summary = null
start_capability.allowed = false
start_capability.reason = SOLOG_DEVICE_UNAUTHORIZED
```

No entrega dataset operacional.

## 7.4 Sesión activa o recovery existente

Para reconstrucción después de reload/entrada:

- devuelve una sola copia completa en `panel_state`;
- `pre_session_summary = null`;
- no existe `session_state`;
- el panel usa el snapshot congelado de la sesión.

Este es un punto explícito de resincronización válido.

---

# 8. Start V3

`start` crea la sesión y congela la topología como antes.

Respuesta:

```text
contract_version
generated_at
action = start
replay
revisions
session_capability
stock
panel_state
```

`panel_state` es la descarga completa que el frontend utilizará durante la sesión.

Después de start exitoso o replay, **no debe ejecutarse un bootstrap adicional** solo para obtener el mismo dataset.

---

# 9. save_batch V3

Payload conserva:

```text
operation_id
device_token
conteo_id
expected_groups_revision
items[]
```

Cada item conserva:

```text
client_observation_id
grupo_id
stock_fisico
contado_at
```

Respuesta:

```json
{
  "contract_version": 3,
  "action": "save_batch",
  "replay": false,
  "conteo_id": "...",
  "saved": 2,
  "items": [],
  "panel_delta": {
    "groups_patch": [],
    "count_queue_remove": [],
    "review_queue_remove": [],
    "kpis": {}
  },
  "session_capability": {},
  "revisions": {}
}
```

No devuelve `state` ni `panel_state`.

## 9.1 groups_patch

Solo incluye campos mutables necesarios de los grupos afectados:

```text
grupo_id
cobertura_periodo
requiere_conteo
requiere_reconteo
detalle_reconteo_id
contado_detalle_id
contado_at
recontado_at
```

El frontend conserva sin cambios los datos congelados no presentes en el patch.

## 9.2 KPI

Los KPI de `panel_delta.kpis` son autoritativos y se **reemplazan** en frontend; no se incrementan manualmente.

---

# 10. recount_save_batch V3

Mantiene V7/V8 y Motor V3.

Respuesta incluye:

```text
items[]
panel_delta.groups_patch
panel_delta.review_queue_remove
panel_delta.kpis
session_capability
revisions
```

Cada item autoritativo incluye:

```text
detalle_id
grupo_id
snapshot_reconteo_id
stock_teorico_reconteo
stock_reconteo
diferencia_reconteo
diferencia
estado_diferencia
valor_diferencia
recontado_at
```

No devuelve estado completo.

La resolución continúa exclusivamente en backend:

```text
dr = 0 → Coincide
mismo signo → Confirmada
signo incompatible → Inconsistente
```

---

# 11. finish V3

Respuesta mínima:

```json
{
  "contract_version": 3,
  "action": "finish",
  "replay": false,
  "conteo_id": "...",
  "status": "finalizado",
  "finalizado_at": "...",
  "session_capability": {
    "mode": "none",
    "capture_allowed": false,
    "pending_delivery_allowed": false,
    "recovery_until": null
  },
  "revisions": {}
}
```

No devuelve panel ni delta.

Después de finish, el frontend podrá ejecutar **un bootstrap V3 compacto** para volver al estado pre-sesión.

---

# 12. Recovery V8 heredado

Antes de `expira_at`:

```text
mode = active
capture_allowed = true
pending_delivery_allowed = true
```

Entre `expira_at` y `recovery_until`:

```text
mode = recovery
capture_allowed = false
pending_delivery_allowed = true
```

Desde `recovery_until`:

```text
mode = none/expired efectivo
capture_allowed = false
pending_delivery_allowed = false
```

Los items enviados durante recovery siguen obligados a tener `contado_at` dentro de la ventana original de captura.

---

# 13. Idempotencia

Scopes V3:

```text
cashier_v3:start
cashier_v3:save_batch
cashier_v3:recount_save_batch
cashier_v3:finish
```

El hash idempotente excluye `device_token` de la persistencia de request, manteniendo la validación del dispositivo en cada llamada.

Los recibos almacenan respuestas compactas para save/recount/finish.

Replay devuelve la misma respuesta con:

```json
{ "replay": true }
```

Los deltas son aplicables de forma idempotente.

---

# 14. Seguridad

RPC públicas:

- `SECURITY DEFINER`;
- `search_path=''`;
- `EXECUTE` concedido a `authenticated`;
- `EXECUTE` revocado a `anon` y `PUBLIC`.

Helpers `inventario.*_v3`:

- privados;
- sin `EXECUTE` para `anon` ni `authenticated`.

Cada RPC pública valida internamente:

- `auth.uid()`;
- usuario activo;
- rol `cajero`;
- sede del usuario;
- dispositivo autorizado;
- pertenencia de sesión a usuario y sede;
- revisión de grupos;
- límites temporales.

La constraint `public.usuarios.usuarios_check` impide persistir un usuario Cajero sin sede.

---

# 15. Validación backend ejecutada

Migración:

```text
20260912130028_solog_cashier_efficiency_contract_v3
```

Casos confirmados:

- bootstrap no autenticado rechazado;
- rol no Cajero rechazado;
- usuario deshabilitado rechazado;
- token inválido rechazado;
- dispositivo revocado rechazado;
- dispositivo de otra sede rechazado;
- sesión de otro usuario rechazada;
- sesión de otra sede rechazada;
- dispositivo no autorizado no recibe panel/resumen operacional;
- bootstrap autorizado sin sesión es compacto;
- start devuelve un panel completo único;
- bootstrap de sesión activa/recovery devuelve una sola copia del panel;
- save de múltiples items aplica delta y KPI correctos;
- cobertura `false → true` confirmada mediante trigger V4;
- grupo ya cubierto no duplica cobertura;
- batch inválido revierte todos los efectos;
- recount resuelve Motor V3 correctamente;
- finish devuelve respuesta mínima;
- replay validado para start/save/recount/finish;
- payload distinto con mismo UUID produce `SOLOG_IDEMPOTENCY_CONFLICT`;
- recovery permite entrega pero no captura;
- después de recovery se rechaza entrega;
- snapshot posterior durante recovery puede resolver diferencia sin sustituir snapshot de referencia;
- V2 continúa operativo;
- Historial V2 continúa operativo;
- fixtures sintéticos ejecutados con rollback;
- cero dispositivos/snapshots/sesiones/operaciones V3 sintéticas persistidas.

---

# 16. Evidencia de tamaño

Con el master actual de 484 grupos, tamaños representativos de JSON bruto:

| Caso | V2 | V3 | Reducción |
| --- | ---: | ---: | ---: |
| save 1 item | 406,120 B | 1,269 B | 99.69 % |
| save 10 items | 408,947 B | 7,139 B | 98.25 % |
| save 100 items | 437,208 B | 65,822 B | 84.94 % |
| recount 1 item | — | 1,343 B | — |
| recount 10 items | — | 7,797 B | — |
| recount 100 items | — | 72,327 B | — |

En el flujo sintético de cuatro grupos:

```text
start                 4,535 B
bootstrap activo      5,004 B
save 2 items          1,917 B
recount 1 item        1,344 B
finish                   427 B
bootstrap post-finish 1,256 B
```

Son comparaciones de JSON sin compresión; no equivalen directamente al egress facturado.

---

# 17. Advisors post-migración

No se introdujo exposición V3 a `anon`.

Los advisors marcan las dos RPC V3 con `authenticated_security_definer_function_executable`, lo cual es **intencional**: son endpoints RPC para usuarios autenticados y contienen autorización interna por usuario/rol/sede/dispositivo.

Los errores/warnings restantes corresponden a hallazgos preexistentes fuera de este bloque.

---

# 18. Fuera de alcance

No se modifica:

- Motor V3;
- fórmula de valorización;
- historial V2;
- persistencia de drafts;
- Admin;
- Detalles;
- Index;
- intervalo mínimo entre snapshots;
- política de retención de `solog_operaciones`;
- S10;
- UI/UX.

---

# 19. Gate de backend

**CERRADO.**

Backend Cajero V3 está:

```text
DEFINIDO
→ DESPLEGADO
→ VALIDADO
→ SIN DATOS SINTÉTICOS RESIDUALES
→ LISTO PARA FRONTEND
```

El frontend **todavía no debe considerarse migrado**. La siguiente fase debe usar este documento como fuente primaria para baseline y plan de Codex. Codex no debe modificar Supabase.
