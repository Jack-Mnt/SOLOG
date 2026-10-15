# SOLOG — Dashboard Backend: pruebas de integración controlada V1

| Atributo | Valor |
|---|---|
| Estado | **EJECUTADO — laboratorio local 17/17; integración PostgreSQL pendiente por falta de entorno aislado** |
| Clasificación | Nivel C — modelo de datos, motor e integración backend |
| Fecha | 2026-10-15 |
| Rama de documentación | `admin-work` |
| Fuente primaria de producto | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` con prevalencia específica del delta `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` |
| Contrato técnico consultado | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md` — todavía propuesto |
| Antecedente | `docs/SOLOG_Backend_Dashboard_Pruebas_Aisladas_V1.md` |
| Backend productivo | Supabase `fvtohxvcvsflzmftgfzs` **solo lectura** |
| Escrituras a backend | **Ninguna: no DDL/DML, no funciones nuevas, no Cron, no migraciones** |

## 1. Objetivo y límite real del laboratorio

Continuar la validación de **B1 (Actividad/V4)** y **B2 (Rondas «as-of»)**, además de la proyección C24 y los reintentos.

La herramienta de Supabase mostró **solo una rama `main`**, identificada como rama por defecto del proyecto productivo. No existe rama de desarrollo Supabase disponible. Crear una rama nueva requiere consulta/confirmación explícita del posible coste: **no se creó**.

El contenedor de trabajo no dispone de servidor PostgreSQL local (ni `postgres`, `initdb`, `psql`, ni librerías PostgreSQL/PGlite preinstaladas). Por ello se creó **un laboratorio local descartable con SQLite en memoria**, utilizando Python `sqlite3` y `unittest` de la biblioteca estándar; todo dato inventado permanece exclusivamente en RAM local.

**Importante:** las 17 pruebas verifican invariantes/algoritmos y rollback **del modelo local**, **no** comportamiento de triggers, aislamiento transaccional MVCC, bloqueos por sede, RPC, extensiones ni privilegios en PostgreSQL. No declarar B1/B2 integrados o cerrados a partir del resultado 17/17.

Artefacto reproducible en la conversación: `SOLOG_Backend_Dashboard_Laboratorio_Local_V1.py`; ejecución: `python SOLOG_Backend_Dashboard_Laboratorio_Local_V1.py`. Salida verificada: **17 tests, 0 failures, 0 errors**.

## 2. Inventario de pruebas ejecutadas

| ID | Caso | Resultado |
|---|---|---|
| 01 | Movimiento: seis capturas producen **cinco** intervalos, incluyendo Δ=0, y C24 correcto | PASA (modelo) |
| 02 | Snapshot repetido con mismo ID no añade intervalos | PASA |
| 03 | Exclusión limpia referencia/arrays; reincorporación arranca base nueva sin variación inventada | PASA |
| 04 | Ventana >7 días devuelve C24 no medido, no valor antiguo | PASA |
| 05 | Snapshot fuera de orden revierte la **transacción local** | PASA |
| 06 | Actividad: replay de tarea completada no duplica N | PASA |
| 07 | Cambio de conjunto `{A,B} → {B,C}` conserva **3 habilitaciones** aunque ambas colas tengan cardinal 2 | PASA |
| 08 | Conteo y reconteo del mismo grupo son dos tareas legítimas distintas | PASA |
| 09 | Error al completar tarea nunca habilitada revierte íntegramente el lote local | PASA |
| 10 | Entrega tardía aceptada modifica acumulado del **turno de sesión**, aunque cerrado | PASA |
| 11 | El mismo reconteo cambia de prioridad sin generar una segunda identidad | PASA |
| 12 | Diferencia inicial antes de cierre + confirmación posterior **no** valida una precisión histórica retroactiva | PASA |
| 13 | Confirmación física anterior persiste para el corte bajo nueva revisión sin confirmar | PASA |
| 14 | Grupo cambia de generación **después** del corte: el corte mantiene generación histórica | PASA |
| 15 | Observación física tardía con fecha anterior al corte produce corrección en **versión nueva**, sin borrar V1 | PASA |
| 16 | Cambio de generación **antes** del corte requiere evidencia compatible nueva: no reutiliza Coincide antigua | PASA |
| 17 | Cambio estructural **posterior** no contamina corte de fecha anterior | PASA |

**Resultado ejecutado:** 17/17 PASA. El escenario 16 se añadió específicamente para evitar una falsa certificación estructural: una evidencia de generación anterior debe quedar fuera del corte cuando el nuevo universo/grupo exige reacreditación.

## 3. Contraste con Motor V4 actualmente desplegado (solo lectura)

### 3.1. Hooks precisos de B1

Lectura completa de `public.rpc_solog_cashier_mutate_v4`, `inventario.solog_enforce_runtime_priority_v4`, `solog_runtime_priority_class_v4`, `solog_sync_physical_observation_v4` y limpieza de runtime.

