# SOLOG — Backend Cajero — Reporte de validación Required V1

**Estado:** REQUIRED DESPLEGADO, pruebas contractuales y negativas APROBADAS; E2E con captura real NO VALIDADO.
**Fecha:** 2026-11-11. **Supabase:** `fvtohxvcvsflzmftgfzs`.
**Fuente funcional:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
**Delta de activación aprobado:** `docs/SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md`.

## A. Estado real y migraciones

- `inventario.full_cashier_hourly_config_v3.mode = 'required'`; `full_settings.policy_version = 2`.
- Migración aplicada: `solog_cashier_hourly_v3_direct_required`, después de `01`, `02` y `02B` ya registradas.
- Migración `03` dual: no aplicada; ruta reemplazada por decisión explícita.
- 0 sesiones con `full_session_windows.policy_version=3`, 0 sesiones Full activas/recovery, 0 reservas, 0 conflictos tras validación. Las sesiones históricas V2 no se alteraron.
- RPC públicas existentes V6/V7; no se crearon otras RPC.

## B. Evidencias ejecutadas

| Prueba | Resultado |
|---|---|
| Contrato JSON `start` V2/V3 y rechazo de payload incompleto/desconocido | PASS |
| Ventanas: snapshot nuevo, respaldo y caducidad stock | PASS |
| Inicio HH:56:59.999 y bloqueo HH:57:00 | PASS |
| Tiempo mínimo 180 s y excepción estructural | PASS |
| Oferta `new` / `fallback` bajo modo `required` con fixtures en SQL | PASS |
| RPC real V6 con usuario y dispositivo autorizados en transacción reversible | `CASHIER_STATE` |
| RPC V7 `start` antiguo bajo `required` | `START_POLICY_UPGRADE_REQUIRED` |
| RPC V7 `start` V3 con el stock real vencido | `STOCK_EXPIRED` |
| Verificación tras `ROLLBACK`: dispositivo original restaurado, 0 sesiones/reservas | PASS |
| Compatibilidad de acceso a helpers privados y RPC autenticadas | PASS en preflight previo |
| Publicación de frontend compatible con `start_offer` y payload V3 | PENDIENTE |
| `start` V3 satisfactorio con snapshot nuevo; save/recount/finish/replay | PENDIENTE |
| Carrera ConeXion snapshot vs V7 y reservas con sesiones recovery | PENDIENTE |
| Smoke humano y reapertura del sistema | PENDIENTE |

## C. Preparación de ensayos

Las comprobaciones del RPC con autenticación se realizaron dentro de una transacción SQL con `ROLLBACK`, sustituyendo temporalmente el hash de un dispositivo autorizado y restaurándolo al revertir. No se comunicó el token real de ningún dispositivo. La primera aproximación (insertar segundo dispositivo) fue rechazada por unicidad autorizada por sede; la segunda, realizada sin acceso SQL al esquema privado desde `authenticated`, fue rechazada por permisos. No persistieron cambios en esos ensayos. La tercera comprobó la RPC y el rollback.

**Límite de prueba:** las últimas capturas confirmadas disponibles tienen más de dos horas de antigüedad; no se dispone todavía de stock fresco para completar una sesión real. No se insertan ni modifican snapshots ficticios para fingir éxito del Motor.

## C.1. Auditoría de seguridad y límites

El Supabase Security Advisor confirma el aviso informativo `rls_enabled_no_policy` para la tabla privada `inventario.full_cashier_hourly_config_v3`; no se le concedió acceso directo a `anon` ni a `authenticated`. Se verificó que los helpers Full V3 no son ejecutables directamente por esos roles y que las RPC públicas Full están restringidas a los roles previstos.

El advisor también informa **dos hallazgos de tipo `security_definer_view`** en `public.catalogo_productos_publico` y `public.oferta_detalle_publico`, además de otros avisos globales de Supabase. Son superficies externas al cambio horario de Cajero y **no se modificaron**. Deben revisarse en un bloque de seguridad específico si está previsto reabrir esas funcionalidades; no atribuirlos a la migración V3 ni declarar que toda la auditoría del proyecto quedó sin errores.

Fuente de remediación: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

## D. Go/no-go

- **Backend listo como contrato de integración:** V6/V7 exponen y exigen V3; pruebas de shape, cálculo y rechazo realizadas.
- **NO-GO para abrir acceso:** frontend sigue preparando `start` V2, el stock real está vencido y faltan las pruebas E2E de inicio exitoso, entrega/recount/finish y recuperación.
- **Siguiente:** congelar interfaz de consumo V6/V7 desplegada; pedir a Codex baseline y plan frontend en `admin-work`; implementación solo después de aprobar plan y sin cambios backend por Codex. Después validar con snapshot fresco y smoke humano.
