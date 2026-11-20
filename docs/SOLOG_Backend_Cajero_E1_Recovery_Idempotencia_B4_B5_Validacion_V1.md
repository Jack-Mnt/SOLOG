# SOLOG — Backend Cajero — E1: Validación de Recovery, idempotencia, B4 y B5 V1

**Estado:** E1, verificaciones SQL dirigidas **APROBADAS**. **E1 integrado/operativo NO CERRADO**, por pruebas de red, carreras y error V7 extremo a extremo pendientes.
**Fecha:** 2026-11-20 (America/Lima), aproximadamente 06:23–06:35.
**Nivel:** C — validación de integridad y consistencia del backend, sin implementación ni migraciones.
**Repositorio:** `Jack-Mnt/SOLOG`; baseline `master = admin-work = 5d10b19963183de6670a6c2c53ac14ece14192ad` antes de este reporte.
**Supabase:** `fvtohxvcvsflzmftgfzs` (PuertoRicoOnline).
**Alcance aprobado:** E1 del preflight de casos límite.

## 1. Fuentes y precedencia

- **Primaria funcional congelada:** `docs/SOLOG_Logica_Cajero_Ciclo_Horario_V1.md`, en especial §§ 4, 7 y 9.
- **Funcional complementaria vigente:** `docs/SOLOG_Logica_Cajero_Registro_Cierre_Automatico_Full_V1.md` (drafts, journal, batch, recuperación y finalización).
- **Contrato de consumo desplegado:** `docs/SOLOG_Backend_Cajero_Contrato_Consumo_Horario_V1.md`.
- **Delta de activación:** `docs/SOLOG_Backend_Cajero_Activacion_Directa_Required_V1.md` (modo `required`).
- **Backend Recovery/finish:** `docs/SOLOG_Backend_Cajero_Full_Recovery_Finish_V1.md`.
- **Pruebas previas:** `docs/SOLOG_Backend_Cajero_E2E_Transaccional_Cutervo_V1.md` y `docs/SOLOG_UI_Cajero_Conflictos_B5_Fase4_Validacion_V1.md`.

Este reporte **no modifica ni reinterpreta** los contratos congelados. No sustituye las fuentes anteriores.

## 2. Precondiciones y límites de seguridad

- Verificados en vivo: política horaria `required`; **0 sesiones activas/recovery**; **0 reservas B4** y **0 conflictos persistidos** al iniciar; tres sesiones V3 reales finalizadas.
- Proyectos conectados a Supabase: `PuertoRicoOnline` y `ControlA-PR`; **ningún proyecto aislado de pruebas identificado**.
- Se ejecutaron reconstrucciones read-only de operaciones reales y dos ensayos sintéticos en PostgreSQL con bloques de excepción que fuerzan **rollback** antes de devolver el resultado.
- **No se ejecutaron** pruebas con corte real de red, dos conexiones concurrentes sobre los mismos datos ni un intento V7 externo con credenciales de dispositivo de producción.
- Los ensayos sintéticos utilizaron una sesión temporal revertida y metadatos/grupos existentes, pero no sobrescribieron detalles de conteo operativos confirmados. B5 afectó transitoriamente estados derivados de dos grupos, restaurados en el rollback comprobado; no es equivalente a un entorno totalmente aislado.
- Ningún cambio en frontend, Motor, políticas, schemas, tablas, RPC, RLS o configuración permanente.

## 3. E1.1 — Reconstrucción de idempotencia con operaciones reales (PASS)

Se reconstruyeron los payloads a partir de la evidencia autoritativa de las tres sesiones V3 de Cutervo del 20/11 y se calcularon las huellas con la misma normalización y algoritmo SHA-256 desplegados en `inventario.full_cashier_dispatch_v2`.

| Comprobación | Resultado |
|---|---|
| Fingerprints de `start`, `save_batch`, `finish` | **10/10 coincidentes** |
| Composición de operaciones | 3 `start`, 4 `save_batch`, 3 `finish` |
| Observaciones en los cuatro batches | **30/30 con receipt remoto** (5 + 6 + 14 + 5) |
| Reconstrucción `inventario.full_compact_replay_data_v1` | **10/10 respuestas reconstruibles**, 0 miembros faltantes |
| `finish` vs. observaciones remotas | 11, 19 y 0 observaciones según sesión, coherentes |

La evidencia prueba consistencia de fingerprints, compactación de respuestas y persistencia; **no simula la pérdida de respuesta ni ejecuta replays remotos nuevos**. Ese comportamiento estaba cubierto previamente por pruebas transaccionales y mocks, pero sigue faltando E2E con red real.

## 4. E1.2 — B4: reserva durante recovery (PASS, transacción revertida)

Se creó una **sesión Full V3 sintética** dentro de un bloque reversible, usando una referencia real de snapshot y un detalle de reconteo ya existente **solo como referencia FK**. No se modificó ese detalle.

