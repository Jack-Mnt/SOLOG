# SOLOG — Implementación Frontend del Motor V3 MVP

**Proyecto:** SOLOG  
**Estado:** Congelado para implementación  
**Ámbito:** Frontend React/TypeScript — Cajero y Administrador  
**Backend:** Motor V3 ya desplegado en Supabase

---

## 1. Objetivo

Adaptar el frontend actual de SOLOG al motor V3 MVP ya implementado en Supabase, eliminando del cliente la lógica y los contratos del motor anterior.

La implementación debe mantener la arquitectura y la identidad visual existentes. El objetivo es **adaptar contratos y comportamiento**, no rediseñar la aplicación ni realizar refactors generales.

El resultado debe permitir operar correctamente:

- conteo quincenal;
- conteo diario por `Cambio_reciente`;
- revisión de diferencias `Recontar`;
- reconteo con snapshot congelado;
- estados `Coincide`, `Recontar`, `Confirmada`, `Inconsistente`;
- historial del cajero;
- Dashboard administrativo V3;
- Control administrativo V3;
- exportación de diferencias confirmadas.

---

## 2. Fuentes de verdad

Ante cualquier contradicción, usar este orden:

1. `Especificaciones_motor_definitivo_MVP.md`
2. `SOLOG_Modelo_Datos_V3_MVP.md`
3. Contrato real de las RPC V3 actualmente desplegadas en Supabase.
4. Este `implementation.md` para el alcance y comportamiento frontend.
5. Código existente del repositorio únicamente como referencia de arquitectura e implementación.

Si Codex detecta que el backend real contradice las dos primeras fuentes, debe detenerse y reportar el bloqueo. No debe reinterpretar ni rediseñar el motor por su cuenta.

---

## 3. Filosofía de implementación

Seguir estrictamente el flujo definido para el proyecto:

```text
ChatGPT define
→ implementation.md congela decisiones
→ Codex analiza el repositorio una vez
→ Codex propone plan por fases
→ implementación fase por fase
→ validación local de cada fase
→ una única revisión global al final
```

Reglas obligatorias:

- No ampliar el alcance.
- No rediseñar el motor.
- No hacer refactors generales.
- No modificar módulos no relacionados salvo dependencia técnica estricta.
- Mantener la arquitectura React + TypeScript existente.
- Mantener rutas y diseño actuales salvo ajustes necesarios para reflejar V3.
- No crear una segunda capa de lógica de negocio en frontend que compita con Supabase.
- Supabase es autoritativo para teórico, diferencia final, elegibilidad y estados.
- Validar cada fase antes de continuar.
- Si existe un bloqueo técnico real, reportar el cambio mínimo requerido antes de implementarlo.

---

# 4. Decisiones V3 que afectan al frontend

## 4.1. Estados de diferencia

Eliminar del dominio frontend:

```text
pendiente
probablemente_explicada
parcialmente_explicada
persistente
confirmada_reconteo
conteos_inconsistentes
```

Los únicos estados válidos del MVP son exactamente:

```text
Coincide
Recontar
Confirmada
Inconsistente
```

Debe respetarse el casing devuelto por Supabase.

---

## 4.2. Diferencia

Mantener:

```text
diferencia = stock_fisico - stock_teorico
```

Sin embargo, tras un reconteo, `conteo_detalle.diferencia` representa el **resultado operativo vigente** y puede dejar de ser igual al primer conteo físico menos el teórico inicial.

El frontend no debe recalcular ni sustituir la diferencia final enviada por Supabase.

Puede calcular una diferencia local únicamente como preview de captura antes de guardar.

---

## 4.3. Snapshot por grupo, no por sesión

Eliminar del frontend la suposición:

```text
una sesión = un snapshot de referencia inmutable
```

El backend congela el snapshot individual de cada grupo cuando se guarda ese conteo.

Consecuencias:

- un snapshot nuevo NO invalida la sesión;
- un snapshot nuevo NO debe bloquear captura;
- un snapshot nuevo NO obliga a reiniciar la sesión;
- un grupo contado más tarde puede usar un teórico más reciente;
- observaciones ya capturadas localmente mantienen su `contado_at` y el backend resuelve qué snapshot correspondía a ese momento.

---

## 4.4. Estado operativo del grupo

El frontend no administra directamente `estado_stock_grupo`.

Debe consumir la cola que el backend expone:

