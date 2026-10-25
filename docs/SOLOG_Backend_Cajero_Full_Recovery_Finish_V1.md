# SOLOG — Backend Cajero Full — Recovery y cierre seguro V1

**Estado:** DESPLEGADO (2026-10-25); **smoke funcional humano V6/V7 validado (8/8)**; pruebas de replay y recovery autenticadas pendientes.
**Nivel:** C — backend / consistencia operativa.
**Rama documental:** `admin-work`. **Proyecto Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`).
**Migración aplicada:** `20261025201355_solog_cajero_full_recovery_finish_v1`.
**Fuente primaria backend de este alcance:** este documento.
**Fuente primaria funcional (prevalece en reglas de usuario):** `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`.
**Interfaces frontend conservadas:** `public.rpc_solog_cashier_bootstrap_v6(p_payload)` y `public.rpc_solog_cashier_mutate_v7(p_action,p_payload)`.

## 1. Límite del cambio

Se mantienen el Motor, reglas de prioridad V4 utilizadas por Full, snapshots, sesiones congeladas, observaciones, contratos de escritura, manifest completo, autorizaciones y locks. La modificación comprende exclusivamente las funciones privadas:
- `inventario.full_cashier_state_v2`: extensión de lectura para sesiones propias en recovery;
- `inventario.full_cashier_dispatch_v2`: validación estricta del cierre.

No se alteraron entradas RPC públicas, nombres de acciones ni forma de envío de `items`.

## 2. Lectura V6: `recovery_delivery_states`

Campo **aditivo** en `data` del `CASHIER_STATE`, de tipo array; `[]` sin recovery vigente. Se conservan `session`, `groups`, `recovery_sessions`, `recovery_manifests` y demás campos preexistentes.

Por cada recovery perteneciente **al usuario autenticado y su sede autorizada**, con `estado='recovery'` y `server_now < pending_delivery_until`, existe:

```ts
type RecoveryDeliveryState = {
  session_id: string;                   // uuid de sesión
  groups_revision: number;              // revisión congelada de sesión
  current_priority_class:
    | 'round_coverage'
    | 'review_for_coverage'
    | 'review_regular'
    | 'shift_coverage'
    | 'none';
  eligible_groups: Array<{
    group_id: string;                   // uuid
    action: 'coverage' | 'daily' | 'recount';
    priority_class: string;             // misma clasificación del Motor
    recount_detail_id: string | null;   // uuid o null
    reference_snapshot_id: string;      // uuid de referencia congelada
  }>;
};
```

El listado `eligible_groups` incluye grupos con `accion <> 'none'` y `priority_class <> 'none'` del runtime congelado de esa sesión; **no significa que todos puedan enviarse simultáneamente**. Solo la clase igual a `current_priority_class` puede pasar la restricción de prioridad de V7 en ese estado. Una mutación confirmada puede cambiar esa clase: antes de preparar otro lote, refrescar V6 y reconciliar su fuente autoritativa.

Las sesiones `expired` o `finished` no aparecen. El listado **no** habilita captura: `contado_at` debe haberse originado durante la ventana congelada. `recovery_manifests` continúa aportando identificadores de observaciones previamente confirmadas. Ni frontend ni red deben inventar un nuevo `session_id`, revisión, grupo o timestamp.

Seguridad: la lectura sigue pasando por el dispatcher V6, que verifica usuario activo Cajero, sede activa y `device_token` autorizado, antes de retornar estado.

## 3. Escritura V7: semántica segura de `finish`

La consulta del dispatcher comprueba primero el replay persistido de `operation_id`. Si coincide su fingerprint con el payload inmutable, devuelve el resultado originalmente confirmado; un cierre previo correctamente aplicado puede reconsultarse después de su ventana.

Para un `finish` **nuevo**:
1. Verificar sesión propia de la sede y `expected_groups_revision`.
2. Exigir `full_session_json_v1(session_id,server_now).pending_delivery_allowed = true`, que a su vez requiere estado `activo` o `recovery`, tiempo dentro de la sesión y `server_now < pending_delivery_until`.
3. Conservar validación estricta del `delivery_manifest.observation_ids`: IDs únicos, sin faltantes ni sobrantes respecto a las observaciones confirmadas en backend.
4. Ejecutar `UPDATE inventario.conteos ... estado='finalizado'` solo desde `activo/recovery` y verificar **que afectó una fila** antes de generar `SESSION_FINISHED`.
5. Ante ausencia de autorización temporal/estado, devolver `SESSION_DELIVERY_CLOSED` (resultado de error, `ok=false`, `retryable=false`) y **no** grabar un cierre exitoso ficticio.

`client_queue_empty=true` continúa siendo declaración contractual del cliente validada por JSON Schema; backend no puede conocer borradores locales no enviados, por lo que el frontend debe bloquear el cierre si hay drafts, operaciones inciertas, rechazadas o receipts sin reconciliar. V7 conserva la idempotencia por `operation_id`, manifest y fingerprint existentes.

## 4. Preflight y verificación ejecutada

- Comprobada presencia y firma de RPC V6/V7, permisos `authenticated` en las entradas públicas y aislamiento de funciones privadas `inventario.*`.
- Revisado el código desplegado: ruta de escritura, fingerprint, replay, verificaciones de observación, prioridad y fin de sesión.
- Aplicada la migración `20261025201355` exitosamente.
- Inspeccionadas ambas definiciones desplegadas después de migrar: extensión recovery y doble guardia de `finish` presentes.
- Lectura directa de `full_cashier_state_v2` para **2 usuarios Cajero**: el campo nuevo es un array vacío y conserva `recovery_manifests`, `groups` y `capabilities`.
- Prueba **sintética y transaccional con rollback**: sesión histórica expirada, retorno temporal a `recovery` y un grupo runtime de cobertura asociado a su snapshot y revisión originales. Se verificó `session_id`, `groups_revision`, clase `round_coverage`, un grupo elegible y predicado de entrega falso pasado `pending_delivery_until`. Primer intento rechazado por la constraint de `finalizado_at`; ajustada la simulación a `finalizado_at=NULL`, segunda prueba correcta. El bloque de excepción revirtió todos los cambios.
- Comprobación posterior de residuos: 0 sesiones `recovery`, 1 `expirado`, 2 `finalizado`, 0 filas en `solog_session_runtime_groups`.
- Al probar, había 3 sesiones Full históricas (1 expirada, 2 finalizadas), **0 activas y 0 en recovery**, sin runtime groups actualmente conservados. Por tanto, la lectura de recovery poblada y el flujo V7 de cierre **todavía no se han validado extremo a extremo**.
- Consultados Advisors de seguridad y rendimiento tras la migración; contienen advertencias generales del proyecto que **no se atribuyen** a esta migración sin comparación previa. No se cambiaron permisos ni tablas.
- **Smoke humano reportado por el usuario (8/8)**: snapshot vigente; inicio autorizado; sesión y grupos/stock correctos; observación confirmada; recarga sin pérdida ni duplicación visible; finalización; Historial; sin errores ni pendientes. Este resultado acredita el flujo básico, no el replay/recovery extremo a extremo.
- **Revisión remota de integridad posterior al smoke, solo lectura**: 5 sesiones Full (4 finalizadas, 0 activas, 0 recovery, 1 histórica expirada); 18 registros en `full_cashier_operations` (5 `start`, 9 `save_batch`, 4 `finish`); 9 observaciones confirmadas; 0 conflictos. Validaciones dirigidas: 0 observaciones sin receipt persistido, 0 operaciones `SESSION_FINISHED` cuya sesión no estuviera finalizada, 0 UUID duplicados en operaciones, 0 UUID duplicados en observaciones. Los agregados abarcan toda la base, **no constituyen trazabilidad individual del smoke**.
- Revisado el handler de excepciones desplegado: el nuevo `SESSION_DELIVERY_CLOSED` está incluido en el mapeo a error estructurado V7; no es una excepción SQL sin gestionar.

## 5. Validaciones técnicas que siguen pendientes antes de autorizar implementación frontend

1. Validar V6 mediante la entrada pública con usuario/dispositivo autorizados y sesión Full real en `recovery`; la prueba sintética de lectura ya pasó, pero no acredita autenticación de extremo a extremo.
2. Enviar batches de normales/reconteos con prioridad cambiante; comprobar refresh V6 y replay exacto, recepción única y no duplicación.
3. Probar `finish` en sesión activa, en recovery, fuera de ventana, con manifest incorrecto y como replay de cierre previamente confirmado, incluyendo resultado ambiguo por red.
4. Evaluar cancelaciones, errores definitivos, clientes concurrentes y la retención de runtime groups hasta la ventana límite.
5. Sólo después declarar contrato validado para la integración completa, actualizar tipos/tests frontend y preparar baseline/plan de Codex. **Codex no debe tocar backend**.

## 6. Fuentes y precedencia

1. Reglas funcionales de `SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md`.
2. Contratos remotos efectivamente desplegados descritos aquí, para la interfaz backend de recovery y cierre.
3. `SOLOG_Correccion_Cajero_Restauracion_Interfaz_Full_Parcial_V1.md` para UI previa.
4. Documentación V4/V5 solo como referencia histórica no ejecutable.

Este documento **no declara cerrada** la recuperación de Cajero: KPI, cobertura, contexto original de reconteos, drafts, registro agrupado y autocierre en frontend siguen pendientes.
