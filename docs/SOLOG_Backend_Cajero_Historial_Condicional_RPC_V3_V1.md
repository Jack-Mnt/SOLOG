# SOLOG — Backend Cajero — Historial condicional RPC V3 — Contrato de diseño V1

**Estado:** DISEÑO TÉCNICO PROPUESTO — PRE-FLIGHT COMPLETADO — **NO DESPLEGADO; NO CONGELADO PARA IMPLEMENTAR**.
**Fecha:** 2026-11-23 (America/Lima).
**Clasificación:** Nivel C — contrato RPC y consistencia de historial.
**Proyecto Supabase:** PuertoRicoOnline (`fvtohxvcvsflzmftgfzs`), esquema `inventario`, API expuesta `public`.
**Fuente primaria backend para este alcance, una vez aprobada y congelada:** este archivo. **No modifica** el contrato V2 existente.
**Documento de integración cliente vinculado:** `docs/SOLOG_Integracion_Cajero_Historial_Condicional_A3_V1.md`; este documento prevalece para firma, payload, forma de respuesta, seguridad y semántica de sincronización del backend.

## 1. Decisión aprobada y alcance

Decisión funcional **aprobada por el usuario**: al abrir Historial, hacer **una consulta condicional** para detectar cambios; si el contenido no cambió, devolver una respuesta ligera `not_modified`; si cambió, devolver la **colección completa actualizada** `full`. El cliente reemplaza de forma atómica la colección, **no mezcla un delta incremental**.

La nueva RPC propuesta es **`public.rpc_solog_cashier_history_v3(p_payload jsonb DEFAULT '{}'::jsonb)`**, `RETURNS jsonb`; `rpc_solog_cashier_history_v2` permanece intacta y ejecutable.

**No hay cambios propuestos** en tablas, Motor, snapshots, cron, V6/V7, `conteo_detalle.diferencia`, lógica del reconteo ni autorizaciones de dispositivos. Tampoco se integra todavía el frontend.

## 2. Preflight contra backend desplegado

Se inspeccionó directamente la definición de `public.rpc_solog_cashier_history_v2` y funciones de escritura:
- V2 filtra por `auth.uid()`, usuario activo con rol `cajero`, `c.sede_id = v_sede`, `c.usuario_id = v_uid`, `cd.estado_diferencia <> 'Inválido'` y fecha de `cd.contado_at` en `America/Lima`. `today` y `yesterday` significan **fechas de conteo**, no de reconteo.
- V2 devuelve `items` completos, `generated_at`, `period`, `date`, `revisions.operational`.
- `revisions.operational` es por **sede** y no es un detector completo de cambios en los `items`: `full_apply_groups_v1` y `solog_aplicar_snapshot_v4` actualizan `conteo_detalle` sin incrementar directamente dicha revisión. Otras rutas actualizan datos de forma independiente. **No usar igualdad de la revisión operacional para afirmar `not_modified`.**
- Índices existentes: `idx_conteos_usuario_iniciado`, `idx_conteo_detalle_conteo`, `idx_conteo_detalle_origen_sede_fecha_v2`, entre otros; no se justifican índices nuevos sin `EXPLAIN` representativo.
- 2026-11-23, lectura de referencia: 1.861 `conteo_detalle`, 114 `conteos`, máximo de **438 detalles por cajero/fecha Lima**, promedio **88,57** (datos actuales; no pronóstico).
- `extensions.digest(...,'sha256')` funcionó en prueba SQL de solo lectura.
- ACL actual V2: `authenticated` con EXECUTE, `anon` sin EXECUTE, `SECURITY DEFINER` y `SET search_path = ''`. V3 preservará esa postura.

## 3. Estrategia autoritativa — ETag de contenido

