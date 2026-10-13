# SOLOG — Dashboard Admin: especificación técnica de estado final V1

| Atributo | Valor |
|---|---|
| Estado | **CONGELADO** — especificación funcional y técnica de métricas/persistencia |
| Nivel | C — lógica, datos y backend |
| Fuente primaria | `SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` |
| Alcance | Dashboard Admin: indicadores, denominadores, hechos persistidos, cálculos, temporalidad e integración backend |
| Contratos de nuevas RPC de lectura | Fuera del alcance de esta versión; deben definirse, desplegarse y validarse antes del frontend |
| Última consolidación funcional | 2026-10-13 — cierre funcional: precisión actual compuesta Verde/Amarillo/Rojo; **precisión histórica binaria por último resultado confirmado comparable, independiente de `por_recontar`**; cobertura y contribución por turno congeladas al cierre de ronda; riesgo no disponible en episodios sin confirmación etiquetado «Pendiente de confirmación»; Supabase Cron propuesto como orquestador de cierre (sin despliegue). |

**Prevalencia:** esta fuente es la **única fuente primaria vigente** de métricas y persistencia del Dashboard. Integra y prevalece sobre el delta `SOLOG_Logica_Dashboard_Precision_Actual_Barra_Compuesta_V1.md`, que queda como **documento histórico de decisiones** y no introduce requisitos adicionales. Para responsabilidades entre plataformas rige `SOLOG_Arquitectura_Responsabilidades_Plataformas_V1.md`; para la ingesta ConeXion ↔ Supabase rige `SOLOG_Integracion_ConeXion_Supabase_Contrato_V2.md`. Las reglas operativas del motor de conteos V4 permanecen vigentes. Ante contradicción de contratos existentes, no modificar el motor ni la ingesta sin aprobación específica.

## 1. Estructura del Dashboard

**Finalidad:** la tarjeta principal compara sedes y permite localizar las que requieren atención; la expansión ofrece **Rondas, Riesgo, Episodios y Actividad** como pestañas independientes; el Drawer muestra **un día seleccionado**, nunca dos días simultáneos. Contribución de turnos a la cobertura solo en Rondas; cumplimiento por día/turno solo en Actividad.

| Superficie | Contenido definitivo |
|---|---|
| **Tarjeta por sede: cuatro bloques** | 1. **Cobertura de ronda**; 2. **Precisión actual**, barra excluyente **Verde (Coincide) \| Amarillo (Por validar) \| Rojo (Diferencia confirmada)**, con recuentos y denominador común; 3. **Sobrantes vs Faltantes confirmados vigentes**, dos renglones de grupos e importes con signo, **incluidos los confirmados bajo nueva revisión**; 4. **Grupos con riesgo Alto/Muy alto** sobre confirmaciones vigentes comparables. **Episodios abiertos deja de ser KPI principal.** |
| **Expandido: cuatro pestañas** | **Rondas:** cobertura R1/R2, fotografías históricas de precisión al cierre, evolución de hasta seis rondas, primeros hitos 50/90/100 % y contribución por turno; **transiciones diferidas**. **Riesgo (inicial):** ranking por `R=C×D×V`, seis filas iniciales si hay suficientes, «Ver todos», columnas grupo/diferencia confirmada/valorizado/nivel cualitativo. **Episodios:** abiertos y cerrados recientes, recurrencia móvil 45 días, persistencia sin límite, importancia para ordenar y nivel cualitativo. **Actividad:** matriz `completadas/exigibles` más `%` por día y turno, con desglose de tareas de ronda/reconteo/diario; sin cobertura de turno. |
| **Drawer diario: tres áreas** | **A. Actividad y episodios:** grupos observados, conteos/reconteos, estados y episodios iniciados/cerrados/abiertos al cierre del día. **B. Diferencias confirmadas ese día:** hechos históricos de reconteo `Confirmada`, por fecha física. **C. Detalle de observaciones:** evidencias físicas del día. Sin tabla duplicada de rendimiento ni comparación de dos fechas. |

- La pestaña **Riesgo** abre por defecto; cambiar de pestaña conserva sede y contexto. Las métricas de episodios no se suman algebraicamente desde segmentos Amarillo/Rojo (§ 5.3).
- Riesgo: puntuación y factores C/D/V se usan internamente; **no mostrar sus multiplicadores ni puntaje R como columnas** del ranking. Mostrar diferencia, valorizado y nivel cualitativo, con calidad del movimiento cuando proceda. Episodios puede presentar el mismo nivel como contexto, sin factores.
- Episodios: orden predeterminado **Importancia**, alternativas Recurrencia/Persistencia, desempate estable (§ 5.4). No guardar ni presentar la puntuación I.
- Movimiento teórico: exclusivamente insumo para C; no presentar métricas ni rankings paralelos de movimiento por día, turno, ronda o quincena.
- La **Precisión actual** es dinámica y **no** requiere cobertura completa de ronda. No existen KPI independientes de precisión diaria, por turno o quincenal. La **precisión histórica por ronda** se registra al **cierre temporal real**, sin rehacerla con el estado actual.
- Drawer: una fecha por lectura; la matriz de Actividad sí muestra varios días en columnas sin convertir al Drawer en una comparación multifecha.
- **Eliminar** frecuencia por ronda, rachas e inestabilidad de las nuevas superficies, contratos y persistencias; no mantenerlos como analítica secundaria del grupo. La **transición R1→R2** conserva definición para implementación futura pero no integra la interfaz ni el contrato de lectura inicial (§ 4.2).
- Hitos: mostrar los tres primeros 50/90/100 %; intervalo 90→100 % solo como información secundaria derivada, sin KPI independiente.
- Pop-ups breves para barra compuesta, riesgo y episodios; persistencias menores de 24 h en horas, no «0 días».
- Carga progresiva propuesta para contrato B4: al abrir Dashboard, obtener las cuatro métricas principales por sede; al expandir una sede, cargar **un grupo de pestañas** que convenga optimizar junto y mantener las restantes bajo demanda; al abrir Drawer, pedir sede+fecha. **La agrupación exacta de RPC, payloads, índices y cachés depende del preflight**; no fijar firmas por intuición.
- Aplicar elegibilidad transversal (§ 3.3), con excepciones históricas explícitas.

## 2. Contexto temporal

- Zona horaria de negocio: **`America/Lima`**.
- Quincenas: días **1–15** y **16–último día del mes**.
- Cada quincena contiene **R1** y **R2**, con límites producidos por `inventario.solog_temporal_context(...)`.
- Turnos: **Madrugada** `00:00–07:30`, **Día** `07:30–15:30`, **Noche** `15:30–00:00`.
- Identidad de período: sede + límites temporales reales; no inferir turnos desde la hora de recepción.
- Fechas de observación física: `contado_at` y `recontado_at`, aunque su entrega válida ocurra posteriormente.
- Ventana de recurrencia: **45 días móviles**, definidos respecto del instante de consulta; no equivale exactamente a seis rondas calendarias. Historial de tendencia de rondas: hasta **seis cortes de ronda cerrada**.
- Persistencia de episodio: **sin límite temporal**; la ventana móvil de recurrencia no trunca la antigüedad de un episodio abierto.
- Históricos que requieren nuevas fuentes: **prospectivos desde la activación**. Ausencia de observaciones suficientes: **`N/D`**, no cero.

## 3. Definiciones físicas y KPI principales

### 3.1. Observaciones y resultados consolidados

- Conteo inicial: `d0 = stock_fisico − stock_teorico`, fecha física `contado_at`. Reconteo: `dr = stock_reconteo − stock_teorico_reconteo`, fecha física `recontado_at`.
- **No confundir tres fuentes:** (a) `d0` y `dr` representan las **observaciones físicas** y gobiernan la historia de episodios, el Drawer y las anclas de cobertura; (b) **`conteo_detalle.diferencia` consolidada por V4** es la magnitud **confirmada** que alimenta `metrics_diferencias` y el factor D del riesgo; (c) snapshots teóricos gobiernan stock y factor C, **no** confirman coincidencias físicas.
- Para `Confirmada`, V4 puede conservar la **menor magnitud del mismo signo** entre el conteo inicial y el reconteo; **no sustituir** la diferencia consolidada por `dr`. Persistir el `valor_diferencia` coherente con esa diferencia consolidada, calculado con `inventario.solog_calcular_valor_diferencia(...)` y precios/paquetes **congelados en el caso físico**.
- Una observación inicial distinta de cero entra a `Recontar` y **no** reemplaza la confirmación anterior; una observación `Coincide` válida (normal o reconteo) y un reconteo `Confirmada` **sí** sustituyen el último estado confirmado. `Inconsistente` exige nueva observación sin reemplazar valor; ninguna resolución exclusivamente por snapshot constituye confirmación física válida.
- **Ancla de ronda:** primera observación física válida que acredita cada obligación por sede/ronda/grupo, única e idempotente, para cobertura e hitos. No reutilizar anclas de una composición estructuralmente incompatible; **la tarjeta de diferencias vigentes y la precisión actual no se calculan por anclas de ronda**.
- `Inválido`, evidencia estructuralmente incompatible y coincidencias históricas causadas solo por snapshots no acreditan un nuevo resultado confirmado comparable. Una reactivación o cambio de composición exige volver a validar compatibilidad, sin inventar diferencia cero.

