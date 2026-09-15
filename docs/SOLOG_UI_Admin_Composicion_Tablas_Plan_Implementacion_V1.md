# SOLOG — UI Admin — Composición de Tablas: Plan de Implementación V1

**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — implementación funcional frontend Admin  
**Fuente primaria funcional:** `docs/SOLOG_UI_Admin_Composicion_Tablas_V1.md`  
**Delta post-revisión vigente:** `docs/SOLOG_Correccion_Admin_Primitives_Tablas_V1.md`

> **Estado de ejecución:** F1–F4 y la revisión global técnica fueron completadas. Este plan se conserva como historial técnico de ejecución. Las correcciones posteriores se rigen por el delta post-revisión.

## Objetivo

Implementar exclusivamente la composición congelada de las tablas principales del Admin: Control, Productos, Grupos, Incidencias y Catálogo. El resultado conserva lógica, consultas, handlers, modales, paginación y Table Shell existentes, salvo los cambios expresamente aprobados por la fuente primaria.

## Jerarquía de fuentes

1. Contratos funcionales y backend vigentes.
2. `docs/SOLOG_UI_Admin_Composicion_Tablas_V1.md` para comportamiento y alcance de este bloque.
3. Este plan para ordenar la ejecución.
4. Fuentes relacionadas vigentes:
   - `docs/SOLOG_UI_Sistema_Visual_V1.md`
   - `docs/SOLOG_UI_Admin_Secciones_Tablas_Base_V1.md`
   - `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`
   - `docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`
   - `docs/SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md`

Ante contradicción, la fuente primaria funcional prevalece sobre este plan.

## Baseline registrado

- Rama: `master`.
- Commit base: `af38875` (`docs: validate admin table composition feasibility`).
- Working tree: limpio al preparar el plan.
- Infraestructura ya consolidada: `admin-table-section`, `admin-toolbar-surface`, `QuickFilterChip`, `StateView`, `AdminSort` e `IconButton`.
- Verificación inicial: `git diff --check` correcto.

## Restricciones generales

- Frontend únicamente.
- No modificar Supabase, RPC ni contratos backend.
- No realizar refactors generales ni trabajo fuera de F1–F4.
- No rediseñar decisiones funcionales congeladas.
- Preservar cambios preexistentes.
- Mantener lógica, handlers, modales, paginación y queries, salvo cambio expresamente aprobado.
- No reabrir el Table Shell, toolbar, labels, densidad, columnas, anchos, wrapping, responsive, filas o celdas fuera del alcance de cada fase.
- `IconButton` se amplía con variante `Info/Primary`.
- La normalización de `CatalogProposal.datos` permanece exclusivamente en frontend.
- Incidencias inicia en `Pendientes`; no existe StateView `Todos`.
- Las tres StateView de Incidencias reutilizan provisionalmente la tabla y acciones actuales, sin consultas nuevas ni composiciones específicas por estado.

## F1 — Primitive compartida y Control

**Objetivo:** ampliar la semántica de `IconButton` y aplicar la composición congelada de Control.

**Cambios principales:**

- Añadir variante `Info/Primary` a `IconButton` y su estilo asociado.
- Renombrar `Origen` como `Registrado` y moverla a primera posición.
- Conservar `origin_at`, su formato de fecha/hora, filtros, QuickFilterChip, Detail, scroll, paginación y queries.

**Archivos/módulos probablemente afectados:**

- `src/features/solog/admin/admin.primitives.tsx`
- `src/features/solog/admin/admin.css`
- `src/features/solog/admin/control/admin.control.v2.tsx`

**Dependencias:** ninguna. La variante creada será utilizada por F2.

**Validaciones aprobadas:** pruebas dirigidas relacionadas, `git diff --check` y smoke de Control e `IconButton`.

**Criterio de finalización:** Control muestra `Registrado | Grupo | Categoría | Estado | Diferencia | Valorizado | Detalle` sin regresión funcional ni cambio de presentación interna de fecha/hora.

## F2 — Productos: filtro, composición y acción

**Objetivo:** aplicar la composición congelada de Productos y convertir Modalidad en QuickFilterChip.

**Cambios principales:**

- Eliminar el filtro independiente Incluido/Excluido.
- Aplicar QuickFilterChip `Todos | Únicos | Agrupados | Excluidos` para modalidad.
- Retirar la columna Estado.
- Componer Grupo con atributo `Único | Agrupado | Excluido` y nombre de grupo; Único conserva nombre de grupo.
- Sustituir la acción textual por `IconButton`: Danger al excluir e Info/Primary al reincorporar.
- Conservar modal, `aria-label`, disabled, handlers, filtros restantes, sort y paginación.

**Archivos/módulos probablemente afectados:**

- `src/features/solog/admin/productos/admin.productos.v1.tsx`
- `src/features/solog/admin/productos/admin.productos.model.ts`
- `src/features/solog/admin/admin.css`
- Ajustes de pruebas acopladas, solo si existen y son necesarios.

