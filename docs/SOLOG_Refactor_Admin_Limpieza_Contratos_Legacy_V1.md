# SOLOG — Refactor Admin: Limpieza de contratos legacy V1

**Estado:** Congelado — fuente primaria aprobada
**Fecha:** 26 de septiembre de 2026
**Clasificación:** Nivel B — limpieza estructural frontend con cleanup backend dependiente
**Proyecto:** SOLOG
**Rama de trabajo:** `admin-work`
**Baseline conocido al preflight:** `fd8cf42bee97ca5ce3b88dae5989e139b1f0920c`

---

## 1. Propósito

Este documento congela las decisiones y el plan aprobado para retirar contratos, rutas y compatibilidades legacy del Admin de SOLOG que ya no forman parte del runtime funcional vigente.

El objetivo es reducir superficie técnica obsoleta sin alterar el comportamiento funcional actual de:

- Dashboard;
- Control;
- Incidencias;
- Dispositivos;
- Catálogo;
- Productos;
- Grupos.

La limpieza se ejecutará primero en frontend, se validará y desplegará, y solo después se retirarán los contratos backend correspondientes.

---

## 2. Fuente primaria y precedencia

Este archivo es la **fuente primaria para la retirada de compatibilidad legacy cubierta por este bloque**.

Cuando exista contradicción dentro de este alcance, prevalece sobre descripciones anteriores que todavía presenten como vigentes los contratos aquí marcados para retiro.

No reemplaza las decisiones funcionales de los módulos actuales ni reabre bloques ya cerrados.

Fuentes de referencia subordinadas:

- `SOLOG_UI_Admin_Fase12_Cierre_Global_V1.md`;
- `SOLOG_Arquitectura_Admin_MasterData_Cache_Rutas_V1.md`;
- `SOLOG_Backend_Admin_MasterData_Contrato_Tecnico_V1.md`;
- `SOLOG_Backend_Grupos_Contrato_Tecnico_V1.md`;
- `SOLOG_Backend_Contratos_Runtime_Actual_V1.md`;
- `SOLOG_Backend_Admin_Drawers_Fase8_2B_Optimizacion_Egress_V1.md`;
- `SOLOG_Backend_Incidencias_Contrato_Tecnico_V2.md`;
- `SOLOG_UI_Admin_Dialogs_Fase4_Confirmaciones_V1.md`;
- `SOLOG_UI_Admin_Dialogs_Normalizacion_Formato_Kind_V1.md`;
- `SOLOG_UX_Admin_Feedback_Mutaciones_V1.md`.

En particular:

- MasterData V1 prevalece sobre las lecturas legacy de Groups Read V1 donde corresponda;
- `detail_sites` es la superficie autoritativa actual para detalle de Incidencias;
- `daily_detail_bootstrap` + `daily_detail_page` sustituyen `daily_detail`;
- `control_chronology_view` sustituye `control_chronology`;
- la UX actual de Dispositivos no contempla `replace`.

---

## 3. Decisiones congeladas

### 3.1. Contratos y compatibilidades que se retiran

Se aprueba retirar completamente del frontend y, después del corte seguro de producción, del backend cuando corresponda:

#### Master V2

- `rpc_solog_admin_master_read_v2`;
- `rpc_solog_admin_master_v2`;
- dominio `master` dentro de `admin.management.*`;
- publicación y estado legacy asociados exclusivamente a Master V2.

#### Groups Read V1

- `rpc_solog_admin_groups_read_v1`;
- `groupsRead`;
- tipos, payloads, validadores y helpers frontend exclusivos de lectura V1.

#### Operacional legacy

- `daily_detail`;
- `control_chronology`;
- `control_page`;
- `control_detail`.

#### Incidencias

- fallback legacy `detail`;
- lógica que convierte `detail` en detalle por sedes;
- detección de error usada exclusivamente para activar ese fallback.

#### Dispositivos

- acción `replace` en frontend y backend.

---

### 3.2. Contratos y comportamientos que se conservan

Se consideran runtime actual y quedan explícitamente fuera de cualquier eliminación accidental:

#### Admin compartido

- `ManagementStore` como infraestructura compartida de Incidencias y Dispositivos;
- cache, retry, idempotencia, `operation_id`, aislamiento e invalidaciones vigentes;
- coordinación `propose_delete → catalog.refresh()`.

#### MasterData / Grupos / Catálogo

- MasterData V1;
- Groups V1 **mutations**;
- `rpc_solog_admin_groups_v1`;
- `inventario.solog_admin_groups_v1`;
- Catálogo V4;
- `inventario.solog_admin_catalog_v2` mientras siga siendo dependencia de Groups V1.

