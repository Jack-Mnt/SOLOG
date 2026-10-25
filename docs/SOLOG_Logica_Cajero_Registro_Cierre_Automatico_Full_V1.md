# SOLOG — Lógica Cajero — Registro agrupado y cierre automático Full V1

**Estado:** APROBADO Y CONGELADO — definición funcional. Preflight backend realizado; **contratos de integración pendientes de resolver/validar antes del plan frontend**. No implementado.
**Fecha:** 2026-10-25.
**Proyecto:** SOLOG. **Rama:** `admin-work`; `master` fuera de alcance.
**Clasificación:** **Nivel C** — persistencia local, idempotencia, secuenciación y ciclo de vida de sesiones.
**Fuente primaria única de este bloque:** `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`.

## 1. Autoridad, alcance y precedencia

Esta fuente congela **cómo el Cajero guarda, registra, reintenta y cierra** durante el ciclo horario de snapshots Full. No introduce una nueva estrategia de Motor ni modifica las decisiones de UX/UI congeladas.

Orden de autoridad por dominio:
1. **Este documento**: borradores, envío voluntario/automático, orden seguro de entrega, recovery, cierre y conservación de evidencias en Cajero Full.
2. **Contrato backend realmente desplegado**: `rpc_solog_cashier_bootstrap_v6`, `rpc_solog_cashier_mutate_v7`, funciones Full y sus esquemas. Prevalece en payloads, autorizaciones, ventanas, estados, prioridad y semántica de persistencia remota. Ante incompatibilidad con este documento, **no improvisar adaptación**: detener e informar a ChatGPT para decisión de contrato/backend.
3. `docs/SOLOG_Logica_Cajero_Autocierre_Recovery_V1.md`: fuente funcional V4 congelada, reutilizable en sus garantías y UX; su wire contract, rutas V4 y tiempos históricos **no** prevalecen sobre V6/V7.
4. `docs/SOLOG_Integracion_Cajero_Recovery_Estado_Operacional_V1.md`: garantías de segregación de sesiones y autoridad por sesión; estructuras V4, históricas cuando difieran de Full.
5. `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`: validación y semántica de motivos/observaciones, especialmente reconteos.
6. `docs/SOLOG_UX_Cajero_Proteccion_Captura_Sin_Guardar_V1.md`: guardia de edición D.1.4.
7. `docs/SOLOG_UX_Cajero_Proteccion_Inicio_Snapshot_Horario_V1.md`: guardia de inicio HH:59–HH+1:02; **no se modifica**.
8. `docs/SOLOG_Correccion_Cajero_Restauracion_Interfaz_Full_Parcial_V1.md` y especificaciones UX/UI de Cajero: composición, navegación y textos no sustituidos aquí.

`docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md` sigue siendo la fuente conceptual histórica de las reglas del Motor. Los límites de turno y reglas temporales **efectivamente desplegados** en Full no se pueden sustituir desde este bloque: cualquier discrepancia requiere evaluación específica, no reinterpretación frontend.

**Estado documental:** este documento es vigente para el bloque Full; V4/V5 son referencias funcionales/históricas, **no implementaciones para reactivar**. No se cambia ni sustituye la fuente primaria de ninguno de los otros dos pendientes: KPIs y contexto original de reconteos.

## 2. Objetivo y decisiones funcionales aprobadas

Restaurar la experiencia ya aprobada de Cajero:

```text
iniciar sesión (snapshot y revisión congelados)
→ capturar grupos elegibles
→ guardar borradores locales editables
→ registrar conteos voluntariamente durante la sesión
→ al vencer expira_at:
   bloquear inmediatamente nuevas capturas
   → registrar automáticamente los pendientes válidos
   → confirmar/conciliar recepciones
   → finish explícito y confirmado
   → Inicio y nuevo inicio si backend y guardia horaria lo autorizan
```

