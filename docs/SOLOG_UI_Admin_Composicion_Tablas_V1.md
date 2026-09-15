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

Las decisiones de este documento ya fueron contrastadas posteriormente contra:

- el frontend actual del repositorio;
- los contratos TypeScript vigentes;
- los RPC consumidos por el Admin;
- el backend Supabase desplegado en `PuertoRicoOnline`.

Resultado de esa revisión:

> **La composición propuesta es técnicamente viable con el backend actual. No se requieren cambios de backend, Supabase, RPC ni lógica de negocio para implementar este bloque.**

Las únicas decisiones que permanecen abiertas son decisiones visuales/estructurales de frontend expresamente indicadas en este documento.

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

La primitive `IconButton` actual se amplía de:

```text
Default | Danger
```

a:

```text
Default | Info/Primary | Danger
```

La nueva variante `Info/Primary` queda aprobada como parte de este bloque para acciones compactas positivas, reversibles o de reincorporación que necesiten una señal visual superior a `Default` sin usar semántica destructiva.

El botón abre el modal existente que explica la acción, por lo que no es necesario repetir la explicación completa en la tabla.

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

Las tres vistas confirmadas por el contrato/backend actual son:

```text
Pendientes | Suprimidas | Resueltas
```

Correspondencia:

- `Pendientes` → `family_state = pendiente`;
- `Suprimidas` → `family_state = suprimida`;
- `Resueltas` → `family_state = resuelta`.

El mismo dataset de familias descargado por `summary` contiene la información necesaria para separar estas vistas. No se requiere una llamada distinta por StateView.

## 7.2 Composición provisional aprobada

En este bloque **no se define todavía una tabla específica para cada estado**.

Para poder implementar la separación por StateView sin anticipar decisiones futuras:

> **Pendientes, Suprimidas y Resueltas reutilizarán temporalmente la composición de la tabla actual de Incidencias.**

Esto significa:

- las tres vistas usan inicialmente las mismas columnas que existen hoy;
- las tres vistas usan inicialmente la misma estructura de fila;
- el cambio de StateView solo determina qué familias se muestran;
- no se agregan, eliminan ni reinterpretan columnas específicas por estado en este bloque;
- no se inventan acciones nuevas por estado en este bloque.

Esta reutilización es deliberadamente provisional.

## 7.3 Decisión futura preservada

Se mantiene aprobado que cada StateView **podrá tener una composición distinta** cuando se abra el bloque específico de Incidencias.

Queda expresamente fuera de esta versión decidir:

- columnas definitivas de Pendientes;
- columnas definitivas de Suprimidas;
- columnas definitivas de Resueltas;
- acciones disponibles en cada vista;
- prioridad de información por estado;
- diferencias de comportamiento entre vistas.

La implementación actual no debe cerrar ni dificultar esas decisiones futuras.

## 7.4 Modal

La composición del modal queda explícitamente pendiente.

No debe modificarse ni usarse como condicionante para esta separación inicial por StateView.

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

La revisión técnica confirmó que `Cambio` puede construirse con el payload actual sin consulta adicional.

---

# 9. Validación técnica de viabilidad

Esta sección registra la revisión realizada contra el frontend y backend reales después de congelar inicialmente la composición.

## 9.1 Resultado global

Se confirmó:

> **Todos los cambios de composición definidos en este documento son viables con los contratos y datos actuales.**

No se requiere:

- modificar tablas de Supabase;
- agregar columnas de base de datos;
- cambiar RPC existentes;
- crear RPC nuevas;
- cambiar lógica de negocio;
- cambiar RLS;
- cambiar flujo de publicación de Catálogo;
- cambiar flujo operativo de Control;
- cambiar motor de Incidencias.

La implementación de este bloque debe permanecer en frontend.

## 9.2 Control

El contrato actual ya expone la información necesaria para:

```text
Registrado | Grupo | Categoría | Estado | Diferencia | Valorizado | Detalle
```

El backend operativo ya entrega los datos equivalentes a:

- fecha/hora de registro;
- grupo;
- categoría;
- estado;
- diferencia;
- valorizado;
- detalle/cronología.

Por tanto, renombrar `Origen` a `Registrado` y moverlo a la primera columna es un cambio exclusivamente compositivo.

## 9.3 Productos

El Master Data actual expone:

- `estado: Único | Agrupado | Excluido`;
- `grupo_id`;
- catálogo de grupos;
- nombre del grupo derivable por `grupo_id`.

La revisión del backend desplegado confirmó además:

- los productos `Único` incluidos tienen grupo;
- los productos `Agrupado` tienen grupo;
- los productos sin grupo corresponden al estado `Excluido`.

