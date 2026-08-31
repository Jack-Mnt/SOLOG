# SOLOG — Plan de implementación frontend del Motor V3 MVP

Plan aprobado de cuatro fases. El backend V3 está desplegado y listo para la adaptación frontend. Este documento conserva el análisis y el plan aprobados e incorpora únicamente las decisiones posteriores que resolvieron los tres bloqueos técnicos.

La creación de este documento no inicia ni autoriza por sí misma la implementación de la Fase 1. Cada fase requiere indicación expresa y validación antes de continuar.

## 1. Objetivo

Adaptar el frontend React/TypeScript de SOLOG al Motor V3 MVP, eliminando las dependencias operativas del motor anterior y preservando arquitectura, organización de archivos, rutas e identidad visual, salvo los ajustes establecidos por la especificación funcional.

El resultado comprende Conteo Quincenal, Conteo Diario, Revisar con reconteo individual, Historial, Dashboard, Control, Drawer y Export Excel. Supabase es autoritativo para teórico, cobertura, elegibilidad, estados y diferencia final. El frontend no implementará una segunda versión del motor.

Se mantiene el flujo aprobado:

```text
Especificación congelada
→ análisis único aprobado
→ plan por fases aprobado
→ implementación fase por fase
→ validación de cada fase
→ una única revisión global final
```

No se harán refactors generales, mejoras oportunistas, nuevos módulos ni cambios funcionales fuera del alcance. No se necesitan nuevas librerías para la adaptación identificada.

## 2. Fuentes de verdad

1. Especificación funcional congelada: `docs/Implementación_Frontend_Motor_MVP.md`.
2. Aclaración definitiva del responsable del proyecto sobre los tres puntos backend resueltos, registrada en la sección 5 de este documento.
3. Este plan: `docs/Plan_Implementacion_Frontend_Motor_V3_MVP.md`, que organiza la ejecución sin sustituir las decisiones funcionales.

La especificación funcional tiene prioridad sobre el plan si existe una contradicción. Se respeta también la jerarquía de fuentes establecida dentro de la propia especificación y el contrato real de las RPC V3; no se inventarán respuestas ni reglas para compensar incompatibilidades.

`Especificaciones_motor_definitivo_MVP.md` y `SOLOG_Modelo_Datos_V3_MVP.md`, mencionados por la especificación, no estaban disponibles en el repositorio durante el análisis aprobado. No se reconstruyeron sus decisiones. Su ausencia no se registra como bloqueo pendiente de este plan.

La resolución de los tres bloqueos se incorpora conforme a la confirmación del responsable del proyecto. No se presenta como una nueva auditoría backend ejecutada al redactar este documento. No se reabrirán esos puntos salvo una contradicción nueva y concreta demostrada por el código actual.

## 3. Alcance

### 3.1. Compartidos

- Adoptar exactamente `Coincide`, `Recontar`, `Confirmada`, `Inconsistente`, respetando el casing de Supabase.
- Actualizar contratos de sesión, bootstrap, cobertura, Dashboard, actividad, Control, detalle y exportación junto con sus consumidores.
- Actualizar etiquetas y errores del motor, incluido `SOLOG_EXPIRED_SESSION_SUPERSEDED`.
- Normalizar o mapear los estados a clases CSS sin modificar paleta, tipografía ni layout general.
- Mantener la infraestructura RPC existente; aplicar únicamente propagación estricta de tipos en consumidores compartidos.

### 3.2. Cajero

- Sesión sin snapshot global de referencia; un snapshot nuevo no cierra, reinicia ni bloquea la sesión.
- Conteo Quincenal desde `groups(vista='conteo')`, con filtros locales por categoría y stock positivo/cero/negativo.
- Conteo Diario desde `groups(vista='conteo_diario')`, creando observaciones normales independientes.
- Revisar exclusivamente desde `groups(vista='revisar')`, con `recount_start` individual antes de capturar y `recount` separado del batch normal.
- Buffer V4 incompatible con versiones antiguas, manteniendo aislamiento por usuario, sede, dispositivo y conteo.
- Recuperación de pendientes V4 expirados conforme a la sección 5.2, sin reasignación ni alteración de identidad o timestamp.
- Cachés coherentes, reanudación de reconteos, resultados backend e Historial V3.
- Preservar calculadora, filtros visuales, navegación y shell existentes.

### 3.3. Administrador

- Dashboard con Cobertura quincenal, Contados hoy, Por recontar, Confirmadas e Inconsistentes.
- Tabla por sede y actividad con los campos V3 reales.
- Control con filtros V3 y una sola diferencia operativa, sin segundo saldo conceptual.
- Drawer con observaciones independientes, posterior y reconteo contenidos en cada observación.
- Excel basado exclusivamente en las filas elegibles entregadas por Supabase, sin recalcular elegibilidad, ajuste ni valorización.

### 3.4. Pruebas

