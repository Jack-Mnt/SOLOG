# SOLOG — Backend Cajero — KPIs y cobertura Full — Validación P1 V1

**Fecha de revisión:** 2026-10-27 (America/Lima).
**Estado:** P1 COMPLETADA EN DISEÑO + VALIDACIÓN SQL DE SOLO LECTURA. **NO DESPLEGADO.**
**Rama:** `admin-work`.
**Fuente primaria prevalente:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`.
**SQL candidato subordinado:** `docs/SOLOG_Backend_Cajero_KPIs_Cobertura_P1_SQL_Candidato_V1.sql`.

## Objetivo
Añadir `data.operational_summary` y `data.groups[].coverage_pending_round` a los `CASHIER_STATE` exitosos de `rpc_solog_cashier_bootstrap_v6`, manteniendo inalterado `rpc_solog_cashier_mutate_v7` y los `affected_groups` de mutación.

## Diseño verificado
1. Nueva función interna `inventario.full_cashier_kpi_projection_v1(p_site uuid, p_session uuid, p_now timestamptz)`, `LANGUAGE sql STABLE`, `search_path=''`, no ejecutable directamente por PUBLIC, anon ni authenticated.
2. **Una sola sentencia SQL** con CTE de contexto temporal, universo de cobertura, acciones Full, agregados de KPI y grupos enriquecidos; la misma fotografía de datos y el mismo `p_now` definen resumen y banderas.
3. Denominador: filas `estado_stock_grupo` activas de la sede, incluyendo `requiere_snapshot_completo`; la cola de captura sigue usando `full_group_actions_v1` y conserva sus compuertas.
4. Cobertura acreditada por `ultima_observacion_fisica_at` dentro de `[ronda_desde,ronda_hasta)`; no se emplea la hora de recepción.
5. `review_pending` = dos clases de reconteo accionable, `daily_pending` = `action='daily'`; `next_action` deriva de `solog_priority_resolve_v4` y `solog_priority_public_action_v4` realmente desplegados.
6. Los grupos se enriquecen a partir de `full_runtime_json_v2` sin copiar su esquema; `coverage_pending_round=false` para grupo fuera del universo. Guardia adicional: `p_session` debe corresponder a `p_site` o se devuelven `groups=[]`.
7. Cambio acotado de `full_cashier_state_v2`: una llamada a la proyección y dos campos JSON nuevos. La migración de P2 debe contrastarse con la definición remota vigente antes de ejecutar `CREATE OR REPLACE`.
8. **Sin cambios de escritura**, filas, funciones del Motor, triggers, ventanas, locks, esquemas de mutación, RLS, egress administrativo ni prioridades.

## Evidencia de pruebas de solo lectura
- **Consulta real de una sesión Full activa:** 493 grupos de sesión y universo 493; 17 con cobertura confirmada; 476 pendientes; 476 banderas `coverage_pending_round=true`. Cero grupos fuera del universo, cero divergencias bandera/acción, cero claves ausentes. `review_pending=44`, `daily_pending=2`, `next_action='coverage'`. La llamada SQL resultante del cuerpo **exacto del candidato** devolvió `coverage_percent=3.4` y el mismo total.
- **Sin sesión:** `groups=[]`, resumen disponible con denominador de sede.
- **Cuatro fronteras temporales:** inmediatamente antes y exactamente al comienzo de ronda 2 del 24/10 y del periodo nuevo del 01/11; `[desde,hasta)` y cambio de ronda correctos.
- **Siete escenarios sintéticos solo lectura:** observación válida, observación en último microsegundo de la ronda, cambio de ronda, entrega tardía tras observación más reciente, grupo activo pendiente de snapshot, grupo inactivo, grupo sin observación. Todos cumplieron `total=counted+pending` y bandera esperada.
- **EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)** del cuerpo de la consulta equivalente: planificación 2.243 ms, ejecución 34.735 ms, 1512 shared buffer hits, 0 lecturas de disco. Medición única y no equivalente a latencia RPC/V6 completa.
- **Tamaño JSON de `groups` (493 grupos):** base 338722 bytes; enriquecido 354515 bytes (+15793 bytes, +4.66 %). Resumen adicional 296 bytes. Medida única.
- **Permisos existentes verificados:** RPC V6/V7 EXECUTE para authenticated, no para anon; `inventario` sin USAGE ni SELECT directo de tablas por anon/authenticated. La nueva función no se ha creado y sus permisos efectivos quedan pendientes de comprobación posdespliegue.
- **Advisors:** existen observaciones de seguridad/rendimiento anteriores, incluidas vistas SECURITY DEFINER y políticas RLS, fuera de alcance; no representan una nueva exposición creada por este candidato. Referencia: https://supabase.com/docs/guides/database/database-linter .

## Límites de validación
- La **función SQL nueva no está compilada ni desplegada**. Se ejecutó su cuerpo `SELECT` exacto en modo solo lectura, no `CREATE FUNCTION`.
- No se ha ejecutado una carrera real V6/V7 con dos transacciones ni un test E2E autenticado. La consistencia interna está respaldada por la arquitectura de una sentencia SQL STABLE y la inspección de locks del dispatcher; las pruebas concurrentes reales deberán realizarse en entorno seguro.
- El rendimiento debe medirse de nuevo después de integrar la función con V6; no extrapolar esta prueba a cargas simultáneas o red.
- Las 181 migraciones remotas ausentes del repositorio siguen como deuda de trazabilidad; ocho corresponden al backend Full. Todas las 203 tienen SQL almacenado en `supabase_migrations.schema_migrations` según P0. Antes de P2, recuperar/verificar el conjunto Full necesario y crear una migración **nueva** sin manipular el historial remoto.
- No probar escritura con sesiones de producción.

## Barreras para P2
1. Confirmar HEAD remoto y `pg_get_functiondef(full_cashier_state_v2)` inalterado con respecto a la base usada para generar el candidato; si cambió, recalcular delta y revisar.
2. Restaurar trazabilidad SQL Full mínima y generar migración versionada con denominación única; no ejecutar scripts `docs/` sin revisión.
3. Preflight de seguridad: prueba de ejecución prohibida directa, identidad autorizada por V6 y segregación de sede, no alterar V7.
4. Validar efectivamente funciones creadas, JSON completo, timestamps exactos y valores de los KPIs; comparar antes/después sobre la misma sede y estado.
5. Verificar regresiones, plan de consulta, métricas de egress y rollback posible antes de desplegar; documentar resultados reales.
6. Si P2 requiere datos/sesiones sintéticas, hacerlo solo en ambiente aislado o con transacción de rollback verificable, nunca modificando sesiones operativas.
