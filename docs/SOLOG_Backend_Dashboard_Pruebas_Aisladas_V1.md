# SOLOG — Dashboard Backend: reporte de pruebas técnicas aisladas V1

| Atributo | Resultado |
|---|---|
| Estado | **EJECUTADO — pruebas no destructivas; integración pendiente** |
| Fecha | 2026-10-14 |
| Nivel | C — backend, motor y persistencia |
| Proyecto / rama documental | SOLOG / `admin-work` |
| Entorno inspeccionado | Supabase `fvtohxvcvsflzmftgfzs`, PostgreSQL 17.6, `America/Lima` en reglas de negocio |
| Alcance de pruebas | Consultas `SELECT` a fuentes vigentes y funciones puras/estables; simulaciones SQL con `VALUES`, CTE, arrays y JSONB |
| Modificaciones a Supabase | **Ninguna**: no se ejecutó DDL, DML, despliegue de funciones ni creación/modificación de Cron |
| Fuente funcional primaria | `SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` con prevalencia del delta congelado `SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` |
| Diseño técnico consultado | `SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md` — **propuesto, no congelado técnicamente** |
| Propósito del reporte | Evidencia reproducible para resolver bloqueos B1/B2/B3/B5, **no** modificación de las decisiones congeladas |

## 1. Semántica de los resultados

- **PASA (SQL aislado):** se ejecutó SQL de solo lectura y el resultado satisface el caso explícito. **No implica** que la futura integración, transacción o trigger funcione.
- **VERIFICADO EN FUENTE VIVA:** comportamiento o situación constatada en funciones/datos desplegados; sin mutarlos.
- **VIABLE CONDICIONADO:** la estructura y puntos de integración existen, pero falta ensayar la implementación analítica real.
- **BLOQUEADO PARA CERTIFICACIÓN:** falta información, tablas o código de la proyección; **no declarar implementado ni validado**.

Las funciones `metrics_*` y la RPC `public.metrics_dashboard_v1` **todavía no existen**; no se puede ensayar su idempotencia, rollback, autorización o egress reales. Esta limitación es deliberada para no experimentar sobre producción con escrituras.

## 2. B1 — Motor V4, prioridad y captura de Actividad

### 2.1. Prioridad: siete escenarios SQL — PASA

Se invocó **realmente** `inventario.solog_priority_resolve_v4` con diferentes vectores `(round_coverage,review_for_coverage,review_regular,shift_coverage)`:

| Caso | Resultado esperado y obtenido |
|---|---|
| Cobertura prevalece sobre las restantes | `round_coverage` |
| Reconteo de cobertura cuando no hay cobertura | `review_for_coverage` |
| Reconteo regular cuando no hay obligaciones superiores | `review_regular` |
| Solo diario | `shift_coverage` |
| Todas las colas vacías | `none` |
| Cobertura desciende y permite reconteo | `review_for_coverage` |
| Aparece nuevamente cobertura | `round_coverage` |

**7/7 PASA**. Confirma el orden real, pero no un eventual trigger futuro.

### 2.2. Identidad de tareas y acumulación — PASA (simulación de conjuntos)

Tres escenarios con conjuntos SQL y cuatro escenarios adicionales con objetos JSONB:

| Caso | Resultado |
|---|---|
| Cola pasa de {A,B} a {B,C}, cardinalidad idéntica | El acumulador conserva **3 identidades**, detecta C como nueva |
| Prioridad reaparece con la misma obligación | **No duplica** identidad |
| Replay del mismo grupo/tarea | **No duplica** |
| Unión de objeto JSONB repetido | **Una sola clave** |
| Reconteo cambia de `review_for_coverage` a `review_regular` | **Una identidad** por `detalle_id` |
| Cobertura y reconteo del mismo grupo | **Dos identidades** legítimas |
| Reemplazo de tarea manteniendo contador de cola | JSONB detecta la nueva clave |

**3/3 simulaciones de conjuntos y 4/4 de JSONB PASAN**. Se validó semántica de `UNION`/unión JSONB, **no** serialización concurrente contra una fila real.

### 2.3. Instrumentación V4 — VIABLE CONDICIONADO

Inspección del cuerpo desplegado de `public.rpc_solog_cashier_mutate_v4`:

- `start`: el bloque que crea `solog_session_runtime_groups` conserva `accion`, `priority_class` y `detalle_reconteo_id` por grupo después de completar el `INSERT ... SELECT`. Existe punto para capturar **todas las prioridades efectivas de la sesión** una vez cargado el runtime.
- `save_batch`: antes de insertar `conteo_detalle` se obtiene la fila runtime `FOR UPDATE` y se exige `accion IN ('coverage','daily')`; después de la física cambia `accion='none'` y `priority_class='none'`. El trigger de prioridad V4 exige que la clase coincida con `solog_runtime_priority_class_v4`.
- `recount_save_batch`: antes del `UPDATE` de `stock_reconteo/recontado_at` se comprueba `accion='recount'`, `detalle_reconteo_id` y snapshot posterior. Después se borra la acción del runtime; el trigger V4 también valida prioridad.
- `finish/expiración`: el trigger `solog_cleanup_session_runtime_groups` elimina filas runtime en estados terminales. La analítica **no puede depender de esas filas posteriormente**.
- `solog_runtime_priority_class_v4` resuelve prioridad vigente exclusivamente desde las clases **restantes** de runtime, y su resultado puede descender tras cada lote.

**Punto mínimo recomendado para implementación:** capturar `kind`, referencia/identidad y clase antes de convertir runtime en `none`; registrar la completada idempotente y, tras consumir la acción, recomputar el conjunto habilitado. Preferir **helpers `metrics_*` invocados transaccionalmente en momentos delimitados**; evaluar triggers solo si el orden efectivo y la sesión completa quedan demostrados. No reemplazar el motor por reglas analíticas paralelas.

**No se certifica aún B1:** no había sesiones activas ni registros `solog_session_runtime_groups` al inspeccionar. Hace falta prueba de escritura **en ambiente aislado/seguro** para verificar trigger, rollback, replay y nueva habilitación en una sola operación, antes de dar por cerrado el bloqueo.

### 2.4. Tamaño de acumulador JSONB — ADVERTENCIA DE RENDIMIENTO

`pg_column_size(jsonb_object_agg(...))` sobre datos sintéticos:

| Identidades | JSONB con metadatos por tarea | JSONB simple clave→boolean |
|---:|---:|---:|
| 500 | 51 899 bytes | 5 400 bytes |
| 1000 | 103 903 bytes | 10 901 bytes |
| 2000 | 208 903 bytes | 22 901 bytes |

Son tamaños **del valor calculado**, **no** tamaños físicos comprimidos en una tabla ni mediciones de WAL/tiempo de `UPDATE`. Confirman que preservar objetos ricos por tarea en una sola fila puede tener costo por reescritura. **Antes de implementar**, medir transacciones repetidas, compresión TOAST, WAL y latencia de actualización con 500–1000 tareas; no crear otra tabla automáticamente. Reducir metadatos por clave si las pruebas justifican una optimización que conserve el contrato funcional.

## 3. B2 — Fotografía «as-of» al cierre de Ronda

### 3.1. Evidencia real: la actualización posterior cambia la interpretación histórica

Consulta de los hechos físicos actuales:

| Indicador | Resultado |
|---|---:|
| Total de filas `conteo_detalle` | 1 399 |
| Filas que contienen reconteo físico | 121 |
| Reconteos cuyo evento físico corresponde a **otra ronda** que la observación inicial | **22** |
| Coincidencias legadas con `d0 ≠ 0`, sin reconteo y estado `Coincide` | **7** |
| Estado actual `Inconsistente` | 16 |

Ejemplos verificables:

- Conteo inicial **28-09-2026**, `d0=144`; reconteo **02-10-2026**, `dr=4`, resultado final `Confirmada`. El cierre de Ronda del **01-10-2026 05:00 UTC** (**00:00 Lima**) **no** puede clasificar esa confirmación de octubre como existente al corte de septiembre.
- Conteo inicial **28-09-2026**, `d0=-2`; reconteo **02-10-2026**, `dr=0`, resultado final `Coincide`. La coincidencia tampoco existía físicamente al cierre de septiembre.

**Hallazgo B2 confirmado:** fotografiar el `estado_diferencia` **actual** produciría resultados históricos retroactivos erróneos. La fotografía debe reconstruirse a partir de **eventos físicos con hora anterior al corte**, preservando la confirmación precedente comparable si una observación más reciente seguía en `Recontar`.

