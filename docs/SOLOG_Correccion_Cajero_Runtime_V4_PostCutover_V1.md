# SOLOG — Corrección Cajero Runtime V4 Post-Cutover V1

**Estado:** CONGELADO — DELTA APROBADO  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** B — corrección funcional/estructural frontend  
**Rama:** `admin-work`

---

## 1. Autoridad y alcance

Este documento es un **delta** sobre la implementación de Fase 13.5 y sobre:

1. `docs/SOLOG_Backend_Contrato_Cajero_V4.md`
2. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
3. `docs/SOLOG_Integracion_Cajero_Recovery_Estado_Operacional_V1.md`
4. `docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`

Las fuentes 1–4 conservan su autoridad. Este delta prevalece únicamente sobre el comportamiento post-cutover descrito aquí.

Todo lo no reemplazado explícitamente permanece vigente.

---

## 2. Objetivo de 13.5A

Corregir cuatro riesgos detectados después del runtime cut V4:

1. persistencia idempotente de `start` ante recarga;
2. logout seguro con resolución/finish de sesión;
3. sesiones `finished` con residuos locales que no deben bloquear trabajo futuro;
4. retirar el botón global permanente `Actualizar panel` y conservar refresh solo de forma contextual.

No modifica backend, Motor, contrato RPC ni reglas de prioridad.

---

## 3. Persistencia idempotente de START

### Problema

La implementación de 13.5 mantiene en memoria:

```text
startRequest
```

Esto conserva el mismo `operation_id` durante retries dentro del mismo runtime, pero se pierde con una recarga.

Caso de riesgo:

```text
start enviado
→ backend procesa
→ respuesta se pierde
→ navegador recarga
→ nuevo start genera otro operation_id
```

Eso rompe la garantía frontend de reproducir la misma operación tras una respuesta incierta.

### Decisión

Persistir una **operación start preparada** antes del primer request.

Debe conservar como mínimo:

```text
operation_id
device identity
business payload de start
status
```

El payload de negocio es:

```json
{
  "operation_id": "uuid",
  "device_token": "string"
}
```

El `device_token` puede reconstruirse desde la identidad runtime si la implementación evita persistir secretos localmente, siempre que el retry reproduzca el mismo request efectivo.

### Scope

Como antes de `start` todavía no existe `conteo_id`, la persistencia debe estar indexada por identidad:

```text
usuario_id
sede_id
dispositivo_id
```

No mezclarla con registros de sesión V4 que exigen `conteo_id`.

### Estados mínimos

Conceptualmente:

```text
ready
uncertain
in_progress
conflict
```

Puede reutilizarse la semántica de prepared operations de 13.3.

### Reglas

- persistir antes del primer request;
- timeout/red conserva el mismo `operation_id`;
- `SOLOG_OPERATION_IN_PROGRESS` conserva la misma operación;
- `SOLOG_IDEMPOTENCY_CONFLICT` bloquea y no regenera UUID;
- respuesta/replay válido elimina la operación start preparada después de adoptar el panel;
- refresh/bootstrap no debe borrar una operación start incierta;
- un start confirmado no debe repetirse.

---

## 4. Logout seguro

### Problema

El Header V4 actual ejecuta directamente el logout de autenticación.

Eso puede dejar una sesión `activo` abierta en backend.

### Decisión

`Salir` debe ejecutar una orquestación segura.

Caso con sesión activa:

```text
Salir
→ resolver pendientes entregables
→ si falla, NO cerrar autenticación
→ cuando no queden pendientes entregables
→ finish explícito de la sesión
→ si finish confirma
→ cerrar autenticación
```

Caso sin sesión activa:

```text
Salir
→ cerrar autenticación
```

### Recovery

Si existen recoveries con pendientes locales antes del logout:

- intentar resolverlas usando la misma política de `sendPending`;
- si no pueden resolverse, bloquear logout y conservar los datos;
- no purgar ni trasladar drafts.

### Errores

Si delivery o finish falla:

- no llamar `onLogout`;
- conservar operaciones preparadas y drafts;
- mostrar feedback mediante la política V4;
- permitir retry explícito.

### Concurrencia

Logout seguro participa del mismo bloqueo `busy` del runtime.

No ejecutar logout simultáneo con start/flush/finish.

---

## 5. Registros finished no bloqueantes

### Problema

Una sesión confirmada como `finished` puede conservar drafts locales fuera de queue por la política de no borrado silencioso.

