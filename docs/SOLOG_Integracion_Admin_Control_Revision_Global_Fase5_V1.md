# SOLOG — Integración Admin Control — Revisión Global Fase 5 — V1

**Estado:** IMPLEMENTADO Y VALIDADO TÉCNICAMENTE — SMOKE HUMANO DIFERIDO
**Fecha:** 6 de octubre de 2026
**Proyecto:** SOLOG
**Clasificación:** Nivel C — revisión global proporcional y cierre técnico
**Rama:** `admin-work`

## 1. Autoridad

Fuente primaria vigente:

`docs/SOLOG_Backend_Admin_Control_Contrato_V1.md`

Delta vigente para validación humana:

`docs/SOLOG_Backend_Admin_Control_Validacion_Delta_V1.md`

Este documento registra la revisión global de la implementación. No redefine producto, Motor V4, Dashboard ni contratos ya congelados.

## 2. Alcance de Fase 5

Se revisó de forma global:

- coherencia contrato backend → frontend;
- routing RPC;
- tipos y períodos;
- rango custom de 45 fechas;
- Drawer y lazy loading de `previous_counts`;
- caché vigente;
- exportación;
- retención técnica;
- grants y exposición de helpers;
- Cron;
- suite completa;
- lint;
- build;
- `git diff --check`;
- tests históricos afectados por decisiones ya aprobadas.

No se habilitaron usuarios y no se ejecutó smoke humano.

## 3. Revisión de integración frontend

### 3.1. Routing

Control consume:

```text
control_groups
control_chronology_view
→ public.rpc_solog_admin_control_v1
```

Export conserva:

```text
export
→ public.rpc_solog_control_export_v2
```

`rpc_solog_operational_v2` no es consumido por Control.

Su referencia restante en `admin.v2.ts` corresponde a otras superficies Admin todavía no migradas y no debe confundirse con una dependencia de Control.

### 3.2. Separación de períodos

Cronología:

```text
current_biweekly
previous_counts
```

Tabla principal y export mantienen donde corresponde:

```text
current_biweekly
previous_biweekly
```

No existe contaminación de `previous_counts` hacia export/Dashboard.

### 3.3. Custom

Frontend preventivo:

```text
min = hoy Lima - 44 días
max = hoy Lima
máximo = 45 fechas inclusivas
```

Backend continúa siendo autoridad.

### 3.4. Drawer

Se conserva:

- 560 px;
- timeline reciente → antiguo;
- shapes por estado;
- precio histórico compacto;
- consulta actual inmediata;
- `Conteos anteriores` lazy;
- cache independiente por período.

No se rediseñó la composición.

## 4. Verificación live de backend

Proyecto:

`fvtohxvcvsflzmftgfzs`

### 4.1. RPC pública

`public.rpc_solog_admin_control_v1(text,jsonb)`:

```text
exists                 true
SECURITY DEFINER       true
search_path            vacío
anon EXECUTE           false
authenticated EXECUTE  true
service_role EXECUTE   true
```

`public.rpc_solog_operational_v2(text,jsonb)`:

```text
exists false
```

Helpers internos de Control ejecutables por `authenticated`:

```text
[]
```

La advertencia general del advisor para funciones `SECURITY DEFINER` ejecutables por `authenticated` es esperada para esta RPC pública porque la función contiene autorización interna de usuario/rol/sede. No se encontró exposición anónima de la RPC de Control.

Referencia del advisor:
`https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable`

## 5. Retención técnica

### 5.1. snapshot_stock

Función vigente:

`inventario.cleanup_snapshot_stock()`

Regla verificada:

```text
capturado_at < now() - interval '12 hours'
```

Cron:

```text
conexion_cleanup_snapshot_stock
30 8,20 * * *
active = true
```

Al cierre de Fase 5:

```text
filas >12 h = 0
```

### 5.2. solog_operaciones

Función vigente desplegada:

`inventario.cleanup_solog_operaciones()`

Regla verificada:

```text
created_at < now() - interval '3 days'
```

Cron:

```text
solog_cleanup_operations
0 9 * * *
active = true
```

Al cierre de Fase 5:

```text
filas >3 días = 0
```

El nombre físico de la función no forma parte del contrato público de frontend.

### 5.3. conteos / conteo_detalle

No existe cleanup físico por 45 días.

Se mantiene la regla congelada:

```text
Control consulta 45 fechas
≠
PostgreSQL destruye hechos a los 45 días
```

Su política física queda pendiente del futuro bloque Dashboard.

## 6. Estado de usuarios

Admin/Moderador activos al cierre:

```text
0
```

No se reactivaron usuarios para esta validación.

## 7. Suite global

Se creó un workflow temporal de validación global y se retiró después de ejecutar la evidencia.

Ejecución final:

```text
GitHub Actions run: 37453585869
```

Resultado:

```text
731 pass
0 fail
3432 expect() calls
80 files
```

### 7.1. Lint

```text
bun run lint
PASS
```

### 7.2. Build

```text
tsc -b && vite build
PASS
2026 módulos transformados
Vite build: 304 ms
```

### 7.3. Diff check

Baseline congelado:

`ee6197064c3555b4c2c576104bfe36794646dca2`

Resultado:

```text
git diff --check ee6197064c3555b4c2c576104bfe36794646dca2 HEAD
PASS
```

## 8. Tests obsoletos detectados por la revisión global

La primera pasada global produjo 12 fallos. La inspección confirmó que no representaban regresiones de producto.

### 8.1. Control / Drawer

Un test histórico esperaba:

```text
Incluir quincena anterior
```

Se actualizó al contrato congelado:

```text
Conteos anteriores
previous_counts
```

### 8.2. Control / rango custom

Un test global esperaba que un rango arbitrario de febrero de 2028 fuera válido sin fecha de referencia.

Se conservó la prueba de fecha bisiesta, pero se suministró explícitamente `2028-02-29` como fecha de referencia para respetar el horizonte de 45 fechas.

### 8.3. Presentación horaria Admin

Nueve casos esperaban reloj 24 h:

```text
23:59
15:30
etc.
```

La implementación vigente usa am/pm explícito.

Los tests fueron actualizados para validar esa presentación sin modificar producto.

### 8.4. Cajero Historial

Un test anterior al bloque Control esperaba:

- `cajero-history-tabs`;
- símbolos `+` / `−` para expansión.

El producto ya había cambiado antes de Control mediante commits de Cajero del 6 de octubre a:

- segmented control compartido;
- chevrons de expansión.

Se actualizó únicamente el test obsoleto. No se modificó código de Cajero durante esta corrección.

## 9. Whitespace documental

`git diff --check` global detectó trailing whitespace en documentación del propio bloque y una línea vacía extra al EOF de una migración.

Se normalizó exclusivamente formato en:

- contrato Control;
- reportes Fase 2/3/4;
- delta de validación;
- migración de contrato.

No se modificó semántica.

## 10. Advisors

Se ejecutaron advisors de seguridad y performance.

Persisten findings globales preexistentes del proyecto en superficies fuera del alcance de Control, entre ellos:

- views `SECURITY DEFINER` de otras áreas;
- funciones públicas de otras áreas ejecutables por `anon`;
- índices/foreign keys y políticas RLS susceptibles de optimización.

No se corrigieron porque pertenecen a otros módulos y no bloquean el contrato Control.

Para Control se verificó específicamente:

- sin EXECUTE para `anon`;
- helpers internos no ejecutables por `authenticated`;
- RPC pública con validación interna;
- wrapper legacy ausente.

## 11. Concurrencia de rama

Desde el baseline congelado también existen cambios de Cajero ajenos al bloque Control.

La revisión no los revirtió ni reinterpretó.

Los cambios de producto atribuibles a la adaptación frontend de Control permanecen acotados a:

```text
src/features/solog/admin/admin.v2.format.ts
src/features/solog/admin/admin.v2.ts
src/features/solog/admin/control/admin.control.v2.tsx
```

Las demás modificaciones realizadas en Fase 5 corresponden a tests obsoletos o normalización documental.

## 12. Criterios de aceptación

Resultado técnico:

1. RPC dedicada de Control: PASS.
2. Sin dependencia Control de wrapper eliminado: PASS.
3. Custom máximo 45 fechas: PASS.
4. Tabla/filtros/sort/paginación preservados: PASS.
5. Cronología actual preservada: PASS.
6. `Conteos anteriores` lazy con `previous_counts`: PASS.
7. Ventana autoritativa calculada por backend: PASS.
8. Estados/diferencias/valorizado autoritativos: PASS.
9. Export sin regresión: PASS.
10. `propose_delete` desacoplado del histórico largo de `snapshot_stock`: validado en fases backend previas.
11. `snapshot_stock` TTL 12 h + Cron 12 h: PASS.
12. `solog_operaciones` TTL 3 días + Cron diario: PASS.
13. Sin cleanup físico de `conteos` / `conteo_detalle`: PASS.
14. Dashboard no redefinido en este bloque: PASS.
15. Suite/lint/build/diff-check: PASS.
16. Smoke humano: DIFERIDO por decisión congelada.

## 13. Estado final del bloque

El bloque **Admin > Control** queda:

```text
IMPLEMENTADO Y VALIDADO TÉCNICAMENTE
SMOKE HUMANO DIFERIDO
```

No quedan decisiones técnicas pendientes para Control.

El próximo bloque independiente es **Dashboard**.

El smoke humano de Control deberá incluirse posteriormente en el smoke global de Admin, después de implementar Dashboard y reactivar usuarios.
