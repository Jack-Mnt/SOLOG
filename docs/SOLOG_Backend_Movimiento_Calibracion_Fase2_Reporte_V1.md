# SOLOG — Backend Movimiento y calibración C: reporte Fase 2 V1

| Atributo | Valor |
|---|---|
| Estado | **IMPLEMENTADA Y VALIDADA TÉCNICAMENTE CON PRUEBAS CONTROLADAS — pendiente primer snapshot real y smoke operativo** |
| Fecha | 2026-10-15 (Lima) |
| Clasificación | Nivel C — funciones backend, triggers y Cron |
| Fuente funcional primaria | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md`, con prevalencia de `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` |
| Contrato técnico de referencia | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md` — propuesto para las RPC aún no desplegadas |
| Entorno | Supabase `fvtohxvcvsflzmftgfzs` (base principal) |
| Repositorio | `Jack-Mnt/SOLOG`, rama `admin-work` |
| Responsabilidad | ChatGPT implementó backend. Codex no modificó backend ni frontend. |
| Límites | Solo Movimiento + calibración C. No se cambió V4/V5, el contrato ConeXion V2, RPC Admin, Rondas, Episodios ni Actividad. |

## 1. Migraciones remotas desplegadas y SQL reproducible

| Versión | Migración aplicada | Fuente SQL de implementación |
|---|---|---|
| `20261015054306` | `solog_dashboard_fase2_helpers_movimiento_calibracion_v1` | `docs/SOLOG_Backend_Movimiento_Calibracion_Fase2_Helpers_V1.sql` |
| `20261015054422` | `solog_dashboard_fase2_movimiento_idempotencia_v1` | `docs/SOLOG_Backend_Movimiento_Fase2_Idempotencia_V1.sql` |
| `20261015054543` | `solog_dashboard_fase2_idempotencia_producto_ausente_v1` | `docs/SOLOG_Backend_Movimiento_Fase2_Ausente_Idempotencia_V1.sql` |
| `20261015054630` | `solog_dashboard_fase2_triggers_movimiento_v1` | `docs/SOLOG_Backend_Movimiento_Fase2_Integracion_Triggers_V1.sql` |
| `20261015054816` | `solog_dashboard_fase2_cron_calibracion_c24_v1` | `docs/SOLOG_Backend_Calibracion_C24_Fase2_Cron_V1.sql` |

**Fuente ejecutable de la fase:** aplicar los cinco archivos SQL **en ese orden**. El primero es la función inicial, el segundo y tercero son deltas correctivos posteriores. El estado SQL vigente es el de la última modificación de cada función. No sustituir estos SQL por fragmentos de la especificación conceptual.

## 2. Arquitectura operativa final de Movimiento

### 2.1. Captura mediante trigger por sentencia

Se añadió **`trg_metrics_movimiento_snapshot_stock_v1`**:

- `AFTER INSERT ON inventario.snapshot_stock`
- `REFERENCING NEW TABLE AS metrics_new_snapshot_rows`
- `FOR EACH STATEMENT`; no `FOR EACH ROW`.
- Se ejecuta después de que ConeXion reconstruye el lote de `snapshot_stock` y antes de que la RPC actualice `stock_actual`.
- Solo procesa `snapshots.estado='procesando'`, mediante `inventario.metrics_movimiento_aplicar_snapshot_v1(snapshot_id)`.
- La RPC original `public.rpc_conexion_sync_snapshot_strict_v2` **no fue reemplazada**: firma, credenciales, payload, validaciones, respuesta, duplicados e intervalo mínimo de 2 horas se mantienen.
- La actualización analítica transcurre en la **misma transacción** de la ingesta. Errores analíticos no se silencian ni se registran como snapshot válido.

### 2.2. Ventana y condiciones de comparación

Por `(sede_id,c_interno)`:

1. Solo SKU actualmente incluidos y también incluidos en la versión de catálogo referida por el snapshot.
2. Solo observaciones **comparables** con una referencia SKU previa reconocida, persistida y correspondiente a `stock_actual.snapshot_id`/`observed_at`.
3. No comparar contra `producto_ausente` anterior ni registrar el cero no observado como Movimiento. Una ausencia interrumpe comparabilidad; la próxima observación real vuelve a establecer base.
4. Calcular `Δ=abs(stock_nuevo-stock_anterior)`, con Δ=0 válido; duración real entre `capturado_at` consecutivos comparables.
5. Retener **máximo cinco pares** Δ/duración. Calcular C24 por SKU usando la función de Fase 1 solo con intervalos completamente contenidos en siete días y **mínimo tres** válidos.
6. Estado de calidad `base|insuficiente|medido|invalidado`. C24 nulo es insuficiencia, no movimiento medido cero.
7. `metrics_movimiento_grupo_v1(sede,grupo,as_of)` suma C24 vigentes de miembros actuales, devuelve factor C 1/2/4 y calidad `completa|parcial|insuficiente`. **No** aplica factor 1/2/4 individualmente a cada SKU.
8. Desbordamientos numéricos extremos que no caben en el tipo `integer[]` reinician la base en vez de inventar un Δ; se registran como ventana no medida.