Se mantienen, sin redecidirlos:
- `Continuar` guarda **localmente** y avanza; `Siguiente` sin cantidad no crea borrador.
- `Registrar conteo` es la acción de envío en Inicio, Conteo y Conteo diario; **Revisar no tiene botón de envío**.
- Cada sesión congela `reference_snapshot_id`, `groups_revision`, stock teórico, precio y contexto. Un snapshot posterior no cambia esa referencia.
- Motor/servidor deciden prioridad, elegibilidad, cantidad de conteos permitidos, reconteos y estados de diferencias.
- Observaciones, protección D.1.4 y umbral `abs(diferencia) >= 12` se conservan tal como ya fueron aprobados.
- Recuperación técnica transparente en el camino feliz; no se obliga al usuario a ejecutar pasos manuales al vencer una sesión.

## 3. Ventana temporal y ciclo horario

La sesión deja de capturar al llegar a `session_expires_at` de V6; no se extiende por el tiempo que tarde en enviar.

Backend Full, verificado en preflight:
- La referencia permite **dos intervalos de captura como máximo** dentro de `snapshot_captured_at + 2 horas`; cada sesión toma su intervalo y respeta el límite de turno backend.
- `capture_interval_number` es 1 o 2, y `session_expires_at` no supera el fin del intervalo correspondiente.
- La entrega de observaciones registradas válidamente **antes** de `session_expires_at` puede continuar hasta `pending_delivery_until = session_expires_at + 2 horas`, si V7 lo autoriza.
- `contado_at` debe pertenecer a la sesión y ser anterior a `session_expires_at`. La ventana de entrega no habilita capturas nuevas.
- La guardia de inicio HH:59–HH+1:02 no bloquea registrar, reintentar o cerrar una sesión ya iniciada.

No abrir una sesión automáticamente al finalizar la anterior; volver a Inicio y exigir **inicio explícito** del cajero, sujeto a V6 y a la compuerta horaria existente.

## 4. Modelo lógico de persistencia local

Debe haber **una sola orquestación Full** para V7; no reactivar `CashierV4Runtime`, escrituras V5 ni un segundo sender.

El almacenamiento duradero debe distinguir, de forma explícita, al menos:

| Categoría | Significado y acciones válidas |
|---|---|
| **Borrador editable** | Cantidad, expresión/metadatos, motivo, nota, instante original y scope; editable o descartable solo antes de preparar su operación. |
| **Operación preparada** | Payload completo y `operation_id` persistidos **antes** de llamar V7; inmutables ante retries, incluso si la respuesta se perdió. |
| **Confirmación recibida** | Receipt/IDs autoritativos persistidos antes de retirar borradores relacionados; permite reconstruir el manifiesto. |
| **Resultado incierto** | No se sabe si el servidor aplicó el payload. No regenerar IDs, no editar ni descartar la operación; reintento exacto/reconciliación. |
| **Rechazo definitivo** | Conserva causa y evidencia; no se considera confirmado ni se reintenta indiscriminadamente como si fuera temporal. |
| **Cierre preparado/confirmado** | El `finish` usa operación y manifiesto estables; no se limpia estado de sesión hasta confirmación segura. |

El scope mínimo incluye identidad de usuario/dispositivo, `session_id`, `reference_snapshot_id` y `groups_revision`. Si la sede es requerida en el cliente, debe **obtenerse autoritativamente**, no inventarse a partir de la sesión activa. Los drafts y operaciones de A no pertenecen a B.

Se preserva el namespace/journal Full existente y sus operaciones; cualquier evolución de formato requiere **versionado, lectura/migración compatible y pruebas con datos preexistentes**. No borrar, sobrescribir ciegamente ni regenerar el outbox `solog.full2` ni recuperar automáticamente V5 sin una migración aprobada.

### 4.1 Captura/edición

- Guardar localmente no ejecuta `save_batch` / `recount_save_batch`.
- La cantidad `0` es válida; entrada vacía/incorrecta no equivale a cero.
- Para el mismo grupo/detalle de reconteo y sesión existe un único borrador editable vigente, actualizable sin duplicar trabajos.
- La observación física conserva `contado_at` original de su captura; la edición de borrador no lo sustituye silenciosamente por la hora de envío. La identidad de observación se fija y conserva al preparar la entrega.
- Nunca inventar marcas horarias para satisfacer una ventana vencida. No se permite crear o actualizar una **nueva captura física** después de `session_expires_at`.
- Una observación incompleta o inválida no se prepara para V7: debe permanecer visible y corregible dentro de la ventana, o retenida como incidencia local cuando ya no sea corregible, según seguridad contractual. No descartarla silenciosamente.
- `Omitir producto` solo descarta la edición actual y no borra un borrador previamente guardado; D.1.4 intercepta navegación y salida con edición pendiente.

