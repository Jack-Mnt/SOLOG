# SOLOG — UI Catálogo: Plan de implementación V1

**Estado:** APROBADO / CONGELADO  
**Módulo:** Admin > Catálogo  
**Fecha:** 2026-09-10  
**Fuente primaria de ejecución:** este documento.

## 1. Autoridad, alcance y reglas de ejecución

### Fuentes

1. `docs/SOLOG_Backend_Catalogo_Contrato_Tecnico_V1.md` es la fuente técnica primaria y prevalece para toda interfaz frontend/backend.
2. `docs/SOLOG_Arquitectura_Catalogo_Responsabilidad_Comportamiento_Funciones_V1.md` es la fuente funcional de apoyo y prevalece para comportamiento y responsabilidades.
3. Si ambas fuentes entran en conflicto técnico, prevalece el contrato técnico. Si queda una incompatibilidad real que impida consumir el contrato congelado, se detiene la fase, se reporta la evidencia y no se modifica backend.

El segundo documento no estaba disponible en el repositorio al congelar este plan. Esta ausencia es un riesgo documental, no un permiso para reinterpretar decisiones: las decisiones funcionales aplicables quedan reflejadas explícitamente en este documento y en la aprobación que lo origina.

### Alcance

- Adaptar exclusivamente Admin > Catálogo al contrato Catálogo V3: `contract_version = 3`.
- Implementar Propuestas, Productos, onboarding de altas y reincorporaciones, resolución de precios en staging, preview y publicación.
- Mantener la publicación final mediante Edge Function `conexion-admin` y solamente para rol `admin`.
- Conservar las responsabilidades vigentes de Grupos fuera del flujo de staging de Catálogo.
- Hacer los ajustes mínimos a Incidencias y Grupos que sean dependencias directas de Catálogo V3.

### Fuera de alcance

- Cambiar Supabase, migraciones, RPC, Edge Functions o contratos backend.
- Reinterpretar payloads, respuestas o decisiones congeladas.
- Refactors generales de Admin, Grupos, Incidencias o tipos no requeridos por Catálogo V3.
- Eliminar o modificar la administración general de propiedades de paquete de Grupos.
- Crear una mutación Catálogo V3 para originar `eliminar_producto`.

### Reglas invariables

- Catálogo consume exclusivamente `rpc_solog_admin_catalog_read_v3` y `rpc_solog_admin_catalog_v3` para sus lecturas y mutaciones.
- Una respuesta con `contract_version !== 3` se rechaza.
- Catálogo V3 no pagina Propuestas ni Productos; se usa carga completa y filtrado local.
- Toda mutación V3 incluye `operation_id`, `expected_catalog_revision` y `expected_groups_revision`.
- Ante una confirmación incierta se reintenta con el mismo `operation_id`.
- Toda mutación exitosa invalida la caché relacionada, incluso si las revisiones no cambian.
- No se hacen actualizaciones optimistas que presupongan una confirmación autoritativa.
- La publicación final se llama solo con `{ action: "publish_catalog", operation_id }` a `conexion-admin`.

## 2. Baseline congelado

La pantalla actual está concentrada en `src/features/solog/admin/catalogo/admin.catalogo.v2.tsx` y depende de la capa compartida `admin.management.*` V2. Consume `rpc_solog_admin_master_read_v2` y `rpc_solog_admin_master_v2`, emplea `catalog_changes`, `group_products`, `price_mismatch_options`, paginación de 50 filas y revisiones master V2.

Ya son reutilizables la ruta Admin, carga diferida, tablas y diálogos, estados de loading/error/retry, control de roles, patrón de caché, invalidación, protección de respuestas cruzadas y conservación de `operation_id` de publicación. También se conserva la llamada a `conexion-admin`.

No se reutilizan como contrato de Catálogo V3: los tipos legacy de propuestas, el modal que aprueba y configura una alta en un paso, la paginación, `resolve_group_price`, ni la mutación independiente `update_package_price` dentro de Catálogo.

## 3. Deltas obligatorios aprobados

### 3.1 Proponer eliminación desde Incidencias

`propose_delete` se mantiene en Incidencias como acción humana explícita. El flujo congelado es:

```text
producto_ausente
→ administrador pulsa “Proponer eliminación”
→ se crea eliminar_producto en estado pendiente
→ Catálogo revisa, aprueba y publica
```

`producto_ausente` no crea automáticamente `eliminar_producto`. Incidencias no aprueba ni elimina; conserva solo la acción explícita vigente. No se inventa una mutación V3 de Catálogo para originar la propuesta. La integración debe comprobar que una propuesta originada así aparece en Catálogo > Propuestas como cambio emergente.

