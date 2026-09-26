# SOLOG — Admin — Fase 12 — Cierre Global V1

**Estado:** CONGELADO / APROBADO PARA EJECUCIÓN  
**Fecha:** 2026-09-22  
**Rama:** `admin-work`  
**Clasificación:** Nivel B — revisión transversal frontend/Admin  
**Baseline 12.1:** `5e668d6fbcc232ec92d0173d85da0ebf377f5c29`  
**Relación con master al preflight:** admin-work 96 commits por delante / 0 por detrás

---

# 1. Propósito

Fase 12 es el cierre global de la implementación general de SOLOG Admin.

No introduce nuevas funcionalidades ni rediseña módulos ya aprobados. Su objetivo es:

1. reconciliar el estado final de las siete rutas Admin después de los bloques posteriores a Fase 11;
2. eliminar únicamente residuos frontend/CSS inequívocamente muertos o redundantes;
3. detectar regresiones de integración entre contratos ya congelados;
4. realizar validación técnica y smoke de integración;
5. cerrar documentalmente la implementación general del Admin.

Esta fase no reabre por defecto ningún bloque ya cerrado.

---

# 2. Superficie Admin vigente

Rutas activas:

```text
/admin                → Dashboard
/admin/control        → Control
/admin/incidencias    → Incidencias
/admin/catalogo       → Catálogo V4
/admin/productos      → Productos
/admin/grupos         → Grupos
/admin/dispositivos   → Dispositivos
```

Frontend Catálogo vigente:

```text
admin.catalogo.page.v4.tsx
admin.catalogo.v4.ts
admin.catalogo.store.ts
```

No existe frontend Catálogo V3 soportado.

---

# 3. Baseline estructural observado en 12.1

## 3.1. Responsive / Shell

Se preserva la arquitectura final de Fase 11:

```text
Desktop >= 1024
Tablet  768–1023
Mobile  < 768
```

Media queries generales detectadas en `admin.css`:

```text
max-width: 1023px
max-width: 767px
prefers-reduced-motion: reduce
```

No reaparecieron los breakpoints generales legacy:

```text
1000 / 850 / 760 / 720 / 680 / 560 / 480
```

## 3.2. CSS

Baseline actual:

```text
src/features/solog/admin/admin.css
3304 líneas
```

La diferencia frente al cierre histórico de Fase 11 no se interpreta por sí sola como regresión: desde entonces se integraron Catálogo V4 y otros bloques aprobados.

`admin-v2-table` continúa ausente.

Selectores `admin-v2-*` que siguen teniendo consumidores demostrables y no deben eliminarse por nombre:

```text
admin-v2-workspace
admin-v2-toolbar
admin-v2-updated
admin-v2-actions
admin-v2-card
admin-v2-form
admin-v2-picker
```

Candidatos iniciales sin consumidor encontrado dentro de los archivos runtime de Admin:

```text
admin-v2-data
admin-v2-json
admin-v2-kpis
```

Son candidatos de auditoría, no autorización automática de borrado.

## 3.3. Estado de contratos previos

Quedan preservados como contratos cerrados o vigentes:

- normalización de tablas;
- responsive / Shell / controles de Fase 11;
- paginación local;
- estados de carga/error Admin;
- Master Data Admin;
- Catálogo V4;
- primitives y composición previamente congeladas en lo no reemplazado.

---

# 4. Alcance de Fase 12

## IN SCOPE

### 4.1. Revisión transversal de integración

Revisar conjuntamente:

```text
Shell y navegación
SiteContext
responsive 1024/768
tablas
primitives
paginación
loading/error
feedback de mutaciones
Dashboard
Control
Incidencias
Catálogo V4
Productos
Grupos
Dispositivos
```

Solo se corrigen desviaciones verificables respecto de fuentes vigentes.

### 4.2. Cleanup frontend seguro

Auditar:

- clases CSS sin consumidor runtime;
- clases usadas en JSX sin regla necesaria o con regla huérfana;
- selectores inequívocamente redundantes absorbidos por primitives vigentes;
- overrides legacy que ya no cambian el resultado;
- imports/helpers/componentes sin uso real;
- compatibilidad frontend obsoleta cuya ausencia ya esté demostrada;
- comentarios técnicos que describan una arquitectura retirada.

Regla:

> No se elimina código o CSS por apariencia, nomenclatura antigua o preferencia estética. Debe demostrarse que es muerto, redundante o reemplazado.

### 4.3. Reconciliación documental final

Actualizar únicamente documentación que todavía describa como pendiente algo ya validado o que contradiga el runtime final de Admin.

---

# 5. Fuera de alcance

Fase 12 NO autoriza:

- nuevas funcionalidades;
- rediseño visual de módulos;
- cambios de lógica de negocio;
- cambios de RPC/API;
- cambios Supabase/backend;
- cambios en Cajero o Detalles;
- renombrado masivo de archivos/clases `v1/v2/v3`;
- migración estética de nombres que siguen funcionando;
- reabrir bloques cerrados sin bug/regresión/evidencia nueva;
- limpieza de backend legacy de Catálogo V3;
- cambios del bloque independiente de Dialogs / Modals / Drawers.

