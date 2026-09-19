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

test('bootstrap Cajero usa PanelLoader error sin alterar su retry', async () => {
  const context = await source('src/features/solog/cajero/cajero.v3.context.tsx')

  expect(context).not.toContain("import { PageShell } from '../../../components/page-shell'")
  expect(context).toContain('title="No se pudo cargar Cajero"')
  expect(context).toContain('state="error"')
  expect(context).toContain('setAttempt((n) => n + 1)')
  expect(context).toContain('onClick={() => void onLogout()}')
  expect(context).toContain('if (!store.bootstrap) return <PanelLoader />')
})
