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
- ampliar `cambios_catalogo`;
- crear supresión comercial exacta;
- backfill de origen y legacy;
- helper único de identidad;
- identidad por instancia administrativa.

## Fase 3 — Motor de candidatos comerciales
- `catalogo_candidatos()` respeta supresión exacta;
- conservar agregación multisede;
- misma evidencia no reaparece;
- evidencia distinta sí puede aparecer.

## Fase 4 — Motor de transiciones
- `ignore`;
- `reactivate`;
- `withdraw`;
- `discard`;
- staging y auditoría coordinados.

## Fase 5 — Aprobación atómica
- `resolve_product`;
- `resolve_price`;
- `propose_product_state` resuelto en una sola operación.

## Fase 6 — Lecturas, preview y publicación
- `origen` autoritativo;
- `descartado` fuera de lecturas/counts;
- RPC V4;
- preview/publicación solo con aprobados elegibles.

## Fase 7 — Frontend Catálogo
- consumir V4;
- `Aprobar` en tabla;
- resolver antes de aprobar;
- Ignorar/Reactivar;
- Volver a pendiente/Descartar;
- sin UI de Descartados.

## Fase 8 — Frontend Productos
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

# 4. Estado

```text
Plan     CONGELADO / APROBADO
Fase 1   COMPLETADA
Fase 2   PENDIENTE
Fase 3   PENDIENTE
Fase 4   PENDIENTE
Fase 5   PENDIENTE
Fase 6   PENDIENTE
Fase 7   PENDIENTE
Fase 8   PENDIENTE
Fase 9   PENDIENTE
Fase 10  PENDIENTE
```
