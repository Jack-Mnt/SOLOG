# SOLOG — Backend Cajero — Delta de activación directa Required V1

**Estado:** DECISIÓN APROBADA Y EJECUTADA — 2026-11-11.
**Clasificación:** Nivel C, delta acotado a despliegue/compatibilidad.
**Fuente funcional primaria vigente:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
**Precedencia:** este delta sustituye **solo** el recorrido de activación `legacy → dual → required` por `legacy → required`. Conserva todas las demás decisiones funcionales, contratos, restricciones de Motor y recuperación del documento primario.

## Decisión posterior a la congelación

El responsable del proyecto confirma que la aplicación operativa está cerrada hasta finalizar las modificaciones, verificarlas y volver a publicar. Por tanto:
- Se **omite** la migración `03_Activacion_Dual.sql` y no se utiliza el modo `dual`.
- Se pasa **directamente** de `legacy` a `required` mediante `04_Activacion_Obligatoria.sql`, reescrita antes de aplicarse para permitir y verificar el corte directo.
- Las nuevas sesiones Full exigen payload de selección V3; las operaciones V2 ya confirmadas conservan su replay idempotente.
- Las sesiones V2 históricas preservan sus ventanas, reglas de entrega y referencias.
- `inventario.full_settings.policy_version=2` permanece independiente; no se modifica ConeXion ni el Motor.
- La aplicación que todavía envía `start` V2 **no debe reabrirse** antes de desplegar frontend Full V3 y comprobar su smoke test.
- No se realizan pruebas destructivas ni conteos ficticios persistentes sobre producción.

## Despliegue SQL confirmado

- Proyecto Supabase: `fvtohxvcvsflzmftgfzs`.
- Migraciones previas presentes: `solog_cashier_hourly_v3_base_helpers`, `solog_cashier_hourly_v3_dispatch_and_contract`, `solog_cashier_hourly_v3_error_precedence_fix`.
- Migración de activación aplicada: **`solog_cashier_hourly_v3_direct_required`**.
- Modo autoritativo comprobado inmediatamente después: **`required`**.
- No hubo sesiones Full activas/recovery ni reservas al activar; se utilizó advisory lock transaccional exclusivo compartido con el dispatcher para evitar carreras durante la transición.
- Script histórico de activación `03`: **reemplazado/no aplicar**; no forma parte del camino aprobado.

## Validaciones y límites

Verificado mediante SQL en Supabase:
- JSON Schema estricto acepta `start` V2 y V3 y rechaza V3 parcial o campos no previstos.
- `full_window_v3`: nuevo ciclo, respaldo, HH:57 y duración de 180 s.
- Oferta V3 en modo `required`: `new`, `fallback`, error por horario, TTL mínimo y estructura incompatible.
- RPC V6/V7 con contexto autenticado y token de dispositivo de prueba dentro de transacción revertida: V6 `CASHIER_STATE`, inicio V2 `START_POLICY_UPGRADE_REQUIRED`, inicio V3 con stock vencido `STOCK_EXPIRED`.
- Rollback confirmado: ningún dispositivo temporal persistido; 0 sesiones V3, 0 reservas y 0 conflictos.
- Todas las sedes tienen snapshots antiguos vencidos: **no se probó un `start` V3 exitoso con stock actualizado**.

Pendiente para apertura: frontend con el nuevo contrato, pruebas de inicio V3 con snapshot real nuevo, entrega/recount/finish/replay, carreras y smoke humano. No afirmar que el Motor está validado integralmente por las pruebas dirigidas de lectura y rechazo.

**Regla operativa:** primero preparar y probar frontend en `admin-work`; luego publicar y verificar. No abrir acceso a Cajero hasta superar verificaciones y disponer de snapshot compatible vigente. Si se encuentra incompatibilidad backend, resolver con ChatGPT y delta aprobado, no permitir que Codex altere Supabase.

**Referencia de evidencia complementaria:** `docs/SOLOG_Backend_Cajero_Reporte_Validacion_Required_V1.md`.
