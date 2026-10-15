# SOLOG — Backend Dashboard: Fase 5 Actividad por turno — Reporte V1

| Campo | Resultado |
|---|---|
| **Estado** | **IMPLEMENTADA Y VALIDADA TÉCNICAMENTE**; pendiente primer smoke operacional V5/ConeXion, primer turno real con tareas y validación de jobs de frontera |
| **Clasificación** | Nivel C — backend, acumulador de identidad y eventos operativos |
| **Fecha** | 2026-10-15, America/Lima |
| **Proyecto** | Supabase `fvtohxvcvsflzmftgfzs` |
| **Rama documental** | GitHub `Jack-Mnt/SOLOG`, `admin-work`. No se modificó `master` |
| **Fuente funcional primaria** | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` (congelada) |
| **Delta prevalente en Actividad** | `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` (congelado, §4), prevalece sobre cualquier texto anterior incompatible |
| **Referencia técnica** | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md`; contratos públicos de Dashboard aún propuestos, sin RPC `metrics_dashboard_v1` |
| **Fuera de alcance** | Cambios en cuerpos/firmas V4/V5, ConeXion V2, Rondas/Diferencias/Episodios, catálogo productivo, nuevas tablas de eventos, frontend y RPC Dashboard |

## 1. Migraciones remotas y archivos ejecutables

Las ocho migraciones se aplicaron a Supabase principal en este orden. Los archivos SQL son la **fuente ejecutable de lo desplegado**; los cambios correctivos prevalecen para la función específica sin reemplazar el resto.

| Versión | Migración aplicada | Fuente SQL en `docs/` |
|---|---|---|
| `20261015144506` | `solog_dashboard_fase5_actividad_helpers_sesion_v1` | `SOLOG_Backend_Actividad_Fase5_Helpers_Sesion_V1.sql` |
| `20261015144712` | `solog_dashboard_fase5_hooks_runtime_fisica_v1` | `SOLOG_Backend_Actividad_Fase5_Hooks_Runtime_V1.sql` |
| `20261015145201` | `solog_dashboard_fase5_actividad_sin_sesion_v1` | `SOLOG_Backend_Actividad_Fase5_Sin_Sesion_V1.sql` |
| `20261015145419` | `solog_dashboard_fase5_cierre_retiro_actividad_v1` | `SOLOG_Backend_Actividad_Fase5_Cierre_Retiros_V1.sql` |
| `20261015150021` | `solog_dashboard_fase5_actividad_cron_cierre_v1` | `SOLOG_Backend_Actividad_Fase5_Cron_Cierre_V1.sql` |
| `20261015150244` | `solog_dashboard_fase5_actividad_limites_autorizacion_v1` | `SOLOG_Backend_Actividad_Fase5_Fronteras_Autorizacion_V1.sql` |
| `20261015150631` | `solog_dashboard_fase5_claves_utc_preservar_inicio_v1` | `SOLOG_Backend_Actividad_Fase5_Claves_UTC_Idempotencia_V1.sql` |
| `20261015150909` | `solog_dashboard_fase5_actividad_completar_eficiente_v1` | `SOLOG_Backend_Actividad_Fase5_Completar_Eficiente_V1.sql` |

## 2. Persistencia, identidades y autoridad

Única fuente persistente: `inventario.metrics_actividad_turnos`, creada en Fase 1. PK `(sede_id,turno_desde)`, `turno_hasta`, `turno`, `tareas_habilitadas`, `tareas_completadas`, `tareas_retiradas`, prioridad y cuatro colas diagnósticas, `calidad`, estado de cierre y marcas temporales.

No se han añadido tablas de actividad individual ni contadores de N/D autoritativos.

**Identidad compacta:**
- Cobertura: `coverage:<ronda_desde_utc>:<grupo_uuid>:<generacion>`, donde el inicio UTC es canónico `YYYY-MM-DDTHH:MM:SSZ`.
- Diario: `daily:<turno_desde_utc>:<grupo_uuid>`.
- Reconteo: `recount:<conteo_detalle_uuid>`, **sin clase de prioridad en su identidad**.
- Excepción conservadora si falta generación de ronda pero el Motor ya autorizó cobertura: `:unversioned:<fingerprint>` para sesiones o `:unversioned` fuera de sesión. La fila se califica `partial`; no se inventa una generación oficial.

