# SOLOG — Lógica Cajero — Turnos y Reconteos V1

**Estado:** REEMPLAZADO — HISTÓRICO  
**Fecha:** 29 de septiembre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — lógica de Motor / Cajero / backend  
**Rama de trabajo:** `admin-work`  
**Reemplazado por:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Uso actual:** referencia histórica; no utilizar como fuente de implementación.

---

## 1. Propósito

Definir el comportamiento objetivo del Cajero para:

1. limitar la repetición de Conteo diario mediante los turnos operativos existentes;
2. convertir toda diferencia de conteo en un caso de reconteo;
3. mantener el snapshot posterior como condición de habilitación del reconteo;
4. priorizar los reconteos accionables antes del Conteo diario una vez completada la cobertura quincenal.

Este documento es un **delta funcional** sobre el Motor/Cajero V3 vigente. En los puntos cubiertos aquí, estas decisiones prevalecen sobre el comportamiento anterior cuando se implemente el cambio. El resto del contrato V3 permanece vigente.

---

## 2. Turnos operativos autoritativos

SOLOG utilizará los tres turnos ya establecidos, calculados en `America/Lima`:

| Turno | Inicio | Fin |
|---|---:|---:|
| `early` | 00:00 | 07:30 |
| `day` | 07:30 | 15:30 |
| `night` | 15:30 | 24:00 |

La determinación del turno y de su instante de inicio debe ser única y autoritativa para las reglas operativas que dependan de estas ventanas.

Los cortes Cron existentes continúan representando el cierre de estos mismos turnos:

- 07:30 → cierre de `early`;
- 15:30 → cierre de `day`;
- 00:00 → cierre de `night`.

---

## 3. Cobertura quincenal y Conteo diario

### 3.1. Cobertura quincenal

Mientras la cobertura quincenal no esté completa, el Cajero continúa priorizando el flujo de **Conteo** destinado a cubrir los grupos pendientes del período.

La cobertura quincenal conserva su significado actual:

> un grupo está cubierto cuando recibió al menos un conteo físico válido dentro del período vigente.

### 3.2. Elegibilidad para Conteo diario

Después de que un grupo ya está cubierto en la quincena, podrá volver a ingresar a Conteo diario cuando cumpla simultáneamente:

```text
cobertura_periodo = true
AND estado_stock = Cambio_reciente
AND no existe reconteo pendiente para el grupo
AND el grupo no ha recibido un conteo normal durante el turno operativo actual
```

La cobertura del turno se derivará usando:

- `ultimo_conteo_at`;
- el inicio del turno operativo correspondiente al momento de evaluación.

Regla:

```text
ultimo_conteo_at IS NULL
OR ultimo_conteo_at < inicio_turno_actual
→ el grupo no ha sido contado en el turno actual
```

Si:

```text
ultimo_conteo_at >= inicio_turno_actual
```

el grupo ya consumió su conteo normal de ese turno.

### 3.3. Límite de conteo normal

Un grupo puede recibir como máximo **un conteo normal por turno operativo**.

Por tanto, dentro de un día operativo puede recibir hasta:

- un conteo normal en `early`;
- un conteo normal en `day`;
- un conteo normal en `night`.

Si el stock vuelve a cambiar después de ser contado dentro del mismo turno:

```text
estado_stock = Cambio_reciente
```

pero el grupo permanece fuera del Conteo diario hasta que comience un turno posterior.

Al iniciar un turno posterior, si el grupo continúa en `Cambio_reciente` y no tiene un reconteo pendiente, vuelve a ser elegible.

### 3.4. Relación con los reconteos

El reconteo no consume el cupo de conteo normal del turno.

Por ello, dentro de un mismo turno puede existir:

```text
Conteo normal
+
Reconteo
```

cuando la diferencia y las condiciones temporales del Motor lo requieran.

---

## 4. Tratamiento de diferencias

Para todo conteo normal confirmado:

```text
d0 = stock_fisico - stock_teorico
```

