# SOLOG — Backend Cajero — KPIs y cobertura Full — Contrato V1

**Estado:** DESPLEGADO y VALIDADO EN LECTURA SQL; contrato frontend CONGELADO. **E2E autenticado en navegador y carreras V6/V7 reales pendientes**.
**Fecha:** 2026-10-27 (America/Lima).
**Proyecto Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`).
**Rama documental:** `admin-work`.
**Fuente primaria funcional prevalente:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md`.
**Migración efectivamente aplicada:** `20261028034458_solog_cajero_full_kpis_cobertura_v1`.
**SQL versionado exacto:** `supabase/migrations/20261028034458_solog_cajero_full_kpis_cobertura_v1.sql` (idéntico al SQL almacenado en Supabase).

## Alcance desplegado y autoridad

- La firma pública `public.rpc_solog_cashier_bootstrap_v6(p_payload jsonb)` no cambia. En respuestas exitosas `code='CASHIER_STATE'`, `data` añade un objeto `operational_summary` y cada entrada de `data.groups[]` añade `coverage_pending_round`.
- Se creó `inventario.full_cashier_kpi_projection_v1(p_site uuid,p_session uuid,p_now timestamptz)`: una consulta SQL `STABLE` con un único contexto de ronda y fotografía de datos, sin almacenamiento adicional.
- `inventario.full_cashier_state_v2` consume la proyección para construir ambos campos. Conserva `timezone`, `stock`, `session`, `recovery_sessions`, `shift`, `capabilities`, `confirmed_observation_ids`, `recovery_manifests` y `recovery_delivery_states`.
- **Sin cambios de V7**: `public.rpc_solog_cashier_mutate_v7` y el arreglo `affected_groups` mantienen su contrato anterior. Tampoco se modificaron dispatcher, acciones de grupo, triggers o prioridades.

## Contrato TypeScript (campos nuevos)

```ts
type CashierOperationalSummaryFull = {
  basis: {
    coverage_round: 1 | 2;
    round_starts_at: string; // timestamp ISO UTC
    round_ends_at: string; // timestamp ISO UTC, fin exclusivo
  };
  coverage_total: number;    // entero >= 0
  coverage_counted: number;  // entero >= 0
  coverage_pending: number;  // entero >= 0; total - counted
  coverage_percent: number;  // porcentaje 0..100, un decimal; 0 cuando total=0
  review_pending: number;    // entero >= 0
  daily_pending: number;     // entero >= 0
  next_action: "coverage" | "review" | "daily" | "none";
};
type CashierStateFullV6Delta = {
  operational_summary: CashierOperationalSummaryFull;
  groups: Array<FullGroup & {
    coverage_pending_round: boolean;
  }>;
};
```

`operational_summary` está siempre presente en `CASHIER_STATE` exitoso, aun sin sesión o con stock no disponible. Sin sesión, `groups=[]`.

**Semántica:** el universo de cobertura incluye todos los registros activos de `inventario.estado_stock_grupo` para la sede autenticada, incluso `requiere_snapshot_completo=true`. Un grupo se considera cubierto cuando `ultima_observacion_fisica_at` pertenece a la ronda actual `[round_starts_at,round_ends_at)`. Las acciones de conteo y reconteo siguen determinadas por `full_group_actions_v1`, que conserva la compuerta de snapshot.

`coverage_pending_round` es verdadero cuando el grupo de sesión pertenece al universo activo y no está cubierto en la ronda del `operational_summary`. Si el grupo ya no forma parte del universo, el campo es `false`. Los grupos de sesión se consultan solo cuando `session_id` pertenece a la sede solicitada.

`review_pending` contabiliza las acciones de reconteo actualmente habilitadas; `daily_pending` contabiliza `action='daily'`. `next_action` usa el resolvedor realmente desplegado (`round_coverage → review_for_coverage → review_regular → shift_coverage`) y se expresa en el vocabulario público. Es **informativo**, nunca una autorización de ruta de sesión.

El envelope existente aporta `server_now`, utilizando el mismo `p_now` entregado a la proyección. No duplicar hora de cálculo en `operational_summary`. Los borradores locales no se incorporan al resumen autoritativo.

## Consumo frontend exigido

