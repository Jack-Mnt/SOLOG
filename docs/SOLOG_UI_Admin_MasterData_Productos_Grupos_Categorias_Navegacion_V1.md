# SOLOG — UI Admin Master Data, Productos, Grupos, Categorías y Navegación V1

**Estado:** APROBADO / CONGELADO  
**Ámbito:** frontend Admin  
**Fecha:** 2026-09-11  

## 1. Objetivo y fuentes autoritativas

Implementar la arquitectura frontend de Master Data compartido y lazy para Productos, Grupos, Categorías y los selectores administrativos de Catálogo, sin modificar contratos backend.

Precedencia:

1. `SOLOG_Arquitectura_Admin_MasterData_Cache_Rutas_V1.md`.
2. `SOLOG_Backend_Admin_MasterData_Contrato_Tecnico_V1.md`.
3. `SOLOG_Backend_Contratos_Runtime_Actual_V1.md`.
4. `SOLOG_Arquitectura_Responsabilidades_Plataformas_V1.md`.
5. Los contratos funcionales y técnicos congelados de Catálogo y Grupos para lo no sustituido expresamente por la arquitectura Admin Master Data.

No se modifican Supabase, migraciones, SQL, RPC, Edge Functions ni contratos backend.

## 2. Baseline resumido

- `AdminStore` mantiene bootstrap de acceso, Dashboard y Control, pero no un Master Data compartido.
- Catálogo V3 combina Propuestas y Productos; Productos usa `catalogRead('products')` y el onboarding usa `catalogRead('reference')`.
- Grupos V1 usa sus lecturas propias `groups`, `reference`, `group_detail` y `products`; sus mutaciones V1, idempotencia y manejo de errores son reutilizables.
- CatalogStore y GroupsStore mantienen revisiones y cachés propias; AdminStore solo coordina parcialmente `groups`.
- Falta `/admin/productos`; el sidebar no coincide con Operación / Inventario / Sistema.
- Existe `admin.management.*` para compatibilidad de Incidencias y Dispositivos; no se retira en este bloque.

## 3. Arquitectura frontend final

`AdminStore` creará un `MasterDataStore` por sesión Admin. Será la única autoridad frontend para:

- snapshot completo normalizado de Master Data;
- índices derivados;
- revision floors de Master Data;
- intención pendiente de mutaciones de Categorías;
- epoch, invalidación y dispose de ese dominio.

El adaptador Master Data consumirá exclusivamente:

```text
rpc_solog_admin_masterdata_read_v1('bootstrap', {})
rpc_solog_admin_masterdata_v1('category_create' | 'category_rename' | 'category_reorder', payload)
```

El snapshot expone `categories`, `groups`, `products`, `setup_required`, `totals` y sus índices locales:

```text
categoryById
groupById
productsByGroupId
membersByGroupId
memberCountByGroupId
derivedTypeByGroupId
categoryCounts
compatibleCandidates
```

Catálogo conserva sus lecturas especializadas V3:

```text
proposals
price_options
publication_preview
```

`price_options` sigue siendo autoridad backend para resolución de cambios de precio y valorizado staged. Master Data no lo sustituye.

Grupos conserva únicamente sus mutaciones V1. Sus lecturas normales se derivan del Master Data compartido.

## 4. Revision floors y revisiones del snapshot

Se mantienen dos conceptos independientes.

### 4.1 `revisionFloors`

```text
revisionFloors.groups
revisionFloors.catalog
revisionFloors.categories
```

Es la revisión más nueva conocida por cualquier respuesta autoritativa de Admin, Catálogo, Grupos o Master Data. Se usa para:

- rechazar respuestas inferiores al floor aplicable;
- construir `expected_groups_revision`, `expected_catalog_revision` y `expected_categories_revision` de una intención nueva;
- decidir si una respuesta en vuelo pertenece a un contexto obsoleto.

### 4.2 `masterSnapshot.revisions`

```text
masterSnapshot.revisions.groups
masterSnapshot.revisions.catalog
masterSnapshot.revisions.categories
```

