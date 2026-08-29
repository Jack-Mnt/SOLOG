# SOLOG — Plan de refactorización de estructura y nomenclatura

## 1. Propósito de este documento

Este documento define el contexto, objetivo, alcance, restricciones, estructura objetivo y plan de implementación para una refactorización exclusivamente organizativa del repositorio **SOLOG**.

Debe utilizarse como documento de referencia antes de realizar cualquier cambio.

La refactorización tiene como objetivo ordenar la estructura física del frontend y normalizar la nomenclatura de archivos y carpetas **sin modificar el comportamiento de la plataforma**.

Antes de implementar cualquier cambio, Codex debe revisar el repositorio actual y responder si existen:

- riesgos no contemplados;
- dependencias de rutas que puedan romperse;
- bloqueantes técnicos;
- inconsistencias entre este plan y el estado real del repositorio;
- archivos o consumidores adicionales que deban considerarse;
- cualquier motivo por el que una fase no pueda ejecutarse de forma puramente mecánica.

**No comenzar la refactorización en esa primera revisión.** La primera tarea es únicamente validar la viabilidad del plan y reportar riesgos o bloqueantes.

---

# 2. Contexto del proyecto

SOLOG es una plataforma web desarrollada principalmente con:

- React 19;
- Vite;
- TypeScript;
- Supabase JS.

Actualmente existen dos áreas funcionales principales:

- **Cajero / trabajador**, utilizado para el conteo operativo.
- **Administración**, utilizado para dashboard, control, incidencias, catálogo, grupos y dispositivos.

Durante la evolución del proyecto se fueron acumulando convenciones distintas de organización y nomenclatura: PascalCase, camelCase, kebab-case, nombres con puntos, dominios en inglés y español, archivos de una misma funcionalidad distribuidos en diferentes niveles y nombres históricos que ya no representan de forma consistente la estructura actual.

La arquitectura funcional actual ya está implementada y **no se quiere rediseñar**. La refactorización debe limitarse a hacer que el sistema de archivos represente de forma más clara la organización que ya existe.

---

# 3. Objetivo principal

Normalizar la estructura de `src/` para que:

1. Los archivos exclusivos de Administración sigan la convención `admin.[algo]`.
2. Los archivos exclusivos de Cajero sigan la convención `cajero.[algo]`.
3. Los archivos verdaderamente generales puedan conservar nombres simples como `home`, `login`, `router`, `api`, `types`, `errors`, `labels`, `context`, `storage` o `utils`.
4. Los dominios funcionales de Administración estén claramente agrupados.
5. Los nombres de archivos permitan identificar su responsabilidad sin depender únicamente de la carpeta.
6. Se reduzca la mezcla histórica de PascalCase, kebab-case y nombres en inglés/español.
7. La refactorización produzca un diff predominantemente mecánico:

```diff
rename from ...
rename to ...

-import ... from '../old-path'
+import ... from '../new-path'
```

---

# 4. Restricciones obligatorias

Esta tarea es una **refactorización física y nominal**, no una refactorización funcional.

## 4.1. No modificar lógica

No modificar algoritmos, cálculos, condiciones, flujos operativos, reglas de negocio, llamadas RPC, argumentos de RPC, contratos de datos, autenticación, dispositivos, conteos, diferencias, estado de React, hooks, efectos, callbacks, memoización ni comportamiento de componentes.

## 4.2. No modificar backend

No realizar cambios en Supabase, SQL, RPC, Edge Functions, RLS, tablas, schemas, funciones, Storage ni configuraciones del backend.

## 4.3. No modificar UI/UX

No aprovechar esta tarea para cambiar JSX, copy, estilos, CSS, layout, iconografía, componentes visuales, navegación visual, responsive ni branding.

## 4.4. No modificar rutas web

Los paths de navegación deben mantenerse exactamente iguales. Entre otros:

```text
/admin
/admin/control
/admin/incidencias
/admin/catalogo
/admin/grupos
/admin/dispositivos
/cajero
/cajero/conteo
/cajero/diario
/cajero/revisar
/cajero/historial
```

Mover o renombrar un archivo **no autoriza** a modificar las URLs públicas de la aplicación.

