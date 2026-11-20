# SOLOG — Integración Cajero — Contexto original de reconteos: validación frontend V1

**Estado:** R3 IMPLEMENTADA; R4 VALIDADA TÉCNICAMENTE; R5 SMOKE HUMANO PENDIENTE.
**Fecha:** 2026-11-20 (America/Lima).
**Clasificación:** Nivel C (bloque independiente de O1; sin Codex).
**Fuente primaria congelada:** `docs/SOLOG_Integracion_Cajero_Contexto_Original_Reconteos_V1.md`.
**Backend probado:** `docs/SOLOG_Backend_Cajero_Contexto_Original_Reconteos_Validacion_V1.md`.
**Rama:** `admin-work`, código verificado en `0ac47f2e3e27c1240357b1ce0dcf0b25fb08668c`; `master` conserva `5d10b19963183de6670a6c2c53ac14ece14192ad`.
**Responsable de ambas capas:** ChatGPT. No se utilizó Codex.

## 1. Contrato desplegado antes del frontend

- Migración Supabase `20261120213428_solog_cajero_full_recount_origin_v1`: solo amplía `inventario.full_cashier_kpi_projection_v1` para proyectar `recount_origin` en `CASHIER_STATE.groups[]`.
- Forma: `{ difference, counted_at, reason, note } | null`, con diferencia original calculada desde `stock_fisico-stock_teorico`, sin copiar la diferencia final del Motor.
- Dos casos de reconteo (uno con motivo y nota, otro con ambos `null`) y un caso de cobertura pasaron con `PASS_ROLLED_BACK`; 0 residuos.
- No se modificaron `V7.affected_groups`, la RPC de escritura, Motor, prioridad, tablas, permisos, sesiones, cron ni RLS.

## 2. Cambios frontend efectivamente realizados

| Archivo | Alcance |
|---|---|
| `src/features/solog/cajero/full.contract.ts` | `FullRecountOrigin`, tipado de V6 y validación de objeto/no-objeto, diferencia, fecha, motivo permitido y campos históricos nulos; lectura V7 no exige el campo |
| `src/features/solog/cajero/full.runtime.ts` | Validación de motivo heredado; nota nueva opcional para reconteo pequeño con motivo existente; nota obligatoria en diferencia >=12; rechazo de cambio de motivo y origen ausente |
| `src/features/solog/cajero/full.app.tsx` | Lista Revisar con diferencia inicial y actual; filtro +/-; tarjeta con diferencia inicial; diálogo recibe motivo y observación originales; no modifica prioridades |
| `src/features/solog/cajero/cajero.observacion.dialog.tsx` | Aplicar permite nota nula si existe motivo bloqueado y la explicación es voluntaria; sin copiar la nota histórica |
| `tests/cajero-full-kpis-cobertura.test.ts` | Validación del shape nuevo, casos nulos e inválidos; evidencia explícita de que V7 conserva shape antiguo |
| `tests/cajero-full-registro-autocierre.test.ts` | Motivo heredado con reconteo pequeño/alto, cambio prohibido, motivo nuevo exige texto y reconteo resuelto |
| `tests/cajero-full.browser.mjs` | Dos pruebas nuevas con filtros, diferencia inicial, motivo fijo, observación histórica, umbral 12, registro de borrador, payload y cierre |
| `.github/workflows/solog-cajero-full-v3-contracts.yml` | Añade rutas observadas del diálogo, test KPI y temporal que ya eran parte del workflow |

**No cambió** el journal `solog.full2`, la preparación/replay de UUID, la serialización de V7, el flujo temporal V3, Admin ni estilos globales. `master` no se fusionó.

## 3. Evidencia CI ejecutada y aprobada

[GitHub Actions #44823925719](https://github.com/Jack-Mnt/SOLOG/actions/runs/44823925719), SHA `0ac47f2e3e27c1240357b1ce0dcf0b25fb08668c`, **conclusion=success**, todas las fases:

| Verificación | Resultado |
|---|---|
| Tests Full dirigidos (7 archivos) | **73 PASS / 0 FAIL** |
| Suite global Bun (97 archivos) | **880 PASS / 0 FAIL** |
| Browser Chromium con V6/V7 simuladas | **37 PASS / 0 FAIL** (35 previas + 2 nuevas; 0 solicitudes externas) |
| `bun run lint` | **PASS** |
| `bun run build` (typecheck y build) | **PASS** |
| `git diff --check "$(git merge-base origin/master HEAD)" HEAD` | **PASS** |

Correcciones intermedias:
- Primera CI de integración detectó variable no utilizada en nuevo test; corregida en `076cfbbe`.
- Segunda CI detectó referencia `sid` global dentro de callbacks aislados de Playwright; corregida en `a7749abb`.
- Tercera CI ejecutó 37 Chromium PASS, pero `git diff --check` señaló únicamente dos espacios finales en un informe histórico de cierre O1. Se quitaron **sin cambiar decisiones** en `c7cab7a9`.
- Se ajustaron las rutas observadas del workflow en `0ac47f2e` para incluir tests que ejecutaba pero cuyos pushes no activaban CI. **La ejecución #44823925719 es la autoridad de validación final.**

## 4. Control remoto posterior y restricciones

Lectura Supabase de 2026-11-20 16:54:45 Lima:
- Política horaria `required`.
- Tres sesiones V3 reales, **las tres finalizadas**; 0 sesiones activas/recovery.
- 0 reservas B4 y 0 conflictos remotos persistidos.
- 0 inconsistencias detectadas en referencia de snapshot y expiración de ventanas V3.

**Cloudflare Pages:** el commit de código validado `0ac47f2e` tiene registro de Preview `queued/idle`, **sin despliegue exitoso**. El último Preview exitoso visible sirve `5d10b199`, igual que producción `master`, en `https://admin-work.sologpr.pages.dev`. Por tanto **no declarar R5 completada ni sugerir que Preview ya muestra la nueva UI**. La publicación controlada del commit validado requiere una decisión/paso específico; no se realizó durante la validación.

## 5. Dictamen y siguiente paso

**GO técnico para R5:** backend R2 desplegado y validado; frontend R3 implementado; R4 CI 100% aprobada.

**Pendiente:** desplegar de forma controlada la versión validada en Preview (sin publicar en producción) y realizar **smoke humano R5** de la pantalla Revisar con al menos un grupo realmente elegible, en una nueva sesión autorizada según prioridad del Motor, sin forzar diferencias ni reconteos. Verificar:
- Signos +/- y diferencias originales en la tabla; actualización de diferencia actual con borrador.
- Tarjeta de captura y motivo inicial bloqueado; observación original legible.
- Caso motivo heredado y diferencia pequeña sin nota nueva; caso de >=12 con nota nueva obligatoria.
- Persistencia real si el caso está operativo y la prueba es autorizada, más reconciliación al finalizar.
- Reconteos no accionables no pueden forzarse ni saltarse prioridad.

**Estado del bloque:** implementación y pruebas técnicas terminadas, **bloque integral NO cerrado** hasta smoke R5 y aprobación del usuario. O1 continúa cerrado.
