# SOLOG — UI Admin — Dialogs Fase 5 — Formularios y Tareas V1

**Proyecto:** SOLOG  
**Estado:** APROBADO Y CONGELADO  
**Clasificación:** Nivel B — UI/UX frontend/Admin  
**Fecha:** 2026-09-19  
**Rama:** `admin-work`

## 1. Fuentes relacionadas

Este documento complementa:

- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`
- `docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md`
- `docs/SOLOG_UI_Admin_Dialogs_Fase4_Confirmaciones_V1.md`

La Fase 5 mantiene los cinco consumidores en variante `default`.

## 2. Regla transversal — selector binario

Cuando una selección permita **exactamente dos opciones mutuamente excluyentes**, se utilizará un **selector binario segmentado** en lugar de:

- `select`;
- checkbox usado como selector de modo;
- dos botones independientes;
- labels genéricos On/Off cuando ambas opciones tengan significado propio.

La composición debe mostrar siempre las dos opciones disponibles y el estado seleccionado.

### 2.1 Semántica

Para opciones con significado propio se usarán etiquetas explícitas, por ejemplo:

```text
[ Anterior | Actual ]
[ Unitario | Por paquete ]
[ Grupo existente | Grupo unitario ]
```

No usar:

```text
[ Off | On ]
```

si el dominio permite describir mejor ambos estados.

### 2.2 Accesibilidad

El control representa una selección exclusiva entre dos valores, no un checkbox visual.

Contrato esperado:

- grupo con nombre accesible;
- dos opciones navegables;
- estado seleccionado expuesto semánticamente;
- teclado y foco visibles;
- no depender únicamente del color;
- no cambiar automáticamente de valor al recibir foco.

La implementación podrá materializarse como primitive Admin compartida si la reutilización real en estos tres casos lo justifica.

### 2.3 Geometría

Debe respetar la densidad global del Admin:

- Desktop/Tablet: 36 px de alto;
- Mobile: 32 px de alto;
- dos segmentos de ancho equilibrado;
- borde/radius alineado con controles Admin;
- selección claramente visible;
- sin apariencia de dos CTAs.

## 3. Descargar ajuste

### Header

Título:

`Descargar ajuste`

Descripción:

`Genera un archivo Excel con la información de la quincena seleccionada.`

Se elimina lenguaje técnico sobre:

- reutilización de la tabla visible;
- implementación de consulta;
- resolución interna del backend.

### Body

La sede **no se vuelve a elegir**.

El Dialog usa la sede ya seleccionada en el contexto desde el que se abre.

La única selección es la quincena mediante selector binario:

```text
Quincena
[ Anterior | Actual ]
```

Valor inicial:

`Actual`

Texto secundario permitido:

`Las fechas se calculan con horario de Lima.`

No requiere Notice informativo.

Los errores usan `AdminNotice tone="error"`.

### Footer

```text
[ Cancelar ] [ Descargar Excel ]
```

CTA Primary con icono de descarga.

## 4. Editar grupo

### Header

Título:

`Editar grupo`

Descripción:

`Actualiza el nombre operativo o la categoría del grupo. Esto no modifica los nombres comerciales de sus SKU.`

### Body

Campos:

1. Nombre.
2. Categoría.

Se elimina del Body:

- precio unitario;
- cualquier dato que no intervenga en la edición.

Si cambia la categoría se muestra:

`AdminNotice tone="info"`

con:

`La categoría se aplicará a todos los integrantes del grupo.`

Errores/retry deben migrar al sistema `AdminNotice`; no conservar `.notice--error` como composición local del Dialog.

### Footer

```text
[ Cancelar ] [ Guardar cambios ]
```

`Guardar cambios` permanece deshabilitado mientras no exista una modificación efectiva respecto del estado inicial.

Comparación del nombre:

- usar valor normalizado con `trim()`.

## 5. Configuración de valorizado

### Objetivo

Separar claramente:

1. contexto actual;
2. modo de valorización;
3. configuración de paquete;
4. feedback.

### Contexto

Usar `admin-dialog-context`:

```text
Precio unitario      S/ X.XX
Valorizado actual    Sin valorizado | xN · S/ X.XX
```

### Selector binario

Se reemplaza el checkbox `Valorización por paquete` por:

```text
Valorización
[ Unitario | Por paquete ]
```

- `Unitario` equivale a valorizado desactivado.
- `Por paquete` equivale a valorizado activado.

### Configuración por paquete

Solo visible cuando `Por paquete` está seleccionado.

Incluye:

- presets de unidades;
- opción `Otro`;
- unidades personalizadas cuando corresponda;
- Precio por paquete.

Los presets siguen siendo acciones locales del Body.

### Precio por paquete

El campo numérico usa:

```text
step="0.1"
```

Las flechas nativas incrementan/decrementan en S/ 0.10.

Se elimina el texto independiente:

`Referencia sugerida: ...`

La sugerencia automática permanece representada directamente en el **valor del campo Precio por paquete** mientras el usuario no lo haya editado manualmente.

Una edición manual conserva su valor y no debe ser sustituida silenciosamente al cambiar otros controles, salvo las reglas ya existentes expresamente aprobadas.

### Feedback

Errores locales/remotos usan `AdminNotice tone="error"`.

La acción de retry pertenece al mismo Notice cuando aplique.

### Footer

```text
[ Cancelar ] [ Guardar valorizado ]
```

El CTA permanece deshabilitado si la configuración efectiva coincide con el estado inicial.

## 6. Configurar producto

### Header

Título:

`Configurar producto`

La identidad deja de depender únicamente de una frase concatenada en description.

El Body muestra contexto estructurado:

```text
Producto      ...
C. interno    ...
Precio        S/ X.XX
```

El precio se muestra porque condiciona la compatibilidad del destino y es inmutable en este flujo.

### Notice

Usar `AdminNotice tone="info"`:

`La configuración quedará preparada y se aplicará al publicar el Catálogo.`

Se elimina el término técnico `staging` del copy visible.

### Orden

1. Contexto.
2. Notice.
3. Destino.
4. Campo dependiente del destino.
5. Marca opcional.
6. feedback.

### Destino — selector binario

Reemplazar `select` por:

```text
Destino
[ Grupo existente | Grupo unitario ]
```

### Grupo existente

Cuando está seleccionado:

- mostrar selector de Grupo;
- **solo mostrar grupos compatibles con `target.precio`**;
- no ofrecer como opción seleccionable un grupo que el backend necesariamente rechazará por precio.

Las validaciones backend siguen siendo autoritativas.

### Grupo unitario

Cuando está seleccionado:

- mostrar selector de Categoría.

### Marca

`Marca opcional` se muestra después del campo dependiente del destino.

### Footer

```text
[ Cancelar ] [ Guardar configuración ]
```

Se unifica el CTA; no usar `Preparar producto` / `Preparar reincorporación` como copy visible.

## 7. Configuración pendiente

Se mantiene:

- variante `default`;
- lista, no tabla;
- botón local `Configurar`;
- Footer con `Cerrar`;
- nesting mediante `AdminDialog`.

Cada ítem muestra:

1. Producto.
2. Tipo de operación.
3. C. interno.

El **tipo es información secundaria prioritaria** porque explica por qué el producto requiere configuración.

Etiquetas recomendadas:

- `Nuevo producto`;
- `Reincorporación`.

El precio no se agrega a la lista porque es inmutable y no aporta una decisión adicional en esta superficie.

Ejemplo:

```text
Producto X
Reincorporación · C. interno 12345          [ Configurar ]
```

Mobile conserva apilado vertical.

## 8. Normalización transversal de Fase 5

Se reutilizan:

- `admin-dialog-context`;
- `AdminNotice`;
- Footer autoritativo;
- inputs/selects Admin existentes.

Dentro de estos consumidores se retiran gradualmente composiciones legacy:

- `.notice`;
- `.notice--error`;
- `<p role="alert">` cuando corresponda feedback visual estándar.

Esto no autoriza una limpieza global de dichas clases; el cleanup global continúa reservado para Fase 10.

No se crea una primitive general de formulario en esta fase.

La única primitive compartida candidata es el selector binario, porque aparece de forma explícita y semánticamente consistente en:

1. Quincena de Descargar ajuste.
2. Modo de Valorizado.
3. Destino de Configurar producto.

## 9. Responsive

Los cinco consumidores continúan bajo el contrato `default`:

- Desktop/Tablet: modal centrado, max 560 px;
- Mobile: modal inset;
- Body como región principal de scroll;
- Footer Mobile apilado;
- selector binario conserva las dos opciones visibles sin convertirse en `select`.

## 10. Estado

> **Fase 5 — Formularios y Tareas V1: APROBADA Y CONGELADA PARA IMPLEMENTACIÓN.**
