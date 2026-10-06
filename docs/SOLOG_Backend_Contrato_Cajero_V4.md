# SOLOG — Backend — Contrato Cajero V4

**Estado:** CONGELADO — DESPLEGADO Y VALIDADO  
**Fecha de congelación:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — backend / Motor / contrato API Cajero  
**Rama de referencia:** `admin-work`  
**HEAD documental al iniciar Fase 11:** `7a931c425b6ddc94058b066286f24a77c0ee7422`  
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`

---

## 1. Autoridad y precedencia

Este archivo es la **fuente primaria del contrato backend desplegado que debe consumir el frontend Cajero**.

Jerarquía:

1. `docs/SOLOG_Backend_Contrato_Cajero_V4.md` — autoridad para RPC públicas, payloads, respuestas, estados, errores e invariantes técnicas desplegadas.
2. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md` — autoridad funcional/arquitectónica del Motor.
3. `docs/SOLOG_Backend_Doble_Cobertura_Impacto_Admin_V2.md` — handoff vigente para futura adaptación de Admin.
4. reportes de Fases 0–10 — evidencia de implementación/validación; no redefinen el contrato.
5. `docs/SOLOG_Logica_Cajero_Turnos_Reconteos_V1.md` — histórico/reemplazado.

Si existe una discrepancia sobre **qué recibe o devuelve actualmente el backend**, prevalece este archivo porque documenta el estado realmente desplegado al cierre de la Fase 10.

El frontend no debe inferir campos desde contratos Cajero V2/V3 eliminados.

---

## 2. Superficie pública vigente para Cajero

### 2.1. Routing

```text
public.rpc_solog_route_v2(p_payload jsonb) → jsonb
```

Contrato propio: `contract_version = 2`.

Se mantiene sin cambios como RPC de routing autenticado.

### 2.2. Bootstrap Cajero

```text
public.rpc_solog_cashier_bootstrap_v4(p_payload jsonb) → jsonb
```

Contrato: `contract_version = 4`.

### 2.3. Mutaciones Cajero

```text
public.rpc_solog_cashier_mutate_v4(
  p_action text,
  p_payload jsonb
) → jsonb
```

Acciones válidas:

```text
start
save_batch
recount_save_batch
finish
```

Contrato: `contract_version = 4`.

### 2.4. Historial Cajero

```text
public.rpc_solog_cashier_history_v2(p_payload jsonb) → jsonb
```

Contrato propio: `contract_version = 2`.

Se mantiene vigente y separado del contrato operacional V4.

---

## 3. Seguridad de la superficie pública

Las cuatro RPC anteriores son `SECURITY DEFINER`.

ACL desplegada:

| RPC | anon | PUBLIC | authenticated |
|---|---:|---:|---:|
| `rpc_solog_route_v2` | no | no | sí |
| `rpc_solog_cashier_bootstrap_v4` | no | no | sí |
| `rpc_solog_cashier_mutate_v4` | no | no | sí |
| `rpc_solog_cashier_history_v2` | no | no | sí |

Para Cajero V4 el backend valida además:

- `auth.uid()`;
- usuario existente y `activo=true`;
- rol `cajero`;
- sede asignada y activa;
- dispositivo autorizado para la misma sede;
- ownership de sesión para mutaciones.

El frontend no accede directamente a las tablas del schema `inventario`.

---

## 4. Tiempo autoritativo

Zona horaria operacional:

```text
America/Lima
```

El frontend puede mostrar tiempo local, pero **no debe recalcular autoridad operacional sustituyendo al backend**.

### 4.1. Quincenas

```text
1–15
16–fin de mes
```

### 4.2. Rondas

```text
duration = periodo_hasta - periodo_desde + 1
inicio_ronda_2 = periodo_desde + floor(duration / 2)
```

Ejemplos:

| Período | Ronda 1 | Ronda 2 |
|---|---|---|
| 1–15 | 1–7 | 8–15 |
| 16–30 | 16–22 | 23–30 |
| 16–31 | 16–23 | 24–31 |
| 16–28 | 16–21 | 22–28 |
| 16–29 | 16–22 | 23–29 |

Las ventanas timestamp son semiabiertas:

```text
[desde, hasta)
```

### 4.3. Turnos

| Valor backend | Ventana Lima |
|---|---|
| `early` | 00:00–07:30 |
| `day` | 07:30–15:30 |
| `night` | 15:30–24:00 |

### 4.4. Vigencia de snapshot

```text
snapshot_expira_at = capturado_at + 2 horas
```

No se permite iniciar sesión durante los últimos 5 minutos de vigencia del snapshot.

### 4.5. Vigencia de sesión

```text
expira_at =
min(
  snapshot.capturado_at + 1 h 59 min,
  siguiente medianoche America/Lima
)
```

### 4.6. Recovery

```text
recovery_until = expira_at + 2 horas
```

Una sesión en recovery:

- no captura nuevas observaciones;
- puede entregar pendientes capturados válidamente antes de `expira_at`;
- puede coexistir con una nueva sesión `activo` de la misma sede.

---

## 5. Estados persistentes

### 5.1. Sesión

```text
activo
recovery
finalizado
expirado
```

### 5.2. Acción runtime por grupo

```text
recount
coverage
daily
none
```

### 5.3. Estado operacional de stock

```text
Contado
Cambio_reciente
```

### 5.4. Estado de diferencia

El schema acepta:

```text
Coincide
Recontar
Confirmada
Inconsistente
Inválido
```

`Inválido` es un estado persistente interno/histórico usado cuando un cambio estructural invalida un caso previo.

Al congelar este contrato no existen filas reales `Inválido`, pero el parser frontend de historial no debe fallar si aparece.

Estados producidos por el flujo normal Cajero:

```text
d = 0        → Coincide
d != 0       → Recontar
reconteo     → Coincide | Confirmada | Inconsistente
```

---

## 6. Autoridades temporales por grupo

`inventario.estado_stock_grupo` mantiene separadas:

```text
ultimo_conteo_at
ultima_observacion_fisica_at
```

### `ultimo_conteo_at`

Autoridad para:

```text
máximo 1 conteo normal / grupo / turno
```

Un reconteo **no** la modifica.

### `ultima_observacion_fisica_at`

Autoridad para cobertura de ronda.

Puede avanzar por:

- conteo normal;
- reconteo.

Por ello un reconteo puede acreditar la ronda activa sin consumir el cupo de conteo normal del turno.

---

## 7. Selección de acción por grupo

El Motor calcula:

```text
coverage_complete =
  ultima_observacion_fisica_at ∈ ronda activa

counted_in_shift =
  ultimo_conteo_at ∈ turno activo
```

Y asigna:

```text
recount accionable
→ recount

Recontar esperando snapshot posterior
→ none

sin cobertura y sin conteo normal en turno
→ coverage

cobertura completa
+ Cambio_reciente
+ sin conteo normal en turno
→ daily

resto
→ none
```

Prioridad global:

```text
review
→ coverage
→ daily
```

Si existe cobertura pendiente bloqueada exclusivamente por un `Recontar` todavía sin snapshot posterior utilizable, `next_action` puede ser `none`.

El backend impide saltar esta prioridad mediante un guard de datos.

---

## 8. Bootstrap V4

### Request

```json
{
  "device_token": "string"
}
```

Para operar, el token es requerido y debe tener longitud entre 32 y 512 caracteres.

### Response

```json
{
  "contract_version": 4,
  "generated_at": "timestamptz",
  "server_now": "timestamptz",
  "revisions": {
    "groups": 0,
    "devices": 0,
    "operational": 0
  },
  "identity": {
    "id": "uuid",
    "nombre": "string",
    "rol": "cajero"
  },
  "site": {
    "id": "uuid",
    "nombre": "string"
  },
  "device": {
    "id": "uuid|null",
    "estado": "string",
    "sede_correcta": true,
    "autorizado": true,
    "sede_tiene_dispositivo_autorizado": true
  },
  "stock": {
    "snapshot_id": "uuid|null",
    "capturado_at": "timestamptz|null",
    "confirmado_at": "timestamptz|null",
    "snapshot_expira_at": "timestamptz|null",
    "version_catalogo": "integer|null"
  },
  "start_capability": {
    "allowed": true,
    "reason": "string|null"
  },
  "session_capability": {},
  "recovery_sessions": [],
  "pre_session_summary": {},
  "panel_state": {}
}
```

