import { expect, test } from 'bun:test'

test('Cajero V4 conserva loading compartido durante bootstrap y lazy UI', async () => {
  const app = await Bun.file('src/features/solog/cajero/cajero.app.tsx').text()
  expect(app).toContain('if (!b || !b.device.autorizado) return <PanelLoader />')
  expect(app).toContain('<Suspense fallback={<PanelLoader />}')
  expect(app).not.toContain('LoaderCircle')
})

test('refresh contextual conserva header y navegacion', async () => {
  const ui = await Bun.file('src/features/solog/cajero/cajero.v4.ui.tsx').text()
  expect(ui).toContain('<CajeroV4Header')
  expect(ui).toContain('aria-label="Panel Cajero"')
  expect(ui).toContain('captureClosed || (runtime.requiresRefresh && !policy)')
  expect(ui).toContain('policy.requiresRefresh || runtime.requiresRefresh')
  expect(ui).toContain('runtime.refresh().catch(() => {})')
  expect(ui).not.toContain('Actualizar panel')
})
