# SOLOG — Motor Cajero — Prioridades, Reconteos e Inconsistentes — Delta V1

**Estado:** CONGELADO — DECISIÓN FUNCIONAL APROBADA / IMPLEMENTACIÓN BACKEND PENDIENTE  
**Fecha:** 7 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — Motor / backend / reglas críticas de negocio  
**Rama de trabajo:** `admin-work`

---

## 1. Propósito

Este delta actualiza de forma acotada dos reglas del Motor Cajero V4:

1. la prioridad operacional entre cobertura de ronda, reconteos y cobertura de turno;
2. el tratamiento temporal de un grupo cuyo reconteo termina en `Inconsistente`.

No rediseña el Motor completo ni modifica las reglas de resolución `Coincide / Confirmada / Inconsistente`.

---

## 2. Autoridad y precedencia

Para el alcance de este delta, la precedencia funcional es:

1. `docs/SOLOG_Motor_Cajero_Prioridades_Reconteos_Inconsistentes_Delta_V1.md`
2. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
3. `docs/SOLOG_Backend_Contrato_Cajero_V4.md`
4. demás documentación V4 vigente.

Este delta reemplaza únicamente las decisiones incompatibles relativas a:

- prioridad `review → coverage → daily`;
- bloqueo global por `Recontar` esperando snapshot;
- elegibilidad posterior a un `Inconsistente`.

Todo lo demás permanece vigente.

### 2.1. Contrato desplegado

Hasta que este delta sea implementado y validado en Supabase:

- `docs/SOLOG_Backend_Contrato_Cajero_V4.md` continúa describiendo el comportamiento realmente desplegado;
- este documento define el comportamiento funcional objetivo del siguiente cambio backend;
- no debe afirmarse que el backend ya cumple este delta antes de la validación correspondiente.

Tras el despliegue, el contrato backend deberá actualizarse mediante su propio delta o nueva versión documental.

---

## 3. Terminología vigente

La quincena continúa siendo el período operativo y contiene dos rondas.

Se utiliza:

- **cobertura de ronda:** al menos una observación física válida del grupo dentro de la ronda;
- **cobertura de turno:** oportunidad de conteo normal del grupo dentro del turno;
- **conteo normal:** observación que consume el máximo de un conteo normal por grupo/turno;
- **reconteo:** observación adicional para resolver un caso `Recontar`; no consume el cupo de conteo normal;
- **observación física:** conteo normal o reconteo.

La denominación histórica `Conteo diario` / `daily` queda conceptualmente reemplazada por **cobertura de turno**.

Por compatibilidad con el contrato V4 vigente, este delta no exige renombrar inmediatamente el valor técnico/runtime `daily`. Puede conservarse como identificador interno o de wire mientras `contract_version = 4`, siempre que su semántica sea la definida aquí.

---

## 4. Clasificación funcional de trabajo

El Motor debe distinguir cuatro clases operativas ordenadas:

```text
1. round_coverage
2. review_for_coverage
3. review_regular
4. shift_coverage
```

Los nombres técnicos exactos pueden variar, pero la semántica y el orden son obligatorios.

### 4.1. Cobertura normal de ronda — `round_coverage`

Grupo que:

- pertenece al universo operacional vigente;
- todavía no acredita la ronda activa;
- no tiene un `Recontar` pendiente;
- no consumió su conteo normal del turno.

Su conteo normal acredita cobertura de ronda.

### 4.2. Revisar que acredita ronda — `review_for_coverage`

Caso:

```text
estado_diferencia = Recontar
AND primer_snapshot_posterior_id IS NOT NULL
AND stock_reconteo IS NULL
```

y el grupo todavía no acredita la ronda activa.

El reconteo cumple simultáneamente:

```text
resolver el caso
+
acreditar cobertura de la ronda activa
```

### 4.3. Revisar regular — `review_regular`

Caso `Recontar` accionable cuyo grupo ya acredita la ronda activa.

Su resolución es importante para precisión, pero no aumenta la cobertura de la ronda.

### 4.4. Cobertura de turno — `shift_coverage`

Grupo que:

- ya acredita la ronda activa;
- está operacionalmente marcado para nueva observación, por ejemplo `Cambio_reciente`;
- no tiene diferencia pendiente que impida un nuevo conteo normal;
- no consumió el conteo normal del turno actual;
- no está temporalmente bloqueado por un `Inconsistente` resuelto en ese mismo turno.

---

## 5. Prioridad operacional autoritativa

La prioridad global queda congelada como:

```text
1. Cobertura normal de ronda
2. Revisar accionable que acredita ronda
3. Revisar accionable restante
4. Cobertura de turno
5. none
```

El backend es la única autoridad.

El frontend no debe reconstruir ni reinterpretar esta prioridad.

### 5.1. Regla de avance

El Motor toma la primera clase de trabajo que tenga elementos **realmente accionables**.

No se considera accionable un caso `Recontar` que todavía espera un snapshot posterior utilizable.

---

## 6. `Recontar` esperando snapshot

Un caso:

```text
estado_diferencia = Recontar
AND stock_reconteo IS NULL
AND primer_snapshot_posterior_id IS NULL
```

está bloqueado solo para ese grupo/caso.

No constituye un bloqueo global de la sede.

Por tanto:

```text
Recontar esperando snapshot
≠
next_action obligatorio
```

Si no existe trabajo accionable de mayor prioridad, el Motor puede continuar con cobertura de turno.

Esto también aplica cuando la ronda no puede alcanzar temporalmente 100 % porque los únicos grupos todavía no cubiertos están bloqueados esperando snapshot.

Ejemplo:

```text
cobertura normal disponible = 0
review_for_coverage accionable = 0
review bloqueado esperando snapshot = 3
review_regular accionable = 0
shift_coverage = 20

→ next_action = shift_coverage
```

Cuando llega un snapshot posterior utilizable y un caso se vuelve accionable, el Motor vuelve a aplicar la prioridad normal.

---

## 7. `Inconsistente` — semántica de caso y grupo

`Inconsistente` es terminal para el caso de reconteo que produjo ese resultado, pero no para el grupo.

La resolución continúa siendo:

```text
signos incompatibles
→ estado_diferencia = Inconsistente
→ diferencia final = dr
```

A nivel operacional del grupo:

```text
Inconsistente
→ estado_stock_grupo.estado = Cambio_reciente
```

El grupo debe volver a ser observado posteriormente.

---

## 8. Bloqueo temporal después de `Inconsistente`

Después de un reconteo que termina en `Inconsistente`, el grupo no puede recibir un nuevo conteo normal durante el mismo turno en el que ocurrió ese reconteo.

La regla se deriva temporalmente:

```text
blocked_after_inconsistent =
  último caso relevante está Inconsistente
  AND recontado_at ∈ turno actual
```

Mientras sea verdadero:

```text
acción normal del grupo = none
```

Al comenzar el siguiente turno, el bloqueo desaparece automáticamente.

Si el grupo continúa en `Cambio_reciente`, vuelve a ser elegible para cobertura de turno siguiendo la prioridad general.

### 8.1. No modificar `ultimo_conteo_at`

El reconteo `Inconsistente` no debe escribir `ultimo_conteo_at`.

Se preserva la semántica:

```text
ultimo_conteo_at
= último conteo normal
```

El bloqueo del mismo turno se deriva de `estado_diferencia + recontado_at`, no contaminando la autoridad de conteos normales.

### 8.2. Sin estado temporal nuevo

No se crea un estado persistente como `Inconsistente_bloqueado` o `Revisar_siguiente_turno`.

La restricción es temporal y derivada.

### 8.3. Sin prioridad extraordinaria en el turno siguiente

Al siguiente turno el grupo no recibe una prioridad especial.

Compite como cobertura de turno normal después de cobertura de ronda, `review_for_coverage` y `review_regular`.

---

## 9. Una única autoridad de prioridad

La implementación backend debe evitar que el orden de prioridad sea reconstruido independientemente por múltiples funciones.

Debe existir una única autoridad lógica para decidir la clase operativa prioritaria.

La implementación exacta puede ser un helper dedicado, un clasificador compartido, una función pura de resolución de prioridad u otra solución equivalente comprobablemente única.

Debe ser consumida por las superficies que:

- generan summary/KPI;
- construyen `panel_state`;
- validan mutaciones;
- exponen `next_action`.

No deben permanecer `CASE` independientes con órdenes potencialmente divergentes.

La autoridad debe distinguir, como mínimo:

```text
round_coverage
review_for_coverage
review_regular
shift_coverage
none
```

Puede además exponer internamente una razón diagnóstica equivalente a `action / priority / reason`, sin que este delta obligue a ampliar el contrato público V4.

---

## 10. Compatibilidad de contrato V4

Este delta busca minimizar ruptura de contrato.

No exige cambiar inmediatamente:

```text
contract_version = 4
action runtime = recount | coverage | daily | none
next_action = review | coverage | daily | none
review_queue
coverage_queue
daily_queue
```

La clasificación más precisa puede implementarse internamente y mapearse al contrato V4 existente:

```text
round_coverage      → coverage
review_for_coverage → review
review_regular      → review
shift_coverage      → daily
```

Si durante el preflight técnico se demuestra que el contrato actual no puede representar el comportamiento sin ambigüedad o sin romper invariantes, debe detenerse la implementación y definirse un contrato posterior antes de modificar frontend.

---

## 11. Invariantes preservados

Este delta no cambia:

- dos rondas por quincena;
- `America/Lima` como autoridad temporal;
- máximo un conteo normal por grupo/turno;
- reconteo no consume cupo normal;
- cualquier diferencia inicial no cero produce `Recontar`;
- reconteo exige snapshot posterior utilizable;
- reconteo exige sesión posterior;
- snapshot posterior no auto-resuelve;
- resolución `Coincide / Confirmada / Inconsistente`;
- `ultima_observacion_fisica_at` como autoridad de cobertura de ronda;
- idempotencia V4;
- lifecycle activo/recovery/finalizado/expirado;
- runtime congelado por sesión.

---

## 12. Casos de aceptación funcional

### A. Cobertura normal disponible

```text
round_coverage > 0
review_for_coverage > 0
review_regular > 0
shift_coverage > 0

→ round_coverage
```

### B. Cobertura normal agotada, reconteo completa ronda

```text
round_coverage = 0
review_for_coverage > 0

→ review_for_coverage
```

### C. Ronda cubierta, diferencias accionables

```text
round_coverage = 0
review_for_coverage = 0
review_regular > 0

→ review_regular
```

### D. Revisar bloqueado no detiene trabajo

```text
round_coverage = 0
review accionable = 0
review esperando snapshot > 0
shift_coverage > 0

→ shift_coverage
```

### E. Snapshot vuelve accionable un caso

```text
shift_coverage activo
→ llega snapshot posterior
→ review pasa a accionable

→ reaplicar prioridad
→ review correspondiente prevalece
```

### F. Inconsistente en turno posterior al conteo original

```text
Día: conteo normal → Recontar
Noche: reconteo → Inconsistente

durante Noche:
→ no nuevo conteo normal

Madrugada siguiente:
→ puede volver a ser elegible como shift_coverage
```

### G. Inconsistente dentro del mismo turno

```text
10:00 conteo normal
10:40 reconteo → Inconsistente

resto del turno Día:
→ no nuevo conteo normal

turno Noche:
→ elegibilidad normal según prioridad
```

### H. `ultimo_conteo_at` preservado

```text
reconteo → Inconsistente

→ ultimo_conteo_at no cambia
→ ultima_observacion_fisica_at sí puede avanzar por recontado_at
```

### I. Inconsistente sin prioridad especial siguiente turno

```text
grupo vuelve a ser elegible
+
existe round_coverage

→ prevalece round_coverage
```

---

## 13. Impacto documental posterior requerido

Después de desplegar y validar el backend deberán actualizarse, mediante delta o versión correspondiente:

- `docs/SOLOG_Backend_Contrato_Cajero_V4.md`;
- criterios de aceptación que todavía indiquen `review → coverage → daily`;
- documentación de frontend Cajero si contiene terminología `Conteo diario`;
- handoff de Admin cuando consuma métricas de cobertura de turno.

No debe reescribirse documentación histórica cerrada salvo que se marque explícitamente como reemplazada o complementada.

---

## 14. Fuera de alcance

Este delta no implementa ni define:

- Dashboard Admin;
- persistencia histórica de oportunidades de cobertura de turno;
- KPI analíticos por ronda/turno;
- métricas por trabajador;
- movimiento teórico;
- nueva RPC de Admin;
- cambios de UX del Cajero salvo los estrictamente necesarios si el backend devuelve una prioridad distinta;
- renombre obligatorio del wire `daily`;
- rediseño general de runtime o lifecycle.

---

## 15. Estado de implementación

Al congelar este documento:

```text
Decisión funcional: APROBADA
Documento: CONGELADO
Backend: NO IMPLEMENTADO
Supabase desplegado: comportamiento V4 previo todavía vigente
Frontend: SIN CAMBIOS
```

El siguiente paso es realizar el preflight técnico de las funciones V4 afectadas, preparar el cambio backend mínimo, desplegarlo y validarlo antes de continuar con cualquier consumidor dependiente.