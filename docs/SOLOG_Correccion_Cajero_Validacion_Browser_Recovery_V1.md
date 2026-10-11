# SOLOG — Validación browser recovery sin scope V1

**Nivel:** B (validación). **Rama:** `admin-work`. **Estado:** tests escritos, NO ejecutados ni certificados.
**Fuente primaria funcional:** `docs/SOLOG_Backend_Recovery_Sin_Scope_Resolucion_V1.md`.

## Prueba Playwright con mocks (segura)

No requiere conexión a Supabase. Monta el componente Cajero V4 real y su runtime contra un contrato RPC simulado en una página independiente servida por Vite. Comprueba:
- autocierre de recovery sin scope, sin introducir revisión ficticia;
- rechazo/estado incierto y protección del botón Iniciar;
- retry manual con mismo payload/identificador;
- ausencia de llamadas extra.

Archivos:
- `playwright.config.mjs`
- `tests/browser/recovery-harness.html`
- `tests/browser/recovery-harness.tsx`
- `tests/browser/recovery.spec.mjs`

Instalar Playwright en el entorno local (recomendada versión fija y lockfile):
```powershell
bun add -d @playwright/test@1.56.1
bunx playwright install chromium
bunx playwright test tests/browser/recovery.spec.mjs --config=playwright.config.mjs
```

**Nota:** `package.json` y `bun.lock` no se modificaron desde el conector; el comando `bun add` produce cambios locales que deben revisarse y versionarse juntos si se decide dejar Playwright como dependencia permanente.

## Prueba integrada con Supabase (mutación real, opt-in)

`tests/browser/recovery.integration.spec.mjs` utiliza el navegador para llamar a la RPC desplegada, verificar bootstrap antes/después y confirmar cierre persistido.

**No ejecutar contra producción.** Exige un entorno Supabase aislado preparado por un operador, usuario Cajero de prueba con JWT, dispositivo autorizado y una sesión **propia** en estado recovery, sin drafts reales pendientes. No crea fixtures ni usuarios automáticamente.

Variables requeridas (solo en entorno aislado; no guardar credenciales en el repositorio):
- `SOLOG_E2E_ALLOW_MUTATION=1`
- `SOLOG_E2E_ENV=isolated`
- `SOLOG_E2E_SUPABASE_URL`
- `SOLOG_E2E_SUPABASE_ANON_KEY`
- `SOLOG_E2E_ACCESS_TOKEN`
- `SOLOG_E2E_DEVICE_TOKEN`
- `SOLOG_E2E_RECOVERY_ID`

Ejecutar únicamente tras revisar el entorno y fixture:
```powershell
bunx playwright test tests/browser/recovery.integration.spec.mjs --config=playwright.config.mjs
```
Sin todas las variables, el test se marca `skipped`, no como validación correcta.

## Evidencia y cierre

Registrar en reporte resultados Playwright, tests Bun, lint, build, revisión de permisos, idempotencia y smoke humano. Un browser test mockeado **no** demuestra disponibilidad/seguridad de Supabase real; uno integrado **no** reemplaza la revisión de UX ni la comprobación de salvaguardas contra operaciones sin respuesta.

No modificar Motor V4, backend ni arquitectura producto como parte de estas pruebas.
