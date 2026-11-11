# SOLOG — Lógica Cajero — Ciclo horario y selección de snapshot Full V1

**Estado:** APROBADO Y CONGELADO — DEFINICIÓN FUNCIONAL. **No implementado. Contrato backend objetivo no desplegado ni validado.**
**Fecha de congelación:** 2026-11-11.
**Proyecto:** SOLOG.
**Rama de trabajo:** `admin-work`; `master` es producción estable y queda fuera de los cambios frontend de este bloque.
**Clasificación:** Nivel C — ventanas temporales, selección autoritativa de snapshots, idempotencia, recuperación y concurrencia.
**Fuente primaria única de este alcance:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
**Metodología:** `Flujo_de_desarrollo_eficiente_V1.md`.

## 1. Objetivo y alcance

Sustituir la protección de inicio HH:59–HH+1:02 por sesiones de captura alineadas a la hora exacta, permitir seleccionar de forma informada el inventario de respaldo cuando todavía no está disponible la generación nueva, preservar las capturas y su entrega segura al expirar, y evitar que reconteos o conteos duplicados corrompan el Motor.

El bloque abarca:
- Reglas de tiempo para `start`, captura, expiración y recovery del Cajero Full.
- Clasificación de la generación horaria del último snapshot confirmado por sede; UX de respaldo y espera voluntaria.
- Contrato objetivo aditivo de `public.rpc_solog_cashier_bootstrap_v6` (V6) y `public.rpc_solog_cashier_mutate_v7` (V7), sin renombrar RPC.
- Persistencia versionada de sesiones, protección de replays, reservas de reconteo y diagnóstico de conflictos.
- Sustitución de la guardia y el polling horario actuales en `admin-work`.
- Despliegue backend compatible con clientes Full antiguos y rutas legacy presentes en `master`.

**Fuera de alcance:** cambiar ConeXion, su scheduler HH:59 o el POS/Tumisoft; crear cron de cierre, sondeo permanente, nueva arquitectura de Motor, nuevos conteos por turno, alterar prioridad/estados de diferencias/KPIs de cobertura, refactor general, abrir sesiones automáticamente, archivar automáticamente duplicados como observaciones oficiales, retirar RPC V3 legacy o aplicar cambios frontend en `master`.

## 2. Precedencia y documentación

Para **inicio, clasificación horaria, ventana de captura y transición de política** prevalece este documento sobre:
- `docs/SOLOG_UX_Cajero_Proteccion_Inicio_Snapshot_Horario_V1.md`: su bloqueo HH:59–HH+1:02 y polling de 8 s quedan **reemplazados por este delta**, no el resto de sus restricciones de seguridad.
- Sección temporal de `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`: se reemplazan solamente el límite por intervalo desde `capturado_at` y las referencias a la guardia anterior.

Se mantiene vigente `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md` para **borradores, journal, batches, replays, prioridades, envío, finish, recovery y diagnóstico**, excepto por los deltas de B4–B5 expresos en este documento. Se mantienen vigentes las especificaciones del Motor, motivos, cobertura, accesibilidad y UX no sustituidas expresamente. Los contratos SQL y JSON **realmente desplegados** siguen siendo la autoridad técnica de ejecución hasta validar y desplegar el contrato objetivo: ante discrepancias, **no adaptar frontend por suposición; resolver backend primero con ChatGPT**.

Las decisiones de este documento no sustituyen documentación de otros bloques ni modifican la política legacy del Cajero de producción. Los cambios posteriores requieren delta aprobado y documentado; no reinterpretar silenciosamente.

## 3. Definiciones y autoridad

- **Hora operativa:** `America/Lima`; el servidor determina el reloj confiable para permisos, fechas y vencimientos. El cliente solo proyecta ese tiempo de manera visual y falla cerrado si no dispone de reloj confiable.
- **Ciclo horario de captura:** intervalo local `[HH:00, siguiente HH:00)`. `HH:00` pertenece al ciclo entrante.
- **Generación esperada:** para el ciclo que empieza a `H:00`, su umbral de captura es `H-1:59:00`; el snapshot que cumple `capturado_at >= umbral` y `capturado_at <= server_now` es de generación nueva, si está confirmado, vigente y compatible. El cambio de ciclo modifica el umbral esperado, no la validez de dos horas.
- **Snapshot elegible:** último snapshot confirmado de la sede, en orden `capturado_at DESC, id DESC`, vigente, no futuro, consistente con catálogo/grupos y autorizado por backend. No buscar un snapshot histórico alternativo cuando el más reciente confirmado sea incompatible: bloquear e informar.
- **Nuevo (`new`):** snapshot elegible de la generación esperada del ciclo de inicio.
- **Respaldo (`fallback`):** snapshot elegible anterior al umbral de generación esperada. Este significado es distinto del campo legacy `stock.is_fallback` (edad >= 1 h); no modificar silenciosamente el significado legacy.
- **Fin efectivo de captura (`capture_end`):** mínimo entre fin horario, vencimiento de stock y fin de turno.
- **Recovery:** periodo de entrega de observaciones *capturadas previamente*; nunca autoriza nuevas capturas.

