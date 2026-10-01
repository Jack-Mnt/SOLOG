# SOLOG — Integración — Cajero Recovery — Estado Operacional por Sesión V1

**Estado:** CONGELADO — DELTA APROBADO  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** B — frontend / recovery / persistencia operacional  
**Rama:** `admin-work`

---

## 1. Autoridad y alcance

Este documento es un **delta** sobre:

`docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`

y sobre la foundation implementada en Fase 13.2.

Fuentes superiores que siguen prevaleciendo:

1. `docs/SOLOG_Backend_Contrato_Cajero_V4.md`
2. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
3. este delta
4. `docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`
5. implementación frontend previa cuando no contradiga lo anterior

Todo lo aprobado en 13.1 y 13.2 permanece vigente salvo lo reemplazado explícitamente aquí.

---

## 2. Bloqueo que origina el delta

La foundation 13.2 mantiene un único `panel_state`.

Un bootstrap autoritativo:

- reemplaza ese panel;
- vacía `panel_deltas`;
- conserva únicamente metadata/capability de `recovery_sessions`.

El contrato backend V4 no incluye en `recovery_sessions[]`:

- `review_queue`;
- `coverage_queue`;
- `daily_queue`;
- `next_action`;
- KPI;
- `groups_revision`.

Por tanto, después de:

```text
sesión A active
→ A entra en recovery
→ refresh
→ sesión B active
```

el frontend conoce que A sigue existiendo, pero ya no conserva suficiente autoridad backend para decidir una nueva entrega de A.

No es válido:

- usar el panel de B;
- reconstruir prioridad desde drafts;
- reconstruir colas desde grupos;
- inferir `groups_revision`;
- mover drafts de A hacia B.

---

## 3. Decisión principal

Se mantiene **un único `panel_state` para UI activa**, pero se añade un estado operacional independiente por sesión.

Concepto:

```text
delivery_state_by_session[conteo_id]
```

No es un segundo panel UI.

Es un snapshot mínimo de autoridad backend necesario para planificar entregas pendientes de esa sesión.

---

## 4. Shape mínimo del delivery state

Cada entrada debe conservar como mínimo:

```text
conteo_id
groups_revision
review_queue
coverage_queue
daily_queue
kpis
next_action
```

Puede conservar además identificadores/basis mínimos si simplifica validaciones, siempre que no replique innecesariamente todo `panel_state.groups`.

No es necesario persistir todos los productos/grupos del panel para planificar el flush.

---

## 5. Fuente de verdad

El delivery state solo puede nacer o actualizarse desde respuestas backend autoritativas:

### Desde `panel_state`

Al recibir:

- bootstrap con active;
- respuesta `start`.

Se crea/reemplaza la entrada de esa sesión usando:

```text
panel_state.basis.groups_revision
panel_state.review_queue
panel_state.coverage_queue
panel_state.daily_queue
panel_state.kpis
panel_state.next_action
```

### Desde `panel_delta`

Después de:

- `save_batch`;
- `recount_save_batch`.

Se actualiza la entrada del `conteo_id` correspondiente usando:

```text
review_queue
coverage_queue
daily_queue
kpis
next_action
```

`groups_revision` permanece el congelado de esa sesión.

---

## 6. Bootstrap y recovery

Un bootstrap puede reemplazar el `panel_state` activo, pero **no debe borrar indiscriminadamente** los delivery states de sesiones anteriores.

Caso:

```text
A active
→ delivery_state[A]

bootstrap:
A recovery
B active

resultado:
panel_state = B
delivery_state[A] se conserva
delivery_state[B] se crea/actualiza
```

`recovery_sessions` continúa siendo la autoridad vigente de capability/lifecycle para A.

El delivery state de A no convierte por sí mismo la sesión en entregable.

---

## 7. Capability no congelada como permiso

El delivery state conserva prioridad/colas, pero la autorización de entrega sigue viniendo del estado backend vigente.

Para poder entregar una recovery deben cumplirse ambos:

1. existe delivery state suficiente;
2. la `session_capability` vigente de esa recovery permite `pending_delivery_allowed`.

Nunca usar un capability antiguo persistido para ampliar permisos actuales.

El reloj local solo puede restringir adicionalmente.

---

## 8. Sesiones ausentes en bootstrap

La ausencia de una sesión tanto del panel activo como de `recovery_sessions` significa que no debe considerarse entregable.