**Huella ETag:** digest SHA-256 hexadecimal, longitud 64, calculado por el backend sobre una serialización **determinista y canónica** de:
- versión explícita de proyección, p. ej. `cashier_history_v3_1`;
- identidad autoritativa `auth.uid()` y `sede_id` derivada del usuario, nunca desde el payload;
- `period` y `date` Lima resueltos en el servidor;
- **todos los campos y todas las filas visibles**, con orden total determinista `cd.contado_at DESC, cd.id DESC`, exactamente la proyección de V2.

Representación propuesta: `jsonb_build_object(..., 'items',v_items)::text` → UTF-8 → `extensions.digest(...,'sha256')` → `encode(...,'hex')`. Toda revisión de campos/semántica de la proyección cambia la versión de proyección incluida en el hash.

**Condición obligatoria:** `not_modified` solo si `if_etag` es una huella válida, `if_date` coincide con la fecha Lima resuelta y `if_etag` coincide con el digest del contenido recién consultado. No se acepta un `etag` como credencial o autorización.

**Riesgo / costo asumido:** se reconstruye y resume la colección SQL en **cada apertura** para evitar falsos negativos. Reduce el egress HTTP cuando no cambia, **no** evita el costo SQL de leer y construir la proyección. No requiere triggers, nuevas revisiones por usuario, polling, tablas o trabajos periódicos.

## 4. Contrato objetivo propuesto

### 4.1. Entrada

Llamada Supabase JS:

```ts
supabase.rpc('rpc_solog_cashier_history_v3', {
  p_payload: {
    period: 'today',  // 'today' | 'yesterday'
    if_date: '2026-11-23', // opcional: solo cuando hay ETag
    if_etag: '...'          // opcional: SHA-256 hexadecimal de 64 caracteres
  }
})
```

- `p_payload`: objeto JSON; `period` opcional con default `today`.
- Primera lectura, pérdida de caché o cambio de identidad: **omitir `if_date` y `if_etag`**.
- Revalidación: enviar **ambos** `if_date` (ISO `YYYY-MM-DD`) e `if_etag` (64 hex minúsculas).
- Combinación incompleta, valores malformados o período inválido: **error de contrato controlado**, sin convertirlo en `not_modified`.
- No aceptar `user_id`, `sede_id` ni token de dispositivo como filtros proporcionados por el cliente.

### 4.2. Respuesta común

```ts
type CashierHistoryV3Response = {
  contract_version: 3
  generated_at: string
  period: 'today' | 'yesterday'
  date: string             // YYYY-MM-DD, fecha Lima del período
  status: 'full' | 'not_modified'
  etag: string             // SHA-256 hex del contenido en contexto
  revisions: { operational: number } // diagnóstico; NO es la clave de igualdad
  items: CashierHistoryItem[] | null
}
```

`CashierHistoryItem` conserva **exactamente todos los campos, nullables, estados permitidos y semántica de V2**, incluido `estado_diferencia`, valores de reconteo y observaciones. No reinterpretar `diferencia` como histórica. El backend no expone un estado `Inválido` nuevo (conserva filtro V2).

**Si es `full`:** `items` es array de datos **completo** y puede ser `[]` legítimamente; incluye `etag`. **Si es `not_modified`:** `items=null`, sin filas históricas; también incluye `etag`.

La respuesta JSON de `not_modified` es **HTTP normal 200** de PostgREST, *no* un status HTTP 304.

### 4.3. Tabla de decisiones

| Estado del request y del contenido | Respuesta |
|---|---|
| Sin `if_etag` y `if_date` | `full` |
| `if_date` distinto a la fecha del servidor | `full` |
| Huella del cliente distinta a la actual | `full` |
| Fecha y huella iguales y válidas | `not_modified` |
| Contenido vacío en primera lectura | `full` con `items=[]` |
| Cambia una observación, reconteo, estado, precio, stock posterior o desaparece fila | `full` |
| Revisión operacional distinta pero contenido idéntico para este usuario | `not_modified` |

## 5. Semántica temporal y consistencia

