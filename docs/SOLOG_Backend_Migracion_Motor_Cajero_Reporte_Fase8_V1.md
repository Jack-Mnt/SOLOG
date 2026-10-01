# SOLOG — Backend — Migración Motor Cajero — Reporte Fase 8 V1

**Estado:** VALIDADO TÉCNICAMENTE — CHECKPOINT  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C  
**Fuente primaria:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Plan:** `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 1. Objetivo

Exponer el nuevo contrato público Cajero V4 sobre el Motor ya desplegado:

- bootstrap;
- start;
- save_batch;
- recount_save_batch;
- finish;
- idempotencia;
- panel y deltas autoritativos;
- recovery;
- prioridad backend;
- runtime nuevo.

El contrato aún no se considera congelado documentalmente; la congelación contractual final corresponde a la Fase 11, después de validación global y limpieza legacy.

## 2. RPC públicas V4

Creadas:

```text
public.rpc_solog_cashier_bootstrap_v4(p_payload jsonb)
public.rpc_solog_cashier_mutate_v4(p_action text, p_payload jsonb)
```

Ambas:

- `SECURITY DEFINER`;
- propietario `postgres`;
- validan `auth.uid()`;
- validan usuario SOLOG activo;
- exigen rol `cajero`;
- validan sede;
- validan dispositivo autorizado;
- no exponen el token en el hash de idempotencia.

ACL:

```text
anon          → EXECUTE false
PUBLIC        → EXECUTE false
authenticated → EXECUTE true
```

## 3. Bootstrap V4

`rpc_solog_cashier_bootstrap_v4` entrega:

- `contract_version = 4`;
- server/generated time;
- identity;
- site;
- device;
- revisions;
- stock vigente;
- `start_capability`;
- `session_capability`;
- recoveries propios;
- `pre_session_summary`;
- `panel_state` si existe sesión activa propia.

Antes de decidir estado de sesión ejecuta normalización V4.

### Start capability

Bloquea inicio cuando corresponda:

- dispositivo no autorizado;
- ya existe una active en la sede;
- no existe snapshot confirmado;
- stock expirado;
- stock demasiado próximo a expirar;
- ventana de sesión cerrada;
- no existe universo operacional disponible.

## 4. Panel V4

Creada:

`inventario.solog_cashier_panel_state_v4(...)`

Expone:

### Session

- id;
- sede;
- usuario;
- estado;
- iniciado_at;
- expira_at;
- recovery_until;
- finalizado_at.

### Basis congelado

- snapshot_referencia_id;
- version_catalogo;
- groups_revision;
- periodo_desde / periodo_hasta;
- ronda / ronda_desde / ronda_hasta;
- turno / turno_desde / turno_hasta.

### Dataset

- groups;
- review_queue;
- coverage_queue;
- daily_queue;
- KPI;
- next_action;
- session_capability.

La prioridad de una sesión se deriva de su runtime congelado:

```text
review
→ coverage
→ waiting snapshot = none
→ daily
→ none
```

Nuevas incidencias o grupos posteriores al `start` no se inyectan en la sesión activa.

## 5. Delta V4

Creada:

`inventario.solog_cashier_panel_delta_v4(...)`

Después de mutaciones devuelve:

- `groups_patch`;
- review_queue;
- coverage_queue;
- daily_queue;
- KPI;
- next_action;
- session_capability.

No requiere devolver el panel completo después de cada batch.

## 6. Start V4

`rpc_solog_cashier_mutate_v4('start', ...)`:

1. valida usuario/dispositivo/sede;
2. aplica idempotencia `cashier_v4:start`;
3. normaliza sesiones;
4. exige ausencia de otra active en la sede;
5. congela snapshot confirmado vigente;
6. valida vigencia de stock;
7. congela período/ronda/turno;
8. congela `groups_revision`;
9. crea `inventario.conteos`;
10. crea `inventario.solog_session_runtime_groups`;
11. asigna por grupo exactamente una acción:
   - recount;
   - coverage;
   - daily;
   - none;
12. devuelve `panel_state` V4.

Se valida que el runtime tenga exactamente el universo operacional esperado.

## 7. save_batch V4

Admite máximo 500 items.

Por item:

- exige `client_observation_id`;
- valida grupo y stock físico;
- usa `solog_validate_session_observation_v4`;
- acepta delivery en active o recovery;
- exige acción runtime `coverage` o `daily`;
- usa stock teórico congelado;
- crea `conteo_detalle`;
- `diferencia = 0 → Coincide`;
- `diferencia != 0 → Recontar`;
- registra snapshot posterior usable si ya existe;
- no auto-resuelve diferencias;
- consume la acción runtime;
- devuelve delta autoritativo.

El guard de Fase 6 impide dos conteos normales del mismo grupo/turno.

## 8. recount_save_batch V4

Admite máximo 500 items y rechaza detalles duplicados dentro del batch.

Exige:

- estado `Recontar`;
- primer snapshot posterior existente;
- sin stock_reconteo previo;
- sesión de reconteo distinta y posterior a la original;
- acción runtime `recount`;
- detalle de runtime coincidente.

Congela el teórico del reconteo desde la sesión actual.

Resolución:

```text
dr = 0
→ Coincide
→ diferencia final = 0

