# SOLOG — Reglas de Sesión y Vigencia de Stock para MVP

**Estado:** CONGELADO PARA IMPLEMENTACIÓN  
**Ámbito:** SOLOG + validaciones autoritativas necesarias en Supabase  
**Fuera de alcance:** implementación interna de ConeXion  
**Fecha de congelación:** 2026-08-31

---

## 1. Objetivo

Definir de forma definitiva las reglas operativas de:

- vigencia del stock usado por SOLOG;
- inicio, cierre y expiración de sesiones;
- temporizador de cierre;
- observaciones físicas y su snapshot de referencia;
- recuperación de buffers pendientes;
- reapertura de sesiones después de inactividad;
- reconteos pendientes;
- condiciones para iniciar una nueva sesión.

Estas reglas sustituyen las reglas anteriores de sesión que entren en conflicto con este documento.

---

## 2. Principios fundamentales

### 2.1 Supabase es autoritativo

Las reglas críticas de tiempo, vigencia, exclusividad y recuperación no pueden depender únicamente del frontend.

Supabase debe ser autoritativo para:

- hora de servidor;
- snapshot confirmado vigente;
- vigencia del snapshot;
- posibilidad de iniciar una sesión;
- exclusividad de una sesión activa por sede;
- expiración de la sesión;
- aceptación o rechazo de observaciones recuperadas.

El frontend representa estas reglas y mejora la UX, pero no puede sustituir su validación en backend.

### 2.2 El snapshot sigue congelándose por observación física

SOLOG conserva el modelo V3:

> Cada observación física guarda su propio `snapshot_referencia_id`.

Esto se mantiene por trazabilidad y reconstrucción histórica.

No significa que el frontend tenga que volver a descargar el stock al entrar a cada grupo.

### 2.3 La sesión queda subordinada a la vigencia del stock

La sesión ya no tiene una duración fija de dos horas desde su creación.

Su límite temporal deriva del snapshot vigente con el que se autoriza su inicio.

---

## 3. Vigencia del snapshot para SOLOG

### Regla S1 — Duración de vigencia

Para SOLOG, un snapshot confirmado es vigente durante dos horas desde su `capturado_at`.

```text
snapshot_expira_at = snapshot.capturado_at + 2 horas
```

### Regla S2 — Snapshot requerido

SOLOG solo puede iniciar una sesión si existe un snapshot:

- confirmado;
- perteneciente a la sede del cajero;
- vigente según `server_now`.

### Regla S3 — Snapshot vencido

Si no existe un snapshot vigente:

- no se puede iniciar una nueva sesión;
- SOLOG debe informar que se requiere actualizar el inventario;
- la operación se desbloquea cuando exista un nuevo snapshot confirmado y vigente.

Esto es un bloqueo operativo intencional, no un error del sistema.

### Regla S4 — Fuente temporal

Todas las decisiones de vigencia deben usar tiempo de servidor.

El frontend puede mantener un reloj local sincronizado a partir de `server_now`, pero no debe confiar exclusivamente en la hora del dispositivo.

---

## 4. Inicio de sesión

### Regla S5 — Margen mínimo para iniciar

Una sesión solo puede iniciarse cuando al snapshot vigente le queden **más de 5 minutos**.

```text
snapshot_expira_at - server_now > 5 minutos
```

Con 5 minutos exactos o menos:

```text
NO se permite iniciar sesión
```

### Regla S6 — Condiciones adicionales

Además del snapshot vigente y del margen superior a 5 minutos, permanecen vigentes:

- usuario activo;
- rol operativo permitido;
- cajero asociado a una sede;
- dispositivo SOLOG autorizado para esa sede;
- período operativo vigente/inaugurado;
- ausencia de otra sesión activa en la sede.

### Regla S7 — Una sesión activa por sede

Solo puede existir una sesión activa simultáneamente por sede.

La exclusividad debe garantizarse de forma autoritativa y segura en Supabase.

No debe depender de una comprobación previa realizada únicamente por frontend.

### Regla S8 — Apertura y cierre libre

Mientras se cumplan las condiciones de inicio, el usuario puede:

- iniciar una sesión;
- cerrarla manualmente;
- iniciar posteriormente otra sesión;

tantas veces como resulte operativo.

Cada nueva sesión recibe un nuevo `conteo_id`.

---

## 5. Duración y expiración de la sesión

### Regla S9 — Límite temporal de la sesión

La sesión expira un minuto antes de que expire el snapshot que permitió iniciarla.

```text
sesion.expira_at = snapshot_expira_at - 1 minuto
```

Ejemplo:

```text
Snapshot capturado:   10:00
Snapshot expira:      12:00
Sesión expira:        11:59
```