- Adaptar fixtures y expectativas legacy de los ocho archivos de pruebas de Cajero.
- Conservar pruebas válidas de calculadora, aislamiento, rutas y contratos de módulos excluidos.
- Añadir pruebas específicas de comportamiento para reconteos, cachés, Dashboard, Control, Drawer y exportación.
- Validar únicamente el flujo modificado en cada fase; ejecutar una sola revisión global al terminar las cuatro fases.

## 4. Archivos afectados

Las rutas de esta sección son relativas a la raíz del repositorio. La clasificación conserva la del análisis aprobado: **obligatorio**, **probable por propagación**, **no modificar inicialmente** y **fuera de alcance**. Una clasificación probable no autoriza cambios si el archivo ya funciona con el contrato actualizado.

### 4.1. Compartidos

| Archivo | Clasificación | Motivo |
| --- | --- | --- |
| `src/features/solog/types.ts` | Obligatorio | Estados V3, sesión sin snapshot, bootstrap, cobertura y contratos administrativos. Actualizar cada contrato con sus consumidores. |
| `src/features/solog/labels.ts` | Obligatorio | Cuatro etiquetas exactas V3 y correspondencia de presentación; preservar etiquetas de otros dominios. |
| `src/features/solog/errors.ts` | Obligatorio | Códigos/mensajes V3, recuperación de expirados y retirada de dependencias del bloqueo por snapshot. |
| `src/styles.css` | Obligatorio, localizado | Badges V3 y retirada de estilos específicos legacy al desaparecer sus consumidores, sin rediseño. |
| `src/features/solog/api.ts` | Probable por propagación | Los wrappers sirven; ajustar solo tipos necesarios y mantener `callSologRpc`. |
| `src/features/solog/context.tsx` | Probable por propagación | Tipado fiel del bootstrap por rol; reutilizar `refresh` y sincronización horaria. |
| `src/app.tsx` | Probable por propagación estricta | Solo discriminación de variantes del bootstrap si el tipado lo exige. |
| `src/lib/router.ts` | Probable por propagación estricta | Solo tipos del bootstrap; preservar rutas, redirecciones y reglas de navegación. |
| `src/pages/dispositivo-pendiente.tsx` | Probable por propagación estricta | Solo tipos del bootstrap; no cambiar autorización ni presentación. |

### 4.2. Cajero

Todos los archivos de la siguiente tabla están en `src/features/solog/cajero/`.

| Archivo | Clasificación | Motivo |
| --- | --- | --- |
| `cajero.types.ts` | Obligatorio | Separar vistas RPC de filtros visuales; eliminar contratos legacy; tipos de reconteo y buffer V4. |
| `cajero.api.ts` | Obligatorio | Añadir `startCajeroRecount` y `saveCajeroRecount`; adaptar contratos existentes. |
| `cajero.session.ts` | Obligatorio, crítico | Sesión sin bloqueo/reinicio por snapshot; coordinar cachés, resultados, contadores, reconteos y envíos de expirados. |
| `cajero.storage.ts` | Obligatorio | Buffer normal V4, descarte acotado de versiones incompatibles y separación de captura de reconteos. |
| `cajero.utils.ts` | Obligatorio | Retirar clasificación legacy y dependencia de `pendiente_quincena`; preservar calculadora, formatos y filtros visuales. |
| `cajero.table.tsx` | Obligatorio | Eliminar la vía alternativa que guarda reconteos en el batch normal. |
| `cajero.captura.dialog.tsx` | Obligatorio | Revisar utiliza este diálogo; esperar referencia congelada y guardar mediante `recount`. |
| `cajero.conteo.tsx` | Obligatorio | Consumir cola pendiente V3 y refrescar ante cambios operativos, conservando filtros locales. |
| `cajero.diario.tsx` | Obligatorio | Conteos normales por `save_batch` y reaparición de grupos que el backend vuelve a entregar. |
| `cajero.revisar.tsx` | Obligatorio, crítico | Reconteo individual, reanudación, resultado backend y actualización de cola. |
| `cajero.historial.tsx` | Obligatorio | Eliminar tipo de observación; mostrar estado, posterior, reconteo y diferencia vigente. |
| `cajero.inicio.tsx` | Obligatorio | Contadores/cobertura V3 y textos sin restricciones de stock inexistentes. |
| `cajero.tsx` | Obligatorio | Eliminar `BLOCK_MESSAGES.stock_updated` y adaptar mensajes de expiración al contrato de recuperación. |
| `cajero.operativo.tsx` | Obligatorio por propagación | Conectar tabla con operaciones separadas; preservar barra de envío y componentes visuales. |
| `cajero.calculadora.tsx` | No modificar inicialmente | La calculadora actual es reutilizable; no cambiar sus reglas aritméticas. |
| `cajero.header.tsx` | No modificar inicialmente | Navegación, branding y cabecera actuales son reutilizables. |

`CajeroOperationalView` no tenía consumidores en las pantallas durante el análisis, pero sigue conectado a la tabla y forma parte de la compilación. No se eliminará como limpieza oportunista.

### 4.3. Administrador