```text
conteo        → grupos pendientes de cobertura quincenal
conteo_diario → grupos con Cambio_reciente ya cubiertos
revisar       → observaciones Recontar elegibles
```

---

## 4.5. Cobertura quincenal

Cobertura y estado operativo son independientes.

Un grupo puede haber cumplido cobertura y luego volver a necesitar conteo diario.

El frontend debe utilizar los valores de cobertura devueltos por Supabase y no reconstruirlos desde historial local.

---

# 5. Contratos Cajero V3 a respetar

## 5.1. `rpc_solog_state('bootstrap')`

La sesión activa ya no contiene snapshot de referencia.

Conceptualmente:

```ts
sesion_activa: null | {
  id: string
  iniciado_at: string
  expira_at: string
  grupos_guardados: number
}
```

No deben existir dependencias frontend de:

```text
sesion_activa.snapshot_referencia_id
sesion_activa.snapshot_referencia_at
sesion_activa.snapshot_confirmado_at
```

El objeto `stock` conserva el snapshot actual de la sede como información operativa, no como referencia congelada de la sesión.

Las vistas inteligentes V3 relevantes son:

```text
conteo_diario
revisar
```

---

## 5.2. `rpc_solog_state('status')`

Respuesta relevante:

```ts
{
  ok: true;
  codigo: "CASHIER_STATUS";
  server_now: string;
  snapshot_actual_id: string | null;
  conteo_id: string | null;
  cobertura_quincenal_completa: boolean;
  conteo_diario_pendientes: number;
  revisar_pendientes: number;
}
```

Eliminar dependencias de:

```text
snapshot_referencia_id
stock_actualizado
```

Un cambio de `snapshot_actual_id` puede invalidar cachés operativas, pero **no bloquea la sesión**.

---

## 5.3. `rpc_solog_state('groups')`

Las únicas vistas backend son:

```text
conteo
conteo_diario
revisar
```

Respuesta base:

```ts
{
  conteo_id: string
  vista: 'conteo' | 'conteo_diario' | 'revisar'
  snapshot_actual_id: string | null
  snapshot_actual_at: string | null
  grupos: CajeroCountGroup[]
  server_now: string
}
```

### `conteo` y `conteo_diario`

Cada grupo puede incluir:

```text
grupo_id
nombre
categoria_id
categoria
categoria_orden
precio
stock_teorico
snapshot_actual_id
cubierto_quincena
estado_stock
stock_cero
stock_negativo
productos
```

Las vistas visuales de categoría, stock cero o stock negativo deben resolverse localmente a partir de `groups(vista='conteo')` cuando corresponda. No deben enviarse como `vista` a la RPC.

### `revisar`

Cada grupo puede incluir además:

```text
detalle_origen_id
estado_diferencia
contado_at_original
ultima_diferencia
stock_posterior
primer_snapshot_posterior_id
snapshot_reconteo_id
```

Todos los elementos de esta vista representan observaciones `Recontar` elegibles.

No existe ya la clasificación frontend `seguimiento` vs `reconteo`.

---

## 5.4. `rpc_solog_count('start')`

Respuesta:

```ts
{
  ok: true;
  codigo: "COUNT_STARTED";
  conteo_id: string;
  snapshot_actual_id: string;
  snapshot_actual_at: string;
  snapshot_confirmado_at: string;
  iniciado_at: string;
  expira_at: string;
  server_now: string;
}
```

El snapshot de esta respuesta es informativo y no debe convertirse en referencia fija de toda la sesión.

---

## 5.5. `rpc_solog_count('save_batch')`

Cada item normal debe contener solamente los datos necesarios para una nueva observación física:

```ts
{
  client_observation_id: string;
  grupo_id: string;
  stock_fisico: number;
  contado_at: string;
}
```

Eliminar de los items:

```text
tipo_observacion
observacion_origen_id
```

El backend determina si el grupo pertenece a cobertura quincenal o conteo diario según su estado actual.

Los resultados guardados ya no deben exigir campos legacy como:

```text
tipo_observacion
diferencia_confirmada
```

El cliente debe aceptar como autoritativos:

```text
detalle_id
snapshot_referencia_id
stock_teorico
stock_fisico
diferencia
estado_diferencia
contado_at
```

---

## 5.6. `rpc_solog_count('recount_start')`

Nueva acción obligatoria para Revisar.

