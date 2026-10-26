import { expect, test } from 'bun:test'

test('Cajero Full utiliza carga contained en el bootstrap y monta Full desde entry vigente', async () => {
  const entry = await Bun.file('src/features/solog/cajero/cajero.app.tsx').text()
  const full = await Bun.file('src/features/solog/cajero/full.app.tsx').text()
  expect(entry).toContain('<FullCashierPanel')
  expect(entry).not.toContain('<CajeroV4')
  expect(full).toContain("components/panel-loader")
  expect(full).toContain('<PanelLoader variant="contained" />')
  expect(full).not.toContain('LoaderCircle')
})

test('Full conserva header y navegación durante refresh contextual', async () => {
  const ui = await Bun.file('src/features/solog/cajero/full.app.tsx').text()
  expect(ui).toContain('className="cajero-header"')
  expect(ui).toContain('aria-label="Panel Cajero"')
  expect(ui).toContain('runtime.refresh()')
  expect(ui).toContain('runtime.resumePrepared()')
  expect(ui).not.toContain('Actualizar panel')
})
