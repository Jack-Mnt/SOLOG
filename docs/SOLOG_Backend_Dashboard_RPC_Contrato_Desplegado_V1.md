# SOLOG — Backend Dashboard: contrato de RPC desplegado V1

| Campo | Estado |
|---|---|
| Contrato | **DESPLEGADO EN SUPABASE**; pendiente aprobación final del usuario para congelarlo como fuente de consumo del frontend |
| Versión de transporte | `contract_version: 1` |
| Backend | `fvtohxvcvsflzmftgfzs` |
| Rama documental | `admin-work` |
| Fuente funcional primaria | `docs/SOLOG_Backend_Dashboard_Metricas_Persistencia_V1.md` (congelada) |
| Delta funcional prevalente | `docs/SOLOG_Cambio_Dashboard_Movimiento_Actividad_V1.md` (congelado, solo sus sustituciones) |
| Estado del contrato técnico anterior | `docs/SOLOG_Backend_Dashboard_Metricas_Contrato_Tecnico_V1.md` es referencia/propuesta histórica en cuanto a *formas de transporte*; **esta versión desplegada prevalece para payloads, respuestas y errores**. No reemplaza reglas funcionales congeladas |
| Implementación ejecutable | SQL de Fase 6 versionado en `docs/SOLOG_Backend_Dashboard_Fase6_*.sql` y sus migraciones remotas; el último `CREATE OR REPLACE` prevalece por función |
| Frontend | **NO AUTORIZADO todavía**. Codex deberá recibir este contrato únicamente después de su aprobación |

## 1. RPC, identidad y seguridad

```sql
public.metrics_dashboard_v1(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
```

- Es la única API pública nueva para estas métricas. `SECURITY DEFINER` con `search_path=''`.
- `EXECUTE` concedido a `authenticated` y `service_role`; revocado a `PUBLIC` y `anon`. **Concesión SQL no equivale a autorización funcional:** toda llamada exige `auth.uid()`, fila activa de `public.usuarios`, rol `admin` o `moderador`, y sede solicitada activa.
- `overview` reúne todas las sedes activas; los otros seis actions exigen `site_id` activo. La autorización administrativa actual permite a estos roles consultar las cinco sedes; no se ha creado una ACL adicional por sede.
- `inventario.metrics_dashboard_*` son auxiliares privados, sin EXECUTE directo para `authenticated` ni `anon`. Las tablas analíticas permanecen en esquema privado con RLS.
- No modificar `rpc_solog_admin_control_v1`, RPC V5, ConeXion V2 o contratos previos.

## 2. Envoltorio común y tipos

```json
{
  "contract_version": 1,
  "generated_at": "ISO 8601 timestamptz",
  "action": "overview",
  "source": "metrics_dashboard_v1",
  "quality": "complete | partial | no_data",
  "data": {}
}
```

- `generated_at` proviene de `statement_timestamp()` de PostgreSQL; los instantes son `timestamptz` en ISO 8601, convertidos por el cliente cuando corresponda.
- `quality` del envoltorio es independiente de la calidad por sitio, grupo, celda o corte.
- Campos numéricos monetarios/diferencias con signo; `null` si N/D. Ningún `null` debe transformarse automáticamente en cero.
- Fechas de negocio: `YYYY-MM-DD` Lima; turnos `early|day|night` (Madrugada/Día/Noche). Los grupos elegibles actuales son los activos con ≥1 SKU incluido.
- El frontend no calcula puntuaciones C, D, V o R ni reconstruye episodios/hitos.

## 3. Actions, payload y salida `data`

| Acción | Payload admitido | Salida `data` | Límite |
|---|---|---|---|
| `overview` | `{}` | `{sites: SiteOverview[]}` | 5 sedes activas actuales |
| `rounds` | `{site_id}` | `{site_id,current,period_rounds,history}` | `history` máximo 6 rondas |
| `risk` | `{site_id,limit?,sort?,cursor?}` | `{site_id,sort,rows,next_cursor,total}` | `limit` por defecto 6, máximo 100 |
| `episodes` | `{site_id,scope?,sort?,limit?,cursor?}` | `{site_id,scope,sort,rows,next_cursor,total}` | defecto 25, máximo 100 |
| `activity` | `{site_id,date_from,date_to}` | `{site_id,date_from,date_to,cells}` | hasta 31 días *inclusivos* |
| `day` | `{site_id,date}` | `{site_id,date,physical_activity,episodes,confirmed_differences,confirmed_total,confirmed_next_cursor,observations_initial_cursor,quality}` | un día |
| `day_observations` | `{site_id,date,limit?,cursor?}` | `{site_id,date,rows,next_cursor}` | defecto 25, máximo 100 |

Todas las claves son exactas; campos extra del payload se rechazan con `SOLOG_INVALID_PAYLOAD`. `site_id` es UUID de una sede activa. `cursor` omitido o `null` significa primera página.