Por tanto la composición:

```text
[ Único / Agrupado / Excluido ] [ Nombre del grupo ]
```

es compatible con el modelo actual.

También se confirmó que el filtro Incluido/Excluido es redundante respecto a la modalidad y puede eliminarse sin perder capacidad funcional.

## 9.4 Grupos

La información necesaria para:

- nombre;
- categoría;
- integrantes;
- tipo derivado;
- valorizado;
- edición de grupo;
- edición de valorizado;

ya existe en el snapshot/estado actual de Master Data.

Mover las acciones a una columna final y transformar Integrantes/Valorizado en QuickFilterChip no requiere soporte adicional del backend.

## 9.5 Incidencias

El contrato Admin actual expone tres estados de familia:

```text
pendiente | suprimida | resuelta
```

Por tanto las StateView quedan confirmadas como:

```text
Pendientes | Suprimidas | Resueltas
```

El `summary` existente ya devuelve las familias necesarias y cada familia incluye `family_state`, por lo que las tres vistas pueden derivarse del dataset ya descargado.

No se necesita una consulta por StateView.

La base de datos contiene además incidencias técnicas asociadas al descubrimiento de cambios de Catálogo, pero el RPC de Incidencias Admin filtra deliberadamente el conjunto operativo que corresponde a este módulo. Esa separación de responsabilidades se preserva.

La revisión técnica **no define** qué columnas o acciones definitivas debe tener cada StateView. Esa decisión permanece abierta y se abordará en un bloque posterior.

## 9.6 Catálogo — columna Cambio

Se confirmó que `CatalogProposal` ya contiene:

- `datos`;
- `catalogo_actual`;
- identidad del producto;
- tipo de propuesta;
- origen/contexto.

El backend actual genera información suficiente para cada caso:

### Precio, nombre y código

Los candidatos contienen:

```text
anterior
nuevo
```

por lo que pueden renderizarse directamente como:

```text
anterior → nuevo
```

### Excluir / reincorporar

Las propuestas generadas por Productos contienen:

```text
anterior_estado
nuevo_estado
```

por lo que no necesitan una consulta adicional.

### Agregar / eliminar producto

El tipo de propuesta y los datos actuales permiten mostrar las etiquetas congeladas:

```text
Nuevo producto
Eliminar producto
```

Conclusión:

> **La columna Cambio está soportada por el backend actual para todos los tipos contemplados en esta versión.**

La única mejora necesaria es frontend: tipar o normalizar `CatalogProposal.datos` por tipo antes de renderizar, porque actualmente se representa genéricamente como `Record<string, unknown>`.

Esto no requiere modificar el contrato de Supabase.

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

StateView y alcance provisional aprobados.

Confirmado:

- vistas `Pendientes | Suprimidas | Resueltas`;
- separación por `family_state`;
- reutilización temporal de la tabla actual en las tres vistas;
- sin consultas adicionales por vista;
- sin cambios backend.

Pendiente para un bloque posterior:

- composición definitiva por StateView;
- columnas específicas por vista;
- acciones específicas por vista;
- revisión posterior del modal.

## Catálogo

Composición y soporte de datos confirmados.

Confirmado:

- `Cambio` puede construirse con el payload actual;
- no requiere consulta adicional;
- no requiere cambios backend.

Pendiente:

- tipado/normalización frontend de `CatalogProposal.datos`;
- prioridad/alineación/ancho/responsive.

---

# 11. Próximo paso

Las dependencias técnicas de backend de este bloque ya están cerradas.

Antes de preparar implementación quedan únicamente decisiones de presentación general de tablas:

1. revisar prioridad de columnas;
2. revisar alineación;
3. definir anchos/wrapping;
4. definir responsive;
5. congelar el contrato visual final;
6. recién entonces preparar instrucciones para Codex.

La definición especializada de las tres tablas de Incidencias **no bloquea este flujo** y se tratará en un bloque posterior independiente.

No deben introducirse cambios backend durante la implementación de este documento.

---

# 12. Estado final

> **SOLOG — UI Admin — Composición de Tablas V1: APROBADO, VALIDADO TÉCNICAMENTE Y CONGELADO.**

Se ha confirmado que las decisiones descritas son viables con el frontend y backend actuales.

Este bloque:

- no requiere cambios de backend;
- no requiere cambios de Supabase;
- no requiere ampliar contratos RPC;
- no anticipa las columnas ni acciones definitivas de las StateView de Incidencias;
- no autoriza implementación todavía.

La futura especialización de `Pendientes`, `Suprimidas` y `Resueltas` deberá abrirse como una decisión independiente sin reinterpretar provisionalmente este documento.
