# SOLOG — Contratos Backend de Optimización Global V10

**Estado:** DESPLEGADO Y VALIDADO — BACKEND V10 VIGENTE  
**Fecha:** 2026-09-08  
**Proyecto Supabase:** `PuertoRicoOnline` (`fvtohxvcvsflzmftgfzs`)  
**Nivel:** C — backend / contrato / Control  
**API envelope:** `contract_version = 2`  
**Fuente primaria para este cambio:** este documento  

> V10 es un delta de V9 centrado exclusivamente en el módulo **Control**. Todo lo definido por V9 y sus contratos heredados continúa vigente salvo donde V10 lo reemplace expresamente.

---

## 1. Precedencia y estado documental

Para la implementación de este cambio:

1. **`SOLOG_Backend_Contratos_Optimizacion_Global_V10.md` — FUENTE PRIMARIA DEL CAMBIO**
2. `SOLOG_Backend_Contratos_Optimizacion_Global_V9.md` — vigente para todo lo no reemplazado por V10.
3. Contratos V8 e inferiores — históricos/heredados según su precedencia previa.
4. `SOLOG_Decisiones_Congeladas_Optimizacion_Global.md` — referencia funcional general.

V10 fue desplegado y validado el 2026-09-08. **V10 pasa a ser la fuente vigente del contrato backend/frontend para Control**. V9 continúa vigente para todo lo no reemplazado expresamente por V10.

---

## 2. Objetivo

Rediseñar las lecturas de **Control** para reducir egress y alinear el contrato con la necesidad operativa real:

- la tabla principal no necesita todos los conteos;
- necesita **una fila por grupo**, con el último caso relevante del grupo dentro del período consultado;
- Estado, búsqueda y paginación se resolverán en frontend sobre ese dataset;
- la cronología completa se solicitará únicamente al abrir el detalle (`Eye`);
- la cronología será quincenal y no dependerá del período seleccionado en la tabla principal;
- por defecto se solicitará la quincena actual y, bajo demanda, podrá solicitarse la quincena anterior.

---

## 3. Principios congelados

### 3.1. Tabla principal

La unidad de lectura es:

```text
sede + período
```

El backend devuelve una sola vez el dataset completo para esa combinación.

El frontend debe resolver localmente:

- filtro por Estado;
- búsqueda por nombre de grupo;
- resumen de estados;
- paginación visual.

No deben generarse consultas backend adicionales por cambiar Estado, escribir una búsqueda o cambiar de página dentro del dataset ya obtenido.

### 3.2. Caché

La caché frontend existente debe poder reutilizar una respuesta mientras permanezca activa la sesión/página Admin.

La clave funcional del listado será:

```text
site_id + period + date_from/date_to cuando period=custom
```

No habrá revalidación automática obligatoria.

La recarga completa del Admin puede descartarla y solicitar datos frescos.

### 3.3. Detalle

La cronología del `Eye` es independiente del período de la tabla principal.

Su unidad de lectura es:

```text
site_id + group_id + biweekly_period
```

Períodos permitidos:

- `current_biweekly`
- `previous_biweekly`

Por defecto, el frontend solicitará `current_biweekly`.

La quincena anterior se solicitará solo cuando el usuario lo pida y podrá reutilizarse desde caché si ya fue descargada.

---

## 4. Estrategia de compatibilidad y despliegue

V10 **no reemplazará inmediatamente** las acciones actualmente consumidas por el frontend.

Dentro de `public.rpc_solog_operational_v2` se agregarán acciones nuevas:

- `control_groups`
- `control_chronology`

Durante la transición se conservarán temporalmente:

- `control_page`
- `control_detail`

Motivo:

> El backend debe poder desplegarse y validarse antes de que Codex migre el frontend, sin romper el Control actualmente publicado.

Por tanto:

1. desplegar backend con las dos acciones nuevas;
2. validar sintéticamente y contra datos reales seguros;
3. congelar backend desplegado;
4. migrar frontend a las acciones nuevas;
5. validar frontend;
6. retirar `control_page` y `control_detail` únicamente en una limpieza posterior explícitamente aprobada.

