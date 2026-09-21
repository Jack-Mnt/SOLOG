# SOLOG — Backend Admin Drawers — Fase 8.2B — Optimización de Egress V1

**Proyecto:** SOLOG  
**Estado:** CONGELADO / APROBADO PARA IMPLEMENTACIÓN  
**Fecha:** 2026-09-21  
**Clasificación:** Nivel C — backend / contratos / lógica de consulta  
**Rama:** `admin-work`

## 1. Autoridad y precedencia

Esta fuente es la **fuente primaria de Fase 8.2B** para el backend y los contratos optimizados de los tres Drawers cubiertos.

Precedencia para este alcance:

1. `docs/SOLOG_Backend_Admin_Drawers_Fase8_2B_Optimizacion_Egress_V1.md`
2. `docs/SOLOG_UI_Admin_Drawers_Fase8_2A_Composicion_V2.md`
3. `docs/SOLOG_UI_Admin_Dialogs_Fase8_Drawers_V1.md`
4. contratos backend vigentes no reemplazados explícitamente.

La V2 de 8.2A permanece congelada para composición UI. 8.2B no la rediseña; adapta las lecturas backend a esa UI.

Los contratos existentes `daily_detail`, `control_chronology`, `detail_sites` y `detail` permanecen vigentes para compatibilidad. Esta fase añade lecturas nuevas y no rompe consumidores actuales.

## 2. Objetivo

Reducir egress, tamaño de payload, filas y columnas innecesarias y procesamiento frontend de:

1. Detalle diario.
2. Cronología por producto.
3. Repeticiones de incidencias.

La optimización no puede degradar:

- precisión;
- semántica de estados;
- exactitud histórica;
- retry;
- caché;
- compatibilidad;
- idempotencia de mutaciones existentes.

`contract_version` permanece en **2**.

## 3. Baseline validado

Preflight de 8.2B:

- `daily_detail` devuelve actualmente todos los registros del día y el frontend filtra/pagina localmente.
- Caso medido: Cutervo 2026-09-18:
  - 371 filas;
  - ~126 476 bytes de JSON textual;
  - ejecución SQL del dataset base ~1.5–1.8 ms.
- una proyección híbrida de primera página por estado para Stock positivo se estimó en ~5.5 KB para el mismo día.
- `control_chronology` devuelve valuation completa por evento.
- muestra medida de 6 eventos:
  - actual ~2454 bytes;
  - proyección compacta ~1276 bytes.
- `detail_sites` ya agrega por las 5 sedes y su payload observado fue ~1274 bytes.
- no se justifican índices nuevos en la escala y planes actuales.

Estas cifras son comparativas de JSON textual generado por PostgreSQL, no mediciones exactas de bytes HTTP.

---

# 4. Detalle diario

## 4.1. Estrategia congelada

Se adopta una estrategia **híbrida**:

- una lectura bootstrap por `stock_class`;
- el bootstrap incluye:
  - counts autoritativos de Stock positivo y Stock 0 para los cuatro estados;
  - página 0, máximo 25 filas, de los cuatro estados del `stock_class` solicitado;
- las páginas posteriores se cargan bajo demanda;
- cambiar a un `stock_class` todavía no cargado realiza una nueva lectura bootstrap;
- volver a un stock/estado/página ya cacheado no genera una nueva lectura mientras la caché siga válida.

No se envía el dataset completo del día.

## 4.2. Clasificación de stock

Permanece congelada la definición de Fase 8:

- `stock_fisico original > 0` → `positive`;
- `stock_fisico original = 0` → `zero`.

La clasificación no se recalcula usando reconteo, snapshot posterior ni valor teórico.

## 4.3. Nueva acción: daily_detail_bootstrap

Se añade de forma aditiva a:

`public.rpc_solog_operational_v2(p_action, p_payload)`

### Payload

```ts
{
  site_id: string;
  origin_date: string; // YYYY-MM-DD
  stock_class: "positive" | "zero";
}
```

No se acepta `page_size`. El tamaño de página del contrato es fijo: **25**.

### Respuesta