### Regla S10 — Margen de seguridad

Existe deliberadamente un minuto entre:

- cierre obligatorio de la sesión;
- expiración del snapshot.

Durante ese minuto no pueden realizarse nuevas observaciones bajo la sesión anterior.

### Regla S11 — Cierre manual

Si el usuario cierra antes de `expira_at`, la sesión queda:

```text
finalizado
```

### Regla S12 — Cierre por tiempo

Si alcanza `expira_at`, la sesión queda:

```text
expirado
```

### Regla S13 — Expiración independiente del navegador

La expiración no depende de:

- que la página siga abierta;
- JavaScript;
- que el temporizador visual se ejecute;
- que el usuario vuelva a SOLOG.

Supabase debe considerar la sesión expirada cuando:

```text
server_now >= expira_at
```

aunque el dispositivo haya estado apagado o la página inactiva.

---

## 6. Temporizador de cierre

### Regla S14 — Inicio del aviso

En los últimos **2 minutos de vida de la sesión**, el frontend muestra un temporizador visible.

Ejemplo para una sesión que expira a las 11:59:

```text
11:57 → 02:00
11:58 → 01:00
11:59 → cierre
```

### Regla S15 — Sin polling por segundo

El temporizador se calcula localmente usando:

- `expira_at`;
- referencia sincronizada de `server_now`.

No debe hacer una llamada a Supabase cada segundo.

### Regla S16 — Función del temporizador

El temporizador es informativo y preventivo.

No es la autoridad que expira la sesión.

---

## 7. Carga y uso del stock durante la sesión

### Regla S17 — No recargar por grupo

El hecho de guardar `snapshot_referencia_id` por observación no obliga a realizar una nueva RPC al ingresar a cada grupo.

El frontend puede:

1. cargar los grupos necesarios;
2. mantenerlos en memoria/caché local durante la sesión;
3. realizar las capturas físicas;
4. sincronizar las observaciones.

### Regla S18 — Congelación autoritativa al guardar

Al persistir una observación, Supabase conserva:

- `snapshot_referencia_id`;
- `stock_teorico`;
- `stock_fisico`;
- `contado_at`;
- `client_observation_id`.

### Regla S19 — Snapshot posterior no reinterpreta una observación

Una observación física realizada bajo un snapshot válido conserva permanentemente ese contexto.

Si posteriormente existe un snapshot nuevo, no debe:

- sustituir `snapshot_referencia_id`;
- modificar `stock_teorico`;
- modificar `contado_at`;
- recalcular retroactivamente la diferencia usando el snapshot nuevo.

---

## 8. Capturas permitidas

### Regla S20 — Ventana válida de captura

Una observación normal solo es válida si fue físicamente capturada dentro de la ventana autorizada de la sesión.

```text
sesion.iniciado_at <= contado_at <= sesion.expira_at
```

### Regla S21 — Después de expirar

Una vez alcanzado `sesion.expira_at`:

- no se permiten nuevas observaciones físicas bajo esa sesión;
- sí se pueden intentar sincronizar observaciones que ya habían sido capturadas válidamente antes de expirar.

---

## 9. Inactividad y regreso después del vencimiento

### Regla S22 — Regreso con sesión vencida

Si el usuario abandona la plataforma durante una sesión y vuelve después de su expiración:

1. SOLOG reconoce la sesión anterior como expirada;
2. revisa si existe buffer local pendiente;
3. ejecuta el flujo de recuperación;
4. finaliza el contexto operativo de la sesión anterior;
5. refresca el estado;
6. evalúa el snapshot vigente;
7. aplica nuevamente las reglas normales de inicio.

### Regla S23 — Sin buffer pendiente

Si no existe buffer:

```text
sesión expirada
→ cerrar/confirmar estado
→ refrescar
→ obtener snapshot actual
→ evaluar nueva sesión
```

---

## 10. Buffer local pendiente

### Regla S24 — Datos inmutables del buffer

Cada observación pendiente conserva exactamente:

- `conteo_id`;
- `client_observation_id`;
- `grupo_id`;
- `stock_fisico`;
- `contado_at`.

Estos datos no se modifican para intentar recuperar la observación.

### Regla S25 — No reasignar

Una observación pendiente de una sesión anterior nunca puede:

- recibir un nuevo `conteo_id`;
- incorporarse a una nueva sesión;
- adoptar el timestamp de reintento;
- adoptar el snapshot de una sesión posterior.

### Regla S26 — Recuperación contra contexto histórico

Supabase debe procesar la observación según su `contado_at` y su sesión original.

Si la observación fue válida cuando se capturó, un snapshot nuevo no participa en su cálculo original.

---

## 11. Flujo definitivo de recuperación

### Regla S27 — Primer intento

