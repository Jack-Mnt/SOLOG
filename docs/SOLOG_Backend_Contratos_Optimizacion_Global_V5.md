# SOLOG — Contratos Backend de Optimización Global V5

**Estado:** CONGELADO y DESPLEGADO para integración frontend v2  
**Fecha:** 2026-09-03  
**Proyecto Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`)  
**Nivel:** C — backend / contratos  
**API contract version:** `2`  
**Migraciones contractuales vigentes:**
- V2: `20260903112822_solog_backend_contracts_v2_route_master_reads`
- V3: `20260903200209_solog_cashier_bootstrap_panel_state_v2`
- V4: `20260903202831_solog_cashier_session_coverage_sync_v4`
- V5: `20260904041106_solog_shift_grid_totals_site_isolation_v5`

> La versión **V5 de este documento** no cambia `contract_version = 2` de las APIs. V5 identifica la revisión documental/contractual.

---

## 1. Autoridad y vigencia

### Fuente primaria de integración frontend

Este archivo es la **fuente primaria vigente para cualquier integración frontend ↔ backend SOLOG v2**.

Jerarquía:

1. `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` — decisiones funcionales congeladas.
2. `SOLOG_Backend_Optimizacion_Global_V1.md` — arquitectura y decisiones técnicas del backend.
3. **`SOLOG_Backend_Contratos_Optimizacion_Global_V5.md` — contrato de integración frontend vigente.**
4. `SOLOG_Backend_Contratos_Optimizacion_Global_V4.md` — **REEMPLAZADO / histórico**.
5. `SOLOG_Backend_Contratos_Optimizacion_Global_V3.md` — **REEMPLAZADO / histórico**.
6. `SOLOG_Backend_Contratos_Optimizacion_Global_V2.md` — **REEMPLAZADO / histórico**.
7. `SOLOG_Backend_Contratos_Optimizacion_Global_V1.md` — **REEMPLAZADO / histórico**.
8. Motor y modelo de datos vigentes del proyecto donde este contrato no los sustituya explícitamente.

Ante contradicción entre versiones de contratos, **prevalece V5**.

### Alcance acumulado V2 + V3 + V4 + V5

V2 cerró:

- **B1 — Login/routing:** resolver universal v2 mínimo.
- **B2 — lecturas Admin:** payload real de Dashboard/turnos y superficie v2 de lectura para Catálogo/Grupos/Publicación.

V3 cierra el bloqueo descubierto durante el preflight de **C1 — Cajero**:

- el bootstrap debe entregar grupos, colas y KPI también cuando todavía no existe una sesión operativa;
- esa lectura previa no puede presentarse como estado congelado;
- `start` continúa siendo la operación que congela snapshot, revisión y topología.

V3 mantiene compatibilidad aditiva: no elimina ni redefine `session_state`; añade `panel_state` como estado uniforme del panel.

V4 cierra el bloqueo detectado durante el preflight coordinado de **C1–C3**:

- `save_batch` debe actualizar también la cobertura congelada del grupo contado;
- `coverage_counted` y `coverage_percent` deben avanzar en la misma respuesta autoritativa;
- `groups_total` permanece congelado e inalterado;
- el frontend no recalcula cobertura ni KPI.

La corrección V4 es interna y compatible: no cambia payloads ni formas de respuesta de las RPC públicas.

V5 cierra el bloqueo descubierto durante el preflight de **A2 — Dashboard / shift grid**:

- `data.totals` debe aislar conteos por `site_id` antes de agregarlos;
- una fecha con denominador congelado debe conservarse aunque no tenga conteos en esa sede;
- conteos del mismo grupo en otra sede no pueden eliminar ni incrementar el total de la sede consultada;
- un grupo contado varias veces o presente en varias sedes cuenta una sola vez por sede y fecha en `Total`.

La corrección V5 es interna y compatible: no cambia el payload ni la forma de respuesta de `shift_grid`.

No se modifica:

- Motor V3;
- tablas de negocio;
- modelo de conteo/reconteo;
- cron existentes;
- Edge `conexion-admin` v3;
- mutaciones v2 previamente congeladas.

---

## 2. Seguridad y reglas comunes

El frontend no accede directamente a tablas de `inventario`.

Las nuevas RPC V2 de este cierre:

- `public.rpc_solog_route_v2(jsonb)`;
- `public.rpc_solog_admin_master_read_v2(text,jsonb)`;

cumplen:

- `SECURITY DEFINER`;
- `search_path = ''`;
- `anon`: sin `EXECUTE`;
- `PUBLIC`: sin `EXECUTE`;
- `authenticated`: con `EXECUTE`;
- validación de `auth.uid()`, usuario activo y rol dentro de backend.

La lectura maestra rechaza cajeros con `SOLOG_ADMIN_ROLE_REQUIRED`.

V3 no añade una nueva RPC pública. Modifica `rpc_solog_cashier_bootstrap_v2(jsonb)` y añade el helper interno:

`inventario.solog_cashier_pre_session_state(uuid,uuid,integer,bigint,date,date)`

Este helper:

- es `SECURITY DEFINER`;
- usa `search_path=''`;
- no tiene `EXECUTE` para `anon`, `authenticated` ni `PUBLIC`;
- solo se consume internamente desde el bootstrap público.

V4 añade además el helper/trigger interno:

`inventario.solog_session_group_sync_coverage_v4()`

sobre `inventario.solog_session_groups`.

También:

- es `SECURITY DEFINER`;
- usa `search_path=''`;
- no tiene `EXECUTE` para `anon`, `authenticated` ni `PUBLIC`;
- no es una superficie frontend;
- sincroniza exclusivamente la cobertura congelada al completar un conteo normal.

### Convención de respuesta

Las superficies v2 incluyen:

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz"
}
```

No existe un wrapper genérico obligatorio `data` para todas las RPC. Si una acción concreta usa una propiedad llamada `data`, forma parte **solo de ese contrato específico**.

### Idempotencia

Las mutaciones v2 documentadas como idempotentes usan UUID `operation_id` y el ledger privado `inventario.solog_operaciones`.

- El mismo `operation_id` se conserva únicamente al reintentar **la misma intención lógica con el mismo contenido**.
- Una intención nueva usa otro UUID.
- Una operación ya comprometida puede devolver `replay:true`; el frontend debe tratarla como éxito confirmado.
- Si una revisión esperada quedó obsoleta, el frontend recarga la fuente autoritativa y crea una intención nueva; no reutiliza silenciosamente el UUID anterior con otro payload.