**`start`:** el runtime se llena tras crear `conteos`, con `accion`, `priority_class`, `detalle_reconteo_id`, `conteo_id`, stock/precio/grupo congelados. El punto seguro para registrar habilitaciones iniciales debe ser **después de completar ese runtime**.

**`save_batch`:** la RPC recupera `v_runtime` con `FOR UPDATE`; valida `accion IN ('coverage','daily')`; el trigger de prioridad exige igualdad con la prioridad de runtime. A continuación **inserta** `conteo_detalle`, actualiza runtime a `accion='none',priority_class='none'`, y actualiza `estado_stock_grupo`. La evidencia para Actividad debe capturar `v_runtime` **antes** de borrarlo, registrar completion dentro de la transacción y reconciliar nuevas habilitaciones **después** de consumida la acción.

**`recount_save_batch`:** valida `detalle_id`, posterior de snapshot y runtime `accion='recount'`; **actualiza** el mismo `conteo_detalle` físico con `stock_reconteo`, `recontado_at`, `reconteo_conteo_id`, y después pone runtime en `none`. Reconteo = nueva observación, pero **no** nueva fila de `conteo_detalle`; se requiere un token de evidencia estable más `recount:<detalle_id>` para denominador.

**`finish` / expiración:** la función de limpieza elimina `solog_session_runtime_groups`. En `solog_session_capability_v4`, la llamada `solog_normalize_sessions_v4` **puede escribir** al normalizar expiraciones, pese a que se utiliza como proveedor de estado. No usarla inadvertidamente para una lectura analítica «pura» que se suponga libre de efectos.

**Conclusión B1:** puntos de integración viables por lectura de código real. Falta demostrar con **backend analítico desplegado en laboratorio** que se conserva la clasificación en todos los cambios de estado sin modificar semántica V4.

### 3.2. Frontera de inicio sin sesión: condición exacta

`rpc_solog_cashier_mutate_v4('start')` valida, entre otras condiciones:

- actor `cajero` y usuario/dispositivo autorizado; sede activa;
- una sola sesión activa por sede;
- último snapshot confirmado existente;
- `now < snapshot_expira_at - 5 minutos` (**margen adicional**, no solo vigencia de 2 horas);
- `now < solog_sesion_expira_at(snapshot.capturado_at)`;
- grupos operativos útiles y sin snapshot incompleto.

Por ello, **las colas de `solog_cashier_operational_summary_v4` no son denominadores ejecutables** cuando no existe posibilidad real de iniciar sesión. La evaluación analítica por sede debe compartir la semántica de esas condiciones, no implementarlas de manera discrepante o duplicar lógica del motor. La autorización específica del dispositivo puede hacer que disponibilidad general de sede y disponibilidad efectiva para ese cajero sean diferentes; **si esta distinción afecta el denominador acordado, requiere prueba/decisión puntual** y no una redefinición implícita.

### 3.3. Riesgo de bloqueo por concurrencia — NO RESUELTO

- ConeXion V2 usa `pg_advisory_xact_lock(hashtextextended(sede_id))`.
- Cajero V4 toma `public.sedes FOR UPDATE` y bloqueos de sesión/runtime.
- Si una nueva instrumentación hiciera `advisory → row-lock` en una ruta y `row-lock → advisory` en otra, habría riesgo de **deadlock** por inversión de orden.

**Gate obligatorio:** fijar y ensayar un orden único de adquisición de locks antes de añadir helpers `metrics_*` a ambas RPC. No basta la simulación SQLite: carece de advisory locks/locks por fila equivalentes. No introducir dentro de V4 un advisory lock sin preflight. La propuesta mínima es **no tomar locks de otro tipo en el helper** hasta completar el diseño de orden y usar bloqueo de fila del acumulador transaccional mediante `INSERT ... ON CONFLICT`; probar dos transacciones reales (snapshot concurrente con lote/cierre).

## 4. B2 — Corte «as-of» y generaciones de obligación

El laboratorio descartable almacenó:

- hechos físicos iniciales y reconteos como eventos fechados (no confundir estado final mutable con resultado a la fecha);
- generaciones de obligación de grupo con `begin_at/end_at`;
- cortes versionados por `(sede, instante_corte, versión)`.

Los casos 12–17 validan tres reglas:

1. **No mirar al futuro:** la confirmación del reconteo posterior al corte no reemplaza el resultado anterior a ese instante.
2. **Evidencia anterior bajo revisión:** una nueva diferencia provisional no borra la última confirmación comparable.
3. **Compatibilidad estructural:** el corte evalúa únicamente hechos compatibles con la **generación vigente a la fecha**, sin adoptar retrospectivamente grupos de generaciones anteriores o posteriores.

Estos son **invariantes del modelo probado**, no demuestra que el `conteo_detalle` actual por sí solo contenga toda la información histórica.