La limpieza backend legacy de Catálogo se ejecutará como **bloque independiente** y puede intercalarse entre 12.1 y 12.2.

Cuando Fase 12 se retome después de ese bloque, 12.2 debe comenzar desde un nuevo HEAD real de `admin-work`.

---

# 6. Plan de ejecución

## 12.1 — Contrato + inventario global
**Estado:** COMPLETADA

- establecer baseline real;
- identificar fuentes vigentes;
- congelar alcance y exclusiones;
- registrar candidatos iniciales;
- separar explícitamente cleanup frontend de cleanup backend.

## 12.2 — Auditoría ejecutable y cleanup seguro
**Estado:** COMPLETADA / VALIDADA POR AUDITORÍA

Antes de modificar:

1. re-baseline del HEAD actual;
2. inventario completo CSS ↔ consumidores;
3. inventario JSX/helpers/imports candidatos;
4. clasificación:
   - muerto demostrable;
   - redundante demostrable;
   - vigente;
   - dudoso → conservar;
5. aprobar únicamente cambios sin efecto funcional.

Implementar en pasadas pequeñas y revisables.

### Resultado ejecutado — 2026-09-26

**Baseline real 12.2:**

```text
70ca5849ee72a88ddf87c286ae8f8a3e2d0b340f
```

El baseline incorpora los bloques independientes cerrados después de 12.1, incluido el cleanup de contratos legacy y el cierre posterior de AdminDialog Fases 10/11. Esos cambios se toman como correctos y no se reinterpretan en 12.2.

Inventario auditado:

```text
49 archivos TS/TSX/CSS bajo src/features/solog/admin
48 archivos runtime TS/TSX
1 hoja admin.css
PaletteSwitcher externo como consumidor adicional de admin.css
harnesses/tests Admin relevantes para hooks estructurales
```

Hallazgos:

1. Los candidatos históricos de 12.1:

```text
admin-v2-data
admin-v2-json
admin-v2-kpis
```

ya no existen en `admin.css`; fueron absorbidos/eliminados por cleanup posterior.

2. `admin-appearance*` no es CSS muerto. Su consumidor real es:

```text
src/features/theme/palette-switcher.tsx
```

y existe cobertura dirigida en los tests/harnesses de AdminDialog/Shell.

3. Tokens detectados en runtime sin regla CSS propia como:

```text
admin-mobile-drawer
admin-viewport
admin-catalog-proposals-panel
admin-dashboard-daily-state-panel
admin-tablets-title
admin-requests-title
admin-create-group-form
admin-edit-group-form
admin-product-setup-form
admin-incidents-state-panel
```

no constituyen clases visuales huérfanas: son IDs, data-hooks, referencias ARIA o hooks estructurales de tests. Se conservan.

4. Las variantes CSS construidas dinámicamente (`admin-dialog--*`, `admin-status-badge--*`, diferencias, estados y secciones de Catálogo) tienen consumidores runtime y no deben eliminarse por no aparecer como string literal completo.

5. `admin__percentage-action` sigue siendo una excepción vigente consumida por Dashboard y por sus reglas responsive.

6. No se encontraron referencias runtime ni comentarios técnicos que reintroduzcan Master V2, Groups Read V1, `daily_detail`, `control_chronology`, `control_page`, `control_detail`, Incidencias `detail` o Dispositivos `replace`.

7. No se detectó ningún selector, helper, import o componente cuya eliminación pueda demostrarse segura con evidencia suficiente adicional al cleanup ya ejecutado. Los candidatos dudosos se conservan conforme a la política de Fase 12.

**Resultado de implementación:**

```text
cleanup adicional de runtime/CSS = 0
cambios funcionales              = 0
cambios backend                  = 0
```

La ausencia de borrados adicionales es intencional: 12.2 prioriza evidencia sobre volumen de cleanup.

> **Fase 12.2 — CERRADA.**


## 12.3 — Revisión de integración global
**Estado:** COMPLETADA / SIN DESVIACIONES ABIERTAS

Verificar que las siete rutas respeten conjuntamente los contratos vigentes.

No se busca uniformidad cosmética nueva. Solo regresiones o desviaciones reales.

### Resultado ejecutado — 2026-09-26

**Baseline revisado:**

```text
15e5085890ddc9dd30c8b265ce2337bbdbad3b62
```

Se revisó conjuntamente:

```text
Shell y navegación
SiteContext
responsive 1024/768
tablas
primitives
paginación
loading/error
feedback de mutaciones
Dashboard
Control
Incidencias
Catálogo V4
Productos
Grupos
Dispositivos
```

#### Shell / navegación

- siete rutas Admin activas y lazy-loaded;
- Sidebar conserva los grupos Operación / Inventario / Sistema;
- Mobile mantiene Drawer con cierre por backdrop, Escape y cambio de ruta;
- Tablet permanece colapsado sin control manual;
- Desktop conserva expansión/colapso;
- no se detectaron rutas legacy ni fallback funcional incorrecto dentro del conjunto `AdminRoute`.