## 4.5. No realizar limpieza oportunista

No eliminar código porque parezca innecesario, fusionar o dividir componentes, extraer helpers, cambiar APIs internas, renombrar símbolos exportados por estética, introducir barrel files, introducir aliases de TypeScript, reorganizar dependencias, cambiar librerías ni actualizar paquetes.

Si una mejora parece conveniente pero no es necesaria para esta refactorización, debe reportarse aparte y quedar fuera del cambio.

---

# 5. Convención de nomenclatura objetivo

## 5.1. Administración

Formato general:

```text
admin.<dominio>[.<funcion>].ext
```

Ejemplos:

```text
admin.layout.tsx
admin.dialog.tsx
admin.dashboard.overview.tsx
admin.control.panel.tsx
admin.catalogo.filtros.tsx
admin.grupos.hook.ts
admin.incidencias.format.ts
```

## 5.2. Cajero

Formato general:

```text
cajero.<funcion>.ext
```

Ejemplos:

```text
cajero.tsx
cajero.conteo.tsx
cajero.inicio.tsx
cajero.revisar.tsx
cajero.captura.dialog.tsx
cajero.storage.ts
cajero.types.ts
```

## 5.3. Archivos compartidos

Cuando la carpeta ya define claramente el contexto, utilizar nombres simples y en minúsculas:

```text
api.ts
types.ts
errors.ts
labels.ts
device.ts
context.tsx
router.ts
supabase.ts
palette.ts
```

## 5.4. Sufijos por responsabilidad

Utilizar cuando corresponda:

```text
*.dialog.tsx
*.panel.tsx
*.drawer.tsx
*.card.tsx
*.form.tsx
*.hook.ts
*.context.ts
*.context.tsx
*.provider.tsx
*.format.ts
*.types.ts
*.storage.ts
*.utils.ts
*.domain.ts
```

No es necesario renombrar el símbolo exportado solamente porque cambie el nombre físico del archivo. Por ejemplo, `admin.control.panel.tsx` puede seguir exportando `ControlPanel`.

---

# 6. Estructura objetivo de `src/`

