# SOLOG — Backend Cajero — Ciclo horario V3 — Plan de migraciones

**Estado:** HISTÓRICO Y ACTUALIZADO CON DESPLIEGUE REAL — backend `required` aplicado; E2E operativo pendiente. No es una segunda fuente funcional congelada.
**Fecha:** 2026-11-11.
**Nivel:** C — contrato SQL, estado de sesiones, idempotencia y concurrencia.
**Fuente primaria funcional, APROBADA Y CONGELADA:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
**Rama de staging:** `admin-work`. `master` no se modifica.
**Proyecto Supabase observado:** `fvtohxvcvsflzmftgfzs` (confirmar destino antes de aplicar).

> **ESTADO VIGENTE 2026-11-11:** migraciones 01/02/02B **aplicadas**; activación 04 **directa `legacy → required` aplicada**; 03 `dual` **omitida y reemplazada**. El contrato backend está desplegado, con pruebas dirigidas de esquema/ventana y RPC negativas aprobadas. No se ha comprobado un inicio exitoso con snapshot fresco ni un E2E de envío. Prevalecen en activación y evidencia [`SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md`](SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md) y [`SOLOG_Backend_Cajero_Reporte_Validacion_Required_V1.md`](SOLOG_Backend_Cajero_Reporte_Validacion_Required_V1.md). El resto de este documento conserva fundamentos de diseño, no instrucciones para activar `dual`.

## 1. Entregables y orden

1. **`SOLOG_Backend_Cajero_Ciclo_Horario_V3_01_Base_Contratos.sql`:** preparación aditiva. Crea configuración privada en modo `legacy` y helpers internos de ventanas, oferta, estado y errores. No cambia V6/V7, JSON Schema ni reglas de reservas en esta etapa.
2. **`SOLOG_Backend_Cajero_Ciclo_Horario_V3_02_Dispatch_V6_V7.sql`:** operación atómica. Cambia conjuntamente el schema de solicitudes `start` y el dispatcher interno; añade objeto `start_offer` a V6, validación de selección V7, persistencia de sesiones V3, clasificación de errores y diagnóstico del ítem conflictivo, y conservación de reservas durante recovery.
3. **`SOLOG_Backend_Cajero_Ciclo_Horario_V3_Validacion_Readonly.sql`:** diagnóstico de solo lectura: ventanas de ejemplo, límites HH:57, V2 intacta, contrato JSON, seguridad, modo y existencia de funciones.
4. **`SOLOG_Backend_Cajero_Ciclo_Horario_V3_03_Activacion_Dual.sql`:** OMITIDA — histórica y reemplazada por decisión expresa; NO aplicar.
5. **`SOLOG_Backend_Cajero_Ciclo_Horario_V3_04_Activacion_Obligatoria.sql`:** APLICADA — corte directo `legacy → required` con aplicación cerrada; exige V3 para nuevos starts Full y conserva replays anteriores.

Los SQL desplegados tienen sus migraciones correspondientes registradas en Supabase; la migración 03 sigue sin aplicarse. No asignar versiones/tiempos de migración manualmente. ChatGPT aplicará cada script mediante `mcp__Supabase__apply_migration` con nombre snake_case y la aprobación correspondiente, para conservar trazabilidad, o se integrará con `supabase migration new` en un entorno CLI verificado. **No aplicar pegando SQL al panel sin decidir antes cómo sincronizar el historial de migraciones.**

Las migraciones `01` y `02` deben tratarse como scripts ejecutados mediante el motor transaccional de migraciones, **sin BEGIN/COMMIT manuales**. La validación read-only sí controla su propia transacción.

## 2. Baseline comprobado

