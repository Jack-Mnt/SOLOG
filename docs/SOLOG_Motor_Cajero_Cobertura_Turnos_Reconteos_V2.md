# SOLOG — Motor Cajero — Cobertura, Turnos y Reconteos V2

**Estado:** CONGELADO — FUENTE PRIMARIA PARA IMPLEMENTACIÓN  
**Fecha:** 30 de septiembre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — Motor / backend / modelo de datos / migración / contrato Cajero  
**Rama de trabajo:** `admin-work`

---

## 1. Precedencia documental

Esta es la **fuente primaria única** para el bloque de Motor/backend del Cajero cubierto aquí.

Precedencia:

1. `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md` — fuente primaria.
2. `docs/SOLOG_Backend_Cajero_Eficiencia_Contrato_V1.md` — referencia histórica/técnica para invariantes de eficiencia e idempotencia que no contradigan esta fuente.
3. `docs/SOLOG_Backend_Doble_Cobertura_Impacto_Admin_V1.md` — handoff futuro para Admin; fuera del bloque actual.
4. documentación anterior del Motor/Cajero — histórica cuando contradiga esta fuente.

`docs/SOLOG_Logica_Cajero_Turnos_Reconteos_V1.md` queda reemplazada por esta V2. Sus decisiones vigentes se consolidan aquí.

---

## 2. Objetivo

Migrar SOLOG a un Motor limpio que:

1. mantenga la quincena como período operativo;
2. exija dos rondas temporales de cobertura por quincena;
3. limite cada grupo a un conteo normal por turno operativo;
4. convierta toda diferencia distinta de cero en `Recontar`;
5. utilice un snapshot posterior únicamente como condición para habilitar el reconteo;
6. priorice `Revisar`, luego cobertura obligatoria y luego Conteo diario;
7. separe explícitamente sesión activa y recovery;
8. permita coexistencia de una sesión activa con sesiones en recovery;
9. elimine columnas, tablas, funciones y RPC legacy cuando hayan sido sustituidas;
10. preserve los datos históricos reales sin reinterpretarlos retroactivamente.

El nuevo modelo empieza a regir para la quincena iniciada el **1 de octubre de 2026**. El historial anterior conserva la semántica bajo la cual fue generado.

---

## 3. Fuera de alcance

Quedan fuera de este bloque:

- implementación y UX de SOLOG Admin;
- definición de KPI combinados de las dos coberturas en Admin;
- adaptación frontend de Admin;
- reinterpretación retroactiva de cobertura histórica;
- cambios generales de UI no necesarios para consumir el nuevo contrato.

SOLOG Admin permanecerá desactivado hasta ejecutar su bloque específico.

---

# 4. Período y rondas de cobertura

## 4.1. Período quincenal

Los períodos continúan siendo:

```text
1 → 15
16 → último día del mes
```

La zona horaria autoritativa es `America/Lima`.

## 4.2. División en rondas

Cada quincena contiene exactamente dos rondas.

Sea:

```text
duración = periodo_hasta - periodo_desde + 1 día
inicio_ronda_2 = periodo_desde + floor(duración / 2)
```

La primera ronda usa:

```text
[periodo_desde 00:00, inicio_ronda_2 00:00)
```

La segunda:

```text
[inicio_ronda_2 00:00, día posterior a periodo_hasta 00:00)
```

Ejemplos:

| Período | Cobertura quincenal 1 | Cobertura quincenal 2 |
|---|---|---|
| 1–15 | 1–7 | 8–15 |
| 16–30 | 16–22 | 23–30 |
| 16–31 | 16–23 | 24–31 |
| 16–28 | 16–21 | 22–28 |
| 16–29 | 16–22 | 23–29 |

Los límites temporales se implementan como rangos semiabiertos.

## 4.3. Semántica de cobertura

Un grupo cubre una ronda cuando existe una **observación física válida** del grupo dentro de la ventana temporal de esa ronda.

Acreditan cobertura:

- conteo normal de cobertura;
- Conteo diario;
- reconteo.

Una observación pertenece únicamente a la ronda determinada por su timestamp autoritativo.

Una ronda cerrada no puede completarse retroactivamente con observaciones de la ronda siguiente.

---

# 5. Estado autoritativo de cobertura

La cobertura deja de almacenarse como booleano de período.

Se elimina del modelo vigente:

```text
cobertura_periodo
cobertura_periodo_desde
```

La nueva referencia operacional será:

```text
ultima_observacion_fisica_at
```

