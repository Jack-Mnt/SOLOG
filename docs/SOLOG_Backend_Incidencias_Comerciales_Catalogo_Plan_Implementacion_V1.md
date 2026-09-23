# SOLOG — Incidencias comerciales ↔ Catálogo — Plan de implementación V1

**Estado:** CONGELADO / APROBADO  
**Fecha de congelación:** 2026-09-21  
**Rama:** `admin-work`  
**Clasificación:** Nivel C — backend / integración + frontend  
**Fuente contractual:** `SOLOG_Backend_Incidencias_Comerciales_Catalogo_Contrato_V1.md`

---

# 1. Fases aprobadas

## Fase 1 — Preflight técnico y contrato de transporte
**Estado:** COMPLETADA

- inventario de schema, funciones, constraints, datos legacy y frontend;
- resolución V3/V4;
- representación física;
- impacto CSS.

## Fase 2 — Modelo backend e identidad
**Estado:** COMPLETADA

- ampliar `cambios_catalogo`;
- crear supresión comercial exacta;
- backfill de origen y legacy;
- helper único de identidad;
- identidad por instancia administrativa.

## Fase 3 — Motor de candidatos comerciales
**Estado:** COMPLETADA

- `catalogo_candidatos()` respeta supresión exacta;
- conservar agregación multisede;
- misma evidencia no reaparece;
- evidencia distinta sí puede aparecer.

## Fase 4 — Motor de transiciones
**Estado:** COMPLETADA

- `ignore`;
- `reactivate`;
- `withdraw`;
- `discard`;
- staging y auditoría coordinados.

## Fase 5 — Aprobación atómica
**Estado:** COMPLETADA

- `resolve_product`;
- `resolve_price`;
- `propose_product_state` resuelto en una sola operación.

## Fase 6 — Lecturas, preview y publicación
**Estado:** COMPLETADA

- `origen` autoritativo;
- `descartado` fuera de lecturas/counts;
- RPC V4;
- preview/publicación solo con aprobados elegibles.

## Fase 7 — Frontend Catálogo
**Estado:** COMPLETADA

- consumir V4;
- `Aprobar` en tabla;
- resolver antes de aprobar;
- Ignorar/Reactivar;
- Volver a pendiente/Descartar;
- sin UI de Descartados.

## Fase 8 — Frontend Productos
**Estado:** COMPLETADA

- nueva instancia por acción administrativa;
- reincorporación resuelta en el mismo flujo;
- reproponer después de descarte.

## Fase 9 — Validación técnica global

```powershell
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

más pruebas backend del contrato.

## Fase 10 — Smoke humano y cierre documental
- automáticas simples/complejas;
- ignore/reactivate;
- withdraw/discard;
- administrativa discard → reproponer;
- publicación;
- cierre documental.

---

# 2. Reglas de ejecución

Cada fase:

1. parte del HEAD real más reciente de `admin-work`;
2. no modifica `master`;
3. conserva cambios concurrentes;
4. no amplía scope;
5. actualiza tests directamente relacionados;
6. se valida antes de avanzar.

Un bloqueo que contradiga el contrato congelado detiene la implementación antes de reinterpretarlo.

---

# 3. Fase 1 — Preflight completado

## 3.1. Estado real de backend

`inventario.cambios_catalogo` actualmente posee:

```text
propuesta_fingerprint UNIQUE
estado = pendiente|aprobado|ignorado|incorporado|aplicado
datos jsonb
incidencia_origen_id
aprobado_por / aprobado_at
ignorado_por / ignorado_at
version_aplicada / incorporado_at
```

No existen todavía:

```text
descartado
origen_propuesta
descartado_por
descartado_at
```

Datos actuales:

```text
pendiente = 5
aprobado  = 5
ignorado  = 5
```

Por tipo:

```text
aprobado:
  agregar_producto 4
  precio           1

pendiente:
  agregar_producto      2
  precio                2
  reincorporar_producto 1

ignorado:
  eliminar_producto 2
  excluir_producto  3