Todos los archivos de la siguiente tabla están bajo `src/features/solog/admin/`.

| Archivo | Clasificación | Motivo |
| --- | --- | --- |
| `dashboard/admin.dashboard.overview.tsx` | Obligatorio | Cinco KPIs, cobertura diaria y columnas por sede con campos V3. |
| `dashboard/admin.dashboard.hook.ts` | Probable por propagación | Ya consume el wrapper sin transformar métricas; conservar si no exige cambios. |
| `dashboard/admin.dashboard.format.ts` | No modificar inicialmente | Fecha, duración y estados de sesión siguen siendo válidos. |
| `dashboard/admin.dashboard.actividad-sede.hook.ts` | Probable por propagación | Ajustes solo si lo exige el contrato de actividad. |
| `dashboard/admin.dashboard.actividad-sede.drawer.tsx` | Probable por propagación | Ya renderiza observaciones y grupos distintos; los campos `grupos_registrados*` sobrantes estaban en los tipos. |
| `control/admin.control.hook.ts` | Obligatorio | Filtros, valor inicial y reinicio sin aliases legacy; confiar en `total` backend corregido. |
| `control/admin.control.panel.tsx` | Obligatorio | Estados/KPIs V3, reconteo y una sola diferencia operativa. |
| `control/admin.control.detalle.hook.ts` | Obligatorio | Adaptar historial completo: la RPC de detalle no aplica la paginación solicitada actualmente. |
| `control/admin.control.drawer.tsx` | Obligatorio | Cronología por observación, snapshots, reconteo y retirada de relaciones legacy. |
| `control/admin.control.format.ts` | Obligatorio | Retirar etiquetas de tipos/motivos antiguos; conservar formatos numéricos y temporales. |
| `control/admin.control.export.ts` | Obligatorio | Validador y Excel compatibles con `Confirmada`, `reconteo` y `detalle_id`. |
| `control/admin.control.export.hook.ts` | Probable por propagación | La coordinación sirve; verificar contrato, errores y respuesta vacía. |
| `admin.layout.tsx` | Probable por propagación estricta; fuera de alcance funcional | Solo tipos del bootstrap si es indispensable; no modificar shell. |
| `admin.layout.context.ts` | Probable por propagación estricta; fuera de alcance funcional | Solo tipos del bootstrap si es indispensable. |
| `control/admin.control.period.ts` | No modificar inicialmente | Conservar períodos y dependencia de infraestructura administrativa común. |
| `admin.operational.context.ts`, `admin.operational.header.tsx`, `admin.operational.provider.tsx` | No modificar inicialmente | Preservar el contexto de sede/período. |

### 4.4. Pruebas afectadas

| Archivo | Clasificación | Adaptación prevista |
| --- | --- | --- |
| `tests/cajero-phase2.test.ts` | Obligatorio | Sesión, snapshots, bootstrap y recuperación de pendientes expirados. |
| `tests/cajero-phase3.test.ts` | Obligatorio | Captura normal simplificada. |
| `tests/cajero-phase4.test.ts` | Obligatorio | Sustituir lotes mixtos y clasificación legacy por reconteo V3. |
| `tests/cajero-v3.test.ts` | Obligatorio | Buffer V4, payload, parciales y duplicados. |
| `tests/cajero-v3-1.test.ts` | Obligatorio | Cachés, cobertura y contratos de grupos. |
| `tests/cajero-integration-phase3.test.ts` | Obligatorio | Cola quincenal y captura compartida. |
| `tests/cajero-calculator-phase1.test.ts` | Obligatorio | Fixtures de almacenamiento/respuestas; conservar pruebas aritméticas. |
| `tests/cajero-capture-modal-phase2.test.ts` | Obligatorio | Distinguir captura normal local de reconteo remoto. |
| `tests/admin-groups-contract.test.ts` | No modificar inicialmente | Protección de alcance al tocar compartidos. |

Se añadirán pruebas específicas de comportamiento de reconteos/cachés y pruebas de Dashboard y Control/Drawer/Export dentro de `tests/`, durante sus fases correspondientes. El nombre “V3” de un test existente no demuestra compatibilidad con el contrato congelado actual.

### 4.5. Fuera de alcance

- Cambios funcionales en `src/features/solog/admin/catalogo/**`, `grupos/**`, `incidencias/**` y `dispositivos/**`.
- Autenticación y login, `src/features/solog/device.ts`, cliente Supabase, autorización de dispositivos, branding y navegación general.
- Publicación/versionado de catálogo, ConeXion, backend Supabase, migraciones y nuevos módulos.
- Reorganización de carpetas, refactors generales, cambios de dependencias y modificaciones de documentación histórica o de la especificación funcional.

Solo se admite propagación técnica indispensable para compilar o consumir el contrato nuevo, sin alterar la función de los módulos excluidos. Se preservan las dependencias cruzadas existentes, incluidas incidencias hacia dominio de catálogo e infraestructura administrativa hacia período de Control.

## 5. Decisiones/backend ya resueltos