### Revisiones

Revisiones monotónicas vigentes:

- `groups` — global;
- `catalog` — global;
- `operational` — por sede;
- `devices` — por sede;
- `incidents` — global o por sede.

---

# 3. Login y resolución de destino — NUEVO V2

## `rpc_solog_route_v2(p_payload jsonb)`

**Objetivo:** permitir que `/login` conozca el destino protegido sin consumir `rpc_solog_state('bootstrap')`, sin probar RPC por error y sin confiar en metadata editable del cliente.

**Rol:** cualquier usuario autenticado SOLOG activo cuyo rol sea `cajero`, `moderador` o `admin`.

### Payload

```json
{}
```

No acepta ni necesita:

- `device_token`;
- `site_id`;
- rol enviado por cliente;
- ruta enviada por cliente.

Todo se deriva desde `auth.uid()` y `public.usuarios`.

### Respuesta exacta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "identity": {
    "id": "uuid",
    "nombre": "string",
    "rol": "cajero | moderador | admin"
  },
  "route": "/cajero | /admin"
}
```

### Reglas

- `cajero` → `/cajero`.
- `moderador` → `/admin`.
- `admin` → `/admin`.
- la portada `/` no usa esta RPC;
- la comprobación empieza en `/login` después de disponer de sesión Auth válida;
- no se consulta dispositivo, snapshot, sesión de conteo, catálogo ni datasets administrativos.

### Errores

- `SOLOG_AUTH_REQUIRED`;
- `SOLOG_INVALID_PAYLOAD`;
- `SOLOG_USER_DISABLED`;
- `SOLOG_ROLE_NOT_ALLOWED`.

### Decisión de migración

`rpc_solog_state('bootstrap')` deja de ser necesario para resolver Login una vez migrado I1. No debe ampliarse para funcionalidad nueva y podrá entrar en la limpieza legacy posterior cuando no tenga consumidores.

---

# 4. Cajero

## 4.1. `rpc_solog_cashier_bootstrap_v2(p_payload jsonb)`

**Rol:** `cajero`.

### Objetivo contractual

Es la **única carga operativa inicial del panel Cajero**.

Debe servir tanto:

1. antes de existir una sesión operativa;
2. durante una sesión ya congelada.

No se requiere una RPC adicional para cargar grupos, colas o KPI.

### Payload

```json
{
  "device_token": "string opcional"
}
```

Usuario y sede se derivan desde `auth.uid()`.

### Respuesta autoritativa

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "server_now": "timestamptz",
  "identity": {
    "id": "uuid",
    "rol": "cajero",
    "nombre": "string"
  },
  "site": {
    "id": "uuid",
    "nombre": "string"
  },
  "device": {},
  "revisions": {
    "groups": 1,
    "devices": 1,
    "operational": 1
  },
  "start_capability": {},
  "session_state": null,
  "panel_state": {}
}
```

### `session_state`

Se conserva por compatibilidad y semántica.

- `null` cuando no existe sesión activa v2 congelada.
- contiene el estado congelado producido por `solog_cashier_session_state` cuando existe sesión.

El frontend nuevo **no debe interpretar `session_state:null` como ausencia de grupos o KPI**, porque esos datos están disponibles mediante `panel_state`.

### `panel_state` — contrato uniforme V3

`panel_state` siempre representa el estado necesario para renderizar el panel.

Contiene:

```json
{
  "source": "pre_session | session",
  "frozen": false,
  "session": null,
  "basis": {
    "snapshot_referencia_id": "uuid | null",
    "version_catalogo": "integer | null",
    "groups_revision": "bigint",
    "periodo_desde": "date",
    "periodo_hasta": "date"
  },
  "groups": [],
  "count_queue": [],
  "review_queue": [],
  "kpis": {
    "groups_total": 0,
    "coverage_counted": 0,
    "coverage_percent": 0,
    "count_pending": 0,
    "review_pending": 0
  }
}
```

#### Antes de iniciar sesión

```text
source = "pre_session"
frozen = false
session = null
```

`basis` describe la base **actual** usada para la proyección:

- último snapshot confirmado disponible;
- versión de catálogo de ese snapshot;
- revisión global actual de grupos;
- quincena vigente en `America/Lima`.

Los grupos se calculan con **las mismas reglas y la misma elegibilidad que usa `start` para materializar `solog_session_groups`**:

- grupo/categoría activos;
- mismo período operativo;
- mismos SKU integrantes;
- mismo stock teórico del snapshot de referencia;
- mismo estado de cobertura;
- misma detección de pendiente de reconteo;
- misma regla para `requiere_conteo`;
- misma regla para `requiere_reconteo`.

Por tanto, antes de `start` el frontend puede mostrar:

- grupos habilitados;
- SKU integrantes;
- stock teórico aplicable;
- estado operativo;
- cola de Conteo;
- cola de Revisar;
- KPI.

Esta proyección **no está congelada**. Puede quedar obsoleta si cambia snapshot, revisión o estado operacional antes de que el usuario pulse `start`.

`start` vuelve a validar todo en backend y su respuesta reemplaza esta proyección.

#### Durante una sesión activa

```text
source = "session"
frozen = true
```

`panel_state` se deriva del `session_state` congelado y conserva:

- `session`;
- `groups`;
- `count_queue`;
- `review_queue`;
- `kpis`.

`basis` se toma de la propia sesión:

- `snapshot_referencia_id`;
- `version_catalogo`;
- `groups_revision`;
- `periodo_desde`;
- `periodo_hasta`.

Un snapshot o cambio maestro posterior no altera ese `panel_state` congelado.

### Estructura de `groups[]`

Cada grupo contiene:

```text
grupo_id
nombre
categoria_id
categoria
tipo
precio
unidades_por_paquete
precio_paquete
codigos_internos[]
productos[]
stock_teorico
snapshot_referencia_id
cobertura_periodo
estado_stock
requiere_conteo
requiere_reconteo
detalle_reconteo_id
contado_detalle_id
contado_at
recontado_at
```

En `pre_session`, los últimos campos asociados a registros realizados dentro de la sesión actual pueden ser `null`.

### `count_queue`

Array ordenado de `grupo_id` que están disponibles para conteo normal.

### `review_queue`

Array ordenado:

```json
{
  "grupo_id": "uuid",
  "detalle_id": "uuid"
}
```

