# SOLOG — Backend Grupos — Contrato Técnico V1

**Estado:** CONGELADO  
**Proyecto:** SOLOG  
**Módulo:** Grupos  
**Nivel:** C — backend / lógica / integración con Motor  
**Fecha:** 2026-09-11  

## 1. Fuente funcional y precedencia

Fuente funcional primaria:

`SOLOG_Arquitectura_Grupos_Responsabilidad_Comportamiento_Funciones_V1.md`

Este documento congela el **contrato técnico desplegado** para implementar esa definición funcional.

Para Grupos V1, este archivo es la fuente primaria técnica.  
Los contratos legacy de `rpc_solog_admin_master_v2`, `group_change_save`, `update_package_price` y la pestaña administrativa `Productos` quedan como **compatibilidad transitoria** hasta la migración frontend y no definen el nuevo diseño.

El delta:

`SOLOG_Backend_Catalogo_Valorizado_Mascaras_Delta_V1.md`

prevalece únicamente sobre los puntos de Catálogo V3 que modifica expresamente. El resto de `SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md` continúa vigente.

---

## 2. Superficie pública congelada

### Lectura

```sql
public.rpc_solog_admin_groups_read_v1(
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
```

### Mutación

```sql
public.rpc_solog_admin_groups_v1(
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
```

`contract_version = 1`.

Roles permitidos:

- `admin`
- `moderador`

Permisos SQL públicos:

- `authenticated`: EXECUTE
- `service_role`: EXECUTE
- `anon`: sin EXECUTE
- `PUBLIC`: sin EXECUTE

Los helpers del schema `inventario` creados para Grupos V1 no son API cliente y tienen EXECUTE revocado para `PUBLIC`, `anon` y `authenticated`.

---

## 3. Concurrencia, idempotencia y revisión

Toda mutación pública requiere:

```json
{
  "operation_id": "uuid",
  "expected_groups_revision": 1,
  "expected_catalog_revision": 1
}
```

Reglas:

1. `operation_id` es obligatorio.
2. La idempotencia usa el scope:

```text
groups:v1:<action>
```

3. Todas las mutaciones adquieren el mismo advisory transaction lock del master data:

```text
(1397705807, 4702)
```

4. Se valida simultáneamente:

```text
expected_groups_revision
expected_catalog_revision
```

5. Si cualquiera difiere:

```text
SOLOG_MASTERDATA_REVISION_CONFLICT
```

6. Si el mismo `operation_id` y payload se repite, se devuelve la respuesta persistida con:

```json
"replay": true
```

---

## 4. Envelope de mutación

Respuesta estándar:

```json
{
  "contract_version": 1,
  "generated_at": "...",
  "replay": false,
  "result": {},
  "revisions": {
    "groups": 0,
    "catalog": 0
  }
}
```

Las revisiones devueltas son autoritativas y deben reemplazar las revisiones cacheadas por frontend.

---

# 5. Lecturas

## 5.1 `status`

```text
rpc_solog_admin_groups_read_v1('status', {})
```

Devuelve:

- `contract_version`
- `generated_at`
- conteos:
  - `groups_active`
  - `groups_unique`
  - `groups_grouped`
- revisiones:
  - `groups`
  - `catalog`

`Único` y `Agrupado` se derivan por cantidad de integrantes, no por una decisión manual.

---

## 5.2 `reference`

```text
rpc_solog_admin_groups_read_v1('reference', {})
```

Devuelve categorías activas:

```json
{
  "categories": [
    {
      "id": "uuid",
      "nombre": "...",
      "orden": 0
    }
  ]
}
```

y revisiones vigentes.

---

## 5.3 `groups`

Filtros soportados:

```json
{
  "buscar": "texto opcional",
  "categoria_id": "uuid opcional",
  "tipo": "Único | Agrupado opcional",
  "limit": 50,
  "offset": 0
}
```

- `limit` por defecto: `50`
- máximo: `100`

Cada fila incluye:

```text
id
nombre
categoria_id
categoria
precio
unidades_por_paquete
precio_paquete
tipo
member_count
```

Solo devuelve grupos activos con al menos un integrante incluido.

---

## 5.4 `group_detail`

Payload:

```json
{
  "grupo_id": "uuid"
}
```

Devuelve:

- definición del grupo;
- tipo derivado;
- valorizado;
- cantidad de integrantes;
- integrantes con:
  - `c_interno`
  - `producto`
  - `marca`
  - `precio`
  - `categoria_id`
  - `estado`

---

## 5.5 `products`

Esta lectura existe únicamente como **fuente de candidatos/selectores de composición**. No representa la antigua pestaña `Productos`.

Filtros:

```json
{
  "buscar": "texto opcional",
  "grupo_id": "uuid opcional",
  "exclude_group_id": "uuid opcional",
  "precio": 5.0,
  "limit": 50,
  "offset": 0
}
```

