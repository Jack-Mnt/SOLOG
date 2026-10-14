# SOLOG — Delta V1: Movimiento, calibración C y Actividad del Dashboard Admin

| Atributo | Valor |
|---|---|
| Proyecto | SOLOG |
| Documento | `SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` |
| Estado | **CONGELADO — decisiones funcionales y arquitectónicas aprobadas** |
| Tipo | Delta de especificación; Nivel C (backend, métricas y persistencia) |
| Fecha | 2026-10-14 |
| Rama documental | `admin-work` |
| Documento base | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` |
| Implementación | **No iniciada**. Este delta no autoriza asumir contratos SQL/RPC incompletos ni modificar el Motor V4. |

## 1. Alcance, autoridad y motivo

Este delta congela la simplificación aprobada para: **(A) Movimiento como insumo vigente del riesgo**, **(B) muestreo auxiliar temporal para calibrar C en noviembre de 2026** y **(C) Actividad mediante un acumulador compacto por sede y turno**.

La fuente funcional de la implementación continúa siendo **el documento base leído junto con este delta**. Para el alcance exacto aquí modificado, **prevalece este delta V1**. En cualquier otra materia prevalece el documento base. Este delta reemplaza expresamente las reglas afectadas en los §§ 3.3 (solo excepción de Actividad histórica), 5.1–5.2, 6.1–6.4, 7.1–7.4, 8 y los casos de aceptación relacionados del § 10.1/10.3. Ningún otro apartado queda derogado.

Motivo: obtener los KPI operativos del Dashboard con menor volumen de persistencia, consultas simples, coste predecible y sin auditoría detallada que el producto ya no necesita. Se **aceptan explícitamente límites de precisión histórica en Actividad**, sin degradar el tratamiento normal de eventos V4.

No modificar por este delta las reglas de **Precisión**, **Sobrantes/Faltantes**, **Rondas y cortes históricos**, **Episodios**, **D/V y categorías de Riesgo**, **Drawer diario**, seguridad existente, ingesta ConeXion V2 ni las decisiones y firmas del Motor de conteos V4.

## 2. Movimiento — persistencia permanente simplificada

### 2.1. Propósito y fuente

Movimiento existe **solo** como componente C del **riesgo actual**; no genera informes de movimiento por día, turno, ronda o quincena. La unidad de comparación es el SKU identificado por `catalogo.c_interno` dentro de una sede. Comparar capturas consecutivas **confirmadas**, válidas, de la misma sede y en orden de `capturado_at`; el valor absoluto individual es `|stock_nuevo - stock_anterior|`, **sin compensar subidas y bajadas**.

Mantener la reconstrucción del stock cero de los SKU incluidos conforme al contrato vigente de ingesta. Un SKU excluido no es una observación a cero. El primer snapshot válido de un SKU/sede establece referencia sin generar movimiento. Replays no deben añadir intervalos.

### 2.2. Tabla conceptual única

**`inventario.metrics_movimiento_sku`** — una fila por `(sede_id, c_interno)`. Campos conceptuales:

| Campo | Semántica |
|---|---|
| `sede_id`, `c_interno` | Clave compuesta única. |
| `variacion_stock` | Array ordenado de **máximo cinco** valores absolutos por intervalo comparable; incluir valores **0**. |
| `duracion_intervalo` | Array alineado 1:1 con `variacion_stock`, duración positiva en unidad definida técnicamente (preferible segundos). |
| `ultimo_stock` | Stock de la última captura válida que sirve de base. |
| `ultimo_snapshot_id` | Identidad de captura procesada para idempotencia y secuencia. |
| `ultimo_capturado_at` | Timestamp real de **captura** (no el de recepción ni solo `updated_at`). |
| `c24_sku` | Tasa móvil de cambios absolutos del SKU en unidades/24 h; **NULL** si no existe medición suficiente. |
| `estado_calidad` o equivalente derivable | Indica válido, insuficiente, caducado o invalidado, sin confundir `NULL` con movimiento cero. |
| `updated_at` | Solo mantenimiento técnico de la fila; no sustituye `ultimo_capturado_at`. |

Nombres, tipos y restricciones SQL definitivos corresponden al preflight/contrato técnico, no se deducen de esta tabla conceptual.

Cada snapshot comparable desplaza la ventana y recalcula `c24_sku` una vez por SKU mediante procesamiento **set-based y transaccional**. El coste crece proporcionalmente al número de SKU válidos procesados, no a cuántos cambiaron; se acepta escribir también ventanas con variación cero a cambio de predictibilidad. Nunca generar una operación SQL remota individual por SKU.

### 2.3. Fórmula, frescura y agregación por grupo vigente

Por SKU, seleccionar de su ventana los **últimos hasta cinco intervalos comparables** cuyos datos pertenecen a los **últimos siete días**. Cada intervalo tiene una duración real entre capturas válidas. Exigir **al menos tres intervalos válidos**; incluir variaciones cero:

`C24_sku = 24 × SUM(variacion_stock) / SUM(duracion_horas)`.

La vigencia debe poder determinarse usando `ultimo_capturado_at` y la secuencia de duraciones; no devolver como medido un `c24_sku` cuyo conjunto de intervalos haya caducado con el paso del tiempo. Al leer puede validarse la frescura o recomputarse la ventana de cinco elementos **sin historia externa**, evitando obligar a un Cron permanente solo para caducidad.

Para una sede y grupo, usar **los SKU actualmente incluidos y adscritos al grupo**:

`C24_grupo = SUM(C24_sku válidos y vigentes de sus SKU)`.

**Cambio deliberado de semántica frente al documento base:** C24 es una característica reciente **del SKU**, atribuida al **grupo actual en el momento de consulta**. No se conserva ni reconstruye la adscripción histórica de cada intervalo de Movimiento. Un SKU trasladado de grupo aporta su C24 vigente al nuevo grupo; deja de aportar al antiguo. No exigir composición histórica para este indicador.

La suma de tasas individuales constituye la **nueva definición aprobada de C24 grupal**, aunque las ventanas por SKU sean diferentes por altas/reincorporaciones. La lectura debe exponer calidad **completa/parcial/insuficiente**: un SKU sin tres intervalos válidos no equivale a cero. Si algunos SKU tienen C24 medido y otros no, permitir suma **parcial señalada** (precisión limitada aceptada). Si no existe medición suficiente para clasificar C de un grupo, **imputar factor categórico C=1** con señal «Movimiento: datos insuficientes» (no fingir medición de tasa 0).

La transformación `C24_grupo → factor C` sucede **una única vez a nivel grupal**, después de sumar tasas, con los cortes provisionales vigentes: `≤10 → C=1`, `>10 y ≤50 → C=2`, `>50 → C=4`. Mantener `R=C×D×V`, los cortes de D y V, umbrales cualitativos R y la regla de diferencia física confirmada comparable. `c24_sku` **no** almacena el factor categórico 1/2/4.

### 2.4. Exclusión, reincorporación y cambios de catálogo

Al **excluir** un SKU, invalidar inmediatamente su referencia, arrays y C24, impidiendo que sus variaciones o valores anteriores se utilicen. Puede conservarse la fila invalidada para control técnico, sin participar en Riesgo.

Al **reincorporar** el SKU, reiniciar la fila: primera captura válida establece `ultimo_stock`, snapshot y `ultimo_capturado_at` como base nueva, arrays vacíos y C24 insuficiente. Solo las capturas **posteriores** generan intervalos y, al acumular al menos tres válidos, un C24 medido. Nunca convertir exclusión, omisión no comparable o reincorporación en una venta/salida ficticia.

Un cambio de grupo **sin exclusión** no reinicia el C24 del SKU: se aplica la adscripción actual al consultar.

### 2.5. Eliminación deliberada de historial

**Se retira** el requisito previo de retener **90 días de detalles ΔSKU** y de almacenar cabeceras de intervalos históricas separadas. Para Movimiento quedan sustituidas las propuestas `metrics_movimiento_intervalos`, `metrics_movimiento_detalle` y `metrics_movimiento_base_sku` por **una única proyección permanente**.

Se acepta perder reconstrucción, atribución y auditoría histórica de movimientos individuales. Esto **no** elimina ni reduce los hechos de `snapshots`, `stock_actual`, `conteos`, `conteo_detalle`, `metrics_diferencias`, `metrics_episodios` ni los cortes de Rondas. Ninguna otra métrica aprobada consume la historia de variaciones SKU: solo el **riesgo actual** requiere C. La calibración temporal se resuelve con la tabla auxiliar independiente del § 3.

## 3. Calibración C — auxiliar aislada y eliminable

### 3.1. Objetivo

Conservar muestras temporales para la **calibración 1 (inicios de noviembre de 2026)** y **calibración 2 (mediados de noviembre de 2026)**. Solo se calibrarán los **umbrales del componente C**. No modificar automáticamente D, V, umbrales R ni valores de riesgo durante el muestreo.

### 3.2. Tabla auxiliar conceptual

**`inventario.metrics_calibracion_c24`** — tabla persistente de **vida limitada** (no tabla SQL `TEMP`). Una muestra por instante programado, sede y SKU; esquema conceptual:

- `muestreo_at`, `sede_id`, `c_interno` (clave única e idempotencia);
- `grupo_conteo_id` **vigente al muestreo**, para reconstruir C24 grupal de esa fecha;
- `c24_sku` medido o NULL, `intervalos_validos`, `calidad` y `ultimo_capturado_at`.

Registrar también insuficiencia y ausencia de medición sin inventar cero. El análisis de calibración utilizará **distribuciones de C24 por grupo y sede**, reconstruidas desde estas muestras, no exclusivamente la distribución por SKU.

### 3.3. Job temporal y eliminación segura

Un **Supabase Cron** temporal de muestreo cada seis horas, a las **00:05, 06:05, 12:05 y 18:05 de Lima** (equivalente GMT/UTC `5 5,11,17,23 * * *`), leerá la proyección permanente y guardará muestras en la auxiliar. El job **no actualiza ni corrige** `metrics_movimiento_sku`, C categórico, Riesgo ni ninguna otra métrica. No necesita integrarse en las RPC del Dashboard.

Requisitos de aislamiento:
1. Ninguna tabla, trigger, función operativa o RPC de Dashboard **depende** de la tabla de calibración; no crear referencias/FK desde objetos permanentes hacia ella.
2. El job invoca solo su función auxiliar de lectura/muestreo; no ejecutar recalculado operativo por este mecanismo.
3. Muestreos repetidos son idempotentes.
4. Después de documentar y validar la segunda calibración, **desactivar/eliminar primero el Cron** y posteriormente retirar función y tabla auxiliares. Esta eliminación **no** altera el funcionamiento del factor C ni de Riesgo.
5. Si las muestras son insuficientes, conservar umbrales provisionales y documentar el motivo; no simular calibración completada.

**La frecuencia y horarios quedan funcionalmente aprobados; la creación efectiva de tabla/job y sus permisos requiere implementación backend y validación posterior.**

## 4. Actividad — acumulador único con identidades compactas

### 4.1. Objetivo, fórmula y precisión aprobada

Actividad mide **trabajo físico válido realizado respecto de oportunidades de trabajo realmente habilitadas** en el turno operativo de la sede. Una tarea completada es una **observación física válida**, normal o reconteo; el mismo grupo puede aportar varias observaciones **cuando sean obligaciones legítimas distintas**. No mide productividad individual, precisión del stock, ni cobertura de catálogo por turno.

`Cumplimiento = 100 × completadas / exigibles`;

- `completadas` = cardinalidad de tareas válidas completadas.
- `exigibles` = cardinalidad acumulada de identidades de tareas **efectivamente habilitadas**, excluyendo bloqueos nunca habilitados y retiradas legítimas reconocidas.
- `exigibles = 0` = **Sin tareas / N/D**, no 0 % ni 100 %.
- El turno en curso es provisional; un turno cerrado puede recibir regularización por lotes tardíos válidos bajo la política del § 4.5.

**Decisión de compromiso aprobada:** no reconstruir ni recalcular de forma exhaustiva los resultados históricos de Actividad después de exclusiones posteriores de grupos, sustituciones excepcionales de tareas o modificaciones estructurales poco frecuentes. El indicador será **operativo agregado**, con posibles desviaciones históricas documentadas. Se deben evitar errores ordinarios por prioridades, nuevas habilitaciones, snapshots, observaciones, doble envío y replays.

### 4.2. Única tabla conceptual

**`inventario.metrics_actividad_turnos`** — **una fila por sede y turno temporal**, clave `(sede_id, turno_desde)` con `turno_hasta`, zona `America/Lima`. Datos conceptuales:

| Campo | Significado |
|---|---|
| `prioridad_actual` | Prioridad V4 registrada al último evento efectivo. |
| `grupos_cobertura` | Cantidad observable de tareas `round_coverage` pendientes en la cola correspondiente. |
| `grupos_reconteo_cobertura` | Cantidad observable `review_for_coverage`. |
| `grupos_reconteo_regular` | Cantidad observable `review_regular`. |
| `grupos_cobertura_turno` | Cantidad observable `shift_coverage` (conteos diarios realmente disponibles). |
| `tareas_habilitadas` | Conjunto compacto de identidades **alguna vez habilitadas efectivamente** en ese turno. |
| `tareas_completadas` | Conjunto compacto de identidades completadas válidamente, con tipo/clase para desglose. |
| `tareas_retiradas` o equivalente | Marcas compactas cuando sea posible reconocer retiro legítimo durante el turno. |
| `transiciones_prioridad` (opcional) | Lista corta de hitos de prioridad; **no** fuente autoritativa del denominador. |
| `estado`, `updated_at`, `cerrado_at` / calidad | Estado y control de consolidación del turno. |

Los cuatro contadores de grupos son **colas operativas actuales**, no denominadores acumulados ni otra lógica paralela de prioridad. `observaciones_fisicas` y desglose se **derivan de identidades completadas**; no mantener contadores independientes sin reconciliación. El almacenamiento exacto (arrays/JSONB, claves compactadas, tipos, restricciones) se define técnicamente sin añadir tablas históricas individuales ni una tabla por cada transición.

Quedan **sustituidas** las propuestas previas de `metrics_turno_tareas`, `metrics_actividad_eventos` y de una segunda tabla/cabecera de Actividad. Una tabla de acumulador por turno es la fuente habitual de consulta.

### 4.3. Identidad e incorporación de tareas

La identidad impide duplicar una tarea por evaluación, cambio de prioridad o replay:

- **Cobertura:** sede + turno de habilitación/ejecución + grupo + obligación de ronda; incluir generación/revisión solo si aparece una **nueva** obligación legítima por invalidación estructural, sin confundirla con la anterior.
- **Conteo diario:** sede + turno + grupo.
- **Reconteo:** referencia al `conteo_detalle.id` origen; **no usar el nombre de prioridad** como identidad. Una misma revisión que cambia de `review_for_coverage` a `review_regular` sigue siendo **una sola tarea**.
- **Ejecución:** guardar la categoría que V4 autorizó en el momento de ejecutar, antes de que la fila runtime cambie a `none`. Un conteo normal inserta un `conteo_detalle`; un reconteo actualiza el detalle previo, por lo que **`COUNT(*) conteo_detalle` no representa observaciones físicas**.

La tarea pasa a `tareas_habilitadas` **solo** cuando resulta **efectivamente ejecutable** según la clase de prioridad máxima del motor y sus restricciones; no basta aparecer en una cola de prioridad inferior, esperar el primer snapshot posterior o existir como obligación administrativa. El recálculo de tareas no duplica identidades ya registradas. Al ejecutarse, se incorpora a `tareas_completadas`; el cambio posterior de prioridad **no borra** lo ya habilitado/completado.

### 4.4. Respetar el Motor V4; no construir otro motor

Orden vigente: `round_coverage → review_for_coverage → review_regular → shift_coverage → none`.

- Utilizar `inventario.solog_cashier_group_actions_v4`, clasificación de prioridad y runtime congelado de sesión; no aproximar la cola `coverage` como «todos los grupos menos reconteos». Hay también grupos previamente acreditados, bloqueados, sin snapshot completo y otros estados no ejecutables.
- **Sin sesión activa:** detectar oportunidades a partir del estado operativo y de la **posibilidad real de iniciar una sesión**; una acción visible con snapshot vencido no debe contarse como oportunidad ejecutable.
- **Con sesión activa:** usar `solog_session_runtime_groups` congelado; la prioridad ejecutable puede descender dentro de esa sesión al completarse sus grupos. Un snapshot externo no reescribe las acciones de la sesión.
- Una prioridad puede subir de nuevo en sesiones/contextos posteriores. Los conjuntos de identidades preservan el acumulado sin duplicación.
- **Habilitaciones dentro de la misma prioridad** deben registrarse aunque no cambie `prioridad_actual`; comparar identidades disponibles con el conjunto acumulado, no solo cantidades o descensos.
- **No crear un nuevo numerador/denominador por transición de prioridad**. Las transiciones son observabilidad secundaria, no límites artificiales del turno.

### 4.5. Turnos, lotes y frontera temporal

La atribución de **Actividad** será por el **turno congelado de la sesión** (`conteos.turno_desde/turno_hasta`) que autorizó el trabajo, incluso si la observación física ocurre después del límite horario. Esta excepción deliberada **solo afecta Actividad**. Mantener `contado_at/recontado_at` como tiempo físico real para episodios, rondas, Drawer, evidencias y demás métricas.

Medida UX aprobada: ante cambio de turno, el frontend debe **intentar enviar** borradores pendientes, cerrar sesión y ofrecer otra sesión del nuevo turno; esto no equivale a modificar el vencimiento del Motor V4 ni garantiza por sí mismo éxito con desconexión.

Un envío válido en recuperación puede llegar después de que Cron evalúe el cierre. La proyección debe aceptar actualización **idempotente y trazable** del acumulador del turno de sesión; la política exacta de cierre provisional/final y corrección mínima se fija en preflight técnico, sin mover arbitrariamente los límites reales de turno.

### 4.6. Actualización y exactitud proporcional

Actualizar de modo transaccional e idempotente cuando haya eventos relevantes: inicio/frontera de turno, snapshot confirmado, inicio/finalización/expiración de sesión, lotes `save_batch` y `recount_save_batch`, desbloqueo/cambio de prioridad, invalidación estructural. En cada ocasión pertinente:

1. Resolver **solo para la sede y contexto** afectados qué tareas son realmente ejecutables por V4.
2. Unir **identidades nuevas** a `tareas_habilitadas`.
3. Incorporar **observaciones nuevas y válidas** a `tareas_completadas` una sola vez (incluyendo reconteos legítimos distintos).
4. Actualizar colas observables y prioridad actual.
5. Derivar `N=|completadas válidas|`, `D=|habilitadas válidas|` y el porcentaje; no utilizar `MAX(completadas + pendientes)` como fuente normal de verdad.

Para retiradas legítimas **detectadas durante el turno**, conservar marcas compactas y descontar cuando el cambio sea inequívoco. No exigir reconstrucción individual de todos los históricos cerrados por exclusiones posteriores. El cierre nocturno y la recuperación tardía no deben perder observaciones ya aceptadas.

**Limitación aceptada:** en sustituciones de tareas o exclusiones estructurales posteriores que no queden reflejadas inequívocamente en los conjuntos, el histórico de Actividad puede mantener una desviación. Debe describirse como limitación de Actividad y no propagarse a precisión física, Riesgo o rondas congeladas.

### 4.7. Presentación vigente

Se conserva la matriz por **día y turno** con `completadas/exigibles` y porcentaje, el desglose de cobertura/reconteos/diarios y estados **Sin tareas / N/D**. La tarjeta de Actividad sigue separada de contribución a Rondas. No se agregan KPI de productividad individual ni cobertura diaria de catálogo.

## 5. Sustituciones documentales específicas

| Fuente base | Nueva lectura obligatoria |
|---|---|
| § 3.3, solo elegibilidad histórica de Actividad | **Excepción nueva:** no exigir re-filtrado/reconstrucción exhaustiva de turnos históricos ante exclusiones posteriores; otras métricas siguen con la regla transversal base. |
| § 5.1, insumo C de Riesgo | C procede de **suma de C24 vigentes por SKU adscrito al grupo actual**; conservar D, V, rangos R, confirmaciones y señales de calidad. |
| § 5.2, calibración C | Fechas y carácter provisional siguen vigentes; se añade tabla auxiliar removible y muestreo Cron cada seis horas. |
| §§ 6.1–6.4, persistencia de Actividad | Conservar finalidad, prioridad V4, fórmula y UI; sustituir hechos individuales persistidos por **acumulador único por turno con conjuntos compactos**, atribución a turno de sesión y precisión histórica excepcionalmente limitada. |
| §§ 7.1–7.4, Movimiento | Sustituir cabeceras/detalles históricos por **una fila SKU/sede, cinco intervalos, C24 por SKU**, composición grupal vigente y sin detalle 90 días. |
| § 8, fuentes | Movimiento: `metrics_movimiento_sku`; calibración independiente: `metrics_calibracion_c24`; Actividad: `metrics_actividad_turnos`. |
| § 10.1 y aceptación 10.3 | Preservar invariantes generales; en movimiento no exigir adscripción pasada ni detalle 90 días; en Actividad utilizar identidades acumuladas y admitir limitaciones históricas descritas, sin renunciar a la idempotencia de eventos ordinarios. |

**No aplicar el reemplazo de persistencia histórica a Rondas, precisión histórica, Episodios o evidencias físicas.** La eliminación del detalle de Movimiento no borra snapshots ni afecta el modelo de diferencias físicas. La excepción histórica de Actividad tampoco modifica la elegibilidad presente de los otros paneles.

## 6. Casos mínimos de aceptación para el delta

1. Seis snapshots consecutivos comparables → cinco intervalos por SKU, con ceros incluidos; tres válidos son el mínimo para C24 medido. Ningún replay agrega un sexto intervalo.
2. Tras caducar intervalos por pasar siete días sin nuevas capturas, la consulta **no devuelve C24 medido obsoleto**. Reconstrucción local desde cinco datos o insuficiencia señalada.
3. Cambio de grupo de SKU incluido → su C24 vigente pasa al nuevo grupo **sin reconstruir la antigua composición**.
4. Excluir SKU → invalida de inmediato su C24; reincorporar → primera captura establece base, sin movimiento ficticio y sin recuperar la ventana antigua.
5. Grupo con SKU de datos parciales → suma de C24 disponibles y señal de calidad; grupo sin base suficiente → factor C=1 imputado y aviso, no C24 cero medido.
6. Muestreo de calibración repetido → no duplica muestras; su eliminación tras noviembre no altera `metrics_movimiento_sku`, los KPI ni sus RPC.
7. Conteo de cobertura + reconteo físico legítimo del mismo grupo → dos unidades de trabajo, con **dos identidades distintas**; reenviar el mismo lote no duplica ninguna.
8. Tareas habilitadas nuevas dentro de la misma prioridad → el denominador aumenta aun cuando el número de tareas de la cola permanezca idéntico tras sustituciones.
9. Prioridad desciende y luego asciende → no elimina completadas ni duplica la habilitación de la misma obligación.
10. Reconteo cambia `review_for_coverage` ↔ `review_regular` → **una identidad**; registrar su clasificación de ejecución para el desglose.
11. Ejemplo aprobado: 14 coberturas + 9 reconteos + 16 diarios habilitados, de los cuales 34 completados en total → **34/39 = 87,2 %**.
12. Sin sesión y sin stock utilizable para abrir sesión → no inventar tareas ejecutables; sin tareas genuinas → «Sin tareas»; ausencia de datos analíticos → N/D.
13. Una sesión de Madrugada que entrega observación física después de 07:30 → se contabiliza en **Actividad de Madrugada**; Drawer/Episodios siguen usando la hora física real.
14. Un turno cerrado que recibe envío posterior válido se regulariza de manera idempotente sin reatribuirlo al turno de recepción.
15. Excluir grupo después del cierre del turno **no obliga a reconstruir todo el KPI histórico de Actividad**; los cortes de Rondas y el resto de las métricas conservan sus contratos independientes.

## 7. Preflight técnico y siguientes pasos (no implementados)

Las decisiones **anteriores están congeladas**. Quedan delegados al siguiente preflight/contrato técnico, **sin autorización para rediseñar lo aprobado**:

- SQL exacto de tablas, columnas, arrays/JSONB, constraints, índices, concurrencia, idempotencia, calidad y caducidad.
- Punto de integración atómico de Movimiento en la transacción ConeXion V2, sin alterar su contrato ni la confirmación vigente.
- Captura de habilitación y observaciones con el estado de runtime V4 **antes de perder su clasificación**; reconciliación de sesión activa/sin sesión, bloqueo por sede, expiración y frontera de turno.
- Coste de escritura real y validación con datos de muestra; tratamiento seguro de cambios estructurales y ventanas incompletas.
- Seguridad: tablas en `inventario` privado, funciones autorizadas, permisos/grants mínimos; no exponer lectura directa a clientes.
- Alta/prueba del **Cron auxiliar** y su eliminación posterior; no confundirlo con el Cron de cierre de Rondas, que continúa siendo otra responsabilidad.
- Contrato completo de nuevas RPC administrativas **antes** de derivar trabajo de frontend a Codex; ningún cambio backend será ejecutado por Codex salvo autorización expresa.

**Estado de implementación:** documentación congelada; **ninguna tabla, función, job Cron, dato remoto, frontend o RPC ha sido creada o modificada por este delta**.

**Trazabilidad:** cualquier incompatibilidad técnica concreta se documentará como bloqueo y volverá a decisión; no se rediseñará automáticamente el Motor V4, ConeXion o la especificación aprobada.
