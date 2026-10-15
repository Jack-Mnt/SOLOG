# SOLOG — Backend Dashboard Fase 6: RPC Admin, permisos y validación V1

| Elemento | Evidencia |
|---|---|
| Estado | **DESPLEGADA; VALIDACIÓN TÉCNICA DIRIGIDA APROBADA; smoke real de identidad Admin pendiente** |
| Fecha | 2026-10-15 (Lima) |
| Clasificación | Nivel C |
| Backend | Supabase `fvtohxvcvsflzmftgfzs` |
| GitHub | `Jack-Mnt/SOLOG`, rama `admin-work` (no se modificó `master`) |
| Fuente funcional primaria | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` y delta `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md`, congelados |
| Contrato de transporte efectivamente desplegado | `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md`; pendiente aceptación final antes de Codex |
| Contrato técnico anterior | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md`: histórico/propuesta cuando difiera del transporte desplegado |
| Alcance | Solo lecturas, helpers, permisos y optimización del Dashboard; no modifica motores de Conteo, snapshots o RPC previas |

## 1. Migraciones backend en orden

| Versión | Nombre aplicado | Archivo SQL en `docs/` |
|---|---|---|
| 20261015183745 | `solog_dashboard_fase6_helpers_lectura_v1` | `SOLOG_Backend_Dashboard_Fase6_Helpers_Lectura_V1.sql` |
| 20261015183900 | `solog_dashboard_fase6_lecturas_principales_v1` | `SOLOG_Backend_Dashboard_Fase6_Lecturas_Principales_V1.sql` |
| 20261015184020 | `solog_dashboard_fase6_episodios_lectura_v1` | `SOLOG_Backend_Dashboard_Fase6_Episodios_Lectura_V1.sql` |
| 20261015184059 | `solog_dashboard_fase6_actividad_matriz_lectura_v1` | `SOLOG_Backend_Dashboard_Fase6_Actividad_Lectura_V1.sql` |
| 20261015184204 | `solog_dashboard_fase6_drawer_dia_lecturas_v1` | `SOLOG_Backend_Dashboard_Fase6_Dia_Observaciones_V1.sql` |
| 20261015184247 | `solog_dashboard_fase6_dia_observaciones_variables_v1` | `SOLOG_Backend_Dashboard_Fase6_Dia_Observaciones_Delta_V1.sql` |
| 20261015184405 | `solog_dashboard_fase6_rpc_admin_contrato_v1` | `SOLOG_Backend_Dashboard_Fase6_RPC_Admin_V1.sql` |
| 20261015184740 | `solog_dashboard_fase6_cursor_base64_sin_saltos_v1` | `SOLOG_Backend_Dashboard_Fase6_Cursor_Base64_Delta_V1.sql` |
| 20261015185028 | `solog_dashboard_fase6_calidad_guardas_datos_nd_v1` | `SOLOG_Backend_Dashboard_Fase6_Calidad_Guardas_Delta_V1.sql` |
| 20261015185216 | `solog_dashboard_fase6_calidad_riesgo_insuficiente_v1` | `SOLOG_Backend_Dashboard_Fase6_Riesgo_Calidad_Delta_V1.sql` |
| 20261015185332 | `solog_dashboard_fase6_kpi_riesgo_movimiento_calidad_v1` | `SOLOG_Backend_Dashboard_Fase6_Riesgo_KPI_Calidad_Delta_V1.sql` |
| 20261015185604 | `solog_dashboard_fase6_movimiento_group_lectura_set_based_v1` | `SOLOG_Backend_Dashboard_Fase6_Movimiento_SetBased_Delta_V1.sql` |
| 20261015185726 | `solog_dashboard_fase6_actividad_dia_calidad_v1` | `SOLOG_Backend_Dashboard_Fase6_Actividad_Dia_Calidad_Delta_V1.sql` |
| 202610151858+ | `solog_dashboard_fase6_overview_calidad_global_v1` | `SOLOG_Backend_Dashboard_Fase6_Overview_Calidad_Global_Delta_V1.sql` |

**Prevalencia reproducible:** los 14 archivos SQL constituyen la secuencia desplegada; los `CREATE OR REPLACE` posteriores sustituyen solo cuerpos de funciones concretas. Este informe no sustituye los fuentes SQL. Los archivos del contrato son *documentación*, no código ejecutado.

## 2. Esquema de transporte implementado