- `inventario.full_settings.policy_version=2` por restricción `full_policy2_no_raw_history`.
- Tabla `full_session_windows` ya contiene columna `policy_version` sin restricción exclusiva V2; conserva `capture_interval_number` en `1|2` y límite `pending_delivery_until=session_expires_at+2h`.
- `inventario.full_cashier_dispatch_v2` tiene `md5(pg_get_functiondef) = f09dd9ad88123b990b5fd4a7110c8c9e` al preparar 02. La migración aborta si cambió su código.
- RPC Full públicas `public.rpc_solog_cashier_bootstrap_v6` y `public.rpc_solog_cashier_mutate_v7` siguen iguales; se modifica su dispatcher interno.
- Tras la fusión, `master` usa Cajero Full V6/V7; el frontend actual todavía prepara `start` antiguo V2. No reabrir antes del frontend V3.
- En lectura de preflight: 16 sesiones Full V2 finalizadas/expiradas, ninguna activa ni en recovery; repetir inmediatamente antes de desplegar.
- El backend usa bloqueo `FOR UPDATE` por sede en Full y Cajero, útil para serializar llegada de snapshot e inicio.

**Preflight requerido el día de ejecución:** comprobar que el destino es correcto, `md5` del dispatcher, migraciones previas, sesiones en curso, reservas y permisos; asegurar copia/plan de reversión antes de tocar producción.

## 3. Contrato previsto de servidor

### 3.1 Modos de activación

| Modo | V6 | `start` legacy Full | `start` Full V3 |
|---|---|---|---|
| `legacy` | `start_offer` inhabilitado; campos Full antiguos intactos | V2 | Rechazado |
| `dual` | Ofrece V3, manteniendo capacidades V2 para clientes antiguos | V2 | V3 |
| `required` | `start_offer` autoritativo también en capacidades | Rechazo controlado, salvo replay confirmado | V3 |

En cualquier modo los replays ya confirmados se resuelven antes de validar restricciones temporales nuevas. La activación requiere que los clientes puedan reconocer el modo/contrato vigente; jamás se fuerza un despliegue frontend contra una oferta todavía no habilitada.

### 3.2 Ventana temporal V3

Se toma reloj servidor `America/Lima`, se bloquea `start` desde HH:57 y se exige margen de 180 s. `capture_end=min(siguiente HH:00, capturado_at+2h, turno_hasta)`. `pending_delivery_until=capture_end+2h`. La fecha y revisión quedan congeladas por sesión y se persisten en `conteos` y `full_session_windows`. La función `full_window_v1` se conserva para V2.

### 3.3 Selección

`start_offer` informa `policy_version=3`, `cycle_started_at`, `status`, `snapshot_id`, `requires_confirmation`, `can_start`, `capture_ends_at` y `block_reason`. El cliente presenta respaldo solo si V6 lo autoriza y después de aceptación explícita del usuario.

El payload nuevo de `start` lleva `expected_snapshot_id`, `expected_cycle_started_at` y `selected_as` además de dispositivo y UUID de operación. Bajo lock por sede V7 revalida el snapshot más reciente confirmado, selección, disponibilidad y tiempo inmediatamente antes de crear la sesión.

### 3.4 Recovery y conflictos

- Conservar reservas de `full_recount_reservations` al pasar Full `activo→recovery`, liberarlas en confirmación del detalle o cierre/expiración definitiva.
- Duplicidad de conteo: la primera confirmación autorizada prevalece. Conservar observación tardía como evidencia local, no aplicarla ni archivarla remotamente de forma silenciosa.
- Un batch rechazado es atómico: no confirmar parcialmente. Los batches anteriores sí conservan receipts.
- Para conflicto conocido por ítem, V7 entrega `errors[0].field_path = p_payload.items[N]` (N base cero). El diagnóstico se conserva dentro de `full_delivery_conflicts.payload._solog_v3_diagnostic` para replay exacto, preservando el fingerprint original y sin cambiar columnas ni insertar datos de prueba.
- Separación y reenvío de observaciones válidas: únicamente luego de un rechazo definitivo probado sin efectos. Resultado incierto obliga a repetir mismo UUID. `finish` no se permite con cola sin resolver.
- Se distinguirán `NORMAL_COUNT_ALREADY_IN_SHIFT` y `NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT` sin cambiar validaciones del Motor.

