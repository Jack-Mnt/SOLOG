# SOLOG — Backend Contratos Runtime Actual V1

**Estado:** CONGELADO / CONSOLIDADO DESDE RUNTIME  
**Proyecto:** SOLOG  
**Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`)  
**Fecha:** 2026-09-11  
**Nivel:** C — contrato backend/frontend consolidado  
**API base:** `contract_version = 2` para las superficies compartidas descritas aquí  
**Fuente primaria para el runtime compartido:** este documento

---

## 1. Propósito

Este documento consolida en una sola fuente el contrato backend/frontend que anteriormente estaba repartido entre:

```text
SOLOG_Backend_Contratos_Optimizacion_Global_V2.md
SOLOG_Backend_Contratos_Optimizacion_Global_V3.md
SOLOG_Backend_Contratos_Optimizacion_Global_V4.md
SOLOG_Backend_Contratos_Optimizacion_Global_V5.md
SOLOG_Backend_Contratos_Optimizacion_Global_V6.md
SOLOG_Backend_Contratos_Optimizacion_Global_V7.md
SOLOG_Backend_Contratos_Optimizacion_Global_V8.md
SOLOG_Backend_Contratos_Optimizacion_Global_V9.md
SOLOG_Backend_Contratos_Optimizacion_Global_V10.md
```

Este archivo se construyó contrastando:

- el runtime desplegado en Supabase;
- las funciones públicas actuales;
- grants reales;
- Edge Functions activas;
- contratos específicos posteriores ya congelados;
- el frontend actual del repositorio SOLOG.

Una vez incorporado al repositorio, **V2–V10 pueden archivarse fuera del repositorio** sin perder la cadena contractual vigente.

---

# 2. Prevalencia documental

Para runtime compartido:

1. `SOLOG_Backend_Contratos_Runtime_Actual_V1.md` — fuente primaria consolidada.
2. Contratos específicos de módulo posteriores — prevalecen dentro de su dominio:
   - `SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md`
   - `SOLOG_Backend_Catalogo_Valorizado_Mascaras_Delta_V1.md`
   - `SOLOG_Backend_Grupos_Contrato_Tecnico_V1.md`
   - `SOLOG_Backend_Incidencias_Contrato_Tecnico_V2.md`
3. Documentos funcionales congelados correspondientes.
4. V2–V10 — históricos una vez archivados.

Este documento **no reemplaza** los contratos específicos de Catálogo V3, Grupos V1 o Incidencias V2; los referencia como superficies vigentes independientes.

---

# 3. Principios globales del runtime

## 3.1 Autenticación

Las RPC públicas SOLOG usan:

```text
auth.uid()
```

como identidad autoritativa.

Errores comunes:

```text
SOLOG_AUTH_REQUIRED
SOLOG_USER_DISABLED
SOLOG_ROLE_NOT_ALLOWED
SOLOG_ADMIN_ROLE_REQUIRED
SOLOG_OPERATIONAL_ROLE_REQUIRED
```

No se debe confiar en identidad, rol, sede ni timestamps enviados libremente por cliente cuando el backend ya posee autoridad.

---

## 3.2 Envelopes

Las superficies compartidas V2 responden en general con:

```json
{
  "contract_version": 2,
  "generated_at": "...",
  "...": "..."
}
```

Las respuestas mutables pueden incluir además:

```text
replay
revisions
state
result
```

El frontend debe rechazar envelopes incompatibles.

---

## 3.3 Revisiones

Scopes vigentes:

```text
groups        global
catalog       global
categories    global
operational   por sede
devices       por sede
incidents     global y/o por sede según contrato
```

Las revisiones se obtienen mediante:

```text
inventario.solog_revision_get(...)
```

y son autoritativas.

Catálogo V3 y Grupos V1 utilizan además sus propias reglas contractuales específicas.

---

## 3.4 Idempotencia

Las mutaciones críticas utilizan:

```text
operation_id UUID
```

y ledger backend mediante:

```text
inventario.solog_operation_begin(...)
inventario.solog_operation_finish(...)
```

Regla general:

```text
mismo intento + mismo payload
→ conservar operation_id

