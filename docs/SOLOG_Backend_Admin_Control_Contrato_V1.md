# SOLOG — Backend Admin Control — Contrato V1

**Estado:** CONGELADO — FUENTE PRIMARIA PARA IMPLEMENTACIÓN  
**Fecha:** 6 de octubre de 2026  
**Proyecto:** SOLOG  
**Clasificación:** Nivel C — backend / contrato Admin / retención técnica / integración frontend  
**Rama:** `admin-work`  
**HEAD de baseline al congelar:** `ee6197064c3555b4c2c576104bfe36794646dca2`  
**Proyecto Supabase:** `fvtohxvcvsflzmftgfzs`

---

## 1. Autoridad y precedencia

Esta es la **fuente primaria única del bloque de adaptación de Admin > Control al backend Motor V4**.

Precedencia para este alcance:

1. `docs/SOLOG_Backend_Admin_Control_Contrato_V1.md` — autoridad para contrato backend de Control, ventanas históricas, cronología, integración y retención técnica incluida en este bloque.
2. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md` — autoridad funcional del Motor V4.
3. `docs/SOLOG_Backend_Contrato_Cajero_V4.md` — autoridad sobre el contrato y runtime Cajero V4.
4. `docs/SOLOG_UI_Admin_Composicion_Tablas_V1.md` — autoridad de composición de la tabla principal de Control.
5. `docs/SOLOG_UI_Admin_Drawers_Fase8_2A_Composicion_V2.md` — autoridad de composición visual del Drawer de cronología.
6. `docs/SOLOG_Backend_Admin_Drawers_Fase8_2B_Optimizacion_Egress_V1.md` — referencia histórica para shapes compactos de cronología que esta fuente conserva o reemplaza explícitamente.
7. `docs/SOLOG_Backend_Doble_Cobertura_Impacto_Admin_V2.md` — handoff histórico/vigente únicamente para recordar el impacto del cutover V4; esta fuente prevalece para Control.

Ante contradicciones:

- Motor/Cajero V4 no se reinterpreta desde Control.
- Esta fuente prevalece sobre referencias anteriores a `public.rpc_solog_operational_v2`, porque esa RPC fue retirada.
- Las fuentes UI anteriores continúan vigentes para composición visual mientras esta fuente no las reemplace explícitamente.
- Dashboard no forma parte de esta fuente ni puede inferirse a partir de ella.

---

## 2. Objetivo

Reconectar y adaptar **Control** al backend vigente después del cutover V4 sin rediseñar su UX ni reconstruir reglas del Motor en frontend.

El bloque debe:

1. sustituir la dependencia eliminada de `public.rpc_solog_operational_v2`;
2. exponer una RPC pública específica de Control;
3. conservar la tabla principal y sus filtros actuales;
4. limitar el histórico consultable de Control a 45 fechas calendario;
5. reemplazar la carga lazy de `Quincena anterior` en Cronología por `Conteos anteriores`;
6. preservar shapes históricos compactos y valorización autoritativa;
7. conservar la exportación actual sin rediseño;
8. reducir retención de datos técnicos que sí acumulan volumen;
9. no destruir todavía `conteos` ni `conteo_detalle`, porque su retención física dependerá del futuro bloque Dashboard;
10. mantener frontend como consumidor de decisiones backend, no como autoridad temporal o de estados.

---

## 3. Fuera de alcance

Queda explícitamente fuera de este bloque:

- definición o implementación de Dashboard;
- KPI de cobertura R1/R2 para Admin;
- métricas históricas de días/turnos/rondas para Dashboard;
- retención física de `inventario.conteos` y `inventario.conteo_detalle`;
- rediseño de tabla de Control;
- rediseño de filtros/chips/sort/paginación;
- cambio de ancho/composición del Drawer;
- reinterpretación de septiembre o historial pre-V4;
- cambio de lógica Motor V4;
- cambio de prioridad `review / coverage / daily`;
- refactors generales del Admin;
- corrección de deudas UX históricas no bloqueantes;
- cambios de RLS de `inventario.solog_session_runtime_groups`.

Cualquier necesidad de modificar alguno de estos puntos debe volver a definición antes de ampliar el alcance.

---

## 4. Baseline validado

### 4.1. Frontend actual

Control ya implementa y debe preservar:

- períodos:
  - `today`;
  - `last_week`;
  - `current_biweekly`;
  - `previous_biweekly`;
  - `custom`;
- búsqueda local por grupo;
- filtros locales:
  - Total;
  - Coinciden;
  - Recontar;
  - Confirmadas;
  - Inconsistentes;
- orden local;
- paginación local;
- tabla:
  - `Registrado | Grupo | Categoría | Estado | Diferencia | Valorizado | Detalle`;
- Drawer de cronología de 560 px;
- timeline reciente → antiguo;
- exportación quincenal actual.

El problema de runtime actual es que `adminRpc` todavía dirige `control_groups` y `control_chronology_view` a la RPC eliminada `rpc_solog_operational_v2`.

### 4.2. Backend reutilizable

Permanecen funciones internas válidas como baseline:

- `inventario.solog_control_groups_v10(...)`;
- `inventario.solog_control_chronology_view_v1(...)`.

Estas funciones trabajan sobre hechos preservados de:

- `inventario.conteos`;
- `inventario.conteo_detalle`;
- grupos/categorías;
- snapshots cuando la cronología necesita referencias históricas.

No dependen de las tablas legacy de cobertura eliminadas.

Los nombres/versiones de helpers internos **no forman parte del contrato público** y pueden modificarse o reemplazarse durante implementación si ello reduce deuda o permite validar el nuevo contrato. No deben quedar helpers muertos sin consumidor vigente demostrado.

---

## 5. Autoridad temporal

Zona horaria autoritativa:

`America/Lima`

El backend debe calcular con un único `generated_at` por request:

- fecha de hoy;
- quincena vigente;
- quincena anterior;
- cutoff de 45 fechas;
- ventana de `Conteos anteriores`.

El frontend no calcula estas ventanas para decidir qué datos son válidos.

### 5.1. Horizonte consultable de Control

Control expone como máximo **45 fechas calendario incluyendo hoy**.

Definición:

```text
today_lima = fecha de generated_at en America/Lima
history_cutoff = today_lima - 44 días
```

La ventana disponible es:

```text
[history_cutoff 00:00 Lima, mañana de today_lima 00:00 Lima)
```

Ejemplo para 2026-10-06:

```text
history_cutoff = 2026-08-23
última fecha consultable = 2026-10-06
```

Este límite es **funcional** para Control. No implica por ahora borrado físico de hechos más antiguos.

---

## 6. Superficie pública de Control

Se crea una RPC pública dedicada:

```text
public.rpc_solog_admin_control_v1(
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
) → jsonb
```

La RPC es `SECURITY DEFINER` con `SET search_path TO ''`.

Acciones públicas válidas:

```text
control_groups
control_chronology_view
```

No se recrea ni revive:

```text
public.rpc_solog_operational_v2
```

La exportación continúa separada en:

```text
public.rpc_solog_control_export_v2(p_payload jsonb)
```

### 6.1. Autorización

La RPC pública de Control debe validar:

- `auth.uid()` no nulo;
- usuario existente;
- `activo = true`;
- rol `admin` o `moderador`;
- payload objeto;
- `site_id` UUID;
- sede activa.

ACL esperada:

- `PUBLIC`: sin EXECUTE;
- `anon`: sin EXECUTE;
- `authenticated`: EXECUTE permitido.

Los helpers internos no se exponen directamente a `authenticated`.

---

## 7. Acción `control_groups`

### 7.1. Payload

```ts
type ControlPeriod =
  | "today"
  | "last_week"
  | "current_biweekly"
  | "previous_biweekly"
  | "custom";

