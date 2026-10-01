# SOLOG — Integración — Cajero Frontend — Contrato V4 V1

**Estado:** CONGELADO — HANDOFF FRONTEND  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** B — migración funcional/estructural frontend  
**Rama:** `admin-work`

---

## 1. Fuentes y precedencia

### Fuente contractual primaria

`docs/SOLOG_Backend_Contrato_Cajero_V4.md`

Es la autoridad para:

- RPC;
- payloads;
- responses;
- estados;
- errores;
- colas;
- KPI;
- lifecycle;
- idempotencia;
- revisiones.

### Fuente funcional

`docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`

### Este documento

Este archivo es un **handoff frontend**. No redefine backend.

Precedencia:

1. `SOLOG_Backend_Contrato_Cajero_V4.md`;
2. `SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`;
3. este archivo;
4. frontend Cajero V3 actual como baseline de código, no como contrato;
5. documentación V1/V3 anterior cuando contradiga las fuentes anteriores → histórica.

---

## 2. Objetivo

Migrar Cajero desde el contrato frontend V3 eliminado al contrato V4 desplegado, preservando la UX/composición actual siempre que siga siendo compatible.

No se realiza un rediseño visual general.

El cambio debe:

- eliminar dependencias frontend de V2/V3 retiradas;
- adoptar el contrato V4 de forma estricta;
- utilizar `next_action` como autoridad de prioridad;
- soportar ronda 1 / ronda 2;
- soportar sesión `recovery`;
- conservar drafts, retries e idempotencia;
- mantener Historial V2 y Routing V2;
- dejar tests V3 obsoletos sustituidos por tests V4.

---

## 3. Baseline remoto inspeccionado

HEAD previo a este handoff:

`549c5e8c3eb7c6e4bbe30049a71b6d1bcde45b39`

Runtime frontend actual:

```text
cajero.v3.ts
cajero.v3.api.ts
cajero.v3.store.ts
cajero.v3.context.tsx
cajero.v3.panel.ts
```

La aplicación productiva de Cajero todavía importa estos módulos.

RPC actuales codificadas en frontend:

```text
rpc_solog_cashier_bootstrap_v3
rpc_solog_cashier_mutate_v3
```

Ambas RPC ya fueron eliminadas del backend.

---

## 4. Estado de infraestructura para desarrollo

Confirmado por el usuario:

- Cloudflare Automatic Deployments: desactivado manualmente.

Estado Supabase para prueba local:

- Cajero Cutervo: `activo=true`;
- resto de Cajeros: `activo=false`;
- Admin: `activo=false`;
- Moderador: `activo=false`;
- sesiones `activo`: 0;
- sesiones `recovery`: 0.

Cutervo conserva un dispositivo autorizado.

Casuarinas se reservará para el smoke posterior de cobertura; no se reactiva todavía.

---

## 5. Cambio limpio V3 → V4

La migración frontend debe ser limpia.

No conservar aliases de runtime V3 como compatibilidad permanente.

Objetivo nominal:

```text
CashierV3*  → CashierV4*
cajero.v3.* → cajero.v4.*
```

Los archivos V3 deben eliminarse/renombrarse cuando sus consumidores hayan migrado.

No crear una capa V4 que internamente siga parseando V3.

---

## 6. Delta del wire contract

### Bootstrap

```text
contract_version 3 → 4
bootstrap_v3       → bootstrap_v4
mutate_v3          → mutate_v4
```

### Basis V4 añade

```text
ronda
ronda_desde
ronda_hasta
turno
turno_desde
turno_hasta
```

El basis está en:

`panel_state.basis`

No está duplicado dentro de `panel_state.session`.

### Session

Añadir:

`recovery`

Estados:

```text
activo
recovery
finalizado
expirado
```

### Grupos

Eliminar assumptions V3:

```text
cobertura_periodo
requiere_conteo
requiere_reconteo
estado_stock
```

Adoptar:

```text
accion = recount | coverage | daily | none
```

### Colas

Eliminar:

`count_queue`

Adoptar:

```text
review_queue
coverage_queue
daily_queue
```

### KPI

Eliminar assumptions:

```text
groups_total
count_pending
stock_types
```

Adoptar:

```text
coverage_round
coverage_total
coverage_counted
coverage_pending
coverage_percent
review_pending
coverage_queue_pending
daily_pending
coverage_blocked_waiting_snapshot
```

### Delta

Eliminar:

```text
count_queue_remove
review_queue_remove
```

El V4 devuelve autoritativamente:

```text
groups_patch
review_queue
coverage_queue
daily_queue
kpis
next_action
session_capability
```

El reducer reemplaza colas/KPI/next_action por el valor backend.

---

## 7. `groups_revision`

En V4 la revisión congelada pertenece a:

`panel_state.basis.groups_revision`

No usar:

`panel_state.session.groups_revision`

El scope local de drafts conserva:

```text
usuario_id
sede_id
dispositivo_id
conteo_id
groups_revision
```

Las mutaciones frontend deben enviar siempre:

`expected_groups_revision`

aunque el backend tolere su omisión.

---

## 8. Start

El response V4 de `start` contiene:

`conteo_id`

Debe validarse:

```text
response.conteo_id === response.panel_state.session.id
```

Después de iniciar, la navegación debe usar:

`response.panel_state.next_action`

No utilizar una decisión pre-session potencialmente obsoleta para escoger el módulo posterior al start.

---

## 9. Prioridad y navegación

Autoridad:

`next_action`

Mapping operacional:

| next_action | módulo |
|---|---|
| `review` | `/cajero/revisar` |
| `coverage` | `/cajero/conteo` |
| `daily` | `/cajero/diario` |
| `none` | permanecer en Inicio |

Eliminar como autoridad:

`periodComplete → decidir siguiente módulo`

### Navegación inferior

Preservar el patrón visual actual.

- Inicio: siempre disponible.
- Revisar: disponible cuando el backend expone trabajo `review`.
- Conteo: disponible cuando el backend expone trabajo `coverage`.
- Conteo diario: disponible cuando el backend expone trabajo `daily`.
- Historial: conservar la regla visual actual de habilitarlo cuando la cobertura de la ronda esté completa.

No permitir una ruta de captura que contradiga `next_action`.

---

## 10. Cobertura UI

Label obligatorio según backend:

```text
coverage_round = 1
→ Cobertura quincenal 1

coverage_round = 2
→ Cobertura quincenal 2
```

Home usa:

```text
coverage_counted / coverage_total
coverage_percent
```

No existe KPI Cajero combinado 0–200%.

---

## 11. Stock positivo / Stock 0 / Stock negativo

V4 no expone `stock_types` en `pre_session_summary`.

Por tanto:

### Antes de start

No inventar desglose por tipo de stock.

El Home puede mostrar la cobertura agregada de ronda y el CTA correspondiente, pero no debe reconstruir Stock 0/negativo sin dataset de sesión.

### Con sesión activa

El tipo se deriva localmente de:

`group.stock_teorico`

```text
> 0 → positive
= 0 → zero
< 0 → negative
```

El dataset de Conteo se obtiene exclusivamente de `coverage_queue`.

### Progreso por tipo/categoría

V4 no expone `coverage_complete` por grupo.

Por tanto no se debe seguir mostrando un `n/N contados` por tipo/categoría reconstruido con un booleano inexistente.

Mostrar el **número de pendientes** de la cola correspondiente.

El progreso agregado autoritativo permanece en el KPI de ronda del Home.

---

## 12. Conteo diario

Dataset:

`daily_queue`

No derivarlo desde:

- `count_queue`;
- `count_pending`;
- `periodComplete`.

Las categorías se derivan desde los grupos presentes en `daily_queue`.

El contador principal usa:

`kpis.daily_pending`

No reconstruir un total histórico de Conteo diario que el contrato V4 no expone.

---

## 13. Revisar

Dataset:

`review_queue`

Cada item mantiene:

- grupo_id;
- detalle_id;
- ultima_diferencia;
- contado_at.

La metadata visible se obtiene del grupo congelado correspondiente.

Revisar tiene prioridad sobre cobertura y diario.

No exigir cobertura completa para abrir Revisar.

---

## 14. Caso esperando snapshot posterior

Si:

```text
next_action = none
coverage_pending > 0
coverage_blocked_waiting_snapshot > 0
```

la UI debe presentar un estado informativo usando patrones existentes:

```text
hay grupos esperando una actualización de stock para poder continuar
```

No habilitar captura artificialmente.

No añadir polling de fondo.

---

## 15. Proyección local de cobertura

El backend es autoridad.

Se puede mantener la proyección visual de drafts normales únicamente cuando el grupo pertenece a:

`coverage_queue`

Un draft de reconteo no incrementa visualmente cobertura antes de ser confirmado.

Después de confirmar un reconteo, adoptar el KPI autoritativo recibido en `panel_delta`.

---

## 16. Recovery frontend

El frontend debe aceptar explícitamente:

```text
session_capability.mode = recovery
session.estado = recovery
```

Reglas:

- recovery nunca habilita nueva captura;
- sí permite envío de pendientes existentes;
- el reloj local solo puede **restringir**, nunca ampliar permisos backend;
- no regenerar UUID/timestamps de drafts durante retry;
- no reinterpretar `panel_state=null` como inexistencia de recoveries: revisar `recovery_sessions`.

### Orquestación conservadora

Si existe trabajo local pendiente de una sesión que entró a recovery:

- resolver/entregar ese trabajo antes de comenzar nueva captura local;
- conservar el scope original;
- no mover drafts a una nueva sesión.

Una sesión recovery sin trabajo local pendiente no bloquea el inicio de una nueva sesión active si backend lo permite.

No se requiere edición simultánea de drafts de múltiples sesiones en la UI.