nueva intención / payload reconstruido
→ nuevo operation_id
```

Una respuesta `replay:true` representa una operación previamente confirmada por backend.

---

## 3.5 Bloqueos

El master data de Catálogo/Grupos utiliza advisory transaction lock:

```text
(1397705807, 4702)
```

El error retryable vigente es:

```text
SOLOG_LOCK_CONFLICT_RETRYABLE
```

Un retry por lock/transporte conserva el mismo `operation_id` y payload exacto.

---

# 4. Enrutamiento

RPC vigente:

```sql
public.rpc_solog_route_v2(
  p_payload jsonb default '{}'
)
```

Roles:

```text
cajero      → /cajero
admin       → /admin
moderador   → /admin
```

Respuesta:

```json
{
  "contract_version": 2,
  "generated_at": "...",
  "identity": {
    "id": "uuid",
    "nombre": "...",
    "rol": "..."
  },
  "route": "/admin"
}
```

La portada `/` no necesita bootstrap operacional.

---

# 5. Bootstrap Admin

RPC:

```sql
public.rpc_solog_admin_bootstrap_v2(
  p_payload jsonb default '{}'
)
```

Roles:

```text
admin
moderador
```

Devuelve:

```text
identity
permissions
allowed_sites
revisions.groups
revisions.catalog
```

Por sede:

```text
id
nombre
operational_revision
devices_revision
incidents_revision
```

Este bootstrap debe mantenerse **ligero**.

No debe absorber datasets pesados solo para ahorrar número de RPC.

---

# 6. Cajero

## 6.1 Bootstrap

RPC:

```sql
public.rpc_solog_cashier_bootstrap_v2(
  p_payload jsonb default '{}'
)
```

Rol:

```text
cajero
```

Payload puede incluir:

```text
device_token
```

Devuelve como mínimo:

```text
identity
site
device
start_capability
session_capability
session_state
panel_state
revisions
server_now
```

El backend:

- valida usuario/sede/dispositivo;
- identifica último snapshot confirmado;
- determina expiración;
- detecta sesión activa o recovery;
- entrega panel pre-sesión o sesión congelada.

---

## 6.2 Sesión congelada

Al iniciar conteo se congelan por sesión:

```text
snapshot_referencia_id
version_catalogo
groups_revision
periodo_desde
periodo_hasta
grupos disponibles
nombre/categoría/tipo
precio
valorizado
SKU integrantes
stock teórico
estado operativo relevante
```

Cambios posteriores del master data no reinterpretan una sesión iniciada.

---

## 6.3 Mutaciones

RPC:

```sql
public.rpc_solog_cashier_mutate_v2(
  p_action text,
  p_payload jsonb
)
```

Acciones vigentes:

```text
start
save_batch
recount_save_batch
finish
```

Acciones legacy retiradas:

```text
recount_start
recount_save
```

---

## 6.4 `save_batch`

Reglas principales:

- máximo 500 items;
- `client_observation_id` UUID;
- `grupo_id`;
- `stock_fisico >= 0`;
- `contado_at` dentro de la sesión y no futuro inválido;
- grupo perteneciente a la sesión congelada;
- no permite guardar dos veces el mismo grupo;
- un grupo pendiente de reconteo no se guarda como conteo normal.

Estado inicial:

```text
diferencia = físico - teórico

0     → Coincide
!= 0  → Recontar
```

El backend puede resolver automáticamente mediante snapshot posterior cuando corresponda.

---

## 6.5 `recount_save_batch`

Reglas principales:

- solo diferencias realmente pendientes de reconteo;
- no permite reconteo en la misma sesión que originó el caso;
- usa el snapshot teórico de la sesión de reconteo;
- fija el snapshot de reconteo al guardar el batch.

Resultado:

```text
dr = físico_reconteo - teórico_reconteo

dr = 0
→ Coincide

mismo signo que diferencia inicial
→ Confirmada
→ conserva la diferencia de menor magnitud entre inicial y reconteo