Payload:

```ts
{
  device_token: string;
  conteo_id: string;
  detalle_id: string;
}
```

Respuesta:

```ts
{
  ok: true;
  codigo: "RECOUNT_STARTED";
  conteo_id: string;
  detalle_id: string;
  snapshot_reconteo_id: string;
  stock_teorico_reconteo: number;
  server_now: string;
}
```

Regla UX obligatoria:

> No congelar todos los elementos de Revisar al cargar la página.

`recount_start` debe ejecutarse **individualmente cuando el trabajador realmente comienza el reconteo de ese grupo**, antes de aceptar/confirmar su nuevo conteo.

La entrada debe quedar asociada a `stock_teorico_reconteo` devuelto por el backend.

Si se vuelve a llamar para el mismo detalle ya iniciado, el backend conserva el mismo `snapshot_reconteo_id`; el frontend debe tratarlo como operación reanudable/idempotente.

---

## 5.7. `rpc_solog_count('recount')`

Payload:

```ts
{
  device_token: string;
  conteo_id: string;
  detalle_id: string;
  stock_fisico: number;
  contado_at: string;
}
```

Respuesta relevante:

```ts
{
  ok: true;
  codigo: "RECOUNT_SAVED";
  conteo_id: string;
  detalle_id: string;
  snapshot_reconteo_id: string;
  stock_teorico_reconteo: number;
  stock_reconteo: number;
  diferencia_reconteo: number;
  diferencia: number;
  estado_diferencia: "Coincide" | "Confirmada" | "Inconsistente";
  recontado_at: string;
}
```

El frontend debe usar `estado_diferencia` y `diferencia` de la respuesta como resultado definitivo.

No aplicar la regla de menor diferencia ni la lógica de signos nuevamente en cliente.

---

## 5.8. `rpc_solog_count('history')`

Eliminar `tipo_observacion` del historial.

Los elementos pueden mostrar:

```text
stock_teorico
stock_fisico
diferencia
estado_diferencia
stock_posterior
stock_reconteo
recontado_at
precio
valor_diferencia
```

---

# 6. Cambios — Cajero

## 6.1. `src/features/solog/cajero/cajero.types.ts`

Cambio obligatorio.

### Eliminar

- `CajeroObservationType` como concepto operativo.
- `tipo_observacion` de batch, buffer, history y observation input.
- `observacion_origen_id` de conteos normales.
- snapshot de referencia global en respuestas de sesión/grupos/status.
- `stock_actualizado`.
- `diferencia_confirmada`.
- motivos de seguimiento legacy.

### Añadir/adaptar

- grupos backend únicamente `conteo | conteo_diario | revisar`;
- `estado_stock?: 'Contado' | 'Cambio_reciente'`;
- campos V3 de Revisar;
- tipos de `recount_start`;
- tipos de `recount`;
- `SologDifferenceState` V3 compartido;
- historial V3.

---

## 6.2. `src/features/solog/cajero/cajero.api.ts`

Cambio obligatorio.

Mantener:

```text
getCajeroGroups
getCajeroStatus
startCajeroSession
saveCajeroBatch
finishCajeroSession
getCajeroHistory
```

Añadir funciones explícitas para:

```text
startCajeroRecount → rpc_solog_count('recount_start')
saveCajeroRecount  → rpc_solog_count('recount')
```

No mezclar reconteos dentro de `save_batch`.

---

## 6.3. `src/features/solog/cajero/cajero.session.ts`

Cambio crítico.

### Eliminar el bloqueo por snapshot actualizado

Eliminar la lógica que considera error:

```text
bootstrap.stock.snapshot_id !== session.snapshot_referencia_id
status.snapshot_actual_id !== status.snapshot_referencia_id
status.stock_actualizado
```

Eliminar `stock_updated` como causa de bloqueo de sesión.

### Mantener

- expiración de sesión;
- inactividad local si sigue siendo parte del UX actual;
- stock/snapshot no disponible;
- autorización del dispositivo;
- buffers locales;
- reintentos de envío;
- cachés de vistas.

### Nuevo comportamiento ante snapshot nuevo

```text
snapshot cambia
→ invalidar caché de grupos operativos
→ refrescar status/listas cuando corresponda
→ NO cerrar sesión
→ NO borrar buffer
→ NO bloquear captura
```

