# SOLOG — Integración Admin Control — Frontend Fase 4 — Reporte V1

**Estado:** COMPLETADA / VALIDADA TÉCNICAMENTE  
**Fecha:** 6 de octubre de 2026  
**Proyecto:** SOLOG  
**Clasificación:** Nivel B — integración frontend contra contrato backend congelado  
**Rama:** `admin-work`

## 1. Autoridad

Fuente primaria vigente:

`docs/SOLOG_Backend_Admin_Control_Contrato_V1.md`

Delta de validación vigente:

`docs/SOLOG_Backend_Admin_Control_Validacion_Delta_V1.md`

Este reporte documenta la adaptación frontend implementada. No redefine el contrato ni la composición UI congelada.

## 2. Alcance implementado

### 2.1. Routing RPC

`adminRpc` enruta ahora:

```text
control_groups
control_chronology_view
→ public.rpc_solog_admin_control_v1
```

Se conserva:

```text
export
→ public.rpc_solog_control_export_v2
```

No se modificó el routing de Dashboard ni se revivió `rpc_solog_operational_v2` para Control.

### 2.2. Tipos y validación de cronología

`ControlChronologyPeriod` queda separado de `Biweekly`:

```ts
type ControlChronologyPeriod =
  | "current_biweekly"
  | "previous_counts"
```

`Biweekly` continúa vigente para Dashboard/export:

```text
current_biweekly
previous_biweekly
```

Esto evita extender `previous_counts` a superficies donde no pertenece.

### 2.3. Rango personalizado

El frontend deja de admitir 92 días.

Se implementó:

```text
min = hoy Lima - 44 días
max = hoy Lima
máximo inclusivo = 45 fechas
```

Funciones:

- `controlCustomDateBounds()`;
- `validCustomRange()`.

Los inputs `Desde` / `Hasta` reciben `min` y `max` preventivos.

Mensaje visible:

```text
Selecciona un rango válido dentro de los últimos 45 días.
```

La validación frontend continúa siendo preventiva; backend permanece autoritativo.

### 2.4. Drawer de Cronología

Se conserva composición y geometría.

Cambios contractuales únicamente:

```text
previous_biweekly
→ previous_counts
```

Texto y accesibilidad:

```text
Conteos anteriores
```

La segunda consulta continúa:

- lazy;
- independiente;
- cacheada por sede/grupo/período.

La cronología actual continúa cargándose primero mediante `current_biweekly`.

### 2.5. Sin cambios de producto fuera de Control

No se modificó:

- Dashboard;
- exportación funcional;
- tabla de Control;
- chips;
- búsqueda;
- sort;
- paginación;
- geometría Drawer;
- Motor V4;
- Cajero.

El único cambio en el harness compartido de exportación fue actualizar una expectativa obsoleta: la UI vigente ya utiliza `AdminBinarySwitch` con `Quincena / Anterior / Actual`, no un `<select>`.

## 3. Archivos de producto modificados

```text
src/features/solog/admin/admin.v2.format.ts
src/features/solog/admin/admin.v2.ts
src/features/solog/admin/control/admin.control.v2.tsx
```

No se añadió CSS nuevo.

## 4. Tests y fixtures adaptados

```text
tests/admin-control-v3.test.ts
tests/admin-drawers-8-2b.test.ts
tests/admin-v2.browser.mjs
tests/admin-v2.test.ts
tests/fixtures/admin-v2.mjs
```

Se actualizaron únicamente expectativas incompatibles con el contrato vigente:

- 92 días → 45 fechas;
- cronología `previous_biweekly` → `previous_counts`;
- label `Incluir quincena anterior` → `Conteos anteriores`;
- routing Control → RPC dedicada;
- harness de exportación → `AdminBinarySwitch` vigente.

## 5. Incidencias encontradas durante validación

### 5.1. Test 8.2B desactualizado

El test de cronología 8.2B seguía solicitando:

```text
previous_biweekly
```

La implementación correcta según fuente primaria es:

```text
previous_counts
```

Se actualizó el test; no se modificó producto para satisfacer una expectativa histórica.

### 5.2. Carrera de lifecycle del Drawer en browser

El harness cerraba el Drawer y lo reabría inmediatamente. Playwright alcanzaba a localizar el botón de la instancia anterior durante la transición y el nodo se desmontaba antes del click.

Se estabilizó la prueba esperando:

```text
drawer.waitFor({ state: "detached" })
```

antes de reabrir.

No se modificó `AdminDialog` ni la transición del producto.

### 5.3. Selector de exportación obsoleto en harness

El harness buscaba:

```text
Período de exportación
<select>
```

La UI vigente utiliza:

```text
radiogroup "Quincena"
radio "Anterior"
radio "Actual"
```

Se corrigió exclusivamente la prueba.

## 6. Validación técnica

Se utilizó un workflow temporal de GitHub Actions exclusivamente para esta fase. Fue retirado después de completar la validación y no permanece en el repositorio.

Ejecución final:

```text
GitHub Actions run: 37452080416
```

### 6.1. Tests dirigidos

```text
36 pass
0 fail
```

Incluyeron:

- `admin-control-v3.test.ts`;
- `admin-v2.test.ts`;
- `admin-v2-isolation.test.ts`;
- `admin-drawers-8-2b.test.ts`.

### 6.2. Browser automatizado Control

Resultado:

```text
PASS Control browser actual
productionCalls: 0
```

Requests observados:

```text
bootstrap                  1
control_groups             1
control_chronology_view    2
export                     1
```

Total:

```text
rpcCalls: 5
responseBytes: 21,598
```

El harness verifica que:

- Control usa la RPC dedicada;
- tabla mantiene paginación/filtros locales;
- cronología actual carga una vez;
- `Conteos anteriores` carga lazy;
- la segunda consulta usa `previous_counts`;
- el cache evita requests duplicados;
- exportación continúa disponible;
- no existe tráfico a producción.

### 6.3. Lint

```text
bun run lint
PASS
```

### 6.4. Build

```text
tsc -b && vite build
PASS
2026 módulos transformados
Vite build: 372 ms
```

### 6.5. Diff check

```text
git diff --check 15a9c445cac5fa225446e5b2cd66cb82db3f98d4 HEAD
PASS
```

## 7. Diff funcional final de Fase 4

Respecto del cierre de Fase 3, permanecen únicamente cambios en:

```text
src/features/solog/admin/admin.v2.format.ts
src/features/solog/admin/admin.v2.ts
src/features/solog/admin/control/admin.control.v2.tsx
tests/admin-control-v3.test.ts
tests/admin-drawers-8-2b.test.ts
tests/admin-v2.browser.mjs
tests/admin-v2.test.ts
tests/fixtures/admin-v2.mjs
```

El workflow temporal de validación fue eliminado.

## 8. Estado final

**Fase 4 — COMPLETADA / VALIDADA TÉCNICAMENTE.**

El smoke humano permanece deliberadamente diferido al smoke global posterior al bloque Dashboard y reactivación de usuarios.

Siguiente fase del bloque:

**Fase 5 — revisión global técnica de Control.**

La Fase 5 deberá ampliar la evidencia desde tests dirigidos a revisión global proporcional, incluida la suite completa, sin repetir el smoke humano diferido.