```ts
{
  contract_version: 2;
  generated_at: string;
  revisions: {
    operational: number;
  };

  site_id: string;
  origin_date: string;
  stock_class: "positive" | "zero";
  page_size: 25;

  counts: {
    positive: {
      Coincide: number;
      Recontar: number;
      Confirmada: number;
      Inconsistente: number;
    };
    zero: {
      Coincide: number;
      Recontar: number;
      Confirmada: number;
      Inconsistente: number;
    };
  };

  views: {
    Coincide: CoincideItem[];
    Recontar: RecontarItem[];
    Confirmada: ConfirmadaItem[];
    Inconsistente: InconsistenteItem[];
  };
}
```

Cada array de `views` contiene como máximo 25 filas y representa la página 0.

## 4.4. Nueva acción: daily_detail_page

Se añade de forma aditiva a la misma RPC pública.

### Payload

```ts
{
  site_id: string;
  origin_date: string;
  stock_class: "positive" | "zero";
  state: "Coincide" | "Recontar" | "Confirmada" | "Inconsistente";
  page: number;
}
```

`page` es entero >= 0.

El frontend normal usa esta acción para páginas posteriores a la primera. La página 0 permanece disponible por contrato, aunque la ruta normal debe reutilizar el bootstrap ya cacheado.

### Respuesta

```ts
{
  contract_version: 2;
  generated_at: string;
  revisions: {
    operational: number;
  };

  site_id: string;
  origin_date: string;
  stock_class: "positive" | "zero";
  state: "Coincide" | "Recontar" | "Confirmada" | "Inconsistente";
  page: number;
  page_size: 25;
  items: StateSpecificItem[];
}
```

Una página fuera del rango devuelve `items: []`; no es un error de dominio.

Los counts no se repiten en esta respuesta. La autoridad para conteos y page count sigue siendo el bootstrap.

## 4.5. Shapes por estado

Base común:

```ts
type DailyBaseItem = {
  case_id: string;
  grupo: string;
};
```

### Coincide

```ts
type CoincideItem = DailyBaseItem & {
  stock: number;
};
```

`stock` representa el físico autoritativo vigente para la resolución del caso siguiendo la semántica ya existente de `daily_detail`.

### Recontar

```ts
type RecontarItem = DailyBaseItem & {
  physical: number;
  difference: number;
};
```

`physical` corresponde al conteo físico inicial. `difference` corresponde a la diferencia inicial autoritativa.

### Confirmada

```ts
type ConfirmadaItem = DailyBaseItem & {
  difference: number;
  valued_difference: number | null;
};
```

Debe conservar la semántica actual de Detalle diario:

- `difference` = diferencia final autoritativa persistida del caso;
- `valued_difference` = valorizado final autoritativo persistido.

No se sustituye automáticamente por la diferencia de reconteo si el motor actual conserva otra diferencia como valor final.

### Inconsistente

```ts
type InconsistenteItem = DailyBaseItem & {
  theoretical: number;
  initial_difference: number;
  found_difference: number;
};
```

Definición autoritativa:

```text
initial_difference =
  stock_fisico - stock_teorico

found_difference =
  stock_reconteo - stock_teorico_reconteo
```

`theoretical` corresponde al teórico del reconteo, que es el valor mostrado por la UI aprobada para la inconsistencia encontrada.

El placeholder frontend:

`initial = -difference`

queda explícitamente obsoleto en cuanto el nuevo contrato sea consumido.

## 4.6. Orden

Las filas de Detalle diario se ordenan de forma estable por:

1. `grupo`;
2. timestamp de conteo;
3. `case_id`.

Se conserva `case_id` porque un mismo grupo puede tener varios conteos el mismo día.

## 4.7. Campos que no viajan en las lecturas nuevas salvo que el estado los necesite

Se eliminan del shape universal:

- `grupo_id`;
- `estado`;
- `contado_at`;
- `recontado_at`;
- `stock_class` por fila;
- `source`;
- métricas no utilizadas por el estado activo.

El `summary` legacy de `daily_detail` no forma parte de los nuevos contratos; queda reemplazado funcionalmente por `counts`.

---

# 5. Cronología por producto

## 5.1. Estrategia congelada

- quincena actual: carga completa al abrir el Drawer;
- quincena anterior: continúa **lazy** y solo se solicita al activar el switch;
- cada quincena se cachea de forma independiente;
- no se pagina la cronología;
- el backend devuelve los eventos ya ordenados **más reciente → más antiguo**, igual que la UI congelada.