Las observaciones ya almacenadas localmente conservan `contado_at`.

### Revisar

El controlador debe ofrecer operaciones para:

- iniciar reconteo individual;
- guardar reconteo;
- actualizar la cola Revisar después del resultado;
- invalidar/refrescar Conteo Diario cuando `Inconsistente` provoque `Cambio_reciente`.

---

## 6.4. `src/features/solog/cajero/cajero.storage.ts`

Cambio obligatorio.

El buffer antiguo es incompatible con V3 y la base operativa fue reiniciada.

### Requisito

Incrementar la versión del esquema local del buffer, por ejemplo:

```text
version 3 → version 4
```

Los buffers legacy deben descartarse de forma segura.

No intentar migrar observaciones antiguas porque contenían:

```text
tipo_observacion
observacion_origen_id
```

y apuntaban a sesiones eliminadas del backend.

El buffer normal V3 debe almacenar:

```text
client_observation_id
grupo_id
stock_fisico
contado_at
display local necesario
```

No almacenar lógica de estado autoritativa.

El reconteo puede tener un estado local separado si la UI necesita persistir una captura iniciada, pero debe usar siempre el `snapshot_reconteo_id`/teórico que Supabase ya congeló.

---

## 6.5. `src/features/solog/cajero/cajero.utils.ts`

Cambio obligatorio.

### Eliminar

- `getObservationTypeLabel`;
- `getFollowupReasonLabel`;
- `getReviewReasonLabel` basado en estados legacy;
- `isCajeroRecountGroup` basado en `conteos_inconsistentes`;
- prioridades derivadas de `persistente`, `movimiento_posterior`, etc.;
- cualquier clasificación `seguimiento/reconteo` antigua.

### Mantener

- calculadora;
- validación de conteos físicos;
- preview de diferencia;
- valorización visual;
- filtros de categoría;
- stock positivo/cero/negativo;
- helpers de formato.

### Revisar

La razón visible puede simplificarse a una única semántica:

```text
Recontar / Verificar diferencia
```

porque todos los elementos de la cola ya son `Recontar`.

---

## 6.6. `src/features/solog/cajero/cajero.table.tsx`

Cambio obligatorio.

Eliminar la rama:

```text
seguimiento vs reconteo
```

### Conteo normal

- capturar físico;
- preview local contra `group.stock_teorico`;
- guardar en buffer normal;
- enviar por `save_batch`.

### Revisar

No tratarlo como batch normal.

Antes de permitir la captura efectiva del reconteo:

```text
recount_start(detalle_origen_id)
→ recibir stock_teorico_reconteo
→ habilitar/continuar captura
→ preview contra stock_teorico_reconteo
→ recount(...)
```

No iniciar reconteos masivamente al renderizar la tabla.

El resultado guardado debe mostrar el estado devuelto por backend.

---

## 6.7. `src/features/solog/cajero/cajero.captura.dialog.tsx`

Cambio probable/obligatorio si es utilizado por Revisar.

Para una captura normal conserva el flujo actual.

Para Revisar:

- ejecutar `recount_start` al comenzar realmente la captura individual;
- usar `stock_teorico_reconteo` como referencia;
- evitar utilizar un `stock_teorico` que pueda actualizarse mientras el trabajador cuenta;
- guardar mediante acción `recount`.

No rediseñar el diálogo salvo lo estrictamente necesario.

---

## 6.8. `src/features/solog/cajero/cajero.conteo.tsx`

Cambio obligatorio de contrato, no de diseño.

Fuente backend:

```text
groups(vista='conteo')
```

Debe continuar permitiendo la organización visual existente por:

- categoría;
- stock positivo;
- stock cero;
- stock negativo;

pero esos son filtros locales.

Un conteo guardado elimina al grupo de la cobertura pendiente mediante el backend.

---

## 6.9. `src/features/solog/cajero/cajero.diario.tsx`

Cambio obligatorio.

Fuente única:

```text
groups(vista='conteo_diario')
```

Cada grupo mostrado representa `Cambio_reciente` aplicable.

Al contar:

- crea nueva observación vía `save_batch`;
- no reutiliza un detalle anterior;
- no utiliza `observacion_origen_id`.

---

## 6.10. `src/features/solog/cajero/cajero.revisar.tsx`

Cambio crítico.

Fuente única:

```text
groups(vista='revisar')
```

