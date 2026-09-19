# SOLOG — Lógica Admin — Cambios de Catálogo de Origen Manual — Autoaprobación V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel C — lógica de negocio / backend / integración Admin  
**Fecha:** 2026-09-19  
**Rama de trabajo:** `admin-work`

## 1. Propósito

Este documento congela la modificación funcional para simplificar el flujo de cambios de Catálogo iniciados explícitamente por una persona desde el Admin.

La decisión elimina una aprobación humana redundante entre:

1. la confirmación explícita de una acción en su Dialog de origen; y
2. la publicación posterior del Catálogo.

La publicación continúa siendo una operación separada y explícita.

## 2. Problema resuelto

Flujo histórico para exclusión/eliminación:

```text
Módulo de origen
→ acción
→ Dialog de confirmación
→ crear propuesta pendiente
→ ir a Catálogo
→ localizar propuesta
→ revisar
→ aprobar
→ revisar publicación
→ confirmar publicación
```

La aprobación en Catálogo repite la misma decisión humana ya confirmada en el Dialog de origen.

## 3. Regla funcional congelada

### 3.1 Origen automático

Las propuestas detectadas automáticamente por el sistema continúan naciendo:

```text
estado = pendiente
```

y mantienen el flujo:

```text
Detección automática
→ Pendiente
→ Revisión humana en Catálogo
→ Aprobado / Ignorado
→ Publicación
```

Esto incluye, según aplique:

- producto nuevo detectado;
- nombre modificado;
- precio modificado;
- código de barras modificado/agregado/eliminado;
- demás propuestas derivadas automáticamente de snapshots/incidencias.

### 3.2 Origen manual confirmado

Los cambios iniciados explícitamente desde Admin y confirmados por una persona en su Dialog nacen:

```text
estado = aprobado
```

La confirmación del Dialog constituye la aprobación humana.

El cambio queda **listo para publicación**, pero **no se aplica inmediatamente** al catálogo operativo.

## 4. Acciones manuales cubiertas

La autoaprobación aplica a:

### Productos

- excluir producto;
- reincorporar producto.

### Incidencias

- eliminar producto a partir de la acción manual disponible para una incidencia válida de `producto_ausente`.

No se extiende automáticamente a otros tipos de propuesta sin una decisión explícita posterior.

## 5. Campos de aprobación

Cuando un cambio manual se crea o actualiza como aprobado, debe quedar registrado al menos:

```text
estado        = aprobado
aprobado_por  = usuario actual
aprobado_at   = now()
updated_at    = now()
```

Se deben preservar:

- `created_at`;
- `propuesta_fingerprint`;
- `c_interno`;
- tipo;
- payload/datos;
- origen;
- idempotencia;
- auditoría;
- restricciones de conflicto.

Si existe un estado previo incompatible, deben mantenerse las validaciones/conflictos actuales; no se autoriza sobrescribir silenciosamente otro cambio activo.

## 6. Auditoría y origen

Los cambios manuales deben conservar trazabilidad explícita de su origen.

La auditoría debe permitir distinguir una acción humana confirmada de una propuesta automática.

Se debe preservar el actor actual y la operación que originó el cambio.

No se elimina auditoría existente para:

- exclusión;
- reincorporación;
- eliminación.

Las acciones de auditoría pueden conservar sus nombres actuales si siguen describiendo correctamente el evento, pero los datos deben dejar claro que el cambio quedó aprobado en la misma operación.

## 7. Publicación sigue siendo obligatoria

Autoaprobar **no significa aplicar inmediatamente**.

Flujo objetivo:

```text
Acción manual
→ Confirmación
→ Cambio aprobado
→ Revisar publicación
→ Confirmar publicación
→ Aplicación efectiva
```

Por tanto:

- `inventario.catalogo` no cambia al confirmar el Dialog;
- los grupos/productos no se modifican definitivamente hasta publicar;
- la versión de Catálogo no cambia hasta publicar.

## 8. Validaciones de publicación permanecen

La autoaprobación no elimina las validaciones autoritativas de publicación.

Se conservan, entre otras, las validaciones actuales que pueden bloquear un cambio aprobado:

- producto con stock al intentar eliminar;
- producto inexistente;
- producto ya excluido;
- reincorporación de un producto no excluido;
- conflictos entre operaciones incompatibles del mismo SKU;
- eliminación junto con otros cambios incompatibles;
- propuesta/cambio desactualizado;
- configuración requerida;
- conflictos de grupo/precio;
- demás validaciones vigentes de `catalogo_preparar_publicacion_v3`.

Un cambio puede estar:

```text
aprobado
```

