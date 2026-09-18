# SOLOG — UI Admin — Normalización de Tablas — Plan de Implementación V1

**Proyecto:** SOLOG  
**Estado:** CERRADO — PLAN EJECUTADO Y VALIDADO  
**Clasificación:** Nivel B — implementación frontend/Admin  
**Fecha:** 2026-09-18

## 1. Fuente primaria

La fuente primaria funcional y visual de este bloque es:

`docs/SOLOG_UI_Admin_Tablas_Normalizacion_V1.md`

Este plan organiza la ejecución y no reemplaza las decisiones congeladas en esa fuente.

Ante contradicción:

1. prevalece `SOLOG_UI_Admin_Tablas_Normalizacion_V1.md`;
2. este plan gobierna orden, alcance por fase y validación;
3. todo documento anterior sigue vigente en lo que no haya sido reemplazado explícitamente.

## 2. Objetivo

Implementar la normalización de las tablas principales Admin sin cambiar:

- composición de columnas;
- orden de columnas;
- información visible;
- acciones disponibles;
- filtros;
- sort;
- paginación;
- lógica de negocio;
- backend/Supabase.

El bloque separa:

- `admin-main-table` para tablas principales;
- `admin-auxiliary-table` para tablas auxiliares en dialogs, drawers, modales y detalles.

## 3. Regla de ejecución

Cada fase se ejecuta de forma independiente.

Al final de cada fase se realiza un **fast smoke dirigido** antes de avanzar.

El fast smoke valida únicamente las superficies afectadas por esa fase y no sustituye la validación global final.

La Fase 6 contiene:

- revisión global;
- suite técnica completa;
- smoke humano completo;
- cierre explícito del bloque.

No se deben mezclar cambios de fases futuras salvo dependencia técnica mínima demostrada.

## 4. Fase 1 — Infraestructura de tablas y primitives

### Alcance

Crear la base común necesaria para las fases posteriores.

Implementar:

- `admin-main-table`;
- `admin-auxiliary-table`;
- retirada progresiva de la responsabilidad base de `admin-v2-table`;
- utilities:
  - `admin-table-cell-stack`;
  - `admin-table-cell-primary`;
  - `admin-table-cell-secondary`;
  - `admin-table-number`;
  - `admin-table-action-cell`;
  - `admin-table-actions`;
- sticky header base de `admin-main-table`;
- hover base de filas ordinarias;
- densidad base congelada;
- ampliación de `IconButton`:
  - Default;
  - Primary;
  - Warning;
  - Danger;
- CSS de Warning;
- base reutilizable `admin__percentage-action`;
- normalización mínima de `admin-auxiliary-table`.

### Restricciones

No migrar todavía módulos completos salvo ajustes mínimos necesarios para mantener compilación.

No cambiar información, columnas ni handlers.

### Fast smoke

Validar:

- que Admin carga;
- que IconButton Default/Primary/Warning/Danger renderiza sin regresión;
- que una tabla principal de referencia mantiene scroll y sticky;
- que al menos una tabla auxiliar conserva layout y overflow;
- que no aparecen cambios visuales fuera de tablas.

## 5. Fase 2 — Dashboard + Control

### Dashboard

Migrar la tabla principal de turnos/cobertura a `admin-main-table`.

Normalizar:

- `scope="col"`;
- `scope="row"` para Madrugada, Día, Noche y Total;
- sticky header;
- excepción de primera columna sticky;
- matriz numérica centrada;
- acción porcentaje → `admin__percentage-action`.

Excluir:

- DailyDrawer;
- tablas internas de detalle;
- dialogs.

### Control

Migrar la tabla principal a `admin-main-table`.

Normalizar:

- `scope="col"`;
- identidad de fila cuando corresponda;
- diferencia y valorizado con `admin-table-number`;
- acción Detalle a `IconButton`;
- `admin-table-action-cell`;
- hover de fila;
- sticky header.

Excluir:

- cronología/detalle;
- export dialog;
- paginación fuera de tabla.

### Fast smoke

Dashboard:

- expandir/contraer sede;
- tabla de turnos visible;
- acción porcentaje abre día;
- sticky header y primera columna correctos.

Control:

- tabla carga;
- filtros conservan dataset;
- Detalle abre cronología;
- diferencias y valorizados alineados;
- sticky header operativo.

## 6. Fase 3 — Catálogo + Productos

### Catálogo

Migrar solo las tablas principales de propuestas a `admin-main-table`.

Preservar:

`Tipo | Producto | Cambio | Origen | Acción`

Normalizar:

- Producto/código con utilities primaria/secundaria;
- acción Eye → `IconButton Default`;
- acción centrada;
- sticky header;
- hover;
- semántica de headers;
- lectura accesible anterior → nuevo.

Excluir:

- tablas de dialogs;
- configuración;
- preview;
- tablas internas de miembros u otras auxiliares.

### Productos

Migrar tabla principal a `admin-main-table`.

Normalizar:

- precio con `admin-table-number`;
- acción con contrato común;
- conservar Primary/Danger;
- sticky header;
- hover;
- headers semánticos.

### Fast smoke

Catálogo:

- cambiar StateView;
- abrir detalle de propuesta;
- comprobar Cambio anterior → nuevo;
- comprobar Eye;
- sticky header.

Productos:

- filtros y QuickFilterChip;
- sort;
- exclusión/reincorporación;
- estados disabled de propuesta;
- sticky header.

## 7. Fase 4 — Grupos + Incidencias

### Grupos

Migrar tabla principal a `admin-main-table`.

Normalizar:

- semántica de headers;
- Integrantes conserva control especializado;
- Valorizado usa alineación numérica coherente;
- acciones Pencil/CircleDollarSign usan wrapper común;
- sticky header;
- hover.

No modificar:

- modal de integrantes;
- modal de valorizado;
- categorías/dialogs.

### Incidencias

Migrar tabla principal de StateView a `admin-main-table`.

Preservar columnas y acciones actuales por estado.

Normalizar:

- `scope="col"`;
- Producto/código con utilities comunes;
- Sedes preservadas;
- botones manuales → `IconButton`;
- Ver detalle → Default;
- Ignorar 30 días → Warning;
- Proponer eliminación → Danger;
- Reactivar → Default;
- wrapper de acciones común;
- sticky header;
- hover.

Excluir:

- tabla de detalle;
- dialogs;
- modales de confirmación.

### Fast smoke

Grupos:

- filtros;
- sort;
- abrir Integrantes;
- editar grupo;
- editar valorizado;
- sticky header.

Incidencias:

- Pendientes/Suprimidas/Resueltas;
- Ver detalle;
- Ignorar 30 días;
- Proponer eliminación;
- Reactivar;
- disabled durante pending;
- sticky header.

## 8. Fase 5 — Migración auxiliar y limpieza local

### Alcance

Completar la retirada nominal de `admin-v2-table`.

Migrar tablas fuera del alcance principal a:

`admin-auxiliary-table`

sin rediseñar su composición.

Revisar:

- dialogs;
- drawers;
- modales;
- cronologías;
- detalles secundarios;
- tablas auxiliares.

Limpiar únicamente CSS directamente reemplazado por el nuevo contrato:

- selectores huérfanos de tablas principales;
- overrides locales absorbidos;
- reglas de acciones sustituidas;
- clases históricas asociadas a `admin-v2-table`.

No realizar todavía la auditoría global de todo `admin.css`.

### Fast smoke

Abrir al menos:

- un dialog con tabla auxiliar;
- un drawer/detalle con tabla auxiliar;
- cronología de Control;
- detalle de Incidencias o equivalente.

Confirmar:

- scroll;
- padding;
- legibilidad;
- ausencia de regresión funcional;
- ausencia de estilo de `admin-main-table` filtrado a tablas auxiliares.

## 9. Fase 6 — Revisión global, validación completa y cierre

### 9.1 Revisión global

Auditar:

- todas las tablas principales;
- todas las tablas auxiliares migradas;
- ausencia de `admin-v2-table`;
- consistencia de `admin-main-table`;
- consistencia de `admin-auxiliary-table`;
- sticky headers;
- headers semánticos;
- utilities primaria/secundaria;
- numéricos;
- hover;
- acciones;
- IconButton Default/Primary/Warning/Danger;
- `admin__percentage-action`;
- Integrantes especializado;
- selectores CSS muertos generados por este bloque;
- especificidad innecesaria introducida durante la migración.

### 9.2 Validación técnica completa

Ejecutar:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

Registrar resultados reales. No considerar validado lo que no haya podido comprobarse.

### 9.3 Smoke humano completo

Revisar:

- Dashboard;
- Control;
- Catálogo;
- Productos;
- Grupos;
- Incidencias;
- sticky headers;
- scroll horizontal;
- focus por teclado;
- hover;
- disabled;
- IconButton Default/Primary/Warning/Danger;
- acción porcentaje Dashboard;
- Integrantes Grupos;
- tablas auxiliares en dialogs/drawers;
- responsive estrecho suficiente para confirmar que no se rompió la geometría vigente.

### 9.4 Cierre

El bloque solo se cierra cuando:

1. no existe `admin-v2-table`;
2. las tablas principales usan `admin-main-table`;
3. las tablas auxiliares usan `admin-auxiliary-table`;
4. las acciones ordinarias dentro de tablas principales usan `IconButton`;
5. las dos excepciones aprobadas se preservan;
6. sticky header está normalizado;
7. no existen cambios de composición funcional;
8. validación técnica completa aprobada;
9. smoke humano global aprobado.

## 10. Fuera de alcance del plan

- backend;
- Supabase;
- RPC;
- contratos de datos;
- nuevas columnas;
- eliminación de columnas;
- cambios de contenido;
- cambios de workflow;
- rediseño responsive tabla → card;
- refactor global de Admin CSS no relacionado;
- normalización profunda de dialogs/drawers;
- cambios en Dispositivos.

## 11. Estado final

> **SOLOG — UI Admin — Normalización de Tablas — Plan de Implementación V1: CERRADO — PLAN EJECUTADO Y VALIDADO.**

## 12. Resultado de ejecución

Las Fases 1–6 fueron completadas.

Validación final reportada por el usuario:

- suite completa de tests → aprobada;
- lint → aprobado;
- build → aprobado;
- `git diff --check` → aprobado;
- smoke humano global → aprobado.

La normalización profunda de `admin-auxiliary-table` permanece fuera de alcance conforme a este mismo plan. La migración nominal y base CSS mínima realizada en Fase 5 es suficiente para considerar este bloque cerrado.