### 3.2. Tarjeta principal y precisión actual

| Bloque | Definición y cálculo | Referencia |
|---|---|---|
| **Cobertura de ronda** | `100 × obligaciones_acreditadas / obligaciones_exigibles`, con grupos 0/0, stock cero y negativos; conserva sus hitos independientes | Ronda vigente (§ 4.1) |
| **Precisión actual** | **Barra excluyente Verde \| Amarillo \| Rojo** sobre los grupos clasificados actuales; `Verde = 100 × G/U`, `Por validar = 100 × Y/U`, `Diferencia = 100 × Rg/U`, `U = G + Y + Rg`; mostrar cantidades exactas, base y exentos; no esperar cobertura 100 % | `inventario.metrics_diferencias` (§ 3.4) |
| **Sobrantes vs Faltantes** | Cantidad de grupos y **suma bruta con signo** de sus **últimas diferencias confirmadas vigentes y comparables**. **Incluir las Confirmadas incluso si `por_recontar = true` / clasificación Amarilla**, hasta reemplazo por nueva confirmación. Azul sobrantes y rojo faltantes; nunca netear | `metrics_diferencias`, estado confirmado subyacente |
| **Riesgo Alto / Muy alto** | Cantidad de grupos con diferencia consolidada confirmada comparable cuyo `R=C×D×V` está en nivel **Alto** o **Muy alto**. Resultado confirmado bajo revisión puede contribuir; no inventar riesgo si falta evidencia válida | `metrics_diferencias` + proyección C (§ 5.1) |

**Clasificación de precisión: conjuntos excluyentes, un grupo = una categoría.** Universo `T` de grupos operativos contables; aplicar en orden:

1. **Amarillo — Por validar (`Y`):** obligación concreta vigente de reconteo `Recontar`, de nueva observación tras `Inconsistente` o de recuperar evidencia por incompatibilidad estructural. **Prioridad visual** sobre Coincide, Confirmada y una exención 0/0 **anteriores**. Conservar sin sobrescribir el último resultado confirmado subyacente. La detección de obligación real debe validarse con el motor V4; no marcar automáticamente al grupo nunca observado como amarillo.
2. **Exento (`Z`):** sin validación activa y última evidencia confirmada comparable con `stock_teorico = 0` **y** `stock_fisico = 0`. La fila de `metrics_diferencias` existe; queda fuera de la barra. `cero_es_cero` no se infiere de diferencia cero, sino de ambos stocks de la evidencia confirmada pertinente (del reconteo si ese fue el último resultado).
3. **Verde (`G`):** `Coincide` físico confirmado comparable, sin pendiente y **no** 0/0.
4. **Rojo (`Rg`):** `Confirmada` física consolidada comparable, sin pendiente, con diferencia no cero.
5. **Sin evidencia (`S`):** sin confirmación comparable y **sin obligación vigente de validación**; no atribuir Verde/Amarillo/Rojo ni exención por defecto. Informar cantidad y señal de base parcial.

**Partición:** `T = G + Y + Rg + Z + S` y `U = G + Y + Rg`. Si `U > 0`, los tres porcentajes comparten **U** y suman 100 % antes de redondear; si `U = 0`, mostrar `N/D`, no 0/100 % arbitrarios. Presentar `G/U` y % destacado, `Y/U` y % visible, leyenda con tres cantidades y valores, `Z` exentos y `S` sin evidencia **fuera de la barra**. Cuando `S>0`, identificar la **base parcial**; cobertura de ronda es otro KPI, no inferirla de U. `Rg` se distingue de la puntuación de riesgo `R`.

**Ejemplo aprobado:** `G=240`, `Y=70`, `Rg=40`, `Z=50`, `S=0`; `T=400`, `U=350`: Verde **68,57 %**, Amarillo **20 %**, Rojo **11,43 %**. Orden **Verde \| Amarillo \| Rojo**. Una confirmación previa (roja o verde) pasa a **Amarillo** ante nuevo pendiente, sin duplicar categorías. Si había 0/0 previo y aparece nueva diferencia por validar, también pasa a Amarillo. Concluir que `Amarillo + Rojo = episodios abiertos` está **prohibido**: miden objetos diferentes.

**Diferencias confirmadas vigentes frente a precisión:** una fila `Confirmada −8` con nuevo `Recontar` aporta **Amarillo a la barra** y sigue aportando **−8 (valorizado congelado) a Faltantes**, hasta que una confirmación física válida posterior actualice el estado. **No agregar un segundo aviso de revisión en el KPI monetario**: el Amarillo de precisión ya da contexto; el detalle de grupo puede mostrar la obligación. Por ello, **la cantidad de grupos en Sobrantes/Faltantes no tiene por qué coincidir con `Rg`**. Lo mismo aplica al ranking y al cuarto KPI de riesgo, que se basan en confirmaciones subyacentes válidas, no exclusivamente en el tramo Rojo.

- Sobrantes/Faltantes: una sola contribución por grupo según signo **actual confirmado**, no una por signo/ronda; la confirmación `Coincide` posterior retira el aporte. No presentar sobrante como ingreso ni faltante como pérdida demostrada.
- Resultados confirmados sin valorización válida: incluir en cantidad de grupos con diferencia y **señalar importe incompleto (`N/D`)**; no tratar ausencia de precio/valor como S/0. La agregación exacta y formato del subtotal parcial se definen en preflight RPC.
- Para grupos bajo revisión conservar separadamente **estado de confirmación** y **estado de obligación actual**: permitir lecturas distintas para barra excluyente y para última diferencia confirmada. Las invalidaciones que rompen comparabilidad **suspenden** el aporte al KPI monetario y de riesgo, sin convertirlo en cero.

### 3.3. Elegibilidad analítica transversal de grupos

- **Regla general aprobada:** el Dashboard solo presenta métricas de grupos que **actualmente** son operativos y contables, según `inventario.grupos_conteo` y sus SKU incluidos en `inventario.catalogo`. Un grupo excluido/desactivado o sin SKU operativos incluidos **deja de contribuir también a métricas de días y períodos históricos visibles**; no se eliminan observaciones, episodios ni tareas persistidas.
- Excluir **grupos**; excluir un SKU de un grupo que conserva integrantes operativos **no** excluye automáticamente ese grupo. Las modificaciones estructurales de composición continúan sujetas a las reglas propias de cobertura, validez de evidencia y actualización localizada de `metrics_diferencias` (§§ 3.4 y 4).
- Aplicación: sobrantes/faltantes, episodios abiertos/iniciados/cerrados, recurrencia, persistencia, importancia, rankings, diferencias confirmadas, resultados y grupos observados diarios; también a los conjuntos por grupo/tarea que sustentan los indicadores de turnos. **No basta filtrar un total agregado que ya perdió identidades de grupo.**
- **Excepciones deliberadas:** los **cortes históricos de precisión**, la **cobertura final y contribución por turno de rondas cerradas**, y los **primeros hitos de cobertura de 50 %, 90 % y 100 %** conservan el universo y los valores registrados; no reconstruirlos retrospectivamente por una exclusión posterior. La **cobertura de ronda aún abierta** sí responde a cambios estructurales (§ 4), pero no activa una certificación nueva de precisión al alcanzar 100 %.
- La elegibilidad histórica visible se decide con el **estado operativo actual del grupo**, no con una historia completa de estados de exclusión. Es deliberado que al excluir un grupo cambien algunos resultados históricos visibles; los hechos originales permanecen íntegros para auditoría.
- La exclusión **no** produce una resolución física ni un cierre ficticio de episodio. Si un grupo es reactivado, un episodio antiguo sin cierre no vuelve automáticamente al ranking como problema activo: antes se requiere **nueva evidencia física válida y comparable**; no atribuirle una antigüedad operativa continua por el período excluido. Resolver el mecanismo exacto en preflight de episodios sin modificar automáticamente el motor V4 (§ 5.3).
- Aplicar un criterio centralizado de elegibilidad en el backend y reutilizarlo en lecturas analíticas; preservar idempotencia y no añadir una reconstrucción histórica completa por cada exclusión.

### 3.4. Proyección compacta `inventario.metrics_diferencias`

**Responsabilidad única:** materializar la última diferencia **consolidada y físicamente confirmada** de cada **sede + grupo**, conservando por separado el estado actual de obligación de validación. **No** reemplaza el historial `conteo_detalle`, el motor `estado_stock_grupo` ni el historial de episodios. Una fila por pareja sede/grupo, incluidos sin evidencia y exentos 0/0; clave `(sede_id, grupo_conteo_id)`.

**Campos conceptuales mínimos** (nombres/tipos definitivos pendientes del preflight): sede y grupo; `estado_confirmado` (`Coincide`/`Confirmada`/sin resultado), `diferencia` consolidada V4 y `valor_diferencia` congelado, `observacion_origen_id` y `confirmado_at`, stocks teórico/físico de la **evidencia confirmante** o indicador derivable `cero_es_cero`, precio unitario de referencia y `factor_v_riesgo`, **estado/motivo de validación** (reconteo/nueva observación/incompatibilidad/ninguno), comparabilidad y marcas de actualización. `por_recontar` puede derivarse del estado de validación; no mantener booleanos independientes redundantes sin reglas de integridad.