`pre_session_summary` es `null` si no corresponde exponerlo.

`panel_state` es `null` cuando no existe una sesión activa propia autorizada.

Si existe una sesión activa propia, `stock` corresponde al snapshot congelado por esa sesión.

### `recovery_sessions[]`

Cada elemento:

```json
{
  "id": "uuid",
  "iniciado_at": "timestamptz",
  "expira_at": "timestamptz",
  "recovery_until": "timestamptz",
  "snapshot_referencia_id": "uuid",
  "ronda": 1,
  "turno": "early|day|night",
  "session_capability": {}
}
```

---

## 9. Summary y KPI

`pre_session_summary` expone:

```json
{
  "basis": {
    "periodo_desde": "date",
    "periodo_hasta": "date",
    "ronda": 1,
    "ronda_desde": "timestamptz",
    "ronda_hasta": "timestamptz",
    "turno": "early|day|night",
    "turno_desde": "timestamptz",
    "turno_hasta": "timestamptz"
  },
  "kpis": {
    "coverage_round": 1,
    "coverage_total": 488,
    "coverage_counted": 0,
    "coverage_pending": 488,
    "coverage_percent": 0.0,
    "review_pending": 0,
    "coverage_queue_pending": 488,
    "daily_pending": 0,
    "coverage_blocked_waiting_snapshot": 0
  },
  "next_action": "review|coverage|daily|none"
}
```

`coverage_percent` se calcula sobre la **ronda activa** y se redondea a 1 decimal.

No existe KPI Cajero acumulado 0–200%.

---

## 10. Session capability

Shape:

```json
{
  "mode": "active|recovery|none",
  "estado": "activo|recovery|finalizado|expirado|null",
  "capture_allowed": true,
  "pending_delivery_allowed": true,
  "iniciado_at": "timestamptz|null",
  "expira_at": "timestamptz|null",
  "recovery_until": "timestamptz|null",
  "finalizado_at": "timestamptz|null"
}
```

Semántica:

| mode | capture_allowed | pending_delivery_allowed |
|---|---:|---:|
| `active` | sí | sí |
| `recovery` | no | sí |
| `none` | no | no |

La autorización del dispositivo también condiciona ambas capacidades.

---

## 11. Panel state V4

Shape:

```json
{
  "source": "session",
  "frozen": true,
  "session": {
    "id": "uuid",
    "sede_id": "uuid",
    "usuario_id": "uuid",
    "estado": "activo|recovery|finalizado|expirado",
    "iniciado_at": "timestamptz",
    "expira_at": "timestamptz",
    "recovery_until": "timestamptz",
    "finalizado_at": "timestamptz|null"
  },
  "basis": {
    "snapshot_referencia_id": "uuid",
    "version_catalogo": "integer",
    "groups_revision": "bigint",
    "periodo_desde": "date",
    "periodo_hasta": "date",
    "ronda": 1,
    "ronda_desde": "timestamptz",
    "ronda_hasta": "timestamptz",
    "turno": "early|day|night",
    "turno_desde": "timestamptz",
    "turno_hasta": "timestamptz"
  },
  "groups": [],
  "review_queue": [],
  "coverage_queue": [],
  "daily_queue": [],
  "kpis": {},
  "next_action": "review|coverage|daily|none",
  "session_capability": {}
}
```

### `groups[]`

```json
{
  "grupo_id": "uuid",
  "nombre": "string",
  "categoria_id": "uuid",
  "categoria": "string",
  "tipo": "Individual|Agrupado",
  "precio": "number",
  "unidades_por_paquete": "integer|null",
  "precio_paquete": "number|null",
  "codigos_internos": [],
  "productos": [],
  "stock_teorico": 0,
  "snapshot_referencia_id": "uuid",
  "accion": "recount|coverage|daily|none",
  "detalle_reconteo_id": "uuid|null",
  "contado_detalle_id": "uuid|null",
  "contado_at": "timestamptz|null",
  "recontado_at": "timestamptz|null"
}
```

La metadata y el stock teórico están congelados al `start`.