## 5.2. Nueva acción: control_chronology_view

Se añade de forma aditiva a:

`public.rpc_solog_operational_v2(p_action, p_payload)`

El `control_chronology` existente permanece sin cambios.

### Payload

```ts
{
  site_id: string;
  group_id: string;
  period: "current_biweekly" | "previous_biweekly";
}
```

### Respuesta

```ts
{
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
    key: "current_biweekly" | "previous_biweekly";
    from: string;
    to: string;
  };

  chronology: ChronologyEvent[];
}
```

## 5.3. Semántica de latest_unit_price

`latest_unit_price` es:

> el precio unitario histórico del evento más reciente contenido en esa respuesta.

No implica que todos los eventos del período hayan usado el mismo precio.

Si la quincena actual no tiene eventos:

```text
latest_unit_price = null
```

Cuando la quincena anterior se carga, el frontend puede resolver el precio visible con:

```ts
current.group.latest_unit_price ?? previous.group.latest_unit_price
```

No se reemplaza el precio histórico con el precio actual de catálogo.

## 5.4. Shapes por evento

Base:

```ts
type ChronologyBaseEvent = {
  row_id: string;
  event_at: string;
};
```

### Coincide

```ts
type ChronologyCoincide = ChronologyBaseEvent & {
  state: "Coincide";
  stock: number;
};
```

### Recontar

```ts
type ChronologyRecontar = ChronologyBaseEvent & {
  state: "Recontar";
  physical: number;
  difference: number;
};
```

### Recontado

```ts
type ChronologyRecontado = ChronologyBaseEvent & {
  state: "Recontado";
  physical: number;
  difference: number;
};
```

### Confirmada

```ts
type ChronologyConfirmada = ChronologyBaseEvent & {
  state: "Confirmada";
  difference: number;
  valued_difference: number;
};
```

La cronología conserva semántica histórica por evento. El `valued_difference` continúa calculándose autoritativamente en backend con los valores históricos del evento.

### Inconsistente

```ts
type ChronologyInconsistente = ChronologyBaseEvent & {
  state: "Inconsistente";
  theoretical: number;
  initial_difference: number;
  found_difference: number;
};
```

Definición:

- `theoretical` = teórico del reconteo;
- `initial_difference` = `stock_fisico - stock_teorico`;
- `found_difference` = `stock_reconteo - stock_teorico_reconteo`.

El frontend no debe reconstruir estas diferencias.

## 5.5. Valorización histórica

Se dejan de enviar por evento:

```text
valuation.unit_price
valuation.units_per_package
valuation.package_price
```

pero **no se dejan de usar en backend**.

El backend debe seguir calculando `valued_difference` con el precio y, cuando corresponda, unidades/precio por paquete históricos del conteo.

Esto preserva exactitud histórica y evita recalcular valorización en frontend.

## 5.6. Campos eliminados del nuevo evento

- `case_id`;
- `valuation` completo;
- métricas no utilizadas por el estado correspondiente.

`row_id` permanece como identidad estable del evento.

---

# 6. Repeticiones de incidencias

## 6.1. Decisión

No se crea una lectura nueva.

Se mantiene como contrato autoritativo:

```text
rpc_solog_admin_incidents_v2
action = detail_sites
payload = { family_key }
```

Razones:

- ya agrega en backend;
- devuelve exactamente las sedes activas;
- no existe N+1;
- payload observado es pequeño;
- eliminar `active` y `resolved_at` generaría un ahorro marginal frente al coste de duplicar o romper contrato.

## 6.2. Compatibilidad

Se mantiene sin cambios:

- `detail_sites`;
- `detail` legacy;
- fallback frontend existente mientras siga siendo necesario;
- Ignore 30 días;
- Aprobar/Proponer eliminación;
- Reactivar;
- revisiones e invalidación vigentes.

8.2B no modifica el flujo de mutaciones de incidencias.

---

# 7. Caché e invalidación

## 7.1. Detalle diario

Keys lógicas:

```text
bootstrap:
site_id + origin_date + stock_class

page:
site_id + origin_date + stock_class + state + page
```

Reglas:

- page 0 debe reutilizar el bootstrap cuando esté disponible;
- las páginas visitadas permanecen cacheadas;
- cambiar StateView no genera request si su primera página ya llegó en bootstrap;
- cambiar stock genera como máximo un nuevo bootstrap para ese stock;
- una revisión operacional nueva invalida las entradas del scope correspondiente según el mecanismo vigente de `AdminStore`.