- `Coincide` de conteo normal válido o reconteo físico y `Confirmada` de reconteo actualizan resultado y evidencia. `Recontar` e `Inconsistente` **conservan** la última confirmación subyacente y actualizan solo obligación de validar. Resultado pendiente sin confirmación previa conserva `NULL`, no cero.
- Actualizar factor V desde **`grupos_conteo.precio` unitario vigente**, sin recalcular `valor_diferencia`, que permanece congelado por caso; cambios de precio actualizan V aunque no haya conteo nuevo. Un grupo con exención 0/0 se mantiene como fila para distinguirlo de «sin evidencia».
- Excluir de métricas actuales las evidencias incompatibles, grupos excluidos/inactivos/sin SKU incluido y coincidencias legadas debidas solo a snapshots; **no borrar ni fabricar resultados cero**. Invalidación estructural, reactivación y reconteo tardío requieren reconciliación localizada del grupo.
- Actualización backend **transaccional, incremental e idempotente** junto al hecho válido, con manejo del orden físico de eventos, replay y concurrencia. La reconstrucción extraordinaria es **por sede/grupo**, no un barrido global al consultar el Dashboard. Backfill inicial solo con hechos identificables como físicos válidos; los siete casos legados de `Coincide` por snapshot detectados en preflight exploratorio no se convierten automáticamente en confirmaciones.
- `metrics_diferencias` es una proyección de lectura **actual**, no un historial por período. Control, cronología del Drawer y cortes de ronda necesitan sus propias fuentes temporales; no sustituir esas RPC históricas por un estado único actual.
- No aumentar `estado_stock_grupo` con estas columnas: su función continúa siendo la operación del motor V4. **Migración, RLS, autorización, bloqueos y contratos RPC aún no están desplegados ni congelados técnicamente**.

## 4. Cobertura y análisis de rondas

### 4.1. Denominador y acreditación de cobertura

- Universo de **cobertura**: todos los grupos activos y contables exigibles para la sede, **incluidos stock 0 y stock negativo**.
- `requiere_snapshot_completo` y otras restricciones temporales no excluyen un grupo del denominador administrativo de cobertura.
- No incluir grupos desactivados, vacíos o sin SKU operativos incluidos.
- Inicializar obligaciones por sede y ronda desde catálogo/grupos; **no** derivar el denominador únicamente de `estado_stock_grupo`.
- Altas: incorporar la obligación desde su activación. Bajas: retirar del universo exigible vigente. Cambios estructurales de composición exigen nueva acreditación según V4, sin sustituir su identificación histórica ni reinstaurar evidencia inválida.
- Una obligación se acredita por una observación física válida; no se duplica por reconteos, conteos diarios o reintentos. Conservar referencia de observación, origen (`normal`/`recount`) y turno contribuyente.
- Cobertura vigente = obligaciones acreditadas vigentes / obligaciones exigibles vigentes. Conservar los primeros hitos de 50 %, 90 % y **100 % inmutables**, aunque el universo cambie más tarde.
- Cuando cambie estructuralmente el universo, reevaluar cobertura y acreditaciones válidas: puede bajar de 100 %; la **Precisión actual** se calcula por resultados consolidados comparables sin depender de ese umbral. Conservar los hitos alcanzados en su momento (§ 4.3).
- Un cambio normal de stock entre snapshots, incluida la transición de exento 0/0 a stock positivo o negativo, **no reabre por sí mismo la cobertura** ni modifica una confirmación física previa; los conteos diarios siguen bajo V4 y solo resultados físicos válidos cambian la precisión actual.

### 4.2. Indicadores de ronda y comparaciones

| Indicador | Regla |
|---|---|
| Cobertura R1 y R2 | **Ronda abierta:** obligaciones acreditadas / exigibles vigentes, sensible a cambios estructurales. **Ronda cerrada:** cobertura y denominador capturados al cierre temporal, inmutables ante cambios futuros; no recalcular con elegibilidad actual |
| **Precisión histórica R1 y R2** | **Fotografías binarias de último resultado confirmado comparable al cierre**: Coincide vs Confirmada, **ignorando `por_recontar` para clasificar**, con denominador propio, exentos 0/0, sin confirmación y cobertura final congelada. **No hay tramo Amarillo histórico**; no confundir con la barra actual dinámica |
| Evolución R1 → R2 | Comparar porcentajes, cantidades y denominadores **de ambos cortes al cierre**; si falta un corte, `N/D`. Un solo gráfico de tendencia de hasta seis rondas y variación contextual; no añadir gráfico redundante |
| Hitos 50 %, 90 %, 100 % | Primer momento de cada umbral, inmutable, referido al comienzo programado de ronda; mostrar principalmente esos tres |
| Cola 90 % → 100 % | Diferencia derivada entre los primeros hitos, secundaria y solo cuando existen ambos; sin KPI independiente |
| Contribución por turno | **Primeras acreditaciones** por Madrugada/Día/Noche en Rondas. **Ronda abierta:** según obligaciones vigentes; **ronda cerrada:** cantidades congeladas al cierre, conservadas ante cambios posteriores de elegibilidad o composición; no en Actividad ni Drawer |
| **Transiciones R1 → R2 (futuro)** | **Definidas pero expresamente fuera de implementación actual**: `0→0`, `0→≠0`, `≠0→0`, `≠0→≠0` por primeras anclas físicas válidas emparejadas del mismo grupo y **composición comparable**. Excluir parejas **0/0 en ambas rondas**; conservar signos si aportan contexto. No crear nuevas persistencias, RPC ni UI en esta etapa |

### 4.3. Precisión actual y corte histórico al final de ronda

- **Precisión actual**: contrato dinámico de §§ 3.2–3.4, **independiente de completar el 100 % de cobertura**. Una nueva confirmación física válida cambia la proyección; una nueva revisión pendiente cambia **su tramo visual a Amarillo**, aunque conserve la confirmación almacenada. Snapshot por sí solo no confirma nada.
- **Corte histórico:** capturar atómicamente, al **final temporal programado de la ronda**, la **última confirmación física válida y comparable de cada sede + grupo** existente hasta ese instante; **ignorar `por_recontar`, `Inconsistente` u otras revisiones abiertas como categoría de precisión**. No se crea un corte al primer 100 % ni en cada reconteo. El estado pendiente **no borra ni sustituye** la confirmación física anterior para este corte.
- **Clasificación histórica binaria:** `H_G` = grupos con último estado confirmado `Coincide` (no 0/0); `H_R` = grupos con último estado confirmado `Confirmada`; `H_Z` = grupos cuya confirmación es teórico 0 / físico 0; `H_S` = grupos sin confirmación física utilizable/comparable (tengan o no pendiente abierto). `H_T = H_G + H_R + H_Z + H_S` y **`H_U = H_G + H_R`**. Precisión histórica = **`100 × H_G / H_U`**, diferencias confirmadas = `100 × H_R / H_U`; `H_U = 0` → `N/D`. **No existe Amarillo (`Y`) histórico** ni se importan los segmentos actuales `G/Y/Rg` para reconstruirlo.
- **Ejemplos del corte:** `Coincide` anterior + `por_recontar=true` → `H_G`; `Confirmada −8` anterior + `por_recontar=true` → `H_R` (conservar −8 y su evidencia); `Coincide 0/0` anterior + nuevo `Recontar` → `H_Z`, mientras aquella evidencia siga siendo comparable; primer `Recontar` sin confirmación previa → `H_S`. Una incompatibilidad estructural que invalide la última confirmación la retira de `H_G/H_R/H_Z` y la deja en `H_S`, nunca en cero inventado.
- **Contenido congelado:** sede, período/ronda y límites exactos, totales `H_G/H_R/H_Z/H_S/H_T/H_U`, porcentajes derivables, **cobertura final y denominador de obligaciones al cierre**, **contribución por turno al cierre**, universo/identidad de los grupos y referencias a últimas confirmaciones físicas comparables, suficientes para reconstruir y auditar la fotografía. Una confirmación anterior a esta ronda puede integrarla si todavía es el último resultado confirmado comparable.
- Los cortes históricos, la cobertura final y la contribución por turno **permanecen inmutables para lectura ordinaria**, aun si después se excluye un grupo, cambia el catálogo o se resuelve una revisión. Son excepciones de la elegibilidad transversal (§ 3.3); los primeros hitos 50/90/100 % son inmutables desde su primera ocurrencia, independientemente del cierre.
- **Entrega tardía e invalidación retroactiva:** una observación física con timestamp dentro de una ronda cerrada no autoriza recalcular silenciosamente desde la fila presente de `metrics_diferencias`. Requiere un proceso excepcional, **auditado y versionado o con trazabilidad equivalente**, cuya política exacta se definirá en el preflight. Si no puede producirse un corte verificable, `N/D`.
- Un snapshot sin nueva observación física no crea coincidencia confirmada ni transforma una exención 0/0 anterior en no exenta. El corte guarda la exención de la **última confirmación** comparable al cierre.

### 4.4. Persistencia mínima de rondas