signo distinto / incompatibilidad
→ Inconsistente
```

---

## 6.6 Recovery

Una sesión expirada mantiene una ventana de recuperación de entrega pendiente.

Durante recovery:

```text
capture_allowed = false
pending_delivery_allowed = true
```

Después del límite backend la sesión pasa a `expirado`.

---

## 6.7 Historial

RPC:

```sql
public.rpc_solog_cashier_history_v2(
  p_payload jsonb
)
```

Se utiliza para historial reciente bajo demanda del Cajero.

Zona operativa:

```text
America/Lima
```

---

# 7. Detalles

RPC:

```sql
public.rpc_solog_details_v2(
  p_action text,
  p_payload jsonb
)
```

Superficie V2 vigente para el módulo de detalle/consulta.

Acciones desplegadas:

```text
summary
request_access
history
detail
export
```

La UI debe mantener las lecturas bajo demanda y paginación/cursores según el contrato ya implementado.

No debe acceder directamente a tablas privadas de `inventario`.

---

# 8. Dashboard y datos operativos Admin

RPC:

```sql
public.rpc_solog_operational_v2(
  p_action text,
  p_payload jsonb
)
```

Roles:

```text
admin
moderador
```

Acciones activas usadas por el frontend:

```text
dashboard_cards
shift_grid
daily_detail
control_groups
control_chronology
```

Superficies legacy aún presentes en runtime pero candidatas a retiro:

```text
control_page
control_detail
```

No deben elegirse para nuevas implementaciones.

---

## 8.1 `dashboard_cards`

Devuelve por sede:

```text
period_coverage
daily_coverage
pending_recount
snapshot
operational_revision
```

### Cobertura quincenal

Usa estado operativo vigente.

### Cobertura diaria

Desde la migración:

```text
20260911155102_solog_dashboard_daily_coverage_frozen_universe_v1
```

usa el universo diario congelado de:

```text
solog_daily_coverage_base
solog_daily_coverage_groups
```

y queda alineada con el total diario de `shift_grid`.

### Datos live

Se mantienen live:

```text
pending_recount
último snapshot
```

---

## 8.2 `shift_grid`

Carga lazy por:

```text
sede
período
```

Períodos:

```text
current_biweekly
previous_biweekly
```

Usa:

```text
solog_daily_coverage_base
solog_daily_coverage_groups
solog_shift_coverage
```

Turnos históricos:

```text
early  → 00:00–07:30
day    → 07:30–15:30
night  → 15:30–24:00
```

Los denominadores diarios quedan congelados para evitar reinterpretación histórica si cambia Grupos.

---

## 8.3 Coverage Cron

Jobs existentes:

```text
solog_shift_early
solog_shift_day
solog_shift_night
```

Estado actual deliberado durante rebuild:

```text
active = false
```

Las tablas de coverage se limpiaron intencionalmente junto con snapshots/conteos de prueba.

No reconstruir historial eliminado.

Cuando se reanude operación real:

```text
primer snapshot válido
→ validar estado_stock_grupo
→ reactivar cuts
→ iniciar nueva historia de cobertura
```

---

## 8.4 `daily_detail`

Carga bajo demanda para un día/sede.

Devuelve datos de resultado normalizado incluyendo:

```text
theoretical
physical
difference
value
source
```

donde `source` puede reflejar:

```text
initial
posterior
recount
```

No se sustituye por Control porque la semántica y el detalle son diferentes.

---

# 9. Control — runtime vigente consolidado

La implementación vigente usa:

```text
control_groups
control_chronology
```

dentro de:

```text
rpc_solog_operational_v2
```

## 9.1 `control_groups`

Carga el dataset requerido para una sede/período.

La UI realiza localmente los filtros/orden/paginación visual aprobados donde corresponda.

## 9.2 `control_chronology`

Se solicita bajo demanda para un grupo.

No descargar cronologías masivas al abrir Control.

---

## 9.3 Exportación

RPC:

```sql
public.rpc_solog_control_export_v2(
  p_payload jsonb
)
```

Períodos soportados:

```text
current_biweekly
previous_biweekly
```

Devuelve datasets normalizados para:

```text
summary
adjustments
pending_recount
inconsistent
all
```

La valorización y fuente final del caso se resuelven en backend.

---

# 10. Incidencias

Contrato específico vigente:

```text
SOLOG_Backend_Incidencias_Contrato_Tecnico_V2.md
```

RPC pública:

```sql
public.rpc_solog_admin_incidents_v2(
  p_action text,
  p_payload jsonb
)
```

Acciones vigentes incluyen:

```text
summary
detail
ignore_30d
reactivate
propose_delete
```

`summary` se usa por ámbito; filtros Tipo/Estado se aplican en frontend.

`detail` se solicita bajo demanda.

Incidencias no publica ni elimina productos directamente.

---

# 11. Dispositivos

RPC:

```sql
public.rpc_solog_admin_devices_v2(
  p_action text,
  p_payload jsonb
)
```

Acciones vigentes:

```text
list
authorize
replace
revoke
reject
```

La UI obtiene una lista pequeña y deriva localmente:

```text
tablet autorizada por sede
solicitudes pendientes
```

No se requiere paginación ni polling.

---

# 12. Catálogo

Contrato específico vigente:

```text
SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md
SOLOG_Backend_Catalogo_Valorizado_Mascaras_Delta_V1.md
```

RPC:

```sql
public.rpc_solog_admin_catalog_read_v3(...)
public.rpc_solog_admin_catalog_v3(...)
```

`contract_version = 3`.

Este runtime consolidado no redefine sus payloads.

---

# 13. Grupos

Contrato específico vigente:

```text
SOLOG_Backend_Grupos_Contrato_Tecnico_V1.md
```

RPC:

```sql
public.rpc_solog_admin_groups_read_v1(...)
public.rpc_solog_admin_groups_v1(...)
```

`contract_version = 1`.

Este runtime consolidado no redefine sus mutaciones.

Para nuevas implementaciones frontend, las lecturas principales de Grupos quedan parcialmente sustituidas por `SOLOG_Backend_Admin_MasterData_Contrato_Tecnico_V1.md` cuando el dato ya esté incluido o sea derivable desde su `bootstrap`. Las mutaciones de Grupos V1 no cambian salvo delta explícito.

---


# 14. Master Data compartido Admin V1

Contrato específico vigente:

```text
SOLOG_Backend_Admin_MasterData_Contrato_Tecnico_V1.md
```

Migraciones:

```text
20260911161324_solog_admin_shared_masterdata_v1
20260911161430_solog_admin_shared_masterdata_v1_compact_payload
```

RPC:

```sql
public.rpc_solog_admin_masterdata_read_v1(...)
public.rpc_solog_admin_masterdata_v1(...)
```

`contract_version = 1`.

Lectura principal:

```text
bootstrap
```

Devuelve en una sola respuesta normalizada:

```text
categories
groups
products
setup_required
totals
revisions.groups
revisions.catalog
revisions.categories
```

Baseline validado:

```text
24 categorías
483 grupos
980 productos
347,722 bytes JSON sin compresión
```

Mutaciones de Categorías:

```text
category_create
category_rename
category_reorder
```

No existen en V1:

```text
delete
activate/deactivate
merge
```

Este contrato es la fuente técnica del master data utilizado por la caché compartida de Productos, Grupos, Categorías y referencias de Catálogo definida en `SOLOG_Arquitectura_Admin_MasterData_Cache_Rutas_V1.md`.

---

# 15. Master V2 legacy

Persisten en runtime:

```sql
public.rpc_solog_admin_master_read_v2(...)
public.rpc_solog_admin_master_v2(...)
```

Acciones históricas incluyen:

```text
status
reference
groups
group_products
catalog_changes
publication_preview
price_mismatch_options
group_change_save
catalog_change_action
resolve_group_price
update_package_price
```

Estas superficies **no son fuente primaria para nuevas implementaciones de Catálogo o Grupos**.

Catálogo ya migró a V3.

Grupos ya migró a V1.

Deben conservarse únicamente mientras exista algún consumidor real restante y retirarse tras auditoría dirigida.

---

# 16. Publicación Catálogo

Edge Function activa:

```text
conexion-admin
version = 6
verify_jwt = true
```

Acción pública esperada:

```json
{
  "action": "publish_catalog",
  "operation_id": "uuid"
}
```

Solo rol:

```text
admin
```

Backend interno de publicación:

```sql
rpc_solog_catalog_publication_v2
rpc_solog_catalog_publication_artifact_v6
```

Estas RPC son `service_role` y no API cliente directa.

La Edge:

1. valida JWT y rol admin;
2. inicia/reanuda operación;
3. obtiene preview/artefacto estable;
4. genera artefacto schema 2;
5. publica en Storage;
6. registra commit/finish;
7. soporta replay/recuperación mediante el mismo `operation_id`.

---

# 17. Seguridad SQL

Las RPC públicas de aplicación vigentes conceden `EXECUTE` a:

```text
authenticated
service_role
```

y no a:

```text
anon
PUBLIC
```

Las superficies internas sensibles de publicación son `service_role`.

Las tablas privadas de `inventario` no deben exponerse como fuente directa del frontend.

---

# 18. Estrategia de lectura vigente por módulo

```text
Route
→ una lectura mínima

