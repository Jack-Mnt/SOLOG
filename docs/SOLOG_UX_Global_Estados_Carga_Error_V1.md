# SOLOG — UX Global — Estados de carga y error V1

**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — normalización UX transversal frontend  
**Fecha:** 2026-09-19

## 1. Fuente primaria y precedencia

Este documento es la fuente primaria para la normalización de estados de carga/error fuera de SOLOG Admin, específicamente en:

- Auth / resolución de ruta;
- Cajero;
- Detalles;
- componentes compartidos implicados;
- limpieza posterior de clases/componentes que queden sin uso.

Para Admin permanece vigente y cerrada:

`docs/SOLOG_UX_Admin_Estados_Carga_Error_V1.md`

Las decisiones de este documento no reabren ni reinterpretan el bloque Admin.

## 2. Baseline funcional

La revisión global del repositorio confirmó:

- lazy global y `Suspense` ya usan `PanelLoader`;
- Auth pending ya usa `PanelLoader`;
- resolución de ruta pending ya usa `PanelLoader`;
- Cajero bootstrap pending ya usa `PanelLoader`;
- operaciones explícitas del usuario como `Ingresando…`, `Enviando…`, `Solicitando…`, `Generando Excel…` o `Publicando…` son feedback operativo válido y no se reemplazan por loaders de lectura.

## 3. Decisiones congeladas

### 3.1. Errores globales

Se normalizan al sistema compartido:

```tsx
<PanelLoader state="error" ... />
```

Aplica a:
- error de resolución de ruta;
- error de inicialización Auth;
- error de bootstrap Cajero.

`PageShell` deja de ser la superficie autoritativa para estos errores.

### 3.2. Retry de inicialización Auth

Para el error de inicialización Auth:

- `Reintentar` realizará una recarga completa de la aplicación;
- no se añade nueva lógica de retry al `AuthProvider`;
- la recarga completa es el mecanismo de recuperación autoritativo para este error temprano.

### 3.3. Detalles — primera carga

Solo se bloquea completamente la primera carga.

Regla:

```text
sin summary + loading
→ PanelLoader fullscreen

sin summary + error
→ PanelLoader error fullscreen

summary existente + refresh
→ conservar Shell y datos visibles
```

No debe aparecer durante la primera carga:
- Shell parcial;
- sede `PR —`;
- `Consultando detalles de la sede…`.

### 3.4. Cajero — cargas de lectura

Se normalizan a:

```text
lectura inicial del módulo
→ PanelLoader contained
```

Aplica a:
- Conteo → grupos;
- Conteo diario → grupos;
- Revisar → casos;
- Historial → historial.

El Shell de Cajero debe permanecer visible durante estas cargas.

### 3.5. Restricción tablet-first de Cajero

Cajero está diseñado principalmente para tablets.

Por tanto:
- `PanelLoader contained` debe integrarse dentro del área de contenido existente;
- Header y Bottom Navigation permanecen visibles;
- no se introducen cambios de breakpoint;
- no se altera densidad, navegación ni geometría tablet;
- no se convierte una carga de módulo en fullscreen salvo que sea bootstrap real;
- cualquier ajuste CSS debe preservar la experiencia tablet antes que optimizar para escritorio.

### 3.6. Sincronización posterior al conteo

Se separan dos estados actualmente mezclados.

#### Sincronización activa

`session.synchronizingAfterFinish`:

```text
Actualizando el panel…
→ PanelLoader contained
```

Es una carga real.

#### Sincronización pendiente

`session.needsSynchronization`:

- no es loading;
- se elimina el segundo bloque visual basado en `.cajero-loading`;
- permanece únicamente el warning accionable existente;
- la acción autoritativa sigue siendo `Consultar estado de sesión`.

No se modifica la lógica de bloqueo operativo.

### 3.7. Detalles — cargas internas

#### Historial dialog

```text
loading
→ PanelLoader compact
```

#### Detalle expandido

Se conserva el texto pequeño existente:

```text
Cargando detalle…
```

No se fuerza `PanelLoader compact` porque el estado es local, breve y no rompe la UI.

Esta excepción es deliberada.

### 3.8. Errores internos

Los errores internos:
- permanecen dentro de su superficie;
- conservan retry cuando ya existe;
- no se representan como loading;
- no desmontan innecesariamente Shell/navegación.

## 4. Limpieza aprobada

La limpieza forma parte del mismo bloque.

Después de migrar consumidores debe realizarse una auditoría de referencias.

Candidatos:

- `.cajero-loading`;
- `.details-loading`;
- `PageShell`;
- CSS exclusivo de `PageShell`;
- imports de `LoaderCircle` que queden sin uso;
- cualquier clase auxiliar de loading que quede huérfana como consecuencia directa de esta normalización.

Reglas:
- eliminar únicamente elementos con cero referencias reales;
- preferir reducir clases duplicadas si el primitive compartido ya cubre su responsabilidad;
- no realizar limpieza CSS general no relacionada;
- no cambiar geometría visual para justificar una consolidación;
- preservar cambios preexistentes.

## 5. Fuera de alcance