Solo contiene diferencias realmente pendientes de reconteo conforme al backend.

### KPI

Los KPI del panel deben derivarse exclusivamente de:

```text
panel_state.kpis
```

No realizar otra consulta para recomputarlos.

### `start_capability`

Continúa siendo independiente de que `panel_state` tenga datos.

`allowed=false` puede acompañarse, entre otros, de:

- `SOLOG_DEVICE_UNAUTHORIZED`;
- `SOLOG_SESSION_CONFLICT`;
- `SOLOG_CONFIRMED_SNAPSHOT_REQUIRED`;
- `SOLOG_STOCK_EXPIRED`;
- `SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY`;
- `SOLOG_OPERATIONAL_PERIOD_NOT_STARTED`.

Por ejemplo, un snapshot expirado puede seguir siendo visible como contexto en `panel_state`, mientras `start_capability` impide iniciar una nueva sesión.

### Regla frontend C1

C1 debe usar **una sola llamada** a `rpc_solog_cashier_bootstrap_v2`.

Para renderizar listas/KPI:

```text
usar panel_state siempre
```

Para saber si existe una sesión congelada:

```text
panel_state.source == "session"
```

o equivalentemente `session_state != null`.

No:

- consultar v1 para completar el payload;
- unir grupos desde maestro vivo;
- reconstruir cola/KPI en otra RPC;
- tratar `pre_session` como freeze;
- asumir que el `basis` de `pre_session` seguirá vigente al hacer `start`.
## 4.2. `rpc_solog_cashier_mutate_v2(p_action text,p_payload jsonb)`

Acciones públicas:

- `start`;
- `save_batch`;
- `recount_start`;
- `recount_save`;
- `finish`.

Toda acción requiere:

```json
{
  "operation_id": "uuid",
  "device_token": "string"
}
```

El dispositivo se revalida dentro de cada escritura.

### `start`

No envía `conteo_id` ni revisión.

Congela:

- snapshot de referencia;
- versión de catálogo;
- `groups_revision`;
- quincena operativa;
- grupos habilitados;
- integrantes/SKU necesarios;
- precios y valorización de paquete;
- stock teórico;
- elegibilidad normal/reconteo.

La respuesta devuelve el estado de sesión autoritativo, grupos congelados, colas y KPI necesarios para continuar sin reconstruirlos desde maestro vivo.

### `save_batch`

```json
{
  "operation_id": "uuid",
  "device_token": "string",
  "conteo_id": "uuid",
  "expected_groups_revision": 1,
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

Reglas:

- máximo 500 items;
- `stock_fisico >= 0`;
- todos los grupos pertenecen al freeze de la sesión;
- un grupo normal se observa una sola vez por sesión;
- el backend calcula `Coincide | Recontar` y devuelve estado autoritativo.

#### Garantía autoritativa de cobertura — V4

Cuando `save_batch` guarda correctamente un grupo congelado con:

```text
requiere_conteo = true
```

el backend garantiza, dentro de la misma transacción y antes de construir `state`:

```text
requiere_conteo = false
cobertura_periodo = true
contado_detalle_id = <detalle creado>
contado_at = <timestamp guardado>
```

Por tanto, `state.kpis` de esa misma respuesta refleja inmediatamente:

- `count_pending` reducido;
- `coverage_counted` incrementado cuando el grupo aún no estaba cubierto;
- `coverage_percent` recalculado;
- `groups_total` sin cambios.

`groups_total` continúa siendo el denominador congelado de la sesión.

La sincronización se aplica únicamente cuando `requiere_conteo` cambia de `true` a `false`. No altera la lógica de reconteo.

`inventario.estado_stock_grupo.cobertura_periodo` también queda en `true`, por lo que estado global y estado congelado permanecen coherentes.

En un replay de la misma intención lógica, el ledger devuelve la respuesta ya comprometida con `replay:true`; el frontend no debe aplicar un segundo incremento local.

### `recount_start`

```json
{
  "operation_id": "uuid",
  "device_token": "string",
  "conteo_id": "uuid",
  "detalle_id": "uuid",
  "expected_groups_revision": 1
}
```

Solo para un caso `Recontar` elegible. Debe ejecutarse desde una sesión posterior a la sesión de origen. La misma sesión devuelve `SOLOG_RECOUNT_SAME_SESSION_FORBIDDEN`.

Congela `snapshot_reconteo_id` y `stock_teorico_reconteo`.

### `recount_save`

```json
{
  "operation_id": "uuid",
  "device_token": "string",
  "conteo_id": "uuid",
  "detalle_id": "uuid",
  "expected_groups_revision": 1,
  "stock_fisico": 0,
  "contado_at": "timestamptz"
}
```

El backend aplica Motor V3:

```text
Dr = stock_reconteo - stock_teorico_reconteo
```

- `Dr = 0` → `Coincide`;
- mismo signo D0/Dr → `Confirmada`, conservando la diferencia de menor magnitud;
- signo opuesto → `Inconsistente`, usando `Dr`.

El frontend no recalcula Motor.

### `finish`

```json
{
  "operation_id": "uuid",
  "device_token": "string",
  "conteo_id": "uuid",
  "expected_groups_revision": 1
}
```

Finaliza autoritativamente la sesión.

## 4.3. `rpc_solog_cashier_history_v2(p_payload jsonb)`

### Payload

```json
{
  "period": "today | yesterday"
}
```

Devuelve el período completo del usuario autenticado en su sede. La pertenencia temporal se calcula en backend por `contado_at` y `America/Lima`.

---

# 5. Detalles

## `rpc_solog_details_v2(p_action text,p_payload jsonb)`

**Rol:** cajero autenticado.  
**Lectura:** no requiere dispositivo autorizado.

Acciones:

- `summary`;
- `history`;
- `detail`;
- `export`;
- `request_access`.

## 5.1. `summary`

```json
{
  "device_token": "string opcional"
}
```

Devuelve sede, cobertura, último snapshot, pendientes y estado de acceso/dispositivo de esa cuenta.

## 5.2. `history`

```json
{
  "period": "today | yesterday",
  "page_size": 100,
  "cursor": "string opaco opcional"
}
```

Reglas:

- `page_size` efectivo 1..100;
- keyset `(contado_at DESC,id DESC)`;
- `next_cursor` es opaco e incorpora período/revisión operativa;
- no decodificar ni reutilizar entre períodos;
- cursor obsoleto/incompatible → `SOLOG_PAGE_CURSOR_INVALID`.

## 5.3. `detail`

```json
{
  "case_id": "uuid"
}
```

Devuelve el caso congelado y su contexto bajo demanda.

## 5.4. `export`

```json
{
  "period": "current_biweekly | previous_biweekly"
}
```

Lectura bajo demanda. No usa `operation_id`. El rango se calcula en backend con `America/Lima`.

## 5.5. `request_access`

```json
{
  "operation_id": "uuid",
  "device_token": "string"
}
```

Mutación idempotente para solicitar acceso del dispositivo.

---

# 6. Admin bootstrap

Sin cambios contractuales respecto a V1.

## `rpc_solog_admin_bootstrap_v2(p_payload jsonb)`

Payload:

```json
{}
```

Respuesta:

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "identity": {
    "id": "uuid",
    "nombre": "string",
    "rol": "admin | moderador"
  },
  "permissions": {
    "can_admin": true,
    "can_moderate": true
  },
  "allowed_sites": [
    {
      "id": "uuid",
      "nombre": "string",
      "operational_revision": 1,
      "devices_revision": 1,
      "incidents_revision": 1
    }
  ],
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

Para `moderador`, `can_admin=false` y `can_moderate=true`.

---

# 7. Admin operacional — contrato exhaustivo V2

## `rpc_solog_operational_v2(p_action text, p_payload jsonb)`

**Roles:** `admin | moderador`.

Acciones:

- `dashboard_cards`;
- `shift_grid`;
- `daily_detail`;
- `control_page`;
- `control_detail`.

## 7.1. `dashboard_cards`

### Payload exacto

```json
{}
```

No requiere `site_id`: devuelve las sedes activas autorizadas por el contrato administrativo actual.

### Respuesta exacta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "revisions": {
    "groups": 1
  },
  "sites": [
    {
      "site_id": "uuid",
      "site": "string",
      "period_coverage": {
        "counted": 0,
        "total": 0,
        "percent": 0.0,
        "complete": false
      },
      "daily_coverage": {
        "counted_today": 0,
        "total": 0,
        "percent": 0.0
      },
      "pending_recount": 0,
      "snapshot": {
        "id": "uuid",
        "capturado_at": "timestamptz",
        "confirmado_at": "timestamptz",
        "version_catalogo": 5
      },
      "operational_revision": 1
    }
  ]
}
```