Son exclusivamente las revisiones del dataset completo actualmente cacheado. El snapshot continúa representando el master del momento en que fue descargado hasta que una operación que realmente modifica Master Data exige reemplazarlo.

Un floor superior no invalida por sí mismo el snapshot. Ejemplo congelado:

```text
bootstrap → snapshot.catalog = 10
proposal_action → floor.catalog = 11
snapshot.catalog permanece en 10 y continúa utilizable
```

Esto aplica porque `proposal_action` modifica staging/decisión, no `products[]`, `groups[]` ni `categories[]`.

### 4.3 Coordinación definitiva de revisiones

La Fase 1 entrega el mecanismo final, consumido sin rediseño posterior por todas las fases:

- `AdminStore` entrega el coordinador a MasterDataStore, CatalogStore y GroupsStore;
- toda respuesta válida publica sus revisiones al coordinador;
- el coordinador mantiene floors monotónicos por scope;
- Master Data solo reemplaza snapshot mediante bootstrap exitoso;
- las mutaciones nuevas toman expected revisions desde floors;
- cada store conserva solo caché funcional e intents de su dominio, no otra autoridad de revisiones Master Data;
- logout, cambio de identidad, dispose e incompatibilidad contractual incrementan epoch y descartan snapshot, floors, intents y respuestas pendientes.

## 5. Ciclo de vida de Master Data

1. Entrar a `/admin` valida el bootstrap de acceso existente, sin cargar Master Data.
2. Entrar a `/admin/productos` o `/admin/grupos` llama `ensureLoaded()`.
3. Una acción de Catálogo que requiera referencias llama el mismo `ensureLoaded()` lazy.
4. Solicitudes concurrentes comparten una única promesa de bootstrap.
5. Productos, Grupos, Categorías y selectores consumen el snapshot e índices locales mientras siga válido.
6. Navegar entre Catálogo, Productos y Grupos no descarga de nuevo Master Data.
7. Una mutación confirmada que cambia Master Data solicita bootstrap completo, valida contra floors y reemplaza snapshot.
8. No existe polling ni actualización optimista como fuente de verdad.

## 6. Matriz de operación, invalidación e idempotencia

| Operación o respuesta | Floors | Snapshot Master Data | Idempotencia / siguiente intención |
|---|---|---|---|
| Lectura `bootstrap` exitosa | Avanza floors si corresponde | Reemplaza snapshot completo | No aplica |
| Navegación Productos ↔ Grupos ↔ Catálogo | Sin cambio | No refetch | No aplica |
| `proposal_action`, `propose_product_state`, `prepare_product`, `prepare_price` | Observa revisiones | No refetch: staging/propuesta no modifica maestro | Transporte/lock: mismo `operation_id`; conflicto de revisión: refetch y nuevo `operation_id` |
| `price_options`, `proposals`, `publication_preview` | Observa revisiones | No refetch | Lecturas no usan `operation_id` |
| `group_create`, `group_update`, `membership_move`, `make_unique`, `valuation_save` confirmados | Actualiza floors | Invalida y solicita bootstrap completo | Transporte/lock: mismo payload e `operation_id`; conflicto: refetch, descartar intención y nuevo `operation_id` |
| `category_create`, `category_rename`, `category_reorder` confirmados | Actualiza floors, especialmente categories | Invalida y solicita bootstrap completo | Transporte/lock: mismo payload e `operation_id`; conflicto: refetch, reconstruir y nuevo `operation_id` |
| Publicación Catálogo confirmada vía `conexion-admin` | Actualiza floors desde resultado/lecturas posteriores | Invalida y solicita bootstrap completo | Respuesta incierta: conserva `operation_id`; nueva intención solo tras cierre o descarte autoritativo |
| `SOLOG_MASTERDATA_REVISION_CONFLICT` | Conserva respuesta/floor más reciente conocido | Refetch completo autoritativo | Descarta intención; nueva intención usa nuevo `operation_id` |
| `SOLOG_LOCK_CONFLICT_RETRYABLE` o transporte incierto | Sin cambio autoritativo | No refetch automático | Retry exacto con mismo payload e `operation_id` |
| `SOLOG_CATALOG_STAGING_CONFLICT` desde Grupos | Observa revisiones disponibles | Refresca autoridad necesaria sin retry automático | Descarta intención; una acción humana posterior obtiene nuevo `operation_id` |
| Logout, cambio identidad/rol, dispose | Limpia floors | Descarta snapshot | Descarta intents y respuestas en vuelo |