- **Ronda abierta:** cabecera y obligaciones por sede/ronda/grupo con universo vigente, acreditación y primera evidencia física válida; primeros hitos 50/90/100 % registrados **en el momento de ocurrir**. Su contribución por turno se puede recalcular según obligaciones vigentes mientras esté abierta.
- **Ronda cerrada:** persistir **cobertura final y contribución por turno** al cierre junto al universo de obligaciones y anclas que justifican los totales, sin reescribirlos por modificaciones posteriores; primeros hitos ya registrados permanecen inmutables.
- **Precisión histórica:** `inventario.metrics_rondas_cortes` (nombre conceptual), con resumen binario `H_G/H_R`, exentos `H_Z`, sin confirmación `H_S`, denominadores y referencias de evidencia por grupo, además del corte de cobertura/contribución. No persistir segmento amarillo de precisión histórica ni copiar todo el catálogo/SKU de cada evento; **las identidades y fuentes por grupo necesarias para auditar la clasificación deben conservarse**.
- **Supabase Cron es el orquestador previsto para el cierre temporal**, no el sustituto de la lógica transaccional que forma el corte. La ejecución puede ser posterior al límite real: la función debe reconstruir **el estado «a fecha de cierre»** y no fotografiar sin más el valor actual. Horarios, bloqueo, transacción, precisión temporal, recuperación ante cron omitido y reintentos se resuelven en preflight; **no hay jobs activados por esta especificación**.
- Un cierre debe ser **idempotente** ante múltiples disparos y concurrencia. Una corrección extraordinaria por evidencia tardía debe quedar **auditada/versionada**, nunca confundirse con una actualización ordinaria de Precisión actual.
- La precisión histórica binaria se muestra en **Rondas**, separada de la barra actual ternaria de portada. El hito 100 % no congela precisión. Los cortes anteriores a la activación solo se ofrecen con backfill verificable; en otro caso `N/D`.

## 5. Episodios, recurrencia y riesgo

- **Episodio:** comienza con una observación física válida de `d ≠ 0`, continúa mientras no haya una coincidencia física posterior válida, y termina únicamente con la siguiente observación física válida `d = 0`, sea conteo o reconteo.
- Un reconteo `Confirmada`, parcialmente reducido, `Inconsistente` o un cambio de signo **no** cierra el episodio. Tampoco lo cierra un snapshot, una exclusión de grupo o un evento administrativo.
- **Episodios abiertos operativos:** episodios no cerrados físicamente **de grupos actualmente elegibles** y con evidencia operativa comparable, según § 3.3. Un grupo aporta a lo sumo un episodio operativo abierto.
- **Persistencia:** duración entre apertura y cierre físicos; para episodio abierto, tiempo real transcurrido desde apertura hasta la consulta, **sin límite de días**. La antigüedad mide tiempo sin resolución observada, no prueba de diferencia física continua.
- **Recurrencia:** nueva apertura física posterior a un episodio que **sí** fue cerrado mediante observación física. Se cuentan solo las reaperturas ocurridas en los **últimos 45 días móviles**, aunque el episodio anterior cerrado haya quedado fuera de la ventana. No confundir observaciones consecutivas con diferencias con nuevas recurrencias.
- **Importancia:** puntuación auxiliar exclusiva de la pestaña Episodios, calculada a partir de recurrencia y persistencia real (§ 5.4). No reemplaza al riesgo C×D×V ni se presenta como nueva columna/KPI.
- `Inválido`, evidencia estructuralmente incompatible o eventos fuera de secuencia no constituyen aperturas ni cierres válidos. No convertir una invalidación o desactivación en resolución física. Corregir de forma localizada las proyecciones afectadas por cambios de validez o eventos físicos tardíos.
- **Pestaña Riesgo:** ranking descendente por puntuación interna de confirmaciones consolidadas (incluidas confirmadas bajo revisión), desempates por **abs(valorizado confirmado)** / **abs(diferencia consolidada)** / ID; seis filas iniciales si existen, «Ver todos», y alternativas por valorizado o diferencia. Mostrar grupo, diferencia, valorizado y nivel cualitativo, sin puntajes/multiplicadores.
- **Pestaña Episodios:** pestaña independiente de Riesgo; muestra episodios abiertos/cerrados recientes y lista de episodios abiertos operativos con **grupo, recurrencia de 45 días, persistencia real y nivel de riesgo**. Por defecto ordenar por Importancia; permitir órdenes Recurrencia y Persistencia. El historial de episodios cerrados se consulta separadamente.
- **Histórico R1/R2:** la tendencia utiliza exclusivamente los **cortes de precisión al cierre de ronda**, sin métricas de frecuencia por ronda, rachas o inestabilidad. No mezclar seis rondas históricas con los 45 días móviles de recurrencia.
- Elegibilidad transversal de § 3.3: grupos actualmente excluidos desaparecen también de resultados históricos visibles de episodios/riesgo sin borrar los registros base. Los **cortes históricos al cierre de ronda** son excepción, no los episodios.

### 5.1. Índice de riesgo por grupo y sede

- Objetivo: priorizar **grupos con diferencias físicamente confirmadas y comparables**, no estimar probabilidad de pérdida ni inventar causalidad del movimiento. Identidad: sede + grupo; no fragmentar observaciones de grupo multi-SKU entre productos.
- Fórmula interna: **`R = C × D × V`**. **C** es la intensidad de cambios teóricos absolutos por SKU (§ 7.3); **D** es la magnitud absoluta de **`metrics_diferencias.diferencia` consolidada V4**, no necesariamente `dr`; **V** es **precio unitario** del grupo, no valorizado total de la discrepancia.
- Fuente V: `grupos_conteo.precio` **vigente**, multiplicador almacenado en `metrics_diferencias.factor_v_riesgo`; para `valor_diferencia` (importe mostrado) conservar **el valor congelado del caso confirmado**, con paquetes según función de valorización V4. Cambio de precio unitario puede cambiar V sin revalorizar la diferencia confirmada.

| Dimensión | Bajo | Medio | Alto |
|---|---|---|---|
| **C: cambio de stock (provisional)** | `0 ≤ C24 ≤ 10` → **1** | `10 < C24 ≤ 50` → **2** | `C24 > 50` → **4** |
| **D: diferencia consolidada absoluta (unidades)** | `1–5` → **1** | `6–11` → **2** | `≥12` → **3** |
| **V: precio unitario de grupo (S/)** | `0–14` → **1** | `>14 y <40` → **3** | `≥40` → **5** |

| Puntaje R | Clasificación |
|---|---|
| **0** | Sin diferencia confirmada |
| **1–2** | Bajo |
| **3–4** | Medio-bajo |
| **5–8** | Medio |
| **9–14** | Medio-alto |
| **15–29** | Alto |
| **30–60** | **Muy alto** |

- R=0 **solo** para resultado físico confirmado/comparable `Coincide` con diferencia cero. **Sin confirmación** o confirmación estructuralmente incompatible = `N/D`/sin evidencia, **no** riesgo cero. Una `Confirmada` bajo nueva revisión puede seguir puntuando por su última diferencia consolidada comparable; el grupo va a Amarillo en precisión pero continúa participando del ranking de riesgo confirmado y del cuarto KPI.
- El factor V es independiente de la magnitud de la diferencia: un grupo caro con pocas unidades puede justificar más riesgo unitario. **Valorizado monetario de la diferencia sigue visible como magnitud de negocio**, pero no es factor V. Si falta precio unitario utilizable: V/R `N/D`, no cero. No utilizar `precio_paquete/unidades_por_paquete` para V.
- Si C carece de al menos tres intervalos comparables, **imputar `C=1`** e indicar «Movimiento: datos insuficientes»; no presentar Bajo como si estuviera medido. Cortes de C siguen provisionales hasta calibración.
- Recalcular ranking cuando cambien C, diferencia/confirmación, precio unitario/factor V o elegibilidad. Orden: puntuación R desc, abs(valorizado confirmado) desc, abs(diferencia consolidada) desc, ID estable. **No** exponer puntaje R ni multiplicadores en la tabla: mostrar grupo, diferencia con signo, valorizado con signo, nivel cualitativo y señal de datos insuficientes si aplica. No clasificar valores no válidos como cero.
- Movimientos teóricos y diferencias no prueban ventas, ingresos ni pérdidas definitivas.

### 5.2. Calibración del componente C

- Fórmula de media móvil y reglas de suficiencia: **congeladas** según § 7.3.
- Cortes iniciales de C (`10` y `50` unidades observadas por 24 horas): **provisionales**, pendientes de calibración con datos reales.
- **Calibración 1:** inicios de **noviembre de 2026**, para ajustar umbrales de C.
- **Calibración 2:** mediados de **noviembre de 2026**, para revisar estabilidad y establecer umbrales definitivos de C.
- Utilizar observaciones comparables y suficientes. Si la recopilación real es insuficiente, mantener los umbrales provisionales e informar el bloqueo; no inventar umbrales definitivos.
- D, V (por precio unitario S/14/S/40) y rangos R, incluido Muy alto desde 30, **no** se recalibran automáticamente con C.

### 5.3. Persistencia de episodios y actualización incremental

**Objetivo:** evitar escanear íntegramente `inventario.conteo_detalle` en cada consulta del Dashboard. Se conserva como fuente autoritativa de observaciones; la proyección compacta persistida de episodios es la fuente de consulta ordinaria para su estado y métricas.

