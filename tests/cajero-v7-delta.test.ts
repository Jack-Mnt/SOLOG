import { expect, test } from 'bun:test'
import { applyCashierV3PanelDelta } from '../src/features/solog/cajero/cajero.v3.panel'
import { parseCashierV3Bootstrap } from '../src/features/solog/cajero/cajero.v3.api'
import { cashierV3Bootstrap, cashierV3Delta } from './fixtures/cashier-v3.mjs'

test('compatibilidad V7: el delta V3 conserva el panel congelado y converge', () => {
  const panel = parseCashierV3Bootstrap(cashierV3Bootstrap('session')).panel_state!
  const once = applyCashierV3PanelDelta(panel, cashierV3Delta())
  expect(applyCashierV3PanelDelta(once, cashierV3Delta())).toEqual(once)
  expect(once.basis).toEqual(panel.basis)
  expect(once.groups[0].productos).toEqual(panel.groups[0].productos)
})