Solo devuelve productos:

```text
estado IN ('Único', 'Agrupado')
grupo activo
```

Nunca devuelve `Excluido`.

Cada fila incluye:

```text
c_interno
producto
marca
precio
categoria_id
categoria
estado
grupo_id
grupo
```

---

# 6. Mutaciones

Acciones congeladas:

```text
group_create
group_update
membership_move
make_unique
valuation_save
```

No existe una mutación genérica de clasificación `Único/Agrupado`.

---

## 6.1 `group_create`

Crea un grupo agrupado nuevo.

Payload funcional:

```json
{
  "operation_id": "uuid",
  "expected_groups_revision": 0,
  "expected_catalog_revision": 0,
  "nombre": "Máscara operativa",
  "categoria_id": "uuid",
  "member_codes": [20001, 20002]
}
```

Reglas:

- mínimo `2` SKU;
- `member_codes` no puede contener duplicados;
- categoría debe estar activa;
- todos los SKU deben existir y estar incluidos;
- todos deben tener exactamente el mismo precio unitario;
- el precio del grupo se deriva del catálogo; el cliente no lo envía;
- el cambio es atómico;
- los SKU adoptan la categoría del grupo;
- el estado final se normaliza automáticamente;
- si existe un grupo inactivo y vacío con el mismo nombre, puede reutilizarse;
- cuando se reutiliza para una nueva composición, su valorizado xN se limpia;
- ejecuta reconciliación con Motor para todos los grupos afectados.

Resultado principal:

```text
GROUP_CREATED
```

---

## 6.2 `group_update`

Modifica exclusivamente:

```text
nombre / máscara
categoría
```

Payload:

```json
{
  "operation_id": "uuid",
  "expected_groups_revision": 0,
  "expected_catalog_revision": 0,
  "grupo_id": "uuid",
  "nombre": "Máscara",
  "categoria_id": "uuid"
}
```

Reglas:

- no acepta precio unitario;
- no acepta composición;
- nombre debe ser no vacío y único;
- categoría debe estar activa;
- cambio de categoría se propaga a todos los SKU incluidos del grupo;
- nombre comercial de los SKU no cambia;
- un cambio solo de nombre/máscara no altera Motor;
- un cambio de categoría tampoco altera stock/composición ni fuerza `Cambio_reciente`;
- si el cambio de categoría entra en conflicto con staging estructural de Catálogo, se bloquea.

Resultado:

```text
GROUP_UPDATED
```

---

## 6.3 `membership_move`

Mueve uno o varios SKU a un grupo existente.

Payload:

```json
{
  "operation_id": "uuid",
  "expected_groups_revision": 0,
  "expected_catalog_revision": 0,
  "grupo_destino_id": "uuid",
  "member_codes": [20001, 20002]
}
```

Reglas:

- uno o más SKU;
- sin duplicados;
- destino activo;
- SKU incluidos;
- precio unitario de todos los SKU = precio del grupo destino;
- los SKU adoptan la categoría del grupo destino;
- movimiento múltiple atómico;
- normaliza grupos origen y destino;
- reconcilia Motor para todas las identidades de grupo afectadas, incluidas reactivaciones/reutilizaciones derivadas.

Resultado:

```text
GROUP_MEMBERS_MOVED
```

---

## 6.4 `make_unique`

Separa un SKU agrupado y lo deja como unidad de conteo independiente.

Payload:

```json
{
  "operation_id": "uuid",
  "expected_groups_revision": 0,
  "expected_catalog_revision": 0,
  "c_interno": 20001
}
```

Reglas:

- SKU debe estar incluido;
- si ya es `Único`, es NOOP;
- intenta reutilizar el grupo unitario histórico inactivo cuyo nombre coincide con el nombre comercial del producto;
- si no existe, crea una identidad temporal y la normalización asigna el nombre inicial del producto;
- si reutiliza un grupo histórico:
  - conserva valorizado solo si categoría y precio siguen siendo compatibles;
  - en caso contrario, limpia `unidades_por_paquete` y `precio_paquete`;
- normaliza grupo origen y grupo unitario;
- reconcilia Motor.

Resultado:

```text
PRODUCT_MADE_UNIQUE
```

---

## 6.5 `valuation_save`

Configura o elimina la valorización por paquete.

### Activar / actualizar

```json
{
  "operation_id": "uuid",
  "expected_groups_revision": 0,
  "expected_catalog_revision": 0,
  "grupo_id": "uuid",
  "enabled": true,
  "unidades_por_paquete": 6,
  "precio_paquete": 27.00
}
```

Validación:

```text
unidades_por_paquete > 1
precio_paquete > 0
```

### Desactivar

```json
{
  "operation_id": "uuid",
  "expected_groups_revision": 0,
  "expected_catalog_revision": 0,
  "grupo_id": "uuid",
  "enabled": false
}
```

