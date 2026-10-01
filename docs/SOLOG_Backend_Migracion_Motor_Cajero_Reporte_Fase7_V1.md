# SOLOG — Backend — Migración Motor Cajero — Reporte Fase 7 V1

**Estado:** VALIDADO TÉCNICAMENTE — CHECKPOINT  
**Fecha:** 30 de septiembre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C  
**Fuente primaria:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Plan:** `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 1. Objetivo

Implementar el lifecycle explícito de sesión:

```text
activo
recovery
finalizado
expirado
```

y validar:

- corte exacto de captura en `expira_at`;
- transición a recovery;
- coexistencia de una sesión active con una o más recovery;
- delivery tardío limitado a observaciones capturadas antes del corte;
- finish desde recovery;
- expiración definitiva al agotar recovery;
- cleanup automático del runtime.

## 2. Migración

Migración:

`20261001051023_solog_motor_v4_session_recovery_lifecycle`

## 3. Normalización temporal

Creada:

`inventario.solog_normalize_sessions_v4(...)`

Reglas:

### ACTIVE → RECOVERY

```text
now >= expira_at
AND
now < expira_at + 2 h
```

### ACTIVE/RECOVERY → EXPIRADO

```text
now >= expira_at + 2 h
```

Al expirar:

`finalizado_at = expira_at + 2 h`

si no existía un cierre previo.

La función permite normalizar:

- todas las sesiones;
- por sede;
- por conteo_id.

Esto permite que las entradas públicas del contrato V4 normalicen el estado antes de tomar decisiones, sin depender del navegador.

## 4. Capability V4

Creada:

`inventario.solog_session_capability_v4(...)`

### active

- `capture_allowed = true` si está autorizado;
- `pending_delivery_allowed = true`.

### recovery

- `capture_allowed = false`;
- `pending_delivery_allowed = true` si está autorizado.

### finalizado / expirado

- `mode = none`;
- captura y delivery deshabilitados.

## 5. Validación de observación

Creada:

`inventario.solog_validate_session_observation_v4(...)`

Una observación entregable debe cumplir:

```text
iniciado_at <= observed_at < expira_at
```

y no puede estar adelantada más de 30 segundos respecto del tiempo autoritativo de validación.

El límite es semiabierto:

- `23:59:59` antes de un `expira_at=00:00` → válido;
- `00:00:00` → inválido para la sesión anterior.

En recovery se acepta delivery únicamente mientras no haya terminado `recovery_until`.

## 6. Finish V4

Creada:

`inventario.solog_finish_session_v4(...)`

Permite cierre normal desde:

- `activo`;
- `recovery`.

El cierre:

```text
estado → finalizado
finalizado_at → now autoritativo
```

y activa la limpieza existente de runtime.

Si la ventana de recovery ya terminó, la normalización previa convierte la sesión a `expirado` y el finish no la reinterpreta como finalizada.

## 7. Concurrencia

Se conserva el índice único existente:

`conteos_una_sesion_activa_por_sede`

que aplica únicamente a:

```text
estado = activo
```

Por tanto es válido:

```text
1 active
+
N recovery
```

pero sigue bloqueado:

```text
2 active
misma sede
```

## 8. Validación transaccional

Se ejecutó una prueba completa con `ROLLBACK`.

### 8.1. Medianoche exacta

Sesión:

```text
iniciado_at = 22:30 Lima
expira_at = 00:00 Lima
```

A las `00:00`:

```text
activo → recovery
capture_allowed = false
pending_delivery_allowed = true
```

Resultado: OK.

### 8.2. Runtime durante recovery

Al pasar `activo → recovery`, el runtime permanece.

Resultado: OK.

### 8.3. Coexistencia

Con dos sesiones recovery existentes se creó una nueva active para la misma sede.

Resultado:

```text
1 active
2 recovery
```

OK.

Intento de segunda active para la misma sede:

bloqueado por unique constraint.

### 8.4. Delivery tardío

En recovery:

```text
observed_at = 23:59:59
expira_at   = 00:00
```

Resultado: aceptado.

```text
observed_at = 00:00:00
```

Resultado: bloqueado con timestamp inválido.

### 8.5. Finish desde recovery

Resultado:

```text
recovery → finalizado
```

Runtime eliminado automáticamente.

OK.

### 8.6. Expiración definitiva

Sesión recovery con:

```text
expira_at = 23:00
recovery_until = 01:00
```

A las `01:00` exactas:

```text
recovery → expirado
```

Runtime eliminado.

Capability posterior:

```text
mode = none
pending_delivery_allowed = false
```

OK.

## 9. Estado real posterior

Las pruebas sintéticas fueron revertidas.

Estado real:

- usuarios SOLOG activos: 0;
- sesiones active: 0;
- sesiones recovery: 0;
- sesiones finalizadas: 54;
- sesiones expiradas: 13;
- runtime V4: 0 filas;
- Recontar abiertos: 65;
- accionables: 58;
- esperando snapshot: 7;
- snapshots: 44;
- conteos: 67;
- conteo_detalle: 914;
- estado_stock_grupo: 976.

No hubo alteración de datos reales por las pruebas.

## 10. Estado

Fase 7 cerrada técnicamente.

Siguiente fase:

**Fase 8 — Contrato Cajero V4.**