#### SiteContext

- permanece como estado UI del `AdminStore`;
- solo se expone en Header para Control e Incidencias;
- conserva sede seleccionada entre módulos;
- rechaza sedes fuera de `allowed_sites`;
- Control consume `siteId` como scope de sus lecturas;
- Incidencias combina el scope de sede con el modo aprobado `Todas las sedes`.

#### Stores / coordinación

- Dashboard y Control usan `AdminStore`;
- Incidencias y Dispositivos comparten `ManagementStore`;
- Productos y Grupos comparten MasterData V1;
- Catálogo coordina floors de revisiones con MasterData;
- mutaciones de Grupos invalidan y recargan MasterData;
- publicación confirmada de Catálogo recarga MasterData;
- `propose_delete` de Incidencias invalida Catálogo;
- aislamiento por usuario, rol, sede y revisión permanece implementado.

#### Responsive

`admin.css` conserva únicamente los breakpoints generales:

```text
max-width: 1023px
max-width: 767px
prefers-reduced-motion: reduce
```

No reaparecieron breakpoints generales legacy.

#### Tablas y paginación

- Dashboard, Control, Catálogo, Productos, Grupos e Incidencias usan `admin-main-table` para sus tablas principales;
- Dispositivos permanece correctamente fuera de la familia de tablas principales;
- Control, Productos, Grupos e Incidencias conservan paginación local estándar de 50;
- Catálogo conserva paginación independiente de 25 por sección;
- Dashboard DailyDrawer usa el contrato optimizado posterior `daily_detail_bootstrap/page` y su paginación backend de 25; este contrato posterior reemplaza el delta histórico de paginación local del Drawer.

#### Loading / error

- bootstrap Admin usa `PanelLoader` global;
- lecturas de página mantienen Shell y usan `PanelLoader` contenido mediante `QueryState` / `ReadNotice`;
- sublecturas y Dialogs/Drawers usan variante compacta;
- errores internos conservan retry contextual;
- Catálogo no duplica loader entre status y propuestas.

#### Feedback de mutaciones

- Catálogo/Productos usan `CatalogMutationNotice`;
- Incidencias y Dispositivos conservan una única superficie autoritativa de feedback;
- retries mantienen la intención/operation_id cuando corresponde;
- UUID/replay no se presentan como feedback normal;
- Dispositivos conserva únicamente authorize/revoke/reject;
- Incidencias conserva summary/detail_sites/ignore_30d/reactivate/propose_delete.

#### Resultado

No se identificaron:

- regresiones funcionales;
- contradicciones entre stores;
- rutas desacopladas de su fuente de datos vigente;
- reintroducción de contratos legacy;
- desviaciones responsive;
- desviaciones de tablas/paginación que requieran corrección;
- cambios backend necesarios.

```text
cambios de implementación requeridos = 0
cambios backend requeridos           = 0
desviaciones globales abiertas       = 0
```

> **Fase 12.3 — CERRADA.**


## 12.4 — Validación técnica y smoke de integración
**Estado:** PENDIENTE

Validación:

```powershell
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Smoke mínimo:

```text
Desktop
Tablet
Mobile
```

sobre:

- navegación;
- carga inicial;
- sede cuando corresponde;
- filtros/tablas;
- paginación;
- acciones principales;
- responsive;
- ausencia de errores visuales/funcionales evidentes.

No se repiten exhaustivamente los smokes ya aprobados de cada bloque.

## 12.5 — Cierre documental del Admin
**Estado:** PENDIENTE

- registrar baseline final;
- registrar validación y smoke;
- cerrar Fase 12;
- declarar cerrada la implementación general del Admin;
- dejar cualquier deuda futura como bloque independiente explícito.

---

# 7. Política de desviaciones

Durante Fase 12:

- un bug/regresión demostrable puede corregirse;
- una inconsistencia documental puede alinearse;
- un candidato dudoso de cleanup se conserva;
- un cambio que altere negocio, backend o UX congelada detiene la pasada y requiere nueva decisión;
- no se aprovecha cleanup para refactor general.

---

# 8. Criterios de cierre

Fase 12 solo puede cerrarse cuando:

1. auditoría frontend/CSS completada;
2. cleanup autorizado aplicado sin cambio funcional;
3. no queden desviaciones globales abiertas;
4. suite completa aprobada;
5. lint aprobado;
6. build aprobado;
7. `git diff --check` aprobado;
8. smoke Desktop/Tablet/Mobile aprobado;
9. documentación final reconciliada.

---

# 9. Secuencia acordada desde 12.1

La secuencia inmediata queda:

```text
12.1 congelada
→ PAUSA Fase 12
→ preflight de limpieza backend legacy de Catálogo V3
→ ejecutar/cerrar ese bloque independiente si se aprueba
→ retomar Fase 12 desde 12.2 con nuevo baseline
```

No existe dependencia funcional que obligue a ejecutar 12.2 antes de la limpieza backend.