## 7. Fases de implementación

### Fase 1 — Contrato Master Data, caché y coordinación de revisiones

**Objetivo:** entregar el mecanismo definitivo de Master Data, floors, revisiones del snapshot, invalidación, refetch, epoch y dispose.

**Crear:**

- `src/features/solog/admin/masterdata/admin.masterdata.v1.ts`
- `src/features/solog/admin/masterdata/admin.masterdata.store.ts`
- `src/features/solog/admin/masterdata/admin.masterdata.context.tsx`
- fixtures y pruebas Master Data.

**Modificar:**

- `src/features/solog/admin/admin.v2.store.ts`
- `src/features/solog/admin/admin.v2.context.tsx`
- `src/features/solog/admin/catalogo/admin.catalogo.store.ts`
- `src/features/solog/admin/grupos/admin.grupos.store.ts`

**Cambios:**

- Adaptador y validadores runtime de bootstrap y categorías V1.
- Snapshot normalizado e índices locales.
- Carga lazy deduplicada, floors independientes, observe centralizado y expected revisions.
- Mutaciones Categorías con retry/replay/conflictos contractuales.
- Hooks de lectura de Master Data y mecanismo explícito de `ensureLoaded`.

**Tests:**

- contrato completo e inválido;
- única descarga concurrente;
- índices y relaciones derivadas;
- floors mayores que snapshot sin invalidación cuando el maestro no cambió;
- mutaciones Categorías, replay, lock, NOOP y conflicto;
- respuestas tardías, logout, rol e identidad;
- expected revisions producidas desde floors.

**Criterio de cierre:** los tres stores consumen el mismo coordinador de revisiones y no existe una segunda autoridad de `groups/catalog/categories`.

### Fase 2 — Rutas, navegación, Productos y onboarding con Master Data

**Objetivo:** separar Productos de Catálogo y migrar todo su consumo de datos auxiliares al snapshot compartido.

**Crear:**

- `src/features/solog/admin/productos/admin.productos.v1.tsx`
- componentes reutilizables de tabla, filtros y setup de producto si la extracción lo exige.

**Modificar:**

- `src/lib/router.ts`
- `src/features/solog/admin/admin.v2.app.tsx`
- `src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx`
- `src/features/solog/admin/catalogo/admin.catalogo.context.tsx`
- `src/features/solog/admin/admin.css`

**Cambios:**

- Ruta `/admin/productos` y sidebar Operación / Inventario / Sistema.
- Extraer UI actual de Productos y reutilizarla sobre Master Data local.
- Retirar la pestaña Productos de Catálogo.
- Migrar `ProductSetupDialog` en esta misma fase: categorías, grupos y datos auxiliares proceden exclusivamente del Master Data shared lazy.
- `prepare_product` permanece en CatalogStore/Catálogo V3.
- Catálogo solo carga Master Data al abrir una acción que realmente lo requiere.

**Tests:**

- rutas, sidebar y lazy loading;
- `/admin/catalogo` no hace bootstrap Master Data por sí sola;
- `/admin/productos` sí lo hace;
- Productos ↔ Grupos comparte snapshot;
- filtros, orden y paginación visual locales;
- onboarding desde Productos no llama `catalogRead('reference')`;
- propuestas de exclusión/reincorporación conservan mutaciones Catálogo V3.

**Criterio de cierre:** Productos deja de ser pestaña, usa Master Data completo y su onboarding no reintroduce lecturas `reference`.

### Fase 3 — Grupos derivado, integrantes operativos y Categorías

**Objetivo:** hacer que Grupos lea íntegramente del snapshot compartido y añadir administración limitada de Categorías.

**Crear:**

- `src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx`
- `src/features/solog/admin/grupos/admin.categories.dialog.tsx`