`snapshot` puede ser `null` si la sede no tiene snapshot confirmado.

## 7.2. `shift_grid`

### Payload exacto

```json
{
  "site_id": "uuid",
  "period": "current_biweekly | previous_biweekly"
}
```

`period` es opcional. Default backend: `current_biweekly`.

**Corrección contractual V2:** `site_id` es obligatorio. El plan anterior que indicaba no enviar payload para `shift_grid` queda reemplazado.

### Respuesta exacta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "site_id": "uuid",
  "period": {
    "key": "current_biweekly | previous_biweekly",
    "from": "date",
    "to": "date"
  },
  "data": {
    "shifts": [
      {
        "date": "date",
        "shift": "early | day | night",
        "numerator": 0,
        "denominator": 0,
        "percentage": 0.0,
        "groups_revision": 1,
        "calculated_at": "timestamptz"
      }
    ],
    "totals": [
      {
        "date": "date",
        "numerator": 0,
        "denominator": 0,
        "percentage": 0.0,
        "groups_revision": 1
      }
    ]
  },
  "revisions": {
    "operational": 1,
    "groups": 1
  }
}
```

La propiedad `data` pertenece específicamente a `shift_grid`; no constituye un wrapper general de las APIs v2.

### Garantías de aislamiento de `data.totals` — V5

`data.totals` es autoritativo por **sede + fecha operativa**.

Reglas:

- solo cuentan `conteo_detalle` cuyo `conteo_id` pertenece a la `site_id` solicitada;
- el filtro de sede se aplica antes de decidir si un grupo fue contado;
- la fecha se conserva aunque el numerador sea `0`;
- el denominador proviene de `solog_daily_coverage_base` y permanece congelado;
- el numerador es `count(distinct grupo_conteo_id)` sobre los grupos del día para esa sede;
- conteos del mismo `grupo_conteo_id` en otra sede se ignoran completamente;
- conteos repetidos del mismo grupo dentro de la misma sede/fecha no duplican el numerador.

Caso obligatorio:

```text
Sede A: denominador = 1, sin conteos propios
Sede B: conteo del mismo grupo
Resultado Sede A: numerator = 0, denominator = 1, percentage = 0
```

El frontend no debe reconstruir ni corregir `totals` localmente.

## 7.3. `daily_detail`

### Payload

```json
{
  "site_id": "uuid",
  "origin_date": "YYYY-MM-DD"
}
```

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "site_id": "uuid",
  "origin_date": "date",
  "summary": {
    "pending_recount": 0,
    "confirmed": 0,
    "inconsistent": 0
  },
  "items": [
    {
      "case_id": "uuid",
      "grupo_id": "uuid",
      "grupo": "string",
      "estado": "Coincide | Recontar | Confirmada | Inconsistente",
      "contado_at": "timestamptz",
      "recontado_at": "timestamptz | null",
      "theoretical": 0,
      "physical": 0,
      "difference": 0,
      "value": 0,
      "source": "initial | posterior | recount"
    }
  ],
  "revisions": {
    "operational": 1
  }
}
```

`value` puede ser `null` cuando la semántica del estado no exige valorización.

## 7.4. `control_page`

### Payload

```json
{
  "site_id": "uuid",
  "period": "today | last_week | current_biweekly | previous_biweekly | custom",
  "date_from": "date solo custom",
  "date_to": "date solo custom",
  "state": "Coincide | Recontar | Confirmada | Inconsistente | null",
  "search": "string opcional",
  "page": 0,
  "page_size": 100
}
```

Reglas:

- `page >= 0`;
- `page_size` efectivo: 1..100;
- custom: máximo 92 días;
- `date_from/date_to` solo son relevantes para `custom`;
- orden: `contado_at DESC, id DESC`.

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "site_id": "uuid",
  "period": {
    "key": "string",
    "from": "date",
    "to": "date"
  },
  "summary": {
    "total": 0,
    "coincide": 0,
    "pending_recount": 0,
    "confirmed": 0,
    "inconsistent": 0
  },
  "items": [
    {
      "case_id": "uuid",
      "grupo_id": "uuid",
      "grupo": "string",
      "categoria": "string",
      "contado_at": "timestamptz",
      "recontado_at": "timestamptz | null",
      "estado_diferencia": "Coincide | Recontar | Confirmada | Inconsistente",
      "diferencia": 0,
      "valor_diferencia": 0
    }
  ],
  "page": 0,
  "page_size": 100,
  "revisions": {
    "operational": 1
  }
}
```

## 7.5. `control_detail`

### Payload

```json
{
  "site_id": "uuid",
  "group_id": "uuid"
}
```

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "site_id": "uuid",
  "group_id": "uuid",
  "chronology": [
    {
      "case_id": "uuid",
      "contado_at": "timestamptz",
      "recontado_at": "timestamptz | null",
      "stock_teorico": 0,
      "stock_fisico": 0,
      "diferencia_inicial": 0,
      "stock_posterior": 0,
      "stock_teorico_reconteo": 0,
      "stock_reconteo": 0,
      "diferencia": 0,
      "estado_diferencia": "Coincide | Recontar | Confirmada | Inconsistente",
      "valor_diferencia": 0
    }
  ],
  "revisions": {
    "operational": 1
  }
}
```

Los campos de snapshots/reconteo que todavía no existan en un caso pueden ser `null`.

---

# 8. Exportación administrativa

Sin cambios respecto de V1.

## `rpc_solog_control_export_v2(p_payload jsonb)`

Payload:

```json
{
  "site_id": "uuid",
  "period": "current_biweekly | previous_biweekly"
}
```

No usa `operation_id`.

Datasets:

- `summary`;
- `adjustments`;
- `pending_recount`;
- `inconsistent`;
- `all`.

Se mantienen las reglas congeladas de último confirmado, desempate, diferencia vigente, valores históricos congelados y ausencia de valorización obligatoria para Inconsistentes.

---

# 9. Admin — lectura de Catálogo/Grupos/Publicación — NUEVO V2

## `rpc_solog_admin_master_read_v2(p_action text, p_payload jsonb)`

**Roles:** `admin | moderador`.

**Naturaleza:** exclusivamente lectura. No recibe `operation_id` ni revisiones esperadas.

Acciones congeladas:

- `status`;
- `reference`;
- `groups`;
- `group_products`;
- `catalog_changes`;
- `publication_preview`.

Toda respuesta incluye:

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

## 9.1. `status`

### Payload

```json
{}
```

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "catalog": {
    "version_actual": 5,
    "publicado_at": "timestamptz | null"
  },
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

Si aún no existiera una publicación, `version_actual` y `publicado_at` pueden ser `null`.

## 9.2. `reference`

### Payload

```json
{}
```

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "categories": [
    {
      "id": "uuid",
      "nombre": "string",
      "orden": 0
    }
  ],
  "groups": [
    {
      "id": "uuid",
      "nombre": "string",
      "categoria_id": "uuid",
      "categoria": "string",
      "precio": 0,
      "unidades_por_paquete": 0,
      "precio_paquete": 0
    }
  ],
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

`unidades_por_paquete` y `precio_paquete` pueden ser `null` según el grupo.

Esta acción existe para poblar selectores/diálogos bajo demanda sin acceder a tablas.

## 9.3. `groups`

### Payload

```json
{
  "categoria_id": "uuid opcional",
  "precio": 0,
  "tipo": "Único | Agrupado | null",
  "buscar": "string opcional",
  "limit": 50,
  "offset": 0
}
```

Reglas:

- `limit` efectivo: 1..50;
- default `limit=50`;
- `offset >= 0`;
- `precio` es opcional;
- `tipo` es opcional.

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "rows": [
    {
      "id": "uuid",
      "tipo": "Único | Agrupado",
      "activo": true,
      "nombre": "string",
      "precio": 0,
      "categoria": "string",
      "categoria_id": "uuid",
      "sku_count": 1,
      "integrantes": [
        {
          "c_interno": 20001,
          "producto": "string",
          "marca": "string | null",
          "precio": 0,
          "estado": "Único | Agrupado | Excluido"
        }
      ],
      "propuestas": [
        {
          "id": "uuid",
          "tipo": "string",
          "ambito": "producto | grupo",
          "estado": "pendiente | aprobado | ignorado | incorporado",
          "c_interno": 20001,
          "grupo_id": "uuid | null",
          "datos": {},
          "updated_at": "timestamptz"
        }
      ]
    }
  ],
  "limit": 50,
  "offset": 0,
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

Los campos opcionales dentro de propuestas pueden ser `null` según su ámbito.

## 9.4. `group_products`

### Payload

```json
{
  "categoria_id": "uuid opcional",
  "grupo_id": "uuid opcional",
  "estado": "Único | Agrupado | Excluido | null",
  "buscar": "string opcional",
  "limit": 50,
  "offset": 0
}
```

`limit` efectivo 1..50; default 50.

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "rows": [
    {
      "c_interno": 20001,
      "producto": "string",
      "marca": "string | null",
      "categoria_id": "uuid",
      "categoria": "string",
      "precio": 0,
      "estado": "Único | Agrupado | Excluido",
      "grupo_id": "uuid | null",
      "grupo": "string | null",
      "propuesta": {
        "id": "uuid",
        "estado": "pendiente | aprobado",
        "datos": {},
        "propuesta_fingerprint": "sha256 hex"
      }
    }
  ],
  "limit": 50,
  "offset": 0,
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

`propuesta` puede ser `null`.

## 9.5. `catalog_changes`

### Payload

```json
{
  "c_interno": 20001,
  "tipo": "agregar_producto | eliminar_producto | nombre | precio | codigo | clasificacion_producto | definicion_grupo | null",
  "estado": "pendiente | aprobado | ignorado | incorporado | null",
  "producto": "string opcional",
  "ambito": "producto | grupo | null",
  "limit": 50,
  "offset": 0
}
```