## 5. Registro voluntario agrupado

- `Registrar conteo` entrega primero borradores normales `save_batch` y después borradores de reconteo `recount_save_batch`, **solo** conforme a la prioridad y elegibilidad autoritativas de la sesión.
- Máximo **500 ítems** por batch; separar acciones y scopes de sesión. No mezclar normales y reconteos ni sesiones diferentes en un payload.
- El flujo de registro es **una ejecución serializada**, con un único trabajo activo frente a doble clic, navegación, pestañas y refresh.
- Antes de preparar el siguiente batch, resolver cualquier operación preparada/incierta del mismo scope. No crear un segundo UUID por timeout.
- La selección del siguiente lote depende del estado autoritativo actualizado y de la prioridad real; después de confirmar un batch, reconciliar cambios de prioridad antes de construir el siguiente. No calcular `next_action` desde borradores, clases CSS o colas reconstruidas localmente.
- Una parte confirmada sigue confirmada cuando falla un lote posterior. La secuencia se detiene en error incierto, conflicto o falta de autoridad; los pendientes se conservan intactos.
- Una respuesta del servidor sin confirmación verificable no equivale a envío exitoso. No mostrar `registrado` antes de persistir su receipt.
- Los borradores actualmente no elegibles **no se envían forzadamente**; se conservan y quedan identificados para evaluación, sin modificar reglas del Motor.
- Una operación rechazada en forma definitiva **no se convierte automáticamente en otro intento** sin clasificar causa y decidir la reparación segura.

## 6. Vencimiento y autocierre

La regla aprobada es:

```text
server_now >= session_expires_at
→ impedir captura inmediatamente
→ identificar drafts/operaciones de ESTA sesión
→ intentar enviar lotes capturados a tiempo y permitidos por V7
→ confirmar/reconciliar todos los resultados
→ verificar cola local vacía, sin rejected, inciertos ni drafts sin resolver
→ preparar finish con manifest completo y client_queue_empty = true
→ persistir finish y transmitirlo por V7
→ recibir/conciliar confirmación del servidor
→ marcar cierre y regresar a Inicio
```

- **Sin pendientes:** ejecutar `finish` automáticamente. No mostrar recovery como tarea del cajero.
- **Con pendientes, éxito:** registrar todos los entregables, recibir comprobantes y finalizar automáticamente.
- **Fallo de red/resultado incierto:** conservar outbox inmutable; informar que está verificándose el envío y reintentar de modo seguro al reanudar conexión/sesión.
- **Rechazo definitivo:** conservar drafts/evidencia y bloquear `finish` hasta resolverlos o hasta descarte expresamente seguro y confirmado por el usuario. Ninguna cola rechazada cuenta como `client_queue_empty`.
- **Conflicto de idempotencia o evidencia insuficiente:** bloquear descarte y cierre; no generar otra operación de reemplazo.
- **Sesión fuera de capacidad de entrega:** conservar la evidencia local, mostrar estado no entregable y requerir resolución explícita. No trasladar observaciones a otra sesión.
- Si el navegador está cerrado o sin conexión, frontend **no puede** transmitir ni finalizar en ese instante. Al reabrir o reconectar debe reanudar la reconciliación cuando V7 lo permita, sin afirmar que hubo cierre.
- La recuperación no habilita capturar fuera de hora, no desplaza la referencia congelada y no debe confundirse con un snapshot nuevo.
- Mientras haya una recovery propia con operaciones o drafts pendientes, preparar/ejecutar otro start está bloqueado en este flujo de Cajero. El backend puede admitir coexistencia `active+recovery`; no mezclar sus estados.
- Si la sesión se cierra manualmente antes de expirar, aplicar **el mismo** envío, reconciliación y `finish` seguro. No duplicar rutas de finalización.

### 6.1 Descarte, logout y presentación