```text
src/
├── app.tsx
├── main.tsx
├── styles.css
├── vite-env.d.ts
├── components/
│   └── page-shell.tsx
├── lib/
│   ├── router.ts
│   └── supabase.ts
├── pages/
│   ├── home.tsx
│   ├── login.tsx
│   ├── dispositivo-pendiente.tsx
│   ├── admin.dashboard.tsx
│   ├── admin.control.tsx
│   ├── admin.incidencias.tsx
│   ├── admin.catalogo.tsx
│   ├── admin.grupos.tsx
│   └── admin.dispositivos.tsx
└── features/
    ├── auth/
    │   ├── context.tsx
    │   └── errors.ts
    ├── theme/
    │   ├── palette.ts
    │   └── palette-switcher.tsx
    └── solog/
        ├── context.tsx
        ├── api.ts
        ├── device.ts
        ├── errors.ts
        ├── labels.ts
        ├── types.ts
        ├── cajero/
        │   ├── cajero.tsx
        │   ├── cajero.api.ts
        │   ├── cajero.calculadora.tsx
        │   ├── cajero.captura.dialog.tsx
        │   ├── cajero.conteo.tsx
        │   ├── cajero.diario.tsx
        │   ├── cajero.header.tsx
        │   ├── cajero.historial.tsx
        │   ├── cajero.inicio.tsx
        │   ├── cajero.operativo.tsx
        │   ├── cajero.revisar.tsx
        │   ├── cajero.session.ts
        │   ├── cajero.storage.ts
        │   ├── cajero.table.tsx
        │   ├── cajero.types.ts
        │   └── cajero.utils.ts
        └── admin/
            ├── admin.dialog.tsx
            ├── admin.layout.tsx
            ├── admin.layout.context.ts
            ├── admin.operational.context.ts
            ├── admin.operational.header.tsx
            ├── admin.operational.provider.tsx
            ├── admin.format.ts
            ├── admin.solog.hook.ts
            ├── dashboard/
            │   ├── admin.dashboard.overview.tsx
            │   ├── admin.dashboard.actividad-sede.drawer.tsx
            │   ├── admin.dashboard.format.ts
            │   ├── admin.dashboard.hook.ts
            │   └── admin.dashboard.actividad-sede.hook.ts
            ├── dispositivos/
            │   ├── admin.dispositivos.autorizados.tsx
            │   ├── admin.dispositivos.pendientes.tsx
            │   └── admin.dispositivos.format.ts
            ├── catalogo/
            │   ├── admin.catalogo.domain.ts
            │   ├── admin.catalogo.cambio.detalle.tsx
            │   ├── admin.catalogo.filtros.tsx
            │   ├── admin.catalogo.panel.tsx
            │   ├── admin.catalogo.publicacion.card.tsx
            │   ├── admin.catalogo.publicacion.dialog.tsx
            │   ├── admin.catalogo.nuevo-producto.form.tsx
            │   ├── admin.catalogo.format.ts
            │   ├── admin.catalogo.cambios.hook.ts
            │   ├── admin.catalogo.publicacion.hook.ts
            │   └── admin.catalogo.estado.hook.ts
            ├── control/
            │   ├── admin.control.drawer.tsx
            │   ├── admin.control.panel.tsx
            │   ├── admin.control.export.ts
            │   ├── admin.control.format.ts
            │   ├── admin.control.period.ts
            │   ├── admin.control.hook.ts
            │   ├── admin.control.detalle.hook.ts
            │   └── admin.control.export.hook.ts
            ├── grupos/
            │   ├── admin.grupos.definicion.dialog.tsx
            │   ├── admin.grupos.valorizacion.dialog.tsx
            │   ├── admin.grupos.panel.tsx
            │   ├── admin.grupos.clasificacion-producto.dialog.tsx
            │   ├── admin.grupos.hook.ts
            │   └── admin.grupos.valorizacion.ts
            └── incidencias/
                ├── admin.incidencias.detalle.tsx
                ├── admin.incidencias.filtros.tsx
                ├── admin.incidencias.panel.tsx
                ├── admin.incidencias.domain.ts
                ├── admin.incidencias.format.ts
                └── admin.incidencias.hook.ts
```

---

# 7. Mapeo de archivos propuesto

## 7.1. Raíz, compartidos y páginas

| Ruta actual | Ruta propuesta |
|---|---|
| `src/App.tsx` | `src/app.tsx` |
| `src/components/PageShell.tsx` | `src/components/page-shell.tsx` |
| `src/features/auth/AuthContext.tsx` | `src/features/auth/context.tsx` |
| `src/features/theme/PaletteSwitcher.tsx` | `src/features/theme/palette-switcher.tsx` |
| `src/features/solog/SologContext.tsx` | `src/features/solog/context.tsx` |
| `src/features/solog/home/HomePage.tsx` | `src/pages/home.tsx` |
| `src/pages/LoginPage.tsx` | `src/pages/login.tsx` |
| `src/pages/DevicePendingPage.tsx` | `src/pages/dispositivo-pendiente.tsx` |
| `src/pages/admin.tsx` | `src/pages/admin.dashboard.tsx` |

Mantener sin cambios de ruta:

```text
src/main.tsx
src/styles.css
src/vite-env.d.ts
src/lib/router.ts
src/lib/supabase.ts
src/features/auth/errors.ts
src/features/theme/palette.ts
src/features/solog/api.ts
src/features/solog/device.ts
src/features/solog/errors.ts
src/features/solog/labels.ts
src/features/solog/types.ts
src/pages/admin.catalogo.tsx
src/pages/admin.control.tsx
src/pages/admin.dispositivos.tsx
src/pages/admin.grupos.tsx
src/pages/admin.incidencias.tsx
```

## 7.2. Cajero

| Ruta actual | Ruta propuesta |
|---|---|
| `src/features/solog/cajero/Cajero.tsx` | `src/features/solog/cajero/cajero.tsx` |
| `src/features/solog/cajero/cajero.captura-modal.tsx` | `src/features/solog/cajero/cajero.captura.dialog.tsx` |

Mantener el resto de archivos `cajero.*` en la misma carpeta.