La autoridad de elegibilidad, validación de selección, prioridad y persistencia es Supabase. El cliente no infiere permisos por un timestamp o por un estado cacheado.

## 4. Política temporal V3 — decisiones congeladas

En una solicitud de inicio evaluada con tiempo servidor `server_now`:
1. Solo se permite iniciar **antes de HH:57:00**; HH:56:59.999 aún está dentro del horario de solicitud, HH:57:00 ya está bloqueado.
2. Es imprescindible que `capture_end - server_now >= 180 segundos`. La hora de servidor y el vencimiento calculado se validan transaccionalmente en V7; un clic anterior a HH:57 no reserva permiso si llega después del límite.
3. Se calcula:
   - `hour_end = siguiente HH:00` local, estrictamente posterior a `server_now`.
   - `stock_end = snapshot.capturado_at + 2 horas`.
   - `shift_end = fin del turno del inicio`.
   - `capture_end = min(hour_end, stock_end, shift_end)`.
   - `pending_delivery_until = capture_end + 2 horas`.
4. Una sesión existente puede capturar hasta su `capture_end` exclusivo aunque el reloj supere HH:57, salvo vencimiento anterior por stock o turno.
5. Al alcanzar `capture_end` se bloquea toda nueva captura; los borradores con `contado_at` original en `[session_started_at, capture_end)` pueden seguir entregándose hasta `pending_delivery_until`, según autorización de V7.
6. No se extiende ni reinicia una sesión por llegada de snapshot nuevo. La referencia, revisión, grupos, valores y contexto de la sesión permanecen congelados.
7. No se inicia automáticamente una sesión al terminar otra; el cajero vuelve a Inicio y ejecuta un `start` explícito sujeto a la política vigente.
8. Sin cron nuevo: el frontend reacciona al límite en su reloj confiable y el backend normaliza estados de forma autoritativa en solicitudes/operaciones. Una pestaña suspendida o cerrada no puede garantizar envío físico a HH:00.

**Ejemplo:** snapshot capturado 10:59:30, inicio 12:30:00 con respaldo; la captura vence a 12:59:30 por stock y la entrega puede continuar hasta 14:59:30.

### 4.1. Persistencia por sesión y compatibilidad V2

- Reutilizar `inventario.conteos` y `inventario.full_session_windows`; la versión temporal de **sesión** será `full_session_windows.policy_version = 3`, sin tocar `inventario.full_settings.policy_version = 2` (restricción global existente).
- Mantener para V3 `reference_snapshot_id`, `reference_captured_at`, `capture_interval_number` (dominio 1/2), `capture_interval_starts_at`, `capture_interval_ends_at`, `session_expires_at` y `pending_delivery_until`, con límites coherentes y respetando las restricciones reales de tabla.
- En V3 `capture_interval_ends_at` representa el límite horario para la ventana; `session_expires_at` refleja el menor límite aplicable. `capture_interval_starts_at` debe ser estrictamente anterior a `session_expires_at`. Conservar la semántica observable de dos horas de stock y dos intervalos máximos por snapshot.
- `conteos.expira_at` y `full_session_windows.session_expires_at` deben coincidir.
- No convertir sesiones V2 a V3, no recalcular sus tiempos ni modificar sus replays. Las sesiones ya creadas conservan sus valores y comportamiento de expiración/recovery.
- La función temporal V3 podrá ser nueva/versionada; no introducir efectos retroactivos en `full_window_v1` ni otros consumidores V2.
- El `capture_interval_number` no representa el número del ciclo del día ni la ronda quincenal de cobertura; mantener esos conceptos separados.

## 5. Selección y experiencia de inicio