- Persistir una fila por **episodio de sede + grupo**, con identidad única, orden/secuencia para trazabilidad, `apertura_at`, `cierre_at` nullable, `observacion_apertura_id`, `observacion_cierre_id` nullable, `ultima_observacion_at` y referencias de validez/comparabilidad suficientes. Nombre conceptual bajo la convención nueva: **`inventario.metrics_episodios`**, no desplegada; columnas e índices definitivos se congelan en preflight backend.
- **Primera diferencia válida** sin episodio operativo abierto: abrir episodio. **Diferencias posteriores no cero:** actualizar última observación, sin duplicar apertura ni contar recurrencia. **Primera coincidencia física válida posterior:** cerrar el episodio y enlazar evidencia. **Siguiente diferencia posterior al cierre:** abrir nuevo episodio; contará como recurrencia si existe cierre físico previo acreditado.
- Atribuir fechas por observación física real (`contado_at`/`recontado_at`, Lima para consulta de día), no por confirmación de snapshot ni recepción del envío. Orden cronológico determinista con desempate por identidad de observación; reintentos y reprocesamientos son idempotentes.
- Persistencia de abiertos: **no guardar un contador creciente de días**. Guardar `apertura_at`; la duración se deriva en la lectura (`ahora − apertura_at`). Los episodios cerrados utilizan `cierre_at − apertura_at`. No truncar a 45 días.
- Observación tardía o invalidación retroactiva: reconstruir **solo la secuencia de sede + grupo** afectada desde hechos físicos válidos, corrigiendo aperturas, cierres y recurrencias sin reconstrucción general en cada lectura; auditar correcciones. No inventar cierres físicos por cambios estructurales.
- Una exclusión actual hace al grupo inelegible para **todas** las métricas visibles de episodios, incluso históricas, mediante filtro de § 3.3. Mantener filas originales. Reactivar requiere evidencia física comparable nueva para volver a mostrar un episodio abierto; no reanudar automáticamente la antigüedad de un episodio anterior sin cierre físico, ni registrar una recurrencia ficticia por la reactivación.
- Índices por sede/grupo y estado de apertura/cierre, y por sede/`apertura_at` y sede/`cierre_at` para lecturas de días y ventana. Seguridad, transacciones y bloqueo de concurrencia al integrar con mutaciones V4 se resuelven en preflight. **Sin tabla de agregados diarios de episodios en esta V1.**

### 5.4. Recurrencia, persistencia e importancia en la pestaña Episodios

- **Recurrencia `rec_45(g,t)`:** número de **aperturas físicas de nuevos episodios** ocurridas en `[t−45 días,t]` que cuentan con **un episodio anterior del mismo grupo y sede cerrado físicamente antes de esa apertura**. La apertura inicial no es recurrencia; observaciones con diferencia dentro del mismo episodio tampoco. Conservar el histórico anterior a la ventana para verificar cierres previos.
- **Persistencia abierta:** `P_días(g,t) = (t − apertura_at) / 24 h` como valor decimal continuo; no aplicar `floor` antes de ordenar. Si está cerrado, duración total desde apertura hasta cierre. **Sin límite** por 45 días o por las seis rondas mostradas en Rondas.
- **Importancia:** `I(g,t) = (rec_45(g,t) + 1) × P_días(g,t)`. Solo se utiliza para **ordenar episodios abiertos operativos**. **Orden predeterminado:** Importancia descendente; órdenes alternativos: Recurrencia descendente y Persistencia descendente. En empate, priorizar mayor persistencia y después fecha/identidad estable. La puntuación I **no se persiste** ni se muestra como columna.
- **Presentación:** persistencia menor a 24 horas en **horas** («X horas»; si todavía no alcanza una hora, «menos de 1 hora»), evitando «0 días»; a partir de 24 horas, días y horas cuando aporten contexto. Para ordenar siempre usar el valor temporal real, aun en episodios de minutos.
- **Lista visible:** grupo, recurrencias (45 días), persistencia del episodio actual y **nivel cualitativo de riesgo**; no mostrar fórmulas ni multiplicadores internos. **Si existe episodio físicamente abierto pero no diferencia confirmada vigente y comparable para calcular riesgo, mostrar «Pendiente de confirmación»**, en vez de «Sin diferencia» o Bajo. Si el riesgo es indeterminado por otro motivo (precio/comparabilidad/insuficiencia no imputable), señalar `N/D` con su motivo. Una confirmación negativa/positiva comparable anterior bajo nueva revisión puede mantener su clasificación de riesgo, aunque el episodio dependa de la secuencia física.
- **Episodios abiertos:** no tienen ventana máxima de antigüedad. **Cerrados recientes:** contar aquellos con cierre físico válido en los últimos 45 días, sin recortar su duración histórica. El período de 45 días regula análisis reciente, **no retención física**; no eliminar episodios que hayan salido de la ventana.
- Si aún no existe histórico anterior suficiente para demostrar una reapertura, no suponer episodios inexistentes: contar solo recurrencias verificadas y conservar señal de cobertura histórica cuando corresponda.

## 6. Actividad y cumplimiento de tareas por turno

**Objetivo:** medir cuánto trabajo ejecutable fue completado en cada turno y cuánta carga exigible tuvo realmente. **No** se mide una cobertura diaria ni una cobertura del catálogo por turno: el mismo grupo puede generar conteos de ronda, conteos diarios en turnos distintos y reconteos físicos. La cobertura administrativa de ronda y la contribución de primeras acreditaciones continúan exclusivamente en § 4.

### 6.1. Prioridades V4 y habilitación efectiva

- Orden operativo confirmado: **`round_coverage` → `review_for_coverage` → `review_regular` → `shift_coverage` → `none`**. La prioridad determina **qué puede ejecutarse en ese momento**, no cuántas tareas existen como pendientes en las tablas.
- **Ronda:** las obligaciones pendientes se derivan del universo vigente (`grupos exigibles − obligaciones ya acreditadas`), pero para **Cumplimiento de tareas** solo contribuyen aquellas que el motor habilitó efectivamente al turno. Una obligación administrativa bloqueada por snapshot completo u otra restricción **permanece en el denominador de cobertura de ronda**, pero **no** en el de cumplimiento mientras sea imposible ejecutarla.
- **Reconteo:** la existencia de un caso abierto `Recontar` **no basta** para hacerlo exigible en un turno: debe contar con primer snapshot posterior y cumplir la prioridad V4, la sesión y sus restricciones. Mientras espera snapshot o permanece bloqueado sin haber sido habilitado, no cuenta.
- **Conteo diario:** un grupo `Cambio_reciente` solo aporta tarea cuando V4 permite la acción `shift_coverage` dentro del turno correspondiente; no se transforma automáticamente todo el catálogo en tareas de turno al llegar la cobertura de ronda a 100 %.
- **Sesiones congeladas:** con sesión activa, usar `solog_session_runtime_groups` y la prioridad del contexto congelado. Un nuevo snapshot o un cambio global de prioridad no cambia silenciosamente las acciones de esa sesión; la eventual habilitación posterior debe registrarse cuando sea realmente ejecutable conforme al motor.
- Sin sesión activa: identificar habilitaciones reales a partir del estado operativo/snapshot y las prioridades del motor, **sin depender de que el usuario abra una pantalla**.
- Al llegar la ronda a 100 % **dentro de un turno**, primero terminar la cobertura, después atender reconteos ejecutables y finalmente conteos diarios habilitados; no crear una nueva cobertura completa de turno ni partir artificialmente el turno en dos.

### 6.2. Cumplimiento: fórmula y denominador acumulativo

**Indicador único de rendimiento:** **Cumplimiento de tareas**, no «Cobertura del turno» ni «Eficiencia del turno».

`Cumplimiento_turno = 100 × completadas / exigibles`, siendo `exigibles = completadas + pendientes_válidas_ejecutables`. Si `exigibles = 0`, presentar **«Sin tareas» / `N/D`**, nunca 0 % ni 100 %.

- **Numerador:** tareas válidas **completadas físicamente** en el turno y acreditadas por tipo (`round_coverage`, reconteos `review_for_coverage`/`review_regular` y conteos diarios `shift_coverage`), sin duplicarlas por reintento, replay ni por múltiples vistas.
- **Denominador:** conjunto **acumulativo** de tareas con habilitación operativa efectiva durante el turno, contando completadas y pendientes válidas. Una tarea que se habilita y se completa no desaparece al cambiar de fase/prioridad; el total de la celda conserva la carga ya ejecutada.
- **Al iniciar turno:** incorporar tareas realmente ejecutables. Para cobertura de ronda, el saldo administrativo `G − acreditadas` orienta la carga, pero **no reemplaza la comprobación de habilitación real** del motor.
- **Durante turno:** incorporar cada reconteo o conteo diario **cuando llegue a ser ejecutable** según V4. Con cobertura terminada a mitad de turno, sumar las tareas de ronda ya habilitadas/completadas y las nuevas tareas habilitadas después: **no reiniciar** el denominador al alcanzar 100 %.
- **Tareas bloqueadas:** excluir del denominador **mientras no puedan ejecutarse** (espera de snapshot posterior, snapshot completo, prioridad superior aún no levantada, restricción operativa legítima). No penalizar al trabajador por trabajo imposible. Registrar motivo y, cuando proceda, instante de desbloqueo.
- **Bloqueo posterior:** una tarea que ya estuvo habilitada y continúa válida **no se retira retroactivamente solo porque cambie la prioridad global**; puede seguir pendiente en el acumulado. Si una imposibilidad real la invalida o retira legítimamente, excluirla del total final y dejar evidencia de la retirada. No confundir bloqueo temporal, cambio de prioridad y retirada válida.
- **Identidad de tarea:** sede + turno temporal + grupo + clase/tipo de acción + referencia de obligación/caso cuando corresponda (para reconteos, `conteo_detalle_id`); registrar una nueva instancia solo si existe **una nueva obligación legítima** tras invalidación estructural, retirando la anterior. No duplicar una tarea por reintentos, recálculos o reaparición de la misma habilitación.
- **Tareas retiradas legítimamente:** excluidas tanto de completadas como de pendientes válidas del denominador final, con motivo trazable. Un turno sin trabajo ejecutable se muestra «Sin tareas».
- **Cierre vs turno en curso:** los contadores del turno actual son **provisionales**, pues pueden incorporarse nuevas tareas; turnos cerrados muestran el resultado consolidado, sujeto solo a correcciones legítimas por entrega tardía o invalidación.
- El cumplimiento es **de trabajo habilitado**, no productividad individual ni precisión física del stock; mostrar **numerador, denominador y porcentaje** para permitir comparar cargas desiguales.