Los siguientes puntos están cerrados y no son interrogantes ni riesgos pendientes del plan.

### 5.1. Bootstrap de Cajero — resuelto

Se corrigió `rpc_solog_state('bootstrap')`: primero se calculan los totales por categoría y después se agrega el JSON. Se eliminó el error `42803: aggregate function calls cannot be nested`, causado por `count(...)` dentro de `jsonb_agg(...)`.

Validación comunicada por el responsable del proyecto sobre Huaca:

```text
24 categorías
482 grupos
482 pendientes
JSON generado correctamente
```

Estos valores son evidencia de esa validación, no constantes que deban codificarse en el frontend. No se requiere ninguna compensación frontend para construir categorías ausentes por aquel error.

### 5.2. Pendientes V4 de sesión expirada — regla definitiva implementada

Una sesión expirada puede terminar de enviar las observaciones capturadas dentro de su ventana original, siempre que no haya comenzado posteriormente otra sesión en esa sede.

```text
Sesión activa
→ captura observaciones
→ sesión expira
→ quedan observaciones V4 locales
→ save_batch puede enviarlas si no comenzó otra sesión posterior en la sede
```

El backend valida:

```text
iniciado_at <= contado_at <= expira_at
```

Si `save_batch` encuentra una sesión todavía marcada `activo` cuya hora ya expiró, el backend la marca `expirado` y aplica la misma recuperación.

Si comenzó otra sesión posterior en la misma sede, responde:

```text
SOLOG_EXPIRED_SESSION_SUPERSEDED
```

Obligaciones frontend:

- Conservar el buffer V4 pendiente al expirar y permitir intentar su envío.
- Preservar exactamente `conteo_id`, `client_observation_id`, `contado_at` y `stock_fisico` durante la recuperación.
- No borrar automáticamente pendientes por expiración, moverlos a otra sesión, cambiar sus identificadores ni actualizar su timestamp al reintentar.
- No confundir el bloqueo de nuevas capturas por expiración con la posibilidad de enviar observaciones legítimas anteriores.
- Ante `SOLOG_EXPIRED_SESSION_SUPERSEDED`, presentar el error y tratar ese buffer como no recuperable mediante envío normal; no reasignarlo ni introducir una recuperación alternativa.
- No aplicar el descarte de buffers legacy a buffers V4 por el hecho de estar expirados o haber sido rechazados.

La elegibilidad de recuperación pertenece al backend. Esta regla se refiere a observaciones normales enviadas por `save_batch`; no extiende por inferencia el contrato de `recount`.

### 5.3. Total de Control — resuelto

`rpc_solog_control.total` aplica ahora los mismos filtros que `rows`: sede, período, scope, estado, grupo de estado, categoría y búsqueda.

La paginación de Control confiará en el total entregado por Supabase. No se calculará otro total a partir de una página parcial.

Esta corrección es independiente del historial completo de `rpc_solog_control_detalle`: el Drawer seguirá adaptándose a ese contrato mediante paginación visual local, como ya estaba aprobado.

## 6. Riesgos todavía vigentes y criterios operativos

### 6.1. Contratos TypeScript transversales

Eliminar campos o helpers sin adaptar consumidores rompe la compilación. Los contratos deben actualizarse junto con sus consumidores, sin introducir una capa de compatibilidad legacy para mantener artificialmente fases separadas.

Diferencias de contrato identificadas en el análisis que siguen requiriendo adaptación frontend:

- `stock` ya no entrega `expira_at` ni `version_catalogo`.
- Cobertura quincenal entrega `inaugurada`, pero no el campo obligatorio anterior `quincena`.
- `save_batch` no entrega los flags antiguos de sesión ni precio/valorización por item.
- El resultado `guardado` incluye `snapshot_referencia_id`; la variante `ya_guardado` identificada no lo incluye. Tipar las variantes sin fabricar referencias.
- `finish` no devuelve el `estado` exigido por el tipo anterior.
- El detalle de Control no entrega `categoria_id`; sus filas históricas tampoco entregan usuario.
- Exportación entrega `detalle_id`, no el texto antiguo `detalle`.
- El bootstrap de Administración tiene campos operativos nulos que deben distinguirse de los de Cajero cuando el tipado lo requiera.

No declarar obligatorios campos ausentes ni rellenarlos con información inventada. Mantener la infraestructura RPC y los contratos ajenos al motor.

### 6.2. Colas y filtros visuales

`categoria`, `stock_cero` y `stock_negativo` pueden permanecer como filtros locales, nunca como vistas enviadas a `groups`. Las únicas vistas backend son `conteo`, `conteo_diario` y `revisar`.

Las comprobaciones actuales `pendiente_quincena === true` descartarían los grupos V3 porque ese campo no se entrega. Consumir la cola backend y sus datos de cobertura; no reconstruir cobertura desde historial o capturas locales.

### 6.3. Buffer V4 y borradores

El buffer actual utiliza `sessionStorage`, no `localStorage`. Mantener el mecanismo y el aislamiento por usuario, sede, dispositivo y conteo.

