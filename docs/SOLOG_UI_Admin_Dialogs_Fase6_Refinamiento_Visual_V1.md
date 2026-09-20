# SOLOG — UI Admin — Fase 6 — Refinamiento Visual V1

**Proyecto:** SOLOG  
**Estado:** CERRADO · VALIDADO VISUALMENTE  
**Clasificación:** Nivel B — refinamiento visual frontend/Admin  
**Fecha:** 2026-09-20  
**Rama:** `admin-work`

## 1. Alcance

Este documento complementa y, únicamente en los puntos visuales aquí especificados, **prevalece sobre**:

- `docs/SOLOG_UI_Admin_Dialogs_Fase6_Gestion_Wide_V1.md`

La lógica funcional ya validada de Fase 6 permanece congelada:

- Crear grupo;
- reordenar/crear/renombrar categorías;
- mover integrantes;
- `make_unique`;
- nested de descarte;
- nested de separación;
- contratos RPC;
- reglas autoritativas de backend.

La validación técnica de Fase 6 está aprobada. Esta pasada existe exclusivamente para mejorar:

- densidad;
- jerarquía;
- lectura;
- reducción de superficies innecesarias.

## 2. IconButton — decisión explícita

**NO modificar la apariencia global de `IconButton`.**

En particular:

- conservar borde;
- conservar superficie;
- conservar tamaños normalizados;
- no crear variante ghost;
- no añadir overrides locales para quitar bordes;
- no introducir CSS adicional por una diferencia visual menor.

Los `IconButton` de Categorías y Unlink deben usar la primitive ya normalizada tal como existe.

## 3. GroupCandidatePicker — refinamiento visual

### 3.1 Búsqueda mínima

El picker no renderiza candidatos hasta que el término normalizado tenga al menos **2 caracteres**.

Estados:

Sin búsqueda o 1 carácter:

```text
Buscar SKU compatible
[ ... ]

Busca por código, producto, marca o grupo.
```

Con 2 o más caracteres:

- filtrar localmente;
- respetar compatibilidad de precio;
- respetar exclusión de grupo;
- renderizar máximo 50 coincidencias.

Si existen más de 50:

`Mostrando 50 resultados. Refina la búsqueda.`

No añadir paginación.

### 3.2 Resumen

Eliminar:

`Sin SKU seleccionados`

Cuando no hay selección, no mostrar contador vacío.

Cuando sí hay selección:

```text
3 seleccionados · S/ 3.50
```

Si no existe todavía precio requerido:

```text
3 seleccionados
```

### 3.3 Filas

Reducir peso visual.

Cada candidato:

```text
☐ Producto
  C. interno 12345 · Grupo/Único · S/ 3.50
────────────────────────────────────────
```

Contrato visual:

- sin card individual;
- sin franjas alternadas pesadas;
- fondo neutro;
- divisor inferior;
- altura objetivo aproximada: 48 px;
- producto semibold, no tipografía sobredimensionada;
- metadata secundaria 0.75rem;
- hover/selección sutiles;
- checkbox conservado.

La selección debe persistir al cambiar o limpiar búsqueda.

## 4. Crear grupo

Conservar:

- `variant="wide"`;
- Nombre + Categoría en dos columnas Desktop/Tablet;
- apilado Mobile;
- Footer actual;
- Notices funcionales ya aprobados.

Añadir encabezado local:

`Integrantes`

Composición:

```text
Nombre                         Categoría
[ ... ]                        [ ... ]

Integrantes
Buscar SKU compatible
[ ... ]
Busca por código, producto, marca o grupo.
```

No añadir:

- card;
- borde adicional;
- background adicional;

para separar la sección. La jerarquía se resuelve mediante título local y espaciado.

## 5. Administrar categorías

### 5.1 Lista plana

Eliminar apariencia de card por categoría.

Cambiar de:

```text
┌─────────────────────────────────┐
│ Cervezas              [↑][↓][✎] │
│ 29 grupos · 40 productos        │
└─────────────────────────────────┘
```

a:

```text
Cervezas                   [↑][↓][✎]
29 grupos · 40 productos
────────────────────────────────────
```

Contrato:

- sin borde/radius por fila;
- divisor inferior entre filas;
- fondo del Body;
- misma información actual;
- `IconButton` conserva su borde normalizado.

### 5.2 Rename inline

La fila en edición muestra solo:

```text
[ Nombre........................ ] [ Guardar ][ Cancelar ]
```

**Eliminar metadata de grupos/productos mientras la fila está en modo rename.**

La metadata no aporta información para decidir el nuevo nombre y no debe ocupar una segunda línea.

Al cancelar/guardar vuelve la fila normal con su metadata.

No crear nested para rename.

## 6. Integrantes del grupo

### 6.1 Header

Eliminar el bloque grande:

`admin-dialog-context`

que actualmente muestra Precio unitario + Tipo.

Integrar esos datos en la descripción del Header:

```text
Integrantes · Ajinomen vaso
De Bodega · 4 SKU · Agrupado · S/ 3.50
```

El Body comienza directamente con:

`Integrantes actuales`

### 6.2 Tabla

Conservar tabla, columnas y composición actual.

Unlink:

- mantiene `IconButton` normalizado;
- no modificar borde;
- continúa abriendo nested obligatorio;
- no ejecuta `make_unique` directamente.

### 6.3 Agregar productos

Eliminar copy redundante:

`Los SKU seleccionados pasarán a este grupo.`

Composición base:

```text
Agregar productos

Buscar SKU compatible
[ ... ]
Busca por código, producto, marca o grupo.
```

Con selección:

```text
2 seleccionados · S/ 3.50
```

Los Notices solo aparecen cuando existe una consecuencia adicional real:

- movimiento desde otro grupo;
- cambio de categoría.

El CTA Footer sigue siendo:

`Agregar al grupo`

## 7. Nested — Descartar cambios de orden

Conservar la composición actual.

No realizar cambios estructurales.

## 8. Nested — Separar producto

### 8.1 CTA

Cambiar:

`Separar y dejar como Único`

por:

`Separar`

El Header y la descripción ya explican la consecuencia completa.

### 8.2 Contexto

Cambiar:

`Grupo actual`

por:

`Grupo nuevo`

El valor mostrado será:

`{producto}`

Ejemplo:

```text
Producto       AJINOMEN GALLINA PICANTE 80GR
C. interno     21045
Grupo nuevo    AJINOMEN GALLINA PICANTE 80GR
```

### 8.3 Contrato backend verificado

Se verificó el backend autoritativo actual:

- `make_unique` separa el SKU;
- `inventario.solog_normalize_group_v3` normaliza un grupo de un solo integrante;
- el grupo resultante usa como `nombre` el valor de `catalogo.producto`;
- si existe un grupo inactivo con ese mismo nombre, puede reutilizarse;
- para la UI, el nombre resultante sigue siendo el nombre del producto.

Por tanto, mostrar `Grupo nuevo = producto` es consistente con el comportamiento autoritativo.

### 8.4 Notice

Conservar:

`El resto del grupo se actualizará automáticamente si su estructura cambia.`

Footer final:

```text
[ Cancelar ] [ Separar ]
```

## 9. CSS

Objetivo explícito:

- reutilizar reglas/primitives existentes;
- reducir CSS cuando sea posible;
- no crear variantes visuales nuevas de primitives globales;
- no añadir estilos dedicados para quitar bordes a `IconButton`.

Esta pasada debe simplificar superficies, no aumentar complejidad visual ni arquitectónica.

## 10. Cierre

El refinamiento visual fue implementado y validado mediante smoke humano.

Estado:

- densidad y jerarquía: ✅ aprobadas;
- GroupCandidatePicker refinado: ✅ aprobado;
- Categorías en lista plana: ✅ aprobadas;
- rename inline simplificado: ✅ aprobado;
- composición de Integrantes: ✅ aprobada;
- nested Separar producto: ✅ aprobado;
- apariencia global de IconButton preservada: ✅;
- validación visual final: ✅ aprobada.

Los cambios visuales posteriores realizados sobre esta fase se consideran correctos y forman parte del baseline final.

> **Fase 6 — Refinamiento Visual V1: CERRADO Y VALIDADO.**
