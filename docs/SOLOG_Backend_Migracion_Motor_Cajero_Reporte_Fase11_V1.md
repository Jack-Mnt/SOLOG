# SOLOG — Backend — Migración Motor Cajero — Reporte Fase 11 V1

**Estado:** CERRADA — CONTRATO BACKEND CONGELADO  
**Fecha:** 1 de octubre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C  
**Fuente funcional:** `docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`  
**Fuente contractual desplegada:** `docs/SOLOG_Backend_Contrato_Cajero_V4.md`  
**Plan:** `docs/SOLOG_Backend_Migracion_Motor_Cajero_Plan_V1.md`

## 1. Objetivo

Congelar el contrato backend realmente desplegado después de completar:

- migración de modelo;
- Motor temporal;
- doble cobertura;
- turnos;
- reconteos;
- active/recovery;
- contrato Cajero V4;
- validación global;
- eliminación física de legacy.

El resultado de esta fase es la fuente que debe consumir el frontend Cajero en las Fases 12–14.

## 2. Fuente contractual

Creada:

`docs/SOLOG_Backend_Contrato_Cajero_V4.md`

Estado:

**CONGELADO — DESPLEGADO Y VALIDADO**

Precedencia para frontend:

1. `SOLOG_Backend_Contrato_Cajero_V4.md` — firmas, payloads, respuestas, estados, errores e invariantes técnicas.
2. `SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md` — semántica funcional/arquitectónica.
3. `SOLOG_Backend_Doble_Cobertura_Impacto_Admin_V2.md` — handoff Admin.
4. reportes de implementación — evidencia.
5. `SOLOG_Logica_Cajero_Turnos_Reconteos_V1.md` — histórico/reemplazado.

## 3. Superficie pública congelada

```text
public.rpc_solog_route_v2(jsonb) → jsonb
public.rpc_solog_cashier_bootstrap_v4(jsonb) → jsonb
public.rpc_solog_cashier_mutate_v4(text,jsonb) → jsonb
public.rpc_solog_cashier_history_v2(jsonb) → jsonb
```

ACL comprobada para las cuatro:

```text
anon          → false
PUBLIC        → false
authenticated → true
```

## 4. Contrato operacional V4 congelado

Se documentaron explícitamente:

- bootstrap;
- start;
- save_batch;
- recount_save_batch;
- finish;
- history V2;
- routing V2;
- session capability;
- panel state;
- panel delta;
- basis congelado;
- grupos runtime;
- review/coverage/daily queues;
- KPI de ronda;
- prioridad;
- recovery;
- idempotencia;
- client_observation_id;
- revisiones;
- timestamps;
- catálogo/metadata congelada;
- códigos de error.

## 5. Temporalidad congelada

Autoridad:

`America/Lima`

Quincenas:

```text
1–15
16–fin de mes
```

Rondas:

```text
R1 = primera mitad
R2 = segunda mitad
```

con día extra en R2 cuando la duración es impar.

Turnos:

```text
early  00:00–07:30
day    07:30–15:30
night  15:30–24:00
```

Vigencia snapshot:

`capturado_at + 2 h`

Expiración sesión:

```text
min(
  capturado_at + 1 h 59 min,
  siguiente medianoche Lima
)
```

Recovery:

`expira_at + 2 h`.

## 6. Estados congelados

Sesión:

```text
activo
recovery
finalizado
expirado
```

Runtime:

```text
recount
coverage
daily
none
```

Stock:

```text
Contado
Cambio_reciente
```

Diferencia persistente:

```text
Coincide
Recontar
Confirmada
Inconsistente
Inválido
```

Al congelar no existen filas reales `Inválido`, pero el schema lo permite y el historial debe poder parsearlo.

## 7. Prioridad congelada

```text
review
→ coverage
→ daily
```

Los casos `Recontar` no accionables por falta de snapshot posterior bloquean su grupo y pueden producir `next_action = none`.

La prioridad está protegida por backend, no solo por UI.

## 8. Idempotencia congelada

Scopes:

```text
cashier_v4:start
cashier_v4:save_batch
cashier_v4:recount_save_batch
cashier_v4:finish
```

Regla:

```text
mismo actor + scope + operation_id + payload negocio
→ replay
```

El token de dispositivo no participa en el hash.

Retry debe conservar:

- operation_id;
- items;
- client_observation_id;
- timestamps;
- payload de negocio.

## 9. Error surface congelada

La fuente contractual contiene el catálogo completo de códigos `SOLOG_*` alcanzables desde:

- routing;
- bootstrap;
- mutate;
- history;
- helpers/guards ejecutados por esas rutas.

El frontend debe mapear por código, no por texto humano.

## 10. Gate remoto final

Comprobado directamente en Supabase:

```text
usuarios SOLOG activos      0
active sessions             0
recovery sessions           0
runtime rows                0

legacy tables               0
legacy columns              0

Recontar abiertos          65
accionables                58
```

Superficie RPC:

```text
route_v2             OK
bootstrap_v4         OK
mutate_v4            OK
history_v2           OK
```

## 11. Estado de migraciones del repositorio

La última migración SQL versionada actualmente en `admin-work` es del 23/09/2026.

Las modificaciones backend realizadas en este bloque fueron iteradas y validadas directamente en el backend remoto y aún no están consolidadas como una migración nueva dentro de `supabase/migrations`.

No se crea manualmente un filename de migración.

Antes del próximo cambio backend debe sincronizarse el remoto mediante Supabase CLI desde el repositorio local, siguiendo el flujo oficial:

```text
supabase db pull <nombre-descriptivo> --local --yes
supabase migration list --local
```

Nombre descriptivo recomendado:

```text
solog_motor_cajero_v4
```

Este pendiente es de reproducibilidad/versionado del schema; no modifica ni desbloquea decisiones del contrato frontend ya congelado.

## 12. Regla de cambio

Desde este checkpoint:

- el backend V4 queda congelado;
- una incompatibilidad exige nuevo contrato/versionado;
- una corrección compatible requiere delta explícito;
- Codex no modifica backend;
- si el frontend detecta una necesidad backend, debe detenerse y devolver el bloqueo a ChatGPT.

## 13. Estado

**Fase 11 cerrada.**

El backend ya puede entregarse formalmente al bloque frontend.

Siguiente fase:

**Fase 12 — preparación frontend.**