**Ejemplo aprobado de transición a las 6:00 p. m. dentro de Noche (datos ficticios):** 14 tareas de cobertura habilitadas/completadas + 9 reconteos habilitados/completados + 16 conteos diarios habilitados, de los cuales 11 se completan = **34 completadas / 39 exigibles = 87,2 %**. La hora de alcanzar 100 % no corta ni reinicia el turno. Un reconteo que todavía espere snapshot posterior no se suma a las 39 tareas.

### 6.3. Presentación de la pestaña Actividad

- **Pestaña propia del expandido** llamada **Actividad**, junto con Rondas, Riesgo y Episodios. Su contenido principal es una **matriz por día y turno** de la sede elegida, con **filas Madrugada/Día/Noche y columnas por fechas** de consulta.
- Cada celda muestra en dos líneas **`completadas/exigibles` y `%`**; el denominador debe estar visible sin acciones adicionales. Sin tareas: **«Sin tareas»**; ausencia de datos analíticos por no disponer de la nueva persistencia: **`N/D`** con indicación pertinente. Distinguir turnos **en curso** de **cerrados**.
- El desglose de una celda identifica las **tareas de cobertura de ronda**, **reconteos** (incluidos los dos tipos de revisión V4) y **conteos diarios** realizados. Es actividad operativa, no primeros hitos de acreditación de ronda: la **contribución de cada turno a la cobertura de ronda solo se presenta en Rondas** (§ 4.2).
- No añadir cobertura del turno, porcentaje de grupos observados del catálogo ni precisión por turno. La matriz multifecha de Actividad es independiente de la navegación por **una sola fecha** del Drawer (§ 6.4).
- El backend devuelve conteos y denominadores autoritativos por sede + fecha + turno. No inferir tareas exigibles a partir del número de conteos ni de `conteo_detalle` únicamente.

### 6.4. Persistencia compacta y Drawer diario

- **Cabecera por sede + límites reales de turno**, identificados en `America/Lima`, y hechos compactos de tareas: grupo, clase/prioridad, referencia de obligación/caso, primer instante de habilitación real, evidencia de ejecución y marca de completada/pendiente/bloqueada/retirada con sus transiciones. Contadores finales **derivables**, no otra fuente de verdad.
- Actualizar de forma transaccional e idempotente al comenzar turno, confirmar/aplicar snapshots, cambiar ejecutabilidad/prioridad, iniciar/finalizar/expirar sesiones, contar, recontar o invalidar estructuralmente. La falta temporal de una sesión no debe ocultar oportunidades de trabajo realmente habilitadas. **Validar en preflight técnico** cómo detectar cambios de habilitación sin registrar falsos intervalos o alterar el motor V4.
- Retener identidad por grupo/tarea para aplicar el filtro de grupos operativos (§ 3.3) incluso a días históricos visibles. Conservar transiciones suficientes para reconstruir habilitaciones efectivas y corregir observaciones tardías. No guardar fotos completas de catálogo después de cada evento ni conservar permanentemente `solog_session_runtime_groups`.
- **Drawer diario, tres áreas sin tabla de turnos duplicada:**
  - **A. Actividad y episodios:** grupos distintos observados válidamente, conteos normales/reconteos y resultados físicos; destacar tres KPI de episodios (§ 5.3): **Iniciados, Cerrados y Abiertos al cierre del día**. Son episodios, no necesariamente grupos distintos si un grupo reabrió varios episodios verificables ese día.
  - **B. Diferencias confirmadas:** hechos de **reconteo físico válido `Confirmada`** cuya `recontado_at` cae dentro del día seleccionado en `America/Lima`. Excluir `Coincide`, `Recontar`, `Inconsistente`, `Inválido` y resoluciones automáticas basadas solo en snapshots. Fecha de recepción no altera fecha de observación.
  - **C. Detalle de observaciones:** tabla independiente de observaciones válidas y sus estados del día; sin duplicar la lista de confirmaciones.
- **Diferencias confirmadas, identidad:** una fila por **sede + fecha de reconteo + grupo**; si hay varias confirmaciones válidas del mismo grupo ese día, mostrar la última por `recontado_at` con desempate de ID. Una coincidencia posterior no borra una confirmación histórica válida del día.
- **Columnas de confirmadas:** grupo, diferencia confirmada con signo, valorizado congelado con signo, hora física si aporta contexto. Ordenar por `abs(diferencia)` o `abs(valorizado)`, descendente, desempate estable; conservar signos, no netear, mostrar `N/D` si falta valorizado. Sin confirmaciones: estado vacío explícito.
- **Sin comparación entre días en Drawer:** una fecha por lectura, sin UI ni RPC de doble fecha. Los indicadores de episodio diario proceden de la proyección compacta, no de una tabla adicional de agregados diarios:
  - Definir `[inicio_dia, fin_dia)` en `America/Lima` (fin exclusivo) y filtrar grupos operativos actuales (§ 3.3).
  - `iniciados = COUNT(apertura_at >= inicio_dia AND apertura_at < fin_dia)`.
  - `cerrados = COUNT(cierre_at >= inicio_dia AND cierre_at < fin_dia)`.
  - `abiertos_al_cierre = COUNT(apertura_at < fin_dia AND (cierre_at IS NULL OR cierre_at >= fin_dia))`.
  - El valor histórico abierto corresponde al **cierre del día seleccionado**, no a los episodios abiertos hoy. Una exclusión actual puede retirar grupos de históricos visibles, sin modificar los hechos originales (§ 3.3).
- **Persistencia de KPI diarios de episodio:** consultas indexadas sobre proyección compacta; no duplicar resúmenes por día inicialmente. Entregas tardías e invalidaciones requieren reconciliación localizada por sede/grupo.

## 7. Movimiento teórico por SKU

### 7.1. Comparación

- Unidad: **SKU `c_interno`**, por sede; no comparar stocks agregados por grupo.
- Comparar exclusivamente dos snapshots **consecutivos, confirmados, válidos y de la misma sede**.
- `ΔSKU = stock_nuevo − stock_anterior`.
- `incrementos = Σ max(ΔSKU,0)`; `disminuciones = Σ max(−ΔSKU,0)`; `volumen_absoluto = incrementos + disminuciones`.
- Un SKU incluido y omitido de `stock[]` equivale a **stock 0** según catálogo válido; excluidos no se reconstruyen como cero.
- Nuevo SKU, reincorporado o sin observación anterior comparable: **establecer base, sin movimiento**. SKU retirado/excluido: **no generar salida ficticia**.
- Comparabilidad por `c_interno` y estado válido del SKU en ambas versiones del catálogo. Cambiar un SKU de grupo no interrumpe su comparación individual.
- Conservar incrementos/disminuciones extraordinarios completos. No inferir ventas, reposiciones ni transferencias a partir del signo.
- Primer snapshot de una sede: referencia inicial; no genera movimiento.
- Snapshot duplicado/replay: no genera una segunda variación.

### 7.2. Temporalidad estrictamente necesaria para C

- La comparación de snapshots utiliza los **instantes reales de captura** de cada intervalo entre snapshots confirmados consecutivos de la misma sede.
- Conservar intervalo, duración y comparabilidad para calcular C en § 7.3. No asignar una variación entre capturas exclusivamente a un día/turno/ronda si abarca más de un período; no prorratear ni inferir qué ocurrió dentro del intervalo.
- **El movimiento teórico se utiliza únicamente para la dimensión C y el riesgo**: no construir informes, rankings, KPI ni agregados permanentes por turno, día, ronda o quincena exclusivamente para movimiento.
- La observabilidad del cálculo de C (intervalos disponibles, cobertura temporal, insuficiencia y antigüedad) se conserva como dato de calidad, no como otro panel de estadísticas de movimiento.

### 7.3. Media móvil de cambio de stock para riesgo (C)

