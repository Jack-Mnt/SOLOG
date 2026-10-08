import { expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

const modules = [
  'src/features/solog/cajero/cajero.app.tsx',
  'src/features/solog/cajero/cajero.historial.tsx',
] as const

test('las lecturas vigentes de Cajero usan PanelLoader contained', async () => {
  for (const path of modules) {
    const content = await source(path)

    expect(content).toContain("components/panel-loader")
    expect(content).toContain('<PanelLoader')
    expect(content).not.toContain('className="cajero-loading"')
  }
})

test('se retiran textos y spinners paralelos de las cargas de lectura', async () => {
  for (const path of modules) {
    const content = await source(path)
    expect(content).not.toMatch(/Cargando grupos…|Cargando casos…|Cargando historial…|LoaderCircle/)
  }
})

test('la geometría tablet vigente de Cajero permanece estable entre CSS propio y compartido', async () => {
  const cajeroCss = await source('src/features/solog/cajero/cajero.css')
  const operationalCss = await source('src/operational.css')
  const activeCss = cajeroCss + '\n' + operationalCss

  expect(activeCss).toContain('@media (max-width: 899px)')
  expect(activeCss).toContain('@media (max-width: 720px)')
  expect(activeCss).toContain('@media (max-width: 460px)')
})
