import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parseCashierV3Bootstrap } from '../src/features/solog/cajero/cajero.v3.api'
import { cashierV3Bootstrap } from './fixtures/cashier-v3.mjs'

test('Cajero vigente usa bootstrap compacto V3 sin session_state', () => {
  const parsed = parseCashierV3Bootstrap(cashierV3Bootstrap('pre_session'))
  expect(parsed.contract_version).toBe(3)
  expect(parsed.panel_state).toBeNull()
  expect('session_state' in parsed).toBe(false)
})
test('superficie productiva usa únicamente transporte Cajero V3', () => {
  const api = readFileSync('src/features/solog/cajero/cajero.v3.api.ts', 'utf8')
  expect(api).toContain('rpc_solog_cashier_bootstrap_v3')
  expect(api).toContain('rpc_solog_cashier_mutate_v3')
})

test('la única RPC Cajero V2 restante es Historial', async () => {
  const matches: string[] = []
  for await (const path of new Bun.Glob('src/features/solog/cajero/*.{ts,tsx}').scan('.')) {
    const source = await Bun.file(path).text()
    if (/rpc_solog_cashier_\w+_v2/.test(source)) matches.push(...source.match(/rpc_solog_cashier_\w+_v2/g) ?? [])
    expect(source).not.toContain('panelFromState')
  }
  expect(matches).toEqual(['rpc_solog_cashier_history_v2'])
  expect(await Bun.file('src/features/solog/cajero/cajero.v3.ts').text()).not.toContain('session_state')
  expect(await Bun.file('src/features/solog/cajero/cajero.v3.store.ts').text()).not.toContain('session_state')
})