## 7.3. Administración — comunes

Rutas relativas a `src/features/solog/admin/`:

| Ruta actual | Ruta propuesta |
|---|---|
| `AdminDialog.tsx` | `admin.dialog.tsx` |
| `AdminLayout.tsx` | `admin.layout.tsx` |
| `AdminLayoutContext.ts` | `admin.layout.context.ts` |
| `AdminOperationalContext.ts` | `admin.operational.context.ts` |
| `AdminOperationalHeader.tsx` | `admin.operational.header.tsx` |
| `AdminOperationalProvider.tsx` | `admin.operational.provider.tsx` |
| `format.ts` | `admin.format.ts` |
| `useAdminSolog.ts` | `admin.solog.hook.ts` |

## 7.4. Administración — Dashboard

| Ruta actual | Ruta propuesta |
|---|---|
| `admin/AdminOverview.tsx` | `admin/dashboard/admin.dashboard.overview.tsx` |
| `admin/DashboardSiteActivityDrawer.tsx` | `admin/dashboard/admin.dashboard.actividad-sede.drawer.tsx` |
| `admin/dashboard-format.ts` | `admin/dashboard/admin.dashboard.format.ts` |
| `admin/useSologDashboard.ts` | `admin/dashboard/admin.dashboard.hook.ts` |
| `admin/useSologDashboardSiteActivity.ts` | `admin/dashboard/admin.dashboard.actividad-sede.hook.ts` |

## 7.5. Administración — Dispositivos

| Ruta actual | Ruta propuesta |
|---|---|
| `admin/AuthorizedDevices.tsx` | `admin/dispositivos/admin.dispositivos.autorizados.tsx` |
| `admin/PendingDevices.tsx` | `admin/dispositivos/admin.dispositivos.pendientes.tsx` |
| `admin/device-format.ts` | `admin/dispositivos/admin.dispositivos.format.ts` |

## 7.6. Administración — Catálogo

Mover primero `admin/catalog/` a `admin/catalogo/` y luego normalizar nombres:

| Ruta actual | Ruta propuesta |
|---|---|
| `admin/catalog-domain.ts` | `admin/catalogo/admin.catalogo.domain.ts` |
| `admin/catalog/CatalogChangeDetail.tsx` | `admin/catalogo/admin.catalogo.cambio.detalle.tsx` |
| `admin/catalog/CatalogFilters.tsx` | `admin/catalogo/admin.catalogo.filtros.tsx` |
| `admin/catalog/CatalogPanel.tsx` | `admin/catalogo/admin.catalogo.panel.tsx` |
| `admin/catalog/CatalogPublicationCard.tsx` | `admin/catalogo/admin.catalogo.publicacion.card.tsx` |
| `admin/catalog/CatalogPublicationDialog.tsx` | `admin/catalogo/admin.catalogo.publicacion.dialog.tsx` |
| `admin/catalog/NewProductApprovalForm.tsx` | `admin/catalogo/admin.catalogo.nuevo-producto.form.tsx` |
| `admin/catalog/catalog-format.ts` | `admin/catalogo/admin.catalogo.format.ts` |
| `admin/catalog/useCatalogChanges.ts` | `admin/catalogo/admin.catalogo.cambios.hook.ts` |
| `admin/catalog/useCatalogPublication.ts` | `admin/catalogo/admin.catalogo.publicacion.hook.ts` |
| `admin/catalog/useCatalogStatus.ts` | `admin/catalogo/admin.catalogo.estado.hook.ts` |

## 7.7. Administración — Control

| Ruta actual | Ruta propuesta |
|---|---|
| `admin/control/ControlDrawer.tsx` | `admin/control/admin.control.drawer.tsx` |
| `admin/control/ControlPanel.tsx` | `admin/control/admin.control.panel.tsx` |
| `admin/control/control-export.ts` | `admin/control/admin.control.export.ts` |
| `admin/control/control-format.ts` | `admin/control/admin.control.format.ts` |
| `admin/control/control-period.ts` | `admin/control/admin.control.period.ts` |
| `admin/control/useSologControl.ts` | `admin/control/admin.control.hook.ts` |
| `admin/control/useSologControlDetail.ts` | `admin/control/admin.control.detalle.hook.ts` |
| `admin/control/useSologControlExport.ts` | `admin/control/admin.control.export.hook.ts` |