`metrics_actividad_acumular_v1` une identidades por claves con `jsonb`, y preserva **los primeros valores persistidos** ante una reevaluación o replay; en particular, no sobrescribe `habilitada_at` ni `clase_v4_ejecutada`. N/D/% se obtienen exclusivamente mediante `metrics_actividad_resumen_v1`:

- `D` = habilitadas menos retiradas legítimas.
- `N` = completadas existentes en habilitadas menos retiradas.
- `D=0` ⇒ `porcentaje=NULL` y UI «Sin tareas».
- Una completada fuera de habilitadas se rechaza transaccionalmente.

**Atribución temporal:** `conteos.turno_desde/turno_hasta` de la **sesión autorizante**, aunque `contado_at` o `recontado_at` pertenezca físicamente al turno siguiente. Ninguna modificación a la hora física de Rondas, Episodios o Drawer.

## 3. Instrumentación efectiva del Motor V5, sin reemplazar la RPC

Se registran prioridades reales existentes: `round_coverage → review_for_coverage → review_regular → shift_coverage → none`.

- **Inicio de sesión:** trigger `AFTER INSERT ... REFERENCING NEW TABLE` sobre `solog_session_runtime_groups`. Al terminar el `INSERT ... SELECT` V5, captura **todas las identidades** con prioridad máxima activa; no deduce acciones de contadores teóricos de catálogo.
- **Lote normal:** trigger `AFTER INSERT` de `conteo_detalle`. Lee acción, clase V4/V5 y runtime **antes** del `UPDATE` de V5 que los convierte en `none`. Guarda evidencia física, clase ejecutada y pertenencia al turno de sesión.
- **Reconteo:** trigger `AFTER UPDATE OF recontado_at` de `conteo_detalle` cuando se aceptó reconteo físico. Un reconteo actualiza la misma fila original, pero se registra como **una tarea nueva distinta** de cobertura/diario, con identidad `recount:<detalle_uuid>`.
- **Prioridad descendente:** trigger `AFTER UPDATE OF accion,priority_class` de runtime captura la próxima clase que se vuelve ejecutable; **si la prioridad no cambió**, actualiza contadores de cola sin recorrer y reescribir nuevamente todas las identidades.
- **Cierre/expiración:** trigger `BEFORE UPDATE OF estado` en `conteos` aprovecha runtime antes de su limpieza terminal. Trigger `AFTER` evalúa oportunidades sin sesión cuando dejan de estar bloqueadas.
- **Optimización dirigida** (última migración): en cada física, registrar **solo la tarea ejecutada** sin reenumerar el runtime entero; la captura exhaustiva permanece en inicio/cambio de prioridad. Revalidado con inserción física normal sintética.

Las funciones analíticas no realizan `INSERT/UPDATE` en `conteos`, `conteo_detalle` ni `solog_session_runtime_groups`; las escrituras analíticas quedan dentro de la transacción que confirma el hecho.

## 4. Habilitación sin sesión real

`metrics_actividad_sin_sesion_v1(sede,ahora)` verifica el **gate efectivo de inicio de V5**, sin abrir una sesión y sin llamar a `solog_session_capability_v4` (esa función puede normalizar sesiones mediante escrituras):

1. Sede activa, existencia de al menos un cajero activo y al menos un dispositivo autorizado de esa sede.
2. Ausencia de sesión `activo` todavía vigente que bloquearía nuevo `start` (las expiradas pasan a `recovery` bajo V5).
3. Último snapshot confirmado, no caducado y con margen de **cinco minutos antes de expirar**; `solog_sesion_expira_at` aún permite abrir sesión.
4. Existencia de grupos operativos activos y snapshot completo para el universo que V5 validaría en `start`.
5. Acciones y clasificación mediante **`solog_cashier_group_actions_v4` + `solog_priority_classify_v4` + `solog_priority_resolve_v4`**, no fórmulas propias del Dashboard.

