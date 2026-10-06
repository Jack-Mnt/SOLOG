# SOLOG — Backend Admin Control — Fase 3 Validación Global V1

**Estado:** COMPLETADA / VALIDADA TÉCNICAMENTE
**Fecha:** 6 de octubre de 2026
**Proyecto:** SOLOG
**Clasificación:** Nivel C — validación backend global
**Rama:** `admin-work`

## 1. Autoridad

Fuente primaria vigente:

`docs/SOLOG_Backend_Admin_Control_Contrato_V1.md`

Delta de validación vigente:

`docs/SOLOG_Backend_Admin_Control_Validacion_Delta_V1.md`

Este reporte documenta evidencia y una corrección de conformidad contractual detectada durante Fase 3. No rediseña Control.

## 2. Resultado general

La superficie backend de Control queda técnicamente validada para iniciar la adaptación frontend.

Superficie pública vigente:

```text
public.rpc_solog_admin_control_v1
  - control_groups
  - control_chronology_view

public.rpc_solog_control_export_v2
```

La RPC eliminada:

```text
public.rpc_solog_operational_v2
```

continúa ausente y no fue restaurada.

## 3. Corrección detectada en Fase 3

Se detectó una desviación heredada del helper anterior:

`control_groups` aceptaba payload sin `period` y asumía implícitamente `today`.

La fuente primaria V1 exige `period` explícito.

Se corrigió `inventario.solog_control_groups_v10` para que un `period` ausente o vacío responda:

```text
SOLOG_INVALID_DATE_RANGE
```

Validación posterior:

- period ausente → error esperado;
- `today` explícito → respuesta correcta sin regresión.

Migración desplegada:

```text
20261006102118
solog_admin_control_strict_period_guard_v1
```

Repositorio:

`supabase/migrations/20261006102118_solog_admin_control_strict_period_guard_v1.sql`

## 4. Validación de datos

Ventana de Control evaluada:

```text
2026-08-23 → 2026-10-06
45 fechas calendario
```

Sobre 1,400 registros `conteo_detalle` dentro de esa ventana:

- `grupo_conteo_id IS NULL`: 0;
- `diferencia IS NULL`: 0;
- `valor_diferencia IS NULL`: 0;
- estados fuera de `Coincide | Recontar | Confirmada | Inconsistente`: 0;
- `Confirmada/Inconsistente` sin datos completos de reconteo: 0.

No se detectaron datos reales incompatibles con los shapes públicos congelados.

## 5. control_groups

### 5.1. Períodos

Se validó:

- `today`;
- `last_week`;
- `current_biweekly`;
- `previous_biweekly`;
- `custom`.

Caso Casuarinas al 2026-10-06:

```text
today               2026-10-06 → 2026-10-06
last_week           2026-09-30 → 2026-10-06
current_biweekly    2026-10-01 → 2026-10-15
previous_biweekly   2026-09-16 → 2026-09-30
custom máximo       2026-08-23 → 2026-10-06
```

### 5.2. Matriz de validación

Resultado:

```text
10 / 10 casos aprobados
```

Casos:

- custom 1 fecha → success;
- custom 45 fechas → success;
- custom 46 fechas → `SOLOG_INVALID_DATE_RANGE`;
- fecha futura → `SOLOG_INVALID_DATE_RANGE`;
- rango invertido → `SOLOG_INVALID_DATE_RANGE`;
- period ausente → `SOLOG_INVALID_DATE_RANGE`;
- campo extra → `SOLOG_INVALID_PAYLOAD`;
- grupo inválido → `SOLOG_INVALID_GROUP`;
- período legacy `previous_biweekly` en cronología → `SOLOG_INVALID_CHRONOLOGY_PERIOD`;
- campo extra en cronología → `SOLOG_INVALID_PAYLOAD`.

### 5.3. Unicidad

Caso Cutervo, custom 45 fechas:

```text
items             488
group_id únicos   488
case_id únicos    488
```

Estados del resultado:

```text
Coincide        406
Recontar         58
Confirmada       18
Inconsistente     6
```

No se observaron duplicados por grupo.

## 6. Cronología

### 6.1. Casos reales

Se verificó:

- grupo con eventos en ambos períodos;
- grupo con solo `current_biweekly`;
- grupo con solo `previous_counts`;
- Coincide;
- Recontar;
- Confirmada;
- Inconsistente;
- evento histórico Recontado;
- valorización backend;
- período vacío con `latest_unit_price = null`.

Ejemplos estructurales reales:

```text
current_only:
  current events  = 3
  previous events = 0

previous_only:
  current events  = 0
  previous events = 8
```

La cronología de 8 eventos mantuvo:

- 8 `row_id` únicos;
- orden reciente → antiguo correcto.

### 6.2. Ventana previous_counts

La regla validada permanece:

```text
from = today_lima - 44 días
to   = día anterior al inicio de la quincena actual
```

El número de fechas incluidas varía según posición y longitud del mes.

Casos sintéticos validados:

```text
2026-10-01 → 44 fechas
2026-10-15 → 30 fechas
2026-10-16 → 44 fechas
2026-10-31 → 29 fechas
2026-02-28 → 32 fechas
```

Por tanto, la referencia descriptiva previa de “aprox. 30–44 fechas” debe leerse como aproximación. En meses de 31 días puede existir una ventana de 29 fechas.

Esto no cambia el contrato: el límite autoritativo continúa siendo las últimas 45 fechas incluyendo hoy y todo lo anterior a la quincena actual dentro de ese horizonte.

### 6.3. Casos cruzando quincena

Existen 7 casos cuyo `contado_at` pertenece al histórico anterior y cuyo `recontado_at` ocurrió después del 1 de octubre.

La pertenencia de `previous_counts` se determina por el conteo/caso de origen. La cronología conserva el caso completo, incluida su resolución posterior.

No se reinterpretan estos registros como un nuevo caso de la quincena actual.

### 6.4. Casos no observables actualmente

No existe en los datos actuales de 45 días:

- un grupo con múltiples precios históricos;
- un `conteo_detalle` cuyo `grupo_conteo_id` ya no exista en `grupos_conteo`.

Las ramas de cambio histórico de precio y fallback de nombre/categoría permanecen implementadas y contractualmente cubiertas, pero no se marcan como validadas mediante evidencia real en esta fase.

## 7. Exportación

`rpc_solog_control_export_v2` continúa separado y sin rediseño.

### Casuarinas — quincena actual V4

```text
filas             486
payload aprox.    204,820 bytes

source:
initial           470
recount            16
posterior            0
```

Estados:

```text
Coincide          431
Recontar           38
Confirmada         13
Inconsistente       4
```

La ausencia de `posterior` en datos V4 confirma que export no está aplicando la resolución automática legacy a los casos nuevos.

### Cutervo — quincena anterior legacy

```text
filas             906
payload aprox.    380,960 bytes

source:
initial           836
recount            63
posterior            7
```

La rama `posterior` permanece únicamente para compatibilidad histórica.

Período inválido → `SOLOG_EXPORT_PERIOD_INVALID`.

## 8. Autorización y seguridad

Se validó:

- sin sesión → `SOLOG_AUTH_REQUIRED`;
- Admin/Moderador deshabilitado → `SOLOG_USER_DISABLED`;
- usuario Cajero → `SOLOG_ADMIN_ROLE_REQUIRED`;
- sede inexistente/no permitida → `SOLOG_SITE_FORBIDDEN`;
- action desconocida → `SOLOG_INVALID_ACTION`;
- `anon` no tiene EXECUTE;
- camino exitoso bajo rol `authenticated` funciona.

Para probar el camino autenticado exitoso se activó temporalmente un usuario administrativo dentro de una transacción y se terminó con `ROLLBACK`.

No quedó ningún Admin/Moderador habilitado de forma persistente.

`authenticated` no tiene `USAGE` directo sobre schema `inventario`.

ACL:

### Helpers / cleanups

Solo `postgres`:

- `solog_control_groups_v10`;
- `solog_control_chronology_view_v1`;
- `cleanup_snapshot_stock`;
- `cleanup_solog_operaciones`.

### RPC públicas

EXECUTE para `authenticated` / `service_role` según contrato:

- `rpc_solog_admin_control_v1`;
- `rpc_solog_control_export_v2`;
- `rpc_solog_admin_incidents_v2`.

Todas usan `search_path=''`; las RPC públicas son `SECURITY DEFINER` y validan autorización internamente.

Advisors:

- sin findings de performance relacionados con estos objetos;
- warnings `authenticated_security_definer_function_executable` en las RPC públicas, esperados por el diseño de RPC autenticada con `SECURITY DEFINER`.

Referencia del advisor:

[Supabase Database Linter — authenticated SECURITY DEFINER function](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

## 9. Performance

### control_groups — peor caso observado

Cutervo, custom 45 fechas:

```text
detalle origen      906 filas
resultado           488 grupos
payload             ~146,800 bytes
función completa    ~18.1 ms
```

Consulta base:

```text
~1.87 ms
54 shared hit blocks
0 reads
0 temp blocks
```

PostgreSQL eligió Seq Scan sobre `conteo_detalle` porque el dataset actual es pequeño y prácticamente toda la tabla está dentro de la ventana. El coste real observado es bajo.

No se justifica un índice nuevo.

### chronology previous_counts — grupo más cargado observado

```text
8 eventos
payload             ~1,768 bytes
función completa    ~10.6 ms
consulta base       ~0.29 ms
```

La consulta base usa:

`idx_conteo_detalle_grupo_contado`

Sin temp blocks ni reads físicos.

No se justifica un índice nuevo.

### export — peor caso observado

Cutervo, quincena anterior:

```text
906 filas
~380,960 bytes
~29.6 ms
```

Es una operación explícita bajo demanda y su coste actual es adecuado.

## 10. Retención y jobs

Estado posterior a Fase 2:

```text
snapshot_stock total       970
snapshot_stock >12 h         0

solog_operaciones total      14
solog_operaciones >3 días     0
```

Jobs activos:

```text
conexion_cleanup_snapshot_stock
30 8,20 * * *

solog_cleanup_operations
0 9 * * *
```

No se modificó ni se limpia físicamente:

- `conteos`;
- `conteo_detalle`.

## 11. Índices

Decisión posterior a EXPLAIN:

**no crear índices nuevos para Control en esta fase.**

Los planes y tiempos observados no justifican aumentar coste de escritura/mantenimiento.

## 12. Estado final de Fase 3

**Fase 3 — COMPLETADA / VALIDADA TÉCNICAMENTE.**

Backend queda listo para consumo frontend.

Queda fuera de esta fase:

- smoke humano;
- Dashboard;
- retención física de conteos;
- cualquier refactor no relacionado.

El smoke humano permanece diferido al smoke global posterior a Dashboard según:

`docs/SOLOG_Backend_Admin_Control_Validacion_Delta_V1.md`

Siguiente fase:

**Fase 4 — adaptación frontend Control al contrato backend ya desplegado.**