1. Al entrar en Cajero/Inicio sin sesión activa, consultar V6 bajo demanda y recibir una sola referencia de snapshot elegible/ofrecida por backend, no el historial para elegir localmente.
2. **`new` autorizado:** inicio directo sin modal de respaldo.
3. **`fallback` autorizado:** modal «Inventario no actualizado disponible» con dos acciones: «Esperar 30 segundos (Recomendado)» y «Utilizar inventario válido».
4. «Esperar 30 segundos» es voluntario. Al completar la espera, realizar **una** nueva consulta V6. Puede elegirse nuevamente esperar o utilizar respaldo aún válido; no sondeo continuo, no nueva operación V7 durante la espera.
5. Si la pestaña queda suspendida, el plazo se mide como tiempo transcurrido, no por número de ticks de intervalos; al reanudar se consulta y se revalida.
6. Si respaldo expiró, cambió la estructura, hay sesión activa, ya pasó HH:57, falta el margen de 180 s o falta autorización, deshabilitar `start` y mostrar motivo. Ningún modal o espera relaja la autoridad de V7.
7. Si `new` existe pero no es elegible por estructura, no retroceder silenciosamente a un snapshot anterior.
8. Durante HH:57–HH:00 pueden llegar snapshots; no habilitan nuevos inicios de ese ciclo. Al comenzar el nuevo ciclo, recalcular la generación esperada y consultar V6.
9. Un fallo de red, V6 fallido o reloj no confiable no concede elegibilidad offline.
10. Sustituir la lógica y el polling de 8 s de `full.start-gate.ts` / `full.app.tsx`. Mantener refrescos necesarios para reanudación, envío pendiente, autenticación y KPI quincenal; no convertir el nuevo modal en un polling permanente.

## 6. Contrato backend objetivo (no desplegado)

Se preservan las RPC públicas:
- `public.rpc_solog_cashier_bootstrap_v6(p_payload jsonb)` para lectura autoritativa.
- `public.rpc_solog_cashier_mutate_v7(p_action text, p_payload jsonb)` para `start`, `save_batch`, `recount_save_batch` y `finish`.

No introducir una API paralela para el inicio. Extensiones aditivas compatibles con clientes antiguos hasta la activación correspondiente.

### 6.1. V6: objeto `data.start_offer` (nuevo)

Estructura normativa de la **propuesta objetivo**:

```ts
type CashierStartOfferV3 = {
  policy_version: 3;
  cycle_started_at: string; // ISO 8601 UTC; inicio HH:59 de generación esperada
  status: "new" | "fallback" | "unavailable";
  snapshot_id: string | null; // UUID; null cuando no hay referencia ofrecible
  requires_confirmation: boolean; // true para fallback autorizado
  can_start: boolean;
  capture_ends_at: string | null; // ISO UTC, según servidor; orientativo hasta V7
  block_reason: string | null; // código funcional o null
};
```

- `data.stock` y `data.capabilities` legacy se mantienen; `data.start_offer` es la nueva fuente de verdad de la UX temporal Full V3. `stock.is_fallback` conserva su semántica legacy.
- Si `status="new"` o `"fallback"` y `can_start=true`, `snapshot_id` es UUID válido; `requires_confirmation` es verdadero solo en el respaldo. Si `status="unavailable"`, `can_start=false`.
- `capture_ends_at` es una proyección informativa evaluada al consultar. V7 la recalcula y revalida transaccionalmente.
- El umbral de generación es absoluto, en UTC serializado, calculado usando la hora local de Lima y el ciclo pertinente.
- V6 también informa la indisponibilidad por sesión activa, permisos, stock, estructura, fin de ventana y plazo insuficiente. La prioridad de causa visible debe ser determinista y no esconder restricciones de autorización.

### 6.2. V7: payload nuevo para `start`

```ts
type CashierStartV3 = {
  operation_id: string; // UUID, persistido antes de envío
  device_token: string;
  expected_snapshot_id: string; // UUID ofrecido por V6
  expected_cycle_started_at: string; // ISO UTC de ciclo ofrecido
  selected_as: "new" | "fallback"; // modalidad que el usuario aceptó
};
```

