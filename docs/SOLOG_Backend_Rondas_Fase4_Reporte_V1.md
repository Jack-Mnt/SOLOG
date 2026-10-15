# SOLOG — Backend Dashboard: Fase 4, Rondas, Obligaciones y Cortes Históricos — reporte V1

| Campo | Resultado |
|---|---|
| Estado | **DESPLEGADO — validación técnica SQL controlada; falta primer conteo operativo V5 y primer ciclo del Cron** |
| Nivel | C — lógica/backend/persistencia |
| Fecha de ejecución | 15-10-2026, America/Lima |
| Proyecto | Supabase `fvtohxvcvsflzmftgfzs`, base principal |
| Rama documental | GitHub `Jack-Mnt/SOLOG` → `admin-work` |
| Fuente funcional primaria | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` (**congelada**) |
| Delta funcional prevalente | `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` (solo en sus sustituciones; **no modifica Rondas**) |
| Diseño técnico referencial | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md`, propuesto antes de la implementación; los SQL y el backend desplegado son la evidencia técnica ejecutable |
| Límites | Sin reemplazar RPC V4/V5 ni ConeXion V2, sin cambiar tablas operativas, sin implementar Actividad ni RPC pública Dashboard; `master` intacta |

## 1. Migraciones aplicadas y trazabilidad

| Versión Supabase | Migración real | Archivo SQL versionado en `docs/` |
|---|---|---|
| `20261015140659` | `solog_dashboard_fase4_rondas_baseline_v1` | `SOLOG_Backend_Rondas_Fase4_Baseline_V1.sql` |
| `20261015140856` | `solog_dashboard_fase4_rondas_acreditacion_versionado_v1` | `SOLOG_Backend_Rondas_Fase4_Acreditacion_V1.sql` |
| `20261015141302` | `solog_dashboard_fase4_cortes_asof_versionados_v1` | `SOLOG_Backend_Rondas_Fase4_Cortes_AsOf_V1.sql` |
| `20261015141613` | `solog_dashboard_fase4_cortes_correcion_evidencia_tardia_v1` | `SOLOG_Backend_Rondas_Fase4_Correccion_Tardia_V1.sql` |
| `20261015141700` | `solog_dashboard_fase4_hooks_rondas_v1` | `SOLOG_Backend_Rondas_Fase4_Hooks_V1.sql` |
| `20261015141759` | `solog_dashboard_fase4_cron_funcion_rondas_v1` | `SOLOG_Backend_Rondas_Fase4_Cron_Funcion_V1.sql` |
| `20261015142034` | `solog_dashboard_fase4_corte_nd_record_nulo_v1` | `SOLOG_Backend_Rondas_Fase4_Correccion_ND_V1.sql` |
| `20261015142125` | `solog_dashboard_fase4_bootstrap_rondas_cron_v1` | `SOLOG_Backend_Rondas_Fase4_Bootstrap_Cron_V1.sql` |
| `20261015142345` | `solog_dashboard_fase4_herencia_generacion_adyacente_v1` | `SOLOG_Backend_Rondas_Fase4_Herencia_Adyacente_V1.sql` |
| `20261015142425` | `solog_dashboard_fase4_futura_herencia_estructural_v1` | `SOLOG_Backend_Rondas_Fase4_Futura_Herencia_V1.sql` |

**Orden y prevalencia:** los diez SQL son la fuente ejecutable reproducible de Fase 4 **en este orden**. Las correcciones posteriores reemplazan únicamente la función concreta afectada, sin reescribir migraciones ya aplicadas. El intento inicial del corte `fase4_corte_asof_v1` falló al compilar (`day` sin delimitar) y **no es una migración aplicada**; no forma parte de la secuencia. La prueba de corte `N/D` detectó una variable record sin estructura, corregida en `fase4_corte_nd_record_nulo_v1`.

## 2. Modelo persistido

Se utilizan las tres tablas pasivas de Fase 1, con campos técnicos nuevos:

- `inventario.metrics_rondas`: PK `(sede_id,ronda_desde)`, programación real de la ronda por `solog_temporal_context`, período, estado, cobertura corriente, acreditaciones, primer hito 50/90/100, `calidad_historia` (`complete|partial|no_data`) e `inicializada_at`.
- `inventario.metrics_ronda_obligaciones`: PK sede+ronda+grupo+generación; `vigente_desde/hasta`, exigibilidad, fingerprint de composición SKU, **`evidencia_desde_at`**, primera física que acredita, tipo y turno físico aportante. El fingerprint identifica grupo y su conjunto de SKU incluidos, sin persistir catálogo completo en cada observación.
- `inventario.metrics_rondas_cortes`: PK sede+ronda+versión; `H_G/H_R/H_Z/H_S/H_T/H_U`, cobertura final y denominador, aporte por turno, hitos y JSONB con identidades/evidencias por grupo. Campos de corrección `motivo_correccion`, `evidencia_correccion_id` y `version_anterior`.

Las tablas permanecen privadas y con RLS; no se concedió acceso directo al frontend.

## 3. Cobertura y generaciones estructurales

- Universo por sede: grupos activos contables con al menos un SKU incluido, **sin excluir stock 0 o negativo**. Se obtiene de Catálogo/Grupos y no del estado temporal de `estado_stock_grupo`.
- Desde la captura inicial cada sede tiene **488 grupos exigibles**, **489 grupos registrados** contando uno inactivo/no exigible.
- Acreditación: primera física normal o reconteo válido de esa ronda compatible con la generación estructural, usando `contado_at` o `recontado_at`; idempotencia por obligación. No contar un snapshot, `Recontar` teórico o replay como nueva acreditación.
- Turno contribuyente: `early|day|night` derivado del **timestamp físico** mediante `solog_temporal_context`, **no** del turno de sesión (la excepción de turno de sesión pertenece solo a Actividad).
- Excluir/incorporar SKU, mover miembro entre grupos o activar/desactivar grupo: se crea generación nueva solo en ronda en curso si cambia elegibilidad/fingerprint; se conserva anterior con su vigencia. La ronda futura preinicializada actualiza su composición de inicio sin falsos históricos. Un cambio de precio no reinicia cobertura.
- La vigencia `evidencia_desde_at` impide reutilizar físicas anteriores al cambio estructural; cuando empieza una nueva ronda solo se hereda la evidencia de la **última generación de la ronda anterior** si el fingerprint sigue siendo igual y dicha generación era exigible. No se salta una generación incompatible ni se recupera evidencia anterior tras exclusión/reinclusión.
- Hitos 50/90/100: quedan grabados solo en el **primer cruce**, con timestamps no decrecientes, y permanecen inmutables si después baja el universo o la cobertura.

## 4. Precisión histórica as-of, cierre e idempotencia

`metrics_ronda_corte_generar_v1(sede,ronda,as_of,correction_event_id)`:

- No cierra antes de `ronda_hasta` real. El Cron puede dispararse después sin cambiar la fecha del corte.
- Selecciona el universo de obligaciones **vigente al límite programado** y su fingerprint. Reconstruye hechos normales `d0=0` y reconteos físicos `dr=0` o del mismo signo que `d0`, filtrando por hora física anterior a cierre y posterior a la activación de generación. **No usa el estado actual mutable de `metrics_diferencias` ni el último `estado_diferencia` como confirmación retroactiva.**
- Reconteo `Confirmada`: conserva la menor magnitud del mismo signo, conforme a V5. Un `Recontar` o `Inconsistente` posterior **no borra** la confirmación física anterior comparable para H.
- Categorías binarias `G/R/Z/S`: `Z` solo física confirmada con stock teórico=0 y físico=0. `H_T=H_G+H_R+H_Z+H_S`, `H_U=H_G+H_R`, sin amarillo histórico. El corte almacena la evidencia por identidad de grupo; barra porcentual será derivada por futura RPC.
- Cobertura final, hitos y contribución por turno se conservan junto a los contadores. Los cortes son **append-only**: repetir cierre normal devuelve versión existente; entregar evidencia físicamente anterior a un cierre ya realizado agrega una nueva versión auditada identificada por evento normal/reconteo, sin reemplazar la anterior.
- Si falta historia estructural completa, persiste corte `nd` con H/denominadores **NULL**, `motivo_calidad=historia_estructural_no_verificable`, evidencia vacía. Nunca se etiqueta `0` una métrica no verificable.
- La corrección tardía opera solo sobre rondas cerradas con historia verificable; no reabre cobertura ni modifica hitos ya congelados. La identidad de corrección es `md5(detalle_id||':'||tipo_observacion)::uuid`, estable y distinta para normal/reconteo del mismo detalle.