## 7.8. Administración — Grupos

Mover primero `admin/groups/` a `admin/grupos/` y luego normalizar nombres:

| Ruta actual | Ruta propuesta |
|---|---|
| `admin/groups/GroupDefinitionDialog.tsx` | `admin/grupos/admin.grupos.definicion.dialog.tsx` |
| `admin/groups/GroupValuationDialog.tsx` | `admin/grupos/admin.grupos.valorizacion.dialog.tsx` |
| `admin/groups/GroupsPanel.tsx` | `admin/grupos/admin.grupos.panel.tsx` |
| `admin/groups/ProductClassificationDialog.tsx` | `admin/grupos/admin.grupos.clasificacion-producto.dialog.tsx` |
| `admin/groups/useAdminGroups.ts` | `admin/grupos/admin.grupos.hook.ts` |
| `admin/groups/valuation.ts` | `admin/grupos/admin.grupos.valorizacion.ts` |

## 7.9. Administración — Incidencias

Mover primero `admin/incidents/` a `admin/incidencias/` y luego normalizar nombres:

| Ruta actual | Ruta propuesta |
|---|---|
| `admin/incidents/IncidentDetail.tsx` | `admin/incidencias/admin.incidencias.detalle.tsx` |
| `admin/incidents/IncidentFilters.tsx` | `admin/incidencias/admin.incidencias.filtros.tsx` |
| `admin/incidents/IncidentsPanel.tsx` | `admin/incidencias/admin.incidencias.panel.tsx` |
| `admin/incidents/incident-domain.ts` | `admin/incidencias/admin.incidencias.domain.ts` |
| `admin/incidents/incident-format.ts` | `admin/incidencias/admin.incidencias.format.ts` |
| `admin/incidents/useAdminIncidents.ts` | `admin/incidencias/admin.incidencias.hook.ts` |

---

# 8. Dependencias que deben revisarse antes de mover archivos

## 8.1. Imports estáticos

Buscar todos los `import ... from '...'` y `export ... from '...'` que apunten a rutas que serán renombradas.

## 8.2. Imports dinámicos

Revisar todos los `import('...')`. Existe carga dinámica desde `App.tsx`, por lo que esta categoría es un riesgo explícito.

## 8.3. Tests con rutas literales

Existen tests que leen directamente archivos mediante rutas en strings, por ejemplo:

```ts
Bun.file('src/features/solog/admin/groups/useAdminGroups.ts').text()
```

Por tanto, no basta con actualizar imports TypeScript. Buscar también `Bun.file(...)`, `readFile(...)`, `readFileSync(...)`, `existsSync(...)`, glob patterns y strings con rutas `src/...` si apuntan a archivos afectados.

## 8.4. Sensibilidad a mayúsculas/minúsculas

`tsconfig.app.json` utiliza `"forceConsistentCasingInFileNames": true`.

Hay renombres exclusivamente de casing:

```text
App.tsx → app.tsx
Cajero.tsx → cajero.tsx
```

En Windows/Git deben realizarse con un rename intermedio, por ejemplo:

```bash
git mv src/App.tsx src/__app_tmp.tsx
git mv src/__app_tmp.tsx src/app.tsx
```

Aplicar la misma estrategia a cualquier otro caso equivalente.

---

# 9. Estrategia de implementación

No ejecutar todos los movimientos simultáneamente. Cada fase debe ser pequeña, verificable y reversible.

---

# 10. Fase 0 — Validación previa obligatoria

Antes de modificar archivos:

1. Leer el árbol completo actual de `src/`.
2. Leer los archivos relevantes y sus imports.
3. Buscar referencias a todos los archivos que serán movidos.
4. Buscar imports dinámicos.
5. Buscar paths literales en tests y tooling.
6. Comparar el estado real con este documento.
7. Confirmar si existe algún archivo nuevo que no haya sido contemplado.
8. Confirmar si algún movimiento propuesto requeriría modificar lógica o produciría una dependencia problemática.

