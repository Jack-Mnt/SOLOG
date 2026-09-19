# SOLOG — UX Admin — Estados de carga y error V1

**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — corrección UX transversal frontend  
**Fecha:** 2026-09-19

## 1. Fuente primaria y precedencia

Este documento es la fuente primaria para los estados de carga y error cubiertos por este bloque.

Prevalece sobre implementaciones previas que:
- muestren texto aislado `Cargando…`;
- monten una UI parcial del Admin durante bootstrap;
- utilicen un `.notice` como representación de carga inicial.

No reemplaza:
- la arquitectura del Shell;
- los contratos de datos;
- el sistema de feedback de mutaciones;
- la composición visual normalizada de los módulos;
- la gestión de errores funcionales ya definida fuera de los estados de lectura/carga.

## 2. Objetivo

Eliminar estados intermedios que rompen la identidad visual o generan transiciones incoherentes durante cargas lentas, reconexiones o ausencia temporal de red.

La referencia visual autoritativa es el `PanelLoader` existente de SOLOG:
- isotipo;
- halo;
- animación;
- tres puntos;
- texto de carga;
- fondo coherente con la aplicación.

## 3. Contrato UX congelado

### 3.1. Carga inicial / bootstrap Admin

Mientras el bootstrap administrativo está pendiente:
- no se monta el Shell;
- no se muestra el título genérico `Administración`;
- no se muestra un `.notice`;
- se muestra `PanelLoader` a pantalla completa.

### 3.2. Error de bootstrap

Cuando el bootstrap termina en error:
- no se mantiene una animación de carga;
- se utiliza la misma superficie visual global de SOLOG;
- isotipo y halo permanecen estáticos;
- no se muestran puntos animados;
- se presenta un título claro;
- se presenta una descripción del error;
- se ofrecen `Reintentar` y `Cerrar sesión`.

### 3.3. Carga de módulos con Shell ya montado

Cuando una lectura de módulo está pendiente:
- el Shell permanece visible;
- el área de contenido utiliza `PanelLoader` contenido;
- no aparece texto aislado `Cargando…`;
- no se desmonta Sidebar/Header por una carga interna.

### 3.4. Carga en dialog / drawer

Cuando una lectura está pendiente dentro de un dialog o drawer:
- se utiliza el mismo lenguaje visual de `PanelLoader`;
- se usa geometría compacta;
- no se fuerza la altura del loader contenido de página;
- no se crea un segundo sistema visual.

### 3.5. Error interno

Cuando una lectura interna falla:
- deja de representarse como loading;
- permanece dentro de su superficie correspondiente;
- muestra feedback contextual y acción de reintento;
- no desmonta el Shell;
- no usa animación de carga.

## 4. Variantes de PanelLoader

El componente compartido soportará:

- `fullscreen`: carga global inicial;
- `contained`: carga de contenido de módulo;
- `compact`: carga dentro de dialog/drawer;
- estado `loading`;
- estado `error`.

La implementación puede conservar compatibilidad con consumidores existentes siempre que el contrato visual anterior se mantenga.

## 5. CSS congelado

Se conservan:
- `.panel-loader`;
- `.panel-loader--contained`;
- `.panel-loader__content`;
- `.panel-loader__symbol`;
- `.panel-loader__halo`;
- `.panel-loader__dots`;
- `.panel-loader__label`;
- animaciones existentes y `prefers-reduced-motion`.

Se añaden únicamente:
- `.panel-loader--compact`;
- `.panel-loader--error`;
- `.panel-loader__title`;
- `.panel-loader__description`;
- `.panel-loader__actions`.

No se elimina en este bloque:
- `.notice`;
- `.notice--error`;
- `.admin-notice` ni sus variantes.

## 6. Estados obsoletos en JSX

Quedan obsoletos para loading:
- fallback bootstrap basado en `<section className="notice">`;
- `error ?? "Cargando…"` en `QueryState`;
- `error ?? "Cargando…"` en `ReadNotice`.

Su eliminación se realizará durante la migración de Fase 3.

## 7. Alcance

Incluye:
- primitive compartido de carga/error;
- bootstrap Admin;
- `QueryState`;
- `ReadNotice`;
- consumidores Admin que dependan de ellos;
- dialogs/drawers con lecturas pendientes.

