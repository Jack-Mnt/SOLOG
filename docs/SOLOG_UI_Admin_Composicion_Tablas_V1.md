# SOLOG — UI Admin — Composición de Tablas V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — definición visual/estructural frontend Admin  
**Fecha:** 2026-09-15

---

# 1. Propósito

Este documento congela únicamente la **composición funcional y visual de las tablas principales del Admin** antes de definir:

- prioridad de columnas;
- alineación;
- anchos;
- wrapping;
- responsive;
- densidad de filas;
- tipografía de celdas.

No autoriza implementación todavía.

---

# 2. Fuente primaria y precedencia

Fuente primaria de este bloque:

- `docs/SOLOG_UI_Admin_Composicion_Tablas_V1.md`

Fuentes relacionadas vigentes:

1. `docs/SOLOG_UI_Sistema_Visual_V1.md`
2. `docs/SOLOG_UI_Admin_Secciones_Tablas_Base_V1.md`
3. `docs/SOLOG_UI_Admin_Primitives_Controles_V1.md`
4. `docs/SOLOG_UI_Admin_Controles_Densidad_Responsive_Delta_V1.md`
5. `docs/SOLOG_Arquitectura_CSS_Sistema_Visual_V1.md`

Ante contradicciones:

- contratos funcionales/backend prevalecen;
- este documento prevalece para composición de columnas y acciones de las tablas principales;
- el bloque de Secciones y Table Shell permanece congelado y no se reabre.

---

# 3. Fuera de alcance

Queda fuera de este documento:

- prioridad de columnas;
- alineación;
- anchos;
- min-width;
- truncado;
- wrapping;
- responsive final;
- altura de filas;
- padding de celdas;
- tipografía interna;
- sticky columns;
- sort por columnas;
- backend;
- Supabase;
- contratos;
- lógica de negocio;
- dialogs/modals salvo cuando se menciona explícitamente que se revisarán después.

---

# 4. Control

## 4.1 Composición aprobada

La tabla principal de Control queda conceptualmente:

```text
Registrado | Grupo | Categoría | Estado | Diferencia | Valorizado | Detalle
```

## 4.2 Cambio aprobado

La columna actual `Origen` pasa a llamarse:

> **Registrado**

y se mueve a la **primera columna**.

Motivo:

- evita cortar visualmente la relación entre producto/grupo y diferencia;
- convierte la lectura en:
  - cuándo;
  - qué;
  - contexto;
  - estado;
  - resultado;
  - impacto;
  - detalle.

No se modifica todavía la presentación interna de fecha/hora.

---

# 5. Productos

## 5.1 QuickFilterChip para modalidad

El filtro actual `Modalidad` pasa a QuickFilterChip.

Estados esperados:

```text
Todos | Únicos | Agrupados | Excluidos
```

La semántica sigue siendo filtro rápido sobre el mismo dataset.

## 5.2 Eliminar filtro Incluido / Excluido

Se elimina el filtro independiente Incluido/Excluido.

Motivo:

- Incluido/Excluido es redundante respecto a:
  - Único;
  - Agrupado;
  - Excluido.

## 5.3 Eliminar columna Estado

La columna `Estado` deja de existir como columna separada.

Su información se integra en `Grupo`.

## 5.4 Nueva composición de Grupo

La celda Grupo muestra:

```text
[ Único / Agrupado / Excluido ] [ Nombre del grupo ]
```

Regla importante:

> **Único también debe mostrar nombre del grupo.**

Motivo:

- el grupo funciona además como máscara operativa;
- ayuda a que el trabajador entienda qué producto debe contar.

No usar `Sin grupo` como sustituto para Único cuando existe nombre de grupo.

## 5.5 Acción

La acción de fila deja de usar Button con texto y pasa a **IconButton**.

Semántica:

- excluir → variante Danger;
- reincorporar → variante Info/Primary.

El botón abre un modal que explica la acción, por lo que no es necesario repetir la explicación completa en la tabla.

Debe mantener:

- aria-label completo;
- icono Lucide apropiado;
- la misma lógica/modal existente.

## 5.6 Composición resultante

```text
Producto | C. interno | Categoría | Grupo | Precio | Acción
```

---

# 6. Grupos

## 6.1 Nueva columna Acciones

Las acciones de edición dejan de estar mezcladas dentro de las celdas de datos.

La tabla queda conceptualmente:

```text
Grupo | Categoría | Integrantes | Valorizado | Acciones
```

## 6.2 Acciones aprobadas

En la columna final:

- editar Grupo → icono `Pencil`;
- editar Valorizado → icono `CircleDollarSign`.