Resultado persistido:

```text
unidades_por_paquete = NULL
precio_paquete = NULL
```

Reglas:

- aplicación inmediata;
- no cambia composición;
- no cambia precio unitario;
- no ejecuta reconciliación Motor;
- sesiones ya iniciadas conservan el valor congelado;
- se bloquea si existe una resolución de precio de Catálogo ya preparada que depende del mismo grupo.

Resultado:

```text
GROUP_VALUATION_SAVED
```

---

# 7. Normalización estructural V3

Helper interno:

```sql
inventario.solog_normalize_group_v3(p_group_id uuid)
```

Reglas:

```text
0 integrantes → grupo inactivo
1 integrante  → Único
2+ integrantes → Agrupado
```

## Singleton y reutilización

Cuando un grupo queda con un solo SKU:

1. si no existe otra identidad con el nombre comercial del SKU:
   - el grupo actual pasa a `Único`;
   - su nombre inicial se normaliza al nombre comercial.

2. si existe otra identidad con ese nombre y está activa:
   - error `SOLOG_GROUP_NAME_CONFLICT`.

3. si existe otra identidad inactiva y vacía:
   - se reactiva y reutiliza;
   - el SKU se mueve a esa identidad;
   - el grupo reemplazado queda inactivo;
   - el valorizado histórico solo se conserva si precio y categoría son compatibles.

Esta regla elimina la fragilidad histórica provocada por `grupos_conteo.nombre UNIQUE`.

---

# 8. Nombre comercial vs máscara operativa

Autoridades:

```text
inventario.catalogo.producto → nombre comercial
inventario.grupos_conteo.nombre → nombre/máscara operativa
```

Grupos puede editar la máscara sin modificar `catalogo.producto`.

La normalización de una nueva unidad de conteo usa inicialmente el nombre comercial, pero después el administrador puede sustituirlo por una máscara.

Catálogo V3 fue ajustado para preservar esta separación; ver:

`SOLOG_Backend_Catalogo_Valorizado_Mascaras_Delta_V1.md`

---

# 9. Bloqueo por staging de Catálogo

Helper interno:

```sql
inventario.solog_groups_staging_conflict_v1(
  p_mode text,
  p_group_ids uuid[],
  p_codes integer[]
)
```

Modos:

```text
structure
valuation
```

Se consideran bloqueantes las decisiones de Catálogo en estado `aprobado` que ya tienen preparación efectiva:

```text
_setup
_price_resolution
```

### Estructura

Bloquea cambios que invalidarían:

- configuración de alta/reincorporación;
- resolución preparada de precio;
- SKU o grupos dependientes de la preparación.

### Valorizado

Bloquea `valuation_save` cuando existe `_price_resolution` activa sobre el grupo.

Error:

```text
SOLOG_CATALOG_STAGING_CONFLICT
```

Una propuesta meramente `pendiente` o `ignorada` no activa este bloqueo.

---

# 10. Reconciliación con Motor

Helper interno:

```sql
inventario.solog_groups_refresh_operational_v1(p_group_ids uuid[])
```

Se ejecuta únicamente para cambios de composición.

## Efectos obligatorios

1. invalida `Recontar` pendiente incompatible:

```text
estado_diferencia = 'Inválido'
```

2. toma, por sede, el **último snapshot confirmado**;
3. recalcula el stock del grupo mediante:

```sql
inventario.solog_stock_grupo_snapshot(snapshot_id, grupo_id)
```

4. por tanto, la recomposición se calcula contra la observación autoritativa del mismo snapshot y no mezcla `stock_actual` de snapshots distintos;
5. si todos los integrantes tienen observación válida:
   - actualiza `stock_actual`;
   - `Cambio_reciente`;
   - `cobertura_periodo = false`;
   - `requiere_snapshot_completo = false`.

6. si el snapshot más reciente no contiene una observación válida de todos los integrantes:
   - `Cambio_reciente`;
   - `cobertura_periodo = false`;
   - `requiere_snapshot_completo = true`;
   - Cajero no puede consumir el grupo hasta una observación completa posterior.

7. grupo inactivo / vacío:
   - estado operativo `activo = false`;
   - cobertura false.

8. incrementa revisión operacional de las sedes activas.

---

# 11. Sesiones de Cajero

No se modifica la arquitectura de sesiones.

`solog_session_groups` continúa congelando, al inicio de una sesión:

```text
grupo
nombre
categoría
tipo
precio
unidades_por_paquete
precio_paquete
integrantes
stock_teorico
estado/cobertura
```

Por tanto:

- cambios administrativos posteriores no alteran una sesión iniciada;
- sesiones nuevas consumen el master vigente.

---

# 12. Errores de contrato relevantes

Lista no exhaustiva de códigos funcionales:

```text
SOLOG_AUTH_REQUIRED
SOLOG_USER_DISABLED
SOLOG_ADMIN_ROLE_REQUIRED
SOLOG_INVALID_PAYLOAD
SOLOG_INVALID_ACTION
SOLOG_INVALID_OPERATION
SOLOG_LOCK_CONFLICT_RETRYABLE
SOLOG_MASTERDATA_REVISION_CONFLICT

SOLOG_INVALID_GROUP_FILTER
SOLOG_INVALID_GROUP_TYPE
SOLOG_INVALID_GROUP
SOLOG_GROUP_NOT_FOUND
SOLOG_INVALID_PRODUCT_FILTER

SOLOG_INVALID_GROUP_CREATE
SOLOG_INVALID_GROUP_UPDATE
SOLOG_INVALID_MEMBERSHIP_MOVE
SOLOG_INVALID_PRODUCT
SOLOG_PRODUCT_NOT_FOUND
SOLOG_PRODUCT_NOT_AVAILABLE

SOLOG_CATEGORY_NOT_AVAILABLE
SOLOG_GROUP_PRICE_MISMATCH
SOLOG_GROUP_NOT_COMPATIBLE
SOLOG_GROUP_NAME_CONFLICT
SOLOG_GROUP_INVARIANT
SOLOG_GROUP_CHANGE_NOOP

SOLOG_INVALID_GROUP_VALUATION
SOLOG_GROUP_VALUATION_NOOP

SOLOG_CATALOG_STAGING_CONFLICT
```

Frontend debe tratar conflictos de revisión/lock como estados recuperables mediante refetch, no reinterpretarlos como validación de formulario.

---

# 13. Migrations desplegadas

Desplegadas en `fvtohxvcvsflzmftgfzs`:

```text
20260911121353_solog_groups_v1_backend
20260911121738_solog_groups_v1_normalize_v3
20260911121827_solog_groups_v1_use_normalize_v3
20260911122800_solog_groups_v1_authoritative_snapshot_refresh
```

Dependencias Catálogo desplegadas:

```text
solog_catalog_price_valuation_prepare_v1
solog_catalog_price_valuation_preview_v1
solog_catalog_preserve_group_masks_v1
```

---

# 14. Evidencia de validación backend

Las pruebas sintéticas se ejecutaron dentro de transacciones con `ROLLBACK`; no dejaron datos de prueba.

Validado:

- creación con 2 SKU;
- movimiento múltiple;
- cambio de categoría;
- normalización a `Único`;
- reutilización de grupo unitario inactivo;
- máscara operativa;
- valorizado set;
- valorizado clear;
- incompatibilidad de precio rechazada;
- bloqueo por staging Catálogo;
- idempotencia/replay;
- conflicto de revisión;
- recálculo Motor contra snapshot confirmado completo;
- gate cuando el snapshot confirmado más reciente es incompleto;
- Catálogo `prepare_price` con set/clear xN;
- precio agrupado + valorizado;
- separación + valorizado;
- preservación de máscara en preview/publicación;
- sincronización automática del nombre cuando no existe máscara;
- publicación Catálogo sintética end-to-end con rollback.

Resultado de los bloques sintéticos ejecutados: **todos aprobados**.

---

# 15. Baseline de producción tras validación

Comprobado después de los rollbacks:

```text
inventario.catalogo total: 980
incluidos: 963
excluidos: 17

grupos total: 484
grupos activos: 483
grupos inactivos: 1

cambios_catalogo aprobados: 0
versión publicada: V6

groups_revision: 1
catalog_revision: 1

snapshots productivos: 0
estado_stock_grupo productivo: 0
```

No se publicó V7 durante las pruebas.

---

# 16. Estado del legacy

Durante la transición frontend siguen existiendo contratos V2 anteriores, entre ellos:

```text
rpc_solog_admin_master_v2
group_change_save
update_package_price
```

No deben utilizarse para nueva implementación de Grupos.

No se eliminan todavía porque el frontend productivo anterior puede seguir dependiendo de ellos. Su retirada corresponde a una fase posterior, una vez migrado y validado el frontend contra Grupos V1.

---

# 17. Contrato para Codex

El frontend nuevo debe consumir exclusivamente:

```text
public.rpc_solog_admin_groups_read_v1
public.rpc_solog_admin_groups_v1
```

para el módulo Grupos.

Codex no debe:

- modificar Supabase;
- reintroducir clasificación manual `Único/Agrupado`;
- reintroducir la pestaña administrativa `Productos`;
- usar `rpc_solog_admin_master_v2` para el nuevo flujo;
- modificar precio unitario desde Grupos;
- implementar reglas de normalización en cliente como fuente de verdad;
- duplicar la lógica de persistencia de Catálogo.

La UI debe tratar las respuestas/revisiones backend como autoritativas.
