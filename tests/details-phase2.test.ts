import { describe, expect, test } from 'bun:test'
import { DetailsStore } from '../src/features/solog/detalles/detalles.store'
import { detailsRpc, parseDetailsResponse } from '../src/features/solog/detalles/detalles.v2'
import { summaryFixture, detailsNow } from './fixtures/details-v2.mjs'
import { SologApiError } from '../src/features/solog/errors'
describe('D1/D3 scopes y acceso', () => {
  test('summary deduplicado con solo token y sin otras acciones', async () => {
    const calls: unknown[] = []
    const rpc = (async (action, payload) => { calls.push({ action, payload }); return parseDetailsResponse('summary', summaryFixture()) }) as typeof detailsRpc
    const store = new DetailsStore('user-1', 'token', rpc)
    await Promise.all([store.loadSummary(), store.loadSummary()])
    expect(calls).toEqual([{ action: 'summary', payload: { device_token: 'token' } }])
    store.dispose()
    expect(store.summary).toBeNull()
  })
  test('summary tardío no reaparece después de logout', async () => {
    let resolve!: (value: unknown) => void
    const rpc = (() => new Promise((r) => { resolve = r })) as typeof detailsRpc
    const store = new DetailsStore('user-1', '', rpc)
    const pending = store.loadSummary(); store.dispose(); resolve(summaryFixture())
    await expect(pending).rejects.toThrow()
    expect(store.summary).toBeNull()
  })
  test('timeout y doble click preservan operation_id; replay no solicita nuevamente', async () => {
    const calls: Record<string, unknown>[] = []
    const rpc = (async (action, payload) => {
      if (action === 'summary') return summaryFixture()
      calls.push(payload)
      if (calls.length === 1) throw new Error('timeout')
      return { contract_version: 2, generated_at: detailsNow, replay: true, status: 'pending', device_id: 'device-1', revisions: { devices: 3 } }
    }) as typeof detailsRpc
    const store = new DetailsStore('user-1', 'token', rpc)
    await store.loadSummary()
    await expect(store.requestAccess()).rejects.toThrow()
    await Promise.all([store.requestAccess(), store.requestAccess()])
    expect(calls.length).toBe(2)
    expect(calls[0]).toEqual(calls[1])
    expect(String(calls[0].operation_id)).toMatch(/^[0-9a-f-]{36}$/)
    expect(store.summary?.access.current_device_state).toBe('pendiente')
    expect(store.summary?.revisions.devices).toBe(3)
  })
  test('rechazo de dominio permite intención nueva sin ampliar permisos', async () => {
    const ids: unknown[] = []
    const rpc = (async (action, payload) => {
      if (action === 'summary') return summaryFixture()
      ids.push(payload.operation_id)
      if (ids.length === 1) throw new SologApiError('SOLOG_DEVICE_SEDE_MISMATCH')
      return { contract_version: 2, generated_at: detailsNow, replay: false, status: 'site_already_authorized', authorized_device_id: 'other', revisions: { devices: 3 } }
    }) as typeof detailsRpc
    const store = new DetailsStore('user-1', 'token', rpc); await store.loadSummary()
    await expect(store.requestAccess()).rejects.toThrow()
    await store.requestAccess()
    expect(ids[0]).not.toBe(ids[1])
    expect(store.summary?.access.can_request).toBe(false)
    expect(store.summary?.access.current_device_state).toBe('sin_solicitud')
  })
  test('UI no ofrece mutaciones de conteo', async () => {
    const source = await Bun.file('src/features/solog/detalles/detalles.panel.tsx').text()
    expect(source).toContain('summary.access.can_request')
    for (const label of ['Iniciar conteo', 'Enviar conteo', 'Finalizar conteo']) expect(source).not.toContain(label)
  })
})
