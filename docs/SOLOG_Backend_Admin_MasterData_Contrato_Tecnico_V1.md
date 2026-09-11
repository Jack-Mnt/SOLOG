# SOLOG — Backend Admin Master Data — Contrato Técnico V1

**Estado:** CONGELADO / DESPLEGADO / VALIDADO  
**Proyecto:** SOLOG  
**Módulo:** Admin — Productos / Grupos / Categorías / referencias Catálogo  
**Nivel:** C — backend / contrato / caché compartida  
**Fecha:** 2026-09-11  
**Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`)  
**Contrato:** `contract_version = 1`

## 1. Autoridad y precedencia

Fuente funcional/arquitectónica primaria:

`SOLOG_Arquitectura_Admin_MasterData_Cache_Rutas_V1.md`

Fuente runtime compartida:

`SOLOG_Backend_Contratos_Runtime_Actual_V1.md`

Este documento es la **fuente primaria técnica** para el nuevo master data compartido de Admin.

No reemplaza las mutaciones específicas de:

- Catálogo V3;
- Grupos V1;
- Incidencias V2.

Sí reemplaza, para las nuevas lecturas compartidas, la necesidad de consumir como fuente principal:

- `rpc_solog_admin_catalog_read_v3('products')`;
- `rpc_solog_admin_catalog_read_v3('reference')`;
- `rpc_solog_admin_groups_read_v1('reference')`;
- `rpc_solog_admin_groups_read_v1('groups')`;
- `rpc_solog_admin_groups_read_v1('group_detail')`;
- `rpc_solog_admin_groups_read_v1('products')`;

cuando el dato requerido ya esté incluido o sea derivable desde el bootstrap compartido.

Las superficies anteriores permanecen desplegadas por compatibilidad hasta una limpieza posterior.

---

# 2. Migraciones desplegadas

```text
20260911161324_solog_admin_shared_masterdata_v1
20260911161430_solog_admin_shared_masterdata_v1_compact_payload
```

---

# 3. Superficies públicas

## 3.1 Lectura

```sql
public.rpc_solog_admin_masterdata_read_v1(
  p_action text,
  p_payload jsonb default '{}'
) returns jsonb
```

Acción V1:

```text
bootstrap
```

## 3.2 Mutación

```sql
public.rpc_solog_admin_masterdata_v1(
  p_action text,
  p_payload jsonb default '{}'
) returns jsonb
```

Acciones V1:

```text
category_create
category_rename
category_reorder
```

---

# 4. Autorización

Roles permitidos:

```text
admin
moderador
```

Errores:

```text
SOLOG_AUTH_REQUIRED
SOLOG_USER_DISABLED
SOLOG_ADMIN_ROLE_REQUIRED
```

Permisos SQL públicos verificados:

```text
authenticated → EXECUTE
service_role  → EXECUTE
anon          → sin EXECUTE
PUBLIC        → sin EXECUTE
```

Los helpers `inventario.*` creados para este contrato no son API frontend.

---

# 5. Revisión de Categorías

Se introduce scope:

```text
categories
```

mediante:

```text
inventario.solog_revision_get('categories', null)
inventario.solog_revision_bump('categories', null)
```

Estado inicial desplegado:

```text
categories_revision = 1
```

Las revisiones de:

```text
groups
catalog
```

no cambian por crear, renombrar o reordenar una categoría.

Esto evita conflictos innecesarios con Grupos/Catálogo porque las operaciones V1 de Categorías no eliminan IDs ni cambian la asignación de productos/grupos.

---

# 6. Protección de escritura

La tabla:

```text
inventario.categorias
```

queda protegida por el mismo advisory transaction lock del master data:

```text
(1397705807, 4702)
```

Trigger:

```text
trg_solog_master_lock_categories_v1
```

El conflicto retryable es:

```text
SOLOG_LOCK_CONFLICT_RETRYABLE
```

También existe trigger statement-level de revisión:

```text
trg_solog_categories_revision_v1
```

Cada statement real de `INSERT`, `UPDATE` o `DELETE` sobre categorías incrementa `categories_revision`.

---

# 7. Unicidad de nombre

Además del `UNIQUE(nombre)` existente, se desplegó:

```text
idx_solog_categories_name_normalized_unique
```

sobre:

```sql
lower(btrim(nombre))
```

Por tanto se rechazan duplicados equivalentes como:

```text
Agua
agua
 AGUA