Su significado:

> timestamp de la observación física válida más reciente del grupo, ya sea conteo normal o reconteo.

La cobertura de la ronda activa se deriva mediante:

```text
ultima_observacion_fisica_at ∈ ventana_ronda_actual
```

`ultimo_conteo_at` permanece separado y representa únicamente el último conteo **normal**.

Actualizaciones:

```text
save_batch
→ ultimo_conteo_at = contado_at
→ ultima_observacion_fisica_at = contado_at

recount_save_batch
→ NO modifica ultimo_conteo_at
→ ultima_observacion_fisica_at = recontado_at
```

---

# 6. Turnos operativos

Los turnos permanecen:

| Turno | Ventana Lima |
|---|---|
| `early` | [00:00, 07:30) |
| `day` | [07:30, 15:30) |
| `night` | [15:30, 24:00) |

El turno se deriva temporalmente; no requiere una tabla de cobertura por turno.

Un grupo puede recibir como máximo **un conteo normal por turno**.

Elegibilidad temporal:

```text
ultimo_conteo_at IS NULL
OR ultimo_conteo_at < inicio_turno_actual
→ no consumió conteo normal del turno
```

Si el stock cambia nuevamente después de contar el grupo en el mismo turno:

```text
estado = Cambio_reciente
```

pero no vuelve a ser elegible para otro conteo normal hasta un turno posterior.

El reconteo no consume el cupo de conteo normal.

---

# 7. Prioridad operativa

La autoridad de prioridad es el backend.

Orden:

```text
1. Revisar casos accionables
2. Completar cobertura obligatoria de la ronda activa
3. Conteo diario
```

Reglas:

### 7.1. Revisar

Un caso es accionable cuando:

```text
estado_diferencia = Recontar
AND primer_snapshot_posterior_id IS NOT NULL
AND stock_reconteo IS NULL
```

Mientras existan casos accionables, `Revisar` es la acción operativa prioritaria.

### 7.2. Cobertura

Si no existen casos accionables y la ronda activa está incompleta, la prioridad es cubrir grupos pendientes.

Un grupo con un `Recontar` todavía no resuelto no debe recibir un nuevo conteo normal; espera el snapshot/reconteo correspondiente.

### 7.3. Conteo diario

Solo se ofrece como prioridad cuando:

- no hay casos accionables de `Revisar`;
- la cobertura de la ronda activa está completa;
- existen grupos elegibles por `Cambio_reciente`;
- el grupo no tiene diferencia pendiente;
- el grupo no consumió un conteo normal en el turno actual.

---

# 8. Diferencias y reconteo

## 8.1. Conteo inicial

```text
d0 = stock_fisico - stock_teorico
```

Transición:

```text
d0 = 0  → Coincide
d0 ≠ 0  → Recontar
```

Toda diferencia no cero entra al ciclo de reconteo.

## 8.2. Snapshot posterior

Después de una diferencia:

```text
conteo normal
→ Recontar
→ esperar snapshot posterior confirmado y utilizable
→ habilitar Revisar
```

El snapshot posterior:

- debe ser posterior a `contado_at`;
- debe permitir obtener stock válido del grupo;
- se registra como `primer_snapshot_posterior_id`;
- habilita el reconteo;
- aporta trazabilidad.

El valor del snapshot posterior **no auto-resuelve** la diferencia.

Debe eliminarse cualquier lógica que transforme automáticamente `Recontar → Coincide` por igualdad entre stock posterior y físico original.

## 8.3. Sesión posterior

El reconteo debe ejecutarse en una sesión diferente y posterior a la que originó la diferencia.

Se mantiene la prohibición de reconteo en la misma sesión de origen.

La nueva sesión congela su propio snapshot y stock teórico para el reconteo.

## 8.4. Resolución

```text
d0 = físico_original - teórico_original
dr = físico_reconteo - teórico_reconteo
```

Reglas:

```text
dr = 0
→ Coincide
→ diferencia final = 0
```

```text
d0 y dr con mismo signo
→ Confirmada
→ diferencia final = la de menor magnitud absoluta, conservando signo
```

```text
signos incompatibles
→ Inconsistente
→ diferencia final = dr
```

Un reconteo realizado en una ronda posterior acredita la cobertura de esa nueva ronda.

---

# 9. Sesiones

## 9.1. Estados

`inventario.conteos.estado` distinguirá explícitamente:

```text
activo
recovery
finalizado
expirado
```

### activo