### 3.2 Precio xN y `admin.package-price.v2.tsx`

Dentro de Catálogo, un cambio de precio se resuelve exclusivamente con `prepare_price`. La decisión `package_action = keep | update`, y `precio_paquete` cuando sea `update`, queda en el staging de la propuesta y se aplica junto con publicación.

`admin.package-price.v2.tsx` no se elimina ni se refactoriza globalmente si permanece usado por Grupos u otro flujo vigente. Fuera de Catálogo, la administración general de propiedades de paquete continúa siendo responsabilidad de Grupos.

## 4. Fases aprobadas

### Fase 1 — Contratos TypeScript y acceso Catálogo V3

**Objetivo.** Crear contratos tipados exclusivos de Catálogo V3 y un adaptador que valide envelopes, contenido mínimo y `contract_version = 3`.

**Áreas previsibles.** `src/features/solog/admin/catalogo/` para tipos, validadores y acceso RPC; ajuste puntual de tipos compartidos solo si evita duplicación sin impactar otros módulos.

**RPC.** Lecturas `status`, `reference`, `proposals`, `products`, `price_options`, `publication_preview`; mutaciones `proposal_action`, `propose_product_state`, `prepare_product`, `prepare_price`.

**Sustituye.** Consumo de `catalog_changes`, `group_products`, `price_mismatch_options` y mutaciones master V2 desde Catálogo.

**Conserva.** Normalización de errores Supabase y publicación por `conexion-admin`.

**Dependencias.** Ninguna.

**Validaciones y tests.** Fixtures V3; validación estricta de cada respuesta; rechazo de versión distinta de 3; nullables; `complete`; totales; payloads RPC exactos; ausencia de accesos directos a tablas.

**Riesgos/bloqueos.** Evitar que tipos V2 de otros módulos se modifiquen por conveniencia. Un payload o respuesta faltante respecto del contrato congelado bloquea la fase y se reporta con evidencia.

**Criterio de finalización.** Existe una capa Catálogo V3 tipada y probada, sin llamadas a RPC legacy desde Catálogo.

### Fase 2 — Store, caché, revisiones e idempotencia

**Objetivo.** Incorporar un store de Catálogo aislado con caché completa por conjunto, revisiones V3, invalidación autoritativa e intenciones reintentables.

**Áreas previsibles.** Store y contexto bajo `catalogo/`; integración mínima con el ciclo de acceso Admin actual.

**RPC.** Todas las lecturas y mutaciones V3; Edge Function de publicación para conservar recibos pendientes.

**Sustituye.** La dependencia funcional del dominio master V2 para datos y mutaciones de Catálogo.

**Conserva.** Protección por usuario/rol, descarte de respuestas tardías, control de una intención pendiente, reintentos y persistencia de recibo de publicación.

**Dependencias.** Fase 1.

**Validaciones y tests.** Ambas revisiones en toda mutación; `operation_id` estable en reintentos; `replay`; `SOLOG_MASTERDATA_REVISION_CONFLICT`; lock retryable; invalidación tras éxito aunque la revisión no cambie; error/loading/retry; no datos reales de Supabase en pruebas.

**Riesgos/bloqueos.** Las revisiones del bootstrap V2 no sustituyen a las respuestas V3; el store debe tomar las revisiones devueltas por Catálogo V3 como autoridad.

**Criterio de finalización.** Los conjuntos V3 se cargan y se invalidan correctamente y toda operación incierta puede reintentarse con su mismo identificador.

### Fase 3 — Estructura principal de Catálogo

**Objetivo.** Separar explícitamente las superficies Propuestas y Productos dentro de Admin > Catálogo.

**Áreas previsibles.** Componente de página y componentes de secciones en `catalogo/`; ruta existente solo si es necesaria para carga del sucesor.

**RPC.** `status`, `proposals`, `products`.

**Sustituye.** Pantalla única centrada en propuestas y sus controles de paginación.

**Conserva.** Encabezado de versión, ruta, carga diferida, avisos y control de publicación existente.

**Dependencias.** Fases 1 y 2.

**Validaciones y tests.** Pendientes se carga completa al abrir; Productos solo bajo demanda; navegación accesible; estados de carga, vacío, error y retry.

**Riesgos/bloqueos.** No introducir fetches duplicados al alternar superficies.

**Criterio de finalización.** Propuestas y Productos tienen contenedores claros y no existe paginación backend en la UI de Catálogo.

