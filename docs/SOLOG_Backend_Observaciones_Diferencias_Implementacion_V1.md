# SOLOG — Backend — Observaciones de Diferencias — Implementación V1

**Estado:** DESPLEGADO en Supabase PuertoRicoOnline; validación estructural y transaccional dirigida aprobada; pruebas E2E autenticadas con una sesión real PENDIENTES por falta de snapshots recientes.  
**Fecha:** 14 de octubre de 2026.  
**Nivel:** C.  
**Rama de documentación:** `admin-work`.  
**Fuente primaria funcional que prevalece:** `docs/SOLOG_Integracion_Observaciones_Diferencias_V1.md`.  
**Naturaleza de este archivo:** reporte de implementación y contrato backend realmente desplegado, **no** nueva fuente primaria ni permiso para rediseñar la UX.

## 1. Baseline y migraciones efectivamente desplegadas

Supabase `fvtohxvcvsflzmftgfzs`. Aplicadas por ChatGPT mediante migraciones Supabase y guardadas con la **misma versión remota** en el repositorio:

1. `supabase/migrations/20261014125923_solog_observaciones_diferencias_escritura_v5.sql` — columnas y RPC V5.
2. `supabase/migrations/20261014130208_solog_observaciones_diferencias_lecturas_v1.sql` — lectores Cajero, Detalles y Control.
3. `supabase/migrations/20261014130649_solog_observaciones_v5_errores_payload_v1.sql` — conservar códigos de error de observaciones fuera del bloque de parseo genérico.
4. `supabase/migrations/20261014131700_solog_observaciones_v5_trim_whitespace_v1.sql` — validar espacios, tabulaciones y saltos de línea de forma consistente con `trim()`.

**No se modificó** la definición de `public.rpc_solog_cashier_mutate_v4(text,jsonb)`, el Motor, snapshots, categorías, ni `master`. **No se activó** corte ni bloqueo de V4. La producción V4 conserva el contrato habitual.

## 2. Esquema

Tabla privada `inventario.conteo_detalle`:

| Campo | Tipo | Default / histórico |
|---|---|---|
| `motivo_diferencia` | `text NULL` | `NULL` |
| `observacion_diferencia` | `text NULL` | `NULL` |
| `observacion_reconteo` | `text NULL` | `NULL` |

Motivos exactos: `Transferencia`, `Venta por mayor`, `Dañado`, `Vencido`, `Otro motivo`.

CHECK: catálogo de motivos; cuando existe `observacion_diferencia`, exige motivo y longitud efectiva >=3; observación de reconteo no nula exige >=3 y `Resuelto` solo es válido cuando el físico y el teórico del reconteo coinciden. La longitud efectiva usa `regexp_replace(...,'^[[:space:]]+|[[:space:]]+$','','g')`, tanto en DB como al normalizar texto en la RPC.

No se impuso una restricción global de obligatoriedad de motivos por magnitud a registros antiguos. La obligatoriedad `abs(d)>=12` está validada en la **RPC V5 de escritura**.

## 3. Escritura V5

**RPC nueva:** `public.rpc_solog_cashier_mutate_v5(p_action text,p_payload jsonb DEFAULT '{}'::jsonb)`.

Permisos: `EXECUTE` para `authenticated`, no para `anon`. `SECURITY DEFINER SET search_path TO ''`; conserva todas las comprobaciones existentes de Cajero V4 (rol, dispositivo, sede, sesión, snapshot, revisión, prioridades, turnos y estado). No se otorgaron permisos de tabla a los clientes.

**Envelope:** mismos campos de solicitud/respuesta, operación e invariantes de V4, salvo `contract_version=5` en las respuestas de mutación V5. Bootstrap y demás endpoints de lectura existentes conservan sus versiones propias.

`p_action` admite `start`, `save_batch`, `recount_save_batch`, `finish`. La versión de escritura se selecciona **por endpoint**; `start/finish` V5 usan el namespace de operación `cashier_v5:...`. Nunca reutilizar el `operation_id` de otra operación.

### 3.1. `save_batch` — shape del elemento