type ControlGroupsPayload = {
  site_id: string;
  period: ControlPeriod;
  date_from?: string; // solo custom, YYYY-MM-DD
  date_to?: string;   // solo custom, YYYY-MM-DD
};
```

No se aceptan campos adicionales.

### 7.2. Resolución de período

`today`:

```text
today_lima → today_lima
```

`last_week`:

```text
today_lima - 6 días → today_lima
```

`current_biweekly`:

```text
1–15
o
16–fin de mes
```

`previous_biweekly`:

quincena inmediatamente anterior.

`custom`:

- `date_from` y `date_to` obligatorias;
- fechas ISO estrictas;
- `date_from <= date_to`;
- `date_to <= today_lima`;
- `date_from >= history_cutoff`;
- máximo 45 fechas inclusivas.

Cualquier rango custom fuera de la ventana devuelve:

```text
SOLOG_INVALID_DATE_RANGE
```

Los presets permanecen definidos por su semántica propia; todos se encuentran naturalmente dentro del horizonte de 45 fechas salvo la parte futura de la quincena actual, que simplemente no contiene hechos todavía.

### 7.3. Semántica de selección

La respuesta contiene **el caso más reciente de cada grupo dentro del período solicitado**.

Ranking por grupo:

```text
contado_at DESC
id DESC
```

No devuelve todos los eventos del período.

No calcula:

- cobertura;
- ronda;
- prioridad;
- next_action;
- runtime de sesión.

Control es una lectura histórica/administrativa de casos registrados, no una cola operacional del Cajero.

### 7.4. Respuesta

```ts
type ControlGroupItem = {
  case_id: string;
  group_id: string;
  group_name: string;
  category: string;
  origin_at: string;
  state: "Coincide" | "Recontar" | "Confirmada" | "Inconsistente";
  difference: number;
  valued_difference: number;
};