Cambios posteriores del catálogo no reescriben una sesión activa.

### `review_queue[]`

```json
{
  "grupo_id": "uuid",
  "detalle_id": "uuid",
  "ultima_diferencia": -4,
  "contado_at": "timestamptz"
}
```

`ultima_diferencia` es siempre distinta de cero en `review_queue`: una diferencia inicial `0` produce `Coincide` y no entra al ciclo de reconteo.

### `coverage_queue`

Array de `grupo_id`.

### `daily_queue`

Array de `grupo_id`.

---

## 12. Start

### Request

`p_action = "start"`

```json
{
  "operation_id": "uuid",
  "device_token": "string"
}
```

### Reglas

El backend:

1. normaliza lifecycle de sesiones;
2. exige que no exista otra sesión `activo` en la sede;
3. toma el último snapshot confirmado;
4. exige stock vigente;
5. impide iniciar en los últimos 5 minutos del snapshot;
6. congela período/ronda/turno;
7. congela `groups_revision`;
8. crea `conteos`;
9. crea exactamente un runtime por cada grupo operacional;
10. congela metadata, stock teórico y acción.

### Response

```json
{
  "contract_version": 4,
  "generated_at": "timestamptz",
  "action": "start",
  "replay": false,
  "conteo_id": "uuid",
  "revisions": {
    "groups": 0,
    "devices": 0,
    "operational": 0
  },
  "stock": {
    "snapshot_id": "uuid",
    "capturado_at": "timestamptz",
    "confirmado_at": "timestamptz",
    "snapshot_expira_at": "timestamptz",
    "version_catalogo": 0
  },
  "session_capability": {},
  "panel_state": {}
}
```

---

## 13. save_batch

### Request

`p_action = "save_batch"`

```json
{
  "operation_id": "uuid",
  "device_token": "string",
  "conteo_id": "uuid",
  "expected_groups_revision": 0,
  "items": [
    {
      "client_observation_id": "uuid",
      "grupo_id": "uuid",
      "stock_fisico": 0,
      "contado_at": "timestamptz"
    }
  ]
}
```

Límite:

```text
1..500 items
```

`stock_fisico >= 0`.

Aunque el backend tolera que `expected_groups_revision` se omita, **el frontend V4 debe enviarlo** usando `panel_state.basis.groups_revision`.

### Timestamp válido

Debe cumplir:

```text
contado_at >= iniciado_at
contado_at < expira_at
contado_at <= server_now + 30 s
```

Durante recovery puede entregarse una observación pendiente si fue capturada dentro de esa ventana.

### Resultado normal

```text
d = stock_fisico - stock_teorico

d = 0  → Coincide
d != 0 → Recontar
```

Un snapshot posterior nunca auto-resuelve la diferencia.

### Response

```json
{
  "contract_version": 4,
  "generated_at": "timestamptz",
  "action": "save_batch",
  "replay": false,
  "conteo_id": "uuid",
  "saved": 1,
  "items": [
    {
      "client_observation_id": "uuid",
      "detalle_id": "uuid",
      "grupo_id": "uuid",
      "stock_teorico": 0,
      "stock_fisico": 0,
      "diferencia": 0,
      "estado_diferencia": "Coincide|Recontar",
      "contado_at": "timestamptz"
    }
  ],
  "panel_delta": {},
  "session_capability": {},
  "revisions": {}
}
```

---

## 14. Reconteo

Un caso es accionable únicamente cuando:

```text
estado_diferencia = Recontar
AND primer_snapshot_posterior_id IS NOT NULL
AND stock_reconteo IS NULL
```

El reconteo debe realizarse en una sesión posterior a la original.

### Request

`p_action = "recount_save_batch"`

```json
{
  "operation_id": "uuid",
  "device_token": "string",
  "conteo_id": "uuid",
  "expected_groups_revision": 0,
  "items": [
    {
      "detalle_id": "uuid",
      "stock_fisico": 0,
      "contado_at": "timestamptz"
    }
  ]
}
```

Límite:

```text
1..500 items
```

No puede repetirse `detalle_id` dentro del mismo batch.

### Resolución

```text
d0 = fisico_original - teorico_original
dr = fisico_reconteo - teorico_reconteo
```