Admin bootstrap
→ una lectura mínima

Dashboard
→ cards agregadas
→ shift_grid lazy
→ daily_detail lazy

Control
→ dataset por período
→ chronology lazy

Incidencias
→ summary por ámbito
→ detail lazy

Dispositivos
→ list completa pequeña

Catálogo
→ propuestas lazy por estado
→ preview bajo demanda
→ publicación explícita

Cajero
→ bootstrap autoritativo
→ mutaciones batch
→ history bajo demanda
```

No consolidar módulos operativos distintos únicamente para reducir número de RPC.

---

# 19. Documentación reemplazada

Una vez este documento esté incorporado como fuente vigente, pueden archivarse fuera del repositorio:

```text
SOLOG_Backend_Contratos_Optimizacion_Global_V2.md
SOLOG_Backend_Contratos_Optimizacion_Global_V3.md
SOLOG_Backend_Contratos_Optimizacion_Global_V4.md
SOLOG_Backend_Contratos_Optimizacion_Global_V5.md
SOLOG_Backend_Contratos_Optimizacion_Global_V6.md
SOLOG_Backend_Contratos_Optimizacion_Global_V7.md
SOLOG_Backend_Contratos_Optimizacion_Global_V8.md
SOLOG_Backend_Contratos_Optimizacion_Global_V9.md
SOLOG_Backend_Contratos_Optimizacion_Global_V10.md
```

Los documentos específicos posteriores de Catálogo, Grupos e Incidencias permanecen en el repositorio.

---

# 20. Estado final

Este documento consolida el runtime compartido actual y elimina la necesidad de que Codex reconstruya una cadena V2→V10 para saber qué está vigente.

Cualquier cambio posterior debe documentarse como:

- delta específico de módulo; o
- nueva versión consolidada si modifica transversalmente el runtime.
