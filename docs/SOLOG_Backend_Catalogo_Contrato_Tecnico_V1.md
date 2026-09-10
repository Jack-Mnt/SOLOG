# SOLOG — Backend Catálogo: Contrato técnico V1

**Estado:** CONGELADO  
**Proyecto:** SOLOG  
**Módulo:** Admin > Catálogo  
**Clasificación:** Nivel C — Backend / lógica / integración  
**Fecha de congelación:** 2026-09-10  
**Contrato de API de Catálogo:** `contract_version = 3`  
**Estado backend:** desplegado y validado en Supabase  
**Fuente primaria técnica del módulo Catálogo:** este documento.

---

## 1. Propósito y prevalencia

Este documento congela el contrato técnico que debe consumir el frontend de **Admin > Catálogo** y las invariantes backend que sostienen su funcionamiento.

Prevalencia para Catálogo:

1. `SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md` — **fuente primaria técnica**.
2. `SOLOG_Arquitectura_Catalogo_Responsabilidad_Comportamiento_Funciones_V1.md` — fuente primaria funcional.
3. `Contrato_backend_ConeXion.md` — fuente primaria del backend ConeXion ↔ Supabase V2.
4. `SOLOG_Integracion_ConeXion_Supabase_Contrato_V2.md` — contrato externo de integración.
5. `SOLOG_Arquitectura_Responsabilidades_Plataformas_V1.md` — frontera de responsabilidades.

Ante una contradicción técnica específica de Catálogo, prevalece este documento. Ante una contradicción con el contrato externo ConeXion ↔ Supabase V2, prevalece el contrato de integración externo salvo una nueva decisión explícita.

Quedan reemplazados **solo para Catálogo** los contratos legacy basados en:

```text
rpc_solog_admin_master_read_v2
rpc_solog_admin_master_v2
inventario.solog_admin_catalog_v2
```

Estos pueden continuar vigentes para otros módulos mientras no exista una decisión posterior.

---

# 2. Estado congelado del backend

Baseline confirmado al congelar:

```text
Catálogo publicado: V6
schema_version compartido: 2
SKU maestros: 980
Cambios históricos incorporados: 33
Cambios aprobados de prueba pendientes: 0
marca nullable: sí
```

El backend V3 de Catálogo está desplegado.

Superficies públicas principales:

```text
public.rpc_solog_admin_catalog_read_v3(text, jsonb)
public.rpc_solog_admin_catalog_v3(text, jsonb)
Edge Function: conexion-admin
```

Superficies internas relevantes:

```text
inventario.catalogo_candidatos()
inventario.solog_admin_catalog_read_v3(...)
inventario.solog_admin_catalog_mutate_v3(...)
inventario.solog_catalog_change_stale_v3(...)
inventario.solog_catalog_change_block_reason_v3(...)
inventario.catalogo_preparar_publicacion_v3(...)
inventario.catalogo_preparar_publicacion(...)
inventario.conexion_admin_catalog(...)
inventario.solog_catalog_refresh_operational_groups_v3(...)
inventario.solog_catalog_plan_hash_v3(...)
public.rpc_solog_catalog_publication_v2(...)
public.rpc_solog_catalog_publication_artifact_v6(...)
public.rpc_conexion_admin(...)
```

Las funciones internas no son contrato de frontend salvo que este documento lo indique expresamente.

---

# 3. Compatibilidad obligatoria con ConeXion V2

Este contrato **no modifica** ConeXion ↔ Supabase V2.

Se conserva:

```text
contract_version snapshot = 2
schema_version catálogo compartido = 2
```

## 3.1. Producto incluido compartido

```json
{
  "c_interno": 20101,
  "producto": "...",
  "c_barras": "...",
  "precio": 1.5
}
```

## 3.2. Producto excluido compartido

```json
{
  "c_interno": 21286,
  "producto": "..."
}
```

Nunca se comparte con ConeXion:

```text
marca
categoria_id
categoria
estado Único/Agrupado
grupo_conteo_id
unidades_por_paquete
precio_paquete
cobertura
estado operativo
conteos/reconteos
```

No cambian:

```text
rpc_conexion_auth_state
rpc_conexion_sync_snapshot
stock[]
eliminados[]
incidencias V2
.prcatalog
hash/versionado/Storage
```

---

# 4. Autenticación, permisos y exposición

## 4.1. Lecturas Catálogo V3

RPC:

```text
public.rpc_solog_admin_catalog_read_v3(
  p_action text,
  p_payload jsonb default '{}'
) → jsonb
```

Permisos:

```text
anon          → sin EXECUTE
authenticated → EXECUTE
```

Validación interna obligatoria:

```text
auth.uid() != null
usuario activo
rol ∈ {admin, moderador}
```

Errores base:

```text
SOLOG_AUTH_REQUIRED
SOLOG_USER_DISABLED
SOLOG_ADMIN_ROLE_REQUIRED
SOLOG_INVALID_PAYLOAD
SOLOG_INVALID_ACTION
```

## 4.2. Mutaciones Catálogo V3

RPC:

```text
public.rpc_solog_admin_catalog_v3(
  p_action text,
  p_payload jsonb default '{}'
) → jsonb
```

Permisos:

```text
anon          → sin EXECUTE
authenticated → EXECUTE
```

Validación interna:

```text
usuario activo
rol ∈ {admin, moderador}
```

## 4.3. Publicación

La publicación final se realiza mediante:

```text
Edge Function: conexion-admin
```

Contrato de acceso:

```text
JWT requerido
rol = admin
```

Un `moderador` puede revisar y preparar Catálogo, pero **no publicar** una nueva versión.

---

# 5. Convenciones generales de respuestas V3

Las lecturas y mutaciones públicas de Catálogo usan:

```json
{
  "contract_version": 3,
  "generated_at": "timestamp ISO-8601",
  "...": "contenido específico"
}
```

El frontend debe rechazar una respuesta cuyo:

```text
contract_version != 3
```

Las revisiones se expresan como:

```json
{
  "revisions": {
    "catalog": 1,
    "groups": 1
  }
}
```

Son revisiones de **master data**, no una versión propia del historial de propuestas.

Regla de caché:

> Una mutación exitosa de Catálogo obliga a invalidar la caché relacionada aunque `catalog` o `groups` no cambien de número.

---

# 6. Contrato de lectura — `status`

Llamada:

```text
rpc_solog_admin_catalog_read_v3(
  'status',
  {}
)
```

Respuesta:

```json
{
  "contract_version": 3,
  "generated_at": "...",
  "catalog": {
    "version_actual": 6,
    "publicado_at": "...",
    "incluidos": 963,
    "excluidos": 17,
    "total": 980
  },
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

Nullables:

```text
catalog.version_actual → integer | null si no existe publicación
catalog.publicado_at   → timestamp | null
```

---

# 7. Contrato de lectura — `reference`

Uso: cargar categorías y grupos válidos para configurar un SKU nuevo/reincorporado.

Llamada:

```text
rpc_solog_admin_catalog_read_v3(
  'reference',
  {}
)
```

Respuesta:

```json
{
  "contract_version": 3,
  "generated_at": "...",
  "categories": [
    {
      "id": "uuid",
      "nombre": "Cigarro y accesorios",
      "orden": 1
    }
  ],
  "groups": [
    {
      "id": "uuid",
      "nombre": "Lucky x un",
      "categoria_id": "uuid",
      "categoria": "Cigarro y accesorios",
      "precio": 1.5,
      "unidades_por_paquete": 20,
      "precio_paquete": 22
    }
  ],
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

Solo devuelve categorías activas y grupos activos de categorías activas.

Nullables de grupo:

```text
unidades_por_paquete → integer | null
precio_paquete       → numeric | null
```

El frontend puede filtrar localmente grupos compatibles por precio, pero el backend vuelve a validar compatibilidad al preparar el producto.

---

# 8. Contrato de lectura — `proposals`

Llamada:

```text
rpc_solog_admin_catalog_read_v3(
  'proposals',
  {"estado":"pendiente"}
)
```

`estado` permitido:

```text
pendiente
aprobado
ignorado
incorporado
```

Si se omite:

```text
pendiente
```

Respuesta:

```json
{
  "contract_version": 3,
  "generated_at": "...",
  "estado": "pendiente",
  "rows": [],
  "total": 0,
  "complete": true,
  "counts": {
    "pendiente": 0,
    "aprobado": 0,
    "ignorado": 0,
    "incorporado": 33
  },
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

No existe paginación de datos para Catálogo V3.

Límite defensivo backend:

```text
máximo 10 000 filas por conjunto
```

Si se supera:

```text
SOLOG_CATALOG_RESULT_TOO_LARGE
```

Nunca debe truncarse silenciosamente una respuesta.

## 8.1. Fila de propuesta

Contrato estable:

```json
{
  "propuesta_fingerprint": "sha256-64-hex",
  "cambio_id": "uuid|null",
  "c_interno": 20155,
  "tipo": "precio",
  "estado": "aprobado",
  "seccion": "urgente",
  "datos": {},
  "producto": "LUCKY AZUL /VERDE X UND",
  "sedes": [],
  "occurrence_count": 1,
  "first_seen_at": "...",
  "last_seen_at": "...",
  "catalogo_actual": {
    "producto": "...|null",
    "c_barras": "...|null",
    "precio": 1.5,
    "marca": "...|null",
    "estado": "Único|Agrupado|Excluido|null",
    "categoria": "...|null",
    "grupo": "...|null"
  },
  "stale": false,
  "publicable": true,
  "block_reason": null,
  "setup": null,
  "price_resolution": null,
  "aprobado_at": "...|null",
  "ignorado_at": "...|null",
  "version_aplicada": 7,
  "incorporado_at": "...|null"
}
```

`cambio_id = null` identifica un candidato automático todavía no persistido.

`publicable`:

```text
aprobado → boolean
otros estados → null
```

## 8.2. Tipos de propuesta congelados

```text
agregar_producto
eliminar_producto
excluir_producto
reincorporar_producto
nombre
precio
codigo
```

No existe:

```text
cambiar_codigo_interno
```

## 8.3. Clasificación congelada

Urgentes:

```text
agregar_producto
precio
reincorporar_producto
```

Emergentes:

```text
eliminar_producto
excluir_producto
nombre
codigo
```

---

# 9. Autoridad de candidatos e historial

`inventario.catalogo_candidatos()` genera únicamente candidatos automáticos aún no persistidos a partir de:

```text
producto_nuevo            → agregar_producto
nombre_modificado         → nombre
precio_modificado         → precio
codigo_barras_modificado  → codigo
codigo_barras_agregado    → codigo
codigo_barras_eliminado   → codigo
```

No genera automáticamente propuestas desde:

```text
producto_ausente
codigo_interno_invalido
codigo_interno_duplicado
stock_invalido
```

`inventario.cambios_catalogo` es la autoridad histórica persistente para decisiones e incorporaciones.

Al persistir un candidato automático se conserva contexto suficiente en `datos._context` para sobrevivir a la eliminación/archivo de la incidencia origen.

---

# 10. Canonicalización de fingerprints

Los precios se canonicalizan como `numeric` antes de formar la identidad de incidencia/propuesta.

Equivalencia obligatoria:

```text
1.5 == 1.50 == 1.500
```

La normalización también se aplica al precio de `producto_nuevo`.

La implementación utiliza datos canónicos antes del SHA-256.

---

# 11. Contrato de lectura — `products`

Llamada:

```text
rpc_solog_admin_catalog_read_v3(
  'products',
  {}
)
```

Respuesta:

```json
{
  "contract_version": 3,
  "generated_at": "...",
  "rows": [],
  "total": 980,
  "complete": true,
  "setup_required": [],
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

No existe paginación.

## 11.1. Fila de producto maestro

```json
{
  "c_interno": 20155,
  "producto": "LUCKY AZUL /VERDE X UND",
  "c_barras": "...|null",
  "precio": 1.5,
  "marca": "...|null",
  "estado_catalogo": "incluido",
  "modo": "Único|Agrupado|Excluido",
  "categoria_id": "uuid",
  "categoria": "Cigarro y accesorios",
  "grupo_id": "uuid|null",
  "grupo": "Lucky x un|null",
  "unidades_por_paquete": 20,
  "precio_paquete": 22,
  "propuesta_estado": null
}
```

`estado_catalogo`:

```text
incluido
excluido
```

`marca` es opcional y puede ser `null`.

## 11.2. `setup_required`

Contiene altas/reincorporaciones aprobadas todavía no preparadas:

```json
{
  "cambio_id": "uuid",
  "propuesta_fingerprint": "...",
  "tipo": "agregar_producto|reincorporar_producto",
  "c_interno": 29999,
  "producto": "...",
  "precio": 1.5,
  "setup": null,
  "block_reason": "configuracion_requerida"
}
```

Un SKU nuevo aprobado todavía no aparece en `rows` porque aún no existe en `inventario.catalogo`; se representa mediante `setup_required` hasta publicar.

---

# 12. Contrato de lectura — `price_options`

Llamada:

```text
rpc_solog_admin_catalog_read_v3(
  'price_options',
  {"propuesta_fingerprint":"..."}
)
```

Respuesta:

```json
{
  "contract_version": 3,
  "generated_at": "...",
  "propuesta_fingerprint": "...",
  "change_id": "uuid|null",
  "change_state": "pendiente|aprobado|ignorado|incorporado",
  "grupo": {
    "id": "uuid",
    "nombre": "Lucky x un",
    "precio": 1.5,
    "unidades_por_paquete": 20,
    "precio_paquete": 22
  },
  "c_interno": 20155,
  "nuevo_precio": 1.6,
  "members": [
    {
      "c_interno": 20155,
      "producto": "...",
      "precio": 1.5
    }
  ],
  "options": ["update_group_price", "separate_sku"],
  "package_decision_required": true,
  "prepared_resolution": null,
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

Para estructura individual:

```text
options = ["keep_structure"]
```

Errores relevantes:

```text
SOLOG_INVALID_CATALOG_CHANGE_ID
SOLOG_CATALOG_CHANGE_NOT_FOUND
SOLOG_GROUP_NOT_AVAILABLE
```

---

# 13. Contrato de lectura — `publication_preview`

Llamada:

```text
rpc_solog_admin_catalog_read_v3(
  'publication_preview',
  {}
)
```

Respuesta:

```json
{
  "contract_version": 3,
  "generated_at": "...",
  "preview": {
    "ok": true,
    "codigo": "CATALOG_PREVIEW_READY",
    "version_actual": 6,
    "version_nueva": 7,
    "schema_version": 2,
    "sku_actuales": 980,
    "sku_resultantes": 980,
    "cambios_total": 3,
    "cambios": {
      "agregar_producto": 0,
      "eliminar_producto": 0,
      "excluir_producto": 0,
      "reincorporar_producto": 0,
      "nombre": 1,
      "precio": 1,
      "codigo": 1
    },
    "change_ids": [],
    "productos": [],
    "grupos": [],
    "conflictos": [],
    "errores": []
  },
  "revisions": {
    "groups": 1,
    "catalog": 1
  }
}
```

`productos` y `grupos` son proyecciones internas ricas usadas por el proceso de publicación. El frontend **no debe depender de su estructura completa** ni utilizarlas para reconstruir el maestro.

Para UI, los campos contractuales de preview son:

```text
ok
codigo
version_actual
version_nueva
schema_version
sku_actuales
sku_resultantes
cambios_total
cambios
change_ids
conflictos
errores
```

Si `ok = false`, la UI debe mostrar `codigo`, `errores[]` y/o `conflictos[]` y bloquear publicación.

---

# 14. Bloqueos y motivos de no publicación

`block_reason` estable para una propuesta aprobada puede incluir:

```text
propuesta_desactualizada
configuracion_requerida
producto_con_stock
producto_no_encontrado
producto_excluido
grupo_no_disponible
resolucion_precio_desactualizada
resolucion_precio_requerida
decision_precio_paquete_requerida
precio_paquete_invalido
```

Una propuesta aprobada con `block_reason != null` no está lista para publicar.

`stale = true` significa que existe evidencia posterior distinta para el mismo:

```text
c_interno + tipo
```

No se reemplaza automáticamente la decisión administrativa.

---

# 15. Contrato común de mutaciones V3

Todas las mutaciones usan:

```text
public.rpc_solog_admin_catalog_v3(action, payload)
```

Campos obligatorios comunes:

```json
{
  "operation_id": "uuid",
  "expected_catalog_revision": 1,
  "expected_groups_revision": 1
}
```

Reglas:

- `operation_id` debe ser estable al reintentar una operación incierta.
- se aplica idempotencia mediante `solog_operation_begin/finish`;
- se usa lock de master data;
- si las revisiones ya no coinciden:

```text
SOLOG_MASTERDATA_REVISION_CONFLICT
```

- si el lock está ocupado:

```text
SOLOG_LOCK_CONFLICT_RETRYABLE
```

Respuesta común:

```json
{
  "contract_version": 3,
  "generated_at": "...",
  "replay": false,
  "result": {},
  "revisions": {
    "catalog": 1,
    "groups": 1
  }
}
```

En replay:

```text
replay = true
```

El cliente debe conservar el mismo `operation_id` cuando la confirmación de una mutación sea incierta.

---

# 16. Mutación — `proposal_action`

Payload:

```json
{
  "operation_id": "uuid",
  "expected_catalog_revision": 1,
  "expected_groups_revision": 1,
  "propuesta_fingerprint": "sha256-64-hex",
  "action": "approve"
}
```

`action`:

```text
approve
ignore
withdraw
```

Semántica:

```text
approve  → persiste/actualiza a aprobado
ignore   → persiste/actualiza a ignorado
withdraw → aprobado → pendiente
```

`withdraw` elimina del staging dependiente:

```text
_setup
_price_resolution
```

Por tanto retirar una aprobación de precio elimina también la resolución de grupo/xN preparada.

Errores relevantes:

```text
SOLOG_INVALID_CATALOG_CHANGE_ID
SOLOG_INVALID_CATALOG_CHANGE_ACTION
SOLOG_CATALOG_CHANGE_NOT_FOUND
SOLOG_CATALOG_CHANGE_NOT_APPROVED
SOLOG_CATALOG_CHANGE_CONFLICT
```

---

# 17. Mutación — `propose_product_state`

Uso: proponer exclusión o reincorporación desde `Productos`.

Payload:

```json
{
  "operation_id": "uuid",
  "expected_catalog_revision": 1,
  "expected_groups_revision": 1,
  "c_interno": 20155,
  "action": "exclude"
}
```

`action`:

```text
exclude
reincorporate
```

Mapeo:

```text
exclude       → excluir_producto
reincorporate → reincorporar_producto
```

La mutación **solo crea la propuesta**. No modifica `inventario.catalogo`.

Errores relevantes:

```text
SOLOG_INVALID_PRODUCT
SOLOG_PRODUCT_NOT_FOUND
SOLOG_CATALOG_CHANGE_NOOP
SOLOG_CATALOG_CHANGE_CONFLICT
```

---

# 18. Mutación — `prepare_product`

Solo aplica a propuesta:

```text
estado = aprobado
tipo ∈ {agregar_producto, reincorporar_producto}
```

## 18.1. Grupo existente

Payload:

```json
{
  "operation_id": "uuid",
  "expected_catalog_revision": 1,
  "expected_groups_revision": 1,
  "propuesta_fingerprint": "...",
  "mode": "existing_group",
  "grupo_id": "uuid",
  "marca": null
}
```

`marca` es opcional.

Backend valida:

```text
grupo activo
precio grupo == precio SKU
```

El SKU hereda:

```text
categoria_id del grupo
modo Agrupado
grupo_id
```

## 18.2. Nuevo grupo unitario

Payload:

```json
{
  "operation_id": "uuid",
  "expected_catalog_revision": 1,
  "expected_groups_revision": 1,
  "propuesta_fingerprint": "...",
  "mode": "new_unit",
  "categoria_id": "uuid",
  "marca": null
}
```

Backend reserva un UUID estable para el grupo unitario en staging.

Configuración resultante:

```text
estado = Único
nombre grupo = producto
precio grupo = precio SKU
categoria = seleccionada
unidades_por_paquete = null
precio_paquete = null
```

La preparación se almacena en:

```text
cambios_catalogo.datos._setup
```

No modifica todavía:

```text
inventario.catalogo
inventario.grupos_conteo
```

Errores relevantes:

```text
SOLOG_INVALID_PRODUCT_CONFIGURATION
SOLOG_CATALOG_CHANGE_NOT_APPROVED
SOLOG_PRODUCT_NOT_AVAILABLE
SOLOG_GROUP_NOT_COMPATIBLE
SOLOG_CATEGORY_NOT_AVAILABLE
```

---

# 19. Mutación — `prepare_price`

Solo aplica a:

```text
tipo = precio
estado = aprobado
```

## 19.1. Grupo agrupado — actualizar todo

```json
{
  "operation_id": "uuid",
  "expected_catalog_revision": 1,
  "expected_groups_revision": 1,
  "propuesta_fingerprint": "...",
  "resolution": "update_group_price",
  "package_action": "keep"
}
```

Si se actualiza `precio_paquete`:

```json
{
  "resolution": "update_group_price",
  "package_action": "update",
  "precio_paquete": 24
}
```

## 19.2. Grupo agrupado — separar SKU

```json
{
  "operation_id": "uuid",
  "expected_catalog_revision": 1,
  "expected_groups_revision": 1,
  "propuesta_fingerprint": "...",
  "resolution": "separate_sku"
}
```

El backend reserva un nuevo grupo unitario para el SKU en staging.

El grupo original conserva su configuración `xN`.

## 19.3. Grupo individual

```json
{
  "operation_id": "uuid",
  "expected_catalog_revision": 1,
  "expected_groups_revision": 1,
  "propuesta_fingerprint": "...",
  "resolution": "keep_structure",
  "package_action": "keep"
}
```

Si el grupo individual tiene paquete y se actualiza:

```json
{
  "resolution": "keep_structure",
  "package_action": "update",
  "precio_paquete": 24
}
```

## 19.4. Regla `Actualizar precio xN`

Si:

```text
unidades_por_paquete > 1
```

y la resolución no es `separate_sku`, el backend exige decisión explícita:

```text
package_action = keep | update
```

Si `update`:

```text
precio_paquete > 0
```

Nunca se recalcula automáticamente de forma proporcional.

La resolución se guarda en:

```text
cambios_catalogo.datos._price_resolution
```

No modifica maestro ni grupos hasta publicar.

Errores relevantes:

```text
SOLOG_CATALOG_CHANGE_NOT_APPROVED
SOLOG_GROUP_NOT_AVAILABLE
SOLOG_INVALID_PRICE_RESOLUTION
SOLOG_PACKAGE_PRICE_DECISION_REQUIRED
SOLOG_INVALID_GROUP_VALUATION
```

---

# 20. Semántica de `marca`

`inventario.catalogo.marca`:

```text
nullable = true
```

Reglas:

- conserva datos históricos existentes;
- nuevos SKU pueden usar `NULL`;
- no usar cadena vacía;
- no inferir automáticamente desde `producto`;
- no bloquea aprobación, configuración ni publicación;
- no forma parte del artefacto ConeXion V2.

---

# 21. Exclusión, reincorporación y eliminación

## 21.1. Exclusión

```text
propuesta → aprobación → staging → publicación
```

Al publicar:

```text
inventario.catalogo.estado = Excluido
grupo_conteo_id = null
catalogo_version_skus.estado = excluido
```

El SKU permanece físicamente en `inventario.catalogo`.

## 21.2. Reincorporación

Requiere `prepare_product` antes de publicar.

Al publicar:

```text
Excluido → Único o Agrupado
catalogo_version_skus.estado = incluido
```

## 21.3. Eliminación

`eliminar_producto`:

- solo nace de decisión administrativa explícita;
- no se deriva automáticamente de `producto_ausente`;
- no se publica si existe stock operativo `<> 0` en alguna sede;
- durante commit retira físicamente el SKU del maestro activo;
- el historial previo permanece en snapshots/versiones/cambios históricos.

Bloqueo técnico:

```text
PRODUCT_HAS_STOCK
producto_con_stock
```

---

# 22. Protección de estado frente a Grupos

Las transiciones:

```text
Incluido → Excluido
Excluido → Incluido
```

no pueden ejecutarse mediante la lógica genérica de Grupos.

El backend aplica guardas para exigir el flujo de Catálogo.

Error esperado cuando una operación externa intenta saltar Catálogo:

```text
SOLOG_CATALOG_STATE_MANAGED
```

Grupos conserva responsabilidad sobre movimientos internos `Único ↔ Agrupado`, membresía, categoría y paquetes fuera de los casos de preparación de Catálogo.

---

# 23. Preview: validaciones obligatorias

`inventario.catalogo_preparar_publicacion_v3()` simula el estado resultante sin modificar el maestro.

Valida como mínimo:

```text
propuesta aprobada desactualizada
operaciones incompatibles sobre el mismo SKU
eliminar + otros cambios simultáneos
eliminación con stock != 0
SKU inexistente
alta duplicada
valor anterior obsoleto
precio sin estructura válida
resolución de precio faltante
precio xN sin decisión
precio xN inválido
separación sin grupo reservado
configuración de nuevo/reincorporado faltante
grupo destino inexistente/inactivo
precio SKU != precio grupo
categoría inválida
grupo unitario ocupado
nombre de grupo unitario en conflicto
SKU excluido con grupo
grupo inexistente para SKU incluido
categorías distintas dentro de grupo
precios unitarios distintos dentro de grupo
```

Códigos de conflicto relevantes:

```text
STALE_APPROVED_PROPOSAL
SKU_OPERATION_CONFLICT
DELETE_WITH_OTHER_CHANGES
PRODUCT_HAS_STOCK
PRODUCT_NOT_FOUND
PRODUCT_ALREADY_EXISTS
STALE_PRODUCT_CHANGE
PRICE_GROUP_NOT_AVAILABLE
PRICE_RESOLUTION_REQUIRED
PACKAGE_PRICE_DECISION_REQUIRED
INVALID_PACKAGE_PRICE
PRICE_SEPARATION_GROUP_REQUIRED
PRICE_SEPARATION_GROUP_CONFLICT
PRODUCT_CONFIGURATION_REQUIRED
INVALID_NEW_PRODUCT
PRODUCT_NOT_EXCLUDED
GROUP_NOT_AVAILABLE
GROUP_PRICE_MISMATCH
UNIT_GROUP_REQUIRED
UNIT_GROUP_CONFLICT
CATEGORY_NOT_AVAILABLE
GROUP_NAME_CONFLICT
EXCLUDED_WITH_GROUP
GROUP_CATEGORY_MISMATCH
```

Si existe al menos un conflicto:

```json
{
  "ok": false,
  "codigo": "CATALOG_VALIDATION_FAILED",
  "conflictos": [],
  "errores": []
}
```

---

# 24. Publicación

## 24.1. Entrada frontend

El frontend no debe llamar directamente al commit SQL.

Debe invocar:

```text
Edge Function: conexion-admin
```

Body:

```json
{
  "action": "publish_catalog",
  "operation_id": "uuid-estable"
}
```

## 24.2. Flujo interno

```text
conexion-admin
→ rpc_solog_catalog_publication_v2(begin)
→ preview aprobado
→ rpc_solog_catalog_publication_artifact_v6
→ generar .prcatalog schema 2
→ GZIP → Base64 → bytes
→ SHA-256
→ Storage privado
→ rpc_conexion_admin(commit_catalog_publication)
→ aplicar maestro/grupos/estado operativo/versionado
→ rpc_solog_catalog_publication_v2(finish)
```

El ledger mantiene:

```text
prepared
committed
failed
```

La publicación conserva idempotencia y recuperación por `operation_id`.

## 24.3. Respuesta exitosa

Forma estable para frontend:

```json
{
  "ok": true,
  "codigo": "CATALOG_PUBLISHED",
  "operation_id": "uuid",
  "replay": false,
  "completion_recorded": true,
  "version": 7,
  "hash": "sha256",
  "storage_path": "conexion-catalogos/...",
  "productos": 980,
  "grupos_activos": 483,
  "cambios_incorporados": 3
}
```

`completion_recorded` puede ser `false` si el commit quedó confirmado pero el cierre del ledger no pudo registrarse en ese intento; el mismo `operation_id` debe permitir recuperar/reintentar.

## 24.4. Errores/publicación rechazada

Códigos relevantes:

```text
AUTH_REQUIRED
AUTH_INVALID
USER_DISABLED
ADMIN_REQUIRED
SOLOG_INVALID_OPERATION
SOLOG_OPERATION_IN_PROGRESS
CATALOG_PREPARE_FAILED
CATALOG_SCHEMA_NOT_SUPPORTED
INVALID_CATALOG_PREVIEW
CATALOG_ARTIFACT_METADATA_FAILED
CATALOG_UPLOAD_FAILED
CATALOG_UPLOAD_CONFLICT
CATALOG_COMMIT_FAILED
CATALOG_VERSION_MISMATCH
CATALOG_VERSION_EXISTS
CATALOG_PREVIEW_MISMATCH
CATALOG_CHANGE_SET_CHANGED
CATALOG_PUBLICATION_ERROR
```

Una respuesta HTTP de error no implica automáticamente que la operación sea segura de repetir con otro UUID. Cuando exista incertidumbre, se reutiliza el mismo `operation_id`.

---

# 25. Commit atómico y efectos internos

Durante el commit se aplican como una única operación:

```text
altas comerciales
nombre
barcode
precio
exclusión
reincorporación
eliminación
configuración inicial del SKU
resoluciones de precio
actualización opcional precio_paquete
normalización de grupos
estado operativo de grupos
versiones_catalogo
catalogo_version_skus
estado Incorporado de cambios publicados
auditoría
```

La sesión de Cajero ya abierta no se reescribe.

`conteo_detalle` conserva el contexto histórico de:

```text
precio
unidades_por_paquete
precio_paquete
```

No existe revalorización retroactiva de conteos previos.

---

# 26. Estado operativo después de cambios de composición

Campo backend:

```text
inventario.estado_stock_grupo.requiere_snapshot_completo boolean not null default false
```

Cuando una publicación modifica composición:

```text
estado = Cambio_reciente
cobertura_periodo = false
```

Si entra un SKU nuevo/reincorporado sin stock fresco:

```text
requiere_snapshot_completo = true
activo operativo = false
```

Mientras sea `true`:

- el grupo no se incluye como operable para Cajero;
- no se construye un stock teórico parcial;
- no se reutiliza stock histórico viejo del SKU reincorporado.

Un snapshot completo posterior válido:

```text
recalcula stock completo
requiere_snapshot_completo = false
estado = Cambio_reciente
cobertura_periodo = false
grupo vuelve a estar operable
```

Si una composición cambia mientras existe un `Recontar` pendiente incompatible, el backend puede marcar el detalle como:

```text
Inválido
```

según las reglas del Motor.

---

# 27. Canonicalización de incidencias V2

La ruta de sync conserva el contrato de entrada/salida V2.

La normalización se realiza internamente antes de guardar la incidencia/fingerprint.

Regla crítica:

```text
precio_modificado 1.5 → 1.80
precio_modificado 1.50 → 1.8
```

representan la misma identidad comercial si los valores numéricos son equivalentes.

Esto no cambia el payload enviado por ConeXion.

---

# 28. Estrategia de egress y caché frontend

Catálogo V3 no pagina sus conjuntos operativos.

## Propuestas

```text
Pendientes    → carga completa al abrir
Aprobados     → carga completa bajo demanda
Ignorados     → carga completa bajo demanda
Incorporados  → carga completa bajo demanda
```

## Productos

```text
1 carga completa bajo demanda
→ búsqueda/orden/filtros frontend
```

## Reference

```text
1 carga bajo demanda
→ categorías + grupos activos
```

El frontend debe cachear y filtrar localmente.

Debe invalidar la caché relevante después de:

```text
proposal_action
propose_product_state
prepare_product
prepare_price
publicación
```

No se debe reintroducir `limit/offset` en Catálogo V3 sin una decisión posterior.

---

# 29. Reglas de integración para Codex

El frontend debe consumir **exclusivamente el contrato Catálogo V3** definido aquí para este módulo.

Codex no debe:

- modificar Supabase;
- redefinir payloads o respuestas;
- reintroducir el modal legacy de alta con marca/categoría/grupo dentro de `Aprobar`;
- usar `rpc_solog_admin_master_v2` para mutaciones de Catálogo;
- aplicar cambios optimistas que asuman commit antes de respuesta autoritativa;
- reintroducir paginación backend de Catálogo;
- inferir campos internos del preview;
- modificar el contrato ConeXion V2.

Codex sí debe:

- adaptar tipos TypeScript a `contract_version = 3`;
- usar los RPC V3 desplegados;
- conservar `operation_id` en reintentos inciertos;
- usar las revisiones recibidas en mutaciones;
- invalidar caché después de mutaciones;
- manejar explícitamente `block_reason`, `stale`, `publicable`, `setup_required` y conflictos de preview;
- mantener publicación únicamente para `admin`.

---

# 30. Riesgo residual aceptado: `plan_hash`

Existe:

```text
inventario.solog_catalog_plan_hash_v3(...)
```

y `rpc_solog_catalog_publication_artifact_v6` expone un `plan_hash` informativo.

En esta versión **no se congela como requisito** que el ledger persista/verifique ese hash extremo a extremo entre generación de artefacto y commit.

Decisión aprobada:

- operación actual con una única persona administrando Catálogo;
- publicación de duración práctica muy corta;
- no existen procesos automáticos que cambien configuración de SKU o resolución de precio durante publicación;
- el riesgo de una modificación administrativa deliberada simultánea se acepta como residual.

Por tanto:

```text
plan_hash end-to-end enforcement
→ hardening futuro / backlog
→ no bloquea V1
```

Si en el futuro existe concurrencia real de múltiples administradores, automatización de cambios o publicaciones largas, este punto debe reabrirse.

---

# 31. Validaciones ejecutadas antes de congelar

Se validó sintéticamente, usando transacciones reversibles cuando correspondía:

```text
canonicalización numérica de precio
canonicalización en producto nuevo
historial persistente aunque desaparezca incidencia origen
detección de propuesta aprobada desactualizada
lectura completa de 980 productos
recuperación de 33 incorporados históricos
marca nullable
alta aprobada sin modificar maestro
configuración a grupo existente
configuración con marca null
resolución de precio de grupo
actualización opcional de precio xN
retiro de aprobación elimina staging de precio
exclusión aplicada solo al publicar
reincorporación aplicada solo al publicar
guarda Grupos contra exclusión/reincorporación directa
nuevo/reincorporado exige snapshot completo
snapshot posterior reactiva grupo con stock completo
lectura reference devuelve categorías y grupos activos
permisos anon revocados en RPC Catálogo V3
```

Al finalizar pruebas se confirmó:

```text
versión productiva = V6
SKU maestros = 980
no se publicó una V7 de prueba
```

---

# 32. Cierre del contrato

Este contrato queda **CONGELADO**.

Estado de implementación backend:

```text
DEFINIDO      → sí
PREFLIGHT     → completado
BACKEND       → desplegado
VALIDACIÓN    → completada
CONTRATO      → congelado
FRONTEND      → listo para planificación/implementación con Codex
```

Cualquier modificación futura al contrato debe tratarse como delta explícito con nombre descriptivo y no debe reinterpretar silenciosamente esta V1.

