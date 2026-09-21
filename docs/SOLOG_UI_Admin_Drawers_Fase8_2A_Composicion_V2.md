# SOLOG — UI Admin — Drawers Fase 8.2A — Composición V2

**Proyecto:** SOLOG  
**Estado:** CERRADO / APROBADO  
**Fecha:** 2026-09-21  
**Clasificación:** Nivel B — composición frontend, sin cambios backend

## 1. Autoridad y precedencia

Esta fuente reemplaza, para su alcance, a:

- `SOLOG_UI_Admin_Drawers_Fase8_2A_Composicion_V1.md`.

Precedencia:

1. `SOLOG_UI_Admin_Drawers_Fase8_2A_Composicion_V2.md`
2. `SOLOG_UI_Admin_Dialogs_Fase8_Drawers_V1.md`
3. `SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md`
4. `SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md`

Todo lo no reemplazado explícitamente permanece vigente.

## 2. Alcance

Segunda pasada visual de los Drawers de Fase 8 para cerrar composición antes de Fase 8.2B Backend.

No se modifica Supabase ni contratos RPC.

## 3. Detalle diario

Ancho objetivo: **620 px**.

### 3.1. Navegación y footer

- se mantiene la X del Header;
- se elimina el botón `Cerrar` del Footer;
- el Footer muestra el total de conteos de la vista activa;
- paginación local exclusiva de este Drawer: **25 filas por página**;
- no se modifica `ADMIN_PAGE_SIZE` global.

### 3.2. StateViews

Etiquetas:

- Coincide
- Recontar
- Confirmados
- Inconsistentes

El estado interno backend `Recontar` y `Confirmada` no cambia.

### 3.3. Tablas por estado

- **Coincide:** `Grupo | Stock`
- **Recontar:** `Grupo | Físico | Diferencia`
- **Confirmados:** `Grupo | Diferencia | Valorizado`
- **Inconsistentes:** `Grupo | Teórico | Diferencias`

Para Inconsistentes, la celda `Diferencias` muestra:

`inicial → encontrada`

Ejemplo temporal: `+1 → -1`.

Hasta 8.2B:

- encontrada = `difference`;
- inicial = `-difference`.

Este placeholder no es autoritativo ni debe salir de esta UI.

### 3.4. Color semántico de diferencias

- diferencia negativa / faltante → danger (rojo);
- diferencia positiva / sobrante → info (azul);
- cero → texto secundario.

La utilidad debe ser compartida y no depender del namespace de Control.

### 3.5. admin-auxiliary-table

`admin-auxiliary-table` es la familia de tablas para Dialogs/Modals/Drawers.

Debe compartir con `admin-main-table` la base visual:

- padding;
- tipografía de body;
- tipografía de headers;
- bordes;
- alineación vertical;
- row headers;
- utilidades numéricas.

Se mantienen como diferencias estructurales de `admin-main-table` los comportamientos que no correspondan globalmente a superficies auxiliares, como sticky/hover cuando proceda.

## 4. Cronología

Ancho objetivo: **560 px**.

### 4.1. Header y producto

Header:

- título: `Cronología por producto · {Sede}`;
- descripción: `Horas de Lima`.

Debajo del Header se muestra un bloque compacto con:

- nombre del producto/grupo;
- categoría;
- precio del evento más reciente disponible.

El precio deja de repetirse en cada evento.

### 4.2. Timeline

- una sola línea temporal continua;
- no se separa por contenedores de fecha;
- la fecha aparece como marcador dentro de la misma línea;
- se elimina el título `Quincena actual`;
- al activar quincena anterior, sus eventos amplían la misma línea;
- orden más reciente → más antiguo;
- el evento más reciente usa `primary-soft`;
- el punto de cada evento usa el tono semántico del badge de estado.

Métricas por estado:

- Coincide → Stock;
- Recontar → Físico + Diferencia;
- Confirmado → Diferencia + Valorizado;
- Inconsistente → Teórico + Inicial + Encontrada;
- Recontado → Físico + Diferencia mientras exista como evento del contrato actual.

Inconsistente usa el placeholder temporal definido en 3.3.