### 3.1. `overview`

`sites[]`, una fila por sede activa, ordenada por nombre:

- `site_id: uuid`, `site_name: string`.
- `round: {period_from: date, round: 1|2, counted: integer|null, required: integer|null, percent: numeric|null, quality}`.
- `accuracy: {green, yellow, red, exempt_zero_zero, without_evidence, universe, denominator, green_percent, yellow_percent, red_percent, quality}`. `denominator=green+yellow+red`; exentos y grupos sin evidencia quedan fuera de la barra. `denominator=0` → porcentajes NULL.
- `surplus/shortage: {groups:integer, value:numeric|null, quality}`. Importes **brutos y con signo**, sin neteo. Si no hay confirmación física alguna o existe un importe faltante en una diferencia confirmada contribuyente, `value=null` y calidad `no_data|partial`; los conteos de grupos siguen visibles.
- `risk: {high:integer, very_high:integer, quality}`. Riesgo basado en diferencia física confirmada comparable, incluso con nueva obligación de validar; si Movimiento carece de C24 suficiente, **calidad `partial`**, aunque la regla funcional permita imputar C=1.
- `quality`: `complete|partial|no_data` por cada bloque; `overview.quality` global es `complete` solo si los bloques de todas las sedes lo son.

### 3.2. `rounds`

`current` es un `RoundItem` o `null` si no existe ronda. `period_rounds[]` es la quincena actual, `history[]` máximo seis rondas cerradas de la sede, descendentes.

`RoundItem`:

- `round_from, round_to`: timestamps de frontera; `period_from,period_to`: fechas Lima; `round:1|2`.
- `coverage:{counted,required,percent}`, valores nullable cuando corte `N/D`.
- `milestones:{"50": timestamp|null,"90": timestamp|null,"100": timestamp|null}`.
- `historical_accuracy:{green,red,exempt,without_evidence,denominator,percent}|null`. En corte `N/D`, los contadores del objeto son NULL; sin corte, el objeto completo es `null`. **No existe amarillo histórico**.
- `shift_contributions:{early,day,night}` (corte cerrado inmutable o obligaciones actuales para ronda abierta).
- `closed_at:timestamp|null`, `quality:complete|partial|no_data`, `cut_version:integer|null`.

Los cortes de Rondas son independientes de la elegibilidad actual; no recalcular históricos cerrados al excluir grupos.

### 3.3. `risk`

- `sort` opcional: `risk` (defecto), `value`, `difference`.
- `rows[]:` `{group_id,group_name,difference,confirmed_value,level,movement_quality,risk_available}`.
- `level:` `bajo|medio_bajo|medio|medio_alto|alto|muy_alto|null`. `movement_quality:` `complete|partial|insufficient`; **distinto de** `quality` general.
- `risk_available:boolean` indica que se pudo calcular el nivel. C insuficiente **no lo hace false automáticamente**: se usa la imputación C=1 y se expone `movement_quality='insufficient'`.
- Sin confirmación válida/comparable el grupo no integra el ranking; no exponer valores internos de C, D, V ni puntaje R.
- `total:integer` autoritativo para el universo paginable, `next_cursor:string|null`.

### 3.4. `episodes`

- `scope:'open'|'closed'` (defecto `open`).
- En `open`: `sort:'importance'|'recurrence'|'persistence'`, defecto `importance`.
- En `closed`: `sort:'recent'`, defecto `recent`; se consulta cierre físico de los últimos 45 días móviles.
- `rows[]:` `{episode_id,group_id,group_name,opened_at,closed_at,recurrences_45d,duration_hours,risk_level,risk_status}`.
- `risk_level` usa los seis niveles de Riesgo o `null`. `risk_status:'available'|'pending_confirmation'|'not_available'`.
- Episodios abiertos operativos: solo los actualmente elegibles con evidencia activa comparable; duración abierta sin corte a 45 días.
- `next_cursor:string|null`, `total:integer`.

### 3.5. `activity`

- `date_from,date_to`: dos fechas válidas de Lima, ordenadas; máximo 31 fechas inclusivas.
- `cells[]`: **3 celdas por fecha**, ordenadas por fecha y turno.
- Celda: `{date,turno,status,completed,required,percent,breakdown,quality}`.
- `status:'in_progress'|'closed'|'no_tasks'|'no_data'`.
- `completed/required:integer|null`; `percent:numeric|null`. Sin fila analítica: los tres `null`, `status='no_data'`. Fila válida sin tareas: `completed=0,required=0,percent=null,status='no_tasks'`.
- `breakdown:{round_coverage,review_for_coverage,review_regular,shift_coverage}`: conteos completados por clase de ejecución original; cero si no existe tal completada.
- `quality:'complete'|'partial'|'no_data'`; el resumen filtra las identidades compactas por **grupos actualmente elegibles**, sin inventar reconstrucciones de actividad pasada.

