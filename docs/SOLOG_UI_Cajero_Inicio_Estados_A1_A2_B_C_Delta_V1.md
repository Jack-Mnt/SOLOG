# SOLOG — UI Cajero — Inicio A1/A2/B/C — Delta V1

**Estado:** CONGELADO — APROBADO PARA PLANIFICACIÓN TÉCNICA  
**Fecha:** 2026-10-03  
**Clasificación:** Nivel B — implementación funcional UX/UI frontend  
**Rama de trabajo:** `admin-work`  
**Baseline de preflight:** `1623753172c9f51bbd274eee03a7daef24c035d7`

---

## 1. Alcance y jerarquía documental

Este documento congela exclusivamente la arquitectura UX/UI de **Inicio del Cajero** correspondiente a la Fase 2.1.

Para este alcance, este delta prevalece sobre:

1. `docs/SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md`
2. `docs/SOLOG_UI_Cajero_Plan_Bloques_UXUI_PostMotor_V1.md`

La fuente `SOLOG_UI_Cajero_Revision_UXUI_PostMotor_V1.md` continúa siendo la fuente primaria vigente para el resto del bloque Post-Motor que este delta no reemplace explícitamente.

El plan de bloques define orden y alcance, pero no debe prevalecer sobre decisiones funcionales congeladas en este delta.

No se modifica ni reabre el contrato backend/Motor V4.

---

## 2. Contrato backend/frontend vigente

La UI debe consumir como autoritativos:

- `panel_state`;
- `pre_session_summary`;
- `next_action`;
- KPI V4;
- `session_capability`;
- reglas existentes de `getCashierV4RouteAccess(...)`.

No se permite reconstruir localmente prioridad operativa, elegibilidad ni pertenencia a colas.

La cobertura se considera **completa exclusivamente cuando**:

```text
coverage_pending === 0
```

`coverage_percent` es solo presentación y no debe utilizarse como condición de completitud.

---

## 3. Estados visuales de Inicio

Inicio se clasifica visualmente mediante dos ejes: existencia de sesión activa y estado de cobertura.

| Estado | Sesión | Cobertura |
|---|---|---|
| A1 | sin sesión | incompleta |
| A2 | sin sesión | completa |
| B | activa | incompleta |
| C | activa | completa |

Esta clasificación es exclusivamente de presentación y no crea estados nuevos en Motor o backend.

---

## 4. Inventario disponible

`Inventario disponible` se conserva como franja compacta superior.

### A1 / A2

Debe conservar el CTA de inicio existente:

```text
Inventario disponible                    [Iniciar conteo]
```

También debe conservar sin reinterpretar:

- `preparedStart`;
- `Reintentar inicio`;
- estado busy `Iniciando…`;
- `requiresRefresh`;
- blocking recovery;
- errores de `start_capability`;
- navegación post-start basada exclusivamente en `start.panel_state.next_action`.

### B / C

Debe mostrar la acción secundaria de sesión:

```text
Inventario disponible                   [Finalizar conteo]
```

Se elimina `Continuar conteo` de esta franja.

---

## 5. Estado A1 — pre-sesión + cobertura incompleta

Composición:

1. Inventario disponible + `Iniciar conteo`.
2. Tarjeta principal de cobertura:
   - `Cobertura quincenal N`;
   - `coverage_counted / coverage_total`;
   - `coverage_percent`;
   - `coverage_pending`.
3. Stepper interactivo:
   - Conteo;
   - Revisar;
   - Diario.
4. Apariencia.

No mostrar:

- KPI Revisar;
- KPI Conteo diario;
- Pendientes de registro.

### 5.1 Stepper interactivo

El stepper es **informativo**, no navegación operativa.

Cada etapa debe poder seleccionarse para mostrar su explicación.

Debe diferenciarse explícitamente entre:

- etapa seleccionada para consultar;
- etapa vigente determinada por Motor.

La etapa vigente depende únicamente de `next_action`.

Mapeo:

```text
coverage -> Conteo
review   -> Revisar
daily    -> Diario
none     -> ninguna etapa enfatizada
```

El estado `none` se representa por ausencia de énfasis. No se añadirá un mensaje especial por defecto.

Accesibilidad recomendada:

- controles nativos `button`;
- `aria-pressed` para etapa seleccionada;
- `aria-current="step"` para etapa vigente, cuando aplique.

---

## 6. Estado A2 — pre-sesión + cobertura completa

Composición:

1. Inventario disponible + `Iniciar conteo`.
2. Tarjeta lineal/compacta de cobertura completada.
3. KPIs secundarios, en posición fija:
   - Revisar;
   - Conteo diario.
4. Apariencia.

Los KPI son informativos porque no existe sesión activa.

El énfasis visual puede seguir `pre_session_summary.next_action`, pero la navegación posterior a `Iniciar conteo` debe seguir exclusivamente la respuesta autoritativa del `start`.

Posiciones fijas:

```text
Revisar | Conteo diario
```

No reordenar según `next_action`.

---

## 7. Estado B — sesión activa + cobertura incompleta

Composición:

1. Inventario disponible + `Finalizar conteo`.
2. Cobertura principal.
3. KPI independientes:
   - Stock 0 — tratamiento warning;
   - Stock negativo — tratamiento danger-soft.
4. Revisar — KPI horizontal secundario.
5. Pendientes de registro.
6. Apariencia.

Se elimina `Continuar conteo`.

### 7.1 Superficies operativas

Un KPI puede mostrar información aunque su ruta no sea accesible.

Cuando la ruta correspondiente esté permitida por `getCashierV4RouteAccess(...)`:

- renderizar una superficie interactiva;
- usar un `button` accesible.

Cuando no esté permitida:

- renderizar la misma composición como superficie informativa;
- no utilizar un botón deshabilitado para simular una ruta inexistente.

### 7.2 Cobertura

Si `/cajero/conteo` está permitido, la tarjeta completa de Cobertura es clicable.

Si no está permitido, permanece informativa.

### 7.3 Stock 0 / Stock negativo

Se mantienen como tarjetas KPI independientes.

Datos:

- usar exclusivamente los pendientes derivados de `coverage_queue`;
- no reconstruir un n/N global por tipo de stock.

Deep-links aprobados:

```text
Stock 0        -> /cajero/conteo?stock=zero
Stock negativo -> /cajero/conteo?stock=negative
```

La query es únicamente un hint de presentación inicial.

No puede decidir:

- prioridad;
- elegibilidad;
- pertenencia a cola;
- permiso de captura.

Si la query es inválida o inexistente, el filtro inicial será:

```text
positive
```

### 7.4 Revisar

Se mantiene debajo de Stock 0 / Stock negativo como KPI horizontal secundario y menos prominente que Cobertura.

Será clicable únicamente cuando `/cajero/revisar` esté permitido.

### 7.5 Daily temporal con cobertura incompleta

Puede existir:

```text
coverage_pending > 0
coverage_queue_pending = 0
review_pending = 0
coverage_blocked_waiting_snapshot > 0
daily_pending > 0
next_action = daily
```

Esto no convierte la cobertura en completa.

No se añade un KPI Diario adicional en B.

El footer autoritativo continúa ofreciendo `Conteo diario` como trabajo disponible.

---

## 8. Estado C — sesión activa + cobertura completa

Composición:

1. Inventario disponible + `Finalizar conteo`.
2. Tarjeta lineal/compacta de cobertura completada.
3. KPIs en posición fija:
   - Revisar;
   - Conteo diario.
4. Pendientes de registro.
5. Apariencia.

Posiciones:

```text
Revisar | Conteo diario
```

No deben cambiar por `next_action`.

Solo cambian:

- énfasis visual;
- indicador de prioridad;
- interactividad de la superficie cuya ruta esté permitida.

Casos:

```text
next_action = review
-> Revisar enfatizado e interactivo
-> Diario informativo
```