### 4.3. Footer

- se elimina `Cerrar`;
- el switch de quincena anterior se mueve al Footer;
- se conserva la carga lazy de la quincena anterior.

## 5. Incidencias — Repeticiones

Ancho objetivo: **520 px**.

### 5.1. Header y producto

Header:

- título: `Repeticiones · {Tipo}`;
- descripción breve o ausente.

Debajo se muestra bloque compacto con:

- producto;
- código interno;
- alcance: todas las sedes.

### 5.2. Sedes

Cada sede usa composición vertical:

- nombre de sede;
- cantidad de repeticiones + estado cuando exista;
- primera → última detección;
- `Sin registros` cuando no hay ocurrencias.

Se evita la redundancia `0 veces + Sin registros`.

### 5.3. Footer de acciones

Se elimina el botón `Cerrar`.

Cuando las acciones estén disponibles, el Footer expone las mismas acciones ya existentes en la tabla:

- Ignorar 30 días;
- Aprobar/Proponer eliminación según el flujo vigente;
- Reactivar incidencia cuando la familia esté suprimida y sea reactivable.

Ignorar y eliminación conservan sus iconos y **abren los mismos modales existentes**; no ejecutan mutaciones directamente.

Reactivar reutiliza la mutación existente de la fila. Tras una reactivación exitosa, el Drawer se cierra para evitar mostrar el estado suprimido ya obsoleto.

Cuando no haya acciones disponibles, el Drawer puede no renderizar Footer.

## 6. AdminDialog

Se admite explícitamente:

- `footer === undefined` → footer por defecto con Cerrar;
- `footer === null` → sin Footer;
- cualquier otro ReactNode → Footer personalizado.

No se crean nuevos variants.

### 6.1. Transición de Drawer

Los Drawers replican el contrato de movimiento ya usado por el Sidebar mobile:

- estado cerrado: Drawer fuera del viewport mediante `translateX(100%)`;
- estado abierto: `translateX(0)`;
- backdrop coordinado de `opacity: 0` a `opacity: 1`;
- `visibility` y `pointer-events` sincronizados con la transición;
- entrada y salida usan `var(--transition-fast)`;
- `prefers-reduced-motion: reduce` desactiva la transición.

`AdminDialog` mantiene un lifecycle local mínimo únicamente para Drawers: solicita el cierre, ejecuta la transición de salida y llama `onClose` al finalizar el `transform`. El stack, scroll lock y restauración de foco se mantienen activos hasta el desmontaje real. Existe un fallback temporal de seguridad para evitar un Drawer bloqueado si el navegador no emite `transitionend`.

## 7. Corrección de gap superior

La regla global obsoleta:

` .admin-v2-card section { margin-top: 1rem; } `

queda eliminada. Las separaciones necesarias deben pertenecer a selectores específicos de cada módulo.

## 8. Fuera de alcance

- backend;
- optimización de egress;
- nuevos campos RPC;
- cambios de motor;
- cambio global del comportamiento fullscreen mobile del Drawer;
- Fase 8.2B;
- Fase 9+;
- Fase 12 global.

## 9. Validación

- tests dirigidos Fase 8;
- tests de normalización de tablas;
- suite completa;
- lint;
- build;
- `git diff --check`;
- smoke humano de los tres Drawers.

La UI aprobada en esta V2 será la base para diseñar el contrato mínimo de Fase 8.2B.


## 10. Estado de implementación

**Fase 8.2A V2 — CERRADA Y APROBADA.**

Implementación frontend V2 aplicada en `admin-work`.

Validaciones completadas:

- `bun test --reporter=dot`;
- `bun lint`;
- `bun run build`;
- validación técnica;
- smoke visual humano;
- responsive;
- transiciones reales de entrada y salida de Drawer;
- `prefers-reduced-motion`;
- preservación de stack, focus y scroll lock durante el lifecycle de cierre.

La composición de esta V2 queda congelada y es la base autoritativa para Fase 8.2B.

La fuente primaria backend de 8.2B es:

`docs/SOLOG_Backend_Admin_Drawers_Fase8_2B_Optimizacion_Egress_V1.md`
