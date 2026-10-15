# SOLOG — Backend Dashboard: reporte de implementación Fase 1 V1

| Campo | Resultado |
|---|---|
| Estado | **IMPLEMENTADA Y VALIDADA TÉCNICAMENTE — Fase 1; pendiente cierre del usuario** |
| Fecha | 2026-10-15, Lima |
| Nivel | C — persistencia Supabase |
| Proyecto Supabase | `fvtohxvcvsflzmftgfzs` (base principal) |
| Repositorio documental | `Jack-Mnt/SOLOG`, rama `admin-work` |
| Fuente funcional | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` |
| Delta congelado prevalente | `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` |
| Contrato técnico | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md` — propuesto en sus integraciones y RPC públicas, sin despliegue |
| Alcance aprobado | Fase 1: tablas, constraints, índices, permisos y helpers independientes |
| Fuera de alcance y **sin modificaciones** | ConeXion V2, Cajero V4/V5, Admin RPC, triggers de ingesta/observación, Cron, frontend, datos operativos, rama `master` |

## 1. Migraciones desplegadas en Supabase

Las tres migraciones se aplicaron con éxito, registradas en el historial remoto y ejecutadas secuencialmente.

| Versión de migración | Nombre | Evidencia repo |
|---|---|---|
| `20261015052759` | `solog_dashboard_fase1_estructuras_pasivas_v1` | `docs/SOLOG_Backend_Dashboard_Estructuras_Fase1_V1.sql` |
| `20261015052949` | `solog_dashboard_fase1_cortes_integridad_v1` | `docs/SOLOG_Backend_Dashboard_Correccion_Cortes_Fase1_V1.sql` |
| Posterior (confirmar versión concreta en `supabase_migrations.schema_migrations`) | `solog_dashboard_fase1_indices_fk_v1` | `docs/SOLOG_Backend_Dashboard_Indices_Fase1_V1.sql` |

**La fuente ejecutable exacta son los tres archivos SQL ordenados**, no el contrato conceptual previo. El segundo SQL refuerza la validación de `NULL` del primero; el tercero crea cuatro índices adicionales. No se ocultó la corrección ni se reescribió el SQL ya aplicado.

## 2. Estructuras creadas y estado

| Tabla | Propósito | Estado |
|---|---|---|
| `inventario.metrics_movimiento_sku` | Stock base + cinco pares Δ/duración, C24, calidad | Vacía, lista para integración |
| `inventario.metrics_calibracion_c24` | Muestras SKU temporales, independiente, eliminable | Vacía, sin Cron |
| `inventario.metrics_diferencias` | Confirmaciones y validación pendientes independientes | Vacía |
| `inventario.metrics_episodios` | Apertura/cierre físicos, un episodio abierto por grupo/sede | Vacía |
| `inventario.metrics_rondas` | Cabeceras, universo e hitos por ronda | Vacía |
| `inventario.metrics_ronda_obligaciones` | Generaciones de obligación y vigencia estructural | Vacía |
| `inventario.metrics_rondas_cortes` | Corte histórico con versión y evidencia «as-of» | Vacía |
| `inventario.metrics_actividad_turnos` | Un acumulador por sede/turno con conjuntos JSONB | Vacía |

**Verificado:** 8/8 tablas creadas; 8/8 RLS habilitado; 23 índices en el conjunto (incluyendo PK, UNIQUE e índices auxiliares). No se crearon tablas de tareas individuales, ni detalles de Movimiento 90 días, ni triggers de actualización automática.

### 2.1. Funciones auxiliares independientes (5)

1. `metrics_c24_ventana_v1(delta[],segundos[],ultimo_at,as_of)` — calcula C24 de intervalos completos vigentes en siete días y su calidad; no escribe.
2. `metrics_factor_c_v1(c24)` — factor 1/2/4 con umbrales provisionales, imputa 1 si C24 nulo; no escribe.
3. `metrics_actividad_completadas_validas_v1(habilitadas,completadas)` — valida que las tareas completadas estén habilitadas; usada en CHECK de Actividad.
4. `metrics_actividad_resumen_v1(habilitadas,completadas,retiradas)` — N, D y porcentaje derivado, `D=0 → NULL`; no escribe.
5. `metrics_movimiento_c24_efectivo_v1(sede,sku,as_of)` — lee la proyección y verifica caducidad sin depender de un job; no escribe.

**Seguridad:** las 5 funciones son `SECURITY INVOKER` con `search_path=''`, no conceden `EXECUTE` a `anon`, `authenticated` ni `service_role`. Las 8 tablas tienen RLS y no conceden lectura/escritura directa a esos roles. Esta restricción intencional produce avisos informativos `rls_enabled_no_policy`: no son exposición pública.

### 2.2. Constraints críticos verificados