Todos los filtros son opcionales. `limit` efectivo 1..50; default 50.

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "rows": [
    {
      "propuesta_fingerprint": "sha256 hex",
      "cambio_id": "uuid | null",
      "ambito": "producto | grupo",
      "c_interno": 20001,
      "grupo_id": "uuid | null",
      "tipo": "string",
      "estado": "pendiente | aprobado | ignorado | incorporado",
      "seccion": "urgente | pendiente",
      "datos": {},
      "producto": "string | null",
      "sedes": [],
      "occurrence_count": 1,
      "first_seen_at": "timestamptz",
      "last_seen_at": "timestamptz",
      "catalogo_actual": {
        "producto": "string | null",
        "c_barras": "string | null",
        "precio": 0,
        "marca": "string | null",
        "estado": "Único | Agrupado | Excluido | null",
        "categoria": "string | null",
        "grupo": "string | null"
      },
      "aprobado_at": "timestamptz | null",
      "ignorado_at": "timestamptz | null",
      "version_aplicada": 5,
      "incorporado_at": "timestamptz | null"
    }
  ],
  "counts": {
    "pendiente": 0,
    "aprobado": 0,
    "ignorado": 0,
    "incorporado": 0,
    "urgentes_pendientes": 0,
    "cambios_pendientes": 0,
    "producto_aprobado": 0,
    "grupo_aprobado": 0
  },
  "limit": 50,
  "offset": 0,
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

Campos asociados a un tipo/ámbito no aplicable pueden ser `null`.

## 9.6. `publication_preview`

### Payload

```json
{}
```

### Respuesta