Se preservan los mismos modales/handlers existentes.

## 6.3 QuickFilterChip

Los filtros:

- Integrantes;
- Valorizado;

pasan a usar QuickFilterChip.

No deben tratarse como badges informativos.

## 6.4 Integrantes

El control de integrantes usa:

- estado normal → `Package`;
- hover → `PackageOpen`.

Reglas:

- mismo tamaño de icono;
- sin desplazamiento de layout;
- aria-label estable;
- el cambio visual no sustituye la accesibilidad.

---

# 7. Incidencias

## 7.1 Estado pasa a StateView

El filtro `Estado` deja de tratarse como filtro ordinario.

Pasa a organizarse mediante **StateView**, porque representa una secuencia/workflow y no una selección arbitraria.

## 7.2 Consecuencia aprobada

Cada vista puede tener una **composición de tabla distinta**.

No se forzará una sola tabla con columnas idénticas para todos los estados.

## 7.3 Orden de definición

Antes de diseñar el modal:

1. separar las vistas de Incidencias;
2. definir la composición de tabla de cada vista;
3. congelar navegación/workflow;
4. revisar después la composición del modal de detalle.

## 7.4 Modal

La composición del modal queda explícitamente pendiente.

No debe condicionar la definición inicial de las vistas/tablas.

---

# 8. Catálogo

## 8.1 Fusionar C. interno + Producto

`C. interno` deja de ser una columna independiente.

La columna `Producto` muestra identidad compuesta:

```text
[c. interno]
[Nombre producto]
```

El código es información secundaria y el nombre es la identidad principal.

## 8.2 Simplificar Origen

La columna `Origen` debe usar etiquetas directas y compactas.

Ejemplo aprobado:

- `Candidato automático` → `Automático`.

Se evitarán frases largas cuando una etiqueta breve exprese la misma semántica.

## 8.3 Nueva columna Cambio

Se agrega una columna:

> **Cambio**

Su función es permitir entender directamente qué se modificará sin abrir el detalle.

Ejemplos:

### Precio

```text
S/ 1.50 → S/ 2.00
```

### Agregar producto

```text
Nuevo producto
```

### Eliminar producto

```text
Eliminar producto
```

### Excluir producto

```text
Excluir de conteo
```

### Reincorporar

```text
Reincorporar
```

### Nombre

```text
Nombre anterior → Nombre nuevo
```

### Código

```text
12345 → 67890
```

## 8.4 Composición resultante

```text
Tipo | Producto | Cambio | Origen | Acción
```

La columna `Tipo` se conserva por ahora.

No se elimina hasta validar que `Cambio` cubra suficientemente todos los casos.

---

# 9. Dependencias pendientes antes de implementación

## 9.1 Catálogo — datos para Cambio

Debe validarse que el payload actual de `CatalogProposal` expone, sin consulta adicional:

- valor anterior;
- valor nuevo;

para todos los tipos relevantes:

- precio;
- nombre;
- código;
- alta;
- eliminación;
- exclusión;
- reincorporación.

No asumir disponibilidad sin comprobar el contrato real.

## 9.2 Incidencias — StateView

Antes de implementar se debe revisar:

- estados/familias reales;
- cantidad de vistas;
- nombres definitivos;
- secuencia;
- pertenencia de registros por vista;
- si cada vista puede usar el dataset ya descargado o requiere distinta consulta.

---

# 10. Estado de cada módulo

## Control

Composición principal aprobada.

Pendiente:

- prioridad;
- alineación;
- ancho;
- responsive.

## Productos

Composición principal aprobada.

Pendiente:

- prioridad;
- alineación;
- ancho;
- responsive.

## Grupos

Composición principal aprobada.

Pendiente:

- prioridad;
- alineación;
- ancho;
- responsive.

## Incidencias

Dirección estructural aprobada.

Pendiente:

- definición de vistas;
- composición por vista;
- revisión posterior del modal.

## Catálogo

Composición propuesta aprobada.

Pendiente:

- validar datos disponibles para `Cambio`;
- prioridad/alineación/ancho/responsive.

---

# 11. Próximo paso

Antes de preparar implementación:

1. validar dependencias de Catálogo e Incidencias;
2. completar composición de vistas de Incidencias;
3. revisar prioridad de columnas;
4. revisar alineación;
5. definir anchos/wrapping;
6. definir responsive;
7. congelar el contrato final;
8. recién entonces preparar instrucciones para Codex.

---

# 12. Estado final

> **SOLOG — UI Admin — Composición de Tablas V1: APROBADO Y CONGELADO.**

Este documento congela únicamente las decisiones descritas. No autoriza implementación todavía.