- Movimiento: a lo sumo cinco intervalos, arrays alineados, no negativos/sin NULL, duración >0, coherencia base/estado/calidad.
- Calibración: hasta cinco intervalos, valor C24 no negativo, estados de medición/insuficiencia.
- Diferencias: separación entre confirmación y validación; estados definidos.
- Episodios: secuencia única por sede/grupo; índice único parcial para un episodio abierto.
- Rondas: límites temporal y universos coherentes; hitos progresivos.
- Obligaciones: generación estructural por ronda/grupo; una generación vigente.
- Cortes: PK por versión; estado `nd` sin totales; estados `valido|corregido` exigen **todos** los contadores y ecuaciones `H_T=H_G+H_R+H_Z+H_S` y `H_U=H_G+H_R`. Corregido tras detectar que `CHECK NULL` originalmente pasaba.
- Actividad: JSONB con forma de objeto, prioridad/tipo válidos; completadas subconjunto de habilitadas.

## 3. Validaciones ejecutadas contra Supabase

| Verificación | Resultado |
|---|---|
| Tabla y RLS | **8/8** |
| Funciones independientes privadas | **5/5** |
| C24 (5 intervalos, 3 mínimos, 2 insuficientes, caducidad, caducidad parcial) | **5/5 correctas** |
| Factor C (NULL, 0, 10, >10, 50, >50, >50 alto) | **7/7 correctas** |
| Actividad (34/39=87.2 %, retiro, sin tareas) | **3/3 correctas** |
| Identidad completada habilitada vs inválida | **Pasa** |
| Tipo JSONB indebido | **Rechazado por helper** |
| Ingreso de Actividad completada sin habilitación | **CHECK rechazó**, inserción encapsulada |
| Movimiento con seis intervalos | **CHECK rechazó**, inserción encapsulada |
| Corte con total parcial NULL | **CHECK rechazó** luego de corrección |
| Corte válido 1/1 | **Aceptado** dentro de subtransacción |
| Subtransacción de ensayo / rollback | **Cero filas persistidas** en las ocho tablas |
| Triggers nuevos / RPC Dashboard / Cron de métricas | **0/0/0** |
| Jobs previos ConeXion y operaciones | **Siguen activos**, sin cambios |

Los casos de inserción de prueba se realizaron en bloques PL/pgSQL con subtransacciones que revierten expresamente las escrituras. La consulta posterior constató 0 filas en las tablas probadas. No se insertaron conteos ni snapshots ficticios en el modelo operativo.

## 4. Advisors Supabase

- **Seguridad:** tablas privadas con RLS habilitado y sin políticas intencionalmente. Los avisos de `rls_enabled_no_policy` son esperados; los grants permiten confirmar que los clientes no tienen acceso directo.
- **Rendimiento:** tras aplicar índices de las FK, desaparecen los cuatro avisos `unindexed_foreign_keys` atribuibles a las nuevas tablas. Quedan avisos `unused_index` de índices nuevos **sin datos ni consultas operativas**, normales en esta fase. No se realizaron ajustes ajenos al Dashboard.
- Advertencias de otros módulos (vistas públicas, RLS o índices) existían fuera de este alcance y **no se modificaron**.

## 5. Riesgos/responsabilidades que siguen abiertos

1. **No hay proyecciones alimentadas.** Las tablas vacías no implican que un KPI esté listo; ninguna tabla se actualiza aún al confirmar snapshots o contar físicamente.
2. **Integración de Movimiento** corresponde a Fase 2: posición atómica en el flujo ConeXion V2 antes del reemplazo de stock, exclusión/reincorporación y manejo de replays. La helper C24 ya fue probada sin escrituras.
3. **Muestreo de calibración C** sigue apagado. Activarlo solo cuando existan datos, función de muestreo validada y control de destrucción segura; la tabla auxiliar existe para eso.
4. **Diferencias, Episodios, Rondas y Actividad** requieren sus funciones transaccionales y alimentación en fases posteriores; ninguno se considera probado con datos operativos.
5. **Descubrimiento de baseline:** la base viva tiene `public.rpc_solog_cashier_mutate_v5` adicional a `v4`, proveniente de migraciones recientes de octubre 2026. Antes de instrumentar conteos/reconteos, revalidar **qué RPC consume realmente el frontend** y preservar su contrato y nuevos campos. No preparar integraciones posteriores únicamente contra el V4 inspeccionado anteriormente.
6. **Concurrencia, lock order, cierre «as-of» y recuperación tardía** siguen sujetos a pruebas de integración real en la fase correspondiente. No dar por cerrados B1/B2 antes de instrumentarlos.

## 6. Veredicto y siguiente fase

**Fase 1 técnicamente validada para su alcance**: migraciones aplicadas, restricciones, cálculos básicos y seguridad verificados. Queda pendiente aprobación/cierre del usuario.

La Fase 2 debe comenzar con un preflight dirigido de `public.rpc_conexion_sync_snapshot_strict_v2`, publicación/exclusión del catálogo, `stock_actual`, `snapshot_stock` y reglas de confirmación; conectar `metrics_movimiento_sku`, comprobar atomicidad y luego habilitar de forma controlada el Cron temporal de calibración C.

Fuente primaria de decisiones funcionales: documento base + delta congelado. El presente reporte y sus SQL son evidencia de implementación; no sustituyen decisiones funcionales.