**Dependencias:** F1, por la variante Info/Primary de `IconButton`.

**Validaciones aprobadas:** pruebas dirigidas de Productos; typecheck o lint si los cambios lo justifican; `git diff --check`; smoke de filtros, acción, modal y paginación.

**Criterio de finalización:** Productos muestra `Producto | C. interno | Categoría | Grupo | Precio | Acción`, sin filtro Estado separado ni pérdida de capacidad de filtro.

## F3 — Grupos e Incidencias: controles de estado y acciones

**Objetivo:** aplicar los controles semánticos y la composición aprobada de Grupos e Incidencias sin especializar aún las tres tablas de Incidencias.

**Cambios principales:**

- Grupos: convertir Integrantes y Valorizado a QuickFilterChip; mover editar Grupo y editar Valorizado a columna Acciones; usar `Package` en estado normal y `PackageOpen` en hover, sin cambio de layout ni etiqueta accesible.
- Incidencias: reemplazar el select Estado por StateView `Pendientes | Suprimidas | Resueltas`; iniciar en Pendientes; derivar cada vista desde `summary` por `family_state` sin consultas nuevas.
- Incidencias: las tres vistas conservan temporalmente las mismas columnas, filas y acciones actuales.

**Archivos/módulos probablemente afectados:**

- `src/features/solog/admin/grupos/admin.grupos.v2.tsx`
- `src/features/solog/admin/incidencias/admin.incidencias.v2.tsx`
- `src/features/solog/admin/admin.css`

**Dependencias:** usa primitives existentes; no requiere backend ni depende funcionalmente de F2.

**Validaciones aprobadas:** pruebas dirigidas de Grupos e Incidencias; typecheck o lint si corresponde; `git diff --check`; smoke de QuickFilterChip, acciones de Grupos y navegación/ARIA de StateView.

**Criterio de finalización:** Grupos tiene columna Acciones final y filtros rápidos funcionales; Incidencias inicia en Pendientes y cada StateView muestra solamente su `family_state` manteniendo tabla y acciones provisionales.

## F4 — Catálogo: identidad compuesta y columna Cambio

**Objetivo:** aplicar la composición congelada de propuestas de Catálogo con normalización de datos solo en frontend.

**Cambios principales:**

- Fusionar C. interno y Producto en una identidad compuesta.
- Simplificar Origen mediante etiquetas compactas.
- Agregar Cambio para precio, agregar/eliminar, excluir/reincorporar, nombre y código.
- Normalizar o tipar `CatalogProposal.datos` por tipo sin cambiar el contrato remoto.
- Conservar Tipo, StateView, workflow, modal, acciones y consultas existentes.

**Archivos/módulos probablemente afectados:**

- `src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx`
- `src/features/solog/admin/catalogo/admin.catalogo.v3.ts`
- `src/features/solog/admin/admin.css`, solo si la presentación existente lo requiere.
- Ajustes de pruebas acopladas, solo si existen y son necesarios.

**Dependencias:** independiente de F1–F3; debe preservar sus primitives y shell ya consolidados.

**Validaciones aprobadas:** pruebas dirigidas de Catálogo; typecheck o lint si corresponde; `git diff --check`; smoke de todos los tipos de Cambio y confirmación de ausencia de consultas adicionales.

**Criterio de finalización:** Catálogo muestra `Tipo | Producto | Cambio | Origen | Acción`; Cambio funciona con todos los tipos soportados por el payload actual.

## Revisión global final

Al completar F1–F4 ejecutar:

- `bun test --reporter=dot`
- `bun run lint`
- `bun run build`
- `git diff --check`
- Revisión global contra `docs/SOLOG_UI_Admin_Composicion_Tablas_V1.md`.
- Smoke integrado de Control, Productos, Grupos, Incidencias y Catálogo.

La revisión confirma además que no hubo cambios de backend, Supabase, RPC, contratos, consultas adicionales de Incidencias ni regresiones de modales, paginación, acciones o accesibilidad.

## Bloqueos

No existen bloqueos conocidos.

## Fuera de alcance

- Backend, Supabase, RPC, RLS y contratos.
- Refactors generales.
- Columnas prioritarias, anchos, min-width, alineación, wrapping, truncado y responsive final.
- Densidad, altura, padding, tipografía y diseño interno de filas/celdas.
- Sticky columns y sort por columnas.
- Dialogs/modals, salvo conservar los flujos ya existentes.
- Tablas, columnas y acciones específicas por StateView de Incidencias.
- Trabajo adicional fuera de F1–F4.

F1–F4 ya fueron ejecutadas. Para cualquier corrección posterior relacionada con este bloque debe utilizarse `docs/SOLOG_Correccion_Admin_Primitives_Tablas_V1.md` como fuente primaria del delta, sin reabrir ni reinterpretar las fases completadas.