type ControlGroupsResponse = {
  contract_version: 2;
  generated_at: string;
  revisions: {
    operational: number;
  };
  site_id: string;
  period: {
    key: ControlPeriod;
    from: string;
    to: string;
  };
  items: ControlGroupItem[];
};
```

Los nombres históricos congelados en `conteo_detalle` tienen precedencia como fallback cuando el master data actual ya no represente el registro histórico.

### 7.5. Egress y paginación

El backend devuelve el conjunto completo de grupos resultantes.

No se agrega paginación/search/sort server-side en esta versión.

Motivo:

- una sede tiene aproximadamente 500 grupos;
- el helper ya reduce a una fila por grupo;
- el payload medido para ~481 grupos fue de ~146 KB;
- búsqueda, filtros, sort y paginación local actuales son adecuados a esta escala.

No se crean índices preventivos sin evidencia de `EXPLAIN (ANALYZE, BUFFERS)`.

---

## 8. Acción `control_chronology_view`

### 8.1. Payload

```ts
type ControlChronologyPeriod =
  | "current_biweekly"
  | "previous_counts";

type ControlChronologyPayload = {
  site_id: string;
  group_id: string;
  period: ControlChronologyPeriod;
};
```

El valor público:

```text
previous_biweekly
```

queda reemplazado para este Drawer por:

```text
previous_counts
```

### 8.2. Ventanas

#### `current_biweekly`

Desde el inicio de la quincena actual hasta el final de su ventana calendaria.

Los eventos futuros simplemente no existen.

#### `previous_counts`

Carga bajo demanda todos los conteos disponibles antes de la quincena actual y dentro del horizonte de Control:

```text
from = history_cutoff
to   = inicio_quincena_actual - 1 día
```

Ventana timestamp:

```text
[history_cutoff 00:00 Lima, inicio_quincena_actual 00:00 Lima)
```

Según el día de la quincena, normalmente representa entre aproximadamente 30 y 44 fechas anteriores.

Ejemplo para 2026-10-06:

```text
current_biweekly = 2026-10-01 → 2026-10-15
previous_counts  = 2026-08-23 → 2026-09-30
```

El frontend no calcula este rango.

### 8.3. Carga lazy

`current_biweekly` se carga al abrir el Drawer.

`previous_counts` se solicita únicamente al activar el switch:

```text
Conteos anteriores
```

La respuesta se cachea independientemente.

### 8.4. Respuesta

```ts
type ChronologyEvent =
  | {
      row_id: string;
      event_at: string;
      state: "Coincide";
      stock: number;
    }
  | {
      row_id: string;
      event_at: string;
      state: "Recontar" | "Recontado";
      physical: number;
      difference: number;
    }
  | {
      row_id: string;
      event_at: string;
      state: "Confirmada";
      difference: number;
      valued_difference: number;
    }
  | {
      row_id: string;
      event_at: string;
      state: "Inconsistente";
      theoretical: number;
      initial_difference: number;
      found_difference: number;
    };

