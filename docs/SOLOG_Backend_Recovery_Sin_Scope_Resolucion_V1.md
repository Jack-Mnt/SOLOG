# SOLOG — Backend — Resolución segura de recovery sin scope V1

**Estado:** CONGELADO — política aprobada; pendiente despliegue y validación.
**Fecha:** 2026-10-11
**Nivel:** C
**Rama de frontend:** `admin-work`

## Fuente primaria
Este delta es la autoridad para la recuperación **sin scope local**. Permanecen vigentes `docs/SOLOG_Backend_Contrato_Cajero_V4.md` (V4 restante) y `docs/SOLOG_Logica_Cajero_Autocierre_Recovery_V1.md` (autocierre normal). No sustituye el envío, descarte ni retry con scope.

## Decisión funcional aprobada
Si Supabase muestra una recovery propia y el navegador perdió el scope (y no quedan registros locales para esa sesión), el usuario no debe permanecer bloqueado indefinidamente. El backend verifica autoritativamente la sesión, identidad/dispositivo y operaciones que puedan seguir pendientes. Solo cuando la situación sea segura podrá cerrarla; si no puede garantizarlo, conservará el bloqueo e indicará recuperación administrativa. No inferir `groups_revision` de otra sesión, ni reubicar o borrar drafts.

## Preflight backend 2026-10-11
- La RPC pública actual es `public.rpc_solog_cashier_mutate_v4(p_action,p_payload)`, no RPC separada de finish.
- El registro `inventario.solog_operaciones` conserva `scope, actor_id, operation_id, request_hash, response, created_at, completed_at`. **No almacena `conteo_id` explícito ni payload** para vincular operaciones pendientes con una sesión concreta.
- La RPC V4 usa `inventario.conteos.groups_revision` como revisión autoritativa; `expected_groups_revision` es opcional a nivel SQL, aunque obligatorio en el frontend V4 ordinario.
- `inventario.solog_finish_session_v4` finaliza `activo/recovery` después de normalizar el estado.
- Las mutaciones V4 utilizan bloqueo por sede; la idempotencia se registra por operación.
- Observación actual: 0 registros `response IS NULL` y 3 completos entre operaciones del Cajero V4. **No constituye garantía de futuro**.

## Contrato técnico a resolver antes de desplegar
1. Introducir ruta de resolución **atómica** independiente del finish ordinario, con autenticación de cajero, sede y dispositivo autorizado; identificar sesión propia en recovery, bloquear sede y fila de sesión.
2. No usar la ausencia de `expected_groups_revision` como mecanismo para omitir verificaciones en acciones normales.
3. Sin `conteo_id` persistido en registros de operaciones, para no dar falsos negativos se debe bloquear ante **cualquier operación Cajero V4 del actor sin respuesta**; después de adquirir el bloqueo de sede comprobar visibilidad y reglas de concurrencia. No asumir asociación por hash.
4. La operación de resolución también debe ser idempotente, con `operation_id` estable durante reintentos. Rechazar estados inesperados y responder con resultado claramente tipado (finalizado / bloqueo administrativo).
5. Si el navegador conserva algún registro de esa sesión, aunque no tenga un scope resoluble, no habilitar la ruta sin scope; conservar para resolución manual.
6. Validar permisos, transacciones, concurrencia con save_batch y aislamiento del resto de sesiones. Respetar `recovery_until` y no cerrar sesiones ajenas.
7. Desplegar y verificar backend antes de implementar frontend. Cualquier restricción no verificable se reporta como bloqueo en vez de cerrar a ciegas.

## Fuera de alcance
No cambiar Motor V4, períodos, drafts existentes, historial, estado Inválido, diseño UX ni la política de autocierre con scope.

## Estado actual
Preflight parcial confirmado, **sin despliegue ni validación**; no afirmar que la recuperación sin scope ya funciona.
