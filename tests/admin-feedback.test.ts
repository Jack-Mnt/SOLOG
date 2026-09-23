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
    expect(source).toContain('intent:${operationId}:${intent.attempt}:${phase}')
    expect(source).toContain('result:${domain}:${store.resultOccurrence(domain) ?? 0}')
    expect(source).not.toContain('dismissedNotice !== noticeMessage')
  })
})


describe('Admin feedback fases 2 y 3', () => {
  test('Catálogo y Productos comparten presenter sin UUID ni replay visible', async () => {
    const [feedback, catalog, products, setup] = await Promise.all([
      Bun.file('src/features/solog/admin/catalogo/admin.catalogo.feedback.tsx').text(),
      Bun.file('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx').text(),
      Bun.file('src/features/solog/admin/productos/admin.productos.v1.tsx').text(),
      Bun.file('src/features/solog/admin/productos/admin.product-setup.dialog.tsx').text(),
    ])

    expect(feedback).toContain('CatalogMutationNotice')
    const feedbackUtils = await Bun.file('src/features/solog/admin/catalogo/admin.catalogo.feedback.utils.ts').text()
    expect(feedbackUtils).toContain('catalogMutationError')
    expect(feedback).not.toContain('payload.operation_id')
    expect(catalog).not.toContain('CatalogIntentNotice')
    expect(products).not.toContain('CatalogIntentNotice')
    expect(setup).not.toContain('CatalogIntentNotice')
    expect(catalog).not.toContain('replay confirmado')
    expect(catalog).not.toMatch(/Publicación pendiente de confirmar:\s*\{receipt\.operationId\}/)
    expect([catalog, products, setup].every((source) => source.includes('CatalogMutationNotice'))).toBe(true)
  })

  test('errores retryable de Catálogo permanecen en una única superficie', async () => {
    const feedbackUtils = await Bun.file(
      'src/features/solog/admin/catalogo/admin.catalogo.feedback.utils.ts',
    ).text()
    const catalog = await Bun.file(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    ).text()

    expect(feedbackUtils).toContain("if (store.intent()) return ''")
    expect(catalog).toMatch(/catalogMutationError\(\s*store,\s*reason,/)
    expect(catalog).toContain('store.intent() ? "" : priceErrorMessage(reason)')
    expect(catalog).toMatch(
      /intent\s*&&\s*!setup\s*&&\s*!price[\s\S]{0,120}<CatalogMutationNotice\s+onRetry=\{retry\}/,
    )
  })

  test('Dispositivos separa feedback modal y feedback de página', async () => {
    const devices = await Bun.file(
      'src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx',
    ).text()

    expect(devices).toContain('{!confirmation && <MutationNotice domain="devices" />}')
    expect(devices).toContain('showResult={false}')
    expect(devices).toContain('setError(store.intent("devices") ? "" : e.message)')
  })

  test('Incidencias usa ocurrencia independiente del texto y retry de la intención original', async () => {
    const incidents = await Bun.file(
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
    ).text()

    expect(incidents).toContain('feedbackOccurrence')
    expect(incidents).toContain('mutationModalOpen')
    expect(incidents).toContain('noticeMessage && !mutationModalOpen')
    expect(incidents).toContain('local:${feedbackOccurrence}')
    expect(incidents).toContain('pendingIntent.attempt')
    expect(incidents).toContain('retryIncidentIntent')
    expect(incidents).toContain('store.retryMutation("incidents")')
    expect(incidents).toContain('onDismiss={pendingIntent ? undefined')
    expect(incidents).toMatch(/retryable\s*\?\s*store\.retryMutation\("incidents"\)/)
    expect(incidents).toContain('"La incidencia fue reactivada."')
    expect(incidents).toContain('"La incidencia fue ignorada durante 30 días."')
    expect(incidents).toContain('"La eliminación quedó aprobada y lista para la próxima publicación del Catálogo."')
  })

  test('notices retryable no pueden ocultar la única acción de retry', async () => {
    const [primitive, management, catalogFeedback] = await Promise.all([
      Bun.file('src/features/solog/admin/admin.primitives.tsx').text(),
      Bun.file('src/features/solog/admin/admin.management.presentation.tsx').text(),
      Bun.file('src/features/solog/admin/catalogo/admin.catalogo.feedback.tsx').text(),
    ])

    expect(primitive).toContain('onDismiss?: () => void')
    expect(primitive).toContain('{onDismiss && <IconButton')
    expect(management).not.toContain("onDismiss={() => setDismissedOccurrence(occurrence)}\n      action={!intent.pending")
    expect(catalogFeedback).not.toContain('onDismiss=')
  })
})