## 5. Integraciones transaccionales desplegadas

**Siete triggers nuevos**:

1. `trg_metrics_rondas_fisica_normal_v1`: `AFTER INSERT` de `conteo_detalle`.
2. `trg_metrics_rondas_fisica_reconteo_v1`: `AFTER UPDATE OF recontado_at` cuando existe nueva observación física.
3. `trg_metrics_rondas_catalogo_insert_v1`.
4. `trg_metrics_rondas_catalogo_update_v1`.
5. `trg_metrics_rondas_catalogo_delete_v1`.
6. `trg_metrics_rondas_grupo_insert_v1`.
7. `trg_metrics_rondas_grupo_activo_v1`.

Los cambios de catálogo usan **transition tables a nivel sentencia**; no se crearon triggers por SKU. Las funciones son `SECURITY INVOKER` internas, `search_path=''`, sin `EXECUTE` para `anon` o `authenticated`. No se reemplazó la RPC `rpc_solog_cashier_mutate_v5`, ni su motor de prioridad/sesión, ni las RPC ConeXion, ni los triggers de fases anteriores.

## 6. Inicialización prospectiva realizada

**Fecha de activación:** 15-10-2026 (Lima), dentro de la Ronda 2 de la quincena 01–15/10.

| Ronda (Lima) | Sedes | Estado / calidad | Obligaciones / acreditaciones |
|---|---:|---|---|
| 01–07/10/2026, R1 | 5 | `sin_datos / no_data`, corte V1 `N/D` | 0 obligaciones reconstruidas retroactivamente; H y cobertura nulos |
| 08–15/10/2026, R2 | 5 | `abierta / partial` | 2445 filas; 2440 exigibles; 0 acreditadas desde activación |
| 16–23/10/2026, R1 siguiente quincena | 5 | `abierta / complete` (preparada prospectivamente) | 2445 filas; 2440 exigibles; 0 acreditadas antes de inicio |

**Total verificado:** 15 rondas, **4890 filas** de obligaciones, **5 cortes N/D**; 0 observaciones/acreditaciones sintéticas persistidas. Las cantidades se distribuirán entre sedes al llegar hechos válidos; no se reparó el histórico de septiembre con suposiciones.

La ronda vigente iniciada ocho días antes del despliegue está declarada **parcial** para no inventar acreditaciones, hitos ni denominadores a fechas previas al seguimiento. La ronda siguiente se preparó antes de su inicio, y sus miembros/versiones se actualizarán si cambia el catálogo mientras llega el límite programado.

## 7. Cron y recuperación

`cron.job` ID **7**: `metrics_rondas_cierre_recuperable`, **activo** con schedule UTC `4 * * * *`. Por ello se ejecuta cada hora en el minuto **04**, no cierra al primer 100 %, ni decide que una ronda termina en ese minuto; solo encuentra `ronda_hasta<=as_of` y aplica el cierre temporal recuperable. También asegura automáticamente ronda presente y próxima.

Al acabar la validación, el job tenía **0 ejecuciones registradas**; la función se invocó manualmente con éxito dentro de pruebas revertidas. La primera ejecución del Cron y el primer cierre natural real todavía necesitan verificación. No se desactivaron los jobs operativos anteriores ni la calibración C24 temporal.

## 8. Pruebas PostgreSQL realizadas (rollback donde corresponde)