- Unidad: **grupo de conteo + sede**; calcular primero cada `ΔSKU` en snapshots consecutivos confirmados y válidos; después sumar sus magnitudes absolutas por grupo, sin netear SKU.
- Ventana: **últimos cinco intervalos válidos** de snapshots (**seis capturas consecutivas** cuando todos los intervalos son válidos), con **antigüedad máxima de siete días**.
- Requisito para clasificar C con datos medidos: **mínimo tres intervalos válidos** dentro de la ventana; incluir intervalos válidos de movimiento cero.
- `Mᵢ = ΣSKU |stock_nuevo − stock_anterior|` (solo SKU comparables); `Hᵢ = horas entre capturas consecutivas`.
- **`C24 = 24 × ΣMᵢ / ΣHᵢ`** sobre los intervalos seleccionados; promedio móvil ponderado por duración, expresado en **unidades observadas por 24 horas**. No promediar directamente cantidades por snapshot.
- No utilizar variación neta del stock agregado de grupo, ni mezclar sedes, ni interpolar movimientos reales dentro de intervalos.
- Sin al menos tres intervalos válidos recientes: **insuficiencia de movimiento**, con `C = 1` imputado y señal visible de calidad, según § 5.1.
- El promedio móvil de riesgo se actualiza con cada snapshot confirmado y **no requiere atribuir movimiento a turnos, días o rondas** (§ 7.2).

### 7.4. Persistencia y retención para C

- **Cabecera por intervalo comparable:** sede, IDs de snapshots consecutivos, instantes de captura, duración y metadatos necesarios para idempotencia/calidad. Conservar datos suficientes para alimentar la ventana móvil y auditar su procedencia.
- **Detalle SKU con `Δ ≠ 0`:** SKU, intervalo, stock anterior/nuevo y variación; conservar **90 días**. Los intervalos válidos sin variación deben seguir representados para que el promedio móvil no omita períodos de movimiento cero.
- Conservar identidad de grupo **vigente durante cada intervalo comparable** junto al SKU. Si un SKU cambia de grupo, mantener la continuidad de su `ΔSKU` sin reasignar retrospectivamente movimiento de intervalos anteriores al nuevo grupo. Ante cambio de adscripción dentro de un intervalo sin asignación inequívoca, **no atribuirlo artificialmente a ninguno**; marcar comparabilidad insuficiente y aplicar las reglas de C. Los intervalos válidos sin variación también cuentan en la media.
- **No crear agregados históricos duraderos de movimiento por ronda ni quincena**, ni atribución por turno/día, ya que el movimiento es exclusivamente insumo de C.
- Calcular y persistir lo requerido en **la misma transacción de confirmación** del snapshot, después de reconstruir `snapshot_stock` y **antes** de sustituir `stock_actual`.
- La confirmación y la escritura analítica requerida son atómicas; aprovechar bloqueo por sede e idempotencia existentes. No depender del Cron que elimina detalle de `snapshot_stock` a partir de 12 horas.

## 8. Datos y fuentes autoritativas

| Dominio | Fuente |
|---|---|
| Conteos, reconteos, evidencias físicas y precios congelados | `inventario.conteos`, `inventario.conteo_detalle` |
| Grupos y SKU operativos; precio unitario para V | `inventario.grupos_conteo`, `inventario.catalogo` |
| Versionado de SKU compartidos | `inventario.catalogo_version_skus` |
| Estado operativo y prioridades de V4 | `inventario.estado_stock_grupo`, funciones V4; **no** almacenar métricas de precisión dentro de esta tabla |
| Snapshots y stock teórico | `inventario.snapshots`, `inventario.snapshot_stock`, `inventario.stock_actual` |
| Cobertura de ronda e hitos | Nueva persistencia `metrics_` de obligaciones y cabecera por sede/ronda/grupo; al cierre quedan congelados cobertura final y aportes por turno, además de hitos originales |
| **Precisión actual + Sobrantes/Faltantes + D/V de riesgo** | **Nueva `inventario.metrics_diferencias`**, una fila por sede/grupo, resultado consolidado físico confirmado y obligación de revisión separados (§ 3.4) |
| **Precisión histórica y cierre de ronda** | Nueva **`inventario.metrics_rondas_cortes`** (nombre propuesto): **fotografía binaria `H_G/H_R` por última confirmación comparable, independiente de pendientes**; exentos `H_Z`, sin confirmación `H_S`, cobertura final y contribución por turno, al cierre temporal (orquestación Supabase Cron pendiente de preflight) |
| Cumplimiento por turno | Nueva persistencia compacta `metrics_` de habilitación efectiva, ejecuciones, bloqueos y retiradas por sede/turno, con identidades de grupo; no contar tareas imposibles |
| Movimiento para C | Nueva proyección `metrics_` de intervalos comparables y detalle SKU de 90 días; sin agregados de movimiento por ronda/turno |
| Riesgo R del grupo/sede | `metrics_diferencias` (D, V) + cambios absolutos por SKU del intervalo (C); ranking clasifica solo confirmaciones vigentes comparables |
| Episodios, recurrencia y persistencia | Nueva **`inventario.metrics_episodios`** (nombre propuesto): aperturas/cierres por eventos físicos, con historial y consultas indexadas, **independiente de la confirmación consolidada** |
| Elegibilidad transversal actual | Grupos activos con SKU incluidos; aplicar a métricas visibles salvo cortes históricos binarios, cobertura/contribución de ronda cerrada e hitos originales |

- El backend es autoritativo en cálculo, transacciones, idempotencia, orden físico, autorización y materialización. Proyecciones compactas alimentan lecturas ordinarias; `conteo_detalle` continúa siendo autoridad de hechos y reconciliación, no se borra ni se convierte en tabla «actual».
- **Convención:** todas las **nuevas** tablas y funciones analíticas del Dashboard llevan prefijo **`metrics_`**. No renombrar ni cambiar firmas de funciones operativas V4 ni RPC existentes; nombres definitivos de nuevas RPC se fijan después del preflight. No introducir versiones genéricas ni copiar catálogo completo por grupo.
- Las métricas del Dashboard se cargan **progresivamente**: KPI principales al entrar, lecturas agrupadas por sede expandida donde convenga y restantes bajo demanda; Drawer por sede + día. La estrategia exacta se valida en B4, sin multiplicar RPC innecesarias ni forzar todas las pestañas en una sola llamada.
- Históricos prospectivos desde la activación salvo backfill verificable; no reconstruir cortes temporales a partir de la fila actual ni inventar coincidencias por snapshots.
- KPI derivados y cachés no son fuentes independientes de verdad. El frontend consume únicamente contratos administrativos **desplegados, autorizados y probados** antes de Codex.

## 9. Contratos y puntos de integración existentes

| Interfaz desplegada | Uso establecido |
|---|---|
| `public.rpc_conexion_sync_snapshot(...)` | Entrada de snapshots ConeXion; delega al contrato estricto |
| `public.rpc_conexion_sync_snapshot_strict_v2(...)` | Validación, reconstrucción, actualización de stock, confirmación transaccional e idempotencia |
| `inventario.solog_evaluar_snapshot(...)` → `inventario.solog_aplicar_snapshot_v4(...)` | Actualización del estado operativo después de confirmar snapshot |
| `public.rpc_solog_cashier_mutate_v4(...)` | Inicio, guardado de conteos, reconteos y finalización de sesión |
| `inventario.solog_cashier_group_actions_v4(...)` | Elegibilidad operativa y acción por grupo |
| `inventario.solog_priority_resolve_v4(...)` y `inventario.solog_enforce_runtime_priority_v4()` | Prioridad habilitada y exigibilidad del motor |
| `inventario.solog_temporal_context(...)` | Límites de quincena, ronda y turno |
| `public.rpc_solog_admin_control_v1(...)` | Contrato administrativo existente del módulo Control; no sustituye una RPC analítica del Dashboard |

- **Interfaces analíticas nuevas:** ninguna firma, payload, respuesta ni nombre público se declara definitivo en este archivo. Se definirán en la fase de contrato RPC (B4) sobre las fuentes aquí congeladas, **antes** de enviar implementación frontend a Codex.
- Nuevas tablas y funciones analíticas: esquema `inventario`; permisos restringidos, autorización administrativa en RPC de lectura; índices por sede/período/grupo/intervalo según acceso, más índices por sede/grupo/fechas de episodio para ventanas de 45 días y Drawer. Asegurar filtro transversal de grupo operativo antes de agregar métricas históricas no certificadas.
- Mantener el motor de conteos V4, el contrato ConeXion V2 y el comportamiento operativo vigente. Codex no modifica el backend salvo autorización expresa.

## 10. Consistencia, decisiones técnicas pendientes y aceptación

### 10.1. Invariantes congeladas