Esos residuos son evidencia local, pero ya no son entregables.

No deben bloquear:

- un nuevo `start`;
- una nueva captura;
- `recoveryPending`;
- el contador operativo de pendientes enviables.

### Decisión

Para lógica operacional:

```text
record.finished === true
→ pending entregable = 0
→ no participa en recoveryPending
→ no bloquea start
→ no bloquea capture
```

Los datos pueden permanecer persistidos para revisión/cleanup futuro.

No borrarlos automáticamente en 13.5A.

### Contadores

Distinguir entre:

- **pendientes operativos/entregables**;
- **residuos históricos locales**.

La UI productiva de esta fase solo necesita que los residuos `finished` no se presenten como pendientes operativos.

---

## 6. Refresh contextual

### Problema

13.5 introdujo un botón global permanente:

```text
Actualizar panel
```

La UX previamente validada de Cajero no incluye un refresh global permanente.

### Decisión

Retirar el botón global de la pantalla normal.

Refresh manual puede aparecer únicamente cuando exista una razón contextual, por ejemplo:

- error que requiere refresh;
- capability/sesión denegada que exige volver a consultar backend;
- recovery bloqueada por estado potencialmente desactualizado;
- estado explícito de sesión que indique actualización necesaria.

No añadir polling.

No añadir un CTA de refresh cuando el panel está operando normalmente.

### Error policy

Si `getCashierV4ErrorPolicy(error).requiresRefresh === true`:

- mostrar CTA contextual de actualización junto al feedback correspondiente.

Si no requiere refresh:

- no mostrar ese CTA solo por conveniencia.

---

## 7. Invariantes preservados

13.5A no cambia:

1. `next_action` como autoridad operacional.
2. queues backend como membership.
3. recovery separada por `conteo_id`.
4. delivery_state por sesión.
5. prepared operations de save/recount/finish.
6. máximo 500 items.
7. History V2.
8. Route V2.
9. capability backend como autoridad.
10. ausencia de polling.
11. runtime productivo Cajero sobre V4.
12. módulos V3 todavía presentes hasta 13.6.

---

## 8. Casos de aceptación

### START + reload

```text
pre-session
→ persistir start operation A
→ request A
→ timeout
→ reload
→ retry
→ operation_id A
→ mismo payload
→ replay/response válido
→ limpiar start operation
```

### START conflict

```text
prepared start A
→ SOLOG_IDEMPOTENCY_CONFLICT
→ conservar A como conflict
→ no generar B
```

### Logout active limpio

```text
active sin pendientes
→ Salir
→ finish
→ respuesta finalizado
→ onLogout
```

### Logout con pendientes

```text
active/recovery con pendientes
→ Salir
→ flush
→ fallo
→ onLogout NO ejecutado
→ datos conservados
```

### Finished con residuos

```text
record.finished = true
+ drafts residuales
→ pendingCount operativo = 0
→ recoveryPending no incluye record
→ start/capture futura no bloqueada por ese record
```

### Refresh UX

```text
estado normal
→ no mostrar Actualizar panel

error requiresRefresh
→ mostrar CTA contextual Actualizar/Reintentar
```

---

## 9. Impacto esperado

Archivos probables:

- `src/features/solog/cajero/cajero.v4.runtime.ts`
- `src/features/solog/cajero/cajero.v4.storage.ts`
- `src/features/solog/cajero/cajero.v4.ui.tsx`
- `src/features/solog/cajero/cajero.app.tsx` si el cierre requiere coordinación adicional
- tests V4 dirigidos
- smoke browser V4

Modificar otros archivos solo si existe dependencia concreta.

---

## 10. Fuera de alcance

No realizar todavía:

- cleanup V3;
- eliminación de módulos/tests legacy;
- smoke real contra Supabase;
- cambios backend;
- cambios Admin;
- cambios Cloudflare;
- refactor general de Cajero;
- nuevas capacidades UX no relacionadas.

---

## 11. Gate de cierre

13.5A se cierra únicamente si:

1. start incierto sobrevive recarga con el mismo `operation_id`;
2. logout no deja sesión activa por omitir finish;
3. logout no elimina/abandona pendientes tras fallo;
4. registros `finished` no bloquean trabajo futuro;
5. desaparece el refresh global permanente;
6. existe refresh contextual cuando la política lo exige;
7. runtime productivo sigue 100% V4;
8. suite V4, browser smoke, suite global, lint, build y `git diff --check` pasan.
