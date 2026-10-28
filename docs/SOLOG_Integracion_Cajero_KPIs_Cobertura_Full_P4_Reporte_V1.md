# SOLOG — Integración Cajero — KPIs y cobertura Full — Reporte P4 V1

**Estado:** IMPLEMENTADO EN `admin-work`, **PENDIENTE DE VALIDACIÓN TÉCNICA**; no cerrar P4 ni comenzar P5 como validada sin pruebas.
**Clasificación:** Nivel B frontend.
**Fuente primaria:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_V1.md` (prevalece).
**Contrato backend efectivo:** `docs/SOLOG_Backend_Cajero_KPIs_Cobertura_Full_Contrato_V1.md`.
**Plan subordinado:** `docs/SOLOG_Integracion_Cajero_KPIs_Cobertura_Full_Plan_Frontend_V1.md`.
**Baseline remoto previo a P4:** `c79f229efd1bdfce4a1e9daaac7f0f95352bf29e`.
**Repositorio local y tests Bun:** no accesibles desde esta conexión; verificación técnica integral todavía no ejecutada.

## P4.1 — Contrato V6

- `src/features/solog/cajero/full.contract.ts`: añade `FullOperationalSummary` y `FullCashierGroup` con `coverage_pending_round`, obligatorios solo en `CASHIER_STATE`.
- Valida fechas de ronda, reloj `server_now` dentro de `[starts,ends)`, conteos enteros no negativos, igualdad `total=counted+pending`, porcentaje redondeado, acciones públicas válidas y bandera por grupo.
- `FullGroup` permanece como contrato de `V7.affected_groups`; V7 no exige bandera ni KPIs.
- Fixtures V6 de test Bun y navegador actualizadas para no debilitar el parser.

## P4.2 — Proyección local

- Nuevo `src/features/solog/cajero/full.coverage.ts` con `projectFullCoverage`:
  - A1/A2/B/C a partir de sesión y cobertura oficial;
  - caso vacío separado de completado;
  - estado inválido cuando el reloj no es confiable o la proyección venció;
  - borradores deduplicados de sesión activa, dentro de ronda y en grupos que aún tienen `coverage_pending_round=true`;
  - excluye observaciones confirmadas y operaciones rechazadas definitivamente;
  - `displayed=min(total,counted+provisional)`, sin alterar `operational_summary`.
- `FullRuntime.getRejectedObservationIds(sessionId)` consulta el journal **solo para presentación**, no cambia el payload, el outbox ni la lógica de reintento.

## P4.3 — Frescura y cambio de ronda

- `FullView.coverageFresh` inicialmente `false`; nuevo V6 exitoso la convierte en `true`; confirmación V7 aceptada la invalida antes de publicar los grupos delta, hasta reconciliación V6.
- La UI recibe un effect que detecta el final de ronda mediante `FullRuntime.clock` y `round_ends_at`, y solicita **una sola** lectura V6 por frontera mientras haya red y no haya otra operación. Persisten refrescos originales de foco, storage y reconexión.
- Los selectores devuelven `null` si la proyección está vencida o invalidada, de manera que P5 podrá mostrar estado seguro sin KPI obsoleto.

## Archivos modificados / creados

- `src/features/solog/cajero/full.contract.ts` — actualizado.
- `src/features/solog/cajero/full.coverage.ts` — nuevo.
- `src/features/solog/cajero/full.runtime.ts` — actualizado.
- `src/features/solog/cajero/full.app.tsx` — actualizado (solo refresh de ronda; UI P5 aún pendiente).
- `tests/cajero-full-kpis-cobertura.test.ts` — nuevo.
- `tests/cajero-full-registro-autocierre.test.ts` — fixtures y pruebas de frescura.
- `tests/cajero-full-inicio-snapshot-horario.test.ts` — fixture V6.
- `tests/cajero-full.browser.mjs` — fixtures de lectura V6.

## Validación requerida antes de aprobar P4

```bash
git branch --show-current
git status --short
git rev-parse HEAD
bun test tests/cajero-full-kpis-cobertura.test.ts tests/cajero-full-registro-autocierre.test.ts tests/cajero-full-inicio-snapshot-horario.test.ts tests/cajero-full-presentacion-regresion.test.ts
bun run lint
bun run build
git diff --check
```

Después, en P5/P6, `bun test` completo y browser de cuatro estados A1/A2/B/C, dos pestañas, error V6 y transición de ronda.

**Limitaciones actuales:** no se ha ejecutado la suite, typecheck, lint, build, `git diff --check` ni Playwright sobre el workspace real; tampoco se ha verificado el árbol local. No afirmar validaciones ni compatibilidad visual completadas. La fuente remota inspeccionada se mantuvo, sin tocar Supabase ni V7.

**Siguiente paso:** obtener evidencia de validación P4, corregir regresiones detectadas si las hubiera y después implementar P5 sobre el selector ya integrado.
