# SOLOG — Backend Dashboard: Fase 3 Diferencias y Episodios — reporte V1

| Campo | Resultado |
|---|---|
| Estado | **IMPLEMENTADA; validación SQL y backfill aprobados; smoke de nueva observación V5 pendiente** |
| Fecha | 2026-10-15 (America/Lima) |
| Clasificación | Nivel C — persistencia y hooks transaccionales Supabase |
| Proyecto | `fvtohxvcvsflzmftgfzs` |
| Rama de documentación | `admin-work`; producción `master` sin cambios |
| Fuente primaria funcional | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` |
| Prevalencia de delta | `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` en los apartados sustituidos |
| Contrato técnico consultado | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md` |
| Cambios operativos existentes | **No se reemplazaron RPC V4/V5, ConeXion, estado_stock_grupo ni funciones V4** |
| Cron | Sin job nuevo en Fase 3; el Cron temporal C24 de Fase 2 permanece activo |

## 1. Migraciones remotas y fuente ejecutable

Los siguientes SQL se aplicaron **en orden** y constan como migraciones reales de Supabase.

| Versión | Migración | Archivo SQL registrado en GitHub |
|---|---|---|
| `20261015055836` | `solog_dashboard_fase3_diferencias_proyeccion_v1` | `SOLOG_Backend_Diferencias_Fase3_Proyeccion_V1.sql` |
| `20261015055943` | `solog_dashboard_fase3_episodios_proyeccion_v1` | `SOLOG_Backend_Episodios_Fase3_Proyeccion_V1.sql` |
| `20261015060019` | `solog_dashboard_fase3_episodios_corregir_elegibilidad_v1` | `SOLOG_Backend_Episodios_Fase3_Correccion_Elegibilidad_V1.sql` |
| `20261015060210` | `solog_dashboard_fase3_hooks_fisicos_estructura_v1` | `SOLOG_Backend_Diferencias_Episodios_Fase3_Hooks_V1.sql` |
| `20261015060403` | `solog_dashboard_fase3_diferencias_corte_estructural_v1` | `SOLOG_Backend_Diferencias_Fase3_Corte_Estructural_V1.sql` |
| `20261015060522` | `solog_dashboard_fase3_backfill_fisico_verificable_v1` | `SOLOG_Backend_Diferencias_Episodios_Fase3_Backfill_V1.sql` |

Las dos migraciones correctivas son deltas técnicos efectivos: la de Episodios corrige `elegible` y la de Diferencias agrega un corte estructural. Los archivos iniciales son históricos de migración; **el estado final prevalente es la secuencia completa**, no solo el primer SQL.

## 2. Dominio Diferencias: fuente y reglas

Función privada `inventario.metrics_diferencias_reconciliar_v1(sede,grupo)`:

- Consulta únicamente observaciones del grupo/sede, distinguiendo `d0` del evento inicial y `dr` del reconteo.
- `Coincide` físicamente válido: `d0=0` o `dr=0`. **No** usa `estado_diferencia='Coincide'` sin evidencia física cero para validar estados teóricos.
- `Confirmada`: reconteo con `d0` y `dr` del mismo signo, seleccionando la menor magnitud física como hace V5 (sin reemplazarla arbitrariamente por `dr`).
- `Recontar` / `Inconsistente`: obligación actual separada de la última confirmación; una confirmación anterior comparable puede seguir valorizándose con una revisión pendiente.
- `valor_diferencia_confirmada` se obtiene mediante `inventario.solog_calcular_valor_diferencia` y **precio, unidades y precio por paquete congelados en el conteo original**. Cambiar precio actual de grupo modifica únicamente `factor_v_riesgo`.
- Al evaluar comparabilidad actual, exige grupo activo con SKU incluidos, `codigos_internos` de evidencia compatibles con los miembros actuales, y que la evidencia sea **posterior** a `estructura_cambio_at`, cuando existe.
- No se sustituye `estado_stock_grupo`, no se crea un estado `por_recontar` duplicado ni se actualiza la diferencia física original.

**Campo técnico añadido:** `inventario.metrics_diferencias.estructura_cambio_at timestamptz NULL`. Un grupo que cambia estructura no puede recuperar como confirmación vigente una observación de la generación anterior aunque luego la composición vuelva a ser idéntica. Esta implementación refuerza la decisión funcional congelada y no sustituye el versionado de obligaciones de Ronda previsto en Fase 4.