- backend;
- Supabase;
- RPC;
- contratos remotos;
- lógica de negocio Cajero;
- lógica de sesión/recovery;
- reglas de autorización de dispositivo;
- rediseño de Cajero;
- rediseño de Detalles;
- cambios responsive ajenos al loader;
- Admin, salvo uso del primitive compartido ya congelado.

## 6. Preflight técnico cerrado

No existen dependencias backend para este bloque.

Dependencias frontend identificadas:
- `PanelLoader`;
- `protected-app.tsx`;
- `cajero.v3.context.tsx`;
- `cajero.tsx`;
- módulos Cajero de Conteo / Diario / Revisar / Historial;
- `detalles.panel.tsx`;
- `detalles.historial.dialog.tsx`;
- potencial limpieza de `page-shell.tsx`, CSS e imports después de la migración.

Bloqueo resuelto:
- retry Auth = recarga completa.

## 7. Criterios de aceptación

1. Los errores globales de Auth/ruta/Cajero usan la superficie visual compartida de SOLOG.
2. El retry de inicialización Auth recarga completamente la aplicación.
3. Detalles no monta Shell parcial durante su primera carga.
4. Refrescos de Detalles con summary existente no desmontan el Shell.
5. Cajero usa `PanelLoader contained` en sus cuatro cargas de lectura.
6. Cajero conserva experiencia tablet-first, Header y Bottom Navigation.
7. Sincronización activa usa loader; `needsSynchronization` usa solo el warning accionable.
8. Historial de Detalles usa `PanelLoader compact`.
9. `Cargando detalle…` permanece como excepción deliberada en detalle expandido.
10. Operaciones explícitas como enviar/exportar/login/publicar conservan su feedback actual.
11. Se eliminan clases/componentes/imports huérfanos solo si la auditoría confirma cero uso.
12. No hay cambios backend ni de contratos.
13. Tests, lint, build y `git diff --check` pasan.
14. Smoke humano incluye tablet para Cajero.

## 8. Validación humana mínima

- Auth: error de inicialización + `Reintentar`;
- resolución de ruta con error;
- Cajero: bootstrap error;
- Cajero en tablet: Conteo, Diario, Revisar e Historial con carga lenta;
- Cajero: sincronización posterior al finalizar;
- Detalles: primera carga lenta;
- Detalles: refresh con datos ya visibles;
- Detalles: Historial dialog;
- detalle expandido conservando `Cargando detalle…`.



## 9. Estado de ejecución

### Fase 1 — Errores globales

**CERRADA TÉCNICAMENTE.**

Validación reportada por el usuario:
- tests dirigidos: correctos;
- lint: correcto;
- build: correcto;
- `git diff --check`: correcto.

Implementado:
- error de resolución de ruta → `PanelLoader state="error"`;
- retry de resolución conserva la misma consulta mediante incremento de intento;
- resolución de ruta conserva acción `Cerrar sesión`;
- error de inicialización Auth → `PanelLoader state="error"`;
- retry Auth → `window.location.reload()`;
- error de bootstrap Cajero → `PanelLoader state="error"`;
- bootstrap Cajero conserva retry y `Cerrar sesión`;
- `PageShell` deja de tener consumidores en estos flujos, pero su eliminación queda diferida a Fase 5;
- sin cambios backend, contratos o lógica de negocio;
- cobertura dirigida añadida en `tests/global-loading-errors-phase1.test.ts`.


### Fase 2 — Detalles

**CERRADA TÉCNICAMENTE.**

Validación reportada por el usuario:
- tests dirigidos: correctos;
- lint: correcto;
- build: correcto;
- `git diff --check`: correcto.

Implementado:
- primera carga sin `summary` → `PanelLoader` fullscreen;
- error inicial sin `summary` → `PanelLoader state="error"` fullscreen;
- error inicial conserva `Reintentar` y `Cerrar sesión`;
- el Shell de Detalles no se monta durante la primera carga;
- eliminado el estado parcial `PR —` + `Consultando detalles de la sede…`;
- refresh con `summary` existente conserva Shell y datos visibles;
- errores con datos existentes permanecen contextuales dentro del Shell;
- Historial dialog → `PanelLoader compact`;
- se conserva deliberadamente `Cargando detalle…` en el detalle expandido;
- sin cambios backend, contratos o CSS;
- cobertura dirigida añadida en `tests/global-loading-details-phase2.test.ts`.


### Fase 3 — Cajero tablet-first

**IMPLEMENTADA — PENDIENTE DE VALIDACIÓN EJECUTABLE Y SMOKE TABLET.**

Implementado:
- Conteo → `PanelLoader variant="contained"`;
- Conteo diario → `PanelLoader variant="contained"`;
- Revisar → `PanelLoader variant="contained"`;
- Historial → `PanelLoader variant="contained"`;
- eliminados los textos directos `Cargando grupos…`, `Cargando casos…` y `Cargando historial…` en esas lecturas;
- retirados los imports `LoaderCircle` que quedaron sin uso en esos cuatro módulos;
- Header y Bottom Navigation no fueron modificados;
- sin cambios de breakpoints, densidad, geometría tablet o CSS;
- sincronización posterior al conteo queda sin modificar para Fase 4;
- `.cajero-loading` permanece temporalmente porque aún tiene consumidores fuera de estas cuatro lecturas;
- cobertura dirigida añadida en `tests/global-loading-cajero-phase3.test.ts`.
