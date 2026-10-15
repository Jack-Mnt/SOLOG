import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SologApiError } from '../src/features/solog/errors'
import { CajeroObservacionDialog } from '../src/features/solog/cajero/cajero.observacion.dialog'
import { hasUnsavedCaptureEdit } from '../src/features/solog/cajero/cajero.capture.guard'
import { CashierV4Runtime } from '../src/features/solog/cajero/cajero.v4.runtime'
import { draftHarness } from './fixtures/cashier-v4-drafts'
import { cashierV4Bootstrap, cashierV4Ids as ids } from './fixtures/cashier-v4.mjs'

const high = { motivo_diferencia: 'Transferencia' as const, observacion_diferencia: 'Doce unidades trasladadas' }

describe('Cajero V5 — motivos, guardia, escritura y recovery', () => {
  test('diferencia absoluta 12 obliga explicación; 11 permite null explícito', () => {
    const h = draftHarness('coverage')
    expect(() => h.coordinator.captureNormal(h.scope, {
      grupo_id: ids.coverage, stock_fisico: 22, contado_at: h.stamp,
    })).toThrow('motivo')
    const valid = h.coordinator.captureNormal(h.scope, {
      grupo_id: ids.coverage, stock_fisico: 22, contado_at: h.stamp, ...high,
    })
    expect(valid.motivo_diferencia).toBe('Transferencia')
    expect(valid.observacion_diferencia).toBe('Doce unidades trasladadas')
    const smaller = h.coordinator.captureNormal(h.scope, {
      grupo_id: ids.coverage, stock_fisico: 21, contado_at: h.stamp,
    })
    expect(smaller.motivo_diferencia).toBeNull()
    expect(smaller.observacion_diferencia).toBeNull()
  })

  test('con motivo previo la explicación de reconteo es independiente e inmutable', () => {
    const h = draftHarness('review')
    const panel = cashierV4Bootstrap('active', { next_action: 'review' })
    Object.assign(panel.panel_state!.review_queue[0], {
      motivo_diferencia: 'Dañado', observacion_diferencia: 'Caja dañada al ingresar',
    })
    h.store.acceptBootstrap(panel)
    const saved = h.coordinator.captureRecount(h.scope, {
      detalle_id: ids.detail, grupo_id: ids.review, stock_fisico: 10, contado_at: h.stamp,
      motivo_diferencia: 'Dañado', observacion_reconteo: null,
    })
    expect(saved.motivo_diferencia).toBe('Dañado')
    expect(saved.observacion_reconteo).toBeNull()
    expect(() => h.coordinator.captureRecount(h.scope, {
      detalle_id: ids.detail, grupo_id: ids.review, stock_fisico: 10, contado_at: h.stamp,
      motivo_diferencia: 'Otro motivo', observacion_reconteo: null,
    })).toThrow()
  })

  test('reconteo alto y motivo nuevo requieren explicación, igual que la RPC', () => {
    const h = draftHarness('review')
    expect(() => h.coordinator.captureRecount(h.scope, {
      detalle_id: ids.detail, grupo_id: ids.review, stock_fisico: 22, contado_at: h.stamp,
    })).toThrow('explicación')
    const note = h.coordinator.captureRecount(h.scope, {
      detalle_id: ids.detail, grupo_id: ids.review, stock_fisico: 22, contado_at: h.stamp,
      motivo_diferencia: 'Otro motivo', observacion_reconteo: 'Conteo de caja repetido',
    })
    expect(note.observacion_reconteo).toBe('Conteo de caja repetido')
    expect(note.motivo_diferencia).toBe('Otro motivo')
  })

  test('timeout conserva payload V5 y reintenta con los mismos IDs', async () => {
    const h = draftHarness('coverage')
    h.coordinator.captureNormal(h.scope, {
      grupo_id: ids.coverage, stock_fisico: 22, contado_at: h.stamp, ...high,
    })
    h.respond(async () => { throw new Error('timeout') })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow('timeout')
    const before = h.storage.read(h.scope)
    expect(before.prepared?.protocol_version).toBe(5)
    expect(before.prepared?.response).toBeNull()
    expect(before.prepared?.action).toBe('save_batch')
    expect(before.prepared && 'items' in before.prepared && before.prepared.items[0]).toMatchObject(high)
    const first = structuredClone(h.requests[0])
    h.respond(async (_, args) => ({
      ...h.responseFor(args.p_action as string, args.p_payload as Record<string, unknown>),
      replay: true,
    }))
    await h.coordinator.flush(h.scope)
    expect(h.requests[1]).toEqual(first)
    expect(h.storage.read(h.scope).prepared).toBeNull()
    expect(h.storage.read(h.scope).normal).toHaveLength(0)
  })

  test('reconteo coincidente acepta null y confirma Resuelto desde backend', async () => {
    const h = draftHarness('review')
    h.coordinator.captureRecount(h.scope, {
      detalle_id: ids.detail, grupo_id: ids.review, stock_fisico: 10, contado_at: h.stamp,
      motivo_diferencia: null, observacion_reconteo: null,
    })
    const response = await h.coordinator.flush(h.scope)
    expect(response.reason).toBe('none')
    expect(h.storage.read(h.scope).recount).toHaveLength(0)
    expect(h.requests[0].action).toBe('recount_save_batch')
    expect(h.requests[0].payload.items).toEqual([{
      detalle_id: ids.detail, stock_fisico: 10, contado_at: h.stamp,
      motivo_diferencia: null, observacion_reconteo: null,
    }])
  })

  test('edición solo de observaciones dispara guardia D.1.4', () => {
    expect(hasUnsavedCaptureEdit({
      edited: false, expression: '10', physical: 10, savedPhysical: 10, editedObservation: true,
    })).toBe(true)
    expect(hasUnsavedCaptureEdit({
      edited: false, expression: '10', physical: 10, savedPhysical: 10, editedObservation: false,
    })).toBe(false)
  })

  test('diálogo obligatorio ofrece Omitir, no selecciona motivo y contiene campo accesible', () => {
    const markup = renderToStaticMarkup(createElement(CajeroObservacionDialog, {
      initialReason: null, initialText: null, priorReason: null, priorText: null,
      isRecount: false, isResolved: false, mandatory: true,
      onApply: () => {}, onCancel: () => {}, onOmit: () => {},
    }))
    expect(markup).toContain('Omitir producto')
    expect(markup).toContain('Explica esta diferencia')
    expect(markup).toContain('type="radio"')
    expect(markup).not.toContain('checked=""')
    expect(markup).toContain('disabled=""')
  })

  test('rechazo conocido no borra el lote V5 preparado', async () => {
    const h = draftHarness('coverage')
    h.coordinator.captureNormal(h.scope, {
      grupo_id: ids.coverage, stock_fisico: 22, contado_at: h.stamp, ...high,
    })
    h.respond(async () => { throw new SologApiError('SOLOG_DIFFERENCE_EXPLANATION_REQUIRED') })
    await expect(h.coordinator.flush(h.scope)).rejects.toThrow()
    expect(h.storage.read(h.scope).normal).toHaveLength(1)
    expect(h.storage.read(h.scope).prepared?.action).toBe('save_batch')
  })
})