La transición autoritativa será:

```text
d0 = 0
→ Coincide

d0 ≠ 0
→ Recontar
```

Toda diferencia distinta de cero genera directamente un caso de reconteo.

El estado `Recontar` no depende de que un snapshot posterior confirme, explique o reproduzca la diferencia.

---

## 5. Snapshot posterior como condición de habilitación

La separación entre el conteo original y el reconteo se conserva.

Después de un conteo con diferencia:

```text
Conteo original
→ Recontar
→ esperar snapshot posterior
→ habilitar Revisar
```

Para habilitar el reconteo debe existir un **snapshot posterior confirmado y utilizable para el grupo**, capturado después de `contado_at` del conteo original.

Si el snapshot posterior no permite obtener una observación válida del grupo, el caso continúa esperando un snapshot posterior utilizable.

El primer snapshot posterior utilizable se registra como referencia del caso.

Su función en esta lógica es:

- demostrar que existe una referencia de inventario posterior al conteo original;
- separar temporalmente las dos observaciones físicas;
- habilitar el caso para `Revisar`;
- conservar trazabilidad del estado posterior.

El valor observado en el snapshot posterior no modifica por sí mismo `estado_diferencia` ni resuelve automáticamente la diferencia.

Una vez registrada esa referencia:

```text
estado_diferencia = Recontar
AND primer_snapshot_posterior_id IS NOT NULL
AND stock_reconteo IS NULL
→ caso accionable en Revisar
```

---

## 6. Separación de sesiones

El reconteo debe realizarse en una **sesión posterior** a la sesión que registró el conteo original.

La secuencia mínima es:

```text
Sesión A
→ conteo normal
→ diferencia
→ Recontar

snapshot posterior utilizable

Sesión B o posterior
→ Revisar
→ reconteo
```

El Motor debe conservar la prohibición de recontear dentro de la misma sesión que originó la diferencia.

La sesión utilizada para el reconteo congela su propia referencia y su propio stock teórico para el grupo.

---

## 7. Resolución del reconteo

Se conserva la lógica vigente del Motor V3.

Definiciones:

```text
d0 = stock_fisico_original - stock_teorico_original
dr = stock_reconteo - stock_teorico_reconteo
```

Resolución:

### 7.1. Coincide

```text
dr = 0
→ estado_diferencia = Coincide
→ diferencia final = 0
```

### 7.2. Confirmada

Si `d0` y `dr` tienen el mismo signo:

```text
estado_diferencia = Confirmada
```

La diferencia final es la de menor magnitud absoluta entre `d0` y `dr`, conservando su signo.

### 7.3. Inconsistente

Si `d0` y `dr` tienen signos incompatibles:

```text
estado_diferencia = Inconsistente
→ diferencia final = dr
```

---

## 8. Prioridad operativa del Cajero

Esta prioridad aplica una vez completada la cobertura quincenal.

Al iniciar o reconstruir una sesión:

```text
¿review_queue tiene casos accionables?
        │
        ├─ Sí → Revisar
        │
        └─ No → Conteo diario, si existen grupos elegibles
```

### 8.1. Revisar tiene prioridad

Mientras `review_queue` contenga casos accionables:

- `Revisar` es el módulo operativo prioritario;
- el Cajero debe resolver esos casos antes de acceder al flujo de Conteo diario;
- la ruta o acción de Conteo diario debe dirigir al flujo de `Revisar` mientras esta condición siga vigente.

Las superficies no operativas, como Inicio o Historial, no alteran esta prioridad.

### 8.2. Transición a Conteo diario

Los reconteos confirmados eliminan sus casos de `review_queue` mediante el estado autoritativo recibido del backend.

Cuando:

```text
review_queue = 0
```

el Cajero puede continuar, dentro de la misma sesión, con los grupos disponibles en Conteo diario.

No se requiere finalizar y crear una nueva sesión para pasar de `Revisar` a Conteo diario.

### 8.3. Casos aún no accionables

