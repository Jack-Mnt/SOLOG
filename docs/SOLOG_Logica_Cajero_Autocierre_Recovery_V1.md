# SOLOG — Lógica Cajero — Autocierre y Recovery Transparente V1

**Estado:** CONGELADO — DELTA APROBADO  
**Fecha:** 2 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — ciclo de vida operativo / recovery / idempotencia / frontend  
**Rama:** `admin-work`

---

## 1. Motivo del delta

Durante el smoke real de Fase 14 se validó que la transición `active → recovery` funciona técnicamente, pero la UX actual expone demasiados pasos internos al cajero:

```text
sesión vence
→ recovery
→ actualizar
→ enviar pendientes
→ finalizar conteo
```

Recovery se conserva como mecanismo técnico de seguridad, pero deja de ser un estado que el usuario deba operar manualmente en el flujo normal.

Este documento congela la nueva política de cierre automático al vencer una sesión.

---

## 2. Autoridad y precedencia

Fuentes superiores que permanecen vigentes:

1. `docs/SOLOG_Backend_Contrato_Cajero_V4.md` — autoridad del wire contract/RPC desplegado.
2. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md` — autoridad funcional general del Motor.
3. **Este delta** — prevalece únicamente para la política de expiración, autocierre, UX de recovery y descarte seguro descritos aquí.
4. `docs/SOLOG_Integracion_Cajero_Recovery_Estado_Operacional_V1.md`
5. `docs/SOLOG_Correccion_Cajero_Runtime_V4_PostCutover_V1.md`
6. documentación frontend anterior.

Todo lo no reemplazado explícitamente permanece vigente.

No se modifica retroactivamente la semántica histórica de sesiones ya cerradas.

---

## 3. Decisión principal

Recovery sigue existiendo en backend durante:

```text
recovery_until = expira_at + 2 horas
```

pero en UX se vuelve **transparente**.

Al alcanzar `expira_at`, SOLOG debe intentar automáticamente:

```text
bloquear nuevas capturas
→ resolver pendientes entregables de la sesión
→ finish explícito
→ sesión finalizada
```

El usuario no debe tener que:

- comprender el estado `recovery`;
- pulsar un botón de actualización para entrar en recovery;
- enviar manualmente pendientes en el caso normal;
- pulsar manualmente `Finalizar conteo` solo porque venció el tiempo.

---

## 4. Caso A — vencimiento sin pendientes

Si al alcanzar `expira_at` la sesión no tiene drafts ni operación pendiente:

```text
active
→ recovery técnico
→ finish automático
→ finalizado
```

Resultado UX:

- no mostrar recovery;
- no mostrar `Sesión vencida` como estado terminal;
- volver a Inicio;
- permitir un nuevo `start` cuando el backend lo autorice y exista stock vigente.

---

## 5. Caso B — vencimiento con pendientes y envío exitoso

Si existen drafts capturados válidamente antes de `expira_at`:

```text
expira_at
→ bloquear captura
→ flush automático
→ confirmar todos los batches
→ finish automático
→ finalizado
```

Reglas:

- conservar `contado_at/recontado_at` originales;
- usar la misma lógica de batch V4;
- respetar `next_action`, queues, `groups_revision` y delivery state originales;
- preservar `operation_id` por operación;
- no regenerar IDs ante retry;
- no mover drafts a otra sesión;
- no crear capturas nuevas durante recovery.

Mientras se ejecuta el cierre automático, la UI puede mostrar:

```text
Finalizando conteo…
```

No exponer detalles técnicos de recovery.

---

## 6. Caso C — fallo definitivo conocido

Si backend responde de forma definitiva que el envío no pudo completarse y no existe ambigüedad sobre si fue aplicado:

La sesión permanece técnicamente en recovery y los drafts permanecen locales.

UX:

> No se pudieron guardar algunos conteos. Tus conteos permanecen guardados en este dispositivo.

Acciones:

```text
[ Reintentar envío ]   [ Descartar conteos ]
```

También se mantiene funcional el botón existente `Enviar pendientes`.

### Descartar conteos

Solo se habilita cuando sea seguro afirmar que no existe una operación cuyo resultado sea incierto.

Al confirmar descarte:

```text
eliminar drafts locales descartables de esa sesión
→ finish explícito de la recovery
→ confirmar finalizado
→ liberar sesión
```

El descarte es una acción destructiva y debe usar confirmación explícita.

No debe borrar evidencia de una operación preparada incierta.

---

## 7. Caso D — resultado incierto

Ejemplos:

```text
request enviado
→ timeout
```

o:

```text
SOLOG_OPERATION_IN_PROGRESS
```

En estos casos no se sabe si backend confirmó el lote.

Regla:

```text
NO permitir Descartar
NO generar nuevo operation_id
NO borrar prepared operation
NO borrar drafts asociados
```

UX:

> Estamos verificando si el último envío fue recibido.

Acción disponible:

```text
[ Reintentar ]
```

El retry debe reproducir exactamente la operación preparada original.

Después de obtener un resultado definitivo/replay, la UI puede volver al caso B o C según corresponda.

---

## 8. Conflicto de idempotencia

`SOLOG_IDEMPOTENCY_CONFLICT` no se considera un fallo descartable automático.

Regla:

- conservar operación y evidencia;
- bloquear descarte;
- mostrar feedback de conflicto;
- no inventar una operación alternativa;
- requerir resolución explícita antes de cerrar la sesión.

---

## 9. Política de nuevo start

Mientras exista una recovery propia con:

- drafts pendientes;
- operación preparada;
- cierre automático aún no confirmado;
- error de entrega pendiente de resolución;

el frontend no debe permitir iniciar una nueva sesión desde ese mismo flujo operativo.

Después de:

```text
finish confirmado
```

la sesión deja de bloquear.

El backend puede conservar su capacidad arquitectónica de coexistencia `active + recovery`; este delta no elimina esa capacidad general. La restricción aquí es una política UX/operacional del Cajero para no abandonar trabajo pendiente.

---

## 10. Etiquetas UX

Estados visibles recomendados:

### Durante autocierre

```text
Finalizando conteo…
```

### Fallo de envío

```text
Envío pendiente
```

### Stock vencido

Puede mantenerse como estado del inventario, pero no debe confundirse con el lifecycle de la sesión.

Evitar usar `Recovery` como término visible para el cajero.

Evitar tratar `Sesión vencida` como sinónimo de `sin posibilidad de entrega`.

---

## 11. Navegación durante cierre/recovery

Al alcanzar `expira_at`:

- nuevas capturas quedan bloqueadas;
- módulos de captura pueden quedar no disponibles;
- Inicio funciona como superficie de estado;
- Historial puede permanecer disponible si no interfiere con el cierre;
- acciones de envío/retry se muestran únicamente cuando son necesarias.

No se requiere un botón manual `Finalizar conteo` durante el camino feliz de expiración.

---

## 12. Logout

La política de logout seguro permanece.

Si el usuario pulsa `Salir` durante:

- autocierre;
- recovery con drafts;
- operación incierta;

SOLOG debe intentar completar la misma orquestación segura antes de cerrar autenticación.

No cerrar autenticación dejando trabajo incierto abandonado.

---

## 13. Backend

El contrato público V4 actual ya dispone de:

- `save_batch`;
- `recount_save_batch`;
- `finish`;
- recovery con `pending_delivery_allowed`;
- idempotencia por `operation_id`.

Por tanto, esta decisión **no exige inicialmente una nueva RPC ni un nuevo estado backend**.

Antes de implementar debe realizarse preflight técnico para confirmar que todos los errores de mutación pueden clasificarse de forma suficiente entre:

- resultado definitivo;
- resultado incierto;
- conflicto de idempotencia.

Si esa clasificación no es suficiente, el bloqueo vuelve a ChatGPT/backend antes de pedir implementación frontend a Codex.

---

## 14. Persistencia local

Se preservan las decisiones V4 existentes:

- drafts persistidos por sesión;
- delivery state por `conteo_id`;
- prepared operation persistida antes del request;
- receipt persistido antes de limpieza local;
- retries exactos;
- registros `finished` no bloqueantes;
- no purga silenciosa por refresh.

El autocierre debe reutilizar estas garantías, no crear una segunda ruta de persistencia.

---

## 15. Disparo del autocierre

El cierre automático debe activarse cuando el frontend detecte que la sesión visible ha cruzado `expira_at`.

Debe ser:

- idempotente;
- serializado con el mismo lock `busy`;
- seguro ante refresh/reload;
- reanudable desde storage si el navegador se recarga;
- incapaz de duplicar batches o finish.

No implementar polling de backend como requisito del flujo.

El reloj frontend puede detectar el cruce temporal, pero la autorización efectiva de delivery/finish sigue viniendo del backend.

---

## 16. Reload durante autocierre

Caso obligatorio:

```text
expira_at
→ flush/finish preparado
→ reload
```

Resultado esperado:

- storage conserva operación preparada;
- bootstrap recupera lifecycle vigente;
- runtime reanuda/resuelve la operación exacta;
- no genera nuevos UUID;
- no pierde drafts;
- no requiere que el usuario reconstruya manualmente el estado.

---

## 17. Casos de aceptación

### A. Sin pendientes

```text
active
→ expira_at
→ finish automático
→ finalizado
→ Inicio
```

### B. Con drafts

```text
active + drafts
→ expira_at
→ flush automático
→ confirmación
→ finish automático
→ finalizado
```

### C. Fallo definitivo

```text
flush
→ rechazo definitivo
→ conservar drafts
→ mostrar Reintentar + Descartar
```

### D. Resultado incierto

```text
flush
→ timeout / in progress
→ conservar prepared operation
→ Descartar deshabilitado
→ Reintentar misma operación
```

### E. Replay

```text
retry
→ replay válido
→ adoptar respuesta
→ continuar autocierre
→ finish
```

### F. Descartar seguro

```text
fallo definitivo
→ usuario confirma Descartar
→ borrar drafts descartables
→ finish
→ finalizado
```

### G. Reload

```text
autocierre en curso
→ reload
→ reanudar estado persistido
→ no duplicar
```

### H. Logout

```text
autocierre/recovery pendiente
→ Salir
→ resolver misma orquestación
→ logout solo después de cierre seguro
```

---

## 18. Evidencia requerida para implementación

La implementación no se considera validada sin:

- tests dirigidos de todos los casos A–H;
- retry con mismo `operation_id`;
- reload real/simulado;
- browser smoke V4;
- suite V4 completa;
- suite global;
- lint;
- build;
- `git diff --check`;
- smoke real contra Supabase para al menos:
  - vencimiento con drafts y autocierre exitoso;
  - vencimiento sin drafts;
  - retry de fallo simulado.

---

## 19. Estado de Fase 14

El smoke real detectó una limitación de UX/operación en el lifecycle actual.

La Fase 14 queda **pausada en definición aprobada** hasta implementar y validar este delta.

No se considera fallo del Motor de recovery: recovery funcionó y aceptó correctamente drafts capturados antes de `expira_at`. El cambio redefine cómo el frontend orquesta y presenta ese mecanismo.

---

## 20. Fuente primaria para el próximo bloque

Para la implementación de esta mejora, la fuente primaria específica será:

`docs/SOLOG_Logica_Cajero_Autocierre_Recovery_V1.md`

Todo lo no reemplazado por este delta continúa rigiéndose por las fuentes superiores enumeradas en la sección 2.

---

## 21. Precisión aprobada post-preflight — descarte seguro y clasificación de fallos

**Estado:** CONGELADO — DECISIÓN APROBADA

Esta sección prevalece sobre cualquier formulación menos precisa de las secciones 6, 13 y 17 respecto de `Descartar conteos`, lifecycle no operable y clasificación de errores.

### 21.1. Descartar solo cuando sea seguro

`Descartar conteos` solo se habilita cuando se cumplan simultáneamente estas condiciones:

- no existe una operación cuyo resultado sea incierto;
- no existe una prepared operation ambigua;
- la sesión sigue presente en el lifecycle autoritativo;
- el estado vigente permite intentar un cierre seguro.

Al confirmar:

```text
eliminar únicamente drafts locales descartables de esa sesión
→ finish explícito de la recovery
→ confirmar finalizado
→ liberar sesión
```

El descarte es destructivo y requiere confirmación explícita.

No debe borrar evidencia de una operación preparada incierta.

### 21.2. Sesión ya no operable

Si backend indica que la sesión ya no admite delivery o `finish`, el frontend no debe fingir un cierre exitoso ni borrar datos locales por asumir que la sesión terminó.

Flujo:

```text
backend ya no permite operar
→ refrescar lifecycle autoritativo
→ comprobar estado real
```

Si backend confirma:

```text
finalizado
OR
expirado
```

los residuos locales no entregables pueden limpiarse mediante una acción explícita y segura.

Si backend todavía no confirma un estado terminal:

```text
NO borrar drafts
NO borrar prepared operation
NO declarar sesión cerrada
```

### 21.3. Clasificación mínima de errores

El preflight confirmó que el contrato V4 actual es suficiente para implementar el autocierre sin una nueva RPC ni un nuevo estado backend.

El frontend debe distinguir al menos:

- rechazo backend explícito y conocido;
- resultado incierto de transporte/respuesta;
- `SOLOG_OPERATION_IN_PROGRESS`;
- `SOLOG_IDEMPOTENCY_CONFLICT`.

Un código `SOLOG_*` realmente devuelto por el RPC demuestra que backend respondió, pero no implica por sí solo que `Descartar` sea seguro. La elegibilidad depende además del lifecycle autoritativo y de que no exista una operación incierta.

Se consideran resultados inciertos, entre otros:

- timeout;
- fallo de red/transporte;
- respuesta vacía;
- respuesta contractual inválida;
- error desconocido sin código backend autoritativo.

En resultado incierto:

```text
NO descartar
NO generar nuevo operation_id
CONSERVAR prepared operation
REINTENTAR la misma operación
```

### 21.4. Casos de aceptación adicionales

#### Descarte seguro

```text
fallo definitivo
+ sin operación incierta
+ lifecycle permite cierre
→ usuario confirma Descartar
→ borrar drafts descartables
→ finish
→ finalizado
```

#### Sesión no operable

```text
backend rechaza delivery/finish
→ refrescar lifecycle
→ finalizado/expirado confirmado
→ permitir limpiar residuos locales

estado no terminal
→ conservar drafts y prepared operation
→ no fingir cierre
```