1. Inserción de ventana V3 y grupo runtime de reconteo; reserva inicial.
2. Transición simulada `activo → recovery` con reloj lógico posterior a vencimiento, previo a límite de entrega.
3. Verificación de reserva **conservada** y presencia de sesión/estado de entrega en `inventario.full_cashier_state_v2`.
4. Duplicado de reserva para el mismo `detail_id` → rechazo por unicidad.
5. `recovery → finalizado` → reserva liberada por trigger.
6. Excepción deliberada: `SOLOG_E1_FORCE_ROLLBACK`.

**Resultado:** `PASS_ROLLED_BACK`; 0 sesiones sintéticas, 0 grupos runtime y 0 reservas de ensayo después del rollback.

**Límite:** no prueba dos transacciones simultáneas ni normalización automática del dispatcher; la transición se simuló explícitamente. La ruta `recovery → expirado` no se ejercitó, aunque el trigger desplegado contempla `finalizado` y `expirado`.

## 5. E1.3 — B5: primera confirmación y rechazo atómico (PASS, transacción revertida)

Se preparó una sesión V3 sintética con dos grupos de cobertura no contados del turno. Los detalles reales anteriores no se modificaron.

1. Primera observación de grupo A → insertada dentro del ensayo.
2. Se intentó un segundo bloque con observación válida de grupo B seguida de un **duplicado del grupo A en el mismo turno**.
3. Rechazo real del trigger `inventario.solog_assert_normal_count_turn_v4`: **`SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT`**.
4. La subtransacción del segundo bloque revirtió el grupo B; quedó la primera observación como única fila de la sesión sintética hasta el rollback final.
5. Excepción deliberada: `SOLOG_E1_B5_FORCE_ROLLBACK`; estados previos de los dos grupos comparados contra `to_jsonb` quedaron iguales y 0 filas de sesión/runtime de ensayo persistieron.

**Resultado:** `PASS_ROLLED_BACK`; protección contra duplicado y atomicidad de la subtransacción SQL verificadas.

**Límite:** el bloque de dos inserciones SQL no es una mutación `save_batch` por RPC V7 real; la emisión efectiva de `field_path` desde un rechazo V7 integrado y la separación humana del lote siguen pendientes.

## 6. E1.4 — Forma de error B5 (PASS, helper SQL)

Se ejecutó `inventario.full_cashier_error_v3` de forma directa, sin escritura:

| Código | `action_required` | `field_path` | Otros |
|---|---|---|---|
| `NORMAL_COUNT_ALREADY_IN_SHIFT` | `manual_review` | `p_payload.items[1]` | `ok=false`, `retryable=false` |
| `NORMAL_COUNT_BLOCKED_AFTER_INCONSISTENT` | `manual_review` | `p_payload.items[0]` | `ok=false`, `retryable=false` |
| `RECOUNT_ALREADY_RESOLVED` | `fix_payload` | `p_payload.items[2]` | `ok=false`, `retryable=false` |

En los tres: `errors_total=1`, `errors_truncated=false`, `contract_version=2`.

**Límite:** comprueba la serialización del helper, no el `field_path` generado por un batch rechazado vía dispatcher.

## 7. Control posterior independiente

Consulta de las 06:35 (America/Lima):

| Métrica | Resultado |
|---|---:|
| Sesiones activas o recovery | **0** |
| Reservas B4 | **0** |
| Conflictos persistidos | **0** |
| Sesiones V3 reales | **3, las tres finalizadas** |
| Referencias, vencimientos, delivery deadlines inconsistentes | **0** |
| Sesiones nuevas en Cutervo posteriores a las 06:00 | **0** |
| Política horaria | **`required`** |

Se verificó explícitamente que los ensayos terminaron en `PASS_ROLLED_BACK`, sin sesiones/runtime/reservas de prueba y sin cambios duraderos en estados de los grupos examinados. El total de operaciones existente siguió su evolución natural por el cierre de la tercera sesión a las 06:00; no atribuir esa operación real al ensayo.

## 8. Dictamen y bloqueos siguientes

**GO técnico parcial E1:** idempotencia histórica, serialización de replay, integridad de reservas en recovery, rechazo B5 y rollback de lote SQL superados. No se detectó una incompatibilidad backend que justifique cambiar contratos.

**NO-GO para cierre integral E1/O1:** siguen sin validar en entorno aislado:
- Timeout **después** de que V7 confirme una operación, seguido de replay real en nueva petición, con identidad/dispositivo reales.
- B5 con lote V7 de varios ítems y evidencia real `field_path`, sin impacto operativo.
- B4 con dos transacciones/sesiones concurrentes y carrera de reserva.
- Envío/recuento en recovery bajo prioridad cambiante, y agotamiento real de `pending_delivery_until`.
- Ciclo `recovery → expirado` con reserva y diagnóstico de entrega no resoluble.

**Próximo paso recomendado:** preparar un entorno de Supabase aislado — remoto o local reproducible — y ejecutar en él estas pruebas integradas; **no forzarlas sobre el entorno operativo**. Hasta entonces, E1 queda técnicamente avanzado pero **no cerrado**.

No existen cambios de código que deban enviarse a Codex como consecuencia de esta validación.
