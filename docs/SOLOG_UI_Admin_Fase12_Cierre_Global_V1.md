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
**Estado:** PENDIENTE

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

## 12.3 — Revisión de integración global
**Estado:** PENDIENTE

Verificar que las siete rutas respeten conjuntamente los contratos vigentes.

No se busca uniformidad cosmética nueva. Solo regresiones o desviaciones reales.

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