```

Los 5 aprobados complejos actuales ya poseen staging requerido y no tienen `block_reason`.

Origen detectable:

```text
9 filas con _context.origen = conexion
4 filas con datos.origen = productos
2 filas manuales desde producto_ausente
```

## 3.2. Incidencias comerciales actuales

```text
producto_nuevo            33 pendientes
nombre_modificado         16 pendientes
precio_modificado         12 pendientes
codigo_barras_modificado   2 pendientes
codigo_barras_agregado     2 pendientes
```

No hay supresiones comerciales actuales en `exclusiones_incidencias`.

`catalogo_candidatos()`:

```text
39 candidatos totales
30 no persistidos
4 persistidos pendientes
5 persistidos aprobados
```

## 3.3. Hallazgos backend

1. `catalogo_candidatos()` no consulta una supresión comercial exacta.
2. `incidencia_origen_id` es representativo; no resuelve multisede.
3. `exclusiones_incidencias` pertenece a Incidencias V2 y su `family_key` es demasiado amplio para este motor.
4. `solog_guardar_incidencia_normalizada()` deberá reconocer supresión comercial exacta.
5. El resolver de snapshots solo resuelve las cuatro familias operativas.
6. Preview/publicación ya seleccionan `estado='aprobado'`; `descartado` puede quedar fuera sin reinterpretar publicación.
7. `solog_operation_begin/finish` ya garantiza idempotencia por `scope + actor + operation_id`.

## 3.4. Transporte congelado

Se implementa:

```text
Catálogo V4
contract_version = 4
rpc_solog_admin_catalog_read_v4
rpc_solog_admin_catalog_v4
```

V3 permanece intacto hasta el corte del frontend.

La razón es contractual, no cosmética: V3 ejecuta `approve → prepare`; V4 exige `resolver → approve` atómico.

## 3.5. Legacy

Las 5 filas `ignorado` existentes son administrativas/humanas:

```text
3 excluir_producto desde Productos
2 eliminar_producto desde producto_ausente manual
```

En Fase 2 se migran una sola vez a:

```text
descartado
```

para que no contaminen el nuevo tab recuperable de Ignorados.

Las pendientes/aprobadas automáticas conservan historia y reciben `origen_propuesta = automatico`.

La reincorporación administrativa pendiente legacy se conserva `pendiente`; no se inventa resolución.

## 3.6. Modelo físico congelado

`cambios_catalogo`:

```text
origen_propuesta = automatico | administrativo
descartado_por
descartado_at
estado += descartado
```

Nueva tabla:

```text
inventario.catalogo_supresiones_evidencia
```

Identidad administrativa:

```text
sha256(catalog-admin | operation_id | c_interno | tipo)
```

Helper SQL único para incidencia comercial → candidato/fingerprint.

## 3.7. Frontend afectado

Archivos principales:

```text
src/features/solog/admin/catalogo/admin.catalogo.v3.ts
src/features/solog/admin/catalogo/admin.catalogo.store.ts
src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx
src/features/solog/admin/productos/admin.productos.v1.tsx
src/features/solog/admin/productos/admin.product-setup.dialog.tsx
```

V4 debe tener tipos/validadores propios o una separación explícita equivalente; no se debe presentar semántica V4 bajo nombres V3.

Tests V3 continúan como protección de compatibilidad y se agregan tests V4.

## 3.8. CSS

**No se requieren cambios CSS obligatorios.**

Ya existen:

```text
.button
.button--secondary
.button--danger
.icon-button
.icon-button--danger
.admin-table-actions
.admin-table-action-cell
```

Y:

```css
.admin-main-table { overflow: auto; }
.admin-catalog__table table { min-width: 720px; }
.admin-table-actions { display: inline-flex; gap: 6px; }
```

Por tanto los nuevos controles se componen con primitives existentes.

Regla:

> No crear CSS nuevo preventivamente.

Solo si el smoke visual demuestra compresión real se permite un ajuste local de ancho/min-width de Catálogo, sin modificar primitives globales ni el sistema responsive.

## 3.9. Blockers

No se detectaron blockers técnicos que obliguen a reabrir el contrato funcional.

Fase 2 puede comenzar.

---

# 4. Implementación Fases 2–4

Migraciones aplicadas en Supabase:

```text
20260921093739_solog_catalog_v4_model_identity_v1.sql
20260921093841_solog_catalog_v4_commercial_candidates_v1.sql
20260921094013_solog_catalog_v4_proposal_transitions_v1.sql
```

## 4.1. Fase 2

Implementado:

- `origen_propuesta = automatico | administrativo`;
- `descartado_por` / `descartado_at`;
- estado `descartado`;
- backfill autoritativo de origen;
- migración de las 5 propuestas administrativas legacy `ignorado → descartado`;
- `catalogo_supresiones_evidencia`;
- fingerprint administrativo por `operation_id`;
- guard de compatibilidad para inserts V3 existentes.

Resultado observado:

```text
aprobado automático      5
pendiente automático     4
pendiente administrativo 1
descartado administrativo 5
```

## 4.2. Fase 3

Implementado:

- helper único `solog_catalog_commercial_evidence_v1`;
- `catalogo_candidatos()` consume el helper y excluye fingerprints suprimidos;
- trigger de normalización reconoce supresión comercial exacta;
- sincronización supresión ↔ estado de incidencias;
- compatibilidad para propuestas automáticas que todavía entren a `ignorado` desde V3.

Validación:

```text
candidatos antes de supresión de prueba = 39
supresión transaccional de fingerprint multisede
→ candidato ausente
→ 2 incidencias suprimidas
rollback
→ estado real sin supresiones de prueba
```

## 4.3. Fase 4

Implementada la función interna:

```text
inventario.solog_catalog_proposal_action_v4(uuid,jsonb)
```

Soporta:

```text
ignore
reactivate
withdraw
discard
```

La función todavía **no está expuesta mediante RPC pública V4**; eso pertenece a Fase 6.

Validaciones transaccionales con rollback:

```text
ignore automático multisede
→ ignorado
→ supresión exacta activa
→ candidato desaparece
→ 2 incidencias suprimidas

