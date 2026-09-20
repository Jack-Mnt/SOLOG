# SOLOG — UI Admin — Dialogs Fase 7 — Catálogo + Nesting V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO PARA IMPLEMENTACIÓN  
**Clasificación:** Nivel B — UI/UX frontend/Admin + corrección funcional de integración frontend  
**Fecha:** 2026-09-20  
**Rama:** `admin-work`  
**Baseline de exploración:** `3600f69243cf10b156ba8c3cf495c4e9f4d39573`

## 1. Fuentes relacionadas

Este documento complementa:

- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`
- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md`
- `docs/SOLOG_UI_Admin_Dialogs_Fase5_Formularios_Tareas_V1.md`
- `docs/SOLOG_UI_Admin_Dialogs_Fase6_Gestion_Wide_V1.md`

En los puntos cubiertos por este documento, esta fuente prevalece para la composición individual de:

1. Detalle de propuesta.
2. Resolver precio.
3. Publicar catálogo.
4. Nesting con Configurar producto.
5. Nesting con Configuración de valorizado.

No se reabre la arquitectura global de `AdminDialog`, foco, stack, Escape, inert ni scroll lock.

## 2. Alcance

Fase 7 tiene dos objetivos:

1. normalizar visualmente y operacionalmente los Dialogs de Catálogo;
2. validar los flujos nested de dos y tres niveles.

No se modifica backend.

Sí se permite una corrección funcional frontend ya verificada:

- el handoff de precio hacia `ProductSetupDialog` para propuestas `agregar_producto`.

## 3. Detalle de propuesta

### 3.1 Variante

Conservar:

`variant="wide"`

El ancho está justificado por contexto, estados y acciones variables.

### 3.2 Jerarquía

El detalle debe priorizar:

1. producto;
2. tipo de cambio;
3. cambio actual → nuevo;
4. contexto operativo;
5. estado de publicación;
6. acciones globales.

Eliminar del Body visible:

- UUID / `Cambio <id>`;
- sección urgente/emergente.

No eliminar esos datos de contratos ni del modelo.

### 3.3 Cambio principal

Para `precio`, `nombre` y `codigo`, usar `catalogProposalChange()` para presentar claramente:

```text
Cambio propuesto

Precio actual       S/ 3.00
Precio nuevo        S/ 3.50
```

o equivalentes para texto/código.

Para cambios de estado:

- agregar producto;
- eliminar producto;
- excluir producto;
- reincorporar producto;

mostrar una descripción operacional legible, no metadata técnica.

### 3.4 Contexto secundario

Mantener cuando exista:

- C. interno;
- Origen;
- Sedes;
- Apariciones;
- Primera evidencia;
- Última evidencia.

Evitar repetir información ya visible en Header o Cambio propuesto.

### 3.5 Estados y bloqueos

Migrar mensajes sueltos a `AdminNotice`.

Reglas:

- `stale` → `warning`;
- bloqueado/no publicable → `error`;
- listo para publicación → `success`;
- aprobado pero sin estado final disponible → `info`.

Traducir `block_reason` a copy humano.

Mapa mínimo esperado:

- `propuesta_desactualizada` → existe evidencia más reciente;
- `configuracion_requerida` → requiere configuración antes de publicar;
- `producto_con_stock` → no puede eliminarse mientras tenga stock;
- `producto_no_encontrado` → producto no disponible en Catálogo;
- `producto_excluido` → producto excluido;
- `grupo_no_disponible` → grupo actual no disponible;
- `resolucion_precio_desactualizada` → resolución preparada desactualizada;
- `resolucion_precio_requerida` → debe resolverse el cambio de precio;
- `decision_precio_paquete_requerida` → debe definirse el valorizado por paquete;
- `precio_paquete_invalido` → precio por paquete inválido.

No mostrar el código técnico como copy principal.

### 3.6 Footer

Conservar semántica actual:

Pendiente:

```text
[ Cerrar ] [ Ignorar propuesta ] [ Aprobar ]
```

Aprobada:

```text
[ Cerrar ] [ Retirar aprobación ] [ Configurar producto / Resolver precio ]
```

Las acciones de configuración/resolución permanecen en Footer porque gobiernan el flujo completo.

## 4. Resolver precio

### 4.1 Variante

Conservar:

`variant="wide"`

### 4.2 Copy

Eliminar lenguaje visible:

- `staging`;
- `Existe staging preparado`;
- `Sin resolución preparada`;
- `Preparar resolución`.

Usar lenguaje operativo:

- preparada;
- guardada;
- aplicada al publicar Catálogo.

Notice principal:

`La resolución quedará preparada y se aplicará al publicar el Catálogo.`

### 4.3 Contexto

