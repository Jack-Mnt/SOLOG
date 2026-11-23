import { describe, expect, test } from 'bun:test'
import { cashierDestinationForAccess, resolveCashierDestination } from '../src/features/solog/cashier-access'
import { getStoredDeviceToken } from '../src/features/solog/device'
import type { DetailsSummary } from '../src/features/solog/detalles/detalles.v2'

const token = 'a'.repeat(64)
const defaultAccess: DetailsSummary['access'] = {
  authorized_device_id: 'device-1',
  current_device_id: 'device-1',
  current_device_state: 'autorizado',
  current_device_matches_site: true,
  can_request: false,
}

describe('SOLOG — acceso de Cajero según dispositivo', () => {
  test('solo un dispositivo autorizado para su sede ingresa a Cajero', () => {
    expect(cashierDestinationForAccess(defaultAccess)).toBe('/cajero')
    for (const change of [
      { current_device_state: 'sin_solicitud' },
      { current_device_state: 'pendiente' },
      { current_device_state: 'revocado' },
      { current_device_state: 'token_requerido' },
      { current_device_matches_site: false },
      { authorized_device_id: 'device-2', current_device_state: 'sin_solicitud', can_request: false },
    ]) {
      expect(cashierDestinationForAccess({ ...defaultAccess, ...change })).toBe('/detalles')
    }
  })

  test('sin token no se ejecuta ninguna RPC y se deriva a Detalles', async () => {
    let requested = 0
    expect(await resolveCashierDestination(null, async () => {
      requested++
      return { access: defaultAccess }
    })).toBe('/detalles')
    expect(requested).toBe(0)
  })

  test('token existente consulta summary, preservando la autoridad del servidor', async () => {
    const received: string[] = []
    expect(await resolveCashierDestination(token, async receivedToken => {
      received.push(receivedToken)
      return { access: defaultAccess }
    })).toBe('/cajero')
    expect(received).toEqual([token])
  })

  test('errores de red/contrato se propagan y no se convierten en falta de autorización', async () => {
    await expect(resolveCashierDestination(token, async () => {
      throw new Error('red no disponible')
    })).rejects.toThrow('red no disponible')
  })

  test('consulta de token es de solo lectura y no crea token si es inválido', () => {
    const reads: string[] = []
    const storage = { getItem: (key: string) => {
      reads.push(key)
      return token
    } }
    expect(getStoredDeviceToken(storage)).toBe(token)
    expect(reads).toEqual(['solog.device_token.v1'])
    expect(getStoredDeviceToken({ getItem: () => 'invalido' })).toBeNull()
    expect(getStoredDeviceToken({ getItem: () => null })).toBeNull()
  })

  test('guard protege todas las rutas Cajero, incluidos alias, sin montar Full antes de autorizar', async () => {
    const code = await Bun.file('src/protected-app.tsx').text()
    expect(code).toContain("if (isCashierRoute(pathname) || pathname === '/count' || pathname === '/cajero/seguimiento')")
    expect(code).toContain('<CashierDeviceGuard')
    expect(code).toContain("if (destination === '/detalles')")
    expect(code).toContain("if (!authorized) return <PanelLoader")
    expect(code).toContain('<CajeroApp userId={userId} onLogout={onLogout} />')
  })
})