- Solo permitir descartar un borrador sin operación preparada, o una operación con **rechazo definitivamente conocido y probado no aplicado**, y siempre mediante confirmación explícita. La existencia de cualquier resultado incierto, `operation_id` conflictivo o receipt no reconciliado impide el descarte.
- El logout no debe perder trabajo de forma silenciosa; si hay cierre/envío incierto o pendientes, preservar autenticación/estado o aplicar una salida segura expresamente definida. No limpiar almacenamiento para fingir un cierre exitoso.
- UX normal: `Finalizando conteo…` mientras persiste el cierre; `Envío pendiente` cuando no se completó. Conservar Inicio/Historial sin ofrecer nuevas capturas; no exponer `recovery` como paso de usuario salvo diagnóstico.
- Se conserva la exportación diagnóstica de operaciones existentes sin exponer secretos nuevos.

## 7. Contrato remoto V6/V7 verificado durante preflight (lectura, sin migraciones)

**Entradas públicas vigentes:**
- `public.rpc_solog_cashier_bootstrap_v6(p_payload)`
- `public.rpc_solog_cashier_mutate_v7(p_action,p_payload)`

**Acciones V7:** `start`, `save_batch`, `recount_save_batch`, `finish`.

**Requisitos por acción:**
- `start`: `operation_id`, `device_token`.
- `save_batch` / `recount_save_batch`: `operation_id`, `device_token`, `session_id`, `expected_groups_revision`, `items[1..500]`.
- `finish`: `operation_id`, `device_token`, `session_id`, `expected_groups_revision`, `delivery_manifest` con `observation_ids[]` y `client_queue_empty = true`.

Los ítems incluyen `client_observation_id`, `stock_fisico`, `contado_at`, `motivo_diferencia` y el identificador de grupo o detalle más la observación correspondiente. El schema remoto define el shape exacto; no inferir campos extras.
V7 valida fecha original (`iniciado_at <= contado_at < expira_at`, tolerancia futura máxima de 30 s), elegibilidad, `groups_revision`, umbral de observaciones, prioridad, y derecho de entrega hasta `pending_delivery_until`.
V7 confirma `observation_results` y utiliza `operation_id` para replay idempotente. `finish` comprueba que el manifiesto contenga exactamente los IDs de observaciones confirmadas por esa sesión (sin omisiones ni sobrantes). Esto **no sustituye** la comprobación frontend de drafts y operaciones pendientes.

## 8. Bloqueos técnicos detectados (NO autorizan improvisar backend)

Estas condiciones son **bloqueantes para congelar un contrato de consumo frontend y comenzar implementación**; las reglas funcionales anteriores sí quedan congeladas:

1. **`FullRuntime.observe()` envía inmediatamente** y su journal no contiene un modelo de borradores editables. Hay que diseñar una migración/versionado local compatible con `solog.full2`, sin borrar pendientes.
2. **`FullRuntime.finish()` comprueba `pending`, pero no bloquea correctamente los `rejected` ni los nuevos drafts**. Puede intentar cerrar sin haber resuelto todo el trabajo. Debe bloquear todos los estados no conciliados.
3. **`flushInside()` continúa tras ciertos rechazos y captura errores de red sin lanzar**. El flujo superior podría interpretarlo incorrectamente como éxito; se necesita resultado de entrega explícito y seguro (confirmado, incierto, rechazo conocido, conflicto).
4. **`retry()` cambia indiscriminadamente operaciones `rejected` a `pending`**. Reintentar solo cuando esté permitido; preservar payload/UUID en replays y clasificar errores sin ocultarlos.
5. **No hay snapshot operacional remoto por recovery con colas/prioridad equivalente al antiguo V4**, solo sesión recovery y `recovery_manifests`. Verificar cómo obtener autoridad actual de prioridad para enviar drafts no preparados de una sesión vencida. Los grupos persistidos localmente NO son por sí solos prueba de elegibilidad remota.
6. **Las respuestas de mutación incluyen grupos afectados, no todo el nuevo panel de prioridades**; definir cuándo refrescar V6 y cómo planificar el siguiente batch. Si la sesión ya está en recovery y V6 no la expone con prioridad completa, devolver el bloqueo a ChatGPT/backend.
7. **La UX de reconteos requiere contexto original todavía ausente de V6** (otro bloque). No degradar ni inventar el motivo original; si impide crear una observación válida, detener específicamente esa entrega y reportar dependencia.
8. **El efecto de autocierre actual es best-effort de la pestaña abierta** y recuerda vencimientos intentados solo en memoria. Debe permitir reanudación real desde storage/servidor, sin bucles de retries ni dar por cerrado un `finish` pendiente/ambiguo.