```

Código contractual:

```text
SOLOG_CATEGORY_NAME_CONFLICT
```

---

# 8. `bootstrap`

Llamada:

```text
rpc_solog_admin_masterdata_read_v1('bootstrap', {})
```

Respuesta:

```json
{
  "contract_version": 1,
  "generated_at": "...",
  "complete": true,
  "categories": [],
  "groups": [],
  "products": [],
  "setup_required": [],
  "totals": {
    "categories": 24,
    "groups": 483,
    "products": 980,
    "included": 963,
    "excluded": 17
  },
  "revisions": {
    "groups": 3,
    "catalog": 2,
    "categories": 1
  }
}
```

Los números anteriores corresponden al baseline validado el 2026-09-11 y no forman parte rígida del contrato.

---

# 9. `categories[]`

Solo devuelve categorías actualmente disponibles (`activo=true`).

Orden:

```text
orden
nombre
id
```

Forma:

```json
{
  "id": "uuid",
  "nombre": "Agua",
  "orden": 0
}
```

El campo legacy:

```text
activo
```

no se expone ni se administra desde V1.

---

# 10. `groups[]`

Devuelve grupos:

```text
activo = true
con al menos un SKU incluido
```

Forma compacta:

```json
{
  "id": "uuid",
  "nombre": "Cielo 625ml",
  "categoria_id": "uuid",
  "precio": 1.20,
  "unidades_por_paquete": null,
  "precio_paquete": null
}
```

No duplica:

```text
nombre de categoría
integrantes
tipo Único/Agrupado
member_count
```

Esos valores se derivan localmente desde `categories[]` y `products[]`.

---

# 11. `products[]`

Incluye **todo el catálogo administrativo**, incluidos SKU excluidos.

Forma:

```json
{
  "c_interno": 20001,
  "producto": "...",
  "c_barras": "...",
  "marca": "...",
  "precio": 5.0,
  "estado": "Único",
  "categoria_id": "uuid",
  "grupo_id": "uuid"
}
```

`estado` puede ser:

```text
Único
Agrupado
Excluido
```

Para `Excluido`:

```text
grupo_id
```

puede omitirse por compactación JSON.

También pueden omitirse campos nullable como:

```text
c_barras
marca
```

cuando sean `null`.

---

## 11.1 Propuesta de ciclo de vida

Si existe una propuesta activa relevante:

```text
excluir_producto
reincorporar_producto
eliminar_producto
```

el producto añade:

```json
{
  "propuesta": {
    "tipo": "excluir_producto",
    "estado": "pendiente",
    "fingerprint": "..."
  }
}
```

Si no existe propuesta, la clave `propuesta` se omite.

Esto evita repetir `null` en cientos de filas.

---

# 12. `setup_required[]`

Se conserva la información necesaria para que la futura ruta Productos no pierda la capacidad de mostrar configuraciones pendientes de:

```text
agregar_producto
reincorporar_producto
```

Forma:

```text
cambio_id
propuesta_fingerprint
tipo
c_interno
producto
precio
block_reason
```

La configuración real continúa realizándose mediante Catálogo V3.

Master Data no crea una nueva mutación para onboarding.

---

# 13. Relaciones derivadas frontend

El frontend debe construir índices locales.

Ejemplos:

```text
categoryById
groupById
productsByGroupId
```

Categoría de producto/grupo:

```text
categoria_id → categories[]
```

Nombre de grupo:

```text
grupo_id → groups[]
```

Integrantes:

```text
products.filter(product.grupo_id === group.id)
```

Tipo derivado:

```text
1 integrante  → Único
2+            → Agrupado
```

Estado administrativo de producto:

```text
estado === Excluido → excluido
otro                → incluido
```

No requiere una nueva RPC.

---

# 14. Tamaño validado

Respuesta actual compacta:

```text
347,722 bytes JSON sin compresión
```

Baseline anterior medido:

```text
Catálogo products   ≈ 408,570 bytes
Catálogo reference  ≈ 114,389 bytes
Grupos pages        ≈ 13–14 KB por página/consulta
```

El nuevo bootstrap es aproximadamente **15 % menor que la antigua lectura Productos por sí sola**, y además sustituye la descarga redundante de referencias y las lecturas repetidas principales de Grupos.

---

# 15. `category_create`

Payload:

```json
{
  "operation_id": "uuid",
  "expected_categories_revision": 1,
  "nombre": "Nueva categoría"
}
```

Reglas:

- nombre obligatorio después de `trim`;
- unicidad case-insensitive;
- `activo=true`;
- `orden = max(orden activo) + 1`;
- no requiere activación posterior.

Respuesta:

```json
{
  "contract_version": 1,
  "generated_at": "...",
  "replay": false,
  "result": {
    "ok": true,
    "codigo": "CATEGORY_CREATED",
    "category": {
      "id": "uuid",
      "nombre": "...",
      "orden": 24
    }
  },
  "revisions": {
    "groups": 3,
    "catalog": 2,
    "categories": 2
  }
}
```

---

# 16. `category_rename`

Payload:

```json
{
  "operation_id": "uuid",
  "expected_categories_revision": 2,
  "category_id": "uuid",
  "nombre": "Nuevo nombre"
}
```

Reglas:

- categoría debe existir y estar disponible;
- nombre no vacío;
- duplicado normalizado rechazado;
- cambiar únicamente mayúsculas/minúsculas es válido;
- nombre exactamente igual es NOOP;
- no modifica IDs;
- no reescribe históricos congelados.

Éxito:

```text
CATEGORY_RENAMED
```

---

# 17. `category_reorder`

Payload:

```json
{
  "operation_id": "uuid",
  "expected_categories_revision": 3,
  "category_ids": [
    "uuid-1",
    "uuid-2",
    "uuid-3"
  ]
}
```

`category_ids` debe contener:

- todos los IDs disponibles;
- una sola vez cada uno;
- ningún ID desconocido.

El backend asigna:

```text
primer elemento → orden 0
segundo          → orden 1
...
```

No se aceptan listas parciales.

Esto evita colisiones o semánticas ambiguas de “mover a posición”.

Éxito:

```text
CATEGORIES_REORDERED
```

---

# 18. Idempotencia y retry

Todas las mutaciones requieren:

```text
operation_id
expected_categories_revision
```

Scope:

```text
masterdata:v1:<action>
```

Retry por:

```text
transporte incierto
SOLOG_LOCK_CONFLICT_RETRYABLE
```

usa:

```text
mismo operation_id
mismo payload exacto
```

Replay confirmado:

```text
replay:true
```

Si ocurre:

```text
SOLOG_MASTERDATA_REVISION_CONFLICT
```

se debe:

```text
refetch bootstrap
reconstruir intención
usar nuevo operation_id
```

Nunca reutilizar un `operation_id` con payload diferente.

---

# 19. Errores contractuales

Comunes:

```text
SOLOG_AUTH_REQUIRED
SOLOG_USER_DISABLED
SOLOG_ADMIN_ROLE_REQUIRED
SOLOG_INVALID_PAYLOAD
SOLOG_INVALID_ACTION
SOLOG_INVALID_OPERATION
SOLOG_LOCK_CONFLICT_RETRYABLE
SOLOG_MASTERDATA_REVISION_CONFLICT
```

Categorías:

```text
SOLOG_INVALID_CATEGORY
SOLOG_INVALID_CATEGORY_NAME
SOLOG_CATEGORY_NOT_FOUND
SOLOG_CATEGORY_NAME_CONFLICT
SOLOG_INVALID_CATEGORY_ORDER
SOLOG_CATEGORY_CHANGE_NOOP
```

Lectura:

```text
SOLOG_MASTERDATA_RESULT_TOO_LARGE
```

---

# 20. Operaciones explícitamente inexistentes

V1 no ofrece:

```text
category_delete
category_activate
category_deactivate
category_merge
```

Una categoría vacía puede existir.

Cajero decide visibilidad por disponibilidad real de grupos/productos para contar, no por una acción administrativa de activación.

---

# 21. Validación realizada

## Bootstrap real

Validado:

```text
24 categorías
483 grupos
980 productos
963 incluidos
17 excluidos
0 setup_required actuales
```

Integridad:

```text
0 productos incluidos apuntando a grupo inactivo/ausente
0 productos apuntando a categoría no disponible
```

Tamaño:

```text
347,722 bytes JSON
```

---

## Mutaciones sintéticas con ROLLBACK

Se validó en una sola secuencia:

```text
category_create
replay idempotente
category_rename
category_reorder
duplicate case-insensitive reject
revision conflict reject
NOOP reject
bootstrap refleja mutaciones
```

Resultado:

```text
OK
```

Durante la prueba:

```text
groups revision     sin cambios
catalog revision    sin cambios
categories revision incrementó por cada statement
```

Después del `ROLLBACK`:

```text
categories_revision = 1
test categories = 0
```

No quedaron datos ficticios.

---

## Roles

Validado:

```text
moderador → bootstrap permitido
moderador → mutación permitida
cajero    → SOLOG_ADMIN_ROLE_REQUIRED
```

La mutación de moderador fue probada con `ROLLBACK`.

---

# 22. Estado para frontend

Backend:

```text
DESPLEGADO
VALIDADO
CONTRATO CONGELADO
```

Frontend:

```text
NO IMPLEMENTADO AÚN
```

Codex puede planificar el frontend contra este contrato sin inferir backend adicional.

Si encuentra una necesidad backend no cubierta, debe detenerse y devolver el bloqueo a ChatGPT.