1. Conservar separadas las variantes `CASHIER_STATE.groups` enriquecidas y `V7.affected_groups` sin el nuevo campo obligatorio.
2. Proyectar borradores locales solo cuando `coverage_pending_round=true`, el `countedAt` pertenece a la misma ronda, el grupo corresponde a la sesión activa y la captura no está confirmada o rechazada definitivamente; deduplicar por grupo.
3. Mostrar azul para confirmados y ámbar para provisionales. La tarjeta de cobertura completada y los cambios A1/A2/B/C dependen **solo del resumen oficial**; nunca de borradores.
4. Invalidez temporal: en `round_ends_at`, invalidar proyección visual anterior y pedir nuevo V6 utilizando el reloj servidor existente. Ante fallo de sincronización, no presentar cobertura de ronda antigua como vigente.
5. No derivar autorización de navegación de `operational_summary.next_action`; únicamente de prioridad/acciones/capabilities vigentes del Motor Full y la sesión.
6. Recuperar la UI histórica con el delta aprobado: **A2 incluye Flujo Operativo siempre**; resto de estados conforme a la fuente primaria.
7. No modificar backend desde Codex.

## Validaciones efectuadas después de despliegue

- `apply_migration` terminó con `success=true`; historial remoto: versión `20261028034458`, total 204 migraciones.
- La función nueva existe, es `STABLE`, `SECURITY INVOKER`, owner `postgres`; ACL de ejecución solo para `postgres`, ninguna para `PUBLIC`, `anon` ni `authenticated`.
- Funciones públicas V6/V7, dispatcher, `full_group_actions_v1`, `full_runtime_json_v2`, `full_temporal_context_v1` y trigger físico mantuvieron los hashes de P2 predespliegue.
- Proyección para cinco sedes, utilizando reloj de servidor: 2465 en universo, 17 con cobertura, 2448 pendientes (valores del instante de prueba), 5/5 invariantes aritméticas, temporales y de prioridad válidas, sin grupos activos duplicados por sede.
- Estado Full interno invocado en lectura para un usuario/sede existentes: respuesta estructural completa y `operational_summary` presentes.
- Envelope `inventario.full_cashier_result_v2('CASHIER_STATE',...)` ejercitado en lectura: `ok=true`, `contract_version=2`, `server_now`, campos de recuperación/stock/capacidades y KPI presentes. **No equivale a una llamada HTTP autenticada a la RPC pública**.
- Cambio de ronda: cuatro fronteras exactas, 4/4 intervalos correctos, secuencia de rondas `[1,2,2,1]`; universo vacío: `total=counted=pending=0`, `percent=0`, `next_action='none'`, `groups=[]`.
- Llamada pública sin identidad: `USER_UNAUTHORIZED` y `data=null`; no se expone resumen.
- `EXPLAIN (ANALYZE,BUFFERS)` con función desplegada y sin sesión: 10.56 ms de ejecución SQL, 0 lecturas físicas en la muestra. En P1, proyección equivalente con 493 grupos: ~34.7 ms; incremento JSON de grupos +4.66%. **No extrapolar a p95 o concurrencia real**.
- Conteos operativos previos y posteriores: 11 sesiones Full (0 active, 0 recovery), 32 operaciones, 19 observaciones; iguales, sin escrituras de datos de prueba.
- Advisors posdespliegue: observaciones preexistentes en vistas SECURITY DEFINER, otras funciones y RLS; ninguna referencia nueva a `full_cashier_kpi_projection_v1`. Fuera de alcance de este bloque; no afirmar que las alertas generales quedaron resueltas.

## Límites y evidencia pendiente

- No se ejecutó E2E autenticado real desde navegador y dispositivo válido; tampoco una carrera de escritura V7 contra V6 con dos conexiones reales (sin staging aislado). La coherencia de resumen y banderas deriva de **una sola sentencia SQL** y las pruebas de solo lectura, no de una prueba de estrés concurrente.
- No hay runtime activo al momento del despliegue: los 493 grupos observados y las 476 banderas coherentes en P1 corresponden a la prueba anterior, no a una prueba de sesión activa posdespliegue.
- Las ocho migraciones Full históricas están recuperadas en `admin-work` y verificadas 8/8 iguales al historial SQL; quedan 173 migraciones remotas históricas no versionadas en el repositorio. No ejecutar reset ni asumir reconstrucción completa con este subconjunto.

## Rollback controlado (solo si hay regresión)

Reemplazar exclusivamente `inventario.full_cashier_state_v2` por la versión exacta archivada en `20261025201355_solog_cajero_full_recovery_finish_v1.sql` **no es suficiente sin revisar el contexto y migraciones posteriores**; preferir un delta de rollback específico con verificación de baseline y preservar V7. La función auxiliar puede permanecer privada sin efectos si no es consumida. Evitar manipular historial `supabase_migrations` o borrar datos.

**Barrera liberada para P3/P4:** backend objetivo está desplegado y el contrato de lectura está congelado. P3 corresponde a baseline y plan de Codex, sin implementar; aprobación de plan según metodología del proyecto.
