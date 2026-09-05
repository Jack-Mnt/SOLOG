# SOLOG — Contratos Backend de Optimización Global V8

**Estado:** CONGELADO, DESPLEGADO y VALIDADO para integración frontend  
**Fecha:** 2026-09-05  
**Proyecto Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`)  
**Nivel:** C — backend / contrato Cajero  
**API contract version:** `2`  
**Migración V8 desplegada:** `20260905125341_solog_cashier_recovery_window_v8`

> V8 no cambia `contract_version = 2`. V8 es una revisión contractual aditiva sobre V7 y reemplaza a V7 únicamente en la semántica de expiración, recuperación y entrega tardía de sesiones Cajero. Todo lo no modificado explícitamente por este documento permanece vigente según V7.

---

## 1. Autoridad y precedencia

Para integración frontend ↔ backend SOLOG:

1. `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` — decisiones funcionales globales.
2. **`SOLOG_Backend_Contratos_Optimizacion_Global_V8.md` — fuente primaria vigente para contrato backend/frontend.**
3. `SOLOG_Backend_Contratos_Optimizacion_Global_V7.md` — REEMPLAZADO solo en los puntos que V8 modifica; histórico/inheredado para el resto.
4. Documentación contractual anterior — histórica cuando contradiga V8/V7.

Ante contradicción sobre expiración o recuperación de sesión Cajero, **prevalece V8**.

---

## 2. Problema resuelto

V7 trataba `expira_at` como final absoluto de la sesión. Al alcanzarlo:

- la sesión pasaba a `expirado`;
- `save_batch` y `recount_save_batch` dejaban de aceptar envíos;
- un usuario podía perder drafts válidamente capturados antes de la expiración si olvidaba enviarlos.

V8 separa dos conceptos:

- **fin de captura:** `expira_at`;
- **fin de recuperación/entrega:** `recovery_until = expira_at + 2 horas`.

Un conteo capturado antes de `expira_at` sigue siendo válido aunque se transmita después, siempre que el envío ocurra dentro de la ventana de recuperación y supere todas las validaciones existentes.

---

## 3. Semántica de sesión V8

### 3.1. Ventanas temporales

```text
iniciado_at
    │
    │ captura + envío normales
    ▼
expira_at
    │
    │ recuperación / entrega tardía
    │ NO nuevas capturas
    ▼
recovery_until = expira_at + 2 horas
    │
    ▼
