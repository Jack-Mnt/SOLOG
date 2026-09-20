import { expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

const modules = [
  'src/features/solog/cajero/cajero.conteo.tsx',
  'src/features/solog/cajero/cajero.diario.tsx',
  'src/features/solog/cajero/cajero.revisar.tsx',
  'src/features/solog/cajero/cajero.historial.tsx',
] as const

test('las cuatro lecturas de Cajero usan PanelLoader contained', async () => {
  for (const path of modules) {
    const content = await source(path)

    expect(content).toContain("components/panel-loader")
    expect(content).toContain('<PanelLoader variant="contained" />')
    expect(content).not.toContain('className="cajero-loading"')
  }
})

test('se retiran textos y spinners paralelos de las cargas de lectura', async () => {
  const conteo = await source(modules[0])
  const diario = await source(modules[1])
  const revisar = await source(modules[2])
  const historial = await source(modules[3])

  expect(conteo).not.toContain('Cargando grupos…')
  expect(diario).not.toContain('Cargando grupos…')
  expect(revisar).not.toContain('Cargando casos…')
  expect(historial).not.toContain('Cargando historial…')

  for (const content of [conteo, diario, revisar, historial]) {
    expect(content).not.toContain('LoaderCircle')
  }
})

test('Fase 3 no modifica la sincronización posterior al conteo', async () => {
  const cajero = await source('src/features/solog/cajero/cajero.tsx')

  expect(cajero).toContain('session.synchronizingAfterFinish')
  expect(cajero).toContain('Actualizando el panel…')
  expect(cajero).toContain('session.needsSynchronization')
  expect(cajero).toContain('className="cajero-loading"')
})

test('la geometría tablet de Cajero permanece fuera del alcance', async () => {
  const css = await source('src/features/solog/cajero/cajero.css')

  expect(css).toContain('@media (max-width: 1050px)')
  expect(css).toContain('@media (max-width: 720px)')
  expect(css).toContain('@media (max-width: 460px)')
  expect(css).toContain('.cajero-loading {')
})