#### Dashboard y Control

- `dashboard_cards`;
- `shift_grid`;
- `daily_detail_bootstrap`;
- `daily_detail_page`;
- `control_groups`;
- `control_chronology_view`;
- `export`.

#### Incidencias

- `summary`;
- `detail_sites`;
- `ignore_30d`;
- `reactivate`;
- `propose_delete`.

#### Dispositivos

- `list`;
- `authorize`;
- `revoke`;
- `reject`.

---

## 4. Decisiones arquitectónicas del cleanup

### 4.1. `ManagementStore`

Se conserva.

La limpieza será **quirúrgica**: se eliminará únicamente el dominio `master` y su maquinaria exclusiva.

No se aprueba:

- dividirlo en `IncidentsStore` y `DevicesStore`;
- realizar un refactor arquitectónico general;
- rediseñar su estrategia de cache, retry o idempotencia.

### 4.2. Incidencias `detail`

Se retira el fallback legacy.

El frontend asumirá `detail_sites` como contrato único y autoritativo para el detalle por sedes. Un error de `detail_sites` será tratado como error real; no disparará una segunda API legacy.

### 4.3. Dispositivos `replace`

Se retira.

El flujo funcional vigente queda:

```text
revocar dispositivo actual
→ sede disponible
→ nueva solicitud
→ autorizar nuevo dispositivo
```

### 4.4. Compatibilidad operacional

Se retiran las cuatro acciones legacy:

```text
daily_detail
control_chronology
control_page
control_detail
```

No se conserva compatibilidad transitoria para ellas después del corte de producción aprobado en este plan.

---

## 5. Regla de seguridad principal

La secuencia obligatoria es:

```text
cleanup frontend
→ validación técnica
→ deployment confirmado
→ verificación de producción
→ cleanup backend
```

**No se eliminará ningún contrato backend mientras exista una versión desplegada del frontend que todavía pueda consumirlo.**

El merge por sí solo no cuenta como confirmación de producción.

---

# 6. Plan aprobado

## Fase 1A — Cleanup frontend: Management + Groups

Objetivo: retirar las dos superficies legacy compartidas de mayor alcance dejando el repositorio en estado técnicamente válido antes de continuar.

### Alcance

#### `admin.management.v2.ts`

Retirar:

- dominio `master`;
- tipos y payloads Master;
- reads Master V2;
- mutations Master V2;
- routing a `rpc_solog_admin_master_read_v2`;
- routing a `rpc_solog_admin_master_v2`;
- `publishManagement`;
- resultado/estado de publicación exclusivo de Master;
- validadores exclusivos de Master.

Conservar únicamente contratos de:

- `incidents`;
- `devices`.

#### `admin.management.store.ts`

Retirar solo residuos Master:

- invalidaciones `domain === 'master'`;
- estado/receipt de publicación;
- `publish()`;
- `expected_groups_revision` cuando pertenezca exclusivamente a Master;
- `price_mismatch_options` legacy;
- invalidaciones de `publication_preview/status`;
- cualquier branch exclusivo de Master.

Preservar expresamente:

- retry;
- idempotencia;
- `operation_id`;
- caches vigentes;
- aislamiento por dominio/sede;
- revisiones actuales;
- coordinación Incidencias → Catálogo.

Actualizar o retirar comentarios obsoletos como referencias a “Catálogo V3” cuando ya no describan el runtime vigente.

#### `admin.grupos.v1.ts`

Retirar exclusivamente la superficie de lectura:

- `GroupsReads`;
- `GroupsReadAction`;
- payloads/resultados de lectura;
- `validateGroupsRead`;
- `groupsRead`.

Conservar completamente la superficie de mutación vigente.

### Tests de Fase 1A

Actualizar los tests y fixtures directamente afectados por este cambio para que el repositorio permanezca coherente al finalizar 1A.

No se deben borrar garantías vigentes de:

- Incidencias;
- Dispositivos;
- retry;
- idempotencia;
- aislamiento;
- Groups mutations.

### Gate técnico intermedio obligatorio

Antes de iniciar 1B deben pasar:

```bash
bun test
bun run lint
bun run build
```

También ejecutar:

```bash
git diff --check
```

Si alguno falla por una regresión real de 1A, se corrige antes de continuar.

---

## Fase 1B — Cleanup frontend: Operacional + Incidencias + Dispositivos + harnesses

Objetivo: retirar el resto de contratos legacy aprobados y completar la migración de cobertura técnica.

### Operacional

En `admin.v2.ts`, `admin.v2.store.ts` y dependencias relacionadas retirar tipos, payloads, validadores, scopes, cache branches e invalidaciones exclusivas de:

```text
daily_detail
control_chronology
control_page
control_detail
```

Mantener:

```text
daily_detail_bootstrap
daily_detail_page
control_groups
control_chronology_view
```

Las garantías de cache, scope, refresh, invalidación y aislamiento que todavía sean válidas deben migrarse a las acciones actuales, no eliminarse junto con las acciones legacy.

### Incidencias

Retirar:

- fallback `detail`;
- `legacyFallback`;
- query legacy;
- conversión de resultados legacy a sedes;
- validaciones/tipos exclusivos de `detail`.

`detail_sites` queda como único contrato de detalle.

### Dispositivos

Retirar `replace` de:

- tipos;
- payloads;
- routing;
- validaciones;
- fixtures;
- tests legacy.

La UI actual no debe recibir cambios funcionales adicionales.

### Tests y fixtures

Migrar o limpiar, según corresponda:

- `admin-management.test.ts`;
- `admin-management-isolation.test.ts`;
- `admin-groups-v1.test.ts`;
- `admin-v2.test.ts`;
- `admin-v2-isolation.test.ts`;
- `admin-shell-devices.test.ts`;
- `admin-control-v3.test.ts`;
- fixtures asociados.

Las pruebas que usaban contratos legacy solo como vehículo para comprobar infraestructura deberán migrarse a contratos actuales equivalentes.

### Browser harnesses

`admin-management.browser.mjs` debe evaluarse como harness histórico. Puede:

- reducirse a Incidencias + Dispositivos actuales; o
- eliminarse si su cobertura ya está reemplazada por suites actuales y puede demostrarse.

No debe mantenerse código ficticio de:

- Master V2;
- Groups reads remotos;
- Productos legacy;
- `group_change_save` legacy;
- `replace`.

Actualizar allowlists para que los contratos retirados no puedan reaparecer silenciosamente.

---

## Fase 2 — Revisión global + validación frontend

### Auditoría estática

Debe comprobarse ausencia de consumidores runtime frontend de:

```text
rpc_solog_admin_master_read_v2
rpc_solog_admin_master_v2
rpc_solog_admin_groups_read_v1
groupsRead
validateGroupsRead
daily_detail
control_chronology
control_page
control_detail
replace
detail
```

La búsqueda de `detail` debe distinguir la acción RPC legacy de usos genéricos legítimos de la palabra.

### Validación técnica completa

Ejecutar:

```bash
bun test
bun run lint
bun run build
git diff --check
```

También ejecutar los browser/integration harnesses que continúen vigentes para las superficies afectadas.

### Revisión del diff

Verificar:

- ningún cambio funcional no aprobado;
- ningún refactor general ajeno al bloque;
- ninguna eliminación accidental de contratos actuales;
- preservación de cambios preexistentes;
- ausencia de imports/helpers muertos derivados del cleanup.

### Smoke humano mínimo

Validar:

1. Dashboard → detalle diario.
2. Control → cronología vigente.
3. Incidencias → detalle por sedes.
4. Incidencias → ignorar/reactivar.
5. Incidencias → proponer eliminación y actualización de Catálogo.
6. Dispositivos → autorizar.
7. Dispositivos → revocar.
8. Dispositivos → rechazar.
9. Grupos → mutaciones vigentes.
10. Catálogo → flujo actual relevante.

---

## Fase 3 — Deploy + verificación del corte

Esta fase es un gate obligatorio antes de tocar Supabase.

### Requisitos

1. desplegar el frontend limpio;
2. confirmar que Cloudflare sirve el deployment correcto;
3. realizar smoke breve sobre el deployment;
4. verificar que producción ya no depende de los contratos legacy;
5. revisar nuevamente:
   - logs PostgREST;
   - callers SQL;
   - triggers;
   - cron;
   - Edge Functions.

No asumir despliegue solo porque exista merge o push.

---

## Fase 4 — Cleanup backend + validación

Esta fase será ejecutada principalmente por ChatGPT sobre Supabase, no por Codex, salvo instrucción explícita posterior del usuario.

Los cambios deben realizarse en pasos atómicos y verificables, aunque pertenezcan a una sola fase administrativa.

### 4.1. Master V2

Retirar:

```text
public.rpc_solog_admin_master_read_v2
public.rpc_solog_admin_master_v2
```

Después reevaluar dependencias y posible orfandad de helpers como:

```text
inventario.solog_group_change_save_v2
inventario.solog_group_change_save_immediate
inventario.solog_normalize_group_v2
```

No eliminarlos sin verificación de callers actualizada.

No retirar:

```text
inventario.solog_admin_catalog_v2
```

mientras siga siendo dependencia de Groups V1 vigente.