Al detectar:

```text
sesión expirada + buffer pendiente
```

SOLOG intenta sincronizar los elementos pendientes.

### Regla S28 — Resultado parcial

Si algunos elementos son aceptados y otros no:

- se eliminan del buffer los aceptados;
- el reintento se realiza únicamente sobre los elementos restantes.

### Regla S29 — Segundo intento

Los elementos no recuperados reciben **un único reintento adicional**.

Los identificadores y timestamps originales permanecen intactos.

### Regla S30 — Limpieza final

Si después del segundo intento siguen existiendo elementos no recuperados:

```text
se eliminan del buffer
```

La prioridad es evitar que una sesión antigua bloquee indefinidamente la continuidad operativa.

### Regla S31 — Fin obligatorio del flujo

Independientemente de si:

- todo fue recuperado;
- hubo recuperación parcial;
- nada fue recuperado;

el flujo termina cerrando/abandonando definitivamente el contexto de la sesión anterior.

Después:

```text
refrescar estado
→ obtener snapshot actual
→ evaluar nueva sesión
```

### Regla S32 — Sin deadlock por buffer

Un buffer pendiente no puede impedir indefinidamente que la sede vuelva a operar.

El flujo siempre dispone de una salida:

```text
intento
→ reintento
→ limpieza
→ cierre
```

---

## 12. Sesión superada por actividad posterior

### Regla S33 — Protección `SUPERSEDED`

Se mantiene:

```text
SOLOG_EXPIRED_SESSION_SUPERSEDED
```

como protección defensiva.

### Regla S34 — Significado

Si ya existe una sesión posterior iniciada en la misma sede, una sesión antigua no puede insertar observaciones recuperadas de manera insegura.

### Regla S35 — Tratamiento

Ante `SOLOG_EXPIRED_SESSION_SUPERSEDED`:

- no continuar reintentando ese buffer;
- limpiar los pendientes de ese contexto;
- cerrar/abandonar la sesión anterior;
- refrescar el estado actual.

La sesión posterior tiene prioridad operativa.

---

## 13. Reconteos

### Regla S36 — Inicio de reconteo

Un nuevo reconteo solo puede comenzar físicamente mientras la sesión esté activa.

### Regla S37 — Referencia congelada

`recount_start` continúa congelando `snapshot_reconteo_id`.

### Regla S38 — Reconteo capturado antes del cierre

Si un reconteo fue físicamente capturado antes de `sesion.expira_at` pero quedó pendiente de sincronización, debe poder recuperarse con la misma filosofía del buffer normal.

### Regla S39 — Snapshot posterior

Un snapshot posterior no modifica:

- `snapshot_reconteo_id`;
- el contexto teórico congelado del reconteo;
- el momento físico original del reconteo.

### Regla S40 — No crear reconteos retroactivos

Después de expirar la sesión no se puede iniciar artificialmente un nuevo reconteo bajo esa sesión.

Solo puede recuperarse uno que ya hubiera sido iniciado/capturado válidamente.

---

## 14. Nueva sesión después de una anterior

### Regla S41 — Contexto limpio

Una nueva sesión comienza con:

- nuevo `conteo_id`;
- buffer operativo limpio;
- estado actualizado;
- snapshot vigente actual.

### Regla S42 — Sin herencia

La nueva sesión no hereda:

- observaciones pendientes descartadas;
- IDs de observaciones anteriores;
- referencias de sesión anteriores;
- snapshot de una sesión anterior como obligación global.

### Regla S43 — Reevaluación completa

Antes de iniciar una nueva sesión se comprueba nuevamente:

```text
usuario válido
dispositivo autorizado
sede válida
período operativo válido
no existe otra sesión activa
snapshot confirmado existente
snapshot vigente
más de 5 minutos restantes
```

---

## 15. Relación con el período operativo

Las reglas de sesión son independientes del concepto de período.

La duración actual del período permanece:

- días 1–15;
- días 16–fin de mes.

Este documento no modifica:

- `cobertura_periodo`;
- estados de grupos;
- estados de diferencias;
- reglas de reconteo V3 salvo recuperación temporal;
- lógica de primer snapshot posterior;
- Control;
- exportación;
- Dashboard.

---

## 16. Dependencia externa con ConeXion

SOLOG asume como contrato externo:

> El intervalo mínimo permitido entre dos snapshots consecutivos de una sede es de 2 horas. Una vez vencido el snapshot anterior, SOLOG requiere un nuevo snapshot para continuar operando.

La implementación de esa regla dentro de ConeXion se trabaja por separado.

Para SOLOG, lo relevante es únicamente que Supabase pueda determinar de forma autoritativa:

- cuál es el último snapshot confirmado;
- su `capturado_at`;
- cuándo expira;
- si existe actualmente un snapshot vigente.

---

## 17. Reglas anteriores sustituidas

Quedan explícitamente obsoletas para SOLOG:

### Obsoleta A

```text
La sesión siempre dura 2 horas desde iniciado_at.
```

Sustituida por:

```text
sesion.expira_at = snapshot_expira_at - 1 minuto
```

### Obsoleta B

```text
La antigüedad del stock es solo informativa y se puede continuar/iniciar igualmente.
```

Sustituida por:

```text
Sin snapshot vigente no se puede iniciar una nueva sesión.
```

### Obsoleta C

```text
Una sesión expirada implica descartar automáticamente toda observación no enviada.
```

Sustituida por el flujo:

```text
recuperar
→ reintentar una vez
→ limpiar remanente
→ cerrar contexto anterior
```

### Obsoleta D

```text
El snapshot se congela globalmente para toda la sesión.
```

No aplica al Motor V3.

Se mantiene:

```text
snapshot por observación física
```

---

## 18. Análisis de contradicciones y deadlocks

### 18.1 Snapshot por observación vs. estabilidad operativa

No existe contradicción.

Guardar `snapshot_referencia_id` por observación aporta trazabilidad sin requerir una descarga adicional por grupo.

### 18.2 Margen de inicio de 5 minutos vs. cierre T-1

No existe contradicción.

Ejemplo:

```text
Snapshot vence: 12:00
No iniciar desde: 11:55
Sesión expira: 11:59
```

La sesión más corta posible mantiene un margen operativo superior a aproximadamente cuatro minutos.

### 18.3 Buffer pendiente

No produce deadlock porque existe salida obligatoria:

```text
intento
→ reintento
→ limpieza
→ cierre
```

### 18.4 Ausencia de snapshot nuevo

Puede bloquear nuevas sesiones, pero no es un deadlock técnico.

Es un bloqueo operativo intencional que se resuelve cuando Supabase recibe un nuevo snapshot confirmado y vigente.

### 18.5 Frontend inactivo

No produce deadlock si Supabase implementa la expiración de forma autoritativa.

### 18.6 Dos dispositivos iniciando simultáneamente

Debe resolverse atómicamente en backend.

La regla de una sesión activa por sede no puede depender únicamente del frontend.

### 18.7 Buffer viejo en un dispositivo y actividad nueva en otro

No produce deadlock.

La actividad posterior prevalece mediante `SOLOG_EXPIRED_SESSION_SUPERSEDED`, y el buffer antiguo se descarta.

---

## 19. Criterios de aceptación de implementación

La implementación estará completa cuando:

1. SOLOG no permita iniciar sin snapshot vigente.
2. SOLOG no permita iniciar con 5 minutos o menos de vigencia restante.
3. `expira_at` derive del snapshot vigente y sea T-1 minuto.
4. Supabase expire sesiones aunque el frontend esté inactivo.
5. El frontend muestre countdown durante los últimos 2 minutos de sesión.
6. El countdown no requiera polling por segundo.
7. Las observaciones mantengan snapshot por observación.
8. No se requiera recargar grupos al entrar a cada grupo.
9. Las observaciones pendientes válidas puedan recuperarse después de expirar la sesión.
10. El snapshot nuevo no reinterprete observaciones antiguas.
11. Exista un máximo de dos intentos totales de recuperación por flujo.
12. El remanente no recuperado se limpie.
13. La sesión anterior siempre termine su flujo de cierre.
14. Una nueva sesión nunca herede buffer ni contexto anterior.
15. `SUPERSEDED` permanezca como defensa ante actividad posterior.
16. Los reconteos capturados válidamente puedan recuperarse.
17. No se introduzcan cambios en Motor V3 fuera de estas reglas temporales.
18. No se modifique la duración actual del período operativo.
19. Las validaciones críticas existan en Supabase, no solamente en frontend.
20. No exista un camino en el que un buffer antiguo bloquee indefinidamente una nueva sesión.

---

## 20. Estado congelado

**Vigencia del snapshot:** 2 horas desde `capturado_at`.  
**Margen mínimo para iniciar sesión:** más de 5 minutos.  
**Cierre automático de sesión:** 1 minuto antes del vencimiento del snapshot.  
**Aviso visual:** últimos 2 minutos de la sesión.  
**Snapshot de referencia:** por observación física.  
**Recuperación de buffer:** intento inicial + 1 reintento; luego limpiar remanente.  
**Final de recuperación:** siempre cerrar contexto de sesión anterior.  
**Nueva sesión:** contexto limpio y reevaluación completa.  
**Autoridad temporal:** Supabase / `server_now`.  
**Período operativo:** sin cambios.  