### 3.6. `day`

- `physical_activity:{groups_observed,counts,recounts}` con horas físicas de Lima, no turno de la sesión.
- `episodes:{opened,closed,open_at_day_end}`. Abiertos al **cierre del día consultado**, no episodios abiertos hoy.
- `confirmed_differences[]:` `{group_id,group_name,recounted_at,difference,frozen_value}`, una fila por grupo con **último reconteo físicamente Confirmada** del día, reconstruido por `d0/dr` y valorización congelada, aunque el estado presente haya cambiado. Orden descendente por magnitud absoluta del valorizado, luego diferencia e ID.
- `confirmed_total:integer` = cardinalidad de `confirmed_differences`; `confirmed_next_cursor:null` en V1. **Política final B4:** se devuelve el conjunto completo del día, sin acción adicional de paginación; cada grupo elegible aporta como máximo una fila por día. No existe límite fijo de 100 para este subarreglo; depende del universo de grupos.
- `observations_initial_cursor:null`: la tabla de observaciones inicia con `day_observations` y cursor `null`, no con un cursor de este resumen.
- `quality:'complete'|'partial'|'no_data'`; fechas anteriores a la primera inicialización de Rondas se marcan `partial`, fechas futuras `no_data`.

### 3.7. `day_observations`

`rows[]:` `{observation_id,group_id,group_name,kind,observed_at,theoretical,physical,physical_difference,result}`.

- `kind:'normal'|'recount'`.
- `result` de la **observación física**: `Coincide|Recontar|Confirmada|Inconsistente`, no se lee ciegamente `estado_diferencia` mutable tras un snapshot.
- Un reconteo cuenta como física distinta aunque conserve el mismo `conteo_detalle.id`; el cursor desempata por tiempo, tipo e ID.
- `next_cursor:string|null`, sin carga de todas las observaciones del día en una sola respuesta.

## 4. Cursores, validaciones y consistencia

- Paginación **keyset** por criterio autorizado descendente, con desempates estables; `limit` 1–100.
- Cursor opaco Base64 sobre JSON versionado (`v=1`), ligado a `action,site,sort,context,anchor,keys`. **No** es token de seguridad ni contiene credenciales; todas las páginas vuelven a pasar autorización. Su validez temporal máxima es **30 minutos**. El cliente debe reenviar el cursor **sin modificarlo**, y reiniciar la página al expirar.
- `anchor` corresponde al instante de primera lectura y permite acotar cambios recientes; **no implica snapshot MVCC inmutable entre RPC distintas**. Si grupos/estados/cortes cambian entre solicitudes, algunas filas pueden desaparecer o cambiar de posición. No prometer consistencia fuerte de scroll histórico entre transacciones.
- `risk` ordena por riesgo/valor/diferencia descendente, con desempates por valor/diferencia/ID. `episodes` usa importancia, recurrencia o persistencia y sus desempates. `day_observations` por hora física/tipo/ID descendente.
- Si se envía campo inesperado, payload no objeto, sitio inválido/inactivo, rango imposible, fecha inexistente, limit fuera de 1–100 o cursor incompatiblemente reutilizado, la función **lanza excepción**, no envelope de éxito.

**Errores con código literal como mensaje de excepción:**

`SOLOG_AUTH_REQUIRED`, `SOLOG_USER_DISABLED`, `SOLOG_ADMIN_ROLE_REQUIRED`, `SOLOG_INVALID_PAYLOAD`, `SOLOG_INVALID_ACTION`, `SOLOG_INVALID_SITE`, `SOLOG_SITE_FORBIDDEN`, `SOLOG_METRICS_INVALID_DATE`, `SOLOG_METRICS_INVALID_RANGE`, `SOLOG_METRICS_INVALID_LIMIT`, `SOLOG_METRICS_INVALID_SORT`, `SOLOG_METRICS_INVALID_CURSOR`.

La invocación `service_role` **no evita por sí misma** la verificación de `auth.uid()`; una llamada sin identidad autorizada devuelve `SOLOG_AUTH_REQUIRED`.

## 5. Validación y límites de congelación

- Implementación y helpers desplegados en Supabase, acciones y JSON contrastados mediante SQL, y control de acceso simulado sobre identidades de rol con rollback.
- **No existe usuario admin/moderador activo** a fecha de implementación; la prueba real autenticada desde navegador debe completarse cuando el usuario autorice su activación. No modificar usuarios por iniciativa del implementador.
- El frontend no debe leer `inventario` directamente, suponer que calidad `no_data` equivale a cero, recalcular riesgo ni mezclar hora física y turno de sesión.
- El preflight frontend, baseline y plan de Codex se harán **después** de que este contrato sea aceptado/congelado. Los deltas posteriores preservarán toda decisión no sustituida explícitamente.