```text
dr = 0
→ Coincide
→ diferencia final = 0
```

```text
d0 y dr con mismo signo
→ Confirmada
→ diferencia final = menor magnitud absoluta entre d0 y dr
  preservando signo
```

```text
signos incompatibles
→ Inconsistente
→ diferencia final = dr
```

### Response item

```json
{
  "detalle_id": "uuid",
  "grupo_id": "uuid",
  "snapshot_reconteo_id": "uuid",
  "stock_teorico_reconteo": 0,
  "stock_reconteo": 0,
  "diferencia_reconteo": 0,
  "diferencia": 0,
  "estado_diferencia": "Coincide|Confirmada|Inconsistente",
  "valor_diferencia": 0,
  "recontado_at": "timestamptz"
}
```

La envoltura de respuesta es equivalente a `save_batch`:

- `contract_version`;
- `generated_at`;
- `action`;
- `replay`;
- `conteo_id`;
- `saved`;
- `items`;
- `panel_delta`;
- `session_capability`;
- `revisions`.

---

## 15. Panel delta

Después de `save_batch` o `recount_save_batch`:

```json
{
  "groups_patch": [
    {
      "grupo_id": "uuid",
      "accion": "recount|coverage|daily|none",
      "detalle_reconteo_id": "uuid|null",
      "contado_detalle_id": "uuid|null",
      "contado_at": "timestamptz|null",
      "recontado_at": "timestamptz|null"
    }
  ],
  "review_queue": [],
  "coverage_queue": [],
  "daily_queue": [],
  "kpis": {},
  "next_action": "review|coverage|daily|none",
  "session_capability": {}
}
```

El frontend debe aplicar este delta autoritativo y no reconstruir localmente la lógica de elegibilidad.

---

## 16. Finish

### Request

`p_action = "finish"`

```json
{
  "operation_id": "uuid",
  "device_token": "string",
  "conteo_id": "uuid",
  "expected_groups_revision": 0
}
```

Puede finalizar una sesión:

```text
activo
recovery
```

### Response

```json
{
  "contract_version": 4,
  "generated_at": "timestamptz",
  "action": "finish",
  "replay": false,
  "conteo_id": "uuid",
  "status": "finalizado",
  "finalizado_at": "timestamptz",
  "session_capability": {
    "mode": "none",
    "estado": "finalizado",
    "capture_allowed": false,
    "pending_delivery_allowed": false,
    "expira_at": "timestamptz",
    "recovery_until": "timestamptz",
    "finalizado_at": "timestamptz"
  },
  "revisions": {}
}
```

Al finalizar:

```text
runtime de la sesión → eliminado
```

---

## 17. Idempotencia

Cada mutación exige:

```text
operation_id UUID
```

Scopes independientes:

```text
cashier_v4:start
cashier_v4:save_batch
cashier_v4:recount_save_batch
cashier_v4:finish
```

Reglas:

```text
mismo actor
+ mismo scope
+ mismo operation_id
+ mismo payload de negocio
→ replay
```

El `device_token` se excluye del hash del request.

En replay:

```json
{
  "replay": true
}
```

se fusiona sobre la respuesta almacenada.

Conflictos:

```text
mismo operation_id + payload distinto
→ SOLOG_IDEMPOTENCY_CONFLICT
```

```text
operación existente todavía sin respuesta
→ SOLOG_OPERATION_IN_PROGRESS
```

El frontend debe conservar en retry:

- `operation_id`;
- items;
- IDs de observación;
- timestamps capturados;
- payload de negocio.

No debe regenerarlos tras una respuesta incierta.

---

## 18. client_observation_id

Cada conteo normal enviado por `save_batch` exige:

```text
client_observation_id UUID
```

Es único.

No reutilizarlo para una observación distinta.

Un retry idempotente debe reproducir la misma operación completa; no debe intentar crear una operación nueva con el mismo `client_observation_id`.

---

## 19. Historial V2

### Request

```json
{
  "period": "today|yesterday"
}
```

Default backend:

```text
today
```

La fecha se calcula en `America/Lima`.

Solo devuelve conteos de:

- la sede del usuario;
- el mismo usuario autenticado.

