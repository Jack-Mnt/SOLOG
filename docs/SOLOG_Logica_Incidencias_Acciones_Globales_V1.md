# SOLOG — Lógica Incidencias — Acciones Globales V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
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

> **Bloque 1 congelado.**