No se introduce caché paralela fuera del store existente.

## 7.2. Cronología

Key lógica:

```text
site_id + group_id + period
```

La nueva acción debe recibir el mismo tratamiento de caché de sesión que `control_chronology` vigente.

La quincena anterior sigue lazy.

## 7.3. Incidencias

Se conserva `ManagementStore` sin arquitectura adicional.

---

# 8. Validación de payload y seguridad

Las acciones nuevas deben:

- exigir usuario autenticado;
- exigir rol `admin` o `moderador`;
- validar sede activa y autorizada bajo el mismo contrato vigente;
- validar payload como objeto;
- validar fecha ISO de día;
- validar UUID de grupo;
- rechazar `stock_class` desconocido;
- rechazar estado de diferencia desconocido;
- rechazar períodos fuera de `current_biweekly | previous_biweekly`;
- rechazar páginas no enteras o negativas;
- no aceptar parámetros de paginación arbitrarios que alteren el page size congelado.

No se añade `SECURITY DEFINER` público nuevo fuera del patrón ya existente. Las funciones internas que se creen para encapsular SQL deben permanecer no expuestas y con grants restringidos según el patrón vigente.

---

# 9. Compatibilidad

8.2B es **aditiva**.

Permanecen disponibles:

```text
daily_detail
control_chronology
detail_sites
detail
```

Nuevas acciones:

```text
daily_detail_bootstrap
daily_detail_page
control_chronology_view
```

No se cambia `contract_version = 2`.

La migración frontend a los nuevos actions solo comienza después de:

1. desplegar backend;
2. validarlo sintéticamente;
3. validar permisos y casos límite;
4. revisar advisors;
5. congelar el contrato desplegado.

---

# 10. Casos límite obligatorios

Backend debe validar al menos:

- día sin conteos;
- Stock positivo vacío;
- Stock 0 vacío;
- StateView vacío;
- página fuera de rango;
- varios conteos del mismo grupo el mismo día;
- Inconsistente con signos distintos entre diferencia inicial y encontrada;
- Confirmada cuya diferencia final no coincida con la diferencia de reconteo;
- valorización con precio por paquete;
- cronología sin eventos en quincena actual;
- cronología con eventos solo en quincena anterior;
- cambio histórico de precio entre eventos;
- quincena actual válida y error independiente en la anterior;
- revisión operacional nueva durante caché existente;
- `detail_sites` con sedes sin registros;
- mutación de incidencia con lectura cacheada.

---

# 11. Índices

No se crean índices nuevos en esta fase salvo evidencia nueva obtenida mediante `EXPLAIN (ANALYZE, BUFFERS)`.

La escala actual y los planes observados no justifican añadir índices solo por este rediseño.

---

# 12. Separación de responsabilidades

## Backend / Supabase — ChatGPT

- implementar actions nuevos;
- desplegar;
- validar SQL;
- medir payload;
- ejecutar advisors;
- preservar contratos legacy.

## TypeScript / frontend — posterior al backend

- añadir payloads/responses;
- añadir unions discriminadas;
- validar scope y paginación;
- adaptar caché;
- migrar consumidores;
- eliminar placeholders temporales.

Codex no debe modificar backend durante 8.2B salvo solicitud explícita del usuario.

---

# 13. Fases aprobadas de 8.2B

1. **Contrato backend** — esta fuente.
2. **Detalle diario** — implementación, despliegue y validación.
3. **Cronología** — implementación, despliegue y validación.
4. **Validación backend global** — casos límite, payload, EXPLAIN, permisos, advisors, compatibilidad.
5. **Congelación del contrato desplegado** — delta solo si la implementación obligó a ajustar lo aprobado.
6. **TypeScript + frontend** — consumir backend ya desplegado.
7. **Validación y cierre** — suite, lint, build, smoke y cierre explícito.

---

# 14. Estado

**Fase 1 — COMPLETADA.**

Contrato backend aprobado y congelado.  
No se ha implementado todavía ningún cambio de Supabase correspondiente a 8.2B.

La siguiente fase autorizada por el plan es:

**Fase 2 — Detalle diario.**