## 4. Seguridad y superficie afectada

- La nueva tabla vive en esquema privado `inventario`, con RLS habilitado y accesos directos de `PUBLIC`, `anon` y `authenticated` revocados.
- Los helpers internos no conceden ejecución a `anon` ni `authenticated`; siguen ejecutándose bajo las RPC públicas existentes con control de usuario, sede y dispositivo.
- No se crean nuevas RPC públicas, Edge Functions, cron ni tablas públicas.
- `full_contracts` se amplía sin reemplazar su `ref` raíz para `cashier_bootstrap` ni `cashier_mutate`; admite formatos de inicio antiguo y nuevo, y errores nuevos.
- No se modifica `full_settings.policy_version`.
- El punto de extensión es `inventario.full_cashier_dispatch_v2`; no modifica `full_cashier_dispatch_v1` ni contratos de las RPC legacy V3.

## 5. Validación obligatoria antes de congelar contrato desplegado

**Etapa A — Solo lectura:** ejecutada tras aplicar 01/02/02B, con modo `legacy`; repetida de forma dirigida tras `required`, confirmando ventanas, contratos y respuesta RPC.

**Etapa B — Prueba controlada y progresiva en `required`:** las validaciones SQL/negativas en transacciones reversibles pasaron; aún deben probarse E2E con snapshot nuevo y credenciales/dispositivo autorizados:
- Oferta `new` / `fallback` / `unavailable`, reloj Lima, límites HH:57 y TTL 180 s.
- Snapshot nuevo entre V6 y V7, carrera con ConeXion, concurrencia por sede.
- Replay exitoso de V2 y V3, antiguo `start` sin aplicar, reintento incierto, fingerprint cambiado.
- Persistencia de ventana V3 con columnas e invariantes, sin alterar ventanas V2.
- Batch con duplicado en ítem posterior y respuesta con `field_path`, rollback íntegro y replay del mismo rechazo.
- Reservas de reconteo conservadas al pasar a recovery y liberadas en confirmación/fin/expiración.
- Verificar Full V6/V7 del `master` fusionado y frontend actualizado V3, sin regresar a rutas legacy históricas.
- Auditar `get_advisors` (seguridad/rendimiento), RLS, grants y logs de errores.

**Etapa C — Integración frontend:** una vez desplegado y congelado el contrato real, Codex establecerá baseline en `admin-work` y presentará plan. Prohibido implementar frontend contra campos o políticas no desplegadas.

**Etapa D — Publicación/reapertura:** `required` backend ya está activo. Implementar frontend compatible, desplegar Preview, smoke con snapshot válido y solo después reabrir el sistema.

La validación de lectura **no demuestra** éxito de escritura, idempotencia real ni ausencia de carreras. Nada se declara validado sin pruebas efectivamente ejecutadas.

## 6. Reversión y límites — estado actual

1. La activación directa a `required` está aplicada en Supabase; `dual` no se utilizó ni se debe activar en esta ejecución.
2. En caso de defecto crítico previo a reapertura, mantener el sistema cerrado y preparar un delta correctivo; no declarar validado un E2E que no se ha realizado.
3. La reversión de emergencia de `required` a `legacy` requiere autorización y comprobación de sesiones/replays, especialmente una vez existan sesiones V3. No sustituir ni borrar las fechas persistidas de sesiones anteriores.
4. No hacer `DROP` ni convertir ventanas V3 a V2. Las migraciones ya registradas son inmutables: toda modificación futura mediante delta nuevo.
5. El próximo trabajo corresponde al frontend en `admin-work`; Codex no cambia backend.

**Estado vigente:** backend requerido desplegado y validado a nivel contractual/errores; E2E positivo y smoke humano siguen pendientes para reapertura.