### Response

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "period": "today|yesterday",
  "date": "date",
  "items": [],
  "revisions": {
    "operational": 0
  }
}
```

Cada item:

```json
{
  "detalle_id": "uuid",
  "grupo_id": "uuid",
  "grupo": "string|null",
  "categoria": "string|null",
  "stock_teorico": 0,
  "stock_fisico": 0,
  "diferencia": 0,
  "estado_diferencia": "Coincide|Recontar|Confirmada|Inconsistente|Inválido",
  "precio": 0,
  "valor_diferencia": 0,
  "contado_at": "timestamptz",
  "snapshot_referencia_id": "uuid",
  "primer_snapshot_posterior_id": "uuid|null",
  "snapshot_posterior_id": "uuid|null",
  "stock_posterior": "integer|null",
  "snapshot_reconteo_id": "uuid|null",
  "stock_teorico_reconteo": "integer|null",
  "stock_reconteo": "integer|null",
  "recontado_at": "timestamptz|null"
}
```

---

## 20. Routing V2

Response:

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "identity": {
    "id": "uuid",
    "nombre": "string",
    "rol": "cajero|admin|moderador"
  },
  "route": "/cajero|/admin"
}
```

Al reactivar usuarios para el frontend, esta RPC continúa siendo la autoridad de routing.

---

## 21. Errores contractuales

El backend levanta excepciones PostgreSQL cuyo mensaje contiene un código `SOLOG_*`.

El frontend debe mapear por código estable, no por texto humano libre.

### Auth / usuario / sede

```text
SOLOG_AUTH_REQUIRED
SOLOG_USER_DISABLED
SOLOG_OPERATIONAL_ROLE_REQUIRED
SOLOG_CASHIER_WITHOUT_SEDE
SOLOG_SEDE_NOT_FOUND
SOLOG_ROLE_NOT_ALLOWED
```

### Dispositivo

```text
SOLOG_INVALID_DEVICE_TOKEN
SOLOG_DEVICE_UNAUTHORIZED
```

### Inicio / snapshot

```text
SOLOG_CONFIRMED_SNAPSHOT_REQUIRED
SOLOG_CONFIRMED_SNAPSHOT_INCOMPLETE
SOLOG_STOCK_EXPIRED
SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY
SOLOG_SESSION_WINDOW_CLOSED
SOLOG_OPERATIONAL_PERIOD_NOT_STARTED
SOLOG_SESSION_CONFLICT
SOLOG_SESSION_RUNTIME_INCOMPLETE
```

### Sesión / concurrencia

```text
SOLOG_INVALID_SESSION
SOLOG_SESSION_NOT_FOUND
SOLOG_SESSION_REVISION_CONFLICT
SOLOG_GROUPS_REVISION_CONFLICT
SOLOG_SESSION_DELIVERY_NOT_ALLOWED
SOLOG_SESSION_PRIORITY_CONFLICT
SOLOG_COUNT_SESSION_REQUIRED
```

### Observación normal

```text
SOLOG_INVALID_BATCH_PAYLOAD
SOLOG_INVALID_BATCH_ITEM
SOLOG_INVALID_COUNT_TIMESTAMP
SOLOG_GROUP_NOT_AVAILABLE
SOLOG_GROUP_ALREADY_COUNTED
SOLOG_CLIENT_OBSERVATION_CONFLICT
SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT
```

### Reconteo

```text
SOLOG_INVALID_RECOUNT_BATCH_PAYLOAD
SOLOG_INVALID_RECOUNT_BATCH_ITEM
SOLOG_RECOUNT_NOT_PENDING
SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN
SOLOG_RECOUNT_THEORETICAL_REQUIRED
SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT
```

### Idempotencia

```text
SOLOG_INVALID_OPERATION
SOLOG_IDEMPOTENCY_CONFLICT
SOLOG_OPERATION_IN_PROGRESS
SOLOG_INVALID_OPERATION_RESPONSE
SOLOG_OPERATION_NOT_STARTED
```

### Payload / historial

```text
SOLOG_INVALID_PAYLOAD
SOLOG_INVALID_ACTION
SOLOG_INVALID_HISTORY_PERIOD
SOLOG_INVALID_OPERATIONAL_SUMMARY
```

