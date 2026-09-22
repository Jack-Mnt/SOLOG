import { expect, test } from 'bun:test'

import { AdminStore } from '../src/features/solog/admin/admin.v2.store'
import {
  validateAdminResponse,
  validateControlPayload,
  type adminRpc,
} from '../src/features/solog/admin/admin.v2'
// @ts-expect-error shared browser fixtures
import { responseFixture } from './fixtures/admin-v2.mjs'

const bootstrapPayload = {
  site_id: 'site-a',
  origin_date: '2026-09-03',
  stock_class: 'positive' as const,
}
const pagePayload = {
  ...bootstrapPayload,
  state: 'Coincide' as const,
  page: 1,
}
const chronologyPayload = {
  site_id: 'site-a',
  group_id: 'group-0',
  period: 'current_biweekly' as const,
}

type MutableResponse = Record<string, unknown>

function setup(transform = (_action: string, value: MutableResponse) => value) {
  const calls: { action: string; payload: unknown }[] = []
  const rpc = (async (action, payload) => {
    calls.push({ action, payload })
    return validateAdminResponse(
      action,
      transform(action, responseFixture(action, payload)),
    )
  }) as typeof adminRpc
  return { store: new AdminStore('admin-test', rpc), calls }
}

test('8.2B valida shapes compactos y diferencias autoritativas', () => {
  const bootstrap = validateAdminResponse(
    'daily_detail_bootstrap',
    responseFixture('daily_detail_bootstrap', bootstrapPayload),
  )
  expect(bootstrap.page_size).toBe(25)
  expect(bootstrap.counts.positive.Coincide).toBe(27)
  expect(bootstrap.views.Inconsistente[0]).toMatchObject({
    theoretical: 4,
    initial_difference: 23,
    found_difference: -1,
  })

  const page = validateAdminResponse(
    'daily_detail_page',
    responseFixture('daily_detail_page', pagePayload),
  )
  expect(page.state).toBe('Coincide')
  expect(page.items).toHaveLength(1)

  const chronology = validateAdminResponse(
    'control_chronology_view',
    responseFixture('control_chronology_view', chronologyPayload),
  )
  expect(chronology.group.latest_unit_price).toBe(42)
  expect(chronology.chronology[0]).toMatchObject({
    state: 'Inconsistente',
    initial_difference: -10,
    found_difference: 5,
  })
  expect(chronology.chronology.every(row => !('valuation' in row))).toBe(true)
})

test('8.2B payloads fijan ISO estricto, page size remoto inexistente y períodos quincenales', () => {
  expect(() => validateControlPayload('daily_detail_bootstrap', bootstrapPayload)).not.toThrow()
  expect(() => validateControlPayload('daily_detail_page', pagePayload)).not.toThrow()
  expect(() => validateControlPayload('control_chronology_view', chronologyPayload)).not.toThrow()

  expect(() => validateControlPayload('daily_detail_bootstrap', {
    ...bootstrapPayload,
    origin_date: '2026-9-03',
  })).toThrow()
  expect(() => validateControlPayload('daily_detail_bootstrap', {
    ...bootstrapPayload,
    page_size: 25,
  })).toThrow()
  expect(() => validateControlPayload('daily_detail_page', {
    ...pagePayload,
    page: -1,
  })).toThrow()
  expect(() => validateControlPayload('control_chronology_view', {
    ...chronologyPayload,
    period: 'today',
  })).toThrow()
})

test('8.2B cachea bootstrap por stock y páginas por estado/página sin repetir requests', async () => {
  const { store, calls } = setup()
  await store.load('bootstrap', {})

  await store.load('daily_detail_bootstrap', bootstrapPayload)
  await store.load('daily_detail_bootstrap', bootstrapPayload)
  await store.load('daily_detail_bootstrap', { ...bootstrapPayload, stock_class: 'zero' })

  await store.load('daily_detail_page', pagePayload)
  await store.load('daily_detail_page', pagePayload)
  await store.load('daily_detail_page', { ...pagePayload, page: 2 })
  await store.load('daily_detail_page', { ...pagePayload, state: 'Recontar', page: 1 })

  expect(calls.filter(call => call.action === 'daily_detail_bootstrap')).toHaveLength(2)
  expect(calls.filter(call => call.action === 'daily_detail_page')).toHaveLength(3)
  store.dispose()
})

test('8.2B cronología compacta conserva caché por grupo/período y lazy independiente', async () => {
  const { store, calls } = setup()
  await store.load('bootstrap', {})

  const current = await store.load('control_chronology_view', chronologyPayload)
  await store.load('control_chronology_view', chronologyPayload)
  const previous = await store.load('control_chronology_view', {
    ...chronologyPayload,
    period: 'previous_biweekly',
  })

  expect(current.chronology.length).toBeGreaterThan(0)
  expect(previous.chronology).toEqual([])
  expect(calls.filter(call => call.action === 'control_chronology_view')).toHaveLength(2)
  store.dispose()
})

test('8.2B nueva revisión invalida detalle diario pero preserva cronología de sesión', async () => {
  const { store, calls } = setup((action, value) => {
    if (
      action === 'daily_detail_page' &&
      value.revisions &&
      typeof value.revisions === 'object' &&
      !Array.isArray(value.revisions)
    ) {
      ;(value.revisions as Record<string, unknown>).operational = 11
    }
    return value
  })
  await store.load('bootstrap', {})
  await store.load('control_chronology_view', chronologyPayload)
  await store.load('daily_detail_bootstrap', bootstrapPayload)
  await store.load('daily_detail_page', pagePayload)

  expect(store.peek('daily_detail_bootstrap', bootstrapPayload).data).toBeUndefined()
  expect(store.peek('control_chronology_view', chronologyPayload).data).toBeDefined()

  await store.load('control_chronology_view', chronologyPayload)
  expect(calls.filter(call => call.action === 'control_chronology_view')).toHaveLength(1)
  store.dispose()
})

test('8.2B descarta respuestas de otro stock/estado/página o grupo/período', async () => {
  for (const [action, payload, transform] of [
    [
      'daily_detail_bootstrap',
      bootstrapPayload,
      (value: MutableResponse) => { value.stock_class = 'zero' },
    ],
    [
      'daily_detail_page',
      pagePayload,
      (value: MutableResponse) => { value.page = 2 },
    ],
    [
      'control_chronology_view',
      chronologyPayload,
      (value: MutableResponse) => {
        if (value.group && typeof value.group === 'object' && !Array.isArray(value.group)) {
          ;(value.group as Record<string, unknown>).id = 'group-other'
        }
      },
    ],
  ] as const) {
    const { store } = setup((currentAction, value) => {
      if (currentAction === action) transform(value)
      return value
    })
    await store.load('bootstrap', {})
    await expect(store.load(action, payload as never)).rejects.toThrow()
    expect(store.peek(action, payload as never).data).toBeUndefined()
    store.dispose()
  }
})