Solo se incorporan tareas de la **clase efectivamente máxima**. Los grupos bloqueados esperando snapshot posterior, con otra prioridad vigente o por incompletitud no se registran. Si hay gate válido y ninguna tarea, la celda puede representar «Sin tareas»; con gate imposible y sin evidencia no se presenta ese cero como medición.

Puntos de reevaluación sin sesión:
- **última actualización de acceso de instalación ConeXion** (`AFTER UPDATE OF ultimo_acceso_at`): sucede después de aplicar el snapshot y los grupos operativos en la RPC V2;
- cierre/expiración/recovery de la sesión;
- autorización de un nuevo dispositivo o transición a estado `autorizado`;
- inicio exacto de turnos y sondeo horario mediante Cron.

Se acepta la limitación funcional congelada: no se reconstruyen exhaustivamente exclusiones históricas raras; tampoco se rellenan turnos anteriores sin evidencia. El acceso potencial se comprueba a nivel de sede/cajero activo y dispositivo autorizado, **no** una supuesta identidad de usuario/dispositivo específica sin contexto autenticado.

## 5. Retirada estructural y cierre temporal

El trigger `trg_metrics_actividad_retiro_estructura_v1` observa un retiro inequívoco de obligación exigible en `metrics_ronda_obligaciones` (vigencia `NULL → fecha`), marca la clave de cobertura habilitada en `tareas_retiradas` con motivo `structural_invalidated`, y el helper de resumen descuenta correctamente de N y D. Una retirada no borra metadatos históricos. **No** retira tareas por un descenso de prioridad global: aquello es bloqueo temporal, no invalidación legítima.

`metrics_actividad_cerrar_pendientes_v1(as_of)`:
- Registra nuevas habilitaciones sin sesión cuando pasa el gate a la hora real.
- Cierra provisionalmente los turnos con `turno_hasta<=as_of`.
- Finaliza turnos transcurridas al menos cuatro horas desde el límite y sin sesiones de ese turno aún recuperables.
- Una entrega tardía permitida puede agregar evidencias al **turno original** y devolverlo a `cerrado_provisional` para consolidarlo de nuevo, sin duplicar la identidad.

## 6. Jobs Cron desplegados

| ID | Job | Schedule UTC | Horario Lima | Ejecución comprobada |
|---|---|---|---|---|
| 8 | `metrics_actividad_turnos_cierre` | `6 * * * *` | cada hora, minuto 06 | **Sí: 15-10-2026 10:06 Lima, `succeeded`** |
| 9 | `metrics_actividad_inicio_early` | `0 5 * * *` | 12:00 a. m. | No, primer ciclo futuro |
| 10 | `metrics_actividad_inicio_day` | `30 12 * * *` | 7:30 a. m. | No, primer ciclo futuro |
| 11 | `metrics_actividad_inicio_night` | `30 20 * * *` | 3:30 p. m. | No, primer ciclo futuro |

Cada job invoca **la misma función interna**, de modo que el solapamiento es idempotente y no crea tablas de cron ni nuevas fuentes de prioridad. Los jobs `metrics_calibracion_c24_6h`, `metrics_rondas_cierre_recuperable` y los Cron anteriores se preservaron sin modificación.

La primera ejecución automática de `metrics_actividad_turnos_cierre` consta en `cron.job_run_details`: `start_time=2026-10-15 15:06:00.068234+00`, `end_time=2026-10-15 15:06:00.081264+00`, `status=succeeded`. Es una ejecución sin actividad nueva, **no una medición de rendimiento general con trabajo real**.

## 7. Evidencia de validación dirigida