Todos los grupos son `Recontar` elegibles.

Eliminar clasificación por:

```text
persistente
parcialmente explicada
conteos inconsistentes
movimiento posterior
```

El flujo por grupo debe ser:

```text
seleccionar/iniciar reconteo
→ recount_start
→ congelar referencia backend
→ contar físicamente
→ recount
→ mostrar resultado
→ retirar/actualizar item de Revisar
```

Si el resultado es `Inconsistente`, el grupo podrá reaparecer posteriormente en Conteo Diario porque el backend lo fuerza a `Cambio_reciente`.

---

## 6.11. `src/features/solog/cajero/cajero.historial.tsx`

Cambio obligatorio.

Mostrar solo estados V3.

Eliminar `tipo_observacion`.

El historial puede diferenciar visualmente:

- conteo inicial: `stock_fisico`;
- último posterior si existe: `stock_posterior`;
- reconteo si existe: `stock_reconteo`;
- diferencia operativa vigente;
- estado final actual de la observación.

No reconstruir estados legacy.

---

## 6.12. `src/features/solog/cajero/cajero.inicio.tsx`

Cambio obligatorio de datos.

Mantener la navegación actual:

- mientras la cobertura quincenal no esté completa, priorizar Conteo;
- después, mostrar Conteo Diario y Revisar;
- Historial se mantiene.

Actualizar contadores desde:

```text
cobertura_quincenal
conteo_diario_pendientes
revisar_pendientes
```

No utilizar KPIs/estados legacy.

---

## 6.13. `src/features/solog/cajero/cajero.operativo.tsx`

Cambio solo si es necesario por propagación de tipos/estado de sesión.

No rediseñar navegación ni shell.

---

# 7. Cambios compartidos

## 7.1. `src/features/solog/types.ts`

Cambio crítico y transversal.

### `SologDifferenceState`

Reemplazar por:

```ts
export type SologDifferenceState =
  | "Coincide"
  | "Recontar"
  | "Confirmada"
  | "Inconsistente";
```

### `SologActiveSession`

Eliminar campos snapshot de sesión.

Conservar:

```text
id
iniciado_at
expira_at
grupos_guardados
```

### `SologOperationalBootstrap`

Adaptar a la respuesta V3 real:

- stock actual de sede;
- cobertura diaria/quincenal;
- conteo principal;
- `vistas_inteligentes.conteo_diario`;
- `vistas_inteligentes.revisar`.

Eliminar campos legacy que el backend ya no devuelve.

### Control

Eliminar del contrato principal frontend:

```text
tipo_observacion
observacion_origen_id
motivo_verificacion
```

No depender de `diferencia_confirmada` como dato de dominio aunque el backend lo conserve temporalmente como alias de compatibilidad.

Añadir/usar:

```text
primer_snapshot_posterior_id
snapshot_posterior_id
stock_posterior
snapshot_reconteo_id
stock_reconteo
recontado_at
```

### Filtros de Control

El frontend debe adoptar grupos V3:

```text
recontar
confirmadas
inconsistentes
coinciden
todos
```

Los aliases legacy aceptados por backend son temporales y no deben seguir utilizándose en el cliente.

### Dashboard

Consumir las claves V3:

```text
recontar
confirmadas
inconsistentes
```

No usar como fuente principal:

```text
persistentes
```

aunque el backend lo devuelva temporalmente como alias.

### Actividad por sede

Adaptar el tipo a la RPC V3 actual.

Eliminar campos antiguos que ya no devuelve:

```text
grupos_registrados_hoy
grupos_registrados
```

Mantener:

```text
sesiones_hoy
observaciones_registradas_hoy
grupos_verificados_distintos_hoy
sesion_activa
ultima_actividad_at
```

y por sesión:

```text
conteo_id
usuario
estado
iniciado_at
finalizado_at
duracion_segundos
observaciones_registradas
grupos_verificados_distintos
```

---

## 7.2. `src/features/solog/labels.ts`

Cambio obligatorio.

Etiquetas exactas:

```text
Coincide       → Coincide
Recontar       → Recontar
Confirmada     → Confirmada
Inconsistente  → Inconsistente
```

Eliminar labels de estados legacy.

No modificar labels de incidencias, catálogo o dispositivos.

---

## 7.3. `src/features/solog/api.ts`

Cambio menor esperado.

La infraestructura `callSologRpc` se mantiene.