## Resultado obligatorio de Fase 0

Responder exactamente con una estructura equivalente a:

```text
VALIDACIÓN DEL PLAN

1. Estado:
   - APROBADO PARA IMPLEMENTAR
   o
   - BLOQUEADO

2. Riesgos detectados:
   - ...

3. Bloqueantes:
   - ...

4. Diferencias entre el repositorio actual y este plan:
   - ...

5. Referencias adicionales que habrá que actualizar:
   - ...

6. Cambios del plan recomendados antes de implementar:
   - ...

7. Confirmación:
   ¿Puede ejecutarse la refactorización únicamente mediante movimientos,
   renombres y actualización mecánica de referencias, sin modificar
   comportamiento?
```

### Regla crítica

**Después de entregar este informe, detenerse.**

No iniciar la Fase 1 hasta recibir autorización explícita.

---

# 11. Fase 1 — Archivos generales y compartidos

Realizar únicamente:

- `App.tsx → app.tsx`;
- `PageShell.tsx → page-shell.tsx`;
- `AuthContext.tsx → context.tsx`;
- `PaletteSwitcher.tsx → palette-switcher.tsx`;
- `SologContext.tsx → context.tsx`;
- mover `HomePage.tsx → pages/home.tsx`;
- `LoginPage.tsx → login.tsx`;
- `DevicePendingPage.tsx → dispositivo-pendiente.tsx`;
- `admin.tsx → admin.dashboard.tsx`.

Actualizar únicamente las referencias necesarias.

### Validación de fase

```bash
bun run lint
bun run build
git diff --check
```

Además, buscar referencias a los paths antiguos. No continuar si alguna validación falla.

---

# 12. Fase 2 — Cajero

Realizar únicamente:

```text
Cajero.tsx → cajero.tsx
cajero.captura-modal.tsx → cajero.captura.dialog.tsx
```

Actualizar imports estáticos, imports dinámicos, tests y referencias literales.

### Validación de fase

```bash
bun test
bun run lint
bun run build
git diff --check
```

Buscar además `Cajero.tsx` y `cajero.captura-modal`. No deben quedar referencias físicas antiguas que necesiten actualización.

---

# 13. Fase 3 — Infraestructura común de Administración

Normalizar los archivos administrativos comunes:

```text
AdminDialog
AdminLayout
AdminLayoutContext
AdminOperationalContext
AdminOperationalHeader
AdminOperationalProvider
format
useAdminSolog
```

Después crear y poblar:

```text
admin/dashboard/
admin/dispositivos/
```

No modificar contenido funcional.

### Validación de fase

```bash
bun test
bun run lint
bun run build
git diff --check
```

---

# 14. Fase 4 — Dominios administrativos

Ejecutar dominio por dominio, en este orden recomendado:

1. `catalog → catalogo`
2. `groups → grupos`
3. `incidents → incidencias`
4. normalización interna de `control`

Para cada dominio:

1. mover la carpeta si aplica;
2. verificar referencias;
3. renombrar sus archivos;
4. actualizar imports;
5. actualizar tests y paths literales;
6. ejecutar validaciones;
7. solamente después pasar al siguiente dominio.

No mezclar varios dominios en una sola operación masiva.

---

# 15. Fase 5 — Verificación global

## 15.1. Buscar rutas antiguas

Buscar al menos:

```text
AdminLayout
AdminOverview
AuthorizedDevices
PendingDevices
CatalogPanel
CatalogFilters
GroupsPanel
IncidentsPanel
ControlPanel
catalog/
groups/
incidents/
Cajero.tsx
HomePage
LoginPage
DevicePendingPage
SologContext
AuthContext
PaletteSwitcher
PageShell
```

Evaluar cada resultado. Algunos símbolos exportados pueden conservar legítimamente PascalCase. El objetivo es eliminar referencias a **paths físicos antiguos**, no renombrar indiscriminadamente símbolos.

## 15.2. Ejecutar pruebas

```bash
bun test
bun run lint
bun run build
git diff --check
```

Todas deben finalizar correctamente.

## 15.3. Revisar diff

El diff final debe estar compuesto esencialmente por renames, moves, cambios de imports y cambios de paths literales en tests/tooling.