type ControlChronologyViewResponse = {
  contract_version: 2;
  generated_at: string;
  revisions: {
    operational: number;
  };
  site_id: string;
  group: {
    id: string;
    name: string;
    category: string | null;
    latest_unit_price: number | null;
  };
  period: {
    key: "current_biweekly" | "previous_counts";
    from: string;
    to: string;
  };
  chronology: ChronologyEvent[];
};
```

### 8.5. Semántica preservada

Se mantiene:

- orden reciente → antiguo;
- `latest_unit_price` = precio histórico del evento más reciente contenido en esa respuesta;
- período sin eventos → `latest_unit_price = null`;
- valorización calculada autoritativamente en backend;
- frontend no reconstruye diferencias;
- fallback visible de precio:
  `current.latest_unit_price ?? previous.latest_unit_price`;
- shapes históricos por estado;
- evento `Recontado` mientras continúe formando parte del contrato histórico.

La nomenclatura histórica `Recontado` no se rediseña en este bloque.

### 8.6. Integridad

Un caso `Confirmada` o `Inconsistente` sin los datos de reconteo requeridos representa inconsistencia backend y debe responder:

```text
SOLOG_CHRONOLOGY_RECOUNT_MISSING
```

No se aproxima silenciosamente en frontend.

### 8.7. Historial pre-V4

El histórico anterior al 1 de octubre de 2026 se muestra con la semántica persistida con la que fue generado.

No se convierte retroactivamente a:

- Cobertura 1/2;
- nuevas reglas de prioridad;
- nuevas reglas V4 de resolución.

Las ramas de compatibilidad histórica necesarias pueden permanecer en las consultas mientras existan hechos legacy reales.

---

## 9. Exportación

Permanece vigente y separada:

```text
public.rpc_solog_control_export_v2
```

Períodos exportables:

```text
current_biweekly
previous_biweekly
```

No se amplía exportación a custom ni a 45 días en este bloque.

Se preservan:

- Resumen;
- Ajustes;
- Por recontar;
- Inconsistentes;
- Todas.

La rama histórica `source = posterior` puede conservarse para registros legacy. No representa una regla vigente del Motor V4 y no debe usarse para auto-resolver casos nuevos.

---

## 10. Integración frontend congelada

La implementación frontend debe ser mínima.

### 10.1. Routing RPC

`adminRpc` debe enrutar:

```text
control_groups
control_chronology_view
→ rpc_solog_admin_control_v1
```

`export` continúa en:

```text
rpc_solog_control_export_v2
```

No se modifica el routing de Dashboard en este bloque.

### 10.2. Tipos

Actualizar:

```ts
ControlChronologyPeriod =
  "current_biweekly" | "previous_counts"
```

El resto de shapes de Control se preserva salvo ajustes estrictamente necesarios para reflejar el contrato desplegado.

### 10.3. Rango custom

La validación frontend pasa de 92 a 45 fechas y no debe permitir fechas anteriores a `today - 44 días` ni posteriores a hoy.

La validación frontend es UX preventiva; backend continúa siendo autoridad.

### 10.4. Drawer

Se conserva:

- ancho 560 px;
- timeline único;
- orden más reciente → más antiguo;
- composición por estado;
- carga lazy;
- precio compacto superior.

El Footer cambia su texto de:

```text
Incluir quincena anterior
```

a:

```text
Conteos anteriores
```

El switch carga `previous_counts`.

### 10.5. Tabla principal

No cambia composición ni comportamiento visual.

### 10.6. Caché

Se conserva la arquitectura actual de `AdminStore`.

Keys conceptuales:

```text
control_groups:
site_id + period + custom dates