- permite nuevas capturas;
- permite entrega de pendientes de la misma sesión;
- posee snapshot runtime congelado.

### recovery

- no permite nuevas capturas;
- permite únicamente entregar observaciones ya capturadas válidamente antes de `expira_at`;
- conserva snapshot/runtime de sesión;
- no adopta nuevos grupos ni nuevo contrato.

### finalizado

- cierre normal;
- no permite captura ni delivery;
- elimina los datos runtime de grupos.

### expirado

- recovery agotado sin cierre normal;
- no permite captura ni delivery;
- elimina los datos runtime de grupos.

## 9.2. Expiración de captura

```text
expira_at =
min(
  snapshot.capturado_at + 1 h 59 min,
  siguiente medianoche en America/Lima
)
```

La ventana válida de captura es:

```text
[iniciado_at, expira_at)
```

Una captura exactamente en `expira_at` no pertenece a la sesión.

## 9.3. Recovery

Se conserva una ventana de recovery de dos horas:

```text
recovery_until = expira_at + 2 h
```

La atribución temporal de observaciones depende de su `contado_at` / `recontado_at` validado, no de la hora de llegada al servidor.

## 9.4. Concurrencia

Por sede:

```text
máximo 1 sesión estado=activo
```

Puede coexistir:

```text
1 activo
+
1 o más recovery
```

Una sesión en recovery no bloquea el inicio de una nueva sesión activa si esta cumple las demás reglas de inicio.

Cada mutación está ligada a su `conteo_id`, usuario, sede, dispositivo y revisión esperada según el contrato.

La normalización de estado temporal debe ejecutarse autoritativamente en entradas públicas del runtime y en procesos de mantenimiento aplicables; no depende del navegador.

---

# 10. Runtime congelado de sesión

La responsabilidad válida de `solog_session_groups` se conserva, pero la tabla actual será sustituida.

Nueva tabla objetivo:

```text
inventario.solog_session_runtime_groups
```

Su propósito exclusivo es sostener una sesión `activo` o `recovery`.

No es histórico.

## 10.1. Ciclo de vida

```text
start
→ crear runtime congelado

activo
→ conservar

recovery
→ conservar

finalizado / expirado
→ eliminar runtime
```

## 10.2. Datos congelados

Debe conservar únicamente lo requerido para ejecutar la sesión sin depender de cambios posteriores del catálogo/stock:

- `conteo_id`;
- `grupo_conteo_id`;
- `snapshot_referencia_id`;
- `stock_teorico`;
- nombre del grupo;
- categoría id/nombre;
- tipo de grupo;
- precio;
- unidades/precio por paquete;
- códigos internos;
- productos necesarios para captura;
- acción pendiente congelada;
- referencia de reconteo cuando corresponda;
- referencias/timestamps de conteo y reconteo confirmados durante la sesión.

No contiene `cobertura_periodo`.

## 10.3. Acción pendiente

La nueva tabla debe representar de forma explícita una única acción operacional congelada por grupo:

```text
recount
coverage
daily
none
```

Esto sustituye la combinación legacy de booleanos incompatibles.

Las colas del contrato se derivan de esta acción:

```text
review_queue   ← recount
coverage_queue ← coverage
daily_queue    ← daily
```

---

# 11. Congelación de sesión y cambios durante la sesión

Las colas y el dataset de sesión permanecen congelados desde `start`.

Consecuencias:

- nuevos snapshots no agregan grupos dinámicamente a la sesión;
- un `Recontar` que obtiene snapshot posterior después de iniciar la sesión se vuelve accionable en una sesión posterior;
- cambios de catálogo/grupos posteriores al `start` no reescriben el runtime activo;
- el backend autoritativo devuelve deltas de la sesión, no reconstruye su universo en cada mutación.

Resolver un reconteo en la sesión actual puede acreditar la ronda actual, pero no agrega nuevas acciones no congeladas para ese grupo.

---

# 12. Cambios de grupos y catálogo

Se conserva la lógica operacional vigente adaptada al nuevo modelo:

### Alta/activación

Un grupo activo entra al universo vigente. Si no tiene observación física dentro de la ronda actual, queda pendiente de cobertura.

### Baja/desactivación

Deja de formar parte del universo operativo futuro.

### Cambios estructurales

Los cambios que exigen snapshot completo mantienen la compuerta `requiere_snapshot_completo`.

Un cambio de grupo/catalogación puede invalidar un reconteo pendiente cuando la referencia histórica deje de ser comparable, según la lógica vigente de integridad.