Un caso con:

```text
estado_diferencia = Recontar
AND primer_snapshot_posterior_id IS NULL
```

todavía no pertenece a `review_queue`.

Por tanto, no bloquea el Conteo diario de otros grupos una vez completada la cobertura quincenal.

---

## 9. Flujo objetivo consolidado

```text
COBERTURA QUINCENAL INCOMPLETA
        ↓
Conteo
        ↓
captura física
        ↓
d0 = físico - teórico
        ├─ 0  → Coincide
        └─ ≠0 → Recontar
                  ↓
          esperar snapshot posterior utilizable
                  ↓
          queda accionable en Revisar


COBERTURA QUINCENAL COMPLETA
        ↓
iniciar / reconstruir sesión
        ↓
¿hay review_queue?
        ├─ Sí
        │   ↓
        │ Revisar
        │   ↓
        │ reconteo
        │   ↓
        │ Coincide / Confirmada / Inconsistente
        │   ↓
        │ repetir hasta review_queue = 0
        │
        └───────────────┐
                        ↓
                 Conteo diario
                        ↓
        grupos Cambio_reciente elegibles
                        ↓
        máximo 1 conteo normal por grupo/turno
```

---

## 10. Contratos que deberá respetar la implementación

### Backend / Motor

La implementación deberá garantizar:

1. cálculo autoritativo del turno en zona horaria `America/Lima`;
2. elegibilidad de Conteo diario basada en `ultimo_conteo_at` y el inicio del turno;
3. máximo un conteo normal por grupo y turno;
4. transición inmediata `diferencia ≠ 0 → Recontar`;
5. registro del primer snapshot posterior utilizable sin auto-resolución por comparación;
6. habilitación de `review_queue` cuando el snapshot posterior requerido exista;
7. prohibición de reconteo en la misma sesión de origen;
8. conservación de la resolución vigente del reconteo;
9. respuestas autoritativas compatibles con las colas y deltas del Cajero V3.

### Frontend Cajero

La implementación deberá garantizar:

1. prioridad de `Revisar` sobre Conteo diario cuando la cobertura quincenal esté completa;
2. imposibilidad de acceder operativamente a Conteo diario mientras existan casos accionables en `review_queue`;
3. transición a Conteo diario en la misma sesión cuando `review_queue` llegue a cero;
4. uso de las colas y deltas autoritativos del backend, sin recalcular estados de diferencia en frontend.

---

## 11. Casos de aceptación funcional

### Caso A — cambio repetido dentro del mismo turno

```text
08:00 grupo elegible
09:00 conteo normal
11:00 nuevo snapshot cambia stock
→ Cambio_reciente
→ no vuelve a Conteo diario durante day

15:30 comienza night
→ vuelve a ser elegible si continúa Cambio_reciente
```

### Caso B — diferencia con snapshot posterior

```text
08:30 conteo
teórico 10 / físico 8
→ Recontar

10:30 llega snapshot posterior utilizable
→ continúa Recontar
→ se habilita Revisar
```

La igualdad o diferencia entre el snapshot posterior y el físico original no cambia esta transición.

### Caso C — prioridad Revisar

```text
cobertura quincenal = 100%
review_queue = 3
count_queue diario = 20

→ Cajero entra a Revisar
→ resuelve 3 casos
→ review_queue = 0
→ continúa con Conteo diario en la misma sesión
```

### Caso D — caso esperando snapshot

```text
cobertura quincenal = 100%
1 caso Recontar sin snapshot posterior
review_queue = 0
count_queue diario > 0

→ Conteo diario permanece disponible
```

---

## 12. Estado del bloque

Las decisiones funcionales de este documento quedan **CONGELADAS**.

No se inicia implementación en esta etapa.

Antes de implementar, por tratarse de un cambio Nivel C, deberá realizarse el preflight técnico/backend correspondiente y convertir estas reglas en el contrato y migraciones mínimas necesarias antes de preparar cualquier implementación dependiente de frontend.