**Modificar:**

- `src/features/solog/admin/grupos/admin.grupos.v2.tsx`
- `src/features/solog/admin/grupos/admin.grupos.context.tsx`
- `src/features/solog/admin/admin.css`
- pruebas de Grupos y Categorías.

**Cambios:**

- Tabla `Grupo | Categoría | Integrantes | Valorizado`.
- `Único` / `N SKU` dentro de Integrantes; no columna Tipo.
- Búsquedas, filtros y orden locales por máscara, integrante, SKU, categoría, tipo derivado y valorizado.
- Modal operativo para consultar integrantes, buscar candidatos, agregar/mover y separar SKU.
- Candidatos locales excluyen `Excluido`.
- Acción directa de valorizado y lápiz exclusivo para máscara/categoría.
- `Administrar categorías`: crear, renombrar y reordenar lista completa; sin activar, desactivar, eliminar ni fusionar.
- Eliminar de la superficie activa las lecturas Grupos V1 `groups`, `reference`, `group_detail` y `products`.

**Tests:**

- derivación de integrantes, cantidad y tipo;
- candidatos sin excluidos;
- operación múltiple, separación, máscara, categoría y valorizado;
- filtros sin consultas remotas;
- conteos de categorías locales;
- create, rename, reorder completo y conflictos;
- ausencia de lecturas Grupos V1 en la UI activa.

**Criterio de cierre:** Grupos usa Master Data para lectura y exclusivamente Grupos V1 para mutaciones.

### Fase 4 — Integración transversal, publicación, conflictos y limpieza dirigida

**Objetivo:** comprobar que los mecanismos de Fase 1 son consumidos correctamente, completar invalidaciones reales y retirar caminos redundantes sin rediseñar revisiones.

**Modificar según consumidores demostrados:**

- `admin.catalogo.store.ts`
- `admin.grupos.store.ts`
- `admin.catalogo.page.v3.tsx`
- tests y estilos asociados.

**Cambios:**

- Confirmar que staging no fuerza bootstrap.
- Confirmar que mutaciones master-mutantes y publicación sí lo fuerzan.
- Integrar Catálogo con Master Data para selectores auxiliares, sin sustituir `proposals`, `price_options` ni `publication_preview`.
- Eliminar imports, hooks, CSS y tests exclusivamente ligados a caminos sustituidos.
- Mantener compatibilidad compartida que conserve consumidores reales.

**Tests:**

- publicación confirmada y bootstrap posterior;
- conflicto master, lock/transporte y replay;
- invalidaciones selectivas;
- ausencia estática de RPC legacy redundantes desde Productos/Grupos activos;
- tests de integración Catálogo ↔ Grupos ↔ Master Data;
- suite completa, TypeScript, lint, build, Vite build y `git diff --check`.

**Criterio de cierre:** toda invalidación y revisión usa el mecanismo entregado en Fase 1; no se introduce otra arquitectura de revisiones.

## 8. Legacy temporal

Se preservan hasta comprobar consumidores:

- superficies desplegadas de lectura Catálogo V3 y Grupos V1;
- adaptadores y tipos de lectura que otros módulos o pruebas aún usen;
- `admin.management.*`, necesario para Incidencias y Dispositivos;
- CSS y fixtures legacy fuera de las superficies migradas.

No se preserva funcionalmente en Productos/Grupos activo ningún consumo redundante sustituido por Master Data.

## 9. Fuera de alcance

- Supabase, migraciones, SQL, RPC, Edge Functions y contratos backend.
- Motor, Cajero, Control, Incidencias y Dispositivos.
- Reglas comerciales de Catálogo, publicación ConeXion y lógica de propuestas.
- Rediseños generales de Admin ajenos a rutas, navegación y las superficies congeladas.
- Categorías: activar, desactivar, eliminar, fusionar.

## 10. Bloqueos backend

**No existe ningún bloqueo backend actual.**

Los contratos congelados cubren bootstrap completo, revisiones triples, categorías, idempotencia, retry, conflictos, mutaciones Grupos V1, staging Catálogo V3, `price_options`, preview y publicación.
