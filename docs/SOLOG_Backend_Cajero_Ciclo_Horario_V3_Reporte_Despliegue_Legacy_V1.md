# SOLOG — Backend Cajero — Ciclo horario V3 — Reporte de despliegue en modo legacy V1

**Estado:** MIGRACIONES 01, 02 y delta 02B APLICADAS, validación SQL dirigida de solo lectura SUPERADA; **integración funcional y concurrencia NO VALIDADAS**. Modo `legacy`; política Full V3 no activada.
**Fecha:** 2026-11-11.
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`.
**Fuente funcional única:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md` (APROBADA Y CONGELADA).
**Rama de documentación:** `admin-work`. `master` no se modificó.

## 1. Migraciones registradas en Supabase

| Versión registrada | Nombre | SQL de procedencia |
|---|---|---|
| `20261111133001` | `solog_cashier_hourly_v3_base_helpers` | `SOLOG_Backend_Cajero_Ciclo_Horario_V3_01_Base_Contratos.sql` |
| `20261111133035` | `solog_cashier_hourly_v3_dispatch_and_contract` | `SOLOG_Backend_Cajero_Ciclo_Horario_V3_02_Dispatch_V6_V7.sql` |
| `20261111133406` | `solog_cashier_hourly_v3_error_precedence_fix` | `SOLOG_Backend_Cajero_Ciclo_Horario_V3_02B_Prioridad_Errores.sql` |

No se aplicaron `03_Activacion_Dual.sql` ni `04_Activacion_Obligatoria.sql`. Los scripts aplicados no deben modificarse retroactivamente; nuevas correcciones requieren una migración delta.

## 2. Alcance desplegado

- Configuración privada `inventario.full_cashier_hourly_config_v3`, inicializada en `mode='legacy'`.
- Helpers `full_window_v3`, `full_cashier_start_offer_v3`, `full_cashier_state_v3`, `full_cashier_error_v3`.
- Extensión aditiva del contrato JSON `inventario.full_contracts` para el payload V3 de `start`, el objeto V6 `start_offer` y códigos de error.
- Evolución de `inventario.full_cashier_dispatch_v2` para compatibilidad V2/V3, selección de snapshot, reloj autoritativo, persistencia de ventanas V3, prioridad de errores y diagnóstico de conflictos por índice de item.
- Ajuste del trigger `solog_cleanup_session_runtime_groups`: reservas Full se mantienen en recovery; liberación solo al finalizar o expirar.
- Delta 02B corrige el orden de error: si una oferta está indisponible, responde su causa efectiva (p. ej. HH:57) antes de clasificar erróneamente la selección como obsoleta.

**No se modificaron:** `inventario.full_settings.policy_version=2`, RPC públicas V6/V7, código frontend, scheduler de ConeXion, cron o sesiones históricas.

## 3. Verificación efectiva

- Se ejecutó sin excepciones `SOLOG_Backend_Cajero_Ciclo_Horario_V3_Validacion_Readonly.sql` luego de migración 02 y nuevamente luego del delta 02B.
- Ventana nueva: snapshot 11:59:30, inicio 12:00:00 Lima -> captura hasta 13:00, entrega hasta 15:00.
- Respaldo: snapshot 10:59:30, inicio 12:30 -> captura hasta 12:59:30.
- Borde HH:56:59.999: permitido si hay >=180 s; HH:57:00: inicio V3 denegado.
- Stock con <180 s disponibles: denegado; corte de turno 16:00: respetado.
- Se verificó compatibilidad JSON Schema: `start` V2 y V3 aceptados; V3 incompleto rechazado.
- Se verificó `full_cashier_error_v3`: `START_WINDOW_CLOSED` indica `wait`, cambio de snapshot indica `reconcile`, conflicto de batch puede incluir `p_payload.items[3]`.
- En postflight: `mode='legacy'`, `full_settings.policy_version=2`, 0 sesiones V3, 0 sesiones Full activas/recovery.
- Los helpers internos permanecen sin privilegio directo `EXECUTE` para `anon` y `authenticated`; RPC públicas V6/V7 siguen accesibles a `authenticated` y no a `anon`.
- RLS habilitado en tabla de configuración privada, sin políticas ni grants al cliente; aviso de linter `rls_enabled_no_policy` esperado para tabla exclusivamente interna.
- Supabase registró las tres migraciones indicadas en tabla de historial.

## 4. Hallazgo de compatibilidad con master (no modificado)

En el código de `master`, `src/features/solog/cajero/cajero.v3.api.ts` solicita `rpc_solog_cashier_bootstrap_v3` y `rpc_solog_cashier_mutate_v3`. **Estas RPC V3 no aparecieron en `pg_proc` del proyecto Supabase inspeccionado.** Las disponibles son bootstrap V4/V5/V6 y mutate V4/V5/V6/V7.

Esta discrepancia es **anterior a las migraciones Full V3 de este bloque**: los scripts 01/02/02B no eliminan ni alteran dichas funciones legacy. La existencia de una incompatibilidad entre la rama `master` y el backend observado no demuestra por sí sola cuál es la versión desplegada en Cloudflare ni una falla real en producción; exige inspeccionar su despliegue y contrato efectivo antes de activar `dual` o promover el frontend.

**Bloqueo:** no declarar compatibilidad legacy `master` validada. No reintroducir RPC V3 sin análisis de seguridad/contrato y decisión aprobada, porque excede el alcance de este despliegue.

## 5. Pruebas pendientes y decisión de paso

**Pendientes** (NO ejecutadas): tests end-to-end RPC con usuario/dispositivo autorizado; validación de V6/V7 en modo dual; `start` real V3 y replays V2/V3; carrera de snapshot vs inicio; atomicidad de batch y persistencia real de rechazo/índice; reservas de reconteo en recovery con concurrencia; pruebas de producción/Preview y smoke humano; comparación de despliegue `master` Cloudflare.

Para avanzar:
1. Investigar la discrepancia legacy para confirmar el cliente actualmente desplegado y sus RPC realmente usadas.
2. Verificar la funcionalidad con entorno aislado o ventana controlada, sin insertar conteos ficticios sobre datos de producción.
3. Solo con esa evidencia y aprobación, considerar activación `dual` (migración 03). **No activar `required` hasta frontend Full nuevo publicado y validado**.

**Dictamen:** despliegue de preparación en modo legacy completado y validado a nivel de esquema/cálculo/seguridad; integración operativa y compatibilidad de producción pendientes. No cerrar el bloque.