No se reconstruye una sesión ya congelada.

---

# 13. Snapshot de stock y estado operacional

Al aplicar un nuevo snapshot:

- si cambia el stock del grupo, `estado = Cambio_reciente`;
- si no cambia, se preserva el estado operacional aplicable;
- se actualiza la referencia de stock vigente;
- los casos `Recontar` posteriores al conteo registran el primer snapshot posterior utilizable;
- no existe auto-resolución por igualdad con el físico original.

El estado de cobertura se deriva y no se escribe como booleano.

---

# 14. Contrato backend nuevo

El contrato nuevo reemplaza Cajero V3 para el runtime productivo después del cutover.

Debe exponer como mínimo:

## 14.1. Basis

```text
snapshot_referencia_id
version_catalogo
groups_revision
periodo_desde
periodo_hasta
ronda
ronda_desde
ronda_hasta
turno
turno_desde
turno_hasta
```

Todos los timestamps/ventanas se derivan por backend en `America/Lima`.

## 14.2. Sesión

Debe exponer:

```text
id
estado
iniciado_at
expira_at
recovery_until
finalizado_at
basis congelado
```

## 14.3. Colas

Separadas explícitamente:

```text
review_queue
coverage_queue
daily_queue
```

## 14.4. KPI Cajero

El Cajero trabaja con la ronda activa:

```text
coverage_round = 1 | 2
coverage_counted
coverage_total
coverage_pending
coverage_percent
review_pending
daily_pending
```

La UI presentará:

```text
Cobertura quincenal 1
Cobertura quincenal 2
```

según la ronda activa.

## 14.5. Próxima acción

El backend debe entregar una decisión autoritativa equivalente a:

```text
next_action = review | coverage | daily | none
```

El frontend no reimplementa la prioridad del Motor.

## 14.6. Mutaciones

El contrato conservará los principios ya validados:

- máximo 500 items por batch;
- `operation_id` idempotente;
- mismo UUID + mismo payload → replay;
- mismo UUID + payload diferente → conflicto;
- timestamps validados por backend;
- deltas autoritativos después de mutaciones;
- frontend sin autoridad para decidir estados de diferencia.

Las acciones necesarias continúan conceptualmente siendo:

```text
start
save_batch
recount_save_batch
finish
```

pero consumirán el modelo nuevo.

---

# 15. Limpieza de legacy

Después de desplegar, migrar y validar el nuevo Motor se retirarán los elementos sustituidos.

## 15.1. Columnas

Eliminar de `estado_stock_grupo`:

```text
cobertura_periodo
cobertura_periodo_desde
```

## 15.2. Tablas

Eliminar:

```text
inventario.solog_session_groups
inventario.solog_daily_coverage_base
inventario.solog_daily_coverage_groups
inventario.solog_shift_coverage
```

La tabla runtime nueva sustituye únicamente la responsabilidad válida de `solog_session_groups`.

## 15.3. Funciones/triggers/RPC

Retirar o sustituir toda función, trigger, índice y RPC que dependa de:

- cobertura legacy;
- `solog_session_groups`;
- daily coverage legacy;
- shift coverage legacy;
- auto-resolución por snapshot posterior;
- contratos Cajero V2/V3 reemplazados.

Los jobs Cron de cortes `early/day/night` dejan de ser necesarios si su única responsabilidad restante son las tablas de cobertura eliminadas. El turno operativo se deriva temporalmente.

El job de mantenimiento de snapshots se evalúa y conserva de forma independiente.

No deben quedar objetos muertos por compatibilidad sin un consumidor vigente demostrado.

---

# 16. Datos reales y migración

## 16.1. Backup

Antes de cualquier DDL o limpieza destructiva debe existir un backup restaurable almacenado localmente fuera del proyecto Supabase.

El backup se guardará como ZIP en el PC del usuario.

Debe incluir como mínimo:

- roles;
- schema;
- data;
- manifiesto de migración;
- checksums.

## 16.2. Datos que se preservan

Se preserva el histórico autoritativo, incluyendo:

- snapshots;
- conteos;
- conteo_detalle;
- catálogo/grupos/categorías;
- sedes;
- usuarios;
- dispositivos;
- revisiones/configuración vigente necesaria.

## 16.3. Datos que no se migran como histórico autoritativo

No se migran como histórico:

- `solog_daily_coverage_base`;
- `solog_daily_coverage_groups`;
- `solog_shift_coverage`;
- snapshots runtime de grupos pertenecientes a sesiones cerradas.

