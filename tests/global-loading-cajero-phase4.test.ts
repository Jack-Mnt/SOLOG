import { expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

test('sincronización activa posterior al finish usa PanelLoader contained', async () => {
  const cajero = await source('src/features/solog/cajero/cajero.tsx')

  expect(cajero).toContain('session.synchronizingAfterFinish ? (')
  expect(cajero).toContain('<PanelLoader variant="contained" label="Actualizando el panel…" />')
  expect(cajero).not.toContain('LoaderCircle')
})

test('needsSynchronization conserva solo el warning accionable', async () => {
  const cajero = await source('src/features/solog/cajero/cajero.tsx')

  expect(cajero).toContain(
    "session.needsSynchronization || session.needsCapabilityRefresh || session.effectiveMode === 'expired'",
  )
  expect(cajero).toContain(
    "'El conteo ya finalizó. Actualiza el panel para obtener el estado vigente.'",
  )
  expect(cajero).toContain('onClick={() => void session.refresh()}>Consultar estado de sesión</button>')
  expect(cajero).not.toContain(
    'El conteo finalizó. Reintenta la sincronización del panel para continuar.',
  )
  expect(cajero).not.toContain(': session.needsSynchronization ? (')
})

test('Fase 4 no modifica la lógica que define ambos estados', async () => {
  const session = await source('src/features/solog/cajero/cajero.session.ts')

  expect(session).toContain('const synchronizingAfterFinish = Boolean(')
  expect(session).toContain('!store.needsSynchronization')
  expect(session).toContain('needsSynchronization: store.needsSynchronization')
  expect(session).toContain('refresh: async () => { try { await store.refresh(); setError(null) }')
})

test('Header y Bottom Navigation siguen fuera del estado sincronizando', async () => {
  const cajero = await source('src/features/solog/cajero/cajero.tsx')

  expect(cajero).toContain('<CajeroHeader')
  expect(cajero).toContain('<CajeroBottomNavigation')
  expect(cajero).toContain('session.synchronizingAfterFinish ? (')
})