| Caso | Resultado |
|---|---|
| Acumulador 34/39 = 87,2 % y replay no duplica | **PASA** |
| Runtime de sesión sintética: 2 habilitadas de cobertura, luego diaria al consumir la última | **PASA** |
| Prioridad idéntica tras consumir primera tarea no reinicia acumulado | **PASA** |
| Inserción de física normal bajo guardas/triggers reales existentes: N/D = 1/1 | **PASA** |
| Reconteo con actualización física real de `conteo_detalle` en transacción revertida: N/D = 1/1, identidad `recount:<id>` | **PASA** |
| Pasar runtime a `none` después de normal/reconteo conserva completada | **PASA** |
| Snapshot caducado o sin autorización: no habilitar nada en cinco sedes | **PASA** |
| Snapshot sintético vigente/completo con cajero y dispositivo de Cutervo: habilita tareas | **PASA** |
| Reevaluar lo mismo sin sesión: no duplica identidad | **PASA** |
| Retirar obligación estructural válida: excluye de N/D, porcentaje N/D cuando D=0 | **PASA** |
| Turno anterior cerrado y nueva entrega tardía: modifica fila original, estado provisional, idempotente | **PASA** |
| Claves UTC 00:00 Lima / 05:00 UTC: producen clave textual idéntica | **PASA** |
| Repetir habilitación con timestamp diferente: se conserva primero | **PASA** |
| Optimización sin barrido por física: prueba normal de N/D 1/1 post-migración | **PASA** |
| Primer job horario desde pg_cron | **`succeeded` verificado** |
| Scripts de prueba rollback: actividad 0 filas, runtime 0, conteo_detalle sigue en 1399 | **PASA** |
| Cron de inicio en fronteras, primer snapshot real nuevo desde ConeXion, sesión V5 real | **PENDIENTE DE SMOKE** |

Los ensayos con datos sintéticos y actualizaciones de reconteo antiguo se hicieron **dentro de bloques transaccionales que terminaron en rollback**; se verificó que no quedaron filas sintéticas. No se usó el backfill para hacer pasar conteos antiguos por tareas efectivamente habilitadas.

## 8. Auditoría, riesgos y aceptación

**Seguridad:** 16 funciones cuyo nombre empieza por `metrics_actividad_` presentes (incluye dos helpers de Fase 1); todas `SECURITY INVOKER`, sin `EXECUTE` directo para `anon`, `authenticated` ni `service_role`. Diez triggers nuevos activos; el acumulador mantiene RLS activado sin políticas ni permisos directos a clientes. Supabase advierte `rls_enabled_no_policy` sobre esta tabla, condición **intencional** de persistencia privada. El advisor de rendimiento no informó problemas específicos de `metrics_actividad` en la revisión.

**Calidad histórica:** no se calcularon tareas de turnos pasados sin registro de habilitación; el primer turno con captura iniciada después del límite queda `partial`, conforme a la disponibilidad de evidencia. No son ceros certificados. No se despliega todavía RPC para usuarios finales.

**Riesgos residuales:**
- No hay **smoke V5 real autorizado** con `start → save_batch → recount_save_batch → finish`, por falta de snapshot vigente/actividad real. Los tests reprodujeron las escrituras físicas y triggers en PostgreSQL con datos sintéticos revertidos; **no** ejecutaron íntegramente la RPC con usuario y token.
- Captura sin sesión en ambiente operativo real requiere primer snapshot vigente posterior al despliegue. El test positivo empleó un snapshot sintético transaccional revertido; no debe considerarse una sincronización ConeXion validada.
- Los tres jobs de frontera todavía no tienen una ejecución automática histórica; verificar tras su primer horario.
- Performance con lotes V5 de cientos de tareas, bloqueos concurrentes y egress no medidos end-to-end. Se redujo el trabajo por física y se evitaron refactors V5, pero no se declara un SLA.
- Cambios de autorización/revisión o catálogo poco frecuentes pueden requerir una evaluación adicional en un contexto operativo concreto; la limitación proporcional sobre históricos ya estaba congelada.
- **Fase siguiente (RPC Dashboard):** definir y validar los payloads y errores definitivos para `activity`, sin permitir lectura directa de `inventario`; frontend Codex solo después de contrato backend probado/desplegado.

## 9. Estado de cierre

**Fase 5 técnicamente validada para el alcance probado, con 8 migraciones aplicadas y Cron operativo.** Pendiente aceptación del usuario, smoke operativo V5 y ejecución de los jobs restantes. El bloque backend general sigue abierto; la Fase 6 es la RPC administrativa de lectura y seguridad.

Ninguna decisión funcional congelada se reinterpretó o rediseñó. Los SQL correctivos de claves UTC, primer registro y optimización son deltas de implementación, no nuevos requisitos.