---

## 22. Invariantes que el frontend no debe duplicar como autoridad

El frontend puede representar estados y anticipar UX, pero backend sigue siendo autoridad para:

- período, ronda y turno;
- vigencia de snapshot;
- expiración de sesión;
- transition `activo → recovery → expirado`;
- elegibilidad de grupo;
- prioridad `review → coverage → daily`;
- máximo un conteo normal por turno;
- snapshot posterior utilizable;
- accionabilidad de reconteo;
- resolución del reconteo;
- cobertura acreditada;
- revisiones;
- idempotencia;
- concurrencia;
- metadata congelada.

La UI debe consumir `panel_state`, `panel_delta`, `next_action`, KPI y `session_capability` como valores autoritativos.

---

## 23. Objetos internos vigentes relevantes

Persistencia principal:

```text
inventario.estado_stock_grupo
inventario.conteos
inventario.conteo_detalle
inventario.solog_session_runtime_groups
inventario.snapshots
inventario.snapshot_stock
inventario.solog_operaciones
inventario.solog_revisiones
```

Motor interno V4 relevante:

```text
inventario.solog_temporal_context
inventario.solog_cashier_group_actions_v4
inventario.solog_cashier_operational_summary_v4
inventario.solog_cashier_panel_state_v4
inventario.solog_cashier_panel_delta_v4
inventario.solog_session_capability_v4
inventario.solog_validate_session_observation_v4
inventario.solog_normalize_sessions_v4
inventario.solog_finish_session_v4
inventario.solog_aplicar_snapshot_v4
inventario.solog_catalog_refresh_operational_groups_v4
inventario.solog_groups_refresh_operational_v4
```

Estos helpers no son API frontend.

---

## 24. Legacy eliminado

No existen ya:

```text
estado_stock_grupo.cobertura_periodo
estado_stock_grupo.cobertura_periodo_desde

inventario.solog_session_groups
inventario.solog_daily_coverage_base
inventario.solog_daily_coverage_groups
inventario.solog_shift_coverage

rpc_solog_cashier_bootstrap_v2
rpc_solog_cashier_bootstrap_v3
rpc_solog_cashier_mutate_v2
rpc_solog_cashier_mutate_v3
rpc_solog_operational_v2
rpc_solog_details_v2
```

El frontend nuevo no debe contener fallbacks hacia estos contratos.

---

## 25. Estado real al congelar

```text
usuarios SOLOG activos       0
sesiones activo              0
sesiones recovery            0
runtime V4                   0

snapshots                   44
conteos                     67
conteo_detalle             914
estado_stock_grupo         976

Recontar abiertos            65
accionables                  58
esperando snapshot            7
```

Integridad validada:

```text
huérfanos críticos            0
mismatch ultimo_conteo_at     0
mismatch ultima_observacion   0
referencias backend legacy    0
```

---

## 26. Validación congelada

Quedaron comprobados en Supabase:

- límites de ronda y turno;
- transición R1 → R2;
- cero precrédito de ronda futura;
- diferencia no cero → `Recontar`;
- snapshot posterior solo habilita;
- no auto-resolución;
- reconteo misma sesión bloqueado;
- reconteo posterior permitido;
- `Coincide`, `Confirmada`, `Inconsistente`;
- reconteo acredita cobertura sin consumir cupo normal;
- máximo un conteo normal por turno;
- active/recovery;
- delivery tardío válido;
- expiración y cleanup de runtime;
- prioridad backend;
- batch máximo 500;
- revisions;
- aislamiento por sede/usuario;
- replay idempotente;
- metadata congelada;
- funcionamiento post-eliminación de legacy.

---

## 27. Regla de cambio

Este contrato queda congelado.

A partir de este punto:

- cambios backend incompatibles requieren un nuevo contrato/versionado;
- una corrección compatible debe documentarse como delta y no reinterpretar esta V4;
- el frontend de Fases 12–14 debe implementarse contra este archivo;
- si Codex encuentra una incompatibilidad, debe detenerse y devolver el bloqueo a ChatGPT;
- Codex no modifica backend.

La siguiente etapa puede preparar la migración frontend sin decisiones backend abiertas.