En el preflight anterior había **22 reconteos reales registrados en ronda distinta de la observación inicial**: la reconstrucción temporal es necesaria. La tabla de obligaciones versionadas aún **no** está desplegada; tampoco `metrics_rondas_cortes`. El corte histórico válido antes de la activación solo puede ofrecerse si su evidencia es verificable. Si no, `N/D` prospectivo.

**B2 continúa pendiente de integración PostgreSQL**: crear estructuras/hook de cambios de composición en la rama de laboratorio, ensayar reconteo tras fecha de cierre, cambio de composición antes/después, evidencia previa bajo revisión y llegada tardía con corte versionado, sin cambiar V4.

## 5. Movimiento: integración todavía no probada

Los tests 01–05 verifican solo el algoritmo y la atomicidad SQLite de una transacción. Para PostgreSQL se necesita insertar helper set-based **después** de reconstruir `snapshot_stock` y **antes** de reemplazar `stock_actual`; usar `capturado_at` real, procesar todos los SKU incluidos comparables, mantener cinco parejas `delta/duración`, y reiniciar al reincorporar. No existe aún la tabla de proyección ni el hook.

La limpieza programada de `snapshot_stock` a 12 horas limita cualquier backfill de C24: iniciar base prospectiva. El cron temporal de calibración C no participa en la operación y **no se creó**.

## 6. Resultado, impacto y estado de bloqueos

| Bloque | ¿Qué se ha demostrado? | Estado |
|---|---|---|
| B1, prioridad/identidad | Contrato ejecutable en modelo local; puntos runtime ubicados en función V4 | **Viable, no integrado** |
| B1, atomicidad/retry | 2 escenarios de rollback/replay aprobados en SQLite | **No valida PG/concurrencia** |
| B2, cierre temporal | 6 escenarios de cortes/gen validan invariantes del modelo | **Falta prueba real PG**, origen estructural prospectivo |
| B3, C24 | Ventana, validez, exclusión, replay y rollback local | **Falta helper PG y test con snapshot** |
| B4, RPC y permisos | No existe `metrics_dashboard_v1` | **No probado** |
| B5, sin sesión | Validaciones de `start` inspeccionadas | **Falta implementación y prueba de habilitación real** |
| Locks | Riesgo de inversión reconocido | **Sin prueba de dos transacciones PG** |
| Cron | Sin job nuevo creado | **No probado** |

**No hay evidencia para declarar cerrado B1, B2 ni el contrato técnico completo.** La única condición administrativa para continuar con escrituras sin riesgo de producción es disponer de **una base PostgreSQL de laboratorio**. En Supabase solo existe la rama principal; una rama de desarrollo puede implicar coste y requiere confirmación expresa previa a su creación. Alternativamente puede utilizarse PostgreSQL local en el equipo de desarrollo, si se habilita y nos proporcionan acceso en una siguiente fase.

## 7. Siguiente paso ejecutable en un entorno aislado aprobado

1. **Preparar la rama/proyecto PostgreSQL aislado con datos sintéticos**, sin copiar información sensible/productiva de la sede.
2. Crear **solo en ese laboratorio** las estructuras/helpers mínimos `metrics_actividad_turnos` y `metrics_ronda_obligaciones/metrics_rondas_cortes`, y `metrics_movimiento_sku` si se valida también B3.
3. Instrumentar copias de V4/ConeXion en el entorno aislado y observar que firmas, payload y semántica originales no cambian. Integrar hook analítico antes de limpiar runtime y antes de `stock_actual`, respectivamente.
4. Ejecutar casos del laboratorio local más pruebas **específicas PG**: trigger order, transacciones con rollback, idempotencia al enviar el mismo `operation_id`, concurrencia de sesión/snapshot, cambio de prioridad durante lote, cierre as-of, generación estructural, corrección tardía versionada.
5. Medir `pg_column_size` y actualizaciones repetidas para acumulador JSONB; índices, locks, WAL y egress. **No** trasladar cambios a producción solo porque las pruebas de laboratorio hayan pasado.
6. Actualizar reporte y contrato técnico con resultados verificados; pedir aprobación de despliegue backend por fases cuando no quede bloqueo funcional.

## 8. Documentación y seguridad

- La fuente funcional congelada y el delta **no cambian**.
- El contrato técnico propuesto **no se marca como aprobado/desplegado**.
- No se modifica `master` ni archivos de aplicación frontend.
- No se ha ejecutado ninguna escritura Supabase; cero tablas, RPC y Cron de métricas creados.
- El test de SQLite es un **modelo de invariantes**, no certificación de backend PostgreSQL.

**Resultado:** se avanzó todo lo comprobable de forma segura en el entorno disponible. La siguiente prueba de integración real requiere explícitamente un entorno PostgreSQL aislado y sus permisos/coste aprobados.
