# SOLOG — UI Admin — Dialogs Fase 6 — Gestión Wide V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO PARA IMPLEMENTACIÓN  
**Clasificación:** Nivel B — UI/UX frontend/Admin  
**Fecha:** 2026-09-19  
**Rama:** `admin-work`

## 1. Fuentes relacionadas

Este documento complementa:

- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`
- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md`
- `docs/SOLOG_UI_Admin_Dialogs_Fase5_Formularios_Tareas_V1.md`

Consumidores de Fase 6:

1. Crear grupo.
2. Administrar categorías.
3. Integrantes del grupo.

Los tres conservan `variant="wide"`.

## 2. Principios de composición

Fase 6 gestiona conjuntos, listas y acciones locales complejas.

Se conserva:

- Header / Body / Footer de `AdminDialog`;
- Body como región principal de scroll;
- acciones globales en Footer;
- acciones de fila y de selección en Body;
- Mobile fullscreen por contrato `wide`.

Se normalizan:

- consecuencias mediante `AdminNotice`;
- errores/retry mediante `AdminNotice tone="error"`;
- acciones compactas de fila mediante `IconButton` cuando la etiqueta visible no aporta información adicional.

No se modifican contratos backend ni tablas globales.

## 3. Selector compartido de SKU — GroupCandidatePicker

### 3.1 Búsqueda previa obligatoria

El selector **no renderiza el catálogo completo al abrirse**.

Estado inicial:

```text
Buscar SKU
[ Código, producto, marca o grupo... ]

Busca un producto para mostrar candidatos compatibles.
```

Sin término de búsqueda:

- candidatos renderizados: 0;
- no montar ~1000 productos en DOM;
- selección existente se conserva internamente.

Con término de búsqueda:

- filtrar localmente sobre Master Data ya cargada;
- aplicar primero compatibilidad de precio / exclusión de grupo cuando corresponda;
- después aplicar búsqueda textual;
- renderizar como máximo **50 coincidencias**.

Si existen más de 50 coincidencias:

`Mostrando 50 resultados. Refina la búsqueda para encontrar el producto.`

No se agrega paginación al picker.

### 3.2 Persistencia de selección

Cambiar o limpiar el término de búsqueda:

- no elimina SKU ya seleccionados;
- no altera selección;
- solo cambia los candidatos visibles.

Resumen visible:

```text
3 SKU seleccionados · Precio S/ 5.00
```

Cuando todavía no existe precio requerido:

```text
3 SKU seleccionados
```

### 3.3 Composición de candidato

Cada candidato usa jerarquía de dos niveles:

```text
☐ Producto
  C. interno 12345 · Grupo actual · S/ 5.00
```

Principal:

- Producto.

Secundario:

- C. interno;
- grupo de origen / Único;
- precio.

No convertir el picker en tabla.

## 4. Crear grupo

### Header

Título:

`Crear grupo`

Descripción:

`Crea un grupo de conteo con dos o más SKU del mismo precio.`

Se retira copy técnico sobre compatibilidad backend.

### Campos superiores

Desktop/Tablet:

```text
Nombre                         Categoría
[ ... ]                        [ ... ]
```

Mobile:

- Nombre;
- Categoría;
- apilados.

### Integrantes

Usa el `GroupCandidatePicker` congelado en §3.

El primer SKU seleccionado establece el precio requerido para los candidatos siguientes, conservando la lógica actual.

### Consecuencias

Si hay selección, mostrar `AdminNotice tone="info"`:

`Los SKU seleccionados pasarán al nuevo grupo. Si pertenecen a otro grupo, se moverán automáticamente.`

Si uno o más seleccionados tienen categoría distinta de la elegida, añadir al mismo flujo informativo:

`Su categoría operativa cambiará a {categoría}.`

No exponer lenguaje interno sobre normalización de grupos origen.

### Feedback

Errores y retry usan `AdminNotice tone="error"`.

### Footer

```text
[ Cancelar ] [ Crear grupo ]
```

CTA habilitado solo si:

- nombre válido;
- categoría seleccionada;
- mínimo 2 SKU;
- no hay intent activo.

## 5. Administrar categorías

### Header

Título:

`Administrar categorías`

Descripción:

`Crea, renombra y define el orden operativo de las categorías.`

### Crear categoría

Acción local al inicio del Body:

```text
Nueva categoría
[ Nombre........................ ] [ + Crear ]
```

No mover creación al Footer.

### Lista

Fila normal:

```text
Bebidas
24 grupos · 116 productos                       [ ↑ ][ ↓ ][ ✎ ]
```

Acciones:

- Subir → `IconButton`;
- Bajar → `IconButton`;
- Renombrar → `IconButton`.

Cada acción conserva:

- `aria-label`;
- `title`;
- foco visible;
- estado disabled correcto.

### Rename inline

No abrir formulario al final de la lista.

Al activar Renombrar:

```text
[ Bebidas..................... ]                 [ Guardar ][ Cancelar ]
24 grupos · 116 productos
```