## 16.4. Backfill

`ultima_observacion_fisica_at` se reconstruirá por sede + grupo a partir del historial real:

```text
max(contado_at, recontado_at)
```

considerando las observaciones válidas correspondientes.

`ultimo_conteo_at` debe representar el último conteo normal y se valida/reconstruye desde `contado_at` cuando sea necesario.

## 16.5. Octubre

No se transforma septiembre en dos coberturas.

Para la ronda 1 de octubre:

```text
ultima_observacion_fisica_at < 2026-10-01 00:00 Lima
→ pendiente de Cobertura quincenal 1
```

## 16.6. Recontar abiertos

Los casos históricos abiertos se preservan:

- `Recontar` con snapshot posterior → accionable en `Revisar`;
- `Recontar` sin snapshot posterior → permanece esperando snapshot utilizable.

No se reinterpretan estados históricos ya cerrados.

---

# 17. Mantenimiento y cutover

Durante la migración backend SOLOG permanecerá inactivo para usuarios operativos.

Orden conceptual:

```text
backup
→ mantenimiento SOLOG
→ normalizar sesiones
→ migrar schema/datos
→ desplegar Motor nuevo
→ validar
→ limpiar legacy
→ congelar contrato backend desplegado
→ habilitar usuarios para validación frontend local
```

Durante la implementación frontend:

- los usuarios necesarios pueden volver a activarse;
- los Automatic Deployments de Cloudflare deben permanecer desactivados;
- la validación se realiza localmente contra el backend ya congelado;
- la web publicada no debe consumir un frontend incompatible.

Admin permanece inactivo.

---

# 18. Invariantes de seguridad y consistencia

El backend sigue siendo autoridad de:

- usuario/sede/dispositivo;
- permisos;
- timestamps;
- período/ronda/turno;
- cobertura derivada;
- sesión y recovery;
- stock teórico congelado;
- elegibilidad y prioridad;
- diferencia/reconteo;
- idempotencia;
- concurrencia;
- deltas y resultados.

No se confía en timestamps arbitrarios del navegador sin validación contra la ventana de sesión.

No se permite que una mutación de una sesión modifique el runtime de otra.

---

# 19. Criterios de aceptación backend

La implementación backend se considera lista para el frontend cuando exista evidencia de que:

1. octubre inicia con Cobertura quincenal 1 pendiente según el nuevo modelo;
2. el cambio a Cobertura quincenal 2 ocurre por fecha sin resets masivos;
3. cualquier observación física válida acredita la ronda correcta;
4. máximo un conteo normal por grupo/turno;
5. reconteos no consumen el cupo normal;
6. diferencia no cero siempre produce `Recontar`;
7. snapshot posterior no auto-resuelve;
8. `Revisar` requiere snapshot posterior utilizable;
9. reconteo requiere sesión posterior;
10. resolución Coincide/Confirmada/Inconsistente respeta el contrato;
11. prioridad backend = review → coverage → daily;
12. sesión activa no cruza `expira_at`;
13. `activo → recovery` bloquea nuevas capturas;
14. recovery acepta únicamente observaciones temporalmente válidas de su sesión;
15. una sesión activa puede coexistir con recovery;
16. runtime groups se eliminan al finalizar/expirar;
17. open recounts históricos siguen preservados;
18. columnas/tablas/RPC legacy retiradas no tienen consumidores vigentes;
19. no quedan sesiones activas residuales antes del cutover;
20. datos históricos autoritativos conservan conteos, IDs y relaciones esperadas.

---

# 20. Validación requerida

Por tratarse de Nivel C:

- backup verificado antes de DDL destructivo;
- validación de migración con conteos y checks de integridad;
- datos sintéticos para cada transición del Motor;
- pruebas reales controladas en Supabase;
- comprobación de idempotencia y replay;
- pruebas de límites temporales en `America/Lima`;
- pruebas de medianoche y cambio de ronda;
- pruebas de active + recovery;
- revisión de funciones/RPC/índices/triggers huérfanos;
- validación de RLS/permisos aplicables;
- evidencia de rollback;
- contrato backend desplegado y congelado antes de implementar frontend.

---

# 21. Estado del bloque

Las decisiones de este documento quedan **CONGELADAS**.

Cualquier cambio posterior requiere un delta explícito o una incompatibilidad demostrada.

La implementación backend debe completarse y validarse antes de preparar al frontend contra el nuevo contrato.