Modificar únicamente imports/tipos afectados por los contratos V3.

Las acciones específicas de Cajero `recount_start` y `recount` deben permanecer preferentemente en `cajero.api.ts`, respetando la organización existente.

---

## 7.4. `src/features/solog/errors.ts`

Actualizar únicamente errores relacionados con el motor V3.

Eliminar o dejar sin uso mensajes ligados al bloqueo por stock/snapshot actualizado.

Añadir/verificar mensajes para códigos reales como:

```text
SOLOG_RECOUNT_NOT_ELIGIBLE
SOLOG_RECOUNT_ALREADY_SAVED
SOLOG_INVALID_RECOUNT_PAYLOAD
SOLOG_OPERATIONAL_PERIOD_NOT_STARTED
SOLOG_GROUP_NOT_REQUIRED
SOLOG_COUNT_NOT_ACTIVE
```

Mantener el resto del sistema de normalización existente.

---

## 7.5. `src/styles.css`

Cambios visuales mínimos para estados V3.

Actualizar badges/clases de:

```text
Coincide
Recontar
Confirmada
Inconsistente
```

No utilizar directamente el string con mayúsculas como clase CSS sin normalizar/mapping.

Mantener paleta, layout, tipografía e identidad SOLOG existentes.

---

# 8. Cambios — Administrador

## 8.1. Dashboard

Archivos afectados principales:

```text
src/features/solog/admin/dashboard/admin.dashboard.hook.ts
src/features/solog/admin/dashboard/admin.dashboard.format.ts
src/features/solog/admin/dashboard/admin.dashboard.overview.tsx
```

Probables por propagación del contrato:

```text
admin.dashboard.actividad-sede.hook.ts
admin.dashboard.actividad-sede.drawer.tsx
```

### KPIs V3

La RPC actual expone principalmente:

```text
cobertura_quincenal
contados_hoy
recontar
confirmadas
inconsistentes
```

La UI debe dejar de presentar `Persistentes` como concepto del motor.

Recomendación funcional congelada para MVP:

```text
Cobertura quincenal
Contados hoy
Por recontar
Confirmadas
Inconsistentes
```

Si el layout actual solo admite cuatro KPIs, Codex debe preservar el layout y proponer el ajuste mínimo durante el análisis, sin inventar otra métrica.

### Tabla por sede

Usar:

```text
cobertura_quincenal
cobertura_hoy
recontar / diferencias_pendientes
confirmadas
inconsistentes
actividad
```

No usar `persistentes` como métrica independiente.

### Actividad por sede

Actualizar tipos y render al contrato V3 real, sin campos `grupos_registrados*`.

---

## 8.2. Control

Archivos afectados:

```text
src/features/solog/admin/control/admin.control.hook.ts
src/features/solog/admin/control/admin.control.detalle.hook.ts
src/features/solog/admin/control/admin.control.panel.tsx
src/features/solog/admin/control/admin.control.drawer.tsx
src/features/solog/admin/control/admin.control.format.ts
src/features/solog/admin/control/admin.control.export.hook.ts
src/features/solog/admin/control/admin.control.export.ts
```

### Estados/filtros

La UI debe utilizar:

```text
Recontar
Confirmada
Inconsistente
Coincide
Todos
```

Eliminar agrupaciones conceptuales legacy:

```text
Problemáticos
Explicados
Persistentes
```

si solo representan aliases del motor anterior.

### Tabla principal

Mantener diseño compacto y navegación actual.

Eliminar la separación conceptual:

```text
Diferencia observada
Saldo confirmado
```

porque V3 tiene una sola:

```text
diferencia = resultado operativo vigente
```

Columnas recomendadas sin rediseñar la tabla:

```text
Fecha y hora
Grupo
Categoría
Teórico
Físico
Reconteo
Diferencia
Estado
```

`Reconteo` puede mostrar `—` cuando no exista.

La valorización puede permanecer en drawer/export si la tabla actual necesita conservar densidad.

### Drawer

Usar los campos V3:

```text
stock_teorico
stock_fisico
stock_posterior
stock_reconteo
diferencia
estado_diferencia
contado_at
recontado_at
snapshot_referencia_id
primer_snapshot_posterior_id
snapshot_posterior_id
snapshot_reconteo_id
```

Eliminar explicaciones basadas en `motivo_verificacion` legacy.

