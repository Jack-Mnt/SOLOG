# SOLOG — Backend Cajero — E2E transaccional reversible Cutervo V1

**Estado:** APROBADO para las rutas ejercitadas. Sin cierre operativo O1; smoke humano pendiente.
**Fecha de ejecución:** 2026-11-19, aproximadamente 14:05–14:10 (America/Lima).
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`.
**Rama de referencia:** `admin-work`. No se modificó el frontend ni Supabase de forma persistente.
**Clasificación:** verificación backend Nivel C, con alcance limitado y sin despliegue.
**Fuente funcional primaria:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`.
**Contrato backend:** `docs/SOLOG_Backend_Cajero_Contrato_Consumo_Horario_V1.md`.

## 1. Estado previo y alcance autorizado

El usuario aprobó ejecutar un ensayo transaccional reversible para Cutervo: inicio V3, registro y finalización, sin conservar conteos, sesiones o configuraciones.

El snapshot real más reciente de Cutervo era `a958188f-2c7c-4311-b9ab-ffa645c5db25`, capturado el **2026-11-17 23:10:31 UTC**, confirmado el **2026-11-17 23:10:57 UTC**, versión de catálogo 9 y 493 filas de historial de grupos. Al ejecutarse la prueba (2026-11-19), estaba vencido (más de 43 horas); no existía snapshot fresco.

Configuración: `inventario.full_cashier_hourly_config_v3.mode='required'`. Cutervo tenía un cajero activo, un dispositivo autorizado y ninguna sesión activa/en recuperación.

Se conservó la identidad real del usuario y la sede, pero se simuló **solo dentro de una subtransacción revertida** la autenticación JWT y una credencial temporal de prueba. Se ajustó temporalmente la fecha de captura del snapshot existente para permitir la ruta positiva. Estos ajustes no se publicaron ni sobrevivieron al ensayo. **No representa un inicio operativo con un snapshot real vigente sin modificación**.

## 2. Controles previos

- Se inspeccionaron funciones RPC reales: `public.rpc_solog_cashier_bootstrap_v6`, `public.rpc_solog_cashier_mutate_v7`, el dispatcher y las funciones V3.
- Se revisaron triggers de tablas de snapshots, dispositivos, conteos, grupos, observaciones y métricas; no se detectaron funciones HTTP/pg_net, dblink o pg_notify en el conjunto analizado.
- Se probó que el bloque `BEGIN … EXCEPTION` de PL/pgSQL revierte la subtransacción y permite devolver evidencia.
- El primer intento de preparar un **segundo dispositivo autorizado** fue rechazado por `dispositivos_solog_un_autorizado_por_sede`, como corresponde a la restricción de exclusividad. La subtransacción se revirtió y no dejó cambios.
- Se adaptó el fixture para reutilizar temporalmente el registro del dispositivo ya autorizado, cambiando solo su hash dentro de la subtransacción; el hash original quedó restaurado por rollback.

## 3. Escenario ejecutado y resultados

Se llamó a las RPC reales bajo el UID del cajero activo, con token de prueba efímero y el snapshot base temporalmente actualizado. Se comprobó cada respuesta dentro de la subtransacción:

| Paso | Evidencia | Resultado |
|---|---|---|
| Bootstrap V6 | `CASHIER_STATE`; oferta `new`; `can_start=true` | **PASS** |
| Inicio V7 | `SESSION_STARTED`, referencia al snapshot correcto | **PASS** |
| Ventana persistida | `full_session_windows.policy_version=3` | **PASS** |
| Envío `save_batch` | `OBSERVATIONS_CONFIRMED`; una observación; diferencia 0 | **PASS** |
| Replay idéntico `save_batch` | `data.replay=true`; un único detalle físico | **PASS** |
| Finalización V7 | `SESSION_FINISHED`; sesión `finished` | **PASS** |

La función del ensayo forzó `SOLOG_E2E_FORCE_ROLLBACK` al final, capturó esa excepción y volvió a leer las tablas fuera de la subtransacción:

| Comprobación tras rollback | Resultado |
|---|---|
| Filas de la sesión creada | **0** |
| Dispositivo con hash temporal | **0** |
| Hash del dispositivo real restaurado | **Sí** |
| Fecha original del snapshot restaurada | **Sí** |
| `no_persistent_test_writes` | **true** |

Lectura independiente posterior (2026-11-19 19:10:39 UTC):
- Cutervo `activo/recovery`: **0**.
- Ventanas de Cutervo con `policy_version=3`: **0**.
- Operaciones confirmadas en `full_cashier_operations` para Cutervo: **0**.
- Dispositivos autorizados: **1** (igual que antes).
- Última captura real restaurada: **2026-11-17 23:10:31 UTC**; última confirmación real: **2026-11-17 23:10:57 UTC**.
- Snapshots frescos de Cutervo: **0**.
- Política sigue en `required`.

## 4. Límites de esta evidencia

El E2E comprueba integridad del backend y del contrato de las RPC bajo una **transacción temporal con rollback**, no un despliegue ni una sesión operativa persistente. No se ha probado todavía:
- Inicio de sesión real desde Cloudflare Preview con JWT y token reales de un dispositivo físico.
- Nuevo snapshot vigente enviado por ConeXion en el mismo ciclo y utilizado sin ajustes de fecha.
- Respaldo `fallback` con consentimiento humano y espera real.
- Flujo real de B5, prioridad, reconteo, vencimiento y recuperación bajo condiciones operativas y concurrencia.
- Validación humana del frontend con estado real del servidor.

El snapshot de Cutervo vence dos horas después de `capturado_at`, por lo que el del 17 de noviembre ya no puede utilizarse para el smoke actual. **No se recomienda alterar los límites de vigencia ni reabrir SOLOG para facilitar el ensayo.**

## 5. Dictamen y siguiente paso

**PASS:** prueba transaccional reversible de `bootstrap → start V3 → save_batch → replay → finish`, sin efectos permanentes, verificada por consultas posteriores independientes.

**NO-GO operativo:** O1 permanece abierto y SOLOG no debe reabrirse aún. El siguiente paso requiere que ConeXion emita otro snapshot real reciente en la ventana de smoke y que se pruebe con el Cajero real en Preview, con supervisión de observaciones persistentes autorizadas y validación del usuario.