d0/dr mismo signo
→ Confirmada
→ menor magnitud absoluta

signos incompatibles
→ Inconsistente
→ diferencia final = dr
```

El trigger de observación física acredita cobertura sin modificar `ultimo_conteo_at`.

## 9. Finish V4

`finish` utiliza:

`inventario.solog_finish_session_v4(...)`

Permite cerrar:

- active;
- recovery.

Resultado:

```text
→ finalizado
→ runtime eliminado
→ capability none
```

## 10. Idempotencia

Scope nuevo:

```text
cashier_v4:start
cashier_v4:save_batch
cashier_v4:recount_save_batch
cashier_v4:finish
```

Reglas preservadas:

- mismo operation_id + mismo payload → replay;
- mismo operation_id + payload distinto → `SOLOG_IDEMPOTENCY_CONFLICT`;
- replay no duplica observaciones.

## 11. Prioridad backend

Creada defensa adicional:

`inventario.solog_enforce_runtime_priority_v4()`

Triggers:

- insert normal;
- resolución de reconteo.

Esto impide saltar la prioridad desde un cliente modificado.

Ejemplo validado en Cutervo:

```text
next_action = review

intento save_batch sobre coverage
→ SOLOG_SESSION_PRIORITY_CONFLICT
```

Por tanto la prioridad no depende únicamente del frontend.

## 12. Validaciones end-to-end

Todas las pruebas con datos sintéticos/temporales finalizaron en `ROLLBACK`.

### 12.1. Cutervo

Se creó temporalmente:

- usuario habilitado;
- dispositivo autorizado sintético;
- snapshot sintético completo basado en stock actual.

Resultado:

```text
bootstrap_v4        → OK
start_v4            → OK
runtime groups      → 488
next_action         → review
start replay        → OK
coverage bypass     → bloqueado
recount_save_batch  → OK
```

El reconteo redujo `review_pending` en 1 y resolvió correctamente a `Coincide` al usar físico = teórico de reconteo.

### 12.2. Casuarinas

Resultado:

```text
bootstrap           → coverage
start               → coverage
save_batch          → OK
save replay         → OK
detalle duplicado   → no
finish              → finalizado
runtime cleanup     → OK
```

El replay exacto devolvió `replay=true`.

Una prueba deliberada reutilizando el mismo operation_id con payload diferente produjo correctamente:

`SOLOG_IDEMPOTENCY_CONFLICT`.

### 12.3. Recovery público

Se construyó transaccionalmente una sesión V4 en recovery.

Se envió:

```text
observed_at < expira_at
delivery_at > expira_at
```

Resultado:

```text
save_batch                    → OK
session_capability.mode       → recovery
capture_allowed               → false
pending_delivery_allowed      → true
finish desde recovery         → OK
```

Rollback: OK.

## 13. Estado real posterior

Después de todas las pruebas:

- usuarios SOLOG activos: 0;
- sesiones active: 0;
- sesiones recovery: 0;
- sesiones finalizadas: 54;
- sesiones expiradas: 13;
- runtime V4: 0 filas;
- Recontar abiertos: 65;
- accionables: 58;
- esperando snapshot: 7;
- snapshots: 44;
- conteos: 67;
- conteo_detalle: 914;
- estado_stock_grupo: 976;
- solog_session_groups legacy: 32562.

No quedó ningún fixture persistente.

## 14. Advisors

Se ejecutaron advisors de seguridad y rendimiento después de la implementación.

No se surfacedaron hallazgos nuevos específicos atribuibles al contrato V4 en la respuesta de advisors.

## 15. Migración reproducible

El repositorio ya utiliza `supabase/migrations`.

En esta fase se iteró directamente contra el backend remoto para validar el contrato antes de congelarlo. No se genera todavía una migración parcial adicional porque las Fases 9 y 10 aún pueden modificar/eliminar objetos.

La migración reproducible consolidada deberá cerrarse junto con el backend definitivo antes de congelar el contrato de Fase 11.

## 16. Estado

Fase 8 cerrada técnicamente.

Siguiente fase:

**Fase 9 — Validación backend real/global.**