Si aparecen cambios sustanciales en JSX, lógica, funciones, condiciones, hooks, estados, CSS, SQL, contratos o rutas web, deben revisarse y revertirse salvo que sean técnicamente imprescindibles. Si algo fuera imprescindible, debe detenerse y reportarse antes de introducirlo.

---

# 16. Criterios de aceptación

La refactorización se considera correcta únicamente si:

1. El árbol final coincide sustancialmente con la estructura objetivo.
2. Los nombres cumplen las convenciones definidas.
3. No quedan imports rotos.
4. No quedan paths literales antiguos que deban actualizarse.
5. No cambian las URLs de la aplicación.
6. No cambia ningún contrato Supabase.
7. No cambia la lógica de negocio.
8. No cambia el comportamiento del frontend.
9. No cambia el diseño visual.
10. Las pruebas pasan.
11. El lint pasa.
12. El build pasa.
13. `git diff --check` pasa.
14. No aparecen cambios funcionales accidentales en el diff.

---

# 17. Riesgos conocidos del plan

## Riesgo 1 — Imports estáticos

Los movimientos romperán imports relativos si no se actualizan todos sus consumidores.

## Riesgo 2 — Imports dinámicos

Los imports mediante `import('...')` también deben actualizarse. Especial atención a `App.tsx`.

## Riesgo 3 — Tests que dependen de la estructura física

Algunos tests utilizan rutas literales mediante `Bun.file(...)`. Pueden fallar aunque la aplicación compile correctamente si no se actualizan.

## Riesgo 4 — Case-only rename en Windows

Renombres como `App.tsx → app.tsx` y `Cajero.tsx → cajero.tsx` deben realizarse con `git mv` intermedio.

## Riesgo 5 — Renombres excesivos

No renombrar símbolos, props, funciones o tipos únicamente por consistencia estética. La normalización solicitada corresponde principalmente al filesystem.

## Riesgo 6 — Introducir arquitectura nueva accidentalmente

No introducir barrels, aliases, nuevas capas, nuevos providers, nuevos contexts ni nuevos wrappers.

## Riesgo 7 — Mezclar refactor funcional con físico

Si una modificación no es necesaria para que el proyecto continúe funcionando después del movimiento de archivos, debe quedar fuera de este trabajo.

---

# 18. Forma de trabajar esperada

Utilizar preferentemente `git mv` para conservar claramente el historial de movimientos.

Después de cada conjunto pequeño de movimientos:

1. actualizar imports;
2. actualizar referencias literales;
3. buscar el nombre/ruta antigua;
4. ejecutar validaciones;
5. revisar el diff.

No realizar un cambio masivo de todo `src/` en una única operación.

---

# 19. Formato del informe final de implementación

Cuando toda la refactorización haya sido completada, entregar:

```text
REFACTORIZACIÓN DE ESTRUCTURA SOLOG COMPLETADA

1. Archivos/carpetas movidos:
   - ...

2. Archivos renombrados:
   - ...

3. Imports actualizados:
   - ...

4. Tests o referencias literales actualizadas:
   - ...

5. Validaciones:
   - bun test:
   - bun run lint:
   - bun run build:
   - git diff --check:

6. Rutas web:
   - Sin cambios.

7. Backend / Supabase:
   - Sin cambios.

8. Lógica funcional:
   - Sin cambios.

9. Desviaciones respecto al plan:
   - Ninguna
   o
   - ...

10. Bloqueos pendientes:
   - Ninguno
   o
   - ...
```

---

# 20. Instrucción inicial para Codex

Al recibir este documento:

1. **No realices cambios todavía.**
2. Inspecciona el repositorio en modo lectura.
3. Valida este plan contra el árbol y las referencias reales.
4. Identifica riesgos adicionales o bloqueantes.
5. Indica cualquier diferencia entre el repositorio actual y la estructura descrita aquí.
6. Determina si todo puede resolverse únicamente con movimientos, renombres y actualizaciones mecánicas de referencias.
7. Entrega el informe de **Fase 0 — Validación previa obligatoria**.
8. Detente y espera autorización antes de modificar archivos.