reactivate
→ pendiente
→ supresión revocada
→ candidato reaparece
→ 2 incidencias reactivadas

discard automático
→ descartado
→ staging eliminado
→ supresión terminal
→ candidato desaparece

withdraw precio
→ pendiente
→ _price_resolution eliminado
→ aprobado_por limpiado

discard administrativo
→ descartado
→ sin supresión comercial
```

Después de los rollbacks de validación:

```text
supresiones activas de prueba = 0
incidencias comerciales suprimidas de prueba = 0
descartados reales = 5 legacy administrativos
```

## 4.4. Compatibilidad V3

La RPC V3 no fue reemplazada ni eliminada.

La lectura V3 continúa respondiendo con sus cuatro estados visibles. Los cinco legacy administrativos migrados a `descartado` ya no aparecen en el tab `Ignorados`.

La nueva RPC pública V4 sigue pendiente.

---


## 4.5. Fase 5 — Aprobación atómica

Migración aplicada:

```text
20260921095019_solog_catalog_v4_atomic_resolution_v1.sql
```

Implementado:

- `inventario.solog_admin_catalog_mutate_v4(uuid,text,jsonb)`;
- `proposal_action approve` queda limitado a tipos simples;
- propuestas complejas devuelven `SOLOG_CATALOG_CHANGE_RESOLUTION_REQUIRED`;
- `resolve_product` realiza aprobación + `_setup` dentro de la misma transacción;
- `resolve_price` realiza aprobación + `_price_resolution` dentro de la misma transacción;
- `prepare_product` y `prepare_price` permanecen disponibles para editar staging de una propuesta ya aprobada;
- `propose_product_state exclude` crea una nueva instancia administrativa aprobada;
- `propose_product_state reincorporate` exige configuración y solo sobrevive si resolución + aprobación terminan correctamente;
- `Incidencias > Proponer eliminación` usa también fingerprint administrativo derivado de `operation_id`.

Validaciones transaccionales con rollback:

```text
agregar_producto pendiente
→ resolve_product
→ aprobado + _setup + block_reason null

precio pendiente
→ resolve_price
→ aprobado + _price_resolution + block_reason null

reincorporación administrativa pendiente legacy
→ resolve_product
→ aprobado + _setup + block_reason null

resolución con categoría inválida
→ error SOLOG_CATEGORY_NOT_AVAILABLE
→ propuesta permanece pendiente
→ no queda _setup

approve directo sobre precio complejo
→ SOLOG_CATALOG_CHANGE_RESOLUTION_REQUIRED
→ propuesta permanece pendiente

administrativa A
→ aprobada
→ descartada
→ nueva operación administrativa B
→ nueva propuesta aprobada con fingerprint diferente
```

## 4.6. Fase 6 — Lecturas y transporte público V4

Migraciones aplicadas:

```text
20260921095141_solog_catalog_v4_public_contract_v1.sql
20260921095431_solog_catalog_v4_suppression_security_indexes_v1.sql
```

Superficie pública desplegada:

```text
public.rpc_solog_admin_catalog_read_v4(...)
public.rpc_solog_admin_catalog_v4(...)
contract_version = 4
```

Lecturas V4:

- exponen `origen = automatico | administrativo`;
- no devuelven `descartado`;
- no cuentan `descartado`;
- `Ignorados` solo incluye propuestas automáticas recuperables;
- `status`, `reference`, `products`, `price_options` y `publication_preview` responden con envelope V4.

Mutaciones públicas V4:

```text
proposal_action
resolve_product
resolve_price
propose_product_state
prepare_product
prepare_price
```

Conservan:

- `operation_id`;
- replay idempotente;
- revisiones `catalog/groups`;
- advisory lock de Catálogo;
- permisos `admin/moderador`.

Validación de transporte:

```text
primer request V4 → replay=false
mismo operation_id + mismo payload → replay=true
contract_version → 4
```

Seguridad:

- RPC V4 sin EXECUTE para `anon`;
- EXECUTE para `authenticated`, con validación interna de rol;
- RLS habilitado en `catalogo_supresiones_evidencia`;
- índices añadidos para FK de actores y `descartado_por`;
- no se abrió acceso directo a la tabla de supresiones.

Preview/publicación:

```text
descartados presentes en preview = 0
aprobadas complejas sin staging = 0
```

La infraestructura existente de publicación sigue siendo válida porque consume únicamente cambios `aprobado`. El formato `.prcatalog` no cambia.

Estado real al cierre de Fase 6:

```text
pendiente   35
aprobado     5
ignorado     0
incorporado  0
descartado   5  [backend-only legacy administrativo]