chronology:
site_id + group_id + period
```

La política histórica de preservación de Control dentro de la sesión Admin se mantiene por ahora. La posible obsolescencia de una entrada ya cargada cuando llegan conteos nuevos es deuda previa y no se corrige silenciosamente en este bloque.

---

## 11. Retención técnica incluida en este bloque

Estas decisiones son técnicas y globales, pero se congelan aquí porque fueron necesarias durante el preflight de Control.

No implican la futura política histórica de Dashboard.

### 11.1. `snapshot_stock`

Objetivo:

```text
TTL lógico = 12 horas
```

Producción esperada:

```text
nuevo snapshot por sede aproximadamente cada 2–4 horas
```

Antes de reducir el TTL debe eliminarse la dependencia vigente de:

```text
rpc_solog_admin_incidents_v2
action = propose_delete
→ snapshot_stock
```

La validación de evidencia actual de `producto_ausente` pasa a usar `inventario.stock_actual`.

Regla mínima esperada:

- misma sede;
- mismo `c_interno`;
- `stock_actual.producto_eliminado = true`;
- `stock_actual.snapshot_id = incidencia.ultimo_snapshot_id`;
- snapshot referenciado confirmado;
- si existe un snapshot vigente más nuevo que contradice la incidencia, la acción debe fallar como `SOLOG_INCIDENT_NOT_CURRENT`.

Una vez validado el desacoplamiento:

```text
inventario.cleanup_snapshot_stock()
→ eliminar capturado_at < now() - interval '12 hours'
```

El Cron `conexion_cleanup_snapshot_stock` pasa a ejecutarse cada 12 horas.

Horario objetivo, sin DST en Lima:

```text
03:30 Lima
15:30 Lima
```

equivalente a:

```cron
30 8,20 * * *
```

Retención efectiva esperada con ese cadence:

aproximadamente 12–24 horas.

### 11.2. `solog_operaciones`

`inventario.solog_operaciones` es infraestructura de idempotencia/replay, no historial de negocio.

Horizonte congelado:

```text
3 días / 72 horas
```

El replay/idempotency ledger solo garantiza conservación durante esa ventana.

Se crea un cleanup específico que elimina operaciones cuyo:

```text
created_at < now() - interval '3 days'
```

Esto incluye operaciones incompletas obsoletas de más de 3 días; no existe un flujo válido de SOLOG cuya operación deba permanecer en progreso durante ese tiempo.

El cleanup se ejecuta diariamente.

No se usa esta tabla para métricas ni Dashboard.

### 11.3. `conteos` y `conteo_detalle`

No se crea todavía cleanup físico.

Regla congelada para este bloque:

```text
Control consulta 45 fechas
≠
PostgreSQL destruye datos a los 45 días
```

Los hechos más antiguos pueden permanecer almacenados aunque Control no los exponga.

La retención física solo podrá definirse durante el futuro bloque Dashboard, después de decidir:

- métricas históricas;
- horizonte de tendencias;
- necesidad o no de agregados persistentes;
- conservación por día/turno/ronda.

### 11.4. Resto de tablas

No se añade TTL por ahora a tablas cuyo crecimiento observado no justifica nueva complejidad.

En particular no se modifica por antigüedad:

- `auditoria`;
- `incidencias`;
- `exclusiones_incidencias`;
- `cambios_catalogo`;
- `catalogo_supresiones_evidencia`;
- `solog_catalog_publications`;
- `versiones_catalogo`;
- `catalogo_version_skus`;
- `snapshots`;
- `stock_actual`;
- `estado_stock_grupo`;
- `solog_revisiones`.

`solog_session_runtime_groups` continúa limpiándose por lifecycle de sesión, no por TTL.

---

## 12. Errores públicos relevantes

La RPC de Control debe usar/propagar como mínimo:

```text
SOLOG_AUTH_REQUIRED
SOLOG_USER_DISABLED
SOLOG_ADMIN_ROLE_REQUIRED
SOLOG_INVALID_PAYLOAD
SOLOG_INVALID_ACTION
SOLOG_INVALID_SITE
SOLOG_SITE_FORBIDDEN
SOLOG_INVALID_DATE_RANGE
SOLOG_INVALID_GROUP
SOLOG_INVALID_CHRONOLOGY_PERIOD
SOLOG_CHRONOLOGY_RECOUNT_MISSING
```

Export conserva además sus errores contractuales actuales, incluyendo:

```text
SOLOG_EXPORT_PERIOD_INVALID
```

No se introducen aproximaciones frontend ante errores de integridad.

---

## 13. Seguridad

Requisitos:

1. ninguna tabla de `inventario` se expone directamente para implementar Control;
2. la RPC pública valida identidad, rol y sede;
3. los helpers internos mantienen EXECUTE restringido;
4. cualquier función `SECURITY DEFINER` pública nueva debe revocar EXECUTE de `PUBLIC` y `anon`;
5. `search_path` explícitamente vacío;
6. ejecutar advisors de seguridad después del DDL;
7. no modificar RLS de `solog_session_runtime_groups` dentro de este bloque.

El finding existente de RLS deshabilitado en `solog_session_runtime_groups` queda registrado como asunto independiente; no se corrige sin un bloque específico porque activar RLS sin políticas compatibles puede bloquear el Motor.

---

## 14. Casos límite obligatorios

Backend debe validar al menos:

### Control groups

- hoy sin registros;
- período con una sola fila;
- varios casos del mismo grupo en el período → solo el más reciente;
- grupo renombrado/desactivado con nombre histórico congelado;
- custom de una fecha;
- custom de exactamente 45 fechas;
- custom de 46 fechas → error;
- custom anterior a `history_cutoff` → error;
- custom con fecha futura → error;
- rango invertido → error;
- sede inválida/inactiva;
- usuario sin rol Admin/Moderador.

### Cronología

- grupo sin eventos en quincena actual;
- eventos solo en `previous_counts`;
- eventos en ambos períodos;
- `previous_counts` vacío;
- cambio histórico de precio;
- Coincide;
- Recontar;
- Coincide por reconteo;
- Confirmada;
- Inconsistente;
- registro legacy pre-V4 compatible;
- Confirmada/Inconsistente incompleta → `SOLOG_CHRONOLOGY_RECOUNT_MISSING`.

### Retención

- `propose_delete` funciona sin depender de `snapshot_stock`;
- evidencia vigente en `stock_actual` permite la acción;
- evidencia obsoleta la bloquea;
- cleanup de `snapshot_stock` no rompe Motor/Cajero/Incidencias;
- cleanup de `solog_operaciones` conserva filas <3 días;
- elimina filas >3 días;
- no quedan consumidores que esperen replay >72 h.

---

## 15. Performance

Antes de añadir índices se debe medir:

- `control_groups` con ventana custom de 45 fechas;
- `control_chronology_view` para un grupo con todo `previous_counts`;
- export actual.

Usar:

```text
EXPLAIN (ANALYZE, BUFFERS)
```

No crear índices preventivamente si los planes y la escala real siguen siendo adecuados.

Escala de referencia observada:

- ~500 grupos por sede;
- 5 sedes;
- respuesta principal de ~481 grupos ≈ 146 KB;
- retención funcional de 45 fechas no implica enviar todos los eventos en la tabla principal.

---

## 16. Validación requerida

### Backend

- contrato sintético de ambas acciones;
- auth/roles/sede;
- ventanas `America/Lima`;
- límite 45 fechas;
- shapes;
- históricos V4 y legacy;
- export sin regresión;
- retención;
- jobs Cron;
- advisors security/performance;
- revisión de grants;
- medición de queries/payload.

### Frontend

- tests dirigidos de payload/response;
- límite custom de 45 fechas;
- routing hacia `rpc_solog_admin_control_v1`;
- `previous_counts`;
- texto `Conteos anteriores`;
- lazy loading;
- caché;
- tabla/filtros/sort/paginación sin regresión.

### Global

- suite;
- lint;
- build;
- `git diff --check`;
- smoke humano de Control;
- inspección de Network para:
  - RPC nueva;
  - payloads correctos;
  - ausencia de requests duplicados innecesarios.

---

## 17. Criterios de aceptación

Control queda listo para cierre cuando exista evidencia de que:

1. no depende de `rpc_solog_operational_v2`;
2. `control_groups` funciona mediante la RPC dedicada;
3. ningún custom sale de las últimas 45 fechas;
4. tabla/filtros/sort/paginación conservan comportamiento;
5. cronología actual conserva su composición;
6. `Conteos anteriores` carga lazy todo el rango histórico disponible previo a la quincena actual;
7. frontend no calcula autoritativamente la ventana de `previous_counts`;
8. estados/diferencias/valorizado provienen del backend;
9. exportación continúa funcionando sin reinterpretar Motor V4;
10. `propose_delete` deja de depender de `snapshot_stock`;
11. `snapshot_stock` usa TTL 12 h y cleanup cada 12 h;
12. `solog_operaciones` usa horizonte 3 días;
13. no se elimina físicamente `conteos` ni `conteo_detalle`;
14. no se modifica Dashboard;
15. validaciones técnicas pasan;
16. smoke humano de Control pasa.

---

## 18. Estado documental

Esta V1 queda **CONGELADA**.

Documentación anterior:

- composición de tabla Control → vigente para UI;
- composición Drawer 8.2A → vigente para UI;
- contrato Cronología 8.2B → histórico/reemplazado únicamente donde esta V1 cambia `previous_biweekly` por `previous_counts` y la superficie pública;
- referencias a `rpc_solog_operational_v2` → históricas/no vigentes;
- `SOLOG_Backend_Doble_Cobertura_Impacto_Admin_V2.md` → handoff histórico para Admin; esta V1 prevalece para Control.

Dashboard permanece deliberadamente sin definir en este bloque.

Cualquier cambio posterior sobre estas decisiones debe documentarse como delta explícito y conservar vigente todo lo que el delta no reemplace.