### 3.2. Prueba SQL de reconstrucción temporal — PASA PARCIAL

Se simularon cuatro casos usando `d0/dr`, fechas físicas y un cutoff real:

1. Primera diferencia física `d0=5` antes del corte, `dr=1` después: **sin confirmación de ese caso al corte**.
2. Primera diferencia `d0=-2` antes del corte, `dr=0` después: **sin coincidencia confirmada de ese caso al corte**.
3. `d0=0` antes del corte: **Coincide** al corte.
4. `d0=5`, `dr=1` antes del corte: **Confirmada** al corte.

**4/4 PASA**. La fórmula reconstruyó el **resultado confirmado del caso individual**, no toda la última confirmación histórica por grupo con composición válida.

Adicionalmente, una consulta exploratoria de eventos físicos `< 2026-10-01 05:00 UTC` produjo **479 pares sede/grupo con último evento físicamente confirmado candidato**, 452 `Coincide` y 27 `Confirmada`. **Estas cifras NO son una precisión histórica certificada**: no aplican todavía obligaciones/versionado estructural, elegibilidad histórica ni reglas completas de auditoría. No publicar como KPI.

### 3.3. Lo que aún falta para certificar B2 — BLOQUEADO

- Actualmente `catalogo_version_skus` dispone de `version`, `c_interno` y `estado`, pero **no** contiene adscripción histórica SKU→grupo; `catalogo` solo mantiene el grupo actual.
- No existe todavía `metrics_ronda_obligaciones` con intervalos de vigencia y generaciones de composición, ni `metrics_rondas_cortes` con pruebas de reconstrucción.
- `conteo_detalle` almacena `d0`, `dr` y fechas, pero el `estado_diferencia` actual es **mutable**. Una invalidación estructural posterior puede cambiarlo; sin una historia de compatibilidad no se conoce el estado **as-of** de cada evidencia solo desde esa columna.
- `snapshot_stock` no puede usarse como archivo de cierre: el Cron existente lo elimina a las 12 h. Los hechos físicos contienen stocks teórico/físico propios, pero esto **no reemplaza** el versionado de obligación/composición.

**Ruta mínima viable:** crear proyección prospectiva `metrics_ronda_obligaciones` con vigencias y generaciones **en los eventos de catálogo**; reconstruir último resultado confirmado físico por grupo y corte desde `conteo_detalle` + obligaciones vigentes **as-of**; guardar corte versionado; ensayar un reconteo posterior, un `Recontar` sobre confirmación anterior, invalidez estructural y entrega física tardía. Si una prueba no puede reproducir la foto, `N/D` con motivo y bloqueo, nunca un valor inventado. **No** modificar la lógica de V4.

## 4. B3 — Movimiento y calidad C24

### 4.1. Ventana temporal de cinco intervalos — PASA (simulación SQL)

Se emplearon arrays de duraciones positivas en segundos y variaciones absolutas por SKU. El instante final de cada intervalo se reconstruyó **hacia atrás** desde `ultimo_capturado_at`, restando las duraciones posteriores. Solo se aceptan intervalos completamente contenidos en los últimos siete días; exigir al menos tres:

| Escenario | Intervalos válidos | C24 esperado | C24 obtenido | Estado |
|---|---:|---:|---:|---|
| Cinco intervalos con movimiento cero intercalado | 5 | 12 | 12 | PASA |
| Tres intervalos válidos | 3 | 12 | 12 | PASA |
| Dos intervalos (insuficiente) | 2 | NULL | NULL | PASA |
| Cinco intervalos ya caducados | 0 | NULL | NULL | PASA |
| Cinco intervalos; dos caducados | 3 | 1 | 1 | PASA |

**5/5 PASA**. Esto verifica fórmula, ventana, ceros e insuficiencia en cálculo SQL puro. La futura proyección debe impedir **saltos no comparables entre posiciones** de arrays: si hay un hueco entre snapshots, reiniciar o invalidar secuencia según la razón; no fabricar tiempos contiguos a partir de duraciones desalineadas.

### 4.2. Calidad grupal parcial — PASA (simulación)