```json
{
  "contract_version": 2,
  "generated_at": "timestamptz",
  "preview": {},
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

`preview` es la proyección autoritativa del catálogo compartido.

### Preview sin cambios publicables

```json
{
  "ok": false,
  "codigo": "NO_APPROVED_CATALOG_CHANGES",
  "errores": ["string"],
  "conflictos": [],
  "puede_publicar": true
}
```

### Preview válido

Cuando `ok=true`, incluye:

```json
{
  "ok": true,
  "codigo": "CATALOG_PREVIEW_READY",
  "version_actual": 5,
  "version_nueva": 6,
  "schema_version": 1,
  "sku_actuales": 0,
  "sku_nuevos": 0,
  "sku_resultantes": 0,
  "cambios_total": 0,
  "cambios": {
    "agregar_producto": 0,
    "eliminar_producto": 0,
    "nombre": 0,
    "precio": 0,
    "codigo": 0,
    "clasificacion_producto": 0,
    "definicion_grupo": 0,
    "producto": 0,
    "grupo": 0
  },
  "change_ids": ["uuid"],
  "productos": [
    {
      "c_interno": 20001,
      "c_barras": "string | null",
      "producto": "string",
      "marca": "string",
      "categoria": "string",
      "precio": 0,
      "estado": "Único | Agrupado | Excluido",
      "grupo_conteo": "string | null"
    }
  ],
  "conflictos": [],
  "errores": [],
  "puede_publicar": true
}
```

Cuando existen conflictos, `ok=false`, `codigo=CATALOG_VALIDATION_FAILED` y `conflictos[]` contiene objetos con `codigo`, `mensaje`, `entidad_tipo`, `entidad_id` y `change_ids`.

`puede_publicar` depende del rol; el preview puede ser consultado por moderador, pero solo admin puede ejecutar la Edge de publicación.

---

# 10. Admin — mutaciones de Catálogo/Grupos/Precios

## `rpc_solog_admin_master_v2(p_action text, p_payload jsonb)`

V2 conserva esta RPC para:

### Lectura vinculada a resolución

- `price_mismatch_options`.

### Mutaciones

- `group_change_save`;
- `catalog_change_action`;
- `resolve_group_price`;
- `update_package_price`.

Toda mutación mantiene:

```json
{
  "operation_id": "uuid",
  "expected_groups_revision": 1
}
```

`status` continúa existiendo técnicamente en esta RPC por compatibilidad, pero **el frontend nuevo debe usar `rpc_solog_admin_master_read_v2('status',{})`**. No debe crearse un nuevo consumidor del `status` anterior.

`price_mismatch_options` permanece en `rpc_solog_admin_master_v2` porque forma parte directa del flujo de resolución transaccional de precio.

Se mantienen sin cambios las reglas V1 de:

- advisory lock maestro;
- idempotencia;
- invariantes 0/1/2+ SKU;
- `update_group_price | separate_sku`;
- precio por paquete independiente;
- publicación posterior mediante `conexion-admin`.

---

# 11. Incidencias

## `rpc_solog_admin_incidents_v2(p_action text,p_payload jsonb)`

**Roles:** `admin | moderador`.

Acciones:

- `summary`;
- `detail`;
- `ignore_30d`;
- `reactivate`;
- `propose_delete`.

## 11.1. `summary`

```json
{
  "site_id": "uuid opcional"
}
```

- sin `site_id`: scope global;
- con `site_id`: scope de sede;
- una representación por `family_key`;
- sin filtros manuales de fecha;
- devuelve la revisión `incidents` correspondiente, nunca `null`.

## 11.2. `detail`

```json
{
  "family_key": "sha256 hex",
  "site_id": "uuid opcional",
  "page": 0,
  "page_size": 100
}
```

`page_size <= 100`. Devuelve repeticiones/detalle bajo demanda.

## 11.3. Mutaciones

Acciones: `ignore_30d | reactivate | propose_delete`.

```json
{
  "family_key": "sha256 hex",
  "scope": "global | site",
  "site_id": "uuid solo cuando scope=site",
  "operation_id": "uuid",
  "expected_revision": 1
}
```

- `expected_revision` global para `scope=global`;
- revisión de sede para `scope=site`;
- `ignore_30d`: suprime 30 días;
- `reactivate`: revoca anticipadamente la exclusión aplicable;
- `propose_delete`: prepara propuesta `eliminar_producto`; no elimina ni suprime directamente.

`family_key` es estable e independiente de sede. La supresión se respeta también en INSERT/UPDATE/ON CONFLICT de incidencias repetidas.

---

# 12. Dispositivos

## `rpc_solog_admin_devices_v2(p_action text,p_payload jsonb)`

**Roles:** `admin | moderador`.

Acciones:

- `list`;
- `authorize`;
- `replace`;
- `revoke`;
- `reject`.

## 12.1. `list`

```json
{
  "site_id": "uuid opcional"
}
```

Lectura autoritativa de dispositivos/pedidos del scope solicitado.

## 12.2. Mutaciones

```json
{
  "device_id": "uuid",
  "operation_id": "uuid",
  "expected_revision": 1
}
```

El backend:

- deriva la sede desde el dispositivo;
- bloquea de forma estable la sede/filas implicadas;
- valida revisión `devices`;
- garantiza un único dispositivo autorizado por sede;
- devuelve estado autoritativo actualizado.

`authorize` no reemplaza silenciosamente. `replace` es la operación explícita de sustitución.

Conflicto de revisión: `SOLOG_DEVICE_REVISION_CONFLICT`.

---

# 13. Publicación de catálogo

Sin cambios respecto de V1.

## Edge `conexion-admin` v3

Request:

```json
{
  "action": "publish_catalog",
  "operation_id": "uuid"
}
```

- JWT obligatorio;
- solo `admin`;
- mismo `operation_id` al reintentar la misma publicación lógica;
- no upload directo desde frontend;
- no `upsert` cliente;
- `rpc_solog_catalog_publication_v2` sigue siendo interna y no ejecutable por `authenticated`.

---

# 14. Cron

Sin cambios respecto de V1.

Activos:

| Job | UTC | Lima | Uso |
|---|---:|---:|---|
| `solog_shift_early` | 12:30 | 07:30 | cierra Madrugada/Early |
| `solog_shift_day` | 20:30 | 15:30 | cierra Día |
| `solog_shift_night` | 05:00 | 00:00 | cierra Noche del día anterior y congela nuevo día |
| `conexion_cleanup_snapshot_stock` | según job desplegado | — | limpieza ConeXion |

La UI puede presentar las etiquetas aprobadas **Día / Noche / Madrugada** aunque el backend use claves `day / night / early`.

---

# 15. Errores relevantes añadidos/confirmados por V2

Además de los errores ya congelados en V1, el frontend debe tratar:

### Routing

- `SOLOG_AUTH_REQUIRED`;
- `SOLOG_INVALID_PAYLOAD`;
- `SOLOG_USER_DISABLED`;
- `SOLOG_ROLE_NOT_ALLOWED`.

### Lecturas maestras

- `SOLOG_ADMIN_ROLE_REQUIRED`;
- `SOLOG_INVALID_ACTION`;
- `SOLOG_INVALID_GROUP_FILTER`;
- `SOLOG_INVALID_GROUP_TYPE`;
- `SOLOG_INVALID_GROUP_PRODUCT_FILTER`;
- `SOLOG_INVALID_PRODUCT_MODE`;
- `SOLOG_INVALID_CATALOG_FILTER`;
- `SOLOG_INVALID_CATALOG_CHANGE_STATE`;
- `SOLOG_INVALID_CATALOG_CHANGE_SCOPE`;
- `SOLOG_INVALID_CATALOG_CHANGE_TYPE`.

### Operacional

- `SOLOG_INVALID_SITE`;
- `SOLOG_SITE_FORBIDDEN`;
- `SOLOG_INVALID_DATE_RANGE`;
- `SOLOG_INVALID_PAGE_SIZE`;
- `SOLOG_INVALID_DIFFERENCE_STATE`;
- `SOLOG_EXPORT_PERIOD_INVALID`;
- `SOLOG_INVALID_GROUP`;
- `SOLOG_INVALID_ACTION`.

No inventar equivalencias de errores en frontend.

---

# 16. Estado de los bloqueos del plan

## B1 — Resolver de destino Login

**RESUELTO.**

Contrato desplegado:

```text
rpc_solog_route_v2({})
```

`/login` puede migrarse completamente a v2. Ya no existe justificación contractual para conservar `rpc_solog_state('bootstrap')` como resolver de ruta.

## B2 — Esquemas Admin / Maestro

**RESUELTO.**

Correcciones:

1. `dashboard_cards` usa `{}`.
2. `shift_grid` requiere `site_id` y acepta `period` opcional.
3. `daily_detail` requiere `site_id + origin_date`.
4. Los esquemas de respuestas operacionales quedan congelados en §7.
5. Las lecturas de Maestro se realizan mediante:

```text
rpc_solog_admin_master_read_v2
```

con acciones:

```text
status
reference
groups
group_products
catalog_changes
publication_preview
```

6. `rpc_solog_admin_master_v2` queda como superficie de resolución/mutación más `price_mismatch_options`.

A4 ya no depende de contratos v1 para lecturas.

## C1 — Bootstrap Cajero sin sesión

**RESUELTO EN V3.**

El bloqueo era real: el bootstrap v2 anterior devolvía `session_state:null` y no exponía grupos/colas/KPI hasta después de `start`.

V3 añade `panel_state`:

- `pre_session` antes de iniciar;
- `session` durante una sesión congelada.

La proyección previa usa exactamente las reglas de materialización de `start` y no se presenta como freeze.

---

## C1–C3 — KPI de cobertura tras `save_batch`

**RESUELTO EN V4.**

El defecto era real: `save_batch` reducía `requiere_conteo`, pero `solog_cashier_session_state` calculaba cobertura únicamente desde `solog_session_groups.cobertura_periodo`, que conservaba el valor inicial.

V4 sincroniza `cobertura_periodo=true` al completar un conteo normal antes de generar el estado autoritativo.

El frontend no debe compensar ni recalcular este KPI.

## A2 — `shift_grid.data.totals` por sede

**RESUELTO EN V5.**

El defecto era real: la versión anterior enlazaba conteos por grupo/fecha antes de restringir la sede y luego usaba `where cd.id is null or c.id is not null`, lo que podía eliminar por completo una fecha cuando solo existían conteos del mismo grupo en otra sede.

V5 aísla la sede dentro de la selección del conteo y preserva la fila diaria aunque no haya conteos propios.

---

# 17. Evidencia de validación V5

Validado directamente en producción después de la migración:

### Seguridad

Ambas nuevas RPC:

- `SECURITY DEFINER = true`;
- `search_path=''`;
- `anon_exec=false`;
- `public_exec=false`;
- `authenticated_exec=true`.

### Routing

Comprobado con identidades reales, sin modificar datos:

- admin → `/admin`;
- moderador → `/admin`;
- cajero → `/cajero`.

### Lecturas maestras

Comprobadas dinámicamente como admin:

- `status`;
- `reference`;
- `groups`;
- `group_products`;
- `catalog_changes`;
- `publication_preview`.

Todas devolvieron `contract_version=2` y revisiones `groups/catalog`.

Comprobación negativa:

- cajero llamando a lectura maestra → `SOLOG_ADMIN_ROLE_REQUIRED`.

### Operacional V5

El defecto de aislamiento de sede en `shift_grid.data.totals` fue confirmado en la definición desplegada anterior.

V5 reemplazó la agregación que hacía `JOIN` de `conteo_detalle` por grupo/fecha antes de filtrar sede por una selección correlacionada que exige `conteos.sede_id = site_id` dentro de la existencia del conteo.

Validaciones sintéticas aprobadas:

- día sin conteos: fecha preservada, numerador `0`;
- conteo únicamente en otra sede: fecha preservada, numerador `0`;
- mismo grupo en ambas sedes / repeticiones: cada sede cuenta exclusivamente sus conteos y `distinct grupo_conteo_id` evita duplicación.

Validación dinámica posterior al despliegue:

- `shift_grid` respondió con `contract_version=2`;
- preservó `period.key/from/to`;
- devolvió `data.totals` para las fechas transcurridas de la quincena;
- una fecha sin actividad devolvió numerador `0` en lugar de desaparecer.

Seguridad/ACL preservados:

- `SECURITY DEFINER=true`;
- `search_path=''`;
- `anon_exec=false`;
- `public_exec=false`;
- `authenticated_exec=true`.

`shift_grid` validado con:

```json
{
  "site_id": "<sede>",
  "period": "current_biweekly"
}
```

Respuesta validada con:

- `contract_version=2`;
- `period.key/from/to`;
- `data.shifts`;
- `data.totals`;
- revisiones `operational/groups`.

### Cajero bootstrap V3

Validado dinámicamente con una identidad cajero y sin sesión activa:

- `contract_version=2`;
- `session_state=null`;
- `panel_state.source='pre_session'`;
- `panel_state.frozen=false`;
- `basis` con período, revisión, snapshot y catálogo;
- grupos, `count_queue`, `review_queue` y KPI presentes en la misma respuesta.

En Huaca, la validación del momento produjo:

```text
groups_total = 483
count_pending = 483
review_pending = 0
coverage_counted = 0
```

Una consulta independiente usando la misma selección/materialización de `start` devolvió exactamente los mismos valores.

### Seguridad del helper V3

`inventario.solog_cashier_pre_session_state(...)`:

- `anon_exec=false`;
- `authenticated_exec=false`;
- `public_exec=false`.

`rpc_solog_cashier_bootstrap_v2(jsonb)` mantiene:

- `anon_exec=false`;
- `public_exec=false`;
- `authenticated_exec=true`.

### Cobertura de sesión V4

Validación estructural:

- `solog_cashier_session_state` obtiene `coverage_counted` exclusivamente desde `solog_session_groups.cobertura_periodo`;
- `save_batch` cambia `requiere_conteo=false` y crea `contado_detalle_id`;
- antes de V4 no existía ningún trigger sobre `solog_session_groups` que sincronizara cobertura.

Validación dinámica descartable:

```text
requiere_conteo: true → false
cobertura_periodo: false → true
```

La prueba se ejecutó en una tabla temporal dentro de una transacción revertida.

Seguridad:

- helper V4 `anon_exec=false`;
- `authenticated_exec=false`;
- `public_exec=false`;
- trigger instalado en `inventario.solog_session_groups`.

Estado productivo al desplegar:

- grupos guardados con `contado_detalle_id` y cobertura inconsistente: `0`.

### Replay

V4 no cambia el ledger de idempotencia.

`save_batch` sigue conservando la respuesta comprometida por `operation_id`; un retry de la misma intención retorna `replay:true` y no ejecuta un segundo guardado ni un segundo avance de cobertura.

### Datos

La migración V4 no necesitó reparación de datos operativos porque no existían filas guardadas inconsistentes al momento del despliegue.

---

# 18. Gate E2E Cajero

El cierre de cobertura V4 no modifica el gate E2E anterior.

Sigue siendo obligatorio antes del cierre global:

```text
start
→ save_batch
→ finish
→ nueva sesión
→ recount_start
→ recount_save
→ finish
```

Además debe comprobarse el rechazo del reconteo en la misma sesión de origen.

En el momento de ejecutar el smoke debe existir:

- snapshot confirmado y todavía vigente;
- dispositivo real autorizado;
- `device_token` real del dispositivo.

La existencia de un snapshot fresco en un checkpoint previo no debe asumirse vigente para una ejecución posterior; se revalida al iniciar el smoke.

---

# 19. Decisión de liberación a Codex

Con V5:

- **B1 cerrado**;
- **B2 cerrado**;
- **bloqueo C1 pre-sesión cerrado**;
- **bloqueo C1–C3 de cobertura/KPI cerrado**;
- **bloqueo A2 `shift_grid.data.totals` cerrado**;
- backend desplegado;
- A1–A3 pueden reanudarse sin reconstrucción frontend de cobertura diaria.

Codex puede reanudar el bloque coordinado A1 → A2 → A3 con estas restricciones:

- no modificar Supabase/backend;
- V5 reemplaza V4/V3/V2/V1 como contrato primario;
- `shift_grid` mantiene payload `{site_id, period?}`;
- consumir `data.shifts` y `data.totals` tal como los devuelve backend;
- no recalcular `totals` en frontend;
- no mezclar datos entre sedes;
- no crear consumidores nuevos v1;
- no acceder a `inventario` directamente;
- si aparece otra necesidad backend no cubierta por V5, detener la fase y devolverla a ChatGPT;
- preservar cambios preexistentes;
- no ejecutar refactors generales no relacionados.

No avanzar a A4 después de terminar A3 sin revisión del usuario/ChatGPT.

---

## 20. Resumen de superficies públicas v2 vigentes

| Dominio | Superficie |
|---|---|
| Login/routing | `rpc_solog_route_v2` |
| Cajero bootstrap | `rpc_solog_cashier_bootstrap_v2` |
| Cajero mutaciones | `rpc_solog_cashier_mutate_v2` |
| Cajero historial | `rpc_solog_cashier_history_v2` |
| Detalles | `rpc_solog_details_v2` |
| Admin bootstrap | `rpc_solog_admin_bootstrap_v2` |
| Dashboard/Control | `rpc_solog_operational_v2` |
| Export Admin | `rpc_solog_control_export_v2` |
| Maestro lecturas | `rpc_solog_admin_master_read_v2` |
| Maestro resolución/mutación | `rpc_solog_admin_master_v2` |
| Incidencias | `rpc_solog_admin_incidents_v2` |
| Dispositivos | `rpc_solog_admin_devices_v2` |
| Publicación catálogo | Edge `conexion-admin` v3 |

`rpc_solog_catalog_publication_v2` permanece interna al servicio de publicación y no forma parte de la superficie frontend.