```json
{
  "client_observation_id": "uuid",
  "grupo_id": "uuid",
  "stock_fisico": 8,
  "contado_at": "timestamptz",
  "motivo_diferencia": "Transferencia",
  "observacion_diferencia": "Se trasladaron 12 unidades"
}
```

Los últimos dos campos son **obligatorios como claves**, y sus valores pueden ser `null` cuando la diferencia absoluta sea <12 y no se añadió observación. No enviar cadenas vacías; se rechazan. La RPC compara `stock_fisico` con `stock_teorico` autoritativo de `inventario.solog_session_runtime_groups`, y exige motivo + >=3 caracteres cuando `abs(d)>=12`. Se permite captura voluntaria con motivo+texto incluso con diferencia cero.

La respuesta de cada elemento extiende V4 con `motivo_diferencia` y `observacion_diferencia`, tomados de lo efectivamente persistido.

### 3.2. `recount_save_batch` — shape del elemento

```json
{
  "detalle_id": "uuid",
  "stock_fisico": 8,
  "contado_at": "timestamptz",
  "motivo_diferencia": "Transferencia",
  "observacion_reconteo": "Se volvió a contar toda la caja"
}
```

Las últimas dos **claves** se exigen también para `null`. Se calcula `dr` usando el stock teórico **del reconteo**. Si `dr=0` se persiste `observacion_reconteo='Resuelto'` autoritativamente, sin exigir texto del cliente. Si `dr!=0` y `abs(dr)>=12`, exige motivo y texto. Para reconteo pequeño, el texto es opcional; si se aporta, debe ser válido.

El motivo previo **no puede modificarse**. Si el registro original carece de motivo, el cajero puede incorporarlo en el reconteo; la observación inicial permanece `NULL`. El mismo `conteo_detalle` se actualiza (sin crear un segundo caso). La respuesta incluye motivo y observación del reconteo persistidos.

### 3.3. Códigos específicos nuevos

- `SOLOG_OBSERVATION_FIELDS_REQUIRED`.
- `SOLOG_INVALID_DIFFERENCE_REASON`.
- `SOLOG_INVALID_DIFFERENCE_OBSERVATION`.
- `SOLOG_DIFFERENCE_EXPLANATION_REQUIRED`.
- `SOLOG_DIFFERENCE_REASON_IMMUTABLE`.
- `SOLOG_INVALID_RECOUNT_OBSERVATION`.
- `SOLOG_RECOUNT_EXPLANATION_REQUIRED`.

Validaciones tipadas de campos estructurados; el resto de errores de V4 se conserva. El frontend deberá resolver los mensajes para el cajero sin mostrar códigos crudos.

### 3.4. Atomización e idempotencia

El motivo/texto pertenece al **mismo** payload `p_payload` protegido por `inventario.solog_operation_begin/finish`. El namespace es `cashier_v5:<action>`. Cualquier error revierte toda la mutación de ese lote. No editar `operation_id`, `contado_at`, `client_observation_id`, `detalle_id`, motivos ni textos tras preparar una operación para enviar. Las operaciones V4 ya preparadas continúan por el endpoint V4 sin cambiar su contenido ni su identidad.

## 4. Lecturas desplegadas

### 4.1. Historial Cajero

`public.rpc_solog_cashier_history_v2(jsonb)` permanece en `contract_version=2`. Cada `items[]` incorpora siempre tres claves nuevas (nullable):

- `motivo_diferencia`
- `observacion_diferencia`
- `observacion_reconteo`

No cambian filtros `today/yesterday`, orden, sede, identificación ni caché por revisión operativa.

### 4.2. Detalles

`public.rpc_solog_details_v2(text,jsonb)` conserva `contract_version=2` y añade los tres campos en `detail.case`. No se inflan las páginas `history` del módulo; al expandir un registro, el consumidor `DetailsCaseView` obtiene su caso individual.

### 4.3. Admin Control

`inventario.solog_control_chronology_view_v1`, invocada por `public.rpc_solog_admin_control_v1`, conserva `contract_version=2`, los mismos estados, número, orden, fechas y `row_id` de eventos.

Cada evento lleva la clave aditiva:

```json
{
  "observaciones": {
    "inicial": {
      "motivo": "Transferencia",
      "texto": "Se trasladaron 12 unidades",
      "registrada_at": "timestamptz"
    },
    "reconteo": {
      "motivo": "Transferencia",
      "texto": "Se revisó toda la caja",
      "registrada_at": "timestamptz"
    }
  }
}
```

Cada uno de los dos objetos puede ser `null`. La asignación depende de la **naturaleza del evento**: nota inicial en puntos de captura inicial; nota de reconteo en resolución/reconteo; eventos automáticos de snapshot no heredan anotaciones. Para el caso especial `Coincide` por reconteo, el evento existente puede incluir **ambos objetos**, diferenciados por su `registrada_at`, sin inventar por ahora otro punto histórico.

**Visualización Admin pendiente:** el usuario decidirá después si el icono/popup muestra un motivo y dos explicaciones y dónde encaja. Este backend **no congela** ese diseño ni autoriza que se atribuyan las dos anotaciones al mismo instante.

### 4.4. Contratos aditivos y compatibilidad

Los consumidores antiguos de las lecturas V2 ignoran los campos adicionales. El frontend nuevo deberá validar sus tipos y nulabilidad antes de usarlos.

## 5. Validación realizada

- Migraciones SQL: cuatro desplegadas, sin errores al concluir.
- Funciones existentes: V4 y V5 coexisten; V4 conserva `contract_version=4`, V5 declara `contract_version=5`.
- Seguridad: `authenticated` puede ejecutar V5; `anon` no. La tabla privada mantiene RLS y sin permisos directos de lectura/edición para `authenticated`.
- Restricciones DB en una transacción revertida: motivo válido aceptado; motivo fuera de catálogo, texto de un carácter, nota inicial sin motivo, `Resuelto` sin reconteo coincidente, solo tabs y solo saltos de línea rechazados.
- Llamada sin sesión autenticada: V5 rechaza con `SOLOG_AUTH_REQUIRED`.
- Admin cronología sobre datos existentes: `contract_version=2`, dos eventos devueltos en un caso inspeccionado, ambos con forma `observaciones`.
- Los `1399` registros preexistentes siguen presentes y las tres columnas nuevas permanecen `NULL` en esos registros: sin backfill.
- Security/performance advisors consultados. Se mantiene la advertencia de `SECURITY DEFINER` para funciones autenticadas por tratarse de un patrón ya previsto y protegido por validaciones de rol/sede/dispositivo; existen además advertencias generales preexistentes en otras superficies. Evaluar por separado los avisos que no pertenecen a este bloque.

**No verificado aún:** roundtrip E2E autenticado con sesión/snapshot vigentes y envíos exitosos `save_batch`/`recount_save_batch`, reintentos con caída de red y smoke real de frontend. Durante la inspección no existían sesiones activas ni snapshots recientes. No declarar esos casos aprobados.

## 6. Activación y condiciones de integración

- El frontend V4 de `master` continúa operando como antes. La nueva regla de obligatoriedad **solo se aplica por V5** hasta el corte de V4.
- Antes de implementar el consumidor, Codex debe establecer baseline de `admin-work`, planificar y obtener aprobación; **no modifica Supabase**.
- Compatibilidad con borradores V4 duraderos, operaciones preparadas y replay exacto es obligatoria; nunca migrarlos reinterpretando su payload.
- Para el corte V4 posterior se requiere aprobación expresa, manejo seguro de recovery y prueba en Preview. No activar el corte como efecto secundario de esta fase.
- Conservar la fuente primaria congelada; novedades o incompatibilidades se documentan mediante un delta específico.

## 7. Estado

**Backend desplegado:** SÍ.  
**Validación estructural y de restricciones:** SÍ.  
**E2E mutaciones autenticadas:** PENDIENTE.  
**Backend compatible con frontend nuevo:** contrato V5 disponible; antes del cierre global comprobar roundtrip en entorno de prueba con snapshots válidos.  
**Frontend:** NO implementado.  
**`master`:** sin cambios.  
**Corte V4:** NO ejecutado.