La cronología debe representar observaciones reales, no estados eliminados.

### Historial del grupo

`rpc_solog_control_detalle` ya devuelve todas las observaciones del grupo en orden reciente.

No existe árbol `observacion_origen_id`.

Cada fila del historial es una observación física independiente; el reconteo está contenido en esa misma fila.

---

## 8.3. Exportación de Control

El backend V3 exporta únicamente observaciones elegibles:

```text
estado_diferencia = Confirmada
diferencia != 0
```

El frontend no debe intentar volver a decidir elegibilidad.

Adaptar tipos a campos V3, incluyendo:

```text
teorico
fisico
reconteo
ajuste
valor_economico
estado = Confirmada
detalle_id
```

Mantener el generador Excel y el formato funcional ya aprobado salvo cambios estrictamente necesarios por el contrato.

No incluir `Inconsistente` automáticamente en ajustes POS.

---

# 9. Archivos que NO deben modificarse funcionalmente

Salvo error de compilación o dependencia técnica directa, quedan fuera de alcance:

```text
src/features/solog/admin/catalogo/**
src/features/solog/admin/grupos/**
src/features/solog/admin/incidencias/**
src/features/solog/admin/dispositivos/**
src/features/solog/admin/admin.layout.tsx
src/features/solog/admin/admin.layout.context.ts
src/features/solog/device.ts
```

También quedan fuera de alcance:

- rediseño del login;
- branding;
- navegación general Admin;
- autorización de dispositivos;
- publicación/versionado de catálogo;
- lógica ConeXion;
- cambios adicionales en Supabase;
- nuevos módulos.

---

# 10. Casos límite obligatorios

## 10.1. Snapshot cambia durante sesión normal

Esperado:

```text
sesión sigue activa
buffer no se borra
captura no se bloquea
caché de grupos se invalida
nuevos grupos cargados usan teórico actual
```

---

## 10.2. Snapshot cambia después de capturar localmente pero antes de enviar

El frontend conserva:

```text
stock_fisico
contado_at
client_observation_id
```

El backend determina el snapshot válido para ese `contado_at`.

No reescribir automáticamente `contado_at` al momento de enviar.

---

## 10.3. Reconteo comienza y luego llega un snapshot

Una vez ejecutado `recount_start`:

```text
snapshot_reconteo_id queda congelado
stock_teorico_reconteo no debe cambiar en la UI
```

El usuario completa el reconteo contra esa referencia.

---

## 10.4. Recarga de página durante un reconteo iniciado

Al reanudar el mismo detalle, volver a solicitar/invocar `recount_start` es válido.

El backend debe devolver la referencia ya congelada.

El frontend no debe generar otra referencia local.

---

## 10.5. Resultado `Inconsistente`

Después del reconteo:

```text
fila actual termina Inconsistente
```

La UI de Revisar debe retirar/refrescar el caso.

El grupo puede reaparecer en Conteo Diario porque backend lo convierte a `Cambio_reciente`.

No crear un tercer conteo dentro de la misma fila.

---

## 10.6. Resultado `Confirmada`

Mostrar la `diferencia` final entregada por backend.

No recalcularla con `stock_fisico - stock_teorico` porque podría corresponder al menor valor absoluto entre conteo y reconteo.

---

## 10.7. Primer snapshot posterior resuelve automáticamente

Si el backend devuelve luego el detalle como `Coincide`, debe desaparecer de Revisar sin intervención manual.

No reconstruir esta lógica en frontend.

---

## 10.8. Buffers legacy existentes

Deben descartarse por versión.

No intentar enviarlos al backend V3.

---

# 11. Criterios de aceptación — Cajero

La adaptación de Cajero está terminada cuando:

1. Se puede iniciar una sesión sin snapshot de referencia global.
2. Un snapshot nuevo no bloquea ni finaliza una sesión activa.
3. Conteo quincenal obtiene trabajo desde `vista='conteo'`.
4. Filtros visuales de categoría/stock funcionan localmente.
5. Conteo Diario obtiene solo `vista='conteo_diario'`.
6. `save_batch` no envía `tipo_observacion` ni `observacion_origen_id`.
7. Cada item guardado usa los datos V3 devueltos por backend.
8. Revisar obtiene solo `vista='revisar'`.
9. Cada reconteo ejecuta `recount_start` antes de `recount`.
10. La referencia de reconteo no cambia si llega un snapshot nuevo.
11. `Coincide`, `Confirmada` e `Inconsistente` se muestran correctamente.
12. `Inconsistente` puede provocar que el grupo reaparezca en Conteo Diario después de refrescar.
13. Historial ya no usa tipos de observación legacy.
14. Buffers antiguos no se reutilizan.
15. TypeScript no contiene estados legacy dentro del dominio operativo Cajero.