`contract_version` del envelope continúa en `2` porque el cambio es aditivo durante la transición y las superficies existentes no se modifican todavía.

---

# 5. Acción `control_groups`

## 5.1. RPC

```text
public.rpc_solog_operational_v2(
  p_action = 'control_groups',
  p_payload = ...
)
```

## 5.2. Autorización

Se conserva la autorización actual de `rpc_solog_operational_v2`:

- usuario autenticado;
- usuario activo;
- rol `admin` o `moderador`;
- `site_id` debe corresponder a una sede activa autorizada por el contrato Admin.

Errores existentes de autenticación/autorización se conservan.

## 5.3. Payload

```ts
type ControlPeriod =
  | "today"
  | "last_week"
  | "current_biweekly"
  | "previous_biweekly"
  | "custom";

interface ControlGroupsPayload {
  site_id: string;
  period: ControlPeriod;
  date_from?: string; // YYYY-MM-DD, requerido solo para custom
  date_to?: string;   // YYYY-MM-DD, requerido solo para custom
}
```

No forman parte de este payload:

- `state`;
- `search`;
- `page`;
- `page_size`.

## 5.4. Resolución de período

Se conserva la semántica vigente de Control:

- `today`: fecha actual en `America/Lima`;
- `last_week`: hoy y los 6 días anteriores;
- `current_biweekly`: helpers autoritativos `inventario.solog_periodo_desde` / `inventario.solog_periodo_hasta`;
- `previous_biweekly`: quincena inmediatamente anterior;
- `custom`: `date_from` / `date_to` explícitos.

El rango personalizado conserva la validación vigente:

- `date_from` y `date_to` válidos;
- `date_to >= date_from`;
- máximo 92 días.

El backend sigue siendo la fuente autoritativa de `period.from` y `period.to`.

## 5.5. Inclusión de grupos

La respuesta contiene **una fila por cada grupo que tenga al menos un `inventario.conteo_detalle` cuyo `contado_at` pertenezca al período solicitado para la sede**.

No se incluyen grupos sin ningún conteo originado en ese período.

Si un grupo fue contado varias veces dentro del período, se selecciona el caso con:

```text
contado_at DESC,
id DESC
```

por cada `grupo_conteo_id`.

La selección debe ser determinista.

### Regla temporal importante

La pertenencia de un caso al período se define por **`contado_at`**, no por `recontado_at`.

Si un conteo fue originado dentro del período y su resolución/reconteo ocurrió posteriormente, el caso sigue perteneciendo al período de su `contado_at` y debe reflejar su estado actualmente resuelto.

## 5.6. Semántica de la fila consolidada

Cada fila representa el **último caso originado en el período para ese grupo**, usando el estado vigente del registro en `conteo_detalle`.

Estados persistentes permitidos:

- `Coincide`
- `Recontar`
- `Confirmada`
- `Inconsistente`

`Recontado` **no es un estado persistente ni válido en `control_groups`**; existe únicamente como estado funcional de una fila de cronología.

## 5.7. Diferencia y valorizado del listado

En el listado principal se exponen los valores efectivos persistidos del caso consolidado:

```text
difference      = conteo_detalle.diferencia
valued_difference = conteo_detalle.valor_diferencia
```

Estos campos representan la diferencia efectiva vigente del caso según el motor y no deben recalcularse en frontend.

## 5.8. Respuesta

```ts
interface ControlGroupItem {
  case_id: string;
  group_id: string;
  group_name: string;
  category: string;
  origin_at: string; // contado_at
  state: "Coincide" | "Recontar" | "Confirmada" | "Inconsistente";
  difference: number;
  valued_difference: number;
}

interface ControlGroupsResponse {
  contract_version: 2;
  generated_at: string;
  revisions: {
    operational: number;
  };
  site_id: string;
  period: {
    key: ControlPeriod;
    from: string; // YYYY-MM-DD
    to: string;   // YYYY-MM-DD
  };
  items: ControlGroupItem[];
}
```

