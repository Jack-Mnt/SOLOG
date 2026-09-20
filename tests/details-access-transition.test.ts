import { describe, expect, test } from 'bun:test'
import { DetailsStore } from '../src/features/solog/detalles/detalles.store'
import { detailsRpc } from '../src/features/solog/detalles/detalles.v2'
import { detailsNow, summaryFixture } from './fixtures/details-v2.mjs'

describe('Detalles — transición de autorización hacia Cajero', () => {
  test('autorización inmediata mantiene coherente el dispositivo actual', async () => {
    const rpc = (async (action) => {
      if (action === 'summary') return summaryFixture()
      return {
        contract_version: 2,
        generated_at: detailsNow,
        replay: false,
        status: 'authorized',
        device_id: 'device-1',
        revisions: { devices: 3 },
      }
    }) as typeof detailsRpc

    const store = new DetailsStore('user-1', 'token', rpc)
    await store.loadSummary()
    await store.requestAccess()

    expect(store.summary?.access.current_device_state).toBe('autorizado')
    expect(store.summary?.access.current_device_matches_site).toBe(true)
    expect(store.summary?.access.authorized_device_id).toBe('device-1')
    expect(store.summary?.access.can_request).toBe(false)
  })

  test('hook expone consulta manual y revalida una autorización inmediata', async () => {
    const source = await Bun.file('src/features/solog/detalles/detalles.hook.ts').text()

    expect(source).toContain('const checkAuthorization = useCallback')
    expect(source).toContain('const refreshed = await loadSummary()')
    expect(source).toContain("La solicitud continúa pendiente de autorización.")
    expect(source).toContain("Dispositivo autorizado. Ya puedes acceder a Cajero.")
    expect(source).toContain("if (r.status === 'authorized')")
    expect(source).toContain('await checkAuthorization()')
  })

  test('panel permite consultar estado pendiente y continuar a Cajero al autorizarse', async () => {
    const source = await Bun.file('src/features/solog/detalles/detalles.panel.tsx').text()

    expect(source).toContain('summary.access.current_device_state === "pendiente"')
    expect(source).toContain('onClick={() => void checkAuthorization()}')
    expect(source).toContain('"Consultar autorización"')
    expect(source).toContain('"Consultando…"')
    expect(source).toContain('isCurrentDeviceAuthorized')
    expect(source).toContain('onClick={() => navigateTo("/cajero")}')
    expect(source).toContain('Ir a Cajero')
    expect(source).not.toContain('Solicitud registrada')
  })

  test('Cajero conserva la validación autoritativa del dispositivo', async () => {
    const source = await Bun.file('src/features/solog/cajero/cajero.app.tsx').text()

    expect(source).toContain("if (!b.device.autorizado) replaceRoute('/detalles')")
  })
})