## 3. Dominio Episodios: reglas y estabilidad

Función privada `inventario.metrics_episodios_reconciliar_v1(sede,grupo)`:

- Procesa en orden físico los eventos normales y reconteos originales, con desempates estables por tiempo, tipo e ID.
- `d≠0` abre el primer episodio, y nuevas diferencias no cero mantienen **el mismo episodio**; una observación física posterior `d=0` lo cierra. Tras cierre, nueva diferencia abre episodio nuevo.
- Un cierre `Recontar`, `Inconsistente`, ajuste teórico por snapshot o exclusión de catálogo **no** equivale a cierre físico.
- Reconciliación extraordinaria localizada del grupo permite corregir el orden ante hechos tardíos; no escanea todo el historial al consultar el Dashboard.
- Identidad de `episodio_id` **determinista por sede, grupo y evidencia de apertura**: reintentar la misma serie produce los mismos IDs. La fila local puede reconstruirse durante un evento; la operación es transaccional. No crear tablas de eventos adicionales.
- `operativamente_visible_desde` se pone a NULL en cambios estructurales; la reactivación sin nueva evidencia **no resucita** episodios viejos como operativos, y no se escribe un cierre físico ficticio.
- La recurrencia de 45 días y la importancia se calculan desde episodios persistidos en la futura capa de lectura, **sin nueva tabla diaria**.

**Límite del backfill:** las evidencias físicas anteriores al despliegue no tienen una historia completa de vigencias de composición SKU→grupo. Para **Diferencias actuales** se exige coincidencia estructural presente; para **Episodios** se preserva la cronología física original con sus IDs. No se declara validación histórica de rondas anteriores ni se inventan cortes.

## 4. Hooks desplegados, sin sustituir V5

Se crearon **seis triggers nuevos de Fase 3**, todos activos:

1. `trg_metrics_observacion_normal_v1`: `AFTER INSERT` de `conteo_detalle`, reconciliación de proyecciones por sede/grupo.
2. `trg_metrics_observacion_reconteo_v1`: `AFTER UPDATE OF recontado_at` solo cuando hay nuevo reconteo físico; se captura **después** de que V5 escribió diferencia consolidada/valor.
3. `trg_metrics_catalogo_update_grupos_v1`: `AFTER UPDATE ... REFERENCING OLD/NEW TABLE`; solo grupos cuyo estado de inclusión o adscripción cambió.
4. `trg_metrics_catalogo_insert_grupos_v1`: nuevos SKU; afecta únicamente sus grupos.
5. `trg_metrics_catalogo_delete_grupos_v1`: eliminación real de SKU; afecta únicamente sus grupos.
6. `trg_metrics_grupo_precio_estado_v1`: cambio de `precio` refresca factor V; cambio de `activo` invalida estructura y oculta episodio operativo hasta nueva física comparable.

El código original de `public.rpc_solog_cashier_mutate_v5` **no se editó** y conserva su firma, acciones, prioridades, validaciones, firma de respuesta y efectos V4. El mismo mecanismo de triggers también puede atender eventos autorizados por V4, sin añadir ramas al motor.

## 5. Backfill efectuado en Supabase

Se inició `metrics_diferencias` con una fila por **5 sedes × 489 grupos = 2445 pares**, incluidos «sin evidencia», exentos y un grupo inactivo (este último se marca `invalid`).

Se reconciliaron los **972 pares sede/grupo con observaciones físicas históricas**, en la transacción de migración, alimentando las proyecciones sin insertar ni cambiar `conteo_detalle`, sesiones, snapshots o catálogo.

| Indicador | Resultado comprobado |
|---|---:|
| Filas en `metrics_diferencias` | **2445** |
| Episodios totales persistidos | **203** |
| Episodios físicamente abiertos | **140** |
| Episodios físicamente cerrados | **63** |
| Reaperturas con cierre anterior en 45 días móviles | **13** |
| Coincide comparable con obligación nueva `recontar` | **45** |
| Confirmada comparable con obligación nueva `recontar` | **8** |
| Coincide comparable con obligación `inconsistente` | **2** |
| Confirmada comparable subyacente (con o sin revisión) | **42** |
| Exenciones confirmadas físicamente 0/0, comparables | **405** |