El descarte por versión se limita a claves incompatibles de Cajero. No vaciar el almacenamiento general ni migrar observaciones legacy. Los pendientes V4 expirados siguen la regla cerrada de la sección 5.2.

Los borradores de calculadora tienen un esquema separado por grupo y sesión. Si se persiste captura de reconteo, debe asociarse al detalle correcto y a la referencia backend congelada para no reutilizarla sobre otra observación. No guardar estados de negocio autoritativos locales.

### 6.4. Cachés, respuestas tardías y confirmedGroupIds

- Conteo mantiene su propio dataset; Diario/Revisar mantienen cachés en referencias; Historial tiene otra caché independiente.
- Vaciar una referencia no refresca automáticamente una pantalla montada. Invalidar y recargar los consumidores correspondientes.
- Un snapshot nuevo no debe borrar buffer, cerrar sesión ni bloquear captura.
- Una respuesta anterior no debe repoblar una caché invalidada ni mezclarse con otra sesión/identidad.
- No etiquetar ciegamente una respuesta de grupos con el snapshot leído antes por `status`: puede cambiar entre ambas peticiones.
- Invalidar Historial después de guardados y cambios relevantes de estado, además de las colas operativas.
- `confirmedGroupIds` no puede vetar durante toda la sesión un grupo que el backend vuelve a entregar como `Cambio_reciente`. Reconciliar las exclusiones locales con las colas actuales.

### 6.5. Reconteos por detalle, reanudación y reintentos

La unidad del reconteo es `detalle_id`, obtenido de `detalle_origen_id` en Revisar, no simplemente el grupo. Mantener la referencia `snapshot_reconteo_id` y `stock_teorico_reconteo` devuelta por Supabase.

Ejecutar `recount_start` solo cuando comienza realmente la captura individual y antes de habilitarla. Nunca congelar toda la cola al renderizarla. Al recargar, reanudar el mismo detalle invocando `recount_start` y recuperar su referencia ya congelada.

`recount_start` es reanudable/idempotente; no asumir esa misma garantía para `recount`. Ante una respuesta perdida, reconciliar con backend sin duplicar observaciones ni simular éxito. Los reconteos nunca forman parte del batch normal.

Después de `Inconsistente`, refrescar Revisar y Diario: el backend puede devolver el grupo en Diario, donde se crea una observación independiente, no un tercer conteo dentro del mismo detalle.

### 6.6. Timestamps, diferencia y estados

Preservar UUID y `contado_at` al reenviar, incluida la recuperación de expirados. Considerar el desfase horario existente al capturar, nunca reescribir el timestamp al enviar para hacerlo elegible.

La diferencia local es únicamente preview. Tras guardar, utilizar `diferencia` y `estado_diferencia` backend incluso si la diferencia no coincide con físico inicial menos teórico inicial. No repetir reglas de signos, menor valor absoluto o elegibilidad en cliente.

Propagar los cuatro estados V3 a etiquetas, filtros y badges mediante normalización/mapping CSS. No eliminar indiscriminadamente `pendiente` de dispositivos, catálogo o incidencias.

### 6.7. Ajustes mínimos de presentación ya identificados

- Dashboard ya tiene cinco tarjetas y cuadrícula de cinco columnas: caben los cinco KPIs sin ampliar su estructura.
- Cobertura diaria representa `grupos_verificados / grupos_requeridos`, no la forma de cobertura quincenal.
- Retirar dependencias de `sedes_con_actividad` y `sesion_iniciada_at` donde la RPC no los entrega; no inventar métricas sustitutivas.
- Mantener los controles de paginación del Drawer mediante cortes locales del historial completo recibido.
- Excel incorpora Reconteo y usa `detalle_id` como identificación del detalle, manteniendo hojas, generador y formatos monetarios. No fabricar una descripción de negocio para sustituir el antiguo texto `detalle`.

### 6.8. Calidad de validación

Varias pruebas existentes inspeccionan strings del código y no garantizan secuencia RPC, invalidación o reanudación. Añadir pruebas de comportamiento de esos puntos y actualizar expectativas legacy en su fase, sin eliminar protección válida de calculadora, rutas o aislamiento.

El `tsconfig` de aplicación incluye `src`, no los tests. No confundir ejecución de pruebas con comprobación de tipos de sus fixtures. No usar una compilación satisfactoria como prueba de compatibilidad real de respuestas RPC.

## 7. Las cuatro fases aprobadas

Se mantiene exactamente la agrupación aprobada. La Fase 1 reúne contratos y Cajero para no dejar consumidores rotos ni añadir compatibilidad transitoria con el motor anterior.

En cada fase: tipos → acceso a datos → controlador → presentación → pruebas. Los contratos exclusivos de Dashboard y Control se sustituyen con sus consumidores en las fases respectivas. Las compilaciones transversales no equivalen a repetir una auditoría funcional global.

### Fase 1 — Contratos comunes y Cajero V3 completo

