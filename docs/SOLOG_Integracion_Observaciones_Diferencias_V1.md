# SOLOG — Integración de motivos y observaciones de diferencias V1

**Proyecto:** SOLOG  
**Estado:** CONGELADO — definición funcional aprobada y contrato objetivo para preparación backend; **no desplegado**.  
**Clasificación:** Nivel C — Backend / Integración / UX operativa.  
**Fecha:** 14 de octubre de 2026.  
**Rama de desarrollo:** `admin-work` (`master` permanece intacta).  
**Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`).  
**Responsabilidad:** ChatGPT diseña, despliega y valida backend; Codex prepara baseline, plan y frontend tras backend validado y aprobación del plan.

## 1. Fuente primaria, alcance y prevalencia

Este documento es la **única fuente primaria** del bloque independiente de **Motivos y Observaciones de Diferencias**. Congela las decisiones funcionales aprobadas y fija el diseño de integración objetivo. Cualquier incompatibilidad nueva o modificación sustantiva requiere un delta aprobado, no reinterpretación silenciosa.

**Prevalencia acotada:** aquí se impone únicamente para captura de motivos/observaciones, su validación, persistencia, reconstrucción y lectura histórica. El resto de las decisiones anteriores conserva vigencia:

1. `docs/SOLOG_Backend_Contrato_Cajero_V4_Delta_Prioridades_V1.md` — autoridad vigente para prioridades, reconteos, invariantes del Motor y estados.
2. `docs/SOLOG_Backend_Contrato_Cajero_V4.md` — contrato legado V4, compatible durante transición.
3. `docs/SOLOG_Backend_Admin_Control_Contrato_V1.md` — forma y semántica de cronología de Control.
4. `docs/SOLOG_UX_Cajero_Proteccion_Captura_Sin_Guardar_V1.md` — protección de edición, salida y omisión D.1.4.
5. `docs/SOLOG_UI_Cajero_Calculadora_Observacion_Visual_Delta_V1.md` — geometría y punto de acceso visual reservado en la calculadora.

**Regla documental:** el delta visual antiguo sigue vigente en su composición, pero sus indicaciones `disabled`, «próximamente», sin diálogo y sin persistencia se consideran **reemplazadas exclusivamente** por la funcionalidad de este bloque. Los documentos restantes son **vigentes** en lo no reemplazado; no se reescriben retrospectivamente. Este bloque es independiente de la validación visual pendiente del Bloque D.

**Fuera de alcance:** rediseño del Motor y sus prioridades; alteración de `Coincide`/`Recontar`/`Confirmada`/`Inconsistente`; nuevos motivos de diferencia; aprobación o confirmación automática de la causa; modificaciones de ConeXion, catálogos, exportaciones o módulos no especificados; refactors CSS generales; acceso directo del cliente a `inventario.conteo_detalle`.

## 2. Decisiones funcionales congeladas

### 2.1. Motivos

Selector de **una sola opción** con valores exactos:

- `Transferencia`
- `Venta por mayor`
- `Dañado`
- `Vencido`
- `Otro motivo`

**Ningún motivo seleccionado por defecto.** «Otro motivo» permite causas no clasificadas entre las cuatro operativas, como errores de venta, pérdidas o robos; registrarlo **no verifica** que la causa sea verdadera ni resuelve el caso.

### 2.2. Validación del diálogo

Una observación redactada voluntariamente se aplica como pareja consistente `motivo + texto`: no guardar un motivo sin texto, ni texto sin motivo; el texto requiere **al menos tres caracteres después de eliminar espacios iniciales y finales**. Tres espacios no son válidos.

El diálogo de observación puede abrirse voluntariamente incluso con diferencia pequeña o cero. La acción aplica la observación a la **captura local actual**; no envía una mutación separada al backend.

### 2.3. Diferencia alta

Umbral congelado: `abs(stock_fisico - stock_teorico) >= 12`, tanto faltantes como sobrantes. `+11` y `-11` no activan obligatoriedad; `+12` y `-12` sí.

- Al pulsar `Continuar` sobre diferencia alta sin explicación completa, abrir automáticamente el diálogo.
- Exigir motivo permitido y texto de al menos tres caracteres para **registrar** una diferencia alta no resuelta físicamente.
- Aplicar la **misma protección** a `Guardar` de D.1.4 y cualquier otro camino real de captura/envío; no limitar la regla al botón `Continuar`.
- Permitir **Omitir producto**: descarta exclusivamente la modificación/captura local actual y avanza al siguiente grupo; no marca resuelto, no consume la cola, no envía al backend, no elimina otro conteo o borrador ya guardado. Si existía un borrador previo, preservarlo.
- La diferencia se calcula en frontend para anticipar el diálogo y se valida de nuevo en backend con el stock teórico autoritativo de la sesión.

### 2.4. Reconteo

- El reconteo completa el mismo registro `inventario.conteo_detalle`, según el Motor vigente; **no crea una fila de conteo normal nueva**.
- Conservar `motivo_diferencia` ya registrado en el conteo original; no reemplazarlo durante reconteo.
- Permitir incorporar un motivo cuando el registro original carezca de él (histórico o diferencia pequeña sin observación). El motivo agregado por primera vez en reconteo se atribuye **al reconteo**, nunca retroactivamente al conteo inicial.
- Permitir una observación distinta en `observacion_reconteo` cuando el reconteo requiera explicación o el usuario voluntariamente la añada.
- Si `stock_reconteo - stock_teorico_reconteo = 0`, el backend fija `observacion_reconteo = 'Resuelto'` de manera autoritativa, sin requerir texto adicional. Este valor no se deriva de un snapshot posterior ni de un cambio ulterior del estado.
- Para reconteo de diferencia absoluta >=12 distinta de cero, exigir motivo válido (heredado o incorporado) y texto de reconteo válido.
- Para reconteo no coincidente con diferencia <12, el texto de reconteo es opcional; si se proporciona una observación voluntaria, requiere motivo y al menos tres caracteres. Con motivo previo puede conservarlo sin introducir nuevo texto.

### 2.5. D.1.4: edición y salida

Conservar protección de X, Escape, clic exterior, regreso, Anterior y cambio de producto. Cambios de motivo/texto forman parte del estado **sin guardar** aun si la cantidad no cambia. `Cancelar` mantiene la edición; `Descartar` revierte únicamente la edición actual; `Guardar` valida tanto cantidad como observación y no puede eludir el umbral. `Continuar` guarda y avanza normalmente cuando la captura es válida.

### 2.6. Consulta histórica

- **Cajero:** motivo y textos en el detalle expandido de cada registro de historial (sin columnas de tabla adicionales).
- **Detalles:** motivo y textos dentro de `DetailsCaseView`, asociando conteo inicial y reconteo de forma diferenciada.
- **Admin Control:** icono de información en el **punto del evento correspondiente** de la línea de tiempo; abre popup mediante clic/pulsación, jamás solo hover.
- Mostrar icono únicamente cuando exista motivo/observación asociable a ese evento; eventos exclusivamente automáticos de snapshots no adquieren observaciones humanas.
- La explicación es una **declaración del cajero**, no prueba ni resolución autorizada de la causa.

## 3. Modelo de datos objetivo

Tabla `inventario.conteo_detalle`, tres columnas **aditivas**:

| Columna | Tipo | Inicial / histórico | Uso |
|---|---|---|---|
| `motivo_diferencia` | `text NULL` | `NULL` | Motivo de captura original o agregado posteriormente en reconteo cuando faltaba |
| `observacion_diferencia` | `text NULL` | `NULL` | Explicación del conteo original |
| `observacion_reconteo` | `text NULL` | `NULL` | Explicación del reconteo o `Resuelto` |

Los `NULL` históricos son válidos; **no realizar backfill ficticio** de los registros ya guardados, incluidos aquellos con diferencias >=12.

Restricciones objetivo:

1. `motivo_diferencia` nulo o perteneciente exactamente al catálogo aprobado.
2. `observacion_diferencia` nula o texto no vacío y de al menos tres caracteres efectivos; si existe, `motivo_diferencia` es obligatorio.
3. `observacion_reconteo` nula, `Resuelto` en reconteo físicamente coincidente o texto de al menos tres caracteres efectivos.
4. Integridad entre motivo y observaciones mediante validación de las RPC en escritura y restricciones compatibles con datos históricos. No añadir un `CHECK` global de obligatoriedad para todas las filas históricas con diferencia >=12.
5. No usar `observacion_diferencia` para describir un motivo descubierto recién en el reconteo; queda `NULL` si no fue registrada en el conteo inicial.
6. No añadir una cuarta columna de procedencia: para **registros nuevos válidos**, la procedencia puede deducirse de la presencia de `observacion_diferencia` versus motivo aportado con `observacion_reconteo`. No aplicar esta inferencia indiscriminadamente a datos históricos incompletos.

**Privacidad:** la tabla está en esquema `inventario` con RLS; no conceder permisos directos adicionales a `anon` ni `authenticated`. Lectura y escritura exclusivamente por RPC con controles existentes de identidad/rol/sede/dispositivo.

## 4. Contrato objetivo de escritura y transición

### 4.1. API versionada

El endpoint V4 actual es `public.rpc_solog_cashier_mutate_v4(text,jsonb)`. Para **operaciones nuevas** se implementará una mutación **versionada**, con nombre objetivo `public.rpc_solog_cashier_mutate_v5(text,jsonb)`. Se preservan las reglas de sesión, autorización, revisión, límites de lote, idempotencia y resultados de V4; nueva respuesta indica `contract_version=5`. El bootstrap V4 y las prioridades V4 no se rediseñan solo por este bloque.

`p_action` conserva `start`, `save_batch`, `recount_save_batch`, `finish`, con las mismas reglas operativas, pero el detalle exacto de uso de `start/finish` entre versiones debe validarse en implementación backend para evitar mezclar identidades de operación. **Codex no resolverá ni modificará ese contrato por su cuenta.**

### 4.2. Elemento `save_batch` nuevo

```json
{
  "client_observation_id": "uuid",
  "grupo_id": "uuid",
  "stock_fisico": 8,
  "contado_at": "timestamptz",
  "motivo_diferencia": "Transferencia",
  "observacion_diferencia": "Se trasladaron 12 unidades"
}
```

Para conteos sin observación y diferencia <12, ambos campos nuevos deben viajar como `null` (no cadenas vacías ni claves ambiguas). El backend calcula `d = fisico - stock_teorico` usando `inventario.solog_session_runtime_groups`, determina la obligatoriedad y valida **antes del INSERT**.

### 4.3. Elemento `recount_save_batch` nuevo

```json
{
  "detalle_id": "uuid",
  "stock_fisico": 8,
  "contado_at": "timestamptz",
  "motivo_diferencia": "Transferencia",
  "observacion_reconteo": "Se volvió a contar toda la caja"
}
```

El backend carga y bloquea el caso original; calcula `dr = stock_fisico - stock_teorico` usando el stock teórico de **la sesión del reconteo**. Si el motivo previo existe debe coincidir con el enviado o tomarse autoritativamente del registro; no permitir cambiarlo. Si falta puede incorporarse. Con `dr=0`, `observacion_reconteo` se establece como `Resuelto` en backend sin requerir texto del cliente; no rechazar por ausencia de texto en ese caso. Para `dr!=0` se aplican las reglas de obligatoriedad y validez.

### 4.4. Respuestas

Cada elemento confirmado en V5 deberá devolver los identificadores y campos habituales **más**:

- `motivo_diferencia: string | null`
- `observacion_diferencia: string | null` para `save_batch`
- `observacion_reconteo: string | null` para `recount_save_batch`

La respuesta debe reflejar valores efectivamente persistidos, incluido `Resuelto`. El cliente validará la confirmación y no asumirá éxito por el mero HTTP 200.

### 4.5. Idempotencia

El `operation_id`, su `p_payload`, su `contado_at` y cada `client_observation_id` / `detalle_id` siguen siendo inmutables durante el retry. Motivo/texto forman parte del **mismo payload transaccional** y de su comparación idempotente. Prohibido enviar primero conteo y luego observación como actualización independiente.

Evitar colisión del namespace de idempotencia entre V4 y V5, preservando replays auténticos de cada versión. Una respuesta incierta no autoriza regenerar el identificador.

### 4.6. Producción V4 y migración segura

Secuencia obligatoria:

1. Preparar/desplegar V5 junto a V4 **sin cambiar ni romper la producción V4**.
2. Probar V5 backend con datos controlados y respuestas V5 definitivas.
3. Adaptar cliente de desarrollo; los lotes V4 **ya preparados** deben conservar la ruta V4, identificador, contenido y reintento exactos. La versión de cada operación preparada es explícita o inferida por su formato histórico sin transformarla.
4. Validar preview y desplegar frontend de producción mediante aprobación normal de `master`.
5. Aplicar **corte controlado** para impedir nuevos `start` V4; permitir durante una ventana finita el envío/replay legítimo de sesiones V4 anteriores, dentro de la elegibilidad de recovery existente; finalmente retirar la posibilidad de escritura V4 que eluda la obligación. No efectuar este corte mientras producción dependa de nuevos `start` V4.
6. Una operación preparada V4 **aún no recibida por el servidor** no es indistinguible de un nuevo envío V4 por payload: resolver el corte por **sesión originada antes del límite temporal**, autorización y ventanas de entrega, no por conjetura del cliente. Los replays ya confirmados conservan semántica idempotente.
7. El corte de producción tiene aprobación propia; nunca modificar `master` automáticamente.

**Límite explícito:** durante el solapamiento V4/V5 la obligatoriedad global de 12 unidades todavía puede eludirse desde un cliente V4 autorizado; no afirmar cumplimiento universal hasta cerrar la transición. No sacrificar datos legítimos de recovery a cambio de un corte prematuro.

## 5. Contrato de borradores locales

Los tipos `CashierV4CountItem` / `CashierV4RecountItem`, `runtime.capture`, `captureNormal` / `captureRecount`, `flush.prepare` y validadores de almacenamiento se ampliarán **después del backend**.

- Mantener compatible la lectura de registros locales antiguos `version: 1`; no descartar por cambio de esquema.
- No serializar los motivos exclusivamente en `metadata` si luego se eliminan al preparar el lote: deben pertenecer al payload de negocio persistido.
- La operación `prepared` es inmutable al recuperarse; identificar versión de protocolo y su ruta de envío.
- Ediciones de borrador **no preparado** pueden actualizar cantidad/motivo/texto; una operación ya preparada no puede cambiar su payload.
- El botón Omitir solo retira la modificación actual; no elimina un `prepared`, otros grupos ni un draft previo confirmado localmente.
- Registrar errores visibles si una operación antigua ya no puede enviarse; nunca borrar o reconstruir silenciosamente.

## 6. Contratos objetivo de lectura

Ampliar aditivamente las RPC correspondientes, con los nuevos campos siempre presentes y nulos en registros históricos:

1. `public.rpc_solog_cashier_history_v2` — incluir `motivo_diferencia`, `observacion_diferencia`, `observacion_reconteo` en cada registro; consumir en detalle expandido de Cajero.
2. `public.rpc_solog_details_v2` — incluir los tres campos al menos en `detail.case`, usado por `DetailsCaseView`; preferir ampliar el `detail` en lugar de inflar innecesariamente las páginas de `history`.
3. `inventario.solog_control_chronology_view_v1`, expuesta por `public.rpc_solog_admin_control_v1` — añadir metadatos de motivo/observación **por evento** en el contrato de cronología (lectura versionada/aditiva), con `row_id` estable. Los eventos de snapshot sin intervención humana no reciben notas por arrastre.

**Procedencia en cronología:**
- El evento de conteo inicial muestra motivo y `observacion_diferencia` solo si fueron registrados en el conteo inicial.
- El evento de reconteo muestra motivo conservado/incorporado y `observacion_reconteo`, incluyendo `Resuelto`.
- Un motivo incorporado en reconteo no debe aparecer en eventos anteriores.
- No usar un objeto compartido de grupo que pinte la nota en todos los puntos.

### 6.1. Incompatibilidad histórica detectada (pendiente de aprobación dirigida)

La cronología vigente de Admin puede emitir **únicamente un evento `Coincide` con fecha de reconteo** para registros resueltos físicamente en reconteo, sin un punto para el conteo inicial. Con esa forma **no hay dónde adjuntar fielmente la observación original**.

**No congelar una alteración encubierta de la cronología.** Antes de implementar esa lectura debe aprobarse un delta mínimo: o añadir un evento histórico inicial `Recontar` con su fecha y observación (opción técnica preferida, conservando estados del Motor), o especificar una presentación alternativa que preserve atribución temporal. Codex no inventará eventos ni duplicará notas. Esta excepción **no bloquea preparar el esquema y la escritura**, pero sí congela el desarrollo de la lectura Admin correspondiente hasta resolverla.

## 7. Errores y reglas de integridad

- Rechazar motivo fuera de catálogo, texto de menos de tres caracteres efectivos y cualquier pareja incompleta en captura voluntaria.
- Rechazar `save_batch` con `abs(d)>=12` y explicación ausente/inválida.
- Rechazar `recount_save_batch` con `abs(dr)>=12` distinto de cero y explicación de reconteo ausente/inválida; respetar `Resuelto` con `dr=0`.
- Preservar ausencia de observaciones en históricos legítimos; no invalidar de forma retroactiva.
- Fallo de un elemento del lote no admite guardar parcialmente los restantes dentro de la misma transacción. Aplicar errores de dominio explícitos con mecanismo existente.
- Proteger autorización, dispositivo, sede, sesión, revisión de grupos, prioridad, ventanas temporales, orden operativo y mutex de sesión conforme a V4.
- Respetar RLS y privilegios actuales; RPC `SECURITY DEFINER` debe conservar `search_path` seguro y validaciones antes de escribir; limitar `EXECUTE` por rol, sin dar `GRANT` de tabla.

## 8. Fases y puertas de avance

| Fase | Responsable | Resultado / puerta |
|---|---|---|
| 1. Fuente primaria | ChatGPT | Este documento; decisiones congeladas; excepción de cronología identificada |
| 2. Backend | ChatGPT | Esquema, V5, validación, lectura y compatibilidad; pruebas SQL de integración y seguridad; **no** activar corte V4 sin aprobación |
| 3. Contratos y almacenamiento frontend | Codex, tras baseline y plan aprobados | Consumir exclusivamente backend desplegado, preservar drafts/operaciones preparadas |
| 4. UX Cajero | Codex | Diálogo y captura/omisión, integrado con D.1.4 |
| 5. Lecturas y Admin | Codex | Cajero/Detalles/Control; resolver excepción de cronología antes de implementar esa superficie |
| 6. Revisión y smoke | Codex + usuario | Tests dirigidos, suite compatible, lint, typecheck, build, `git diff --check`, accesibilidad y smoke real |

**No pedir a Codex implementación frontend contra contratos incompletos o no desplegados.** Codex no cambia Supabase sin solicitud expresa. No modificar `master` ni refactorizar componentes ajenos. Preservar todos los cambios preexistentes.

## 9. Matriz de pruebas obligatorias

- Conteo normal `+11`, `+12`, `-11`, `-12`, cero, motivo voluntario, par incompleto, espacios.
- Reconteo con teórico distinto al inicial; `dr=0` escribe `Resuelto`; `dr!=0` alto requiere explicación.
- Reconteo histórico sin motivo: incorporación en reconteo sin atribución al inicial; conservación de motivo original.
- Omitir producto nuevo versus editar un borrador anterior: sin envíos, sin pérdida del valor anterior, cola intacta.
- D.1.4: Guardar desde confirmación no elude obligatoriedad; edición solo de observación también genera guardia.
- Lote normal y reconteo mixtos, fallo transaccional, recibo/confirmación, retry de V5, replay V4 bit a bit, fallos de red/recarga y `operation_id` estable.
- Historiales nulos para datos anteriores; autoría y origen correctos en las lecturas; eventos automáticos sin icono.
- Transición V4→V5: cliente antiguo puede trabajar durante ventana aprobada; nuevos V4 rechazados después del corte, V4 recovery legítimo conserva ruta.
- Permisos/RLS: cajero no lee ni escribe `inventario.conteo_detalle` directamente.
- Tests frontend, lint, build, `git diff --check`, responsive tablet y desktop, clic/pulsación y foco del popup.

## 10. Estado de cierre

**Congelado en definición:** reglas funcionales, modelo aditivo, contrato objetivo versionado y estrategia de transición.  
**No implementado:** esquema SQL, RPC nuevas/adaptadas, frontend o historial.  
**Sin validación de despliegue:** ninguna prueba de backend realizada como implementación.  
**Pendiente de resolución dirigida antes de lectura Admin:** representación del conteo inicial resuelto por reconteo (§6.1).  
**Pendiente de aprobación de ejecución:** corte de producción V4 y plan de Codex.

Los datos y operaciones actuales de producción se mantienen intactos hasta su fase autorizada.