Composición recomendada:

```text
Grupo              Four Loko
Precio actual      S/ 10.00
Precio nuevo       S/ 12.00
Valorizado actual  x6 · S/ 55.00
```

No repetir información innecesaria.

La tabla de integrantes afectados se conserva.

### 4.4 Resolución agrupada

Cuando backend entrega exactamente:

- `update_group_price`;
- `separate_sku`;

usar `AdminBinarySwitch`:

```text
Resolución
[ Actualizar grupo | Separar producto ]
```

Labels UI:

- `Actualizar grupo`;
- `Separar producto`.

No usar `select` en este caso.

### 4.5 Estructura única

Cuando backend entrega únicamente:

`keep_structure`

no mostrar selector.

Seleccionar `keep_structure` automáticamente en frontend y mostrar:

`El producto es el único integrante del grupo; se conservará su estructura.`

La regla backend continúa siendo autoritativa.

### 4.6 Valorizado

Mantener la decisión de valorizado separada de Resolución.

No forzar `AdminBinarySwitch` si existen más de dos estados semánticos posibles.

Mantener las posibilidades backend actuales:

Para estructura existente:

- conservar;
- eliminar;
- configurar/actualizar.

Para `separate_sku`:

- eliminar/no aplica;
- configurar nuevo valorizado.

La UI debe presentar únicamente opciones compatibles con la resolución actual.

### 4.7 Resolución preparada existente

Si `prepared_resolution` existe al abrir:

restaurar en el estado frontend:

- resolución;
- package action;
- unidades por paquete;
- precio por paquete.

El Dialog debe abrir mostrando la decisión preparada real.

El CTA se deshabilita mientras el estado efectivo no difiera de la resolución preparada.

### 4.8 Footer

```text
[ Cancelar ] [ Guardar resolución ]
```

`Guardar resolución` disabled cuando:

- propuesta ya no está aprobada;
- falta resolución;
- falta decisión de valorizado;
- configuración inválida;
- existe intent;
- no hay cambio efectivo respecto de `prepared_resolution`.

## 5. Configuración de valorizado nested

Conservar `ValuationDialog`.

Flujo:

```text
Detalle de propuesta
└── Resolver precio
    └── Configuración de valorizado
```

No modificar su arquitectura de Dialog.

### 5.1 CTA contextual

Permitir que `ValuationDialog` reciba un label opcional de confirmación.

Default:

`Guardar valorizado`

Contexto Resolver precio:

`Aplicar`

Fase 5 conserva el comportamiento anterior sin cambios.

### 5.2 Copy contextual

En Resolver precio:

`Esta configuración se aplicará al guardar la resolución y publicar el Catálogo.`

No utilizar `staging`.

### 5.3 Semántica

Confirmar Valorizado:

- solo actualiza el draft de `PriceResolutionDialog`;
- no ejecuta `prepare_price`;
- el cambio remoto ocurre únicamente al pulsar `Guardar resolución` en el padre.

## 6. Configurar producto — integración nested

Flujo:

```text
Detalle de propuesta
└── Configurar producto
```

`ProductSetupDialog` mantiene la composición cerrada en Fase 5.

No rediseñar su UI en Fase 7 salvo incompatibilidad técnica demostrable.

### 6.1 Corrección funcional obligatoria

Actualmente el padre puede construir:

`precio: proposal.catalogo_actual.precio ?? 0`

Esto es incorrecto para `agregar_producto`.

Backend verificado:

- producto nuevo puede no existir todavía en `catalogo`;
- `catalogo_actual.precio` puede ser `null`;
- el precio nuevo existe en `proposal.datos.precio`.

Regla congelada:

```text
agregar_producto
→ precio propuesto de proposal.datos

reincorporar_producto
→ precio autoritativo disponible de la propuesta/catálogo
```

Nunca utilizar `0` como fallback silencioso para filtrar grupos compatibles.

Si no existe un precio numérico válido, el flujo debe quedar bloqueado con feedback explícito en lugar de ofrecer grupos incorrectos.

No se modifica backend.

## 7. Publicar catálogo

### 7.1 Variante

Conservar:

`variant="wide"`

### 7.2 Preview válido

Header:

`Publicar catálogo`

Descripción:

`Revisa los cambios antes de publicar una nueva versión.`

Resumen:

```text
Versión           6 → 7
Cambios           4
SKU               982 → 984
```

Después:

`Cambios incluidos`

Mostrar únicamente tipos cuyo contador sea mayor que cero.

Ejemplo:

```text
Agregar producto       2
Cambiar precio         1
Excluir producto       1
```

No mostrar como copy principal:

- `CATALOG_PREVIEW_READY`;
- códigos internos;
- `change_ids`;
- JSON.