- Autorizar primero usuario, dispositivo y sede; la sede no la elige libremente el cliente.
- Reconciliar el UUID y fingerprint existentes antes de aplicar restricciones *nuevas* del reloj a replays ya confirmados.
- Bloquear nuevas sesiones si hay otra activa o si la propia recovery no está finalizada/conciliada conforme al contrato seguro existente. No depender solo de un flag visual.
- Recalcular bajo bloqueo transaccional por sede el snapshot más reciente, la generación, la clasificación, el tiempo disponible y las restricciones estructurales.
- Exigir coincidencia exacta del `expected_snapshot_id`, `expected_cycle_started_at` y `selected_as` ofrecidos. No sustituir la selección silenciosamente. Rechazo sin crear sesión si no coinciden.
- Al aceptar, insertar `conteos`, ventana V3 y runtime congelado dentro de una única transacción. Conservar las reservas de reconteo y las reglas de prioridad existentes.
- Un V7 `start` legítimo anterior al despliegue sin los nuevos campos solo puede admitirse por la vía de compatibilidad durante la transición; no queda habilitada permanentemente una forma de eludir V3.
- Un `start` antiguo ya aplicado siempre puede conciliarse por replay exacto. Un `start` antiguo incierto jamás se transforma automáticamente en un UUID nuevo.
- `save_batch`, `recount_save_batch` y `finish` mantienen sus payloads y garantías, salvo los códigos/diagnósticos aditivos indicados en este delta.

### 6.3. Errores objetivo y manejo de cliente

| Código | Naturaleza | Acción permitida |
|---|---|---|
| `START_WINDOW_CLOSED` | Rechazo definitivo de ese inicio | Esperar siguiente hora; no reusar como intento nuevo |
| `START_CAPTURE_TOO_SHORT` | Rechazo definitivo de ese inicio | Esperar condición válida |
| `SNAPSHOT_SELECTION_CHANGED` | Selección obsoleta, sin sesión creada | Refrescar V6 y volver a elegir |
| `STRUCTURE_SNAPSHOT_REQUIRED` | No existe snapshot compatible | Esperar nueva referencia |
| `TEMPORARILY_UNAVAILABLE` | Transitorio o resultado incierto | Reintento con mismo UUID y payload |
| `IDEMPOTENCY_CONFLICT` | Identidad de operación incompatible | Bloquear, investigar; no descartar sin garantía |
| `NORMAL_COUNT_ALREADY_IN_SHIFT` | Conteo normal duplicado | Resolver conflicto B5 |
| `NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT` | Prohibición por inconsistencia | Respetar regla del Motor, no tratar como simple duplicado |

- Distinguir en backend las dos causas que hoy se agrupan como `NORMAL_COUNT_ALREADY_IN_SHIFT`, sin alterar sus reglas de validación.
- Extender el schema JSON remoto de `inventario.full_contracts` para solicitudes/respuestas/códigos nuevos. La versión `contract_version` del sobre público y un posible ajuste de esquema se resuelven como compatibilidad aditiva; **no usar `policy_version=3` como si fuera versión de wire o de Full global**.
- Para rechazos no aplicados, la respuesta debe distinguir `action_required` de refrescar oferta, esperar, conciliar o resolver manualmente; no presentar un cambio de selección como error interno/retryable de red.
- No preparar ni descartar una operación nueva mientras exista resultado incierto de la anterior. Cualquier eliminación de `start` rechazado exige prueba autoritativa de que no creó sesión.

## 7. Recovery, conteos y reconteos: deltas B4–B5

### 7.1. Reserva de reconteo B4

Conservar `inventario.full_recount_reservations` durante la transición `activo → recovery`; no liberar por el mero hecho de salir del estado `activo`.

| Evento | Tratamiento de reserva |
|---|---|
| Sesión activa | Conservar |
| Sesión en recovery no vencida | Conservar |
| Reconteo confirmado | Liberar ese detalle |
| Sesión finalizada | Liberar reservas restantes |
| Sesión expirada definitivamente | Liberar reservas restantes |

La normalización bajo demanda liberará reservas vencidas antes de asignarlas a otra sesión, con concurrencia controlada. No modificar el ciclo de limpieza de sesiones legacy. Mantener unicidad por `detail_id`, sin reservas duplicadas.

### 7.2. Duplicado de conteo normal B5 — alternativa A aprobada

