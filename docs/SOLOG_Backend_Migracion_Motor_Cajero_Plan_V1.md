# SOLOG — Backend — Migración Motor Cajero — Plan V1

**Estado:** CONGELADO — PLAN APROBADO  
**Fecha:** 30 de septiembre de 2026  
**Proyecto:** SOLOG  
**Nivel:** C — backend / modelo de datos / migración / Motor / contrato Cajero  
**Rama:** `admin-work`

## 1. Fuente primaria

Fuente funcional/arquitectónica primaria:

`docs/SOLOG_Motor_Cajero_Cobertura_Turnos_Reconteos_V2.md`

Fuente histórica absorbida:

`docs/SOLOG_Logica_Cajero_Turnos_Reconteos_V1.md`

Handoff futuro Admin:

`docs/SOLOG_Backend_Doble_Cobertura_Impacto_Admin_V1.md`

Este plan gobierna únicamente la secuencia de implementación. Si contradice la fuente primaria, prevalece la fuente primaria.

## 2. Reglas de ejecución

- ChatGPT implementa backend, modelo de datos, migraciones, RPC, funciones, triggers, cron, RLS, datos remotos y validación conceptual/real.
- Codex no modifica backend salvo solicitud explícita.
- El frontend no se implementa hasta que el backend esté desplegado, validado y su contrato final quede congelado.
- SOLOG Admin permanece fuera de alcance y desactivado hasta su bloque posterior.
- No se elimina legacy antes de validar su reemplazo.
- Los datos históricos reales deben preservarse.
- Octubre de 2026 nace directamente bajo el Motor nuevo.
- Antes de cualquier DDL destructivo debe existir un backup local verificable y restaurable.

## 3. Fases

### Fase 0 — Backup + baseline

Objetivo:
crear el punto de restauración y congelar este plan antes de modificar datos, usuarios o estructura.

Acciones:
1. congelar este plan;
2. registrar branch/HEAD;
3. registrar conteos de tablas críticas;
4. registrar sesiones activas y reconteos abiertos;
5. generar backup local mediante Supabase CLI:
   - `roles.sql`;
   - `schema.sql`;
   - `data.sql`;
6. generar manifiesto;
7. calcular checksums;
8. comprimir en ZIP y guardarlo en el PC del usuario;
9. verificar que los archivos existan y tengan tamaño razonable.

Gate:
- backup ZIP disponible localmente;
- checksums registrados;
- conteos de referencia registrados;
- 0 sesiones activas.

### Fase 1 — Mantenimiento SOLOG

Objetivo:
congelar escrituras operativas durante la migración.

Acciones:
1. registrar estado actual de usuarios SOLOG;
2. desactivar acceso operativo de Cajero/Admin;
3. mantener registro reversible de los usuarios modificados;
4. comprobar que no existan sesiones activas;
5. comprobar que no se generen nuevas sesiones/escrituras SOLOG.

Gate:
SOLOG operativo inactivo y estado previo de usuarios preservado para restauración posterior.

### Fase 2 — Foundation temporal

Crear helpers autoritativos de período, ronda y turno en `America/Lima`; ampliar estados de sesión; introducir `ultima_observacion_fisica_at`; preparar límites de medianoche.

Gate:
pruebas temporales de fechas, rondas, turnos y límites semiabiertos.

### Fase 3 — Runtime de sesión nuevo

Crear `inventario.solog_session_runtime_groups`; modelar acción `recount|coverage|daily|none`; índices/constraints y lifecycle `activo/recovery/finalizado/expirado`.

Gate:
start congela runtime correcto y sesiones cerradas eliminan runtime.

### Fase 4 — Migración de datos reales

Backfill de `ultimo_conteo_at` y `ultima_observacion_fisica_at`; preservar histórico e IDs; conservar casos `Recontar` abiertos.

Gate:
comparación pre/post por sede y grupo, histórico intacto.

### Fase 5 — Motor de snapshots y diferencias

Eliminar auto-resolución por snapshot posterior; adaptar snapshot/refresh de catálogo y grupos.

Gate:
`d != 0` siempre permanece `Recontar` hasta reconteo.

### Fase 6 — Cobertura + turnos + prioridad

Implementar doble cobertura quincenal derivada, máximo un conteo normal por turno, cobertura por reconteo y prioridad `review → coverage → daily`.

Gate:
matriz de escenarios de rondas, turnos y movimiento de stock.

### Fase 7 — Sesiones active/recovery

Implementar expiración en medianoche, recovery de 2 h y coexistencia `1 active + N recovery`.

Gate:
pruebas de 23:59/00:00, delivery tardío, finish y expiración.

### Fase 8 — Contrato Cajero nuevo

Exponer contrato versionado nuevo con basis, ronda/turno, tres colas, KPI de ronda, `next_action`, deltas e idempotencia.

Gate:
bootstrap/start/save/recount/finish + replay validados.

### Fase 9 — Validación backend real

Ejecutar datos sintéticos controlados, pruebas reales Supabase, permisos, concurrencia, recovery y reconteos.

Gate:
criterios de aceptación de la fuente primaria comprobados.

### Fase 10 — Limpieza destructiva

Eliminar columnas legacy, tablas métricas y runtime anterior; retirar RPC/funciones/triggers/índices/cron sustituidos.

Gate:
0 consumidores vigentes de objetos retirados + validación backend completa posterior.

### Fase 11 — Congelar contrato backend desplegado

Crear la fuente contractual del backend realmente desplegado para frontend.

Gate:
contrato desplegado, probado y sin decisiones backend pendientes.

### Fase 12 — Preparación frontend

Reactivar usuarios necesarios; desactivar Automatic Deployments de Cloudflare; Codex registra baseline y propone plan frontend.

Gate:
usuario aprueba plan Codex.

### Fase 13 — Migración frontend Cajero

Migrar tipos/parser/API/store/UI/navegación al contrato nuevo.

Gate:
tests, lint, build, git diff --check y validación local.

### Fase 14 — Smoke y cutover

Smoke humano local, habilitar despliegue solo tras aprobación, publicar Cajero nuevo.

Gate:
Cajero productivo validado; Admin continúa desactivado.

### Fase 15 — Cierre

Revisión global, documentación vigente/reemplazada/histórica, checkpoint y cierre explícito.

## 4. Gates principales

```text
Backup verificado
→ Foundation + migración + Motor nuevo
→ Validación backend
→ Limpieza legacy
→ Validación backend final
→ Contrato congelado
→ Frontend
→ Smoke
→ Cutover
```

Ninguna fase posterior puede saltarse un gate que proteja datos reales o contratos consumidores.