---

## 17. Finish

El contrato V4 devuelve:

```text
status = finalizado
```

Después de confirmación:

- eliminar/adoptar runtime local correspondiente;
- sincronizar bootstrap;
- no volver a ejecutar finish si ya existe respuesta confirmada;
- mantener retry idempotente ante respuesta perdida.

---

## 18. Historial

Se conserva:

`rpc_solog_cashier_history_v2`

No migrarlo a V4.

Request:

```text
period = today | yesterday
```

El parser debe aceptar:

```text
Coincide
Recontar
Confirmada
Inconsistente
Inválido
```

Para evitar ampliar prematuramente tipos compartidos de Admin, `Inválido` puede modelarse localmente en Historial Cajero mientras Admin continúe fuera del bloque.

---

## 19. Errores

Actualizar el mapa frontend según:

`SOLOG_Backend_Contrato_Cajero_V4.md`

Priorizar:

```text
SOLOG_DEVICE_UNAUTHORIZED
SOLOG_CONFIRMED_SNAPSHOT_INCOMPLETE
SOLOG_SESSION_DELIVERY_NOT_ALLOWED
SOLOG_SESSION_PRIORITY_CONFLICT
SOLOG_GROUP_ALREADY_COUNTED
SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT
SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT
SOLOG_IDEMPOTENCY_CONFLICT
SOLOG_OPERATION_IN_PROGRESS
```

No mantener mensajes de errores V2/V3 que ya no sean alcanzables solo para compatibilidad de Cajero.

No modificar errores de otros módulos fuera de este bloque.

---

## 20. Drafts e idempotencia

Conservar los invariantes ya correctos:

- batch máximo 500;
- `operation_id` por operación;
- retry conserva `operation_id`;
- retry conserva payload;
- `client_observation_id` estable;
- `contado_at` / `recontado_at` estable;
- drafts normales y reconteos separados;
- un response incierto no elimina drafts;
- solo una confirmación autoritativa elimina el draft correspondiente.

La versión de storage no debe cambiar si su shape sigue siendo compatible.

Si Codex demuestra incompatibilidad real del shape, debe proponer la migración mínima y no purgar datos silenciosamente.

---

## 21. Archivos de impacto mínimo esperado

El preflight actual identifica como núcleo:

```text
src/features/solog/cajero/cajero.v3.ts
src/features/solog/cajero/cajero.v3.api.ts
src/features/solog/cajero/cajero.v3.store.ts
src/features/solog/cajero/cajero.v3.context.tsx
src/features/solog/cajero/cajero.v3.panel.ts
src/features/solog/cajero/cajero.app.tsx
src/features/solog/cajero/cajero.session.ts
src/features/solog/cajero/cajero.flush.ts
src/features/solog/cajero/cajero.types.ts
src/features/solog/cajero/cajero.progress.ts
src/features/solog/cajero/cajero.capability.ts
src/features/solog/cajero/cajero.inicio.tsx
src/features/solog/cajero/cajero.conteo.tsx
src/features/solog/cajero/cajero.diario.tsx
src/features/solog/cajero/cajero.revisar.tsx
src/features/solog/cajero/cajero.header.tsx
src/features/solog/cajero/cajero.tsx
src/features/solog/cajero/cajero.history.ts
src/features/solog/errors.ts
```

El inventario definitivo corresponde a Codex después de establecer baseline local.

---

## 22. Tests

Los tests contractuales V3 actuales son obsoletos como fuente de verdad.

Codex debe:

- identificar los tests que validan contrato V3;
- sustituir fixtures/expectativas por V4;
- conservar tests de UX/lógica que sigan siendo válidos;
- actualizar tests frágiles solo cuando contradigan el contrato congelado;
- añadir cobertura para:
  - parser V4;
  - R1/R2;
  - `next_action`;
  - tres colas;
  - panel delta;
  - recovery;
  - start con `conteo_id`;
  - priority;
  - history con `Inválido`;
  - retry/idempotencia;
  - rutas.

No eliminar cobertura útil para hacer pasar la suite.

---

## 23. Fuera de alcance

- Backend/Supabase.
- Admin.
- Cloudflare.
- rediseño visual general;
- refactor global de SOLOG;
- cambios de Design System no necesarios;
- cambios de contratos Route V2 / History V2;
- nuevas funcionalidades de Cajero ajenas a esta migración.

---

## 24. Reglas para Codex

Codex debe:

1. inspeccionar el repo real local;
2. registrar branch, HEAD y `git status`;
3. preservar cambios preexistentes;
4. ejecutar baseline técnico;
5. comparar código real con este handoff y el contrato V4;
6. devolver un plan por fases;
7. no implementar todavía;
8. no modificar backend, migraciones SQL ni Supabase;
9. no realizar refactors generales;
10. reportar bloqueos/contradicciones en vez de rediseñar.

La implementación comienza únicamente después de aprobación explícita del plan.