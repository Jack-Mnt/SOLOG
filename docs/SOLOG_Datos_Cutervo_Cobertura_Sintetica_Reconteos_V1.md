# SOLOG — Datos Cutervo — Cobertura sintética para smoke de reconteos V1

**Estado:** EJECUTADO Y VALIDADO mediante lectura independiente en Supabase.
**Fecha:** 2026-11-20, hora Perú; carga 17:18:45–17:18:55 y auditoría 17:19.
**Clasificación:** Nivel C de datos operativos; carga excepcional aprobada por el usuario en conversación.
**Alcance:** SOLO Cutervo. No altera frontend, políticas, Motor, esquemas, RPC, RLS, `master` ni la sesión real posterior.

## 1. Naturaleza de los datos y autorización

El usuario autorizó completar la cobertura pendiente de Cutervo con conteos **sintéticos**, para permitir un smoke posterior de reconteos del Cajero Full. Autorizó específicamente:

- 401 grupos con `stock_fisico = stock_teorico >= 0`, diferencia 0, estado `Coincide`.
- 5 grupos cuyo stock teórico era negativo, registrados con `stock_fisico=0`, diferencia positiva y estado `Recontar`.

**Importante:** estos registros **NO son conteos físicos observados por un trabajador**. Se usan exclusivamente para preparar el estado del Motor. Los indicadores operativos pueden contabilizarlos como observaciones; no interpretar el 88,4 % de cobertura como auditoría física real.

## 2. Identificadores de la carga

| Elemento | ID / valor |
|---|---|
| Supabase | `fvtohxvcvsflzmftgfzs` |
| Sede Cutervo | `773e4938-87e3-4c60-a08b-9b01a8091bcd` |
| Sesión **sintética** | `fd6769a9-e62e-466e-912c-460c3b3aee2b` |
| Snapshot de referencia confirmado | `edea75f7-f90a-4b1a-bea0-df35817c21c9` |
| Grupos snapshot | 493 |
| Usuario utilizado para satisfacer FK | `ce0df4a2-d4d9-4056-af4a-f135fed79116` (cajero Cutervo; la operación fue automatizada, no realizada por ese usuario) |
| Inicio/fin de sesión almacenados | 17:18:25 / 17:18:54, hora Perú |
| Estado final | `finalizado` |
| Filas nuevas en `inventario.conteo_detalle` | 406 |
| `inventario.full_session_windows` de esta sesión | 0 — sesión sintética no V3 |
| `inventario.full_observations` de esta sesión | 0 — no se simularon receipts RPC V7 |
| `inventario.solog_session_runtime_groups` residuales | 0 — cleanup por trigger |

La prueba reversible previa registró y finalizó un conteo sintético, confirmó la actualización de cobertura y ejecutó rollback, dejando 0 residuos.

La carga real utilizó **una única transacción PostgreSQL**, sesión de tipo legacy sintética con runtime V4 y triggers habilitados; cada registro se insertó con snapshot, grupo y observación UUID propios; luego la tarea runtime se pasó a `none`. El Motor y las métricas existentes ejecutaron sus triggers. Se exigieron invariantes exactos y la operación podía retornar `FAILED_ROLLED_BACK` ante cualquier error. La respuesta fue `COMMITTED`.

## 3. Cinco grupos excepcionales

| Grupo | Teórico | Físico sintético | Diferencia | Estado |
|---|---:|---:|---:|---|
| CRISTAL LATA 355 ML | -9 | 0 | +9 | `Recontar` |
| PEPSI 3 L | -1 | 0 | +1 | `Recontar` |
| Coca/Inca vidrio 296ml | -1 | 0 | +1 | `Recontar` |
| CARTAVIO BLACK 250ML | -5 | 0 | +5 | `Recontar` |
| CARTAVIO BLACK 500ML | -1 | 0 | +1 | `Recontar` |

No se asignaron motivos ni notas inventados. Ninguno de estos cinco tiene `primer_snapshot_posterior_id` inmediatamente después de la carga: requieren un snapshot posterior antes de ser reconteables.

## 4. Auditoría independiente después del commit

| Control | Antes | Después |
|---|---:|---:|
| Cobertura acreditada | 30 / 493 | **436 / 493** |
| Cobertura normal pendiente | 406 | **0** |
| Reconteos accionables de cobertura | 57 | **57** |
| Reconteos accionables regulares | 15 | **15** |
| Total diferencias pendientes incluyendo 5 nuevas | 72 | **77** |
| Nuevas observaciones `Coincide` | — | **401** |
| Nuevas observaciones `Recontar` | — | **5** |

**Observación importante de concurrencia natural:** después de la carga, a las 17:19:19 se inició una nueva sesión real Full V3 de Cutervo `4c61c1f6-ef26-4ae7-bcdb-9a37ac207810` (vence 18:00). La consulta de 17:19 mostró:
- `inventario.full_cashier_state_v3(...).operational_summary.next_action='review'`.
- Sesión real con 493 filas runtime, 72 acciones `recount`, 57 `review_for_coverage`, 15 `review_regular`, 72 reservas B4 y 0 conteos enviados en ese instante.
- **No se alteró, cerró, canceló ni ejecutó acción sobre esa sesión real**.

El cambio de prioridad del Motor quedó **demostrado** por lectura, pero esto **no sustituye** el smoke humano del frontend ni comprueba reconteos enviados.

## 5. Limpieza futura — no ejecutar automáticamente

La sesión sintética y sus 406 detalles están identificados por `conteo_id='fd6769a9-e62e-466e-912c-460c3b3aee2b'`, pero **borrar solamente esa sesión o sus detalles NO revierte necesariamente** los estados derivados en `inventario.estado_stock_grupo`, las obligaciones/métricas de ronda, las métricas de actividad ni las referencias al último detalle.

No borrar mientras existan dependencias/reconteos/snapshots que pudieran tomar estos detalles como antecedentes. Si se requiere limpiar la simulación en el futuro, realizar **preflight de referencias y reconcilación completa**, con aprobación explícita del usuario, preservando cualquier captura real posterior. Hasta entonces, conservar estos datos y este reporte.

## 6. Fuentes documentales vigentes

- Reglas funcionales de Motor/Cajero: los archivos congelados `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md` y los contratos Full V6/V7 correspondientes **siguen prevaleciendo**.
- Bloque de UX de reconteos pendiente de smoke: `docs/SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_V1.md`.
- **Este documento** solo deja trazabilidad de un cambio sintético específico de datos; no congela decisiones de producto ni cambia contratos.

**Resultado:** carga de 406 aprobada y auditada; Motor ahora prioriza `review_for_coverage`.