Fuera de alcance:
- backend;
- Supabase;
- RPC;
- autenticación estructural;
- Cajero;
- Detalles;
- rediseño del Shell;
- rediseño de módulos;
- cambios en reglas de negocio;
- limpieza general de CSS.

## 8. Criterios de aceptación

1. Ningún estado pending del alcance muestra texto aislado `Cargando…`.
2. Bootstrap pendiente muestra únicamente el loader global de SOLOG.
3. Bootstrap error muestra estado global estático con retry/logout.
4. Cargas internas preservan el Shell.
5. Dialogs/drawers utilizan geometría compacta.
6. Errores internos no mantienen animaciones de loading.
7. No se introducen clases visuales paralelas fuera de las definidas.
8. No se modifica backend ni contratos remotos.
9. Tests, lint, build y `git diff --check` pasan.
10. Smoke con carga lenta/sin conexión no revela UI intermedia ajena a SOLOG.


## 9. Estado de ejecución

### Fase 1 — Contrato UX

**COMPLETADA.**

- fuente primaria creada;
- decisiones aprobadas congeladas;
- alcance y fuera de alcance establecidos.

### Fase 2 — Consolidación de PanelLoader

**CERRADA TÉCNICAMENTE.**

Validación reportada por el usuario:
- tests dirigidos: correctos;
- lint: correcto;
- build: correcto;
- `git diff --check`: correcto.

Implementado:
- variantes `fullscreen`, `contained` y `compact`;
- estados `loading` y `error`;
- compatibilidad con el prop histórico `contained`;
- contenido configurable de error;
- geometría compacta;
- error sin animaciones de carga;
- clases `.panel-loader__title`, `.panel-loader__description` y `.panel-loader__actions`;
- cobertura dirigida en `tests/panel-loader.test.ts`.

Todavía no se migraron consumidores Admin; corresponde a Fase 3.


### Fase 3 — Migración de estados Admin

**IMPLEMENTADA — PENDIENTE DE VALIDACIÓN EJECUTABLE Y SMOKE.**

Implementado:
- bootstrap pending → `PanelLoader` fullscreen;
- bootstrap error → estado global SOLOG con retry/logout;
- `QueryState` pending → `PanelLoader`, error → feedback contextual;
- `ReadNotice` pending → `PanelLoader`, error → feedback contextual;
- páginas principales → variante contenida por defecto;
- dialogs/drawers/sublecturas → variante compacta;
- eliminado `Cargando sedes…` de Incidencias, conservando etiqueta estable + `aria-busy`;
- sin cambios CSS en esta fase;
- cobertura dirigida en `tests/admin-loading-states-phase3.test.ts`.


## 10. Delta — Catálogo sin loader duplicado

**Fecha:** 2026-09-19  
**Estado:** APROBADO E IMPLEMENTADO

Durante la revisión humana se detectó que `CatalogStatus` y `ProposalsSurface` podían mostrar loaders simultáneos durante la carga inicial del módulo.

Regla adicional:
- una misma superficie de módulo no debe mostrar más de un loader simultáneo para su carga inicial;
- `ProposalsSurface` permanece como loader principal de Catálogo;
- `CatalogStatus` en estado pending no renderiza loader;
- `CatalogStatus` conserva error contextual con retry;
- al resolver, `CatalogStatus` muestra normalmente versión, fecha y total de SKU;
- no se combinan queries ni se modifican contratos, caché o backend;
- no se realizan cambios CSS.


## 11. Delta de revisión global — alcance repositorio completo

**Fecha:** 2026-09-19  
**Estado:** REVISIÓN AMPLIADA — HALLAZGOS PENDIENTES DE APROBACIÓN

Por decisión posterior, la Fase 4 amplía su revisión desde Admin a todas las superficies runtime del repositorio en `admin-work` que participan en estados de carga/error.

Este delta amplía **la revisión**, no autoriza automáticamente cambios funcionales fuera de Admin.

### 11.1. Superficies revisadas

- App / lazy loading global;
- autenticación y resolución de ruta;
- Admin;
- Cajero;
- Detalles;
- Login;
- Home;
- componentes compartidos de loading/error;
- fallbacks `Suspense`;
- estados de lectura, retry y error.

