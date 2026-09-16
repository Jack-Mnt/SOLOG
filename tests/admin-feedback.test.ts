import { describe, expect, test } from 'bun:test'
import { ManagementStore } from '../src/features/solog/admin/admin.management.store'
import type { managementMutate } from '../src/features/solog/admin/admin.management.v2'
import { bootstrapFixture } from './fixtures/admin-v2.mjs'
import { mutationFixture } from './fixtures/admin-management.mjs'

describe('Admin feedback de mutaciones', () => {
  test('cada retry conserva operation_id pero incrementa la ocurrencia visual', async () => {
    const auth = bootstrapFixture()
    const calls: Record<string, unknown>[] = []
    let fail = true
    const mutate = (async (action, payload) => {
      calls.push(structuredClone(payload))
      if (fail) throw new Error('Red no disponible')
      return mutationFixture(action, payload)
    }) as typeof managementMutate

    const store = new ManagementStore(
      'admin-test',
      () => auth,
      () => {},
      undefined,
      mutate,
    )

    await expect(
      store.mutation('authorize', { device_id: 'site-a-device-1' }, 2, 'site-a'),
    ).rejects.toThrow('Red no disponible')

    const first = store.intent('devices')
    expect(first?.attempt).toBe(1)
    const operationId = first?.payload.operation_id

    await expect(store.retryMutation('devices')).rejects.toThrow('Red no disponible')
    expect(store.intent('devices')?.attempt).toBe(2)
    expect(store.intent('devices')?.payload.operation_id).toBe(operationId)

    fail = false
    await store.retryMutation('devices')
    expect(store.resultOccurrence('devices')).toBe(1)
    expect(calls.map((payload) => payload.operation_id)).toEqual([
      operationId,
      operationId,
      operationId,
    ])

    await store.mutation('authorize', { device_id: 'site-a-device-1' }, 3, 'site-a')
    expect(store.resultOccurrence('devices')).toBe(2)
    expect(calls[3].operation_id).not.toBe(operationId)
  })

  test('MutationNotice usa AdminNotice y no presenta operation_id ni replay', async () => {
    const source = await Bun.file(
      'src/features/solog/admin/admin.management.presentation.tsx',
    ).text()

    expect(source).toContain("import { AdminNotice } from './admin.primitives'")
    expect(source).toContain("tone={intent.error ? 'error' : 'info'}")
    expect(source).toContain('tone="success"')
    expect(source).toContain('intent.attempt')
    expect(source).toContain('store.resultOccurrence(domain)')
    expect(source).toContain('intent.payload.operation_id')
    expect(source).not.toContain('result.replay')
    expect(source).not.toContain('(replay)')
    expect(source).not.toContain('payload.operation_id)}</p>')
  })

  test('dismiss se asocia a ocurrencia y no al texto visible', async () => {
    const source = await Bun.file(
      'src/features/solog/admin/admin.management.presentation.tsx',
    ).text()

    expect(source).toContain('dismissedOccurrence')
    expect(source).toContain('intent:\${operationId}:\${intent.attempt}:\${phase}')
    expect(source).toContain('result:\${domain}:\${store.resultOccurrence(domain) ?? 0}')
    expect(source).not.toContain('dismissedNotice !== noticeMessage')
  })
})