| Caso | SKU medidos / SKU incluidos | C24 disponible | Calidad | Factor C |
|---|---:|---:|---|---:|
| Completo | 4/4 | 8 | complete | 1 |
| Parcial | 1/2 | 12 | partial | 2 |
| Sin datos | 0/3 | NULL | insufficient | 1, **imputado** |

**3/3 PASA** bajo el delta aprobado. C24 parcial puede subestimar el grupo; la RPC debe informar `partial`, no esconder calidad.

### 4.3. Fuente del timestamp — VERIFICADO

Consulta a `stock_actual`: 1 940 filas. **1 940/1 940** tenían `observed_at` distinto de `updated_at` al inspeccionar. Esto prueba que **no** son intercambiables para calcular duración de intervalos; usar `snapshots.capturado_at` o `stock_actual.observed_at` cuando corresponda, **nunca** `updated_at`.

**No se puede validar con datos reales una ventana retrospectiva completa:** `snapshot_stock` estaba vacío debido a la limpieza. La tabla `metrics_movimiento_sku` todavía no existe. Se requiere iniciar base prospectiva y ensayar escrituras atómicas al activar.

## 5. B5 — Actividad sin sesión y frontera de turno

### 5.1. Cola V4 ≠ posibilidad efectiva de iniciar sesión — VERIFICADO

A 14-10-2026, ambos centros con snapshots históricos tenían captura **caducada** por la regla de dos horas:

| Sede | Último snapshot | ¿Vigente? | Acción teórica de summary V4 | Cola de cobertura |
|---|---|---|---|---:|
| Casuarinas | 08-10-2026 09:02 UTC | No | coverage | 452 |
| Cutervo | 01-10-2026 07:58 UTC | No | coverage | 430 |

La función pura `solog_cashier_operational_summary_v4` informa colas **teóricas** aun cuando `rpc_solog_cashier_mutate_v4('start')` prohibiría abrir sesión por stock expirado. **B5 es un bloqueo técnico concreto**: el recolector sin sesión debe combinar la clasificación V4 con las **condiciones de iniciabilidad** (snapshot válido, ventana, conflicto de sesión, completitud, sede), en vez de registrar 452/430 tareas ejecutables. No reinterpretar ni sustituir prioridades.

### 5.2. Frontera de turno y sesiones — PASA (temporalidad sintética)

Se invocó `solog_temporal_context` y `solog_sesion_expira_at` con:
- snapshot 14-10-2026 **06:59 Lima**;
- inicio de sesión 07:15 Lima (**Madrugada**);
- física 07:45 Lima (**Día**);
- expiración de sesión 08:58 Lima.

La condición temporal de V4 permite que la sesión cruce de `early` a `day` sin cambiar de contexto. **El valor de Actividad pertenece a `turno_desde` de la sesión**, por la decisión del delta; los otros dominios conservan 07:45 como instante físico. **Una comprobación temporal no equivale a ejecutar una sesión real.**

**Datos existentes:** 87 sesiones registradas; 67 no tienen `turno_desde` V4; de las 20 clasificadas con V4, no hubo observaciones normales cuyo `contado_at` cambiara de turno respecto al inicio congelado. Los 914 detalles de sesiones legadas **no permiten certificar una atribución retrospectiva bajo el nuevo criterio**. Actividad inicia prospectivamente o solo rellena hechos posteriores verificables.

### 5.3. Entrega posterior — EVIDENCIA REAL LIMITADA

Se identificaron **485 observaciones iniciales** vinculadas a sesiones V4 (distinto del número de sesiones). De ellas, **33** tenían `created_at` más de un minuto después de `contado_at`; **ninguna** superaba una hora ni llegó después del turno de sesión en el conjunto consultado. Esto justifica conservar una política de idempotencia y regularización posterior **aunque el caso límite no haya ocurrido aún**. La entrega de reconteo utiliza `recontado_at` y sesión `reconteo_conteo_id`, por lo que se debe probar aparte en integración.

## 6. Cron y seguridad — verificación no destructiva