- Una obligación por sede/ronda/grupo y una primera ancla válida de acreditación; primeros hitos 50/90/100 % inmutables. Cambios estructurales actualizan cobertura vigente sin reescribir los hitos históricos.
- **Precisión actual** dinámica e independiente del hito 100 %: barra Verde/Amarillo/Rojo con categorías disjuntas `T=G+Y+Rg+Z+S`, `U=G+Y+Rg`; `U=0 → N/D`. Exentos 0/0 conocidos quedan fuera de U; sin evidencia sin obligación no equivale a pendiente. Respetar revisión activa sobre último resultado confirmado sin borrarlo.
- **Sobrantes/Faltantes:** última diferencia **consolidada V4 y físicamente confirmada**, por sede/grupo, comparabilidad vigente, valorizado congelado; **incluye confirmadas bajo revisión Amarilla**, sin señal extra obligatoria en KPI monetario, sin sumar repetidos ni netear signos. No equiparar recuento de diferencias con tamaño del tramo Rojo.
- **Riesgo:** D = magnitud de diferencia consolidada confirmada; V = precio **unitario vigente** del grupo, con cortes S/14, S/40 y factor 1/3/5; C desde variaciones absolutas SKU, imputación 1 con calidad cuando falten datos. Niveles incluyen **Muy alto desde 30**. Cuarto KPI = grupos Alto/Muy alto con diferencia confirmada comparable; no inferir R=0 de datos ausentes.
- **Episodios** basados en observación física (`d0`, `dr`), con cierre solo por coincidencia posterior real; sin cierres por snapshot, nuevo estado terminal `Confirmada`, invalidación o exclusión. Recurrencia de 45 días, persistencia ilimitada e importancia derivada, sin agregados diarios extras. **Episodios abiertos ≠ Amarillo + Rojo**. Si un episodio abierto carece de diferencia confirmada comparable, la pestaña muestra **«Pendiente de confirmación»**, no un riesgo cero.
- **Precisión histórica** binaria por **último resultado confirmado comparable al cierre de ronda**, **ignorando `por_recontar` para su clasificación**: `H_G/H_R` sobre `H_U`, exentos `H_Z` y sin confirmación `H_S`, sin amarillo histórico. Conservar universo, identidades/evidencias y cobertura/contribución por turno congeladas al cierre. No certificar al primer 100 % ni recalcular por exclusiones posteriores. Eventos tardíos/correcciones requieren auditoría técnica.
- Elegibilidad transversal de grupos **actualmente** operativos para KPI presentes e históricos **no congelados**; excepciones: **cortes históricos binarios de precisión, cobertura final/contribución por turno de rondas cerradas y primeros hitos**. La invalidación de evidencia no se representa como cero.
- Cumplimiento de tareas: solo habilitadas efectivamente durante turno, numerador y denominador acumulativos, sin penalización por bloqueos reales ni retirada legítima. Prioridades y sesiones V4 se respetan; no inventar cobertura de turno.
- Una lectura histórica del Drawer no se sustituye por `metrics_diferencias`, que solo conserva estado presente. Drawer de un día, sin comparación de dos fechas, con tres áreas; Rondas, Riesgo, Episodios y Actividad son cuatro pestañas; transiciones diferidas, frecuencia/rachas/inestabilidad eliminadas.
- Nuevas tablas y funciones analíticas con prefijo `metrics_`. Seguridad, idempotencia, timestamps `America/Lima` cuando corresponda y contratos API autorizados; **sin modificar motor V4** sin nueva decisión expresa.

### 10.2. Pendientes del preflight técnico (no autorizan implementar supuestos)

1. Clasificación autoritativa de obligación de validación de `Inconsistente`, `Recontar`, invalidez estructural y grupo sin evidencia desde motor V4; definición de columnas/constraints y señales derivadas sin booleanos contradictorios.
2. Manejo de eventos tardíos, replay, concurrencia, invalidación y reconstrucción por sede/grupo para `metrics_diferencias` y `metrics_episodios`. Backfill que excluya coincidencias históricas por snapshot sin evidencia física.
3. Captura idempotente al **cierre temporal real**: Supabase Cron como **orquestador aprobado conceptualmente**; elección de job, horario, aislamiento, corte «as of» ante retrasos, recuperación ante omisiones, corrección auditada, retención e índices de **precisión histórica binaria + cobertura/contribución congeladas**. No activar ni implementar Cron sin preflight y aprobación.
4. Tabla y funciones concretas `metrics_`, esquema, FK, RLS, autorización administrativa, costo real de consultas y agrupación por expansión/pestaña/Drawer. Las RPC históricas de Control/cronología no se sustituyen automáticamente por estado presente.
5. Aplicación de cambios de precio unitario y de composición a V/riesgo, preservando valorizado confirmado congelado y sin alterar semántica del motor V4.

### 10.3. Casos de aceptación

1. `G=240,Y=70,Rg=40,Z=50,S=0` → `T=400`, `U=350`, porcentajes Verde **68,57 %**, Amarillo **20 %**, Rojo **11,43 %**; los tres suman 100 % antes de redondear. `U=0` muestra `N/D`, sin barra engañosa.
2. `Coincide` previo con diferencia provisional `Recontar`: solo **Amarillo** en precisión; mantiene `Coincide` subyacente pero **no** aporta sobrante/faltante. Un nuevo `Coincide` físico regresa a Verde salvo exento 0/0.
3. `Confirmada −8` con nueva revisión `Recontar`: solo **Amarillo** en precisión **y −8 sigue contribuyendo a Faltantes**, con su valorizado V4 congelado. Reconteo `Confirmada −3` reemplaza monto y pasa a Rojo; reconteo `Coincide` elimina su contribución y pasa a Verde/Exento.
4. `Inconsistente` con obligación vigente se muestra Amarillo sin sustituir confirmación anterior; invalidación estructural sin comparabilidad **suspende** valor de diferencias/riesgo sin convertirlo en cero; grupo sin evidencia ni revisión concreta muestra `S`, no Amarillo.
5. Confirmación de teórico 0/físico 0 → `Z`, **fuera de precisión**. Si aparece posterior `Recontar` se muestra Amarillo; si vuelve a confirmar 0/0 retorna Z. Stock negativo teórico/físico coincidente no constituye exención.
6. Valor V deriva del **precio unitario vigente**, incluso en grupos con paquete; la modificación de precio puede cambiar V sin modificar el `valor_diferencia` confirmado. D usa `conteo_detalle.diferencia` consolidada V4, aun cuando difiera de `dr`; no utilizar `dr` como magnitud de diferencia confirmada del KPI/ranking.
7. Riesgo R=30 o mayor muestra **Muy alto**, 15–29 Alto; no exponer números C/D/V/R en ranking. Confirmada bajo revisión sigue participando en riesgo y cuarto KPI mientras sea comparable; sin confirmación, R no es cero.
8. Ronda llega a 100 % a las 18:00: registrar hito, **sin** congelar precisión. Al cierre temporal, fotografiar **última confirmación comparable**, independientemente del pendiente: `Coincide` previo + `Recontar` → `H_G`; `Confirmada −8` previa + `Recontar` → `H_R`; `0/0` previo + `Recontar` → `H_Z`; primera diferencia `Recontar` sin confirmación → `H_S`. Congelar cobertura y aportes por turno del mismo corte. Sin Amarillo histórico. Entrega tardía exige corrección auditada, no sobreescritura silenciosa.
9. Grupo desactivado/sin SKU incluido desaparece de métricas operativas actuales e históricos no congelados; **fotografía binaria de precisión, cobertura final, contribución por turno de ronda cerrada e hitos anteriores permanecen**. Nuevas observaciones/invalidez no crean coincidencias retrospectivas inventadas.
10. Episodio `d≠0 → d≠0 → d=0 → d≠0`: dos aperturas, un cierre y una recurrencia verificable, independientemente de cuándo se consolidó `Confirmada`; un snapshot o cambio de signo sin 0 físico no cierra. Episodio abierto 70 días no se trunca a 45, el de 3 horas muestra horas; I no se guarda.
11. Riesgo/Episodios independientes: Riesgo muestra seis filas si hay suficientes, sin puntuaciones; Episodios muestra recurrencia, persistencia, nivel cualitativo y orden por Importancia/Recurrencia/Persistencia. **Episodio abierto sin confirmación comparable presenta «Pendiente de confirmación», no riesgo cero**, mientras que una `Confirmada` comparable anterior bajo revisión puede seguir clasificando riesgo. Amarillo + Rojo no es número exacto de episodios.
12. Drawer histórico de un día con 8 aperturas, 5 cierres y 18 abiertos al cierre anterior muestra 21 abiertos al cierre elegido (si no hubo otros eventos/cambios de elegibilidad); nunca consulta una segunda fecha. Drawer B solo `Confirmada` con `recontado_at` del día, no la lista de confirmaciones actuales.
13. Cambio de adscripción SKU no reasigna movimiento pasado, snapshots duplicados no duplican C y falta de intervalos imputa C=1 con señal de calidad, no clasifica movimiento como Bajo medido.
14. Turno que completa cobertura a las 18:00 mantiene tareas habilitadas anteriores y agrega reconteos/diarios realmente ejecutables después: `34/39 = 87,2 %`, sin reinicio. Bloqueos por snapshot/prioridad no integran denominador hasta habilitación real; retiro legítimo excluye tarea, no borra finalizadas válidas.
15. Sin tareas ejecutables: «Sin tareas», no 0/100 %. Actividad muestra `completadas/exigibles` y porcentaje; Rondas conserva contribución de primeras acreditaciones de Madrugada/Día/Noche. Transiciones R1/R2 no requieren tabla/UI/RPC en primera implementación.
16. Una ronda **cerrada** con cobertura `400/400` y aportes por turno `200+120+80=400` conserva esos valores aunque luego se excluyan grupos; una ronda **abierta** sí refleja bajas/altas. Cron que se ejecuta después del límite no usa estado presente sin reconstruir el corte `as of`.
17. Una fotografía histórica con `H_G=270,H_R=50,H_Z=50,H_S=30` registra `H_T=400,H_U=320` y precisión `84,375 %`; pendientes de revisión no crean segmento amarillo ni desplazan una confirmación válida. La barra **actual** sigue usando `G/Y/Rg` y puede discrepar legítimamente de la precisión histórica.