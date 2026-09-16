# SOLOG — Lógica Incidencias — Acciones Globales V1

**Proyecto:** SOLOG  
**Estado:** CERRADO — VALIDADO TÉCNICA Y HUMANAMENTE
**Clasificación:** Nivel C — lógica de negocio, contrato Admin e integración backend/frontend  
**Fecha:** 2026-09-16

## 1. Fuente primaria y precedencia

Este documento es la **fuente primaria del Bloque 1** de la corrección global de SOLOG/Admin.

Prevalece únicamente para:
- Ignorar 30 días;
- Reactivar incidencia;
- detalle multisede;
- selección de fuente para Proponer eliminación;
- coherencia de caché de `deletion_proposed`;
- feedback inmediato de estas acciones.

Todo lo demás de Admin continúa regido por la documentación vigente.

Para Incidencias, este documento reemplaza cualquier regla anterior que permita a la UI de SOLOG/Admin crear nuevas supresiones `site-scoped`.

## 2. Preflight confirmado

Se verificó el backend desplegado en `PuertoRicoOnline`:

- `rpc_solog_admin_incidents_v2` ya admite `scope: "global" | "site"`;
- `ignore_30d` global crea una exclusión con `sede_id = null`;
- la fecha `until` se calcula una sola vez y se aplica a todas las incidencias activas de la familia;
- `reactivate` global revoca la exclusión global y reactiva las incidencias suprimidas aplicables;
- `detail` ya permite omitir `site_id` para consultar la familia en todas las sedes;
- la revisión global ya existe mediante `inventario.solog_revision_get('incidents', null)`;
- los cambios en `inventario.incidencias` incrementan revisión local y global;
- `inventario.exclusiones_incidencias` contiene actualmente **0 filas**, por lo que no se requiere migración de datos legacy antes de este bloque.

## 3. Contrato congelado

### 3.1 Summary

El `summary` por sede debe exponer, además de la revisión local existente, la revisión global de Incidencias.

Contrato objetivo:

```ts
revisions: {
  incidents: number
  incidents_global: number
}
```

- `incidents`: revisión de la sede solicitada.
- `incidents_global`: `solog_revision_get('incidents', null)`.

El cambio es aditivo y no altera `contract_version: 2`.

### 3.2 Ignorar

Desde SOLOG/Admin:

```text
Ignorar 30 días = alcance global por family_key
```

La UI enviará:
- `scope: "global"`;
- sin `site_id` como scope operativo;
- `expected_revision = revisions.incidents_global`.

Una única operación:
- crea o actualiza la exclusión global;
- usa una única fecha `until`;
- suprime todas las incidencias activas de la familia en todas las sedes.

SOLOG/Admin deja de crear nuevas supresiones por sede.

### 3.3 Reactivar

```text
Reactivar = alcance global por family_key
```

Usa:
- `scope: "global"`;
- `expected_revision = revisions.incidents_global`.

La reactivación afecta la exclusión global de la familia.

### 3.4 Proponer eliminación

`propose_delete` permanece **site-scoped** porque la sede representa la evidencia concreta que origina la propuesta.

La fuente elegible debe cumplir además:

```ts
source.family.family_state === "pendiente"
```

No puede usarse una fuente `suprimida` o `resuelta` únicamente porque el agregado multisede esté clasificado como Pendiente.

## 4. Detalle multisede

En alcance normal por sede:
- `detail` conserva `site_id`.

En `Todas las sedes`:
- `detail` se consulta sin `site_id`;
- el modal muestra la familia completa;
- queda prohibido resolver el detalle mediante `sources[0]`.

## 5. Caché y estado local

### 5.1 Ignorar / Reactivar

Tras éxito:
- cerrar el modal/confirmación;
- actualizar o invalidar de forma coherente los summaries afectados;
- no conservar un objeto de modal obsoleto que permita repetir la misma acción.

### 5.2 Proponer eliminación

`deletion_proposed` es global respecto al SKU propuesto.