**Objetivo:** completar el circuito operativo de Cajero sin dependencias del motor anterior.

**Archivos principales:** compartidos obligatorios de tipos, labels y errores; archivos obligatorios de Cajero de la sección 4.2; estilos de estados; ocho pruebas de Cajero y pruebas específicas de reconteo/cachés. Aplicar solo la propagación compartida indispensable y la normalización de badges en los consumidores administrativos del estado común.

**Cambios concretos:**

- Estados exactos V3, bootstrap y sesión sin snapshot global.
- Payload normal con únicamente UUID, grupo, físico y timestamp dentro de cada item.
- Wrappers separados `startCajeroRecount` y `saveCajeroRecount`; mantener las operaciones existentes de grupos, status, inicio, batch, cierre e historial.
- Buffer V4 normal, descarte acotado de versiones incompatibles y separación de reconteos.
- Eliminar `CajeroObservationType`, tipos/motivos legacy, `tipo_observacion`, `observacion_origen_id` de conteos normales y bloqueo `stock_updated`.
- Conservar expiración, inactividad local, autorización y falta de stock disponible; un snapshot nuevo no provoca cierre/reinicio.
- Implementar envío de pendientes V4 expirados conforme a la sección 5.2. Incorporar `SOLOG_EXPIRED_SESSION_SUPERSEDED` a normalización y mensajes, sin reasignar ni borrar automáticamente el buffer.
- Invalidar y refrescar Conteo, Diario, Revisar e Historial según eventos, preservando capturas y evitando respuestas tardías.
- Sustituir exclusiones permanentes de grupos por reconciliación con colas backend.
- Revisar inicia reconteo individual; habilita captura solo tras recibir la referencia congelada, permite reanudación y guarda por `recount`.
- Mostrar resultado backend y refrescar Diario tras `Inconsistente`.
- Historial sin tipos legacy; cobertura y contadores de Inicio tomados de backend.

**Dependencias:** backend V3 listo, incluidos bootstrap corregido y recuperación de expirados ya implementada. Son dependencias satisfechas, no aprobaciones pendientes ni motivos para reabrir el análisis.

**Qué no tocar:** lógica administrativa de métricas/filtros/exportación, rutas, aritmética de calculadora, autenticación, catálogo, grupos, incidencias, dispositivos ni backend.

**Validaciones:**

- TypeScript con `bunx tsc -p tsconfig.app.json --noEmit`, `bun run build` y `bun run lint`.
- Ocho archivos de pruebas de Cajero adaptados, pruebas específicas de reconteo/cachés y protección `tests/admin-groups-contract.test.ts` por tocar compartidos.
- Pruebas manuales solo de Cajero: sesión, snapshots, captura, recuperación de expirados, rechazo por sesión posterior, reconteo y resultados.

**Criterio exacto de finalización:** cumplir los 15 criterios de Cajero de la especificación y las obligaciones de recuperación de la sección 5.2; sin payloads legacy, sin pérdida de pendientes ante snapshots, sin reasignación de expirados y con `Coincide`, `Confirmada` e `Inconsistente` comprobados. TypeScript, build, lint y pruebas relacionadas satisfactorios. No continuar automáticamente a Fase 2.

### Fase 2 — Dashboard Administrador V3

**Objetivo:** mostrar métricas y actividad conforme a las RPC V3.

**Archivos principales:** contratos Dashboard/actividad de `src/features/solog/types.ts`, `admin.dashboard.overview.tsx`, consumidores probables que requieran propagación y pruebas específicas de Dashboard/actividad.

**Cambios concretos:**

- Cinco tarjetas: Cobertura quincenal, Contados hoy, Por recontar, Confirmadas e Inconsistentes.
- Usar `recontar`, `confirmadas` e `inconsistentes`, sin depender de `persistentes`.
- Corregir la forma de cobertura diaria y las columnas por sede.
- Retirar dependencias de campos ausentes sin inventar métricas sustitutivas.
- Eliminar `grupos_registrados*` del contrato de actividad; conservar el render que ya utiliza observaciones y grupos distintos.

**Dependencias:** Fase 1 aprobada y representación común de estados V3.

**Qué no tocar:** Control, navegación administrativa, contexto sede/período, dispositivos, catálogo ni Supabase.

**Validaciones:** TypeScript, build, lint y pruebas específicas de Dashboard/actividad. Manual: sedes vacías, valores cero, cinco métricas, sesión activa y drawer de actividad. Sin auditoría global de Cajero o de módulos excluidos.

**Criterio exacto de finalización:** cinco KPIs correctos; ninguna lectura de métricas eliminadas; cobertura diaria y actividad con campos reales; estructura visual preservada; validaciones relacionadas satisfactorias. Cumplir los criterios de Dashboard/actividad de la especificación antes de autorizar Fase 3.

### Fase 3 — Control, Drawer y Export V3

**Objetivo:** consultar y exportar el resultado operativo autoritativo.