RPC nueva: `public.metrics_dashboard_v1(text,jsonb) RETURNS jsonb`, versión de transporte `1`.

Se desplegaron los siete actions: `overview`, `rounds`, `risk`, `episodes`, `activity`, `day` y `day_observations`. Los campos, nullables, enums, pagination, excepciones y autorización están definidos en `SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md`.

**Decisión técnica B4 cerrada:** `day.confirmed_differences` se devuelve completo (una confirmación por grupo y día), con `confirmed_total` y `confirmed_next_cursor=null`; `day_observations` se pagina aparte. No se añadió una octava acción, tabla de detalle adicional ni historial duplicado.

**Paginación:** keyset y cursor Base64 de identidad/orden/ancla con vencimiento a 30 minutos. Los cursores no son credenciales ni garantizan snapshot MVCC entre llamadas independientes. El problema de saltos de línea del formato Base64 PostgreSQL se detectó y corrigió mediante migración. Se compararon páginas sucesivas, sin IDs repetidos.

**Calidad y semántica física:** los cortes de Rondas cerrados no se recomputan con elegibilidad actual; `day` y episodios sí filtran grupo operativo actual. Sobrantes/faltantes suman magnitudes brutas con signo y solo confirmaciones físicas comparables, incluidas bajo revisión amarilla; el riesgo usa C×D×V y usa C imputado con señal de `insufficient`/calidad parcial. Sin evidencia, los importes son `null`, no 0 inventado.

## 3. Resultados reales de lectura y pruebas

| Comprobación | Evidencia verificada | Resultado |
|---|---|---|
| `overview` | 5 sedes activas retornadas | PASA |
| `rounds` | Objeto de ronda vigente y arrays históricos | PASA |
| `risk` | Cutervo: página 6 y 26 grupos confirmados paginables en prueba inicial | PASA |
| `episodes` | Cutervo: 83 episodios abiertos operativos paginables; página de 25 | PASA |
| `activity` | Tres fechas producen 9 celdas (una por turno); rango 15 fechas 45 | PASA |
| `day` | Casuarinas 07/10/2026: 4 confirmaciones reconstruidas, 4 filas, valorizado con signo | PASA |
| `day_observations` | Dos páginas de 4 y 3 observaciones de Casuarinas 05/10/2026 | PASA |
| Paginación Riesgo | 3 + 3; 0 grupos duplicados; `total=26` estable en ambas páginas | PASA |
| Paginación Episodios | 5 + 5; 0 episodios duplicados; `total=83` | PASA |
| Paginación física diaria | 4 + 3; 0 duplicaciones por ID+kind | PASA |
| Precio/diferencia de confirmación diaria | `day` calcula última Confirmada física del día y valorizado congelado | PASA en muestra real |
| Conteos categóricos de precisión | Partición actual, 0/0 exento, amarillo separado y S sin evidencia | PASA en datos reales |
| Sin datos | Divino/Huaca/Unidad: importe `null`, calidad `no_data`; no mostrar cero monetario ficticio | PASA |
| Movimiento insuficiente | Cutervo/Casuarinas: Riesgo global `partial` sin C24 medido; fila `movement_quality='insufficient'` | PASA |
| Roles SQL | `anon` sin EXECUTE, `authenticated` con EXECUTE, RPC `SECURITY DEFINER`, helpers privados | PASA |
| Identidades de prueba | Administrador y moderador activos **solo durante rollback** pasan; cajero y anónimo rechazados; admin inactivo rechazado | PASA en SQL simulado |
| Errores | `NULL` action, limit >100, fecha imposible y rango >31 rechazados con código correcto | PASA, rollback |
| Estado real usuarios | Admin y moderador **inactivos** tras pruebas; no se alteró la autorización permanente | PASA |
| Datos reales | 2445 filas de Diferencias, 203 Episodios, 15 Rondas, 0 de Actividad, 1399 `conteo_detalle` | Intactos tras Fase 6 |

**Validación humana pendiente:** no existe usuario `admin` ni `moderador` activo en `public.usuarios`; la autorización real de navegador/PostgREST y la visualización administrativa esperan una habilitación explícita. La prueba de rol utilizó la identidad de SQL en una transacción revertida; **no se declara smoke de frontend real**.

## 4. Rendimiento: optimización set-based comprobada