`items` no se pagina en backend.

Orden de respuesta recomendado y congelado:

```text
origin_at DESC,
case_id DESC
```

El frontend puede reordenar visualmente en una futura decisión UI sin alterar el contrato.

## 5.9. Summary

`control_groups` **no necesita devolver `summary`**.

Los contadores:

- Total;
- Coinciden;
- Recontar;
- Confirmadas;
- Inconsistentes;

se calculan en frontend sobre el dataset completo recibido.

Esto garantiza que seleccionar un Estado no convierta los demás contadores en cero.

---

# 6. Acción `control_chronology`

## 6.1. RPC

```text
public.rpc_solog_operational_v2(
  p_action = 'control_chronology',
  p_payload = ...
)
```

## 6.2. Payload

```ts
type ControlChronologyPeriod =
  | "current_biweekly"
  | "previous_biweekly";

interface ControlChronologyPayload {
  site_id: string;
  group_id: string;
  period: ControlChronologyPeriod;
}
```

No acepta:

- `today`;
- `last_week`;
- `custom`;
- el período actualmente aplicado en la tabla principal como sustituto implícito.

## 6.3. Resolución temporal

El backend calcula la quincena con los helpers autoritativos existentes.

La inclusión de casos se define por:

```text
conteo_detalle.contado_at dentro de la quincena solicitada
```

Un caso originado dentro de la quincena se devuelve completo aunque su `recontado_at` o resolución ocurra fuera de los límites temporales de esa quincena.

Esto evita partir un mismo caso entre dos cronologías distintas.

---

# 7. Modelo funcional de cronología

## 7.1. Objetivo

La cronología no devuelve una fila técnica con múltiples columnas opcionales del motor.

Debe devolver **filas funcionales directamente representables** por una tabla con esta semántica:

```text
Fecha | Hora | Estado | Teórico | Físico | Diferencia | Valorizado | Detalle del valorizado
```

La UI concreta del modal no forma parte de V10; solo se congela el comportamiento y los datos.

## 7.2. Estados de fila

```ts
type ControlChronologyRowState =
  | "Coincide"
  | "Recontar"
  | "Recontado"
  | "Confirmada"
  | "Inconsistente";
```

`Recontado` es **solo un estado de presentación de la cronología**. No modifica `inventario.conteo_detalle.estado_diferencia` ni el motor.

## 7.3. Estructura de fila

```ts
interface ControlChronologyRow {
  row_id: string;
  case_id: string;
  event_at: string;
  state: ControlChronologyRowState;
  theoretical: number;
  physical: number;
  difference: number;
  valued_difference: number;
  valuation: {
    unit_price: number;
    units_per_package: number | null;
    package_price: number | null;
  };
}
```

`row_id` debe ser estable y único dentro de la respuesta. Puede derivarse de `case_id + tipo_de_fila` sin requerir persistencia nueva.

`valuation` expone los datos congelados del caso necesarios para explicar posteriormente el cálculo mostrado. El frontend no debe sustituir el `valued_difference` autoritativo por un cálculo propio.

---

# 8. Transformación de cada caso a filas funcionales

## 8.1. Caso `Recontar`

Produce **una fila**:

```text
state       = Recontar
event_at    = contado_at
theoretical = stock_teorico
physical    = stock_fisico
difference  = stock_fisico - stock_teorico
valued_difference = solog_calcular_valor_diferencia(
  difference,
  precio,
  unidades_por_paquete,
  precio_paquete
)
```

## 8.2. Caso `Coincide` — coincidencia inicial

Cuando el conteo ya coincidió inicialmente y no existe una resolución posterior necesaria:

```text
state       = Coincide
event_at    = contado_at
theoretical = stock_teorico
physical    = stock_fisico
difference  = 0
valued_difference = 0
```

## 8.3. Caso `Coincide` — resuelto por reconteo

Si el estado final es `Coincide` y existe reconteo:

Produce **una sola fila**, correspondiente a la resolución final:

```text
state       = Coincide
event_at    = recontado_at
theoretical = stock_teorico_reconteo
physical    = stock_reconteo
difference  = stock_reconteo - stock_teorico_reconteo // 0
valued_difference = 0
```

No se emite una fila adicional `Recontado` para un caso cuyo estado final sea `Coincide`.

## 8.4. Caso `Coincide` — explicado por snapshot posterior

Si una diferencia inicial quedó explicada por el snapshot posterior y el caso terminó en `Coincide` sin reconteo:

Produce **una sola fila**:

```text
state       = Coincide
event_at    = timestamp autoritativo del snapshot que produjo la resolución
theoretical = stock_posterior
physical    = stock_fisico
difference  = 0
valued_difference = 0
```

Para `event_at` se utilizará `snapshots.capturado_at` del snapshot que produjo la coincidencia efectiva. No se inventará un timestamp frontend.

## 8.5. Caso `Confirmada`

Produce **dos filas**.

### Fila 1 — `Recontado`

Representa el conteo donde se identificó la diferencia.

Por decisión funcional congelada:

```text
state       = Recontado
event_at    = contado_at
theoretical = stock_teorico
physical    = stock_fisico
difference  = stock_fisico - stock_teorico
valued_difference = solog_calcular_valor_diferencia(
  difference,
  precio,
  unidades_por_paquete,
  precio_paquete
)
```

### Fila 2 — `Confirmada`

Representa el resultado del reconteo/evaluación que produjo la clasificación final:

```text
state       = Confirmada
event_at    = recontado_at
theoretical = stock_teorico_reconteo
physical    = stock_reconteo
difference  = stock_reconteo - stock_teorico_reconteo
valued_difference = solog_calcular_valor_diferencia(
  difference,
  precio,
  unidades_por_paquete,
  precio_paquete
)
```

La fila cronológica muestra la diferencia propia de esa evaluación (`diferencia_reconteo`).

Esto es deliberadamente distinto de `conteo_detalle.diferencia` cuando el motor de Confirmada conserva como diferencia efectiva la menor magnitud entre el conteo inicial y el reconteo.

La diferencia efectiva persistida continúa siendo autoritativa para el listado principal, exportaciones y ajustes; la cronología muestra los valores observados en cada etapa.

## 8.6. Caso `Inconsistente`

Produce **dos filas**.

### Fila 1 — `Recontado`

```text
state       = Recontado
event_at    = contado_at
theoretical = stock_teorico
physical    = stock_fisico
difference  = stock_fisico - stock_teorico
valued_difference = solog_calcular_valor_diferencia(...)
```

### Fila 2 — `Inconsistente`

```text
state       = Inconsistente
event_at    = recontado_at
theoretical = stock_teorico_reconteo
physical    = stock_reconteo
difference  = stock_reconteo - stock_teorico_reconteo
valued_difference = solog_calcular_valor_diferencia(...)
```

La segunda fila representa los valores resultantes de la evaluación que produjo la clasificación final.

---

# 9. Orden de la cronología

La respuesta debe estar ordenada de forma cronológica ascendente:

```text
event_at ASC,
case_id ASC,
orden_de_etapa ASC
```

Para un mismo caso de dos filas:

```text
Recontado
→ Confirmada / Inconsistente
```

El objetivo es permitir leer naturalmente la evolución del grupo durante la quincena.

---

# 10. Respuesta `control_chronology`

```ts
interface ControlChronologyResponse {
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
  };
  period: {
    key: "current_biweekly" | "previous_biweekly";
    from: string;
    to: string;
  };
  chronology: ControlChronologyRow[];
}
```

No existe paginación backend para una única cronología quincenal de un grupo.

---

# 11. Egress y responsabilidades frontend

## 11.1. Consulta de listado

Se consulta backend únicamente cuando cambia a una combinación de `sede + período` no presente en caché.

Una respuesta cacheada debe reutilizarse para:

- seleccionar badges de Estado;
- volver a `Total`;
- búsqueda por nombre;
- borrar búsqueda;
- navegar páginas locales;
- volver a un filtro Estado previamente usado.

## 11.2. Consulta de cronología

Al abrir `Eye`:

```text
si current_biweekly está en caché
→ reutilizar
si no
→ solicitar control_chronology(current_biweekly)
```

Al solicitar quincena anterior:

```text
si previous_biweekly está en caché
→ reutilizar
si no
→ solicitar control_chronology(previous_biweekly)
```

La caché de listado y la caché de cronología son scopes independientes.

---

# 12. Fuera de alcance

V10 no autoriza modificar:

- tablas de inventario;
- modelo de datos persistente;
- Motor V3;
- `rpc_solog_cashier_mutate_v2`;
- reglas de clasificación `Coincide/Recontar/Confirmada/Inconsistente`;
- reglas de diferencia efectiva del motor;
- exportación Excel;
- Dashboard;
- Cajero;
- Detalles;
- Incidencias;
- Dispositivos;
- Catálogo o Grupos;
- diseño visual final del modal de cronología.

No se requiere migración de datos.

---

# 13. Validaciones backend obligatorias

Antes de congelar V10 como desplegado, validar al menos:

## 13.1. `control_groups`

1. una sede + `today` devuelve máximo una fila por grupo;
2. un grupo con varios conteos en el período devuelve únicamente el último por `contado_at, id`;
3. `state/search/page/page_size` no forman parte del contrato nuevo;
4. el rango devuelto coincide con la lógica autoritativa existente;
5. `custom` conserva límite máximo de 92 días;
6. `difference` y `valued_difference` coinciden con los valores efectivos persistidos del caso seleccionado;
7. ningún grupo de otra sede puede aparecer;
8. respuesta determinista;
9. envelope/revisión válidos.

## 13.2. `control_chronology`

Validar casos sintéticos y reales para:

1. Coincide inicial → 1 fila;
2. Recontar → 1 fila;
3. Coincide resuelto por reconteo → 1 fila con datos de reconteo;
4. Coincide resuelto por snapshot posterior → 1 fila con datos de resolución;
5. Confirmada → 2 filas (`Recontado`, `Confirmada`);
6. Inconsistente → 2 filas (`Recontado`, `Inconsistente`);
7. `Recontado.event_at = contado_at`;
8. fila final de Confirmada/Inconsistente usa `recontado_at`;
9. la diferencia de la fila final coincide con `stock_reconteo - stock_teorico_reconteo`;
10. el valorizado de cada fila coincide con `inventario.solog_calcular_valor_diferencia` para la diferencia mostrada;
11. casos originados en la quincena permanecen completos aunque `recontado_at` caiga fuera de ella;
12. quincena actual y anterior no mezclan casos por `contado_at`;
13. orden cronológico ascendente correcto;
14. ningún grupo/sede ajeno puede filtrarse en la respuesta.

## 13.3. Compatibilidad

Mientras el frontend no haya migrado:

- `control_page` debe conservar su contrato actual;
- `control_detail` debe conservar su contrato actual;
- las demás acciones de `rpc_solog_operational_v2` no deben cambiar;
- `rpc_solog_control_export_v2` no debe cambiar;
- `contract_version=2` permanece.

---

# 14. Evidencia mínima de implementación backend

La fase backend debe registrar:

- definición desplegada de `rpc_solog_operational_v2`;
- acciones nuevas presentes;
- acciones antiguas preservadas durante transición;
- pruebas SQL dirigidas;
- comparación de conteos por grupo con consultas de control;
- ejemplos reales de cada estado disponible;
- validación de permisos;
- confirmación de ausencia de DDL de tablas;
- confirmación de ausencia de cambios en Motor V3;
- evaluación del tamaño aproximado de respuesta para una sede/quincena representativa.

---

# 15. Estado de implementación

Al congelar este documento:

- definición funcional: **APROBADA Y CONGELADA**;
- preflight frontend: **COMPLETADO**;
- preflight backend: **COMPLETADO**;
- contrato V10: **CONGELADO PARA IMPLEMENTACIÓN**;
- backend V10: **IMPLEMENTADO Y DESPLEGADO**;
- validación backend V10: **COMPLETADA**;
- frontend consumidor V10: **PENDIENTE**;
- smoke humano: **PENDIENTE**.

El siguiente paso es implementar y validar primero las acciones nuevas en Supabase. Codex no debe modificar backend para este bloque.


---

# 16. Evidencia de despliegue y validación — 2026-09-08

## 16.1. Migración aplicada

```text
solog_control_v10_grouped_read_and_chronology
```

La migración:

- añadió las acciones `control_groups` y `control_chronology` a `public.rpc_solog_operational_v2`;
- preservó `control_page`, `control_detail`, `shift_grid` y `daily_detail`;
- creó helpers internos `inventario.solog_control_groups_v10` y `inventario.solog_control_chronology_v10`;
- revocó `EXECUTE` público sobre ambos helpers internos;
- no modificó tablas, Motor V3, `rpc_solog_cashier_mutate_v2` ni exportación.

## 16.2. Validación `control_groups`

Caso representativo: Huaca, quincena actual.

```text
period: 2026-09-01 — 2026-09-15
items: 483
distinct group_id: 483
Coincide: 433
Recontar: 31
Confirmada: 15
Inconsistente: 4
```

Comparación directa contra `conteo_detalle` usando selección determinista por `grupo_conteo_id`, `contado_at DESC`, `id DESC`:

```text
expected_rows: 483
api_rows: 483
mismatches: 0
```

El límite de rango `custom` superior a 92 días fue rechazado con `SOLOG_INVALID_DATE_RANGE`.

Tamaño aproximado de la respuesta representativa:

```text
483 grupos
146188 bytes
≈ 142.8 KiB
```

## 16.3. Validación `control_chronology`

Caso real `Confirmada` validado:

```text
Recontado  -> event_at = contado_at, diferencia propia del conteo inicial
Confirmada -> event_at = recontado_at, diferencia = stock_reconteo - stock_teorico_reconteo
```

Ejemplo observado:

```text
Recontado:  theoretical=3, physical=13, difference=10, valued_difference=220
Confirmada: theoretical=3, physical=8,  difference=5,  valued_difference=110
```

Caso real `Inconsistente` validado:

```text
Recontado:     theoretical=114, physical=104, difference=-10, valued_difference=-420
Inconsistente: theoretical=114, physical=119, difference=5,   valued_difference=210
```

El orden cronológico ascendente y el orden de etapa fueron confirmados.

No existían casos reales disponibles de `Coincide` resuelto por snapshot posterior en el dataset actual al momento de validar; la rama contractual quedó implementada utilizando `snapshots.capturado_at` del `snapshot_posterior_id`.

## 16.4. Compatibilidad y permisos

Confirmado:

- `control_page` continúa respondiendo con `contract_version=2` y `page_size=100`;
- `control_detail` continúa respondiendo con `contract_version=2`;
- un usuario `moderador` puede ejecutar `control_groups`;
- un usuario `cajero` recibe `SOLOG_ADMIN_ROLE_REQUIRED`;
- los helpers internos V10 no tienen `EXECUTE` para `PUBLIC`.

## 16.5. Advisors

Se ejecutaron advisors de seguridad y rendimiento después de la migración. No apareció una advertencia nueva específica de las superficies V10. Persisten hallazgos preexistentes del proyecto sobre RLS, funciones `SECURITY DEFINER`, vistas y otros objetos ajenos a este cambio.

## 16.6. Estado final backend

- contrato V10: **VIGENTE**;
- backend V10: **DESPLEGADO Y VALIDADO**;
- compatibilidad frontend anterior: **PRESERVADA**;
- frontend consumidor de `control_groups` / `control_chronology`: **PENDIENTE**;
- retirada futura de `control_page` / `control_detail`: **NO AUTORIZADA EN ESTE BLOQUE**.