### 2.3. Idempotencia de `producto_ausente`

**Hallazgo detectado y corregido durante pruebas:** al invalidar una ausencia se anulaban `ultimo_stock` y `ultimo_snapshot_id`, por lo que repetir la aplicación del mismo snapshot no podía reconocerlo como ya procesado.

**Corrección técnica:** nueva columna `ultimo_snapshot_procesado_id uuid` en `metrics_movimiento_sku`. Se distingue:

- `ultimo_snapshot_procesado_id`: identidad de la captura aplicada, **aunque fuera `producto_ausente`**.
- `ultimo_snapshot_id` + `ultimo_stock` + `ultimo_capturado_at`: referencia física **comparable**; todos NULL después de ausencia.
- Reaplicación de la misma captura: no agrega intervalo, no elimina uno existente ni vuelve a contar ausencia.
- Tras excluir/reincorporar un SKU, ambos estados y ventanas se invalidan para establecer nueva base en la siguiente captura válida.

Esta columna adicional es implementación de idempotencia **sin alterar el modelo funcional aprobado**.

### 2.4. Exclusión/reincorporación de catálogo

Trigger **`trg_metrics_movimiento_catalogo_estado_v1`**:

- Actúa solo al cruzar la frontera `Excluido` ↔ `Único/Agrupado`.
- Limpia inmediatamente ventana, C24 y referencias del SKU **en todas las sedes**, dentro de la transacción de publicación de catálogo.
- Reincorporar **no** recupera el C24 anterior; necesita una primera nueva captura real como base.
- Mover SKU entre grupos vigentes sin excluirlo **no** borra C24; el grupo se determina en la lectura.
- Se conservan íntegramente los guardas y triggers preexistentes de publicación/catálogo.

## 3. Calibración C: persistencia temporal aislada

Función `inventario.metrics_calibracion_c24_tomar_muestra(p_at timestamptz)`:

- Lee `metrics_movimiento_sku` y catálogo **actual**; consulta C24 **efectivo** y calidad a la hora de muestreo.
- Solo inserta en `inventario.metrics_calibracion_c24`: `muestreo_at,sede_id,c_interno,grupo_conteo_id,c24_sku,intervalos_validos,calidad,ultimo_capturado_at`.
- Usa `date_bin(6h)` anclado al horario UTC aprobado para idempotencia por slot. Una segunda ejecución del mismo slot usa `ON CONFLICT DO NOTHING`; no duplica.
- No cambia los umbrales C, D/V/R ni tablas de conteos, snapshots o riesgos.
- Guarda la adscripción vigente a la hora de muestra para calibrar **C24 grupal**, no solo distribución SKU.

**Cron desplegado y activo:**

| Campo | Valor verificado |
|---|---|
| Job | `metrics_calibracion_c24_6h` |
| Job ID | `6` |
| Cron UTC | `5 5,11,17,23 * * *` |
| Horario Lima | **00:05, 06:05, 12:05, 18:05** |
| Ejecuciones al momento de validación | **0**; todavía no hay evidencia de primera ejecución automática |
| Filas reales muestreadas | **0**; Movimiento comienza prospectivamente |

**Retirada segura tras segunda calibración de noviembre de 2026:**

1. Verificar resultados y documentar umbrales calibrados.
2. Ejecutar `SELECT cron.unschedule('metrics_calibracion_c24_6h');` **solo para ese job**.
3. Eliminar la función auxiliar `inventario.metrics_calibracion_c24_tomar_muestra(timestamptz)` y `inventario.metrics_calibracion_c24`, mediante migración aprobada, sin `CASCADE` ni modificar `pg_cron` global.
4. Verificar que Movimiento, factor C, Riesgo y RPC administrativas continúen independientes.

## 4. Validaciones ejecutadas con Supabase real (datos sintéticos revertidos)