- Sigue existiendo **un único conteo normal oficial por grupo y turno**; la primera observación confirmada autoritativamente por Supabase conserva efecto operativo. No usar el timestamp de borrador para sobrescribir la confirmación previa.
- Una observación tardía conflictiva no modifica el conteo confirmado, stock teórico, cobertura ni prioridades del Motor. Se conserva su evidencia local para resolución segura.
- No registrar automáticamente como observación histórica remota ni dar por confirmado un rechazo.
- Ante rechazo de `save_batch` o `recount_save_batch` por un ítem, respetar atomicidad: el batch rechazado sin efectos no confirma ninguno de sus elementos. Los batches anteriores confirmados conservan sus receipts.
- Backend debe identificar cuando sea posible **de forma determinista** el ítem responsable mediante `errors[].field_path` con índice de `p_payload.items`; preservar ese diagnóstico para replay exacto de un mismo `operation_id`. No inferir índice desde el frontend.
- Solo después de verificar rechazo definitivo *sin efectos* podrán apartarse ítems conflictivos y volver a preparar los válidos con UUID de operación nuevo, conservando sus identidades originales de observación y timestamps, cuando sigan elegibles.
- Si el rechazo no puede atribuirse con certeza, o existe resultado incierto, preservar operación original, bloquear reconstrucción automática del batch y requerir revisión manual.
- Resolver/descarte del elemento conflictivo requiere confirmación humana y prueba de no aplicación. Conservar constancia diagnóstica local, sin afirmar archivo oficial remoto.
- No ejecutar `finish` ni `client_queue_empty=true` con drafts, rechazados o inciertos de esa sesión sin resolver. Si vence el plazo de recuperación, conservar evidencia local y mostrar que la sesión no pudo finalizar correctamente.

### 7.3. Protocolo de envío que permanece vigente

- Una única orquestación Full. `Continuar` conserva draft local; `Registrar conteo` envía bajo demanda.
- Envío normal `save_batch` antes de `recount_save_batch`, máximo 500 ítems, separados por sesión y tipo. Refrescar autoridad/prioridad después de lotes.
- Cada operación tiene UUID y payload inmutables en el journal `solog.full2` antes de enviarse. Ante timeout repetir operación exacta, sin regenerar IDs ni timestamps.
- Receipts confirmados se persisten antes de retirar borradores. `finish` comprueba manifiesto exacto y solo ocurre cuando la cola completa está resuelta.
- El vencimiento bloquea nuevas capturas, no envíos válidos pendientes. Se conserva retry al reconectar/volver a foco y control de suspensión.
- La falta de red o navegador cerrado impide prometer envío/cierre en HH:00. La recuperación no se traslada a otra sesión.

## 8. Activación y compatibilidad de producción

- `master` utiliza actualmente rutas legacy de Cajero V3 (`rpc_solog_cashier_bootstrap_v3` / `rpc_solog_cashier_mutate_v3`), mientras `admin-work` utiliza Full V6/V7. **No confundir RPC legacy V3 con política temporal Full V3**.
- Desplegar el backend **aditivamente**, sin retirar RPC legacy ni modificar sus contratos. Evitar que una alteración interna afecte indirectamente otros consumidores.
- Incorporar una configuración de activación separada (concepto `cashier_v3_required`, nombre/ubicación física sujetos al diseño técnico): inicialmente inactiva para compatibilidad, luego activada solo tras validar Preview y plan de publicación.
- Durante transición, un consumidor Full antiguo puede usar el contrato anterior según política vigente. Los replays de operaciones/sesiones V2 confirmadas permanecen válidos aun tras la activación. Tras activarse V3, ningún `start` nuevo por payload antiguo puede saltarse las reglas.
- No bloquear de forma inadvertida el Cajero legacy de `master` por activación de la política de Full. No alterar `full_settings.policy_version`.
- Un rollback de exigencia de protocolo debe preservar ventanas V3 ya creadas; nunca convertir sus tiempos o aceptar capturas posteriores.
- Antes de activar, validar contratos en backend, autorizaciones, compatibilidad con clientes existentes, convivencia de sesiones V2/V3 y funcionamiento de `master`. No usar datos reales destructivos para pruebas.

## 9. Casos límite y criterios de aceptación