Las cifras de hoy son **proyecciones iniciales de evidencia disponible**, no KPI de nueva UI ni prueba de una captura física posterior al despliegue. El registro previo de siete `Coincide` sin física coincidente se excluye de la lógica de confirmación salvo que exista otra evidencia física válida.

## 6. Validaciones ejecutadas

| Prueba o invariante | Resultado |
|---|---|
| Cuatro estados físicos sobre datos reales: `Coincide / Recontar / Confirmada / Inconsistente` | PASA |
| Reconstrucción de episodios repetida sobre mismo grupo: IDs estables | PASA |
| Como máximo un episodio abierto por sede/grupo | PASA (0 duplicaciones) |
| Nunca `cierre_at<apertura_at` ni última fecha anterior a apertura | PASA |
| Confirmaciones `Coincide` con diferencia física consolidada distinta de cero | **0** |
| Confirmaciones `Confirmada` comparables con diferencia consolidada cero | **0** |
| Confirmada comparable vs V5, diferencia | **42/42 coinciden** |
| Confirmada comparable vs V5, valorizado congelado | **42/42 coinciden** |
| Confirmada comparable vs V5, precio original | **42/42 coinciden** |
| Confirmada comparable vs V5, fecha de reconteo | **42/42 coinciden** |
| Cambio estructural a Excluido: marca incompatibilidad y oculta episodio abierto | PASA, test con rollback |
| Reincorporación: no se recupera confirmación previa sin nueva física | PASA, test con rollback |
| Cambio precio: factor V recalculado sin revalorizar evidencia histórica | PASA, test con rollback |
| Funciones internas privadas invoker, sin EXECUTE directo de anon/authenticated | PASA |
| Datos sintéticos de pruebas sobre catálogo/sesiones | **0 persistidos** |
| Integración directa con nueva física real transmitida por V5 | **NO PROBADA AÚN** |

El ensayo real de `AFTER INSERT/UPDATE` de una observación nueva requiere un conteo operativo válido: **no se creó un dispositivo/sesión ficticia ni se eludieron las validaciones V5**. La existencia/activación de los triggers está comprobada, pero la ruta end-to-end real necesita smoke de Cajero con snapshot válido.

## 7. Dependencias y riesgos residuales

1. **Smoke Cajero V5 pendiente:** después de un snapshot ConeXion válido, realizar un conteo `Coincide`, otro `Recontar` y, con posterior snapshot, un reconteo para observar ambos triggers y la actualización autoritativa de Diferencias/Episodios. No presentar resultados del backfill como prueba de escritura nueva desde UI.
2. **Concurrencia** entre cambios de catálogo y escrituras físicas de V5 requiere observación en uso real; evitar inversiones de bloqueo si las fases siguientes amplían hooks. No modificar semántica del motor para solucionar lentitud analítica sin preflight.
3. **Histórico estructural anterior al despliegue:** no existe versionado histórico SKU→grupo suficientemente completo; la precisión de Rondas «as-of» se resolverá prospectivamente en Fase 4. Estas proyecciones de estado actual **no** deben usarse para cerrar Rondas históricas.
4. **Costo de reconciliación por grupo:** al llegar una nueva física, Episodios reevalúa únicamente hechos del grupo en una transacción. Está justificado por bajo volumen actual y admite observaciones tardías; medir latencia con eventos reales antes de optimizar. No declarar SLA no observado.
5. **Capa de lectura pública:** `metrics_dashboard_v1` aún no desplegada, y la clasificación de precisión, recurrencia, ranking y montos agregados del Dashboard se implementará y validará en la Fase de RPC posterior. No exponer tablas privadas directamente.
6. **La Fase 4** debe mantener dos historias diferentes: las proyecciones vigentes de Diferencias y Episodios **no son** cortes históricos de Rondas. Las obligaciones, generaciones y cortes versionados disponen de tablas pasivas ya creadas en Fase 1.

## 8. Estado final

**Fase 3 — backend implementado y validado técnicamente para cálculos, datos históricos disponibles, estructura y permisos.** La integración de nuevo conteo/reconteo operativo V5 queda pendiente de smoke real. No se considera validado lo que no se ha podido comprobar.

Las fuentes funcionales base y delta permanecen congeladas; la presente evidencia no las modifica. El bloque backend general **sigue abierto**. Cierre de la fase pendiente de aceptación del usuario.