### Fase 4 — Propuestas

**Objetivo.** Implementar los estados Pendientes, Aprobados, Ignorados e Incorporados con clasificación contractual de Urgentes y Emergentes.

**Áreas previsibles.** Lista, detalle y acciones de propuestas bajo `catalogo/`.

**RPC.** `proposals`; `proposal_action`.

**Sustituye.** `catalog_changes` y filtros remotos de propuestas.

**Conserva.** Detalle, contexto de sedes, timestamps, aprobar, ignorar y retirar aprobación.

**Dependencias.** Fases 1–3.

**Validaciones y tests.** Carga completa al abrir Pendientes y bajo demanda en los demás estados; urgentes: `agregar_producto`, `precio`, `reincorporar_producto`; emergentes: `eliminar_producto`, `excluir_producto`, `nombre`, `codigo`; candidato con `cambio_id = null`; estados `stale`, `publicable` y `block_reason`; al retirar una aprobación se recarga el estado autoritativo.

**Riesgos/bloqueos.** No inferir ni reemplazar decisiones administrativas por reglas locales.

**Criterio de finalización.** Los cuatro estados se consumen desde V3, se presentan completos y las acciones usan solo `proposal_action`.

### Fase 5 — Productos

**Objetivo.** Cargar el maestro completo y permitir búsqueda, filtro y orden local; proponer exclusión o reincorporación desde Productos.

**Áreas previsibles.** Componentes de Productos y filtros locales en `catalogo/`.

**RPC.** `products`; `propose_product_state`.

**Sustituye.** `group_products` como fuente de Productos de Catálogo y su paginación.

**Conserva.** Capacidades visuales de búsqueda y filtrado, trasladadas al cliente.

**Dependencias.** Fases 1–3.

**Validaciones y tests.** `complete = true`, `total === rows.length`, ausencia de truncamiento; filtros locales; `setup_required`; exclusión y reincorporación solo crean propuestas; datos se invalidan tras mutar.

**Riesgos/bloqueos.** No actualizar el maestro optimistamente ni ejecutar una transición directa de estado.

**Criterio de finalización.** Productos opera sobre una carga completa V3 y la exclusión/reincorporación sigue el flujo de propuesta.

### Fase 6 — Onboarding de nuevo SKU y reincorporación

**Objetivo.** Separar aprobación y configuración de altas/reincorporaciones, con staging explícito.

**Áreas previsibles.** Diálogo de configuración, selector de categoría y grupo, y presentación de `setup_required`.

**RPC.** `reference`; `proposal_action`; `prepare_product`.

**Sustituye.** Modal legacy que combina `approve` con marca, categoría, estado y grupo.

**Conserva.** Diálogos y ayuda visual de categorías/grupos compatibles.

**Dependencias.** Fases 2, 4 y 5.

**Validaciones y tests.** Aprobar y preparar son operaciones separadas; `existing_group` con `grupo_id`; `new_unit` con `categoria_id`; marca nullable; grupos incompatibles; configuración requerida; alta/reincorporación pendiente; retirar aprobación invalida setup.

**Riesgos/bloqueos.** El formulario no ofrece `Excluido` como configuración de onboarding ni infiere marca desde el nombre.

**Criterio de finalización.** Todo SKU nuevo o reincorporado aprobado se configura con `prepare_product` antes de poder publicarse.

### Fase 7 — Cambios de precio y staging

**Objetivo.** Resolver precios exclusivamente mediante staging V3 y exigir decisión explícita de precio xN cuando corresponda.

**Áreas previsibles.** Diálogo de precio en Catálogo; retiro del uso de `PackagePrice` desde este flujo únicamente.

**RPC.** `price_options`; `prepare_price`.

**Sustituye.** `price_mismatch_options`, `resolve_group_price` y `update_package_price` dentro de Catálogo.

**Conserva.** Contexto de grupo, miembros y explicación de que preparar no publica. `admin.package-price.v2.tsx` permanece sin modificación global para Grupos u otros usos vigentes.

**Dependencias.** Fases 2 y 4.

**Validaciones y tests.** `update_group_price`, `separate_sku`, `keep_structure`; `package_action = keep`; `package_action = update` con `precio_paquete > 0`; decisión xN requerida; resolución obsoleta; retiro de aprobación elimina staging asociado.

**Riesgos/bloqueos.** Nunca calcular proporcionalmente un precio xN ni preparar una resolución independiente de la propuesta.

**Criterio de finalización.** Un cambio de precio solo puede quedar listo para publicación mediante `prepare_price` y su decisión xN contractual.

### Fase 8 — Preview y publicación

**Objetivo.** Mostrar el preview V3 y ejecutar publicación por ConeXion con recuperación idempotente.

**Áreas previsibles.** Diálogo de publicación y validador de respuesta de Edge Function.

**RPC.** `publication_preview`; Edge Function `conexion-admin`.

**Sustituye.** Dependencia de `puede_publicar`, `schema_version = 1` y de estructuras internas de preview.

**Conserva.** `operation_id` persistente, replay, recuperación tras recarga y exclusividad de publicación para `admin`.

**Dependencias.** Fases 2, 4, 6 y 7.

**Validaciones y tests.** Preview válido e inválido; `codigo`, `errores`, `conflictos`; moderador puede revisar/preparar pero no publicar; admin publica; respuesta incierta conserva UUID; `completion_recorded = false`; refresco/invalidate tras éxito.

**Riesgos/bloqueos.** No consumir `preview.productos` ni `preview.grupos` para reconstruir datos locales.

**Criterio de finalización.** La UI bloquea una publicación no válida y usa exclusivamente el contrato Edge congelado para publicar.

### Fase 9 — Limpieza de dependencias legacy

**Objetivo.** Retirar del módulo Catálogo sus dependencias V2 y corregir únicamente acoplamientos directos con Grupos e Incidencias.

**Áreas previsibles.** Catálogo y sus pruebas; selector de modo en Grupos; integración Incidencias–Catálogo solamente si fuera necesaria para comprobar la visibilidad de la propuesta.

**RPC.** Catálogo V3; `propose_delete` de Incidencias se conserva como flujo humano explícito existente.

**Sustituye.** Exclusión/reincorporación desde Grupos; llamadas legacy desde Catálogo; precio xN independiente dentro de Catálogo.

**Conserva.** `propose_delete` en Incidencias; Grupos para movimientos internos Único/Agrupado, membresía, categoría y propiedades generales de paquete; `admin.package-price.v2.tsx` en sus usos externos a Catálogo.

**Dependencias.** Fases 1–8.

**Validaciones y tests.** Búsqueda estática de RPC legacy en `catalogo/`; Grupos no ofrece transición directa a Excluido/Reincorporado; `producto_ausente` no crea automáticamente una eliminación; al pulsar explícitamente `Proponer eliminación`, la propuesta queda visible en Catálogo como emergente pendiente.

**Riesgos/bloqueos.** No tocar otros consumidores de RPC V2 ni eliminar funcionalidades de Grupos o Incidencias fuera de este acoplamiento.

**Criterio de finalización.** Catálogo no depende funcionalmente de RPC legacy y los límites con Grupos e Incidencias cumplen los dos deltas obligatorios.

### Fase 10 — Tests e integración final

**Objetivo.** Consolidar la validación del módulo contra el contrato congelado sin servicios reales.

**Áreas previsibles.** Fixtures V3, pruebas unitarias, store/integración y browser/UI de Catálogo; actualización puntual de pruebas que validan los contratos retirados de Catálogo.

**RPC.** Todos los contratos V3 mockeados y `conexion-admin` mockeada.

**Sustituye.** Fixtures y aserciones V2 específicas de Catálogo.

**Conserva.** Estrategia actual de pruebas de store, contratos y navegador.

**Dependencias.** Fases 1–9.

**Validaciones y tests.** TypeScript/typecheck; pruebas unitarias; integración con RPC mockeados; pruebas UI; build; lint; `git diff --check`; cero llamadas reales a Supabase; loading/error/retry; conflictos de revisión; replay/idempotencia; staging eliminado al retirar aprobación; conjuntos completos; roles admin/moderador.

**Riesgos/bloqueos.** Una prueba que requiera Supabase real se reemplaza por fixture/mocking; no se amplía el alcance de pruebas a otros módulos sin relación directa.

**Criterio de finalización.** Todos los checks definidos pasan, Catálogo consume V3 exclusivamente y no existe truncamiento o dependencia legacy funcional.

## 5. Cierre de ejecución

Este plan queda congelado. No se implementa ninguna fase hasta recibir una instrucción explícita con el formato `Continúa con la fase N`. Cada ejecución posterior debe limitarse a esa fase y sus dependencias estrictamente necesarias, preservar cambios preexistentes y cerrar con:

1. archivos modificados;
2. comportamiento implementado;
3. validaciones y resultado;
4. tests aprobados/fallidos;
5. resultado de `git diff --check`;
6. bloqueos o desviaciones;
7. confirmación de cierre de fase.