### 4.2. Groups Read V1

Retirar, tras revalidar callers:

```text
public.rpc_solog_admin_groups_read_v1
inventario.solog_admin_groups_read_v1
```

### 4.3. Operacional

Modificar `rpc_solog_operational_v2` para retirar branches:

```text
daily_detail
control_chronology
control_page
control_detail
```

Después reevaluar helpers internos que queden realmente sin caller, incluyendo `solog_control_chronology_v10` si corresponde.

### 4.4. Incidencias

Retirar branch `detail` de `rpc_solog_admin_incidents_v2`.

Mantener `detail_sites` como contrato autoritativo.

Reevaluar helpers exclusivos de `detail` antes de cualquier eliminación adicional.

### 4.5. Dispositivos

Retirar `replace` de `rpc_solog_admin_devices_v2`.

No alterar la semántica de:

```text
authorize
revoke
reject
```

### Reglas backend obligatorias

- no usar `CASCADE`;
- revalidar dependencias antes de cada drop;
- conservar funciones internas todavía llamadas;
- ejecutar pruebas sintéticas de los contratos actuales;
- revisar advisors;
- verificar cron, triggers y Edge Functions;
- comprobar ausencia de referencias residuales.

---

## Fase 5 — Reconciliación documental + cierre

Actualizar la documentación vigente afectada para reflejar el runtime final.

Como mínimo, reconciliar:

- contrato consolidado de runtime Admin;
- MasterData;
- Groups;
- Drawer/Egress donde describa compatibilidad anterior;
- Incidencias;
- Dispositivos.

Marcar explícitamente como retirados:

```text
Master V2
Groups Read V1
daily_detail
control_chronology
control_page
control_detail
Incidents detail
Devices replace
```

Las fuentes anteriores se conservan como historial; no deben reescribirse para fingir que esos contratos nunca existieron.

Después realizar una revisión global proporcional y cerrar explícitamente el bloque.

---

## 7. Secuencia congelada

```text
Fase 1A  Cleanup Management + Groups
    ↓
Gate intermedio: bun test + lint + build + git diff --check
    ↓
Fase 1B  Cleanup Operacional + Incidencias + Dispositivos + harnesses
    ↓
Fase 2   Revisión global + validación frontend + smoke
    ↓
Fase 3   Deploy + confirmación de producción
    ↓
Fase 4   Cleanup backend + validación
    ↓
Fase 5   Reconciliación documental + cierre
```

---

## 8. Fuera de alcance

Este bloque no autoriza:

- rediseñar UI/UX de Admin;
- rehacer `ManagementStore`;
- dividir stores por dominio;
- refactor general de CSS;
- modificar Catálogo V4 funcionalmente;
- modificar MasterData V1 funcionalmente;
- cambiar Groups V1 mutations;
- alterar la lógica vigente de Incidencias;
- alterar la lógica vigente de Dispositivos salvo retirar `replace`;
- modificar ConeXion;
- modificar Edge Functions no relacionadas;
- modificar cron no relacionado;
- limpiar storage, historial o datos operativos;
- cambios backend antes del gate de producción de la Fase 3.

Cualquier necesidad de ampliar este alcance debe detener la implementación y volver a definición/aprobación.

---

## 9. Criterios de bloqueo

Codex debe detenerse y reportar antes de continuar si descubre:

- un consumidor runtime real de un contrato marcado para retiro;
- una dependencia backend no contemplada que impida el cleanup seguro;
- una garantía vigente que solo pueda conservarse mediante rediseño funcional;
- una contradicción con una decisión congelada posterior a este documento;
- necesidad de modificar backend para completar Fase 1A, 1B o 2;
- necesidad de introducir un refactor arquitectónico fuera de alcance.

No debe rediseñar automáticamente. Debe explicar el bloqueo, por qué impide continuar y el cambio mínimo recomendado.

---

## 10. Criterio de cierre

El bloque podrá declararse cerrado únicamente cuando:

- frontend legacy aprobado haya sido retirado;
- Fase 1A y Fase 2 hayan superado sus validaciones técnicas;
- smoke humano haya pasado;
- deployment correcto haya sido confirmado;
- backend legacy aprobado haya sido retirado y validado;
- documentación vigente haya sido reconciliada;
- no existan consumidores residuales conocidos de los contratos eliminados;
- se haya emitido cierre explícito del bloque.

---

## 11. Estado al congelar V1

- Preflight funcional y técnico: **completado**.
- Decisiones funcionales pendientes: **ninguna**.
- Plan: **aprobado**.
- Fase 1 dividida en **1A + gate técnico intermedio + 1B**.
- Implementación: **no iniciada por este documento**.
