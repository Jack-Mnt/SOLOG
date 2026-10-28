import { expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

test('resolución de ruta usa PanelLoader error y conserva retry/logout', async () => {
  const app = await source('src/protected-app.tsx')

  expect(app).not.toContain("import { PageShell } from './components/page-shell'")
  expect(app).toContain('title="No se pudo resolver tu acceso"')
  expect(app).toContain('state="error"')
  expect(app).toContain('setAttempt((value) => value + 1)')
  expect(app).toContain('onClick={() => void auth.logout()}')
  expect(app).toContain('Cerrar sesión')
})

test('error de inicialización Auth reintenta con recarga completa', async () => {
  const app = await source('src/protected-app.tsx')

  expect(app).toContain('title="SOLOG no está disponible"')
  expect(app).toContain('description={auth.initializationError}')
  expect(app).toContain('onClick={() => window.location.reload()}')
})

test('bootstrap Cajero Full V6 muestra error, reintento y cierre seguro', async () => {
  const entry = await source('src/features/solog/cajero/cajero.app.tsx')
  const panel = await source('src/features/solog/cajero/full.app.tsx')
  expect(entry).toContain('<FullCashierPanel runtime={runtime}')
  expect(panel).toContain('!view.bootstrap && (error || view.error)')
  expect(panel).toContain('state="error" title="No se pudo cargar Cajero"')
  expect(panel).toContain('onClick={() => void run(() => runtime.refresh())}')
  expect(panel).toContain('onClick={() => setLogoutOpen(true)}')
  expect(panel).toContain('onClick={logoutSafe}')
  expect(panel).toContain('!view.bootstrap ? <PanelLoader variant="contained" />')
})