Se midió `EXPLAIN (ANALYZE, FORMAT JSON)` en Supabase PostgreSQL, con 5 sedes y 488 grupos operativos cada una; el tiempo es de **ejecución SQL en esta muestra**, no SLA de extremo a extremo.

| Consulta | Antes de optimizar | Después | Ahorro aprox. |
|---|---:|---:|---:|
| `overview` (5 sedes) | 2543.9 ms | 35.8 ms | 98.6 % |
| `risk` (Cutervo) | 532.2 ms | 13.3 ms | 97.5 % |
| `episodes` (Cutervo) | 565.8 ms | 17.8 ms | 96.8 % |

**Motivo:** `metrics_dashboard_grupos_v1` ya no invoca para cada uno de 488 grupos el helper que recorrió SKU individualmente. Usa un CTE *set-based* que calcula C24 efectivo por SKU de la sede y agrupa una sola vez por grupo. **Sin modificación del C, D, V, R ni de los umbrales.**

Verificación de equivalencia frente a `metrics_movimiento_grupo_v1`: **488 grupos Cutervo; 0 discrepancias de puntuación y 0 discrepancias de calidad**. Actualmente Movimiento no posee C24 medido en la mayoría de grupos; habrá que volver a medir y comparar cuando lleguen capturas reales de ConeXion para incluir ruta completa con arrays poblados.

## 5. Seguridad y auditoría

- `public.metrics_dashboard_v1` permite ejecución de `authenticated`/ `service_role` únicamente, con `auth.uid()` y verificación de `usuarios.rol/activo` y `sedes.activo`. No hay bypass del rol por el simple uso de `service_role`.
- Las 11 funciones `inventario.metrics_dashboard_*` actuales **no** conceden EXECUTE directo a `authenticated`.
- `SECURITY DEFINER` deliberado: facilita acceso controlado a esquema `inventario`; `search_path=''`, todas las referencias SQL calificadas. Se mantienen RLS y ausencia de políticas públicas.
- Supabase Security Advisor señala `authenticated_security_definer_function_executable` para esta RPC y `rls_enabled_no_policy` para las tablas analíticas. Son **advertencias intencionales** del diseño de RPC con autorización propia; no deben “solucionarse” abriendo RLS ni revocando una RPC requerida.
- Performance Advisor no devolvió hallazgos específicos de esta implementación.
- Sin nuevas tareas Cron ni permisos a tablas; se conservaron intactos los jobs existentes.

## 6. Límites y riesgos pendientes

1. **Smoke real Admin pendiente**: ambos usuarios de rol `admin` y `moderador` están inactivos; es necesario un usuario habilitado para probar HTTP/PostgREST y posteriormente Preview/UI. No activarlos sin autorización.
2. **Smoke operativo pendiente de fases 2–5**: no se han producido aún nuevas capturas ConeXion, conteos/reconteos V5 y una matriz Activity real después de activar los hooks. Las lecturas muestran estado legado cuando hay evidencia y N/D cuando no la hay.
3. **Paginación entre transacciones**: cursor estable en orden y ancla, pero sin fotografía MVCC global inmutable. Si cambia un grupo/resultado entre páginas, puede cambiar el conjunto observable. El frontend debe reiniciar al expirar o refrescar; no prometer scroll consistente ante mutaciones concurrentes.
4. **Carga futura**: pruebas de rendimiento con movimiento vacío y grupo actual validan buen costo; se debe repetir medición al acumular C24 por SKU en todas las sedes y con batches V5 reales. No asumir el mismo resultado en todos los contextos.
5. **Calidad N/D/Parcial**: documentos congelados exigen no interpretar ausencia de física como diferencia cero ni confundir actividad por turno con cobertura de ronda; mantener nullables exactos al integrar frontend.
6. **Contrato para Codex**: el contrato de transporte desplegado se considera la **fuente técnica candidata**, pero el envío a Codex requiere aceptación del usuario, congelación del archivo y posteriormente baseline/plan aprobado para frontend; no se implementó frontend en Fase 6.

## 7. Estado de fase

**Fase 6: implementación backend desplegada y validación técnica dirigida aprobada.** No se considera cerrado el smoke humano ni la activación de Admin. El bloque backend global conserva esas dependencias.

Los cambios de Fase 6 son solo SQL backend y documentación en `admin-work`; la rama `master` y las funciones transaccionales de operación de ConeXion/Cajero quedaron intactas.