Solo una categoría puede estar en edición a la vez.

Guardar nombre:

- acción local;
- conserva mutación `category_rename`;
- no pertenece al Footer.

### Borrador de orden

Mover categorías crea un borrador local hasta guardar.

Mientras exista un borrador de orden vigente:

- Crear categoría: disabled;
- iniciar Renombrar: disabled;
- acciones de movimiento pueden seguir ajustando el borrador;
- Footer `Guardar orden`: habilitado.

Mostrar `AdminNotice tone="info"`:

`Guarda o descarta el nuevo orden antes de realizar otros cambios.`

### Cerrar con orden sin guardar

No descartar silenciosamente.

Al pulsar:

- X;
- `Cerrar`;

con borrador vigente, abrir nested `AdminDialog default`:

Título:

`Descartar cambios de orden`

Descripción:

`Hay cambios de orden sin guardar.`

Footer:

```text
[ Continuar editando ] [ Descartar y cerrar ]
```

`Descartar y cerrar` puede usar tono Danger por representar pérdida explícita del borrador local.

Al descartar:

- limpiar borrador local;
- cerrar nested;
- cerrar Administrar categorías.

### Footer principal

```text
[ Cerrar ] [ Guardar orden ]
```

Se reemplaza `Guardar orden completo` por `Guardar orden`.

`Guardar orden` disabled sin borrador vigente.

### Errores

Migrar `.notice--error` a `AdminNotice tone="error"` con retry integrado.

## 6. Integrantes del grupo

### Header

Título:

`Integrantes · {grupo}`

Descripción recomendada:

`{categoría} · {n} SKU`

El precio unitario se mantiene visible como contexto relevante dentro del Body o como información secundaria compacta.

No modificar variante `wide`.

### Integrantes actuales

La tabla y sus columnas se mantienen congeladas.

La acción de separar pasa de botón textual a `IconButton` con `Unlink`.

Accesibilidad:

- `aria-label="Separar {producto} y dejar como Único"`;
- `title="Separar y dejar como Único"`.

### Confirmación nested de separación

Pulsar Unlink **no ejecuta directamente** `make_unique`.

Abre nested `AdminDialog default`:

Título:

`Separar producto`

Descripción:

`El producto dejará el grupo y quedará como Único.`

Contexto:

```text
Producto       ...
C. interno     ...
Grupo actual   ...
```

Aclaración mediante `AdminNotice tone="info"`:

`El resto del grupo se actualizará automáticamente si su estructura cambia.`

Footer:

```text
[ Cancelar ] [ Separar y dejar como Único ]
```

La confirmación es obligatoria para evitar separaciones accidentales.

La mutación continúa siendo:

`make_unique`

sin cambios backend.

### Agregar o mover productos

Título local:

`Agregar productos`

Texto operativo:

`Los SKU seleccionados pasarán a este grupo.`

Usa el mismo `GroupCandidatePicker` de §3.

Si hay SKU seleccionados que pertenecen a otro grupo:

`AdminNotice tone="info"`:

`Los SKU que pertenecen a otro grupo se moverán automáticamente.`

Si cambia categoría:

`La categoría operativa de los SKU seleccionados cambiará a {categoría}.`

Las consecuencias pueden combinarse en un único Notice cuando ambas apliquen.

No mostrar copy técnico:

- `movimiento atómico`;
- detalles internos de normalización.

### Footer

```text
[ Cancelar ] [ Agregar al grupo ]
```

Se reemplaza:

`Agregar o mover SKU seleccionados`

por:

`Agregar al grupo`.

CTA disabled sin selección o con intent activo.

### Errores

Migrar `.notice--error` a `AdminNotice tone="error"` con retry integrado.

## 7. Nesting

Fase 6 añade dos casos nested:

1. Categorías → confirmar descarte de orden.
2. Integrantes → confirmar separación a Único.

Ambos reutilizan exclusivamente el contrato ya congelado de `AdminDialog`:

- stack global;
- foco;
- inert parent;
- Escape solo topmost;
- backdrop topmost;
- scroll lock stack-aware;
- restauración de foco.

No crear traps locales ni nueva infraestructura.

## 8. Responsive

### Wide principal

Desktop/Tablet:

- max 820 px;
- Body scroll;
- Header/Footer fijos.

Mobile:

- fullscreen;
- Footer apilado.

### Candidate Picker

Mobile:

- búsqueda full width;
- candidatos apilados;
- metadata puede envolver;
- selección no debe producir overflow horizontal.

### Categorías

Mobile:

- filas apiladas;
- acciones permanecen accesibles;
- rename inline se apila dentro de la misma fila.

## 9. Fuera de alcance

No se modifica:

- backend;
- contratos RPC;
- lógica autoritativa de grupos;
- tabla global de Grupos;
- primitive `AdminDialog`;
- limpieza global de `.notice`.

El cleanup global permanece reservado para Fase 10.

## 10. Estado

> **Fase 6 — Gestión Wide V1: APROBADA Y CONGELADA PARA IMPLEMENTACIÓN.**