y aun así:

```text
no publicable
```

si falla una validación posterior.

## 9. Exclusión manual

Flujo objetivo:

```text
Productos
→ Aprobar exclusión
→ cambio excluir_producto creado como aprobado
→ listo para revisión/publicación
→ publicación
```

El producto no cambia a `Excluido` hasta que la publicación sea confirmada.

### Copy de Fase 4

Título:

`Aprobar exclusión`

Descripción:

`El cambio quedará aprobado y listo para incluirse en la próxima publicación del Catálogo.`

Footer:

```text
[ Cancelar ] [ Aprobar exclusión ]
```

La acción principal usa tono **Danger**.

## 10. Reincorporación manual

Flujo objetivo:

```text
Productos
→ Aprobar reincorporación
→ cambio reincorporar_producto creado como aprobado
→ configuración SOLOG requerida
→ publicación
```

La autoaprobación no elimina el requisito de configuración.

Mientras falte `_setup`, el cambio aprobado puede permanecer bloqueado/no publicable por:

`configuracion_requerida`

### Copy de Fase 4

Título:

`Aprobar reincorporación`

Descripción:

`El cambio quedará aprobado. Antes de publicarlo deberá completarse la configuración necesaria del producto.`

Footer:

```text
[ Cancelar ] [ Aprobar reincorporación ]
```

La acción principal usa tono **Primary**.

## 11. Eliminación desde Incidencias

Flujo objetivo:

```text
Incidencias
→ Aprobar eliminación
→ cambio eliminar_producto creado como aprobado
→ listo para revisión/publicación
→ publicación
```

La elegibilidad actual de la incidencia se conserva.

En particular, la acción solo continúa siendo válida cuando el backend confirma las condiciones vigentes para `producto_ausente` y la evidencia actual requerida.

### Copy de Fase 4

Título:

`Aprobar eliminación`

Descripción:

`El cambio quedará aprobado y listo para incluirse en la próxima publicación del Catálogo.`

Body recomendado:

- Producto;
- C. interno;
- Detectado en;
- aclaración de que el producto no se elimina hasta publicar el Catálogo.

Footer:

```text
[ Cancelar ] [ Aprobar eliminación ]
```

La acción principal usa tono **Danger**.

## 12. Catálogo Admin

Los cambios manuales autoaprobados:

- deben aparecer en el estado/listado `aprobado`;
- no deben aparecer inicialmente como `pendiente`;
- no requieren volver a ejecutar `proposal_action = approve`;
- siguen siendo visibles/revisables antes de publicación;
- pueden conservar las capacidades ya existentes de retirar aprobación si el contrato actual lo permite y no existe otra decisión posterior que lo cambie.

Las propuestas automáticas continúan entrando por `pendiente`.

## 13. Regla conceptual resumida

```text
Origen automático
→ requiere aprobación humana posterior

Origen manual confirmado
→ la confirmación es la aprobación
→ nace aprobado
```

## 14. Contratos que no cambian

Esta decisión no modifica:

- publicación versionada;
- preview de publicación;
- confirmación final de publicación;
- idempotencia;
- revisiones autoritativas;
- locking;
- conflictos;
- validaciones de stale;
- requisitos de setup;
- permisos actuales de cada RPC;
- arquitectura de Catálogo;
- foco/nesting de Dialogs.

## 15. Baseline backend verificado antes de implementación

En el estado actual previo a implementar esta decisión:

- `propose_product_state` crea `excluir_producto` / `reincorporar_producto` con `estado='pendiente'`;
- `propose_delete` crea `eliminar_producto` con `estado='pendiente'`;
- `catalogo_preparar_publicacion_v3` selecciona únicamente cambios con `estado='aprobado'`;
- la aprobación posterior en Catálogo registra `aprobado_por` y `aprobado_at`.

La implementación debe cambiar los dos primeros puntos sin debilitar el tercero.

## 16. Decisiones relacionadas de Fase 4

Quedan también confirmadas para la exploración visual:

### Dispositivos

- no mostrar UUID en el Dialog;
- el flujo de reemplazo ya no pertenece a la UX vigente;
- Revocar debe comunicar:

`El dispositivo perderá autorización. La sede quedará disponible para una nueva solicitud de acceso.`

### Productos

En el Dialog de exclusión/reincorporación:

- eliminar el campo `Modalidad`, porque no aporta información adicional.

## 17. Estado

> **SOLOG — Lógica Admin — Cambios de Catálogo de Origen Manual — Autoaprobación V1: APROBADO Y CONGELADO.**

La implementación debe respetar esta fuente como contrato funcional del cambio.