El conjunto **no prueba todavía** que sea necesaria una RPC nueva: primero evaluar si las funciones existentes pueden ofrecer la autoridad de delivery/recovery requerida mediante contratos desplegados. Si se requiere una ampliación aditiva de lectura o de garantías de cierre, ChatGPT la diseña, despliega y valida **antes** de entregar un plan de frontend a Codex.

## 9. Casos de aceptación y pruebas exigidas

1. Guardar varios borradores normales en una sesión sin generar mutaciones V7.
2. Editar el mismo borrador, cantidad 0, notas y protección de pérdida de edición.
3. Registrar voluntariamente `save_batch` (hasta 500), luego `recount_save_batch` solo cuando sea elegible; guardar receipts y progreso parcial.
4. Fallo en segundo lote: no duplicar primero; reintentar el mismo segundo lote sin cambiar payload/UUID.
5. Timeout con aceptación remota y replay: una única observación lógica, sin borrado de estado incierto.
6. Error definitivo, idempotency conflict, sesión sin permiso y pérdida de clock: no cerrar en falso ni reintentar indiscriminadamente.
7. Límite exacto de `session_expires_at`: no aceptar capturas nuevas; sí entregar las previas hasta autorización remota efectiva.
8. Autocierre con cola vacía y con cola no vacía, confirmación completa de `finish`.
9. Recarga de página, cierre/reapertura, reconexión y varias pestañas durante un envío/cierre preparado.
10. Recovery A simultánea con active B: nunca mezclar snapshots, scopes, prioridades ni manifiestos.
11. Envío con prioridad que cambia tras confirmar un lote: el segundo lote obedece autoridad nueva, no un panel local obsoleto.
12. Turno/snapshot nuevo, bloqueo de inicio HH:59–HH+1:02 y sesión previa aún en entrega: no romper el gate aprobado.
13. Logout con pendientes y exportación diagnóstica: sin purga de datos ni cierre falso.
14. `bun test` dirigido + suite pertinente, lint, typecheck, build, `git diff --check`, pruebas navegador y smoke humano de Cajero. Distinguir evidencia ejecutada de pendiente.

## 10. Secuencia de trabajo y gobernanza

1. **Definición funcional:** completada; decisiones aprobadas y congeladas en este documento.
2. **Preflight conceptual/backend:** efectuado sobre código `admin-work` y funciones V6/V7 desplegadas. Los bloqueos de §8 permanecen abiertos.
3. **Resolución de contrato:** ChatGPT define la fuente autoritativa para priorizar/entregar drafts en recovery, clasificación de fallos y capacidades mínimas. Si hay backend, ChatGPT lo despliega y verifica sin delegarlo automáticamente a Codex.
4. **Congelación técnica:** actualizar un delta/documento específico con el contrato exacto probado y la semántica de conciliación. No inventar respuestas ni tipos V6/V7.
5. **Plan de Codex:** solo después, con baseline, alcance estricto, fases, preservación de cambios previos, sin refactor general ni backend; esperar aprobación del plan.
6. **Implementación y evaluación:** por fases, pruebas dirigidas, revisión de diff, smoke operativo y cierre expreso.

### Exclusiones y backlog

Fuera de este bloque: KPI y progreso de cobertura; detalles originales de reconteos excepto un bloqueo real de escritura; cambio de Motor, transiciones de diferencias, reglas de turnos, ingestión automática de snapshots, cron, Admin, diseño general de Cajero, `master`, migración automática desde namespaces V4/V5.

**Resultado de la congelación:** se congela **qué debe suceder**, no se declara desplegado ni compatible algo que el preflight aún no ha probado. Una incompatibilidad de backend se devuelve a ChatGPT y requiere delta/decisión aprobada antes de continuar.