| Caso | Evidencia | Resultado |
|---|---|---|
| 4 capturas sucesivas (3 intervalos) | Δ=`[4,6,0]`, duraciones `[7200,7200,7200]`, C24=40 | **PASA** |
| Captura idéntica reejecutada | 0 SKU procesados adicionalmente | **PASA** |
| `producto_ausente` | C24 y base a NULL, sin Δ ficticio | **PASA** |
| `producto_ausente` repetido | 0 SKU nuevos; idempotencia corregida | **PASA** |
| Reincorporación posterior a ausencia | Primera captura solo fija nueva base | **PASA** |
| Trigger `snapshot_stock` | Aplica Movimiento antes de actualizar `stock_actual` | **PASA** |
| Cambio actual de catálogo a `Excluido` | Estado `invalidado`, sin ventana | **PASA** |
| Volver a incluir | No recupera C24 ni referencia anterior | **PASA** |
| Muestreo auxiliar | Inserta C24 y adscripción de prueba correctos | **PASA** |
| Muestreo repetido dentro del slot | 0 filas nuevas | **PASA** |
| Lote masivo en **una sentencia** | Se procesaron todos los SKU incluidos de la versión actual; prueba de correspondencia de cardinales | **PASA** |
| Rollback de snapshots, stock y catálogo de prueba | Tablas `metrics_movimiento_sku`/`metrics_calibracion_c24` continúan con **0 filas** | **PASA** |
| Permisos y RLS | Sin acceso directo `anon`/`authenticated`/ `service_role`; funciones internas privadas | **PASA** |
| Cron temporal | Confirmado activo, horario y comando esperados | **PASA configuración**, ejecución real aún pendiente |

**No se presenta métrica de latencia del lote:** la consulta retornó únicamente resultado final; el tiempo interno del `RAISE NOTICE` no fue capturado por la interfaz de consulta. El ensayo demuestra procesamiento completo, **no** un SLA de rendimiento.

**Universo medible al momento del preflight:** 970 SKU incluidos en el catálogo vigente, 5 sedes; las pruebas de lote utilizaron la versión de catálogo más reciente. Las 57 capturas históricas se conservaron intactas. El inicio de Movimiento es **prospectivo**, no se generan diferencias retroactivas de snapshots anteriores.

## 5. Verificaciones de aislamiento y seguridad

- `metrics_movimiento_sku` y `metrics_calibracion_c24` conservan RLS activo y no conceden `SELECT` directo a clientes.
- Las cinco nuevas funciones de Fase 2 son `SECURITY INVOKER` y no conceden EXECUTE a `anon`, `authenticated` o `service_role`; los triggers se ejecutan en el contexto transaccional interno de las funciones del backend.
- La función de calibración solo tiene escritura hacia su tabla auxiliar; su dependencia no es consumida por ninguna tabla o función operativa permanente.
- Se mantienen los dos jobs antiguos `conexion_cleanup_snapshot_stock` y `solog_cleanup_operations`, además del nuevo temporal. Ningún job de cierre de Rondas/Actividad se habilitó.
- No se actualizaron ni reemplazaron `public.rpc_conexion_sync_snapshot_strict_v2`, `public.rpc_solog_cashier_mutate_v4/v5`, funciones de Rondas/Episodios/Actividad ni código de aplicación.

## 6. Validación pendiente y riesgo residual

**Fase 2 desplegada con validación técnica controlada**, pero **no está certificado un primer snapshot real de ConeXion posterior a la activación**. La próxima sincronización operativa debe comprobar:

- ConeXion retorna `OK` con el **mismo contrato V2**, sin errores nuevos.
- Se confirma el snapshot esperado y quedan alineados `stock_actual.snapshot_id` y `metrics_movimiento_sku.ultimo_snapshot_procesado_id` para todos los SKU incluidos observables.
- La primera captura por SKU establece base, **C24 NULL**; solo tras tres intervalos posteriores válidos, con distancia mínima de dos horas y capturas dentro de siete días, aparece C24 medido.
- Las ausencias/reincorporaciones no crean variaciones ficticias.
- El job temporal comienza a generar muestras cuando existan filas, y se valida al menos una ejecución real en `cron.job_run_details`.
- Después del primer flujo real, comprobar latencia y eventuales fallos de ingesta. No se considera validada la integración externa completa hasta este smoke.

**Procedimiento de contingencia acotado, no ejecutado:** si el nuevo trigger bloquease ConeXion, inspeccionar error y tomar decisión explícita; el cambio mínimo para aislar Movimiento sin cambiar el contrato V2 sería desactivar `trg_metrics_movimiento_snapshot_stock_v1` en `inventario.snapshot_stock` y revalidar ingesta. Esto detiene la proyección para capturas posteriores; no crear datos retroactivos sin base comparable. No desactivar todos los triggers ni suprimir errores silenciosamente.

## 7. Estado / siguiente fase

- **Fase 1:** estructuras, funciones base, permisos e índices creados y validados.
- **Fase 2:** funciones de Movimiento, hooks de snapshot/catálogo y Cron temporal de calibración **desplegados y validados con pruebas controladas**; falta el smoke real ConeXion y primera ejecución Cron.
- **Fase 3 — Diferencias y Episodios:** realizar preflight contra la RPC del Cajero **V5** (no asumir V4), valorización congelada y estados físicos; preparar las proyecciones y sus integraciones sin modificar la lógica de V5. Ningún frontend a Codex hasta desplegar RPC administrativa completa.

**Cierre de fase pendiente de aceptación del usuario y verificación operativa cuando haya un snapshot real.**