- Job existentes y activos: `conexion_cleanup_snapshot_stock`, `solog_cleanup_operations`. **No se crearon/desactivaron**.
- Se comprobaron con conversión SQL los horarios de calibración: UTC **05:05,11:05,17:05,23:05** = Lima **00:05,06:05,12:05,18:05**; sin desfase estacional para `America/Lima`.
- `pg_cron` 1.6.4 está instalado, pero no hay Cron nuevo habilitado.
- `public.rpc_solog_admin_control_v1` verifica `auth.uid()`, `usuarios.activo`, rol `admin|moderador` y sede. La futura `metrics_dashboard_v1` debe seguir el patrón, restringir `EXECUTE` y consultar `inventario` desde un wrapper seguro; **sin RPC implementada no hay pruebas de roles**.
- `rpc_conexion_sync_snapshot_strict_v2` ya usa advisory lock por sede; `rpc_solog_cashier_mutate_v4` bloquea fila `public.sedes` con `FOR UPDATE`. **No son el mismo mecanismo.** Antes de integrar proyecciones compartidas, congelar **un orden de bloqueos consistente**: evitar que una ruta obtenga fila sede→advisory y otra advisory→fila sede en orden opuesto. Ensayar concurrencia real en entorno seguro.
- La tabla de calibración es **propuesta eliminable**; no instalar Cron ni tablas auxiliares durante pruebas de solo lectura.

## 7. Conclusiones y gates

| Bloque | Evidencia obtenida | Estado posterior |
|---|---|---|
| **B1 V4 prioridad** | 7/7 escenarios sobre función desplegada; puntos de captura localizados | **Viable condicionado**; faltan triggers/hooks reales, atomicidad y replay |
| **B1 identidad compacta** | 3/3 conjuntos + 4/4 JSONB | **Pasa aislado**; faltan prueba de actualizaciones concurrentes, tamaño/WAL |
| **B2 corte as-of** | 22 casos reales de reconteo en otra ronda + 4/4 casos sintéticos | **Bloqueante para certificar históricos**; falta versionado estructural y prueba de corte real |
| **B3 Movimiento** | 5/5 ventanas, 3/3 calidad, fuente temporal contrastada | **Viable condicionado**; falta escritura transaccional real y prueba de cambios de catálogo |
| **B5 sin sesión** | Colas de 452/430 con snapshots caducados | **Bloqueo delimitado**, resolver gate de iniciabilidad antes de activar Activity |
| **B5 turnos** | Cruce temporal posible; datos V4 sin cruce observado | **Decisión congelada compatible**, falta prueba de sesión real atravesando frontera |
| **Cron** | Conversión horaria verificada | **Propuesto, no desplegado** |
| **B4 contratos RPC** | Patrón de rol y fuentes verificadas | **No probado**: falta RPC y tablas `metrics_*` |

### 7.1. Recomendación sobre el siguiente bloque

**No cambiar ninguna decisión funcional congelada ni modificar Motor V4.** El siguiente trabajo debe ser una implementación de laboratorio/controlada, no un despliegue directo de toda la arquitectura:

1. Crear **en entorno seguro, no datos productivos**, las estructuras y helpers mínimos de Movimiento y Actividad para ensayar rollback/atomicidad y consumo JSONB real.
2. Demostrar la captura antes/depués de V4 con sesión activa y lote que desciende de prioridad, otro que se reintenta y uno que reincorpora tarea en misma prioridad. Comparar contador exacto desde conjuntos, no de colas.
3. Implementar prospectivamente y probar el versionado de obligaciones de Ronda con simulaciones de reconteo **posterior al corte**, evidencia previa bajo `Recontar`, invalidación estructural y entrega tardía. No declarar corte verificado sin estos casos.
4. Evaluar concurrencia sin inversión de locks entre ConeXion y sesiones.
5. Tras pasar estas pruebas, actualizar el contrato técnico desde **propuesto** a **aprobado** solo con autorización; desplegar backend por fases y validar RPC antes de enviar frontend a Codex.

### 7.2. Fuera de alcance de estas pruebas

No se ha hecho `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `cron.schedule`, instalación de extensiones, activación de jobs, cambios en roles/GRANT, migraciones o cambios frontend. Las simulaciones SQL no prueban integración de funciones aún inexistentes y **no sustituyen** test de carga ni smoke humano.

**No se considera resuelto/validado ningún bloqueo que dependa de integración real**. Esta evaluación es evidencia técnica para continuar, no cierre de backend.
