# SOLOG — Backend Cajero — Validación de historial condicional RPC V3 V1

**Estado: VALIDADO — backend desplegado.**
**Fecha local:** 2026-11-23 (America/Lima). **Versión de migración Supabase (UTC):** `20261124025038`.
**Proyecto:** PuertoRicoOnline (`fvtohxvcvsflzmftgfzs`).
**Fuente primaria del contrato:** `docs/SOLOG_Backend_Cajero_Historial_Condicional_RPC_V3_V1.md`.
**Migración versionada:** `supabase/migrations/20261124025038_solog_cajero_historial_condicional_rpc_v3.sql`.
**Alcance:** solo función pública aditiva `rpc_solog_cashier_history_v3(jsonb)` y sus `EXECUTE` grants. Sin modificaciones de tablas, datos, triggers, cron, Motor, V2, V6/V7 ni frontend.

## 1. Preflight y despliegue

- Baseline Supabase: `rpc_solog_cashier_history_v3` inexistente. V2 vigente inspeccionada, con ACL de `authenticated`, `anon` denegado y `SECURITY DEFINER SET search_path=''`.
- Aprobación expresa del usuario de la consulta condicional, con `full` / `not_modified` y colección completa cuando cambia.
- `mcp__Supabase__apply_migration` respondió `{"success":true}`. `list_migrations` corroboró `20261124025038_solog_cajero_historial_condicional_rpc_v3`.
- `pg_get_functiondef` posterior confirmó función V3 definida y que calcula el ETag con SHA-256 de la proyección completa, `auth.uid()`, sede, período y fecha.
- Archivo SQL del repositorio generado a partir de la definición **real desplegada**, con `REVOKE` y `GRANT` explícitos. Sin modificaciones en `master`.

## 2. Resultados de pruebas SQL reales (transacciones con ROLLBACK)

Pruebas realizadas vía `execute_sql` sobre el proyecto correcto, simulando identidad autenticada mediante `SET LOCAL request.jwt.claim.sub` en transacciones de lectura; no son pruebas HTTP/JWT extremo a extremo.

| Control | Resultado |
|---|---|
| Primera consulta `today` | `status=full`, `items=[]` con datos actuales |
| Repetición con `if_date` y `if_etag` de primera respuesta | `status=not_modified`, `items=null` |
| ETag estable y válido (64 hex) | Sí |
| ETag incorrecto | `status=full` |
| Fecha incorrecta (ISO válida) | `status=full` |
| `yesterday` | `status=full`, fecha Lima del día anterior |
| Paridad V2/V3 en `items` y fecha/período | Sí, **con conjuntos vacíos actuales** |
| Payload inválido, período inválido, par condicional incompleto, fecha inválida, ETag malformado y filtro `sede_id` extra | 8 casos rechazados según códigos esperados |
| ETag reutilizado por otro cajero | `full`; no coincide la huella entre identidades |
| Rol Admin usando V3 | `SOLOG_OPERATIONAL_ROLE_REQUIRED` |
| Identidad no autenticada | `SOLOG_AUTH_REQUIRED` |

**Total:** 11 verificaciones negativas/de aislamiento adicionales aprobadas, más matriz de `full` / `not_modified`, período/fecha y paridad básica.

## 3. Seguridad y advisors

Post-despliegue `has_function_privilege`:

| Rol | `EXECUTE` V3 |
|---|---|
| `authenticated` | Sí |
| `anon` | **No** |
| `service_role` | Sí |

`SECURITY DEFINER` activo y `search_path=''`, igual que la RPC V2 de la misma superficie. La función exige `auth.uid()` no nulo, usuario activo de rol Cajero, sede asignada y `c.usuario_id = auth.uid()` / `c.sede_id = user.sede_id`. No toma identidad o sede de parámetros.

El advisor de Supabase señaló `authenticated_security_definer_function_executable` para V3 (**WARN**). Es un aviso esperado para RPC privilegiada deliberadamente expuesta a `authenticated`; se compensó con validación interna de identidad/rol/alcance y concesiones explícitas. No se reclasifica como defecto nuevo no resuelto. Referencia de advisor: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## 4. Pruebas de contenido y coste

Los históricos existentes de un cajero de Cutervo incluyen un día con **438 registros visibles** (2026-11-20, Lima). Sin alterar filas reales, se reconstruyó la proyección equivalente a V3 y se calculó la huella en memoria:

- Cambiar el valor de `diferencia` altera el hash: **sí**.
- Modificar `stock_posterior` altera el hash: **sí**.
- Eliminar una fila de la colección altera el hash: **sí**.
- La proyección histórica incluye registros recontados (20 en ese día); los nullables/observaciones se conservaron con los nombres V2.

**Simulación de tamaño JSON, no medición HTTP:** colección histórica `full` con 438 filas ≈ **311.566 bytes**; `not_modified` representativo ≈ **254 bytes**. Para un conjunto vacío actual, `not_modified` puede ser ligeramente **mayor** que `full` por los metadatos; la optimización beneficia sobre todo las colecciones grandes no modificadas.

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` de la proyección de 438 filas, solo lectura: **11,967 ms de ejecución**, planificación **2,842 ms**, **73 bloques shared hit**, sin lectura desde disco ni escritura. Esto mide la consulta de proyección, **no** el coste total de la RPC con serialización ETag/HTTP ni la latencia de red. No se añadieron índices por esta evidencia.

## 5. Límites y seguimiento

- El día actual y ayer no tenían filas visibles al validar; por tanto, la **paridad real V2/V3 para un conjunto no vacío de hoy/ayer** no pudo comprobarse sin introducir conteos sintéticos. Se inspeccionó igualdad literal de proyección SQL y se probó la serialización/hash contra filas históricas reales en consulta de solo lectura, pero **no se declara ese escenario end-to-end superado**.
- No se probó un cambio concurrente real entre consultas vía HTTP autenticadas, ni un flujo frontend consumiendo V3. Ambos corresponden a integración/smoke A3.
- PostgreSQL materializa la proyección en cada llamada para calcular el ETag. El ahorro de egress puede ser alto cuando no hay cambios; **no se promete eliminación del costo SQL**.
- Para ampliar una validación de contenido no vacío se recomienda un entorno de test o una sesión operativa de ese día, no mutar el historial productivo.
- Los errores del guard de redirección de acceso Cajero quedan abiertos y pospuestos expresamente por el usuario. Dashboard F7 también sigue pospuesto.

## 6. Dictamen

**A3-B1 backend: DESPLEGADO Y VALIDADO con límites de evidencia enumerados.** Contrato V3 congelado; `rpc_solog_cashier_history_v2` preservada. El frontend puede pasar a **A3-F0: baseline y plan de Codex, sin implementar hasta la aprobación del usuario**. No se ha preparado ni ejecutado el frontend aquí.
