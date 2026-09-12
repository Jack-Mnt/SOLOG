import { expect, test } from 'bun:test'
import { cashierCapability } from '../src/features/solog/cajero/cajero.capability'
import { parseCashierV3Bootstrap } from '../src/features/solog/cajero/cajero.v3.api'
import { cashierV3Bootstrap } from './fixtures/cashier-v3.mjs'

test('V8 recovery conserva entrega y bloquea captura con bootstrap V3', () => {
  const bootstrap = parseCashierV3Bootstrap(cashierV3Bootstrap('recovery'))
  const now = Date.parse(bootstrap.panel_state!.session.expira_at) + 1
  expect(cashierCapability(bootstrap, now)).toEqual({
    mode: 'recovery', captureAllowed: false, deliveryAllowed: true,
  })
})
test('V8 cierra entrega al alcanzar recovery_until', () => {
  const bootstrap = parseCashierV3Bootstrap(cashierV3Bootstrap('recovery'))
  const now = Date.parse(bootstrap.panel_state!.session.recovery_until)
  expect(cashierCapability(bootstrap, now)).toEqual({
    mode: 'expired', captureAllowed: false, deliveryAllowed: false,
  })
})