### 7.3 Preview inválido

Mostrar un `AdminNotice tone="error"` global:

`No se puede publicar todavía.`

Después una lista estructurada de conflictos.

Por conflicto mostrar cuando exista:

- entidad / C. interno;
- mensaje humano.

Ejemplo:

```text
C. interno 20475
El producto requiere configuración antes de publicar.
```

No renderizar JSON bruto.

Si backend entrega únicamente `errores`, mostrar esos mensajes mediante UI de error normalizada.

### 7.4 Moderador

Moderador puede revisar el preview, pero no publicar.

No mostrar CTA Primary disabled permanentemente.

Footer para moderador:

```text
[ Cerrar ]
```

Mostrar `AdminNotice tone="info"`:

`Puedes revisar esta publicación, pero solo un administrador puede publicarla.`

### 7.5 Admin

Sin operación pendiente:

```text
[ Cancelar ] [ Publicar catálogo ]
```

Mientras publica:

`Publicando…`

Con operación incierta/recuperable:

```text
[ Cerrar ] [ Recuperar publicación ]
```

Mantener el mismo `operation_id`.

### 7.6 Recuperación e idempotencia

No modificar la arquitectura de recuperación del store.

Humanizar copies.

Operación incierta:

`No se pudo confirmar el resultado de la publicación. Recuperar reutilizará la misma operación sin duplicar los cambios.`

Commit remoto confirmado pero cierre pendiente:

`La nueva versión fue publicada, pero falta confirmar el cierre de la operación. Usa Recuperar publicación.`

### 7.7 Publicación completada

Si:

`completion_recorded === true`

no ofrecer nuevamente Publicar desde ese estado del Dialog.

Footer:

`[ Cerrar ]`

Mostrar success con versión publicada.

## 8. Nesting y foco

No crear infraestructura nueva.

Flujos obligatorios de smoke:

### Dos niveles

```text
Detalle de propuesta
└── Configurar producto
```

Validar:

- parent inert;
- Escape cierra solo hijo;
- X/Cancelar cierra solo hijo;
- foco vuelve al CTA de Configurar producto;
- scroll lock permanece hasta cerrar último Dialog.

### Tres niveles

```text
Detalle de propuesta
└── Resolver precio
    └── Configuración de valorizado
```

Validar:

- solo topmost responde Escape;
- parents inert;
- confirmación de Valorizado vuelve a Resolver precio;
- Resolver conserva draft;
- cancelar Valorizado no altera draft;
- confirmar Valorizado no dispara backend;
- guardar Resolución sí ejecuta `prepare_price`;
- cierre restaura foco nivel por nivel.

## 9. Feedback y errores

Dentro de consumidores de Fase 7:

retirar cuando sea razonable:

- raw `<p role="alert">`;
- raw `<p role="status">`.

Preferir:

- `AdminNotice info`;
- `AdminNotice warning`;
- `AdminNotice error`;
- `AdminNotice success`;
- `CatalogMutationNotice` para intents remotos existentes.

No realizar cleanup global de clases o patrones fuera de Catálogo; queda reservado para Fase 10.

## 10. Responsive

Detalle de propuesta, Resolver precio y Publicar catálogo permanecen `wide`.

Desktop/Tablet:

- max 820 px;
- Header/Footer fijos;
- Body scroll.

Mobile:

- fullscreen;
- Footer apilado;
- summary/context a una columna;
- tablas con su comportamiento responsive ya normalizado.

Nested `ValuationDialog` y `ProductSetupDialog` permanecen `default`, por lo que en Mobile conservan su contrato correspondiente.

## 11. Validación técnica esperada

Añadir o actualizar pruebas sobre:

- cambio principal del Detalle;
- traducción de `block_reason`;
- selector binario de resolución;
- auto `keep_structure`;
- restauración de `prepared_resolution`;
- no-change guard;
- CTA contextual de Valuation;
- precio correcto para `agregar_producto`;
- preview publicación válido;
- conflictos estructurados;
- moderador sin CTA de publicación;
- publicación completada sin segunda publicación;
- nesting de dos y tres niveles.

Validación estándar:

```bash
bun test --reporter=dot
bun run lint
bun run build
git diff --check
```

## 12. Fuera de alcance

No modificar:

- RPC;
- funciones Supabase;
- store publication idempotency;
- contratos V3;
- primitive `AdminDialog`;
- arquitectura global de foco;
- tablas globales;
- Sidebar/Shell;
- cleanup global de CSS.

## 13. Estado

> **Fase 7 — Catálogo + Nesting V1: APROBADA Y CONGELADA PARA IMPLEMENTACIÓN.**