- Capturar una vez el instante confiable del servidor; deducir de él período y límites Lima `[desde,hasta)`. `yesterday` sigue siendo la fecha anterior al **día Lima actual**.
- Materializar la proyección visible del usuario **una vez por llamada**, con orden estable. Calcular ETag **sobre esa misma proyección**; si cambian filas concurrentemente entre operaciones, no se permite un ETag de una proyección distinta de la enviada.
- El resultado representa un punto de observación transaccional. Una escritura que se confirme después de esa lectura se detectará al abrir/consultar Historial nuevamente; no prometer actualización en tiempo real.
- Evitar un `not_modified` para otra sede, cajero, fecha o versión de proyección, aunque las listas de filas fueran accidentalmente iguales; incluir esos elementos en el digest.
- Sin cachés de respuesta intermedias en servidor ni trabajo de cron.

## 6. Seguridad

Mismo principio de autoridad de V2: `auth.uid()` activo, `rol='cajero'`, sede activa/legítima según el comportamiento exacto de V2, proyección limitada a `c.sede_id` y `c.usuario_id`, no se permite acceso a otros cajeros por conocer un ETag.

Para `SECURITY DEFINER`: `SET search_path = ''`, referencias schema-qualified, validación de payload, `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon`; `GRANT EXECUTE TO authenticated` y los roles internos expresamente necesarios según ACL V2. Verificar `has_function_privilege` tras despliegue. No exponer tablas ni ampliar RLS/grants de datos.

## 7. Plan de backend — ChatGPT

1. Revisar baseline remoto de la función V2 y proyección exacta de columnas. Preparar migración **nueva y aditiva** sin alterar V2, V6/V7, tablas o Motor. Versionar SQL en el repositorio bajo nombre descriptivo.
2. Desplegar V3 con ACL explícitas y digest determinista. **No encargar frontend a Codex hasta tener el RPC desplegado y el contrato congelado.**
3. Validar en SQL/ambiente controlado: primera lectura `full`; repetición con huella `not_modified`; cambio de un campo del contenido `full`; salida de fila `full`; fecha distinta `full`; vacío; `today/yesterday`; orden estable; `anon` denegado; sede y usuario aislados. Usar transacción con rollback o fixture aislada para mutaciones de prueba, nunca alterar conteos productivos sin aprobación.
4. Comparar **paridad V2/V3** en arrays, campos, orden, nullables y fechas para el mismo usuario/período. Medir `EXPLAIN (ANALYZE, BUFFERS)` seguro en consultas representativas y tamaño de respuestas `full` vs `not_modified`; establecer presupuesto razonable con datos, sin prometer ahorro SQL.
5. Informar resultado, SHA/migración y riesgos. Solo entonces marcar backend **DESPLEGADO/VALIDADO**, congelar este contrato y habilitar la fase Codex.

**Bloqueos:** regresión de seguridad, diferencias V2/V3, ETag no determinista o costo SQL desproporcionado: detener despliegue dependiente, registrar evidencia y resolver con decisión aprobada. No improvisar arquitectura de revisiones ni triggers.

## 8. Fuera de alcance y referencias

- El diseño anterior con TTL de 120 segundos (`SOLOG_Optimizacion_Cajero_Full_Cache_Historial_A3_Diseno_V1.md`) queda **reemplazado en la propuesta funcional de A3**, conservado como histórico.
- Fallas reportadas del acceso Cajero por dispositivo: **pendientes de diagnóstico posterior**, no se corrigen ni prueban dentro de A3.
- Dashboard Admin F7 sigue pospuesto.
- Fuente funcional anterior A3: `SOLOG_Correccion_Cajero_Detalles_BloqueA_Frontend_V1.md`, vigente para objetivo de caché selectiva salvo exclusiones modificadas explícitamente por esta decisión de Nivel C.

**No realizar migraciones, DDL ni mutaciones de datos basándose solo en este documento de diseño.**
