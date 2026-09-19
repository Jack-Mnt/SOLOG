import { expect, test } from 'bun:test'

test('PanelLoader conserva fullscreen por defecto y soporta variantes UX congeladas', async () => {
  const source = await Bun.file('src/components/panel-loader.tsx').text()

  expect(source).toContain("export type PanelLoaderVariant = 'fullscreen' | 'contained' | 'compact'")
  expect(source).toContain("export type PanelLoaderState = 'loading' | 'error'")
  expect(source).toContain("variant ?? (contained ? 'contained' : 'fullscreen')")
  expect(source).toContain("label = 'Cargando el panel…'")
  expect(source).toContain("isError ? 'panel-loader--error' : ''")
  expect(source).toContain("role={isError ? 'alert' : 'status'}")
  expect(source).toContain("aria-busy={!isError}")
})

test('PanelLoader error elimina indicadores de carga y expone contenido de recuperación', async () => {
  const source = await Bun.file('src/components/panel-loader.tsx').text()

  expect(source).toContain('className="panel-loader__title"')
  expect(source).toContain('className="panel-loader__description"')
  expect(source).toContain('className="panel-loader__actions"')
  expect(source).toContain('{isError ? (')
  expect(source).toContain('className="panel-loader__dots"')
})

test('CSS de PanelLoader añade solo variantes compact/error sin retirar las existentes', async () => {
  const css = await Bun.file('src/shared.css').text()

  expect(css).toContain('.panel-loader {')
  expect(css).toContain('.panel-loader--contained {')
  expect(css).toContain('.panel-loader--compact {')
  expect(css).toContain('.panel-loader--error .panel-loader__symbol img')
  expect(css).toContain('.panel-loader__title {')
  expect(css).toContain('.panel-loader__description {')
  expect(css).toContain('.panel-loader__actions {')
  expect(css).toContain('@media (prefers-reduced-motion: reduce)')
})