**Archivos principales:** contratos Control/detalle/exportación de tipos compartidos; archivos obligatorios de Control de la sección 4.3; hook de exportación si requiere propagación; estilos localizados y pruebas de filtros, detalle, historial y Excel.

**Cambios concretos:**

- Filtros `recontar`, `confirmadas`, `inconsistentes`, `coinciden`, `todos`, incluidos valores iniciales y reinicio.
- Correspondencia explícita entre filtros y claves de resumen; no asumir `summary[group]` para cualquier clave.
- Una sola diferencia vigente; incorporar reconteo y eliminar segundo saldo, tipo de observación y motivos legacy.
- Cronología por observación independiente, con posterior y reconteo dentro de la misma fila; sin árbol de `observacion_origen_id`.
- Mostrar solo fechas/referencias disponibles, sin inventar timestamps de snapshots ni usuarios históricos ausentes.
- Confiar en el `total` corregido para paginación de Control con filtros.
- Adaptar el historial completo de detalle a la paginación visual local existente, sin solicitar páginas que esa RPC ignora.
- Validador Excel V3 y exportación directa de filas backend; incluir reconteo e identificación de detalle.
- No recalcular elegibilidad, ajuste ni valorización; no incluir automáticamente `Inconsistente` como ajuste POS.

**Dependencias:** Fases 1 y 2 aprobadas. La coherencia de `rpc_solog_control.total` ya está resuelta y no constituye un bloqueo.

**Qué no tocar:** reglas del motor, cálculo de ajustes, catálogo/grupos/incidencias/dispositivos, contexto administrativo, períodos ni backend.

**Validaciones:** TypeScript, build, lint y pruebas nuevas de filtros, detalle, historial y exportación. Manual: sede/período/filtros, varias páginas de Control y Drawer, archivo Excel y respuesta de exportación vacía. Sin revisión global intermedia.

**Criterio exacto de finalización:** cumplir los criterios administrativos de Control y exportación de la especificación; sin contratos legacy ni segundo saldo; paginación coherente con filtros, sin páginas repetidas del Drawer; Excel con las filas elegibles backend y sin `Inconsistente` como ajuste POS. Validaciones relacionadas satisfactorias antes de autorizar Fase 4.

### Fase 4 — Limpieza acotada y revisión global final

**Objetivo:** verificar una sola vez la integración completa y cerrar la adaptación.

**Archivos principales:** exclusivamente residuos relacionados con el motor y pruebas de las fases anteriores; no ampliar la lista de módulos funcionales.

**Cambios concretos:**

- Retirar referencias operativas legacy restantes y estilos vinculados sin consumidores.
- Revisar payloads, casing, snapshots por observación, invalidación, persistencia y recuperación de expirados.
- Verificar que no se alteraron módulos excluidos, rutas ni arquitectura.
- Revisar el diff acumulado completo contra el alcance aprobado y ejecutar la matriz final.
- Distinguir residuos operativos de referencias legítimas o históricas; no hacer reemplazos textuales indiscriminados.

**Dependencias:** Fases 1–3 aprobadas. Los tres puntos backend de la sección 5 se consideran resueltos.

**Qué no tocar:** documentación histórica o especificación, mejoras generales, módulos excluidos, backend y nuevas funcionalidades.

**Validaciones:** todos los comandos de la sección 9, matriz de la sección 8 y revisión de working tree/index. Esta es la única revisión global funcional del proceso.

**Criterio exacto de finalización:** aceptación completa Cajero/Admin, recuperación de expirados conforme a la regla cerrada, validaciones satisfactorias, ausencia de dependencias operativas legacy, protección del alcance comprobada y ningún defecto pendiente que impida cumplir la especificación.

## 8. Matriz de pruebas final