| Caso | Resultado esperado |
|---|---|
| `HH:56:59.999` con margen >=180 s y elegibilidad | Inicio admisible |
| `HH:57:00.000` | Nuevo inicio rechazado |
| `HH:00:00.000` | Sesión del ciclo previo sin permiso de captura; solo entrega en su ventana |
| Inicio a `12:00` con snapshot capturado `11:59:30` | Generación nueva del ciclo 12:00 |
| Inicio a `12:00` con snapshot capturado `10:59:30` | Respaldo válido solo con aceptación explícita |
| Confirmación anterior a HH:00 de snapshot capturado desde HH:59 | Cuenta como generación nueva al entrar en ciclo siguiente |
| Confirmación tardía de captura anterior al umbral | No se convierte artificialmente en generación nueva |
| Stock vence antes de HH:00 | Cierre por stock; mínimo 180 s para iniciar |
| Turnos `00:00`, `08:00`, `16:00` | Fin de turno reduce ventana si es anterior |
| Cambio de referencia entre V6 y V7 | Conflicto, refresco, nunca sustitución silenciosa |
| Cambio de ciclo entre modal y V7 | Oferta antigua rechazada; nueva selección |
| Espera repetida de 30 s | Una V6 por espera completada; sin polling permanente |
| Reloj no confiable / tab suspendida | No iniciar localmente; al recuperar recalcular y V7 valida |
| Reintento de start ya aplicado con mismo UUID/payload | Replay exacto sin nueva sesión |
| Start nuevo con formato antiguo tras exigir V3 | Rechazo controlado; no elusión |
| Sesión V2 histórica | Sus fechas persistidas no cambian |
| Nuevo snapshot llega durante sesión activa | Referencia/grupos congelados |
| Sesión entra en recovery con reconteo | Reserva conservada |
| Conteo duplicado en turno, enviado tarde | No sobrescribe oficial; evidencia local y resolución segura |
| Lote parcialmente elegible con un conflicto | No inventar éxito; aislar solo después de rechazo autoritativo |
| Navegador cerrado / red perdida | Sin promesa de autocierre inmediato; recuperación al volver |
| `pending_delivery_until` alcanzado | No nuevos envíos; conservar evidencia no entregable |
| Legacy en `master` | RPC/flujo original sin regresión |

Verificaciones de implementación, cuando se autoricen: tests temporales dirigidos, pruebas de replay con journal preexistente, integridad de reservaciones, carrera V6→snapshot→V7, atomicidad de batch y errores/field_path, concurrencia por sede, pruebas sintéticas backend, lint/typecheck/build/diff-check y smoke humano. **No declarar nada validado por este documento.**

## 10. Secuencia de ejecución y responsabilidades

1. **Congelación funcional:** este documento (aprobado).
2. **Diseño técnico backend:** ChatGPT define función temporal V3, migraciones mínimas, schema JSON, serialización, códigos y activación. Resolver contrato desplegable, sin cambiar decisiones funcionales.
3. **Implementar/validar backend:** ChatGPT despliega en Supabase cuando el usuario lo autorice; verifica comportamiento sintético y compatibilidad real, especialmente legacy y replay. Si surge incompatibilidad funcional, detener y solicitar aprobación del cambio mínimo.
4. **Congelar contrato backend desplegado:** evidencia de funciones, campos, errores y configuración realmente activos, sin suponer que un diseño ya está desplegado.
5. **Baseline y plan frontend:** Codex inspecciona `admin-work` y propone fases; sin implementar hasta aprobación del usuario. **Codex no modifica backend** salvo instrucción explícita del usuario. Si necesita backend, informar bloqueo y devolverlo a ChatGPT.
6. **Implementación frontend por fases y revisión global proporcional**, smoke operativo humano, cierre explícito.

No realizar refactors generales, no alterar cambios preexistentes y no preparar frontend dependiente contra contratos backend supuestos.

## 11. Estado de avance y restricciones de congelación

**Aprobado y congelado:** comportamiento funcional de hora exacta, límite HH:57, margen 180 s, generación HH:59, espera voluntaria 30 s, respaldo informado, selección autoritativa, dos horas de entrega, sin cron, idempotencia y recuperación Full, B4 reservas en recovery y B5 alternativa A (un conteo normal oficial por grupo/turno con rechazo seguro del duplicado), preservación de legacy y transición compatible.

**Pendiente técnico (NO implementado):** escoger DDL exacto, versión y mecanismo de activación de contrato, detalles del almacenamiento de diagnósticos y sus campos nulos/errores exactos, probar compatibilidad de esquemas, preparar y validar despliegue backend; luego baseline/plan e implementación frontend. Esos detalles **no** otorgan permiso para alterar el comportamiento funcional congelado.

**No congelado por este documento:** diseño concreto de migrations/backend desplegado, plan de Codex ni validaciones de código. No confundir «congelación funcional» con «backend implementado», «frontend integrado» o «bloque cerrado».