---

# 12. Criterios de aceptación — Administrador

La adaptación de Administrador está terminada cuando:

1. Dashboard deja de presentar `Persistentes` como estado real del motor.
2. Dashboard consume `recontar`, `confirmadas`, `inconsistentes`.
3. La tabla por sede refleja los KPIs V3.
4. Actividad por sede compila y renderiza con el contrato V3 real.
5. Control utiliza `Coincide / Recontar / Confirmada / Inconsistente`.
6. Filtros Control ya no envían aliases legacy.
7. La tabla no depende de `diferencia_confirmada` como segundo saldo.
8. Drawer muestra primer conteo, posterior y reconteo con campos V3.
9. Historial Control no depende de `tipo_observacion` ni `observacion_origen_id`.
10. Exportación consume directamente las filas `Confirmada` que entrega Supabase.
11. `Inconsistente` no se exporta como ajuste POS.
12. Catálogo, grupos, incidencias y dispositivos continúan funcionando sin cambios funcionales.

---

# 13. Validaciones requeridas durante implementación

En cada fase Codex debe ejecutar únicamente las verificaciones relacionadas con esa fase.

Como mínimo al finalizar todo el trabajo:

```text
TypeScript type check
build de producción
lint si el repositorio lo tiene configurado
pruebas existentes relacionadas
```

Además deben validarse manualmente o con tests específicos:

```text
sesión + snapshot nuevo
conteo quincenal
conteo diario
Revisar → recount_start → recount
Coincide
Confirmada
Inconsistente
historial
Dashboard
Control
Export Excel
```

No realizar una revisión global completa entre cada fase; hacerla una única vez al finalizar todas.

---

# 14. Orden lógico de dependencias

Este no sustituye el plan que Codex debe proponer después de analizar el repositorio, pero fija las dependencias técnicas:

```text
1. Tipos/contratos compartidos V3
        ↓
2. API + sesión/buffer Cajero
        ↓
3. Conteo / Diario / Revisar / Historial Cajero
        ↓
4. Dashboard Administrador
        ↓
5. Control + Drawer + Export Administrador
        ↓
6. Limpieza de referencias legacy + validación global
```

Codex puede agrupar estas unidades en menos fases si siguen siendo validables de forma independiente.

---

# 15. Instrucción inicial para Codex

Codex debe comenzar únicamente con análisis.

Usar:

> Lee `implementation.md` como fuente de verdad de esta adaptación frontend V3. También revisa `Especificaciones_motor_definitivo_MVP.md` y `SOLOG_Modelo_Datos_V3_MVP.md` si están disponibles en el repositorio o en el contexto de trabajo.
>
> Analiza el repositorio únicamente para identificar compatibilidad, archivos afectados, dependencias y riesgos reales.
>
> No implementes todavía.
>
> No rediseñes el motor ni amplíes el alcance.
>
> Propón un plan de implementación por fases. Para cada fase indica objetivo, archivos, dependencias, validaciones y criterio de finalización.
>
> Si el contrato actual del backend difiere de esta especificación, reporta el conflicto antes de proponer una reinterpretación.

---

# 16. Estado congelado

Con este documento queda congelado para la adaptación frontend del MVP:

- eliminación de estados legacy;
- eliminación del snapshot global de sesión;
- sesiones que sobreviven a nuevos snapshots;
- captura normal por `save_batch` simplificado;
- `recount_start` por grupo al iniciar realmente el reconteo;
- `recount` separado del batch normal;
- buffer local V4 incompatible con observaciones antiguas;
- Conteo Quincenal desde `vista='conteo'`;
- Conteo Diario desde `vista='conteo_diario'`;
- Revisar exclusivamente desde `vista='revisar'`;
- Dashboard V3;
- Control V3;
- exportación solo de diferencias confirmadas elegibles por backend;
- preservación del diseño, rutas y arquitectura existentes;
- exclusión de refactors y módulos no relacionados.