| Caso | Resultado |
|---|---|
| Inicialización sobre una sede: 489 grupos registrados, 488 exigibles | PASA |
| Preparación simultánea de ronda vigente/futura para las 5 sedes | PASA |
| Repetir bootstrap: no duplica obligaciones | PASA |
| Primer evento físico compatible acredita; replay no acredita de nuevo | PASA (helper con evento sintético) |
| Cambio de composición sin modificación real: generación permanece 1 | PASA |
| Excluir SKU único: generación nueva, exigibles bajan 488→487 | PASA (catálogo real, transacción revertida) |
| Excluir SKU en grupo futuro: modificar estado inicial sin generación falsa | PASA |
| Reincorporar SKU: generación nueva; no revivir acreditación anterior | PASA (rollback) |
| Primer hito 50 %; luego 90 % y 100 % | PASA (ronda sintética, rollback) |
| Caída posterior de cobertura: hitos originales inmutables | PASA |
| Cierre binario: `H_T=H_G+H_R+H_Z+H_S` | PASA con evidencia física preexistente, rollback |
| Segundo cierre: retorna la misma versión | PASA |
| Evidencia tardía: crea corte V2 auditado; repetirla no duplica V3 | PASA, usando física histórica existente y ronda sintética revertida |
| Cierre `N/D` de quincena anterior: todos H/denominadores NULL | PASA |
| Segundo Cron manual: no crea cortes adicionales | PASA |
| Permisos SQL de funciones Rondas | 10 privadas, 0 definer, 0 `anon`/`authenticated` EXECUTE |
| Integración de nuevo lote Cajero V5 y primera ejecución real Cron | **PENDIENTE DE SMOKE OPERATIVO / EJECUCIÓN PROGRAMADA** |

Las pruebas de escritura que afectaron catálogo, rondas o eventos sintéticos terminaron en rollback explícito; después de ellas se comprobó que no quedaban filas artificiales. **La inicialización real y el job Cron sí son cambios persistidos autorizados.** Las fuentes operativas `conteos`, `conteo_detalle`, `stock_actual` y snapshots no se alteraron durante la inicialización.

## 9. Riesgos y límites pendientes

- **No hay todavía una primera física V5 nueva posterior a la activación:** el hook y helper están comprobados indirectamente, pero falta smoke Cajero end-to-end sobre un snapshot vigente con cobertura y reconteo, incluyendo prioridad/rutina de autorización preexistente. No declarar esto validado.
- **Primer cierre real de ronda verificable:** la ronda actual está en calidad parcial, de modo que su corte al 16-10-2026 será `N/D`. La primera ronda completa prospectivamente comienza en ese límite y termina el **24-10-2026 00:00 Lima**. Esa es la primera candidata a corte válido real, siempre que no surja una incompatibilidad.
- **Cron:** no hay evidencia aún de un job run automático exitoso. Inspeccionar `cron.job_run_details` después de la siguiente ejecución y de las fechas de corte.
- **Concurrencia/performance:** transacciones serializadas por locks de filas y orden determinista; no se han realizado dos sesiones simultáneas ni benchmark de ingesta real con catálogo mutando concurrentemente. Medir con actividad real antes de declarar SLA o ausencia absoluta de deadlocks.
- **Rondas anteriores a la activación:** historial de composición insuficiente, representan `N/D`, no cero ni precisión reconstruida por `metrics_diferencias`.
- **Correcciones tardías:** existe ruta versionada para hechos físicos anteriores a cierre; se validó mecánica con física histórica + ronda sintética y rollback. No se ha provocado un envío tardío real desde V5.
- **Actividad:** no se instrumentó en esta fase. La futura Fase 5 debe mantener prioridad de V5 y atribución a turno de la sesión, distinta de la contribución física de Rondas.
- **RPC Dashboard:** todavía no implementada; no enviar contratos incompletos a Codex/frontend.

## 10. Veredicto

**Fase 4: backend de Rondas desplegado y validado técnicamente dentro del alcance demostrado.** Faltan validaciones externas (nueva física V5, primer Cron ejecutado y primer corte real de ronda prospectiva). Por ello, queda **pendiente el cierre operativo** y la aceptación del usuario.

Fuentes funcionales congeladas intactas. Esta implementación no cierra el bloque backend global ni habilita todavía frontend Dashboard.
