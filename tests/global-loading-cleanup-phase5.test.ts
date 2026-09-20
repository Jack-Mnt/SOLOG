import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await filesUnder(path)))
    } else {
      files.push(path.replaceAll('\\', '/'))
    }
  }

  return files
}

test('Fase 5 elimina referencias muertas en todo src', async () => {
  const paths = await filesUnder('src')
  const sourcePaths = paths.filter((path) => /\.(?:ts|tsx|css)$/.test(path))
  const contents = await Promise.all(sourcePaths.map((path) => Bun.file(path).text()))
  const source = contents.join('\n')

  expect(paths).not.toContain('src/components/page-shell.tsx')
  expect(source).not.toContain('PageShell')
  expect(source).not.toContain('page-shell')
  expect(source).not.toContain('cajero-loading')
  expect(source).not.toContain('details-loading')
})

test('Fase 5 conserva las excepciones deliberadas y feedback operativo', async () => {
  const detail = await Bun.file('src/features/solog/detalles/detalles.case.tsx').text()
  const detailsPanel = await Bun.file('src/features/solog/detalles/detalles.panel.tsx').text()
  const allPaths = (await filesUnder('src')).filter((path) => /\.(?:ts|tsx)$/.test(path))
  const allSource = (await Promise.all(allPaths.map((path) => Bun.file(path).text()))).join('\n')

  expect(detail).toContain('<p role="status">Cargando detalle…</p>')
  expect(detailsPanel).toContain('LoaderCircle')
  expect(detailsPanel).toContain('Solicitando…')
  expect(detailsPanel).toContain('Generando Excel…')

  for (const label of ['Ingresando…', 'Enviando…', 'Solicitando…', 'Generando Excel…', 'Publicando…']) {
    expect(allSource).toContain(label)
  }
})

test('Fase 5 conserva el contrato estructural de PanelLoader', async () => {
  const component = await Bun.file('src/components/panel-loader.tsx').text()
  const css = await Bun.file('src/shared.css').text()

  expect(component).toContain("export type PanelLoaderVariant = 'fullscreen' | 'contained' | 'compact'")
  expect(component).toContain("export type PanelLoaderState = 'loading' | 'error'")
  expect(component).toContain("variant ?? (contained ? 'contained' : 'fullscreen')")
  expect(css).toContain('.panel-loader {')
  expect(css).toContain('.panel-loader--contained {')
  expect(css).toContain('.panel-loader--compact {')
  expect(css).toContain('.panel-loader--error .panel-loader__symbol img')
})