| Caso | Resultado esperado |
| --- | --- |
| Inicio de sesión | Autenticación actual intacta; bootstrap V3 correcto y sesión sin snapshot global de referencia. |
| Sesión sin snapshot disponible | Mensaje correcto, sin simular stock ni permitir captura/inicio donde backend no lo autoriza. |
| Período operativo no iniciado | Mostrar el error correspondiente y respetar `puede_iniciar_conteo`. |
| Snapshot nuevo durante sesión | Misma sesión, captura permitida y listas operativas actualizadas. |
| Snapshot nuevo con pendientes locales | Conservar físico, UUID, conteo y timestamp; backend resuelve el snapshot de cada observación. |
| Recuperación de pendientes V4 después de expiración | `save_batch` permite enviar capturas dentro de la ventana original si no comenzó otra sesión posterior en la sede. |
| Sesión marcada activa cuya hora expiró | Backend la marca expirada y aplica la misma recuperación; frontend no borra ni reasigna pendientes. |
| Ventana temporal del envío recuperado | Respetar `iniciado_at <= contado_at <= expira_at`; no modificar timestamps para volver elegible una captura. |
| Rechazo `SOLOG_EXPIRED_SESSION_SUPERSEDED` | Mostrar error, considerar el buffer no recuperable por envío normal y no reasignar ni borrar automáticamente sus observaciones. |
| Conteo Quincenal | Solo `vista='conteo'`; filtros locales de categoría/stock y cobertura autoritativa. |
| Conteo Diario | Solo `vista='conteo_diario'`; observación nueva normal sin origen. |
| Batch parcial | Retirar solo items confirmados; conservar rechazados con UUID y timestamp originales. |
| Duplicados | Reconocer `ya_guardado`, retirar el pendiente confirmado y aceptar su variante real de respuesta sin inventar snapshot. |
| Aislamiento y reintentos del buffer | No mezclar usuario, sede, dispositivo o conteo; mantener identidad de observaciones en los reintentos. |
| Buffer legacy | Descartar por versión sin migrar ni enviar; no afectar otras claves ni buffers V4. |
| Revisar | Consumir únicamente cola elegible backend, sin clasificación seguimiento/reconteo. |
| `recount_start` | Ejecutar por inicio individual antes de habilitar captura; nunca congelar toda la lista al cargar. |
| Fallo de `recount_start` | No aceptar captura como reconteo iniciado ni inventar una referencia local. |
| Snapshot durante reconteo | Snapshot y teórico congelados permanecen iguales en la UI. |
| Recarga durante reconteo | Reanudar el mismo detalle mediante `recount_start` y recuperar la referencia backend existente. |
| `recount` | Operación separada del batch; diferencia y estado finales autoritativos. |
| Respuesta de reconteo perdida | Reconciliar sin duplicar observaciones ni inventar éxito. |
| `Coincide` | Mostrar cero/estado backend y retirar de Revisar cuando corresponda. |
| Primer posterior resuelve el caso | Desaparecer de Revisar tras refresco, sin ejecutar esa regla de negocio en cliente. |
| `Confirmada` | Mostrar diferencia final backend aunque difiera del cálculo físico inicial menos teórico inicial. |
| `Inconsistente` | Retirar/refrescar el caso; no crear tercer conteo dentro de la misma observación. |
| Reaparición de Inconsistente en Diario | No ocultar el grupo mediante `confirmedGroupIds`; permitir nueva observación independiente. |
| Respuestas tardías e invalidación | Una respuesta anterior no repuebla caché invalidada ni sobrescribe datos de otra sesión/identidad. |
| Historial | Estados, posterior y reconteo actualizados; sin tipos legacy ni caché anterior al guardado. |
| Dashboard | Cinco KPIs y cobertura diaria correctos; sin `Persistentes` como métrica del motor. |
| Actividad por sede | Observaciones, grupos distintos y sesiones con campos reales, sin `grupos_registrados*`. |
| Control | Filtros V3, diferencia única, reconteo y resultados backend. |
| Paginación de Control | `total` y filas coherentes para sede, período, scope, estado, grupo de estado, categoría y búsqueda. |
| Drawer | Observaciones independientes, referencias de snapshots correctas y reconteo dentro de cada fila. |
| Paginación del Drawer | Cortes locales del historial completo sin repetir páginas ni depender de offset backend ignorado. |
| Export Excel | Mismas filas elegibles recibidas, estado `Confirmada`, reconteo y detalle identificable; ajuste y valor sin recalcular; conservar hojas y formatos. |
| Exportación vacía | Informar ausencia de ajustes elegibles sin generar resultados ficticios. |
| Protección del alcance | Catálogo, grupos, incidencias, dispositivos, login, branding y navegación sin cambios funcionales. |

Durante la búsqueda global conservar referencias legítimas: `pendiente` de otros dominios; snapshots de observaciones, incluido `snapshot_referencia_id`; redirecciones históricas como `/cajero/seguimiento`; texto no operativo y mappings deliberados de la especificación o del plan. Las menciones documentales del motor anterior no son contratos activos que deban borrarse.

## 9. Comandos de validación global

Ejecutar al finalizar la Fase 4:

```text
bunx tsc -p tsconfig.app.json --noEmit
bun run build
bun run lint
bun test
git diff --check
git diff --cached --check
```

Revisar también el estado y alcance de cambios:

```text
git status --short
git diff --name-status
git diff --cached --name-status
```

Las fases anteriores ejecutan únicamente las validaciones relacionadas descritas en la sección 7. No realizar una auditoría funcional global después de cada fase.

Estos comandos son instrucciones para la futura implementación. No se ejecuta la revisión global al crear este plan. La comprobación documental se limita a verificar el nuevo Markdown y que no se modificaron archivos ajenos. No hacer commits como parte de la creación de este documento.

## 10. Estado final

El análisis y las cuatro fases están aprobados. Bootstrap, recuperación de pendientes V4 expirados y `total` de Control están resueltos conforme a la sección 5. No quedan aquellos bloqueos pendientes ni decisiones alternativas por proponer.

La implementación todavía no ha comenzado. La Fase 1 requiere una indicación posterior expresa del responsable del proyecto.

Estado: LISTO PARA IMPLEMENTAR

Primera fase autorizable:
Fase 1 — Contratos comunes y Cajero V3 completo
