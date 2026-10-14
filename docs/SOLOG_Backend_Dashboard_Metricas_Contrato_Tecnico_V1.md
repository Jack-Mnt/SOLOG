# SOLOG — Backend Dashboard Admin: contrato técnico de métricas V1

| Campo | Valor |
|---|---|
| Estado | **CONTRATO TÉCNICO CONSOLIDADO — PROPUESTO, PENDIENTE DE APROBACIÓN TÉCNICA Y DESPLIEGUE** |
| Clasificación | Nivel C — persistencia, lógica, seguridad, RPC y Cron |
| Fecha | 2026-10-14 |
| Proyecto / rama | SOLOG / `admin-work` |
| Naturaleza | Diseño técnico y preflight de solo lectura; **ninguna operación DDL/DML desplegada** |
| Base funcional | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` (**congelado**) |
| Delta funcional prevalente | `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` (**congelado**) |
| Contratos existentes protegidos | Motor V4, ConeXion↔Supabase V2, SOLOG Admin Control |
| Fuente de implementación backend propuesta | **Este contrato una vez aprobado**; hasta entonces es propuesta técnica, no contrato desplegado |
| Responsable backend | ChatGPT; Codex **no** modifica backend salvo autorización explícita |

## 0. Autoridad, delimitación y semántica de estados

Las decisiones funcionales **no** se rediseñan. En contradicción funcional, prevalece primero el delta congelado en el alcance que sustituye y luego el documento base. Este contrato solo desarrolla modelo físico, interfaces y puntos de integración, y **no sustituye los textos funcionales**. Los detalles que requieran una decisión nueva se identifican como **PENDIENTE / BLOQUEO**, no se implementan de manera implícita.

Objetivo: hacer viable una implementación backend transaccional, idempotente, segura y mensurable que, **tras validación y despliegue**, proporcione a la UI contratos estables. No modificar la firma, semántica de prioridad ni flujo operativo de las RPC V4 ni la entrada ConeXion V2. Instrumentación analítica con cambios mínimos de implementación en funciones existentes, si es imprescindible, requiere revisión dirigida previa de impacto; si implica cambiar una decisión funcional, detenerse.

## 1. Preflight real (14-10-2026)

**Ambiente inspeccionado:** proyecto Supabase `fvtohxvcvsflzmftgfzs`, PostgreSQL 17.6, `TimeZone=UTC`; región comercial de operación `America/Lima`. Conteos de lectura: cinco sedes, 987 filas de `catalogo`, 489 `grupos_conteo`, 1940 `stock_actual`, 57 `snapshots`, 1399 `conteo_detalle`, 87 sesiones `conteos`; `snapshot_stock` y `solog_session_runtime_groups` estaban vacías al momento de inspección. Las cantidades **no son supuestos del contrato**.

**Datos verificados:**

1. `public.rpc_conexion_sync_snapshot_strict_v2` usa bloqueo transaccional/advisory **por sede**; crea snapshot `procesando`, reconstruye íntegramente `snapshot_stock` para SKU válidos de la versión (incluidos ceros), sustituye/upserta `stock_actual`, confirma snapshot y llama `inventario.solog_evaluar_snapshot`, que ejecuta `solog_aplicar_snapshot_v4`. El cálculo comparativo analítico debe hacerse **después de reconstruir** `snapshot_stock` y **antes de actualizar** `stock_actual`, en la misma transacción.
2. `inventario.cleanup_snapshot_stock()` borra las filas con `capturado_at < now()-interval '12 hours'`. No depender de ese detalle para lecturas posteriores, backfills de Movimiento ni cierres históricos de Rondas.
3. `solog_cashier_group_actions_v4` clasifica cada grupo `coverage/recount/daily/none`; `solog_priority_resolve_v4` aplica `round_coverage → review_for_coverage → review_regular → shift_coverage → none`. `Recontar` exige `primer_snapshot_posterior_id` para ser accionable. `requiere_snapshot_completo` excluye del panel operativo pero no del universo administrativo de cobertura.
4. `public.rpc_solog_cashier_mutate_v4` crea `solog_session_runtime_groups` al `start` y cambia `accion/priority_class` a `none` al guardar observaciones. En `save_batch`, el conteo físico **inserta** `conteo_detalle`; en `recount_save_batch`, el reconteo **actualiza** ese detalle, usando `reconteo_conteo_id`, `stock_reconteo`, `recontado_at`. El cierre/expiración borra el runtime congelado. La analítica debe preservar clase/identidad **antes** de perderla.
5. `solog_temporal_context` calcula turnos Lima `early 00:00–07:30`, `day 07:30–15:30`, `night 15:30–00:00`. V4 puede admitir una sesión que atraviese 07:30/15:30; la atribución de **Actividad** será el turno congelado en `conteos`, y para episodios/Drawer/Rondas rige la hora física.
6. Las RPC Admin existentes validan `auth.uid()` contra `public.usuarios`, `activo` y rol `admin|moderador`, además de sede activa. Replicar este patrón; no basar autorización en metadata de usuario editable.
7. Existen Cron activos `conexion_cleanup_snapshot_stock` y `solog_cleanup_operations`. **Ningún Cron de métricas** está desplegado. Supabase Cron usa `pg_cron` 1.6.4; horarios deben definirse en UTC para respetar Lima.
8. **Dato legado real:** hay siete `conteo_detalle` con `estado_diferencia='Coincide'`, `stock_reconteo IS NULL` y diferencia física inicial distinta de cero; **no** son automáticamente evidencia de coincidencia física. Se exige validación física (`d0=0` para normal, `dr=0` para reconteo, o `Confirmada` física comparable), no fiarse solo de estado consolidado.

**No desplegado a la fecha del preflight:** ninguna tabla `metrics_*` y ninguna RPC del Dashboard nuevo. Se verificaron esquema/índices/triggers/funciones de origen; **no se han ejecutado pruebas de mutación de métricas**.

## 2. Inventario de persistencia aprobado y propuesto

**Esquema:** `inventario` privado, sin GRANT de lectura/escritura directa a `anon` o `authenticated`.

| Tabla nueva | Clave | Responsable | Persistencia |
|---|---|---|---|
| `metrics_movimiento_sku` | `(sede_id,c_interno)` | Cinco intervalos SKU, stock base, C24 vigente | Permanente |
| `metrics_calibracion_c24` | `(muestreo_at,sede_id,c_interno)` | Muestras para calibración C de noviembre | **Temporal/eliminable** |
| `metrics_diferencias` | `(sede_id,grupo_conteo_id)` | Último físico confirmado + obligación actual | Permanente |
| `metrics_episodios` | `episodio_id` + índices sede/grupo/fechas | Episodios físicos con apertura/cierre reales | Permanente |
| `metrics_rondas` | `(sede_id,ronda_desde)` | Cabecera, universo y hitos | Permanente |
| `metrics_ronda_obligaciones` | `(sede_id,ronda_desde,grupo_conteo_id,generacion)` | Obligaciones versionadas/acreditaciones/historia de composición | Permanente |
| `metrics_rondas_cortes` | `(sede_id,ronda_desde,version_corte)` | Foto binaria, cobertura, hitos, evidencias al cierre | Permanente |
| `metrics_actividad_turnos` | `(sede_id,turno_desde)` | Una fila acumuladora por turno, identidades compactas | Permanente |

**No crear:** `metrics_movimiento_intervalos`, `metrics_movimiento_detalle`, `metrics_movimiento_base_sku`, `metrics_turno_tareas`, `metrics_actividad_eventos` ni tablas de agregados diarios de episodios. En el corte de Rondas las identidades de grupos y evidencias se alojan en un documento `jsonb` del corte (de tamaño acotado a grupos de sede), evitando una novena tabla de detalle de corte. Este formato se valida por tamaño en pruebas.

### 2.1. Estructura SQL conceptual precisa: Movimiento

`metrics_movimiento_sku`:

- `sede_id uuid NOT NULL`, `c_interno integer NOT NULL`, `PRIMARY KEY(sede_id,c_interno)`.
- `variacion_stock integer[] NOT NULL DEFAULT '{}'`, `duracion_intervalo integer[] NOT NULL DEFAULT '{}'`; arreglos de longitud 0–5, **misma longitud**, valores absolutos no negativos y duraciones estrictamente positivas (segundos enteros).
- `ultimo_stock integer NULL`, `ultimo_snapshot_id uuid NULL`, `ultimo_capturado_at timestamptz NULL`; nulables juntos cuando la base está invalidada/ausente.
- `c24_sku numeric NULL`; NULL si insuficiente, nunca sustituido por cero.
- `estado_calidad text NOT NULL` (conceptos: `base`, `insuficiente`, `medido`, `invalidado`), `updated_at timestamptz NOT NULL`.
- FKs a sede/SKU solo si no interrumpen publicación/exclusión; definir `ON DELETE` tras verificar políticas de catálogo (no crear borrados en cascada sin necesidad).
- Check coherencia estado/base/arrays. Validación de **caducidad** dinámica en helper de lectura, porque un C24 materializado envejece sin escrituras.

**Algoritmo set-based dentro de transacción de ingesta:**

1. Bloquear sede/identificar snapshot anterior confirmado y captura nueva.
2. Con `snapshot_stock` completo y `stock_actual` anterior aún intacto, seleccionar SKU incluidos comparables en ambas capturas, excluyendo `producto_eliminado` o estados no comparables.
3. Si no existía base o el SKU se reincorporó: almacenar stock/timestamp/snapshot como base, arrays vacíos, `c24_sku=NULL`. No registrar Δ.
4. Para cada SKU comparable: `abs(stock_nuevo-stock_anterior)` y `extract(epoch from (captura_nueva - ultimo_capturado_at))::integer`; rechazar/aislar duraciones no positivas. Anexar valor y duración, reteniendo solo los últimos cinco, incluidos Δ=0.
5. Recalcular `c24_sku=24×sum(delta)/sum(duracion_segundos/3600)` **únicamente si** al menos tres intervalos íntegramente vigentes en ventana de siete días; caso contrario NULL/calidad insuficiente. Para determinar vigencia de intervalos, reconstruir sus límites retrospectivamente desde `ultimo_capturado_at` y las duraciones almacenadas. No aceptar intervalos anteriores al comienzo de `[now-7 días, now]`; usar **instante de consulta** para invalidación temporal. Se acepta el descarte de intervalos cruzando el límite; no prorratearlos.
6. Persistir `ultimo_stock`, snapshot y timestamp aunque Δ sea cero, una vez por snapshot nuevo. Un replay no anexa intervalo. Si llega snapshot no comparable, dejar trazabilidad de insuficiencia/reinicializar base según origen; **nunca** calcular movimiento ficticio contra un SKU excluido.
7. **Antes** del reemplazo de `stock_actual`, asegurar que se ha persistido toda la proyección nueva. Un fallo analítico aborta la misma transacción; no dejar snapshot confirmado con C24 parcial.

**Cambio administrativo de SKU `→ Excluido`:** invalidar inmediatamente la fila, limpiar base/arrays/C24. Reincorporación: fila nueva de base con siguiente captura válida. Cambio solo de `grupo_conteo_id`: no reiniciar SKU.

**Riesgo actual:** sumar `C24_sku` de SKU **actualmente incluidos** del grupo, con calidad `completa|parcial|insuficiente`, evitando comparaciones históricas de adscripción. Aplicar factor categórico **una vez al grupo** (≤10:1; >10–50:2; >50:4), luego `R=C×D×V`. Con suma parcial se permite clasificación calculada de los disponibles **etiquetada parcial** (potencial subestimación); si no hay C24 suficiente, imputar **C=1** y etiqueta de insuficiencia, no afirmar que C24=0 medido. La calidad se transmite en la RPC, sin nuevo KPI de movimiento.

### 2.2. Estructura SQL: calibración desacoplada

`metrics_calibracion_c24`:

- `muestreo_at timestamptz NOT NULL`, `sede_id uuid NOT NULL`, `c_interno integer NOT NULL`, `grupo_conteo_id uuid NULL`, `c24_sku numeric NULL`, `intervalos_validos smallint NOT NULL`, `calidad text NOT NULL`, `ultimo_capturado_at timestamptz NULL`, PK `(muestreo_at,sede_id,c_interno)`.
- El muestreo usa **C24 efectivo a muestreo_at**, aplicando la misma caducidad que la RPC. Se registra adscripción grupal de ese instante para reconstruir distribuciones **grupales** en noviembre.
- `inventario.metrics_calibracion_c24_tomar_muestra(p_at timestamptz)`: **lectura de `metrics_movimiento_sku` + catálogo**, escritura exclusiva en auxiliar; `ON CONFLICT DO NOTHING/UPSERT determinista` sin duplicar. No puede actualizar otras tablas. No requiere red pública ni Edge Function.
- Cron temporal propuesto **`metrics_calibracion_c24_6h`**: `5 5,11,17,23 * * *` UTC, equivalente a Lima 00:05/06:05/12:05/18:05. Las dos calibraciones previstas son inicios y mediados de noviembre 2026. Si no hay evidencia suficiente, conservar umbrales provisionales.
- Eliminación: terminar calibración y documentar umbrales/resultados; `cron.unschedule` por **nombre verificado**, eliminar solo `metrics_calibracion_c24_tomar_muestra` y `metrics_calibracion_c24`; comprobar que ningún objeto permanente dependa de ellos. **Nunca desactivar `pg_cron`** (borraría otros jobs). Ninguna RPC/producto depende de la auxiliar.

### 2.3. Estructura SQL: `metrics_diferencias`

Una fila por sede/grupo (incluidos grupos sin física comparable) con:

- Clave `(sede_id uuid,grupo_conteo_id uuid)`.
- `estado_confirmado text NULL` = `Coincide|Confirmada|NULL`; `diferencia_confirmada integer NULL` consolidada V4; `valor_diferencia_confirmada numeric NULL`, `observacion_confirmacion_id uuid NULL`, `origen_confirmacion text NULL` (`normal|recount`), `confirmado_fisico_at timestamptz NULL`.
- `stock_teorico_confirmacion integer NULL`, `stock_fisico_confirmacion integer NULL`, `precio_confirmacion numeric NULL` si hace falta para trazabilidad; `factor_v_riesgo smallint NULL` de **precio unitario vigente**.
- `validacion_tipo text NOT NULL` = `none|recontar|inconsistente|estructura` (**no** otro booleano `por_recontar` independiente); `validacion_observacion_id uuid NULL`, `comparable boolean NOT NULL`, `calidad text NOT NULL`, `updated_at`.
- Último resultado confirmado y obligación de validar son ejes **independientes**. No sobrescribir `Confirmada -8` por un `Recontar`; Amarillo de Precisión y -8 en Faltantes pueden coexistir. `Coincide` física posterior retira el monto. Exención solo si stocks confirmado teórico=0/físico=0.
- Detectar `Inconsistente` como obligación física concreta sin convertir en confirmación, aun si la nueva cuenta no es ejecutable hasta turno posterior. Clasificar sin evidencia ni obligación como `S`; `Inválido` estructural como no comparable, no cero.
- Actualizar desde hecho físico válido/reconciliación de catálogo/snapshot **por sede/grupo**, con orden por timestamp físico y desempate estable. Calcular valorizado con la función V4 y precios del caso, sin sustituir con precio actual. Cambio de precio solo actualiza V.
- Backfill físico inicial **excluye** los siete casos legados con `Coincide` consolidada y `d0≠0` sin `dr=0`, y otras resoluciones exclusivamente teóricas.

**Clasificación actual derivada:** para grupos elegibles: `Y` si validación activa; luego `Z` si confirmación física comparable 0/0; luego `G` si `Coincide`; `Rg` si `Confirmada`; resto `S`. `T=G+Y+Rg+Z+S`, `U=G+Y+Rg`, barra G/Y/Rg solo cuando U>0. Monetarios/riesgo usan **confirmación comparable subyacente** aunque el segmento sea Y. Nunca igualar `Rg` al número de faltantes+sobrantes.

### 2.4. Estructura SQL: `metrics_episodios`

- `episodio_id uuid PK`, `sede_id uuid NOT NULL`, `grupo_conteo_id uuid NOT NULL`, `apertura_at timestamptz NOT NULL`, `cierre_at timestamptz NULL`, `observacion_apertura_id uuid NOT NULL`, `observacion_cierre_id uuid NULL`, `ultima_observacion_at timestamptz NOT NULL`, `secuencia integer`, `operativamente_visible_desde timestamptz NULL`/calidad para reactivación.
- Índice/constraint de **a lo sumo un episodio físico abierto por sede+grupo**; las reaperturas posteriores a cierre crean fila nueva; la exclusión **nunca** escribe `cierre_at`. El campo de visibilidad evita reactivar un episodio antiguo como problema operativo sin nueva evidencia comparable.
- Las observaciones físicas `d0=stock_fisico-stock_teorico` y `dr=stock_reconteo-stock_teorico_reconteo`, por **hora física**, abren con primera diferencia no cero, no cierran por segundo d distinto de cero, cierran **únicamente** con física posterior d=0; un cierre y nueva apertura son episodios diferentes.
- Reconteos `Confirmada`, `Inconsistente` y cambio de signo no cierran. Excluir/inactivar solo afecta elegibilidad presente, no la secuencia física. Eventos tardíos/inválidos se reconcilian exclusivamente por sede+grupo a partir de hechos originales; idempotencia por observación física/ID.
- Recurrencia móvil 45 días: aperturas que tienen **anterior episodio cerrado físicamente antes de su apertura**; persistencia abierta sin truncar; importancia derivada `(recurrencia+1)*dias_abierto`. No guardar puntuación I ni agregados diarios adicionales.
- La distinción `operativamente_visible_desde` es **propuesta técnica** para no contabilizar tiempo de exclusión como continuidad operativa automática; en preflight de implementación se validará con caso concreto de reactivación sin alterar apertura/cierre físicos.

### 2.5. Estructura SQL: Rondas y cortes

**`metrics_rondas`:**
- PK `(sede_id,ronda_desde)`, columnas `ronda_hasta`, `periodo_desde/hasta`, `ronda smallint`, `estado abierta|cerrando|cerrada|sin_datos`, `total_exigibles`, `total_acreditadas`, `hito_50_at`, `hito_90_at`, `hito_100_at`, `created_at/updated_at/cerrado_at`.
- Hitos **primeros** e inmutables; un cambio de estructura puede bajar porcentaje sin borrar hitos. Ronda abierta responde a altas/bajas; cerrar por **instante real `ronda_hasta`**, no al primer 100%.

**`metrics_ronda_obligaciones`:**
- PK `(sede_id,ronda_desde,grupo_conteo_id,generacion integer)`. Campos `vigente_desde`, `vigente_hasta` (intervalo de vigencia), `exigible`, `composicion_fingerprint` o códigos SKU incluidos ordenados + versión de estructura, `acreditada_at`, `observacion_id`, `tipo_observacion`, `turno_contribuyente`, `estado_calidad`.
- Versionar **solo cambios estructurales relevantes** del grupo; el stock normal no genera una nueva obligación. Grupo excluido/no contable sale del denominador abierto sin borrar historia de vigencias. Si cambia composición de manera incompatible, renovar obligación y requerir nueva primera acreditación conforme V4.
- Conservar el grupo/estructura exigible **a la hora de cierre** incluso si el job Cron ejecuta después. No inferirlo solo de `catalogo` actual.

**`metrics_rondas_cortes`:**
- PK `(sede_id,ronda_desde,version_corte smallint)`; `corte_at=ronda_hasta`, `generado_at`, `estado_corte valido|nd|corregido`, `motivo_calidad`; `h_g,h_r,h_z,h_s,h_t,h_u`; `cobertura_acreditadas,cobertura_exigibles`; `contribucion_turnos jsonb` (`early/day/night`); `hitos_at jsonb`; `evidencia_grupos jsonb` (grupo, elegibilidad/composición en corte, referencia de **última confirmación física comparable** o motivo sin evidencia, clasificación H_G/H_R/H_Z/H_S, primera acreditación y turno). No copiar el catálogo completo SKU por cada snapshot: una fotografía por ronda cerrada.
- Corte binario: ignorar `por_recontar`; `H_U=H_G+H_R`; `H_U=0` ⇒ porcentaje NULL/N/D. No tramo amarillo. Congelar totales al corte, incluyendo aportes por turnos/hitos, **sin filtrarlos por exclusiones posteriores**.
- **Corte “as-of” obligatorio:** leer hechos con hora física anterior a `ronda_hasta`; si un `conteo_detalle` fue **actualizado después** para añadir reconteo, reconstruir la confirmación que existía **antes** del corte a partir de `contado_at`, `recontado_at`, `d0/dr` y evidencias anteriores. La fila actual de `metrics_diferencias` NO es válida para cerrar una ronda histórica. Requiere vigencias históricas de composición en `metrics_ronda_obligaciones`.
- Cierre con transacción única y bloqueo por sede+ronda; reintento idempotente. Corrección por entrega física tardía **auditada/versionada** mediante `version_corte>1`, sin sobreescritura silenciosa del corte anterior. Cuando no hay soporte para reconstruir el instante, `estado_corte=nd`, no inventar precisión. **No hacer backfill de rondas anteriores a la activación** sin evidencia verificable.

### 2.6. Estructura SQL: Actividad compacta

**`metrics_actividad_turnos`**: PK `(sede_id,turno_desde)`, `turno_hasta timestamptz`, `turno text`, `prioridad_actual text`, `grupos_cobertura integer`, `grupos_reconteo_cobertura integer`, `grupos_reconteo_regular integer`, `grupos_cobertura_turno integer`, `tareas_habilitadas jsonb NOT NULL DEFAULT '{}'`, `tareas_completadas jsonb NOT NULL DEFAULT '{}'`, `tareas_retiradas jsonb NOT NULL DEFAULT '{}'`, `transiciones_prioridad jsonb NOT NULL DEFAULT '[]'` (optativa para diagnóstico), `estado text` (`en_curso|cerrado_provisional|cerrado`), `calidad text`, `updated_at,cerrado_at`.

**Claves canónicas dentro del JSONB**, sin crear filas auxiliares:
- Cobertura: `coverage:<ronda_desde>:<grupo_uuid>:<generacion>`; el turno está definido por la fila. Mismo grupo en otro turno = distinta celda; generación adicional solo si existe nueva obligación legítima.
- Diario: `daily:<turno_desde>:<grupo_uuid>`.
- Reconteo: `recount:<conteo_detalle_uuid>` (**la prioridad review_for_coverage/review_regular no forma parte de identidad**).
- Valor para `tareas_habilitadas[clave]`: al menos `grupo_id`, `kind`, `habilitada_at`. Para `tareas_completadas[clave]`: `evidencia_id`, `tipo_ejecucion`, `observada_at` y `clase_v4_ejecutada`. Para `tareas_retiradas`: motivo e instante.
- No mantener contadores `N/D` independientes como fuentes de verdad. `N=cardinalidad(completadas válidas no retiradas)`; `D=cardinalidad(habilitadas válidas no retiradas)`; `D=0` ⇒ «Sin tareas», porcentaje NULL.
- Una completada debe pertenecer a habilitadas. Alta por evento y cierre deben ejecutarse **en la misma transacción** que confirma la observación. No contar `count(conteo_detalle)` como número de físicas; un reconteo actualiza la fila original.
- Las cuatro colas son **diagnóstico operativo actual** del turno, no denominadores; de V4 y prioridad máxima vigente. Si cambia el conjunto, agregar nuevas identidades aunque el tamaño/priority no cambien. No volver a sumar una identidad que ya existe.
- Tareas bloqueadas sin habilitación: no registrar; retiro inequívoco: marcar y descontar. No reabrir/reconstruir por cambios posteriores de catálogo los turnos cerrados salvo corrección explícita. Limitación histórica aprobada.
- **Atribución especial:** usar `conteos.turno_desde/turno_hasta` del runtime que autorizó la sesión. Una física a las 07:45 hecha en sesión `early` pertenece a **Actividad early**; Episodios/Drawer/Rondas conservan `contado_at/recontado_at=07:45`.
- **Sin sesión activa:** registrar habilitaciones cuando es técnicamente posible abrir sesión con snapshot vigente, ventana no cerrada, grupo y dispositivo/estado operativo válidos conforme al motor; **no** depender de abrir una pantalla. Si hay una sesión que bloquea el inicio de otra, atender su runtime y **no** inventar simultáneamente trabajo en nueva sesión imposible.
- Cierre de turno provisional al límite temporal; aceptar lotes válidos en `recovery` en la fila del turno original y reabrir/consolidar **solo su acumulado**. El frontend intentará enviar pendientes/cerrar/renovar al cambio de turno, sin suponer éxito cuando está offline.

## 3. Integraciones transaccionales y orden de eventos

### 3.1. Snapshots ConeXion

**Secuencia obligatoria:**
`validación V2 → reconstrucción snapshot_stock → metrics_movimiento_sku upsert set-based → stock_actual upsert → marcar snapshot confirmado → aplicar V4 → reconciliar diferencias/actividad afectadas → commit`.

Todas las escrituras analíticas que dependan de este hecho deben quedar en **la transacción original**. El snapshot previo se identifica por sede/captura confirmada; `ultimo_snapshot_id` impide duplicados. Sin stock temporal anterior comparable, inicializar base. No cambiar payload/respuesta ConeXion V2.

**Bloqueo previo al despliegue del hook:** localizar punto de ejecución compatible con la función SQL real; no basta añadir un trigger `AFTER UPDATE estado='confirmado'` si todavía faltan actualizaciones posteriores de V4. Un helper de integración `inventario.metrics_on_snapshot_v1`, llamado en lugar definido al final de la mutación, es la opción preferida; no alterar decisiones ni firmas V4.

### 3.2. Conteos, reconteos y sesiones

Puntos:
- **Start**: tras crear runtime congelado, identificar prioridad máxima y tareas inicialmente habilitadas en ese turno.
- **`save_batch`**: para cada física aceptada, leer `accion/priority_class` anterior a pasar a `none`; persistir `completion` por identidad, física y clase. Después del lote, evaluar nuevas tareas que quedaron efectivamente habilitadas, aunque la prioridad no cambie.
- **`recount_save_batch`**: igual, pero una actualización de `conteo_detalle` es otra física: guardar `recontado_at`, `reconteo_conteo_id`, referencia de caso y prioridad desde el runtime; un replay con `operation_id` idéntico no duplica. Mantener la clasificación de ejecución aunque luego la tarea cambie de prioridad.
- **Finish/expiration**: capturar última disponibilidad y estado antes de limpieza del runtime; registrar retiro/pendientes si corresponde, sin crear trabajo ficticio.
- **Sin sesión**: capturar habilitación tras snapshot/cambio operacional y al límite del turno con evaluación V4 y posibilidad real de inicio.

Los puntos se pueden instrumentar por **funciones auxiliares `metrics_*` transaccionales** y triggers de cambio inequívoco; donde el orden de triggers no permita obtener runtime antes/después, hará falta una llamada analítica acotada dentro del cuerpo de la función operativa. **No aprobar implícitamente refactor/semántica nueva del Motor V4**; documentar diff mínimo antes de tocarlo.

### 3.3. Cambios de catálogo y grupos

Después de mutación/publicación/normalización efectiva: localizar **SKU incluidos↔excluidos**, sus grupos previos/nuevos y cambios estructurales. En la misma transacción:
- invalidar Movimiento al excluir, reiniciar base al reincorporar;
- reconciliar comparabilidad, precio V y obligación de validación en `metrics_diferencias` por sede/grupo;
- registrar generación/vigencia de obligación de Ronda cuando cambie universo o composición;
- invalidar/revalidar visibilidad operativa de Episodios sin falsos cierres;
- retirar tarea de Actividad **si se detecta inequívocamente en turno actual**, no reescribir todos los históricos.

**Dependencia concreta:** `inventario.catalogo_version_skus` versiona inclusión de SKU pero **no** su grupo histórico. Para rondas se necesita el historial mínimo en `metrics_ronda_obligaciones`; Movimiento no lo necesita. La publicación puede afectar varios grupos: registrar estado antes/después en el mismo límite transaccional, no desde estado presente horas después.

### 3.4. Coordinación, transacciones e idempotencia

- Usar bloqueo por sede **compatible con el advisory lock que ya toma la ingesta**; no introducir un orden inverso de locks por sede/grupo que cause deadlocks. Persistencias por sede/turno y sede/ronda usan `INSERT ... ON CONFLICT` + bloqueo de fila, aplicando operaciones deterministas sobre conjuntos.
- Identidad de snapshot = `snapshot_id`, física normal = `client_observation_id`/detalle validado, reconteo = `conteo_detalle_id + recontado_at/reconteo_conteo_id`, ronda = sede+inicio y corte versionado.
- No confirmar por separado la analítica después de un evento operativo válido: si el evento produce analítica obligatoria y la escritura falla, la transacción falla. Para tareas de Cron asíncronas, usar idempotencia y recuperación y devolver `N/D` cuando falta evidencia.
- Asegurar **replay** en `solog_operaciones` y en índices de métricas; procesamiento de `replay=true` no reejecuta altas analíticas.
- Fechas físicas y fechas de entrega no se intercambian. Campos `timestamptz` en UTC; agrupación temporal mediante `solog_temporal_context` y Lima.
- Los cambios de la UI nunca escriben KPI calculados directamente.

## 4. Funciones internas propuestas (`inventario.metrics_*`)

| Función | Contrato interno conceptual | Invocación |
|---|---|---|
| `metrics_movimiento_aplicar_snapshot_v1(snapshot_id)` | Recalcular una sede usando stock anterior y nuevo; idempotencia | Ingesta transaccional antes de `stock_actual` |
| `metrics_movimiento_c24_efectivo_v1(sede_id,c_interno,as_of)` | C24/ventana/calidad vigentes | Riesgo y muestreo auxiliar |
| `metrics_calibracion_c24_tomar_muestra(at)` | Muestreo **solo** a auxiliar | Cron temporal |
| `metrics_diferencias_reconciliar_v1(sede_id,grupo_id)` | Confirmación física y obligación independientes | Conteo/reconteo/catálogo |
| `metrics_episodios_reconciliar_v1(sede_id,grupo_id)` | Secuencia física, aperturas/cierres | Eventos físicos/tardíos/invalidez |
| `metrics_ronda_reconciliar_v1(sede_id,ronda_desde)` | Obligaciones/hitos/acreditaciones | Físicas/cambio estructural |
| `metrics_rondas_cerrar_pendientes_v1(as_of)` | Detectar cortes vencidos; cierre «as-of» idempotente y reintentos | Cron |
| `metrics_actividad_habilitar_v1(sede_id,turno_desde,contexto)` | Unir claves ejecutables nuevas | Inicio sesión/snapshot/turno/cambio de cola |
| `metrics_actividad_completar_v1(conteo_id,observacion_id,kind)` | Añadir física una sola vez antes de pérdida del runtime | Guardado normal/reconteo |
| `metrics_actividad_cerrar_pendientes_v1(as_of)` | Cierre provisional/consolidación de turnos | Cron |

Estos nombres son propuestos **para congelación del contrato backend**, no funciones existentes. Antes de implementar hay que definir firmas SQL finales y probar orden real de llamadas para no modificar efectos V4.

## 5. Cron de operación y Cron efímero de calibración

Se mantienen activos, **sin cambios**, los jobs existentes `conexion_cleanup_snapshot_stock` y `solog_cleanup_operations`.

| Nuevo job | Horario propuesto UTC | Responsabilidad | Vida útil |
|---|---|---|---|
| `metrics_rondas_cierre_recuperable` | `4 * * * *` | Revisa cortes temporales vencidos; cierra de forma «as-of», reintenta omisiones sin rehacer cortes válidos | Permanente |
| `metrics_actividad_turnos_cierre` | `5 * * * *` | Cierra provisionalmente turnos vencidos; la hora real la da el contexto, no el job | Permanente |
| `metrics_calibracion_c24_6h` | `5 5,11,17,23 * * *` | Solo registra muestras de C24 para noviembre | **Temporal** |

**El horario de los dos primeros jobs es propuesta técnica, no una nueva decisión funcional congelada.** Las funciones deben operar por `ronda_hasta` y `turno_hasta` reales, no usar la hora de disparo como corte. Si una ronda tiene evidencia incompleta, marcar `N/D` con motivo; no fabricar el último estado confirmado. Probar recuperación después de caídas y entrega tardía.

No activar ningún job durante esta fase documental. Para el job temporal respetar calendario de dos calibraciones; detenerlo y eliminar dependencia auxiliar una vez terminadas. No deshabilitar extensión `pg_cron`.

## 6. Contrato público administrativo propuesto (sin despliegue)

**Única RPC pública:** `public.metrics_dashboard_v1(p_action text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb`; ejecutable solo por `authenticated` autorizado (y `service_role` para tareas verificadas), con `auth.uid()`, `usuarios.activo`, rol `admin|moderador` y sede activa; para listado de sedes solo las autorizadas.

**Envelope de respuesta exitosa** para cada acción:

```json
{
  "contract_version": 1,
  "generated_at": "2026-10-14T14:00:00Z",
  "action": "overview",
  "source": "metrics_dashboard_v1",
  "quality": "complete",
  "data": {}
}
```

`quality` es `complete|partial|no_data` de la **respuesta**, no sustituye calidad por métrica. Conteos = enteros no negativos, importes y porcentajes = números o `null` cuando N/D; no devolver ceros simulados. Tiempos ISO 8601 con offset/UTC; fechas del negocio `YYYY-MM-DD` Lima. Toda respuesta incluye claves declaradas, usando `null` explícito cuando sea aplicable.

### 6.1. Acciones y payloads obligatorios

| `p_action` | `p_payload` | Salida en `data` | Límite |
|---|---|---|---|
| `overview` | `{}` | `sites[]`: KPI de las sedes autorizadas | Todos los sitios autorizados |
| `rounds` | `{"site_id":"uuid"}` | Ronda actual, R1/R2 quincena, hasta 6 rondas históricas, hitos y aportes por turno | 6 cortes históricos |
| `risk` | `{"site_id":"uuid","limit":6,"cursor":null,"sort":"risk"}` | Ranking paginado por riesgo/valorizado/diferencia | 6 inicial, máx. 100 |
| `episodes` | `{"site_id":"uuid","scope":"open","sort":"importance","limit":25,"cursor":null}` | Abiertos o cerrados recientes, recurrencia, persistencia, nivel cualitativo | máx. 100 |
| `activity` | `{"site_id":"uuid","date_from":"YYYY-MM-DD","date_to":"YYYY-MM-DD"}` | Matriz de hasta 31 días por early/day/night | hasta 31 días inclusivos |
| `day` | `{"site_id":"uuid","date":"YYYY-MM-DD"}` | Resumen de un día y confirmaciones históricas del día | Una fecha |
| `day_observations` | `{"site_id":"uuid","date":"YYYY-MM-DD","limit":25,"cursor":null}` | Página de observaciones físicas válidas detalladas del día | máx. 100 |

**No introducir** `dashboard` que cargue indiscriminadamente todas las pestañas, ni modificar `rpc_solog_admin_control_v1`. El Dashboard hace `overview` al entrar; `rounds|risk|episodes|activity` bajo demanda por sede y pestaña; `day` y `day_observations` para Drawer diario.

### 6.2. Shapes precisos de `data` (esquema de transporte)

**`overview`**:

```json
{"sites":[{
  "site_id":"uuid","site_name":"Cutervo",
  "round":{"period_from":"2026-10-01","round":2,"counted":0,"required":0,"percent":null,"quality":"no_data"},
  "accuracy":{"green":0,"yellow":0,"red":0,"exempt_zero_zero":0,"without_evidence":0,"universe":0,"denominator":0,"green_percent":null,"yellow_percent":null,"red_percent":null,"quality":"no_data"},
  "surplus":{"groups":0,"value":null,"quality":"no_data"},
  "shortage":{"groups":0,"value":null,"quality":"no_data"},
  "risk":{"high":0,"very_high":0,"quality":"no_data"}
}]}
```

En implementación con fuente inicializada válida, los recuentos 0 pueden ser reales; si la persistencia aún no existe, devolver señal `no_data` y `percent/value=null`, **no afirmar KPI cero medidos**. `accuracy.universe=T`, `denominator=U`, (T=G+Y+Rg+Z+S), (U=G+Y+Rg); tres porcentajes `null` si U=0.

**`rounds`**:

```json
{"site_id":"uuid","current":{"round_from":"2026-10-12T05:00:00Z","round_to":"2026-10-16T05:00:00Z","round":2,
 "coverage":{"counted":0,"required":0,"percent":null},
 "milestones":{"50":null,"90":null,"100":null},"quality":"partial"},
 "period_rounds":[{"round":1,"round_from":"ISO","coverage":{"counted":0,"required":0,"percent":null},
 "historical_accuracy":{"green":0,"red":0,"exempt":0,"without_evidence":0,"denominator":0,"percent":null},
 "shift_contributions":{"early":0,"day":0,"night":0},"closed_at":"ISO","quality":"complete"}],
 "history":[]}
```

Los instantes/fechas del ejemplo son **ilustrativos**, no fechas asumidas de cortes reales; `ronda_from/to` definitivos provienen de `solog_temporal_context`. `period_rounds` distingue ronda abierta de corte cerrado; al cierre de ronda, freeze de contribución, precisión y hitos. `history` máximo seis cerradas. No inferir históricos N/D como 0.

**`risk`**:

```json
{"site_id":"uuid","sort":"risk","rows":[{
 "group_id":"uuid","group_name":"Nombre",
 "difference":-8,"confirmed_value":-40.0,
 "level":"alto","movement_quality":"partial",
 "risk_available":true
}],"next_cursor":null,"total":1}
```

`sort` permitido `risk|value|difference`. No exponer C/D/V/R numéricos; niveles `bajo|medio_bajo|medio|medio_alto|alto|muy_alto` o `null` si no hay clasificación válida. La fila sin valor monetario válido conserva diferencia y `confirmed_value=null`.

**`episodes`**:

```json
{"site_id":"uuid","scope":"open","sort":"importance","rows":[{
 "episode_id":"uuid","group_id":"uuid","group_name":"Nombre",
 "opened_at":"ISO","closed_at":null,
 "recurrences_45d":0,"duration_hours":12.5,
 "risk_level":null,"risk_status":"pending_confirmation"
}],"next_cursor":null,"total":1}
```

`scope` `open|closed`; `sort` `importance|recurrence|persistence` para open, fechas para closed. `risk_status` `available|pending_confirmation|not_available`; ausencia de confirmación comparable nunca se representa como riesgo cero.

**`activity`**:

```json
{"site_id":"uuid","cells":[{
 "date":"2026-10-14","turno":"early",
 "status":"in_progress","completed":34,"required":39,"percent":87.2,
 "breakdown":{"round_coverage":14,"review_for_coverage":5,"review_regular":4,"shift_coverage":11},
 "quality":"complete"
}]}
```

`status`: `in_progress|closed|no_tasks|no_data`. Con conjunto exigible vacío **y turno analíticamente inicializado**, `status=no_tasks`, `required=0`, `percent=null`; sin fuente analítica `status=no_data`, `completed/required/percent=null`. No confundir `review` con un conteo de casos abiertos.

**`day`**:

```json
{"site_id":"uuid","date":"2026-10-14",
 "physical_activity":{"groups_observed":0,"counts":0,"recounts":0},
 "episodes":{"opened":0,"closed":0,"open_at_day_end":0},
 "confirmed_differences":[{"group_id":"uuid","group_name":"Nombre","recounted_at":"ISO","difference":-3,"frozen_value":-12.5}],
 "confirmed_total":1,"observations_initial_cursor":null,"quality":"complete"}
```

En `confirmed_differences`, considerar solo **hechos de reconteo físico `Confirmada`** fechados ese día, última confirmación por grupo/día con desempate estable, **aunque posteriormente un Coincide haya cambiado el estado actual**. Si todas son numerosas, el contrato podrá paginar este apartado con cursor: **cerrar el límite exacto antes de frontend** (ver § 9).

**`day_observations`**:

```json
{"site_id":"uuid","date":"2026-10-14","rows":[{
 "observation_id":"uuid","group_id":"uuid","group_name":"Nombre",
 "kind":"normal","observed_at":"ISO","theoretical":10,"physical":9,
 "physical_difference":-1,"result":"Recontar"
}],"next_cursor":null}
```

Esta tabla es de evidencias físicas **a la fecha seleccionada**, no una copia de `metrics_diferencias` actual.

### 6.3. Validaciones, páginas, errores y permisos

- `site_id` UUID válido/activo; `date_from≤date_to`, no más de 31 días; `date` de calendario Lima existente; `limit` 1–100; enumeraciones cerradas. Página ordenada por criterio autorizado con desempate ID, cursor opaco versionado, nunca offset costoso ni SQL construido directamente desde `sort`.
- `overview` no acepta `site_id`. Las demás acciones lo exigen; no aceptar IDs de sedes ajenas/inactivas.
- Códigos de error consistentes con wrappers existentes: `SOLOG_AUTH_REQUIRED`, `SOLOG_USER_DISABLED`, `SOLOG_ADMIN_ROLE_REQUIRED`, `SOLOG_INVALID_PAYLOAD`, `SOLOG_INVALID_ACTION`, `SOLOG_INVALID_SITE`, `SOLOG_SITE_FORBIDDEN`, y nuevos `SOLOG_METRICS_INVALID_DATE`, `SOLOG_METRICS_INVALID_RANGE`, `SOLOG_METRICS_INVALID_LIMIT`, `SOLOG_METRICS_INVALID_CURSOR`, `SOLOG_METRICS_INVALID_SORT`. **La ausencia analítica es respuesta exitosa con estado N/D, no excepción.**
- `SECURITY DEFINER` si se justifica para lectura de esquema privado; `SET search_path = ''`, calificar objetos, `REVOKE EXECUTE FROM PUBLIC,anon`, `GRANT EXECUTE TO authenticated` solo tras inspección de rol. Nunca exponer `metrics_*` internas al cliente.
- Controlar `statement_timeout` y paginación al desplegar. `generated_at` autoritativo para cohesión de respuesta; cursores con orden estable y snapshot lógico cuando corresponda; no prometer consistencia de múltiples llamadas si entre ellas cambian snapshots sin una estrategia de versión.
- Antes del frontend, probar RPC desplegada con `admin`, `moderador`, `cajero`, no autenticado y sede inválida, comprobando RLS/grants y tipos reales JSON.

## 7. Índices, capacidad y mantenimiento

- Movimiento: PK `(sede_id,c_interno)`; para agregación por grupo se reutiliza índice actual `catalogo(grupo_conteo_id)` + búsqueda por PK. Sin GIN indiscriminado de arrays ni duplicar índice del PK.
- Calibración: PK `(muestreo_at,sede_id,c_interno)` e índice dirigido `(sede_id,muestreo_at,grupo_conteo_id)` para análisis; borrado definitivo elimina ambos.
- Diferencias: PK `(sede_id,grupo_conteo_id)`, índices parciales si ranking y revisión lo requieren tras `EXPLAIN ANALYZE`; no indexar cada factor calculado de manera prematura.
- Episodios: índice parcial único sede/grupo donde `cierre_at IS NULL`; btree `(sede_id,grupo_conteo_id,apertura_at DESC)`, `(sede_id,apertura_at)`, `(sede_id,cierre_at)` para 45d y Drawer.
- Rondas: índices `(sede_id,ronda_desde DESC)`, obligación `(sede_id,ronda_desde,grupo_conteo_id,generacion)` PK y vigencia/hito; cortes `(sede_id,ronda_desde DESC,version_corte DESC)`. Solo seis rondas históricas en lectura normal.
- Actividad: PK `(sede_id,turno_desde)`, índice por sede/turno DESC. No crear GIN para claves JSONB si únicamente se lee el acumulador de un turno. Un update por evento transaccional de la misma fila es más eficiente que una consulta global recurrente; comprobar tamaño `jsonb`, WAL e índices por observación de pruebas.
- Para movimiento, procesar cerca de 987 SKU por sede y snapshot sin llamadas por fila; tamaño y tiempo reales deben medirse. Muestreo máximo orientativo: 5 sedes×987 SKU×4/día×30 días ≈592 200 filas/mes **si todas tienen ese catálogo** (cálculo ilustrativo), no promesa de carga real.
- Mantener los Cron originales y comprobar los tiempos de `cron.job_run_details`; no usar cronograma de calibración como disparador operativo.

## 8. Validaciones requeridas antes de declarar backend desplegado

### 8.1. Pruebas técnicas mínimas por dominio

| Dominio | Pruebas obligatorias |
|---|---|
| Movimiento | Primer snapshot/base; cinco intervalos exactos con cero; tres mínimos; transcurrir siete días; diferencia positiva/negativa; retrasos; reincorporación; cambio de grupo; replay; rollback de captura; calidad parcial |
| Calibración | Cron UTC↔Lima; muestra C24 efectivo; calidad insuficiente; replay; adscripción vigente muestreada; eliminar temporal sin dependencia |
| Diferencias | Coincide real, Confirmada física, Recontar sobre confirmación, Inconsistente, 0/0, precio/paquete, incompatibilidad, siete legados, entrega tardía |
| Episodios | d≠0→d≠0→d=0→d≠0; 45d; abierto sin límite; exclusión/reactivación; físico de turno cruzado; idempotencia |
| Rondas | R1/R2 medio quincena; 0/0; altas/bajas; reabrir cobertura sin borrar hito; 100% ≠ precisión congelada; cierre real tardío as-of; confirmación anterior bajo nueva revisión; cambio estructura y evidencia tardía versionada |
| Actividad | 34/39; prioridad baja/sube; sustitución en cola con mismo cardinal; sesión congelada; espera snapshot; conteo/reconteo por igual grupo; replay; lote tardío en recovery; sesión atraviesa 07:30; cierre sin tareas |
| API/Seguridad | Todos los actions, cursor, nullables, autorización, GRANT/RLS, sedes y roles; latencia con 5 sedes y catálogos completos |

### 8.2. Gates de implementación

1. **Fase Backend A — Estructuras**: migraciones nuevas, RLS y helpers analíticos aislados, sin activar Cron ni modificar V4. Validar DDL, constraints, roles y rollback.
2. **Fase Backend B — Movimiento + muestreo**: integrar atómicamente con ConeXion, probar anti-replay, habilitar Cron temporal **solo tras aprobar/verificar**; revisar impacto en ingesta.
3. **Fase Backend C — Diferencias y Episodios**: alimentar hechos físicos nuevos y reconciliación localizada; comparar casos con detalle real legado; no degradar Control.
4. **Fase Backend D — Rondas**: instrumentar obligaciones al cambiar catálogo y física, hitos, cierre «as-of» y versionado; activar Cron de cierre solamente después de pruebas de reconstrucción.
5. **Fase Backend E — Actividad**: instrumentar estado V4 de sesión y pre-sesión, acumulador JSONB, corte de turno y recuperación tardía; activar Cron de cierre con verificación de IDs.
6. **Fase Backend F — RPC/Admin**: desplegar `public.metrics_dashboard_v1` con acciones y contratos definitivos, roles/grants, regresión global y pruebas sintéticas; congelar evidencia de respuestas desplegadas.
7. **Fase Frontend posterior**: recién después de desplegar, validar contratos y congelarlos para Codex; Codex baseline/plan bajo `admin-work`, aprobación del plan por usuario, implementación por fases, revisión y smoke.

No tocar `master`. Mantener cambios preexistentes; no realizar limpieza general ni refactors ajenos. Si una modificación del SQL operativo existente excede instrumentación no funcional, detenerse y solicitar aprobación puntual.

## 9. Bloqueos y decisiones que NO se consideran implementadas ni verificadas

**B1 — Integración transaccional de Actividad con funciones V4.** El runtime se modifica y se elimina dentro de V4. Es imprescindible demostrar, mediante prueba SQL aislada y diff dirigido, que los hooks capturan clase/identidad antes de pérdida y después registran habilitaciones de la nueva prioridad. Si se necesita alterar lógica del Motor V4, eso es **cambio funcional bloqueante**, no autorizado por este contrato. Preferir hooks auxiliares/transaccionales mínimos.

**B2 — Cierre “as-of” de Rondas frente a catálogo y reconteos sobrescritos.** Se debe demostrar que la combinación de versiones de obligaciones, horas físicas y `conteo_detalle` original/reconteo reproduce la última confirmación físicamente existente **a `ronda_hasta`**. Sin esa prueba, no activar cierre Cron ni declarar precisión histórica válida. No usar estado presente como sustituto.

**B3 — Calidad de C24 grupal parcial.** El delta permite suma de SKU medidos con señal `partial`. La regla técnica adoptada aquí es: clasificar C con suma disponible si ≥1 SKU tiene C24 válido, marcar `partial`; si ninguno, imputar C=1 y marcar `insufficient`. No declarar esa cifra como movimiento completo y **validar el impacto de subestimación** con casos de SKU faltantes antes del despliegue. Si un caso de prueba demuestra que esta regla produce clasificación engañosa intolerable, registrar evidencia y solicitar ajuste mínimo; no cambiarla silenciosamente.

**B4 — Seguridad/contratos RPC aún no desplegados.** Los formatos de § 6 son **propuesta de interfaz**. La versión congelada para Codex debe ser exactamente la que Supabase haya desplegado y probado, con cursores, errores y nullable revisados en ejecución. En particular, definir política de paginación de `day.confirmed_differences` y snapshot lógico entre páginas antes de implementar frontend.

**B5 — Estado operativo sin sesión en fronteras de turno.** El motor verifica vigencia de snapshot, ventana y conflicto de sesión. Validar que el recolector no incluya tareas solo teóricas cuando no sea posible iniciar sesión y que no atribuya a nuevo turno trabajo congelado de sesión anterior.

**B6 — Historial legado y backfill.** No hay `snapshot_stock` histórico suficiente para recrear Movimiento con arrays; iniciar **prospectivamente** la ventana. Otros históricos solo desde activación o evidencia física/materializada verificable; excluir `Coincide` teóricas legadas. Los cortes históricos no verificables = N/D, no llenar con estado actual.

**Ningún bloqueo autoriza a Codex ni a ChatGPT a reinterpretar las decisiones congeladas.** B1/B2 requieren pruebas predespliegue; B3/B4/B5 son contratos operativos a validar. Documentar resultados y pedir aprobación si aparece incompatibilidad funcional. Una vez resueltos y aprobado este contrato, desplegar backend por ChatGPT, probar y solo entonces habilitar trabajo frontend.

## 10. Estado final de esta consolidación

- **Exploración funcional y decisiones**: cerradas en los dos documentos congelados.
- **Preflight técnico**: ejecutado en modo lectura, con evidencias de PostgreSQL, tablas, funciones, triggers, permisos y Cron existentes.
- **Diseño de contrato backend**: **consolidado como propuesta**, con tablas, campos/tipos conceptuales, integraciones, acciones RPC, payload/respuestas, permisos, índices, Cron, pruebas y bloqueos explícitos.
- **Congelación técnica**: pendiente de aprobación y de resolver bloqueos verificables.
- **Implementación**: **no iniciada**.
- **Validación de ejecución/producción**: **no realizada**.
