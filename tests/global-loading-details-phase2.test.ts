import { expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

test('Detalles bloquea solo la primera carga con PanelLoader fullscreen', async () => {
  const panel = await source('src/features/solog/detalles/detalles.panel.tsx')

  expect(panel).toContain('if (!summary && status === "loading") return <PanelLoader />;')
  expect(panel).toContain('if (!summary && error) {')
  expect(panel).toContain('state="error"')
  expect(panel).toContain('title="No se pudo cargar la información de la sede"')
  expect(panel).toContain('onClick={() => void loadSummary()}')
  expect(panel).toContain('onClick={onLogout}')
  expect(panel).not.toContain('Consultando detalles de la sede…')
  expect(panel).not.toContain('className="cajero-empty-state details-loading"')
})

test('Detalles conserva Shell durante refresh cuando ya existe summary', async () => {
  const panel = await source('src/features/solog/detalles/detalles.panel.tsx')

  expect(panel).toContain('if (!summary && status === "loading")')
  expect(panel).toContain('if (!summary && error)')
  expect(panel).toContain('{error ? (')
  expect(panel).toContain('className="cajero-shell details-shell"')
})

test('Historial de Detalles usa PanelLoader compact y retira loader paralelo', async () => {
  const history = await source('src/features/solog/detalles/detalles.historial.dialog.tsx')

  expect(history).toContain("import { PanelLoader } from '../../../components/panel-loader'")
  expect(history).toContain('<PanelLoader variant="compact" />')
  expect(history).not.toContain('Cargando historial…')
  expect(history).not.toContain('className="cajero-loading"')
  expect(history).not.toContain('LoaderCircle')
})

test('detalle expandido conserva deliberadamente su texto pequeño de carga', async () => {
  const detail = await source('src/features/solog/detalles/detalles.case.tsx')

  expect(detail).toContain('<p role="status">Cargando detalle…</p>')
  expect(detail).not.toContain('PanelLoader')
})