No se consideran bugs de loading los textos que describen operaciones explícitas del usuario, por ejemplo:
- `Ingresando…`;
- `Enviando…`;
- `Solicitando…`;
- `Generando Excel…`;
- `Publicando…`.

### 11.2. Estado correcto detectado

- `App` usa `PanelLoader` para el lazy global;
- Auth pending usa `PanelLoader`;
- resolución de ruta pending usa `PanelLoader`;
- Cajero bootstrap pending usa `PanelLoader`;
- lazy de Admin/Cajero/Detalles usa `PanelLoader`;
- Admin quedó normalizado tras Fase 3 y delta de Catálogo;
- Home no presenta un estado transitorio problemático en este alcance.

### 11.3. Hallazgos fuera de Admin

#### A. Errores globales todavía usan PageShell

Detectado en:
- `protected-app.tsx` — error de resolución de ruta;
- `protected-app.tsx` — error de inicialización Auth;
- `cajero.v3.context.tsx` — error de bootstrap Cajero.

Estos estados no comparten todavía la superficie global `PanelLoader state="error"`.

`PageShell` solo tiene consumidores runtime detectados en `protected-app.tsx` y `cajero.v3.context.tsx`. Si ambos migran, deberá realizarse una auditoría de referencias antes de decidir eliminar `PageShell` y su CSS asociado.

#### B. Detalles monta UI parcial durante carga inicial

`detalles.panel.tsx` monta el Shell antes de disponer del resumen, mostrando contexto incompleto como sede `—` y un loader propio:
- `Consultando detalles de la sede…`.

La carga inicial debería evaluarse como bootstrap de la superficie, mientras que refrescos posteriores con datos existentes pueden conservar el Shell.

#### C. Cajero mantiene loaders de lectura paralelos al sistema compartido

Detectado:
- Conteo → `Cargando grupos…`;
- Conteo diario → `Cargando grupos…`;
- Revisar → `Cargando casos…`;
- Historial → `Cargando historial…`.

Todos usan `.cajero-loading` + `LoaderCircle` en lugar del sistema compartido.

#### D. Detalles mantiene loaders internos paralelos

Detectado:
- Historial dialog → `Cargando historial…`;
- detalle expandido → texto aislado `Cargando detalle…`.

Son candidatos naturales a `PanelLoader compact`.

#### E. Sincronización posterior al conteo

`cajero.tsx` utiliza `.cajero-loading` para:
- `Actualizando el panel…` durante sincronización real;
- un estado estático `needsSynchronization` que ya no está cargando.

Además, `needsSynchronization` ya genera un aviso superior con acción de consulta. La semántica visual de este segundo bloque requiere definición antes de modificarla para no alterar el bloqueo operativo.

#### F. Contrato faltante en error de inicialización Auth

El error global de inicialización Auth no expone actualmente una acción explícita de retry desde `AuthProvider`.

Antes de normalizarlo al contrato global con `Reintentar`, debe definirse si:
- se añade retry de inicialización al contexto;
- se utiliza recarga completa;
- o el error global no ofrece retry.

No asumir una alternativa sin aprobación.

### 11.4. CSS potencialmente afectado si se aprueban los hallazgos

No eliminar todavía.

Candidatos a quedar sin uso o reducirse:
- `.cajero-loading`;
- `.details-loading`;
- estilos estructurales asociados exclusivamente a `PageShell`.

Su eliminación solo procederá después de migrar consumidores y comprobar referencias reales.

### 11.5. Estado de cierre

La Fase 4 global no puede cerrarse todavía porque existen hallazgos fuera de Admin que requieren definición/aprobación antes de decidir si forman parte de este mismo bloque o se trasladan a backlog.


## 12. Cierre del bloque Admin

**Estado final: CERRADO — VALIDADO TÉCNICA Y HUMANAMENTE.**

El alcance Admin de este documento queda cerrado.

La revisión transversal posterior identificó hallazgos fuera de Admin. Dichos hallazgos y sus decisiones aprobadas se trasladan a la nueva fuente primaria:

`docs/SOLOG_UX_Global_Estados_Carga_Error_V1.md`

A partir de este punto:
- este documento sigue siendo autoritativo para los estados de carga/error de Admin;
- el documento global prevalece para Auth, Cajero y Detalles;
- los hallazgos globales del apartado 11 se consideran transferidos y no reabren Admin.
