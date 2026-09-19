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