expirado definitivo
```

### 3.2. Reglas

Antes de `expira_at`:

- `capture_allowed = true`;
- `pending_delivery_allowed = true`;
- `save_batch` permitido;
- `recount_save_batch` permitido;
- `finish` permitido.

Entre `expira_at` y `recovery_until`:

- `capture_allowed = false`;
- `pending_delivery_allowed = true`;
- no se permiten nuevas capturas;
- drafts ya capturados pueden enviarse mediante `save_batch` o `recount_save_batch`;
- cada item sigue obligado a tener `contado_at` dentro de `[iniciado_at, expira_at]`;
- `finish` está permitido y deja la sesión como `finalizado`.

Desde `recovery_until`:

- la sesión pasa a `expirado`;
- `pending_delivery_allowed = false`;
- los batches dejan de ser aceptados con la semántica normal de sesión expirada;
- la sede queda disponible para iniciar una nueva sesión.

---

## 4. Reserva de sede

Se conserva el índice único vigente:

```text
conteos_una_sesion_activa_por_sede
UNIQUE (sede_id) WHERE estado = 'activo'
```

Durante la ventana de recuperación la sesión permanece técnicamente en `estado='activo'` para reservar la sede.

Por tanto:

- no puede iniciarse una segunda sesión durante recuperación;
- `start` continúa devolviendo `SOLOG_SESSION_CONFLICT` mientras exista esa sesión;
- no se añade un estado nuevo a `inventario.conteos`;
- no se modifica la constraint de estados.

---

## 5. Estado persistente

No se añaden columnas nuevas.

`recovery_until` es derivado siempre como:

```sql
expira_at + interval '2 hours'
```

La sesión sigue usando los estados existentes:

- `activo`;
- `finalizado`;
- `expirado`.

Semántica V8:

- `finalizado`: sesión entregada/cerrada correctamente, incluso si se finalizó durante recuperación;
- `expirado`: sesión que agotó la ventana de recuperación sin cierre exitoso.

Para expiración automática:

```text
finalizado_at = recovery_until
```

Para `finish` exitoso:

```text
finalizado_at = now()
```

---

## 6. `solog_cashier_session_state` — delta V8

El objeto `session` añade:

```json
{
  "id": "uuid",
  "estado": "activo | finalizado | expirado",
  "iniciado_at": "timestamptz",
  "expira_at": "timestamptz",
  "recovery_until": "timestamptz",
  "finalizado_at": "timestamptz | null"
}
```

`recovery_until` es autoritativo y se calcula en backend.

Todo el resto de `session`, `groups`, `count_queue`, `review_queue` y `kpis` permanece según V7.

---

## 7. `rpc_solog_cashier_bootstrap_v2` — delta V8

### 7.1. Sesión recuperable

Bootstrap ya no considera la sesión definitivamente expirada al llegar a `expira_at`.

La sesión permanece visible mientras:

```text
estado = activo
AND now() < recovery_until
```

Solo se marca `expirado` automáticamente cuando:

```text
now() >= recovery_until
```

### 7.2. Nuevo campo `session_capability`

Respuesta aditiva:

```json
{
  "session_capability": {
    "mode": "none | active | recovery",
    "capture_allowed": true,
    "pending_delivery_allowed": true,
    "recovery_until": "timestamptz | null"
  }
}
```

Valores contractuales:

#### Sin sesión

```json
{
  "mode": "none",
  "capture_allowed": false,
  "pending_delivery_allowed": false,
  "recovery_until": null
}
```

#### Sesión dentro de captura

```json
{
  "mode": "active",
  "capture_allowed": true,
  "pending_delivery_allowed": true,
  "recovery_until": "timestamptz"
}
```

#### Sesión en recuperación

```json
{
  "mode": "recovery",
  "capture_allowed": false,
  "pending_delivery_allowed": true,
  "recovery_until": "timestamptz"
}
```

`session_capability` es la fuente autoritativa para decidir si el frontend puede capturar o únicamente entregar pendientes.

### 7.3. `start_capability`

No cambia su forma.

Mientras exista una sesión `activo`, incluida una sesión en recuperación:

```text
start_capability.allowed = false
start_capability.reason = SOLOG_SESSION_CONFLICT
```

---

## 8. `rpc_solog_cashier_mutate_v2` — delta V8

No se añaden acciones nuevas.

Acciones vigentes principales:

- `start`;
- `save_batch`;
- `recount_save_batch`;
- `finish`.

### 8.1. `save_batch`

Durante recuperación sigue permitido si la sesión permanece `activo`.

La validación temporal existente se conserva:

```text
iniciado_at <= contado_at <= expira_at
```

También se mantiene la protección de futuro:

```text
contado_at <= now() + 30 segundos
```

Por tanto, V8 permite **entrega tardía**, no captura tardía.

No cambian:

- límite de 500 items;
- `client_observation_id`;
- atomicidad del batch;
- `operation_id`;
- replay;
- revisión de grupos;
- congelación de stock teórico;
- Motor de diferencias normal;
- estado autoritativo devuelto.

### 8.2. `recount_save_batch`

Misma semántica temporal:

```text
iniciado_at <= contado_at <= expira_at
```

Durante recuperación puede transmitir reconteos previamente capturados.

No cambian:

- máximo 500;
- atomicidad;
- idempotencia;
- prohibición de reconteo en la misma sesión de origen;
- snapshot/stock teórico congelados al enviar;
- Motor V3;
- valorización autoritativa.

### 8.3. `finish`

Si la sesión sigue en `estado='activo'`, incluso durante recuperación:

```text
estado = finalizado
finalizado_at = now()
```

No se marca `expirado` por el solo hecho de que `now() >= expira_at`.

Al llegar a `recovery_until`, el proceso de limpieza automática ya habrá convertido la sesión a `expirado`; un `finish` posterior no recupera ni reabre la sesión.

---

## 9. Legacy de reconteo

Las acciones legacy:

- `recount_start`;
- `recount_save`;

siguen desplegadas únicamente por compatibilidad temporal hasta S10.

**No reciben la semántica de recuperación V8.**

Después de `expira_at` deben responder como sesión expirada para estas acciones.

El frontend vigente no debe consumirlas.

---

## 10. Inactividad frontend — decisión congelada asociada

La inactividad de 20 minutos **no es una operación backend**.

Comportamiento requerido del cliente:

```text
20 minutos sin actividad
→ bloquear captura local temporalmente
→ NO save_batch
→ NO recount_save_batch
→ NO finish
→ conservar drafts en memoria
```

Si el usuario vuelve:

### Antes de `expira_at`

- puede reanudar captura;
- puede enviar;
- puede finalizar.

### Entre `expira_at` y `recovery_until`

- no puede capturar ni modificar nuevos conteos;
- puede enviar drafts existentes;
- puede finalizar;
- la UI debe indicar que la sesión está en recuperación.

### Después de `recovery_until`

- sesión expirada definitivamente;
- drafts ya no pueden enviarse;
- el cliente debe limpiar/bloquear esos drafts según el flujo de expiración definitivo.

---

## 11. Restricción conocida: drafts en memoria

V8 **no cambia** la decisión de almacenamiento de drafts.

Los drafts continúan exclusivamente en memoria del frontend.

La recuperación funciona si la aplicación/pestaña conserva ese estado. No cubre:

- recarga de página;
- cierre del navegador;
- reinicio de dispositivo;
- pérdida de memoria del proceso.

Persistir drafts localmente queda fuera del alcance de V8.

---

## 12. Seguridad e invariantes preservadas

V8 no cambia:

- autenticación por `auth.uid()`;
- usuario activo y rol Cajero;
- autorización por `device_token`;
- derivación backend de sede;
- lock por sede;
- índice de una sesión activa por sede;
- `expected_groups_revision`;
- idempotencia por `operation_id`;
- aislamiento de sesiones;
- topología congelada;
- snapshot de referencia;
- versión de catálogo;
- stock teórico congelado;
- Motor V3;
- RLS / ausencia de acceso directo frontend a `inventario`.

La recuperación no confía en la hora de envío para determinar cuándo ocurrió el conteo. El criterio sigue siendo el `contado_at` del item validado contra la ventana original de captura.

---

## 13. Validación backend realizada

Migración desplegada:

```text
20260905125341_solog_cashier_recovery_window_v8
```

Validaciones estructurales confirmadas:

- `session.recovery_until` presente;
- bootstrap expira al finalizar la gracia;
- bootstrap devuelve sesión durante recuperación;
- `session_capability` presente;
- mutate expira al finalizar la gracia;
- `finish` finaliza correctamente una sesión recuperable;
- `save_batch` conserva límite `contado_at <= expira_at`;
- `recount_save_batch` conserva límite `contado_at <= expira_at`.

Validación sintética transaccional confirmada sin persistir datos:

- una sesión dentro de la gracia permanece `activo`;
- la sede continúa reservada por el índice único;
- `recovery_until = expira_at + 2 horas`;
- después de la gracia pasa a `expirado`;
- `finalizado_at` de expiración automática coincide con `recovery_until`.

No se dejaron filas sintéticas persistidas.

---

## 14. Alcance frontend obligatorio

Codex debe adaptar el frontend al contrato V8, sin modificar backend.

Debe como mínimo:

1. actualizar tipos de `CashierSession` con `recovery_until`;
2. añadir `session_capability` al bootstrap;
3. dejar de considerar `expira_at` como pérdida inmediata de la sesión;
4. usar `session_capability.capture_allowed` como autoridad de captura;
5. permitir flush durante `mode='recovery'`;
6. impedir nuevas capturas durante recuperación;
7. eliminar el auto-flush/auto-finish disparado por 20 minutos de inactividad;
8. permitir reactivación por interacción si `mode='active'` sigue vigente;
9. conservar drafts durante la transición active → recovery;
10. bloquear/limpiar únicamente al agotarse `recovery_until` o cuando backend devuelva expiración definitiva;
11. preservar idempotencia, replay y timestamps originales de los drafts.

---

## 15. Fuera de alcance V8

No modificar:

- Motor V3;
- fórmula de valorización;
- modelo de datos principal;
- persistencia local de drafts;
- Admin;
- Detalles;
- Index salvo tests compartidos estrictamente necesarios;
- Edge `conexion-admin`;
- S10;
- eliminación de `recount_start/recount_save`;
- nuevas tablas o estados de sesión.

---

## 16. Estado de documentación

- `SOLOG_Backend_Contratos_Optimizacion_Global_V8.md`: **VIGENTE / fuente primaria contractual**.
- `SOLOG_Backend_Contratos_Optimizacion_Global_V7.md`: **REEMPLAZADO para expiración/recuperación; vigente como herencia histórica en todo lo no sustituido por V8**.
- V6 e inferiores: históricos según la jerarquía previa.

---

## 17. Criterio de cierre

V8 backend está **desplegado y validado**.

El bloque completo no se cierra hasta que:

- frontend consuma V8;
- H1 quede corregido;
- H2 de Historial quede corregido;
- pruebas desactualizadas de G3 sean ajustadas;
- suite y browser afectados vuelvan a ejecutarse;
- smoke humano confirme recuperación de sesión y ausencia de autoenvío por inactividad.

**S10 continúa bloqueado hasta el cierre de G3.**