```text
next_action = daily
-> Revisar informativo
-> Diario enfatizado e interactivo
```

```text
next_action = none
-> ninguno enfatizado
-> ambos informativos
```

---

## 9. Pendientes de registro

Regla:

```text
A1/A2 -> no mostrar
B/C   -> mostrar siempre
```

Con sesión activa, la tarjeta debe permanecer visible incluso con cero pendientes.

El botón `Registrar conteo` conserva la lógica existente:

```text
disabled = runtime busy || pendingCount === 0
```

No modificar orquestación, idempotencia ni `runtime.sendPending()`.

---

## 10. Responsive

### A1

Desktop/tablet:

```text
Conteo ---- Revisar ---- Diario
```

Mobile:

```text
Conteo
  |
Revisar
  |
Diario
```

### B

Desktop/tablet:

```text
Stock 0 | Stock negativo
Revisar ----------------
Pendientes -------------
```

Mobile:

```text
Stock 0
Stock negativo
Revisar
Pendientes
```

### A2 / C

Desktop/tablet:

```text
Revisar | Conteo diario
```

Mobile:

```text
Revisar
Conteo diario
```

Preferir clases de layout explícitas. No depender de selectores posicionales frágiles para expresar semántica.

---

## 11. Accesibilidad

- superficie con acción -> `button`;
- superficie informativa -> `article` o equivalente semántico;
- no representar rutas no disponibles mediante botones disabled;
- énfasis de prioridad no debe depender solo del color;
- focus visible;
- targets táctiles de al menos 44 px;
- orden DOM estable;
- sin overflow horizontal a 320 px;
- mantener orden fijo de Revisar/Diario.

---

## 12. CSS y reutilización

Reutilizar prioritariamente:

- `.cajero-stock-card`;
- `.cajero-coverage-card`;
- `.cajero-progress-ring`;
- `.cajero-home-metric`;
- `.cajero-home-metric--action`;
- `.cajero-period-complete`;
- `.cajero-home-appearance`.

Separar explícitamente variantes estáticas e interactivas.

No introducir colores hardcodeados para warning/danger. Usar tokens vigentes.

No realizar limpieza general de CSS en esta fase.

---

## 13. Fuera de alcance

No modificar:

- Supabase;
- RPC públicas;
- Motor V4;
- contrato V4;
- runtime de envío;
- store;
- storage;
- flush;
- idempotencia;
- Historial;
- filtros de Revisar 2.2;
- transición de diferencias 2.3;
- calculadora 2.5;
- inventario terminológico 2.6;
- limpieza final CSS 2.7.

No realizar refactors generales no relacionados.

---

## 14. Validaciones mínimas

La implementación debe cubrir como mínimo:

1. A1 + `next_action=coverage`.
2. A1 + `next_action=daily` con cobertura todavía incompleta.
3. A1 + `next_action=none`.
4. A2 + review.
5. A2 + daily.
6. B + coverage.
7. B + review.
8. B + daily temporal con cobertura incompleta.
9. B con `pendingCount=0`: tarjeta visible y botón de registro disabled.
10. C + review.
11. C + daily.
12. C + none.
13. Stock 0 abre `?stock=zero`.
14. Stock negativo abre `?stock=negative`.
15. Query inválida o ausente -> filtro positive.
16. Cambio de `next_action` no reordena Revisar/Diario.
17. Start que cambia prioridad entre summary y respuesta respeta `start.panel_state.next_action`.
18. Responsive móvil/tablet/desktop.
19. Navegación por teclado y focus.
20. `bun test`, lint, build y `git diff --check`.

---

## 15. Criterio de bloqueo

Si durante la planificación o implementación se descubre que cualquiera de estas decisiones requiere:

- un nuevo campo backend;
- modificar el contrato V4;
- reinterpretar `next_action`;
- cambiar reglas del Motor;
- alterar permisos de captura;

el trabajo debe detenerse y volver a definición. No debe resolverse automáticamente desde frontend.
