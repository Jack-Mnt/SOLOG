# SOLOG — Corrección Cajero — Smoke Fase 14 Autocierre V1

**Estado:** CONGELADO — REPORTE DE VALIDACIÓN Y PENDIENTES  
**Fecha:** 2 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — ciclo de vida operativo / recovery / autocierre  
**Rama:** `admin-work`

---

## 1. Propósito

Este documento congela el estado del smoke real del Cajero V4 dentro de la Fase 14, distinguiendo:

- lo ya validado con backend real;
- lo detectado durante el smoke;
- lo corregido posteriormente;
- lo que todavía falta validar específicamente por los cambios de autocierre y recovery transparente.

No reemplaza las fuentes funcionales ni contractuales del Cajero V4. Resume evidencia de validación y define el smoke mínimo restante.

---

## 2. Fuentes relacionadas

Continúan vigentes:

1. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`
2. `docs/SOLOG_Backend_Contrato_Cajero_V4.md`
3. `docs/SOLOG_Integracion_Cajero_Frontend_Contrato_V4_V1.md`
4. `docs/SOLOG_Integracion_Cajero_Recovery_Estado_Operacional_V1.md`
5. `docs/SOLOG_Correccion_Cajero_Runtime_V4_PostCutover_V1.md`
6. `docs/SOLOG_Logica_Cajero_Autocierre_Recovery_V1.md`

Para la política nueva de autocierre/recovery transparente prevalece:

`docs/SOLOG_Logica_Cajero_Autocierre_Recovery_V1.md`

Este archivo funciona como reporte congelado de smoke y no redefine contratos.

---

# 3. Smoke ya realizado y validado

## 3.1 Autorización, routing y bootstrap

Validado con Casuarinas:

- usuario Cajero Casuarinas operativo;
- dispositivo autorizado;
- routing correcto hacia Cajero;
- bootstrap V4 real;
- aislamiento por sede/dispositivo;
- frontend sin acceso directo a tablas de `inventario`.

**Estado:** ✅ validado

---

## 3.2 Snapshot y creación de sesión

Se validó:

```text
snapshot confirmado
→ Inicio habilita sesión
→ start V4
→ conteo creado
```

Sesión principal del smoke:

`184a6ba5-724e-4ca1-b133-751ab4fce872`

Se comprobó que `expira_at` quedaba correctamente limitado por la validez del snapshot.

**Estado:** ✅ validado

---

## 3.3 Prioridad Revisar

La sesión inició con 7 reconteos accionables históricos.

Se validó:

```text
next_action = review
```

antes de permitir cobertura normal.

### Coincide

Cielo 625 ml:

```text
stock teórico reconteo = 9
stock físico = 9
→ diferencia final = 0
→ Coincide
```

### Confirmada

Ejemplos:

```text
Jack Daniel's
3 → 4
→ Confirmada
```

```text
San Luis con gas
14 → 108
→ Confirmada
→ conserva diferencia original menor
```

### Inconsistente

Ejemplos:

```text
JW Red
13 → 10
→ Inconsistente
```

```text
Old Times
6 → 5
→ Inconsistente
```

Finalmente:

```text
review_pending = 0
next_action = coverage
```

**Estado:** ✅ validado

---

## 3.4 Cobertura y conteo normal

Se validó envío real de conteos normales:

- teórico 0 → físico 0;
- teórico 0 → físico positivo;
- stock teórico negativo;
- resultados Coincide;
- resultados Recontar.

Resultado observado:

```text
5 Coincide
6 Recontar
```

La cobertura avanzó correctamente.

También se confirmó que una diferencia nueva no pasa inmediatamente a Revisar si todavía no existe snapshot posterior.

**Estado:** ✅ validado

---

## 3.5 Gate por snapshot posterior — ausencia

Durante este smoke no se subió un nuevo snapshot después de generar las nuevas diferencias.

Se confirmó:

```text
Recontar
+ sin snapshot posterior
→ no accionable todavía
```

La cola Revisar permaneció en 0.

**Estado:** ✅ validado para ausencia de snapshot posterior

### Pendiente complementario

Aún falta probar de extremo a extremo:

```text
Recontar
→ nuevo snapshot ConeXion
→ primer_snapshot_posterior_id
→ pasa a Revisar
```

**Estado:** ⏳ pendiente

---

## 3.6 Expiración de sesión

Se prepararon 10 drafts locales antes de `expira_at`.

Al expirar:

- nuevas capturas quedaron bloqueadas;
- los drafts permanecieron locales;
- backend pasó a recovery;
- `capture_allowed = false`;
- `pending_delivery_allowed = true`.

**Estado:** ✅ validado

---

## 3.7 Delivery tardío durante recovery

Los 10 drafts fueron enviados después de `expira_at`.

Supabase confirmó:

```text
inserted_after_expiry = 10
```

y todos conservaron:

```text
contado_at < expira_at
```

Flujo validado:

```text
captura válida antes de vencimiento
→ envío después de vencimiento
→ backend acepta durante recovery
```

Cobertura:

```text
24 / 488
→ 34 / 488
```

No se observó pérdida ni duplicación de datos.

**Estado:** ✅ validado

---

## 3.8 Persistencia local

Se comprobó que:

- drafts permanecieron tras el vencimiento;
- no fueron movidos a otra sesión;
- no se perdieron al actualizar;
- fueron enviados contra su `conteo_id` original.

**Estado:** ✅ validado

---

# 4. Problema detectado durante el smoke

Después de refresh se observó:

```text
panel_state = null
recovery_sessions = [sesión]
```

pero frontend dependía de `panel_state` para poder ejecutar `finish`.

Además, el flujo requería intervención manual:

```text
Actualizar
→ Enviar pendientes
→ Finalizar conteo
```

Esto originó la decisión congelada de:

**autocierre automático + recovery transparente**

Fuente:

`docs/SOLOG_Logica_Cajero_Autocierre_Recovery_V1.md`

---

# 5. Estado final de la sesión usada

La sesión:

`184a6ba5-724e-4ca1-b133-751ab4fce872`

quedó finalmente:

```text
estado = finalizado
```

con:

```text
finalizado_at = 2026-10-02 09:54:10 UTC
```

aproximadamente:

```text
4:54 a. m. Lima
```

No quedó recovery huérfana ni sesión activa.

**Estado:** ✅ cerrado

---

# 6. Cambios implementados después del smoke

Tras detectar el problema anterior se implementó y validó técnicamente:

- resolución de scope para recovery sin `panel_state`;
- autocierre al cruzar `expira_at`;
- flush automático de drafts;
- finish automático;
- clasificación de fallos;
- preservación de `operation_id`;
- bloqueo de retry automático tras reload;
- descarte seguro;
- limpieza local solo tras lifecycle terminal confirmado;
- bloqueo de nuevo start mientras exista recovery no resuelta;
- UX sin exponer Recovery como concepto operativo.

Validaciones técnicas completadas con éxito:

- tests dirigidos;
- suite global;
- lint;
- build;
- `git diff --check`;
- browser smoke V4.

**Estado:** ✅ validado técnicamente

---

# 7. Smoke todavía pendiente por los cambios nuevos

## 7.1 Autocierre sin drafts

Esperado:

```text
active
→ expira_at
→ no hay drafts
→ finish automático
→ finalizado
```

Debe verificarse con browser real + Supabase.

**Estado:** ⏳ pendiente

---

## 7.2 Autocierre con drafts

Antes se validó envío manual durante recovery.

Ahora debe validarse:

```text
active + drafts
→ expira_at
→ flush automático
→ finish automático
→ finalizado
```

Verificar:

- cantidad exacta de drafts;
- timestamps originales;
- ausencia de duplicados;
- pendientes locales = 0;
- sesión finalizada;
- usuario sin intervención manual.

**Estado:** ⏳ pendiente

---

## 7.3 Reload durante/tras expiry

Esperado:

```text
expiry / autocierre
→ reload
→ reconstrucción desde storage + bootstrap
→ no duplicar
→ continuar/resolver correctamente
```

Verificar:

- mismo `operation_id`;
- no generar UUID nuevo;
- no perder drafts;
- no mostrar flujo antiguo de recovery.

**Estado:** ⏳ pendiente real  
**Tests:** ✅

---

## 7.4 Timeout / resultado incierto

Smoke controlado requerido:

```text
request
→ timeout
→ uncertain
→ conservar prepared operation
→ Reintentar
```

Debe comprobarse que:

- no aparece Descartar;
- se conserva mismo `operation_id`;
- mismo payload;
- mismos items;
- mismos timestamps.

**Estado:** ⏳ pendiente smoke controlado  
**Tests:** ✅

---

## 7.5 Fallo conocido + descarte seguro

Esperado:

```text
rechazo conocido
→ Envío pendiente
→ Reintentar envío
→ Descartar conteos
```

Comprobar:

- confirmation destructiva;
- no borrar antes de confirmar;
- borrar solo datos descartables;
- finish si lifecycle lo permite.

Se recomienda validar con mock/browser controlado y no provocar artificialmente errores destructivos en backend real.

**Estado:** ⏳ pendiente smoke controlado  
**Tests:** ✅

---

## 7.6 Conflicto idempotente

Esperado:

```text
SOLOG_IDEMPOTENCY_CONFLICT
→ conservar operación
→ no permitir descarte
```

La cobertura mediante tests se considera suficiente.

**Estado:** ✅ validado técnicamente  
**Smoke real:** no requerido

---

## 7.7 Logout durante autocierre/recovery

Nuevo comportamiento:

```text
Salir
→ resolver recovery
→ finish
→ logout
```

Ya cubierto por tests.

Se recomienda un smoke humano corto.

**Estado:** ⏳ recomendable

---

## 7.8 Nuevo start después de recovery

Debe comprobarse:

```text
recovery pendiente
→ start bloqueado
```

y después:

```text
finish confirmado
→ recovery desaparece
→ start permitido si snapshot vigente
```

**Estado:** ⏳ pendiente

---

## 7.9 Stock vencido vs lifecycle

Validar visualmente:

- `Stock vencido` puede seguir visible como estado del inventario;
- no debe aparecer `Recovery`;
- no debe aparecer `Sesión vencida` como flujo operativo pendiente;
- la sesión puede estar correctamente finalizada aunque el stock esté vencido.

**Estado:** ⏳ pendiente visual

---

# 8. Smoke funcional todavía pendiente del Motor original

Independientemente del autocierre, todavía falta validar:

```text
Recontar
→ nuevo snapshot posterior
→ primer_snapshot_posterior_id
→ aparece en Revisar
```

Este punto no fue introducido por el cambio de autocierre, pero sigue pendiente para cerrar completamente el flujo real probado del Motor.

**Estado:** ⏳ pendiente

---

# 9. Matriz de estado

| Escenario | Estado |
|---|---|
| Autorización de dispositivo | ✅ |
| Bootstrap V4 real | ✅ |
| Start real | ✅ |
| Prioridad Revisar | ✅ |
| Reconteo Coincide | ✅ |
| Reconteo Confirmada | ✅ |
| Reconteo Inconsistente | ✅ |
| Revisar → Cobertura | ✅ |
| Conteo normal | ✅ |
| Diferencias nuevas | ✅ |
| Cobertura quincenal | ✅ |
| Drafts persistentes | ✅ |
| Expiración bloquea captura | ✅ |
| Backend entra en recovery | ✅ |
| Delivery tardío en recovery | ✅ |
| Timestamp pre-expiry preservado | ✅ |
| Sin duplicación observada | ✅ |
| Sesión anterior finalizada | ✅ |
| Autocierre sin drafts | ⏳ |
| Autocierre con drafts | ⏳ |
| Reload durante autocierre | ⏳ |
| Timeout + retry mismo operation_id | ⏳ smoke |
| Descarte seguro | ⏳ smoke controlado |
| Conflict UX | ✅ tests |
| Logout durante autocierre/recovery | ⏳ recomendable |
| Bloqueo/reapertura de nuevo start | ⏳ |
| Snapshot posterior → Revisar | ⏳ |
| Separación visual Stock vencido / sesión | ⏳ |

---

# 10. Smoke mínimo requerido para cerrar Fase 14

## Smoke real

### A. Vencimiento sin drafts

```text
active
→ expira
→ finish automático
```

### B. Vencimiento con drafts

```text
active + drafts
→ expira
→ flush automático
→ finish automático
```

### C. Reload durante/tras expiry

```text
expiry
→ reload
→ restauración
→ sin duplicación
```

### D. Snapshot posterior

```text
Recontar
→ nuevo snapshot
→ pasa a Revisar
```

## Smoke controlado

### E. Timeout

```text
timeout
→ uncertain
→ retry mismo operation_id
→ sin descarte
```

---

# 11. Criterio de cierre

Fase 14 podrá considerarse cerrada cuando:

- A, B, C y D estén validados con evidencia real;
- E esté validado mediante browser/mock controlado;
- no exista desviación entre frontend y contrato V4;
- Supabase confirme el lifecycle esperado;
- no existan duplicados ni pérdidas de drafts;
- el usuario no tenga que operar manualmente recovery en el camino feliz.