Sin embargo, su delivery state no debe provocar borrado automático de drafts.

En 13.3 la persistencia puede conservar el scope/drafts como estado no entregable hasta que una regla explícita permita resolverlos.

No usar la ausencia en bootstrap como señal para purgar datos locales.

---

## 9. Delta de recovery

Si llega un `panel_delta` para una sesión recovery:

- actualizar `delivery_state_by_session[conteo_id]`;
- actualizar capability de la recovery según la respuesta;
- NO reemplazar `panel_state` de una active distinta;
- NO mezclar colas entre sesiones.

Ejemplo:

```text
A recovery
B active

delta A:
review → coverage

resultado:
delivery_state[A].next_action = coverage
panel_state B permanece intacto
```

---

## 10. Finish

Cuando backend confirma `finish` para una sesión:

- la sesión deja de ser entregable;
- su capability pasa a `none/finalizado`;
- el delivery state en memoria puede retirarse.

La eliminación de drafts/operaciones persistidas corresponde a la confirmación de sus propias operaciones en 13.3.

No ejecutar `finish` automáticamente por `next_action = none`.

---

## 11. Persistencia futura en 13.3

13.2A prepara el modelo en memoria.

13.3 deberá persistir el snapshot operacional necesario junto al scope original:

```text
usuario_id
sede_id
dispositivo_id
conteo_id
groups_revision

review_queue
coverage_queue
daily_queue
next_action
```

Los KPI pueden persistirse si son útiles para continuidad/UX, pero no son necesarios para construir el request.

La capability vigente no debe tratarse como permiso persistido autoritativo.

---

## 12. Operación preparada

13.3 debe distinguir entre:

### Drafts sin operación preparada

Necesitan delivery state para decidir qué batch puede construirse.

### Operación ya preparada

Debe conservar:

```text
operation_id
action
conteo_id
expected_groups_revision
items
```

Si existe una operación preparada válida, puede reintentarse exactamente con el mismo payload aunque el delivery state original no esté disponible en memoria.

Esto es un retry idempotente, no una nueva decisión operacional.

La capability vigente aún debe permitir pending delivery.

---

## 13. Regla de bloqueo seguro

Caso:

```text
recovery
+ drafts pendientes
+ sin delivery state
+ sin operación preparada
```

Resultado:

```text
NO enviar
NO reconstruir colas
NO reconstruir next_action
NO mover drafts a otra sesión
CONSERVAR drafts
marcar estado local como bloqueado/no planificable
```

La UI específica del bloqueo se resolverá en fase posterior.

---

## 14. Invariantes

Quedan congelados:

1. El delivery state está indexado por `conteo_id`.
2. Una sesión nunca consume el delivery state de otra.
3. Bootstrap no borra snapshots recovery válidos por reemplazar el active panel.
4. `next_action` nunca se deriva localmente.
5. Las colas nunca se derivan desde drafts.
6. `groups_revision` nunca se toma de una sesión active diferente.
7. Capability vigente sigue siendo requisito de entrega.
8. Una operación preparada se reintenta exactamente.
9. Un draft sin autoridad suficiente se conserva y se bloquea.
10. Ningún refresh puede producir pérdida silenciosa de drafts.

---

## 15. Impacto en Fase 13.2

Se permite modificar la foundation creada en 13.2 para introducir:

- mapa de delivery state por sesión;
- helpers/selectors por `conteo_id`;
- reducer de bootstrap que preserve snapshots de recovery;
- reducer de delta que actualice la sesión correspondiente;
- tests de coexistencia active + recovery.

No se considera rediseño de backend.

---

## 16. Fuera de alcance de 13.2A

No implementar todavía:

- storage persistente V4;
- operación preparada persistida;
- flush V4;
- drafts V4;
- retry de red;
- runtime cut;
- UI de recovery;
- navegación productiva;
- cleanup V3.

Eso continúa en Fase 13.3.

---

## 17. Gate de 13.2A

Debe quedar demostrado mediante tests:

```text
A active
→ snapshot A

A recovery + bootstrap B active
→ snapshot A permanece
→ snapshot B existe
```

```text
delta A
→ actualiza A
→ no modifica B
```

```text
bootstrap sin A en recovery
→ A no es entregable
→ no existe mecanismo de purga de drafts en esta fase
```

```text
recovery sin delivery state
→ helper devuelve no planificable
→ no reconstruye prioridad
```

Una vez validado este gate se puede retomar Fase 13.3.
