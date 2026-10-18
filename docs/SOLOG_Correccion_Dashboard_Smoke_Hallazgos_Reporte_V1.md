# SOLOG — Corrección Dashboard — Reporte de smoke: Rondas, Actividad y KPI V1

**Estado:** CORRECCIONES IMPLEMENTADAS Y VALIDADAS TÉCNICAMENTE; **SMOKE REAL PENDIENTE**.
**Fecha:** 2026-10-17, America/Lima.
**Rama:** `admin-work`. `master` sin cambios.
**Fuente primaria UI:** `docs/SOLOG_UI_Dashboard_Integracion_Prototipo_Final_V2.md`.
**Delta aprobado:** `docs/SOLOG_Correccion_Dashboard_Smoke_Hallazgos_V1.md`.
**Contrato backend:** `docs/SOLOG_Backend_Dashboard_RPC_Contrato_Desplegado_V1.md` (sin modificación).
**HEAD de código VALIDADO:** `d78d81c961976b9f3f3f6871cfb9a0950b15bba7`.
**CI:** [run 39083599757](https://github.com/Jack-Mnt/SOLOG/actions/runs/39083599757) — **success**.
**Baseline antes del delta:** `bdb43d7b2a5d51b6b4c4a70179134fd2b4de56c4`.

## 1. Hallazgo Rondas

Se contrastó la RPC desplegada mediante una consulta no destructiva a `inventario.metrics_dashboard_rounds_v1` para la sede Cutervo. La respuesta real de cortes históricos con `quality:'no_data'` contiene `shift_contributions:{}`. El frontend exigía las tres claves `early/day/night` en todos los casos, rechazando completamente la acción `rounds` con error de contrato V1.

- El validador acepta el objeto vacío **solo si el RoundItem tiene quality='no_data'** y el campo existe; para `complete/partial` sigue requiriendo las tres claves numéricas o null. No se acepta la ausencia total de `shift_contributions`.
- TypeScript representa claves ausentes explícitamente, y la vista usa `?? null` para mostrar N/D, **nunca 0 inventado**.
- Se registra esta diferencia de serialización del backend respecto del shape documental; **no se modificaron funciones SQL, permisos ni datos**. Una futura normalización del serializador requiere aprobación separada si se considera necesaria.
- Test focal: ejemplo no_data con `{}` aceptado; `{}` en quality complete/partial y ausencia total del campo rechazados.
- Navegador: el mock reproduce historia no_data de la RPC real y la vista Rondas carga correctamente.

## 2. Hallazgo Actividad

- Se calculan fechas con evidencia si **al menos uno de tres turnos** contiene un estado distinto de `no_data` y calidad distinta de `no_data`.
- Si los tres son `no_data`, el botón de cabecera y los tres botones de celda usan `disabled` nativo, nombre accesible que indica que el detalle no existe y estilo deshabilitado; la fecha no llama `day`.
- Si el día es mixto (dos turnos no_data, uno verificable), **toda la fecha sigue habilitada**, incluso desde una celda no_data. El Drawer continúa siendo de fecha completa.
- `no_tasks` (cero tareas verificado) no se trata como `no_data`.
- Hover/cursor activos no se aplican a los botones deshabilitados.

## 3. Hallazgo KPI principales

- Nuevo componente visual local `UnavailableMetric` con icono Info y texto `Sin datos`, utilizando tokens de `foundations.css`.
- Cobertura/Precisión: valor principal ausente → Sin datos; valor 0 real sigue como `0 %`.
- Riesgo: si quality=no_data se muestra un único estado Sin datos, no dos N/D artificiales.
- Sobrantes/Faltantes: cada importe nullable se representa como Sin datos, conservando contador de grupos autoritativo y estado parcial cuando existe.
- No se modificaron cálculos, porcentajes de backend, el formato de los importes válidos ni otros estados de las pestañas.

## 4. Archivos actualizados

- `src/features/solog/admin/dashboard/admin.dashboard.metrics.contract.ts`
- `src/features/solog/admin/dashboard/admin.dashboard.metrics.types.ts`
- `src/features/solog/admin/dashboard/admin.dashboard.metrics.rounds.tsx`
- `src/features/solog/admin/dashboard/admin.dashboard.metrics.activity.tsx`
- `src/features/solog/admin/dashboard/admin.dashboard.metrics.activity-episodes.css`
- `src/features/solog/admin/dashboard/admin.dashboard.metrics.cards.tsx`
- `src/features/solog/admin/dashboard/admin.dashboard.metrics.css`
- `tests/admin-dashboard-v3.test.ts`
- `tests/admin-dashboard-metrics.browser.mjs`
- `docs/SOLOG_Correccion_Dashboard_Smoke_Hallazgos_V1.md`
- `.github/workflows/dashboard-phase6-validation.yml` (solo comentario para disparo puntual; sin cambiar trigger ni jobs)

## 5. Validación técnica ejecutada

**Evidencia final:** [GitHub Actions, run 39083599757](https://github.com/Jack-Mnt/SOLOG/actions/runs/39083599757).

| Validación | Resultado |
|---|---|
| `bun install --frozen-lockfile` | PASS |
| `bun test --reporter=dot` | **790 pass, 0 fail** |
| `bun run lint` | PASS, sin errores |
| `bun run build` (TypeScript + Vite) | PASS |
| `git diff --check` | PASS |
| Browser Dashboard V1 | PASS, con ronda histórica no_data `{}`, KPI Sin datos y fechas deshabilitadas |
| Browser Control V2 | PASS, sin regresión del módulo compartido |
| Responsive 1440, 1024, 850 y 430 px | PASS, sin overflow de documento |
| Tráfico de pruebas a Supabase de producción | **0** |

La primera ejecución del delta ([run 39083480337](https://github.com/Jack-Mnt/SOLOG/actions/runs/39083480337)) falló por una llave JSX omitida al editar cobertura. Se corrigió el mismo archivo y se repitió **toda** la batería: segundo run verde. No quedan errores técnicos reportados por el run final.

## 6. Estado del smoke

**Pendiente de confirmación humana en Preview**, con sesión admin real y datos Supabase actuales:
1. Cutervo → Rondas carga, muestra ronda actual e histórico `N/D`, sin error de contrato.
2. Actividad → fecha con tres turnos N/D no abre Drawer desde encabezado ni celdas; fecha con datos sí lo abre.
3. Tarjetas Huaca/Divino sin evidencias → importes/precisión/riesgo con icono Sin datos; Cutervo mantiene sus valores reales, en especial cero válido.

No fusionar con `master` ni cerrar Fase 7 hasta aceptación expresa del usuario.