Tras confirmar `propose_delete`:
- todos los summaries cacheados que contengan el mismo producto/familia aplicable deben reflejar `deletion_proposed = true` o invalidarse;
- no debe reaparecer `CircleOff` desde otra sede usando caché antigua.

## 6. Feedback congelado

Mensajes:

- Ignorar: **“La incidencia fue ignorada durante 30 días.”**
- Reactivar: **“La incidencia fue reactivada.”**
- Proponer eliminación: **“La propuesta de eliminación quedó pendiente para revisión en Catálogo.”**

La idempotencia y el `operation_id` continúan internamente; no forman parte del texto normal mostrado al usuario.

## 7. Fuera de alcance

- rediseñar la tabla de Incidencias;
- cambiar los tipos de incidencia;
- modificar Catálogo;
- modificar RLS;
- retirar soporte backend `scope: "site"` para consumidores distintos de esta UI;
- cambiar la duración de 30 días.

## 8. Criterios de aceptación

1. Ignorar desde cualquier sede produce una única supresión global.
2. Todas las sedes comparten el mismo `until`.
3. Reactivar actúa globalmente.
4. Un agregado Pendiente nunca usa una fuente suprimida para `propose_delete`.
5. El detalle de Todas las sedes incluye todas las sedes.
6. No puede repetirse Ignorar por estado local obsoleto.
7. `deletion_proposed` no reaparece por caché de otra sede.
8. Tests, lint, build y `git diff --check` pasan.
9. Smoke humano de Incidencias confirma los flujos.

## 9. Estado desplegado y validación técnica

### 9.1 Backend

Desplegado en Supabase mediante:

```text
20260916111254_solog_admin_incidents_v2_summary_global_revision
```

El contrato real de `public.rpc_solog_admin_incidents_v2` mantiene:

```text
contract_version = 2
```

y `summary` expone:

```ts
revisions: {
  incidents: number
  incidents_global: number
}
```

Validación directa ejecutada con contexto `authenticated` y rollback de la transacción de prueba:

- `summary` por sede devuelve ambas revisiones;
- `summary` global devuelve ambas revisiones;
- `incidents_global` se entrega como número JSON;
- `anon` no tiene permiso `EXECUTE` sobre la RPC;
- `authenticated` conserva el acceso previsto.

### 9.2 Frontend

Implementado:

- Ignorar con `scope: "global"` y `revisions.incidents_global`;
- Reactivar con `scope: "global"` y `revisions.incidents_global`;
- `propose_delete` permanece `site-scoped` y exige fuente Pendiente;
- detalle multisede omite `site_id`;
- se eliminó el uso de `sources[0]` para el detalle agregado;
- `deletion_proposed` se reconcilia entre summaries cacheados;
- Ignorar/Reactivar invalidan coherentemente los summaries mediante revisión global;
- se aplicaron los mensajes de feedback congelados.

No se adelantaron los cambios visuales/UX del Bloque 2.

### 9.3 Evidencia técnica

Validación en Bun `1.3.14`:

- tests dirigidos del Bloque 1: **54 pass / 0 fail**;
- suite completa: **360 pass / 9 fail**;
- los 9 fallos pertenecen exclusivamente a `tests/global-g2.test.ts` por representación horaria dependiente de plataforma;
- el mismo archivo sobre el HEAD base `d4130809cd44add92367756cc0617dca8cbc1ec0` presenta los mismos **9 fallos**, por lo que no constituyen una regresión del Bloque 1;
- `bun run lint`: correcto;
- `bun run build`: correcto;
- `git diff --check`: correcto;
- `git diff --check d4130809cd44add92367756cc0617dca8cbc1ec0...HEAD`: correcto.

### 9.4 Cierre

El smoke humano de Incidencias fue completado con éxito y el Bloque 1 queda cerrado.

> **Bloque 1 congelado, implementado y validado. Puede avanzarse al Bloque 2 conforme a su fuente primaria.**