supresiones comerciales activas = 0
incidencias comerciales suprimidas = 0
aprobadas complejas incompletas = 0
```

Catálogo V3 continúa desplegado y no fue eliminado. El frontend sigue sobre V3 hasta Fase 7.


## 4.7. Fase 7 — Frontend Catálogo V4

Implementado:

- nuevo contrato TypeScript `admin.catalogo.v4.ts`;
- `CatalogStore` consume RPC/read V4;
- `AdminCatalogV4` sustituye a V3 como ruta activa;
- tabla Pendientes incorpora acción `Aprobar`;
- altas/reincorporaciones pendientes abren `resolve_product`;
- precios pendientes abren `resolve_price`;
- tipos simples conservan aprobación directa;
- propuestas automáticas pendientes ofrecen `Ignorar`;
- Ignorados ofrecen `Reactivar`;
- Aprobados ofrecen `Volver a pendiente` y `Descartar`;
- `Descartar` exige confirmación explícita;
- propuestas aprobadas complejas conservan `prepare_product/prepare_price` para actualizar staging;
- el origen visual usa `automatico | administrativo` del backend;
- no existe tab, count ni consulta frontend de `descartado`.

## 4.8. Fase 8 — Frontend Productos

Implementado:

- exclusión administrativa continúa como aprobación simple;
- reincorporación abre primero la configuración;
- `propose_product_state reincorporate` envía la configuración dentro de la misma operación;
- una reincorporación nueva ya no crea configuración pendiente después de aprobar;
- el diálogo compartido distingue `prepare | resolve | propose_reincorporation`;
- `setup_required` se conserva solo como compatibilidad con staging aprobado ya existente;
- tras un descarte, una nueva acción de Productos genera una nueva instancia administrativa mediante un nuevo `operation_id`.

## 4.9. CSS Fases 7–8

No se añadió ni modificó CSS.

Los nuevos controles reutilizan:

```text
.button
.button--secondary
.button--danger
IconButton
.admin-table-actions
.admin-table-action-cell
```

Un posible ajuste local de `min-width` queda condicionado al smoke visual de Fase 10.

## 4.10. Compatibilidad después del corte

```text
Frontend activo → Catálogo V4
Backend V4      → activo
Backend V3      → compatibilidad temporal
Frontend V3     → fuera de la ruta activa
```

Las pruebas contractuales puras de V3 se conservan. Store, integración y estructura del frontend activo pasan a pruebas V4.

# 5. Estado

```text
Plan     CONGELADO / APROBADO
Fase 1   COMPLETADA
Fase 2   COMPLETADA
Fase 3   COMPLETADA
Fase 4   COMPLETADA
Fase 5   COMPLETADA
Fase 6   COMPLETADA
Fase 7   COMPLETADA
Fase 8   COMPLETADA
Fase 9   REVALIDACIÓN PENDIENTE — CAMBIOS POST-SMOKE
Fase 10  RE-SMOKE PENDIENTE
```


---

# 6. Delta post-smoke de Fase 10

Fuente congelada:

```text
docs/SOLOG_Catalogo_V4_Delta_Smoke_Fase10_V1.md
```

Implementado:

- propuestas automáticas aprobadas pueden ignorarse;
- propuestas automáticas no pueden descartarse;
- valorizado de grupos existentes se aplica inmediatamente al resolver/preparar precio;
- presets recalculan sugerido con el nuevo precio unitario;
- `Aplicar` en valorizado completa la resolución/preparación;
- `update_group_price` absorbe propuestas equivalentes del mismo grupo;
- objetivos distintos bloquean la resolución grupal;
- publicación confirmada domina el feedback;
- cero cambios aprobados se muestra como estado informativo.

Validación backend ejecutada con transacciones + rollback:

```text
Antioqueño 750ml:
3 propuestas equivalentes → 3 aprobadas
valorizado x6 / S/183 → aplicado inmediatamente
staging de las 3 → package_action=keep

discard automática → SOLOG_CATALOG_AUTOMATIC_DISCARD_FORBIDDEN
ignore automática aprobada → ignorado + evidencia suprimida

conflicto sintético 30.5 vs 31
→ SOLOG_GROUP_PRICE_PROPOSAL_CONFLICT
→ resolución grupal bloqueada
```

Estado:

```text
Implementación delta → COMPLETADA
Validación backend   → COMPLETADA
Validación local     → REEJECUTAR bun test/lint/build
Re-smoke humano      → PENDIENTE
```
