import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DetailsCaseObservations } from '../src/features/solog/detalles/detalles.case'
import { parseDetailsResponse, type DetailsCase } from '../src/features/solog/detalles/detalles.v2'
import { detailFixture, historyFixture } from './fixtures/details-v2.mjs'

type Notes = Pick<DetailsCase, 'motivo_diferencia' | 'observacion_diferencia' | 'observacion_reconteo'>

function detail(notes: Partial<Notes> = {}, recountStock?: number) {
  const fixture = detailFixture()
  return {
    ...fixture,
    case: {
      ...fixture.case, ...notes,
      ...(recountStock === undefined ? {} : { stock_reconteo: recountStock }),
    },
  }
}

function html(notes: Partial<Notes> = {}) {
  const c = parseDetailsResponse('detail', detail(notes)).case
  return renderToStaticMarkup(createElement(DetailsCaseObservations, { caseData: c }))
}

describe('Detalles — Observaciones del conteo V1', () => {
  test('registros históricos nulos no generan sección visual', () => {
    const c = parseDetailsResponse('detail', detail()).case
    expect(c.motivo_diferencia).toBeNull()
    expect(c.observacion_diferencia).toBeNull()
    expect(c.observacion_reconteo).toBeNull()
    expect(html()).toBe('')
    // La lista paginada nunca transporta las notas del caso.
    expect(parseDetailsResponse('history', historyFixture('today', 1)).items).toHaveLength(1)
  })

  test('motivo y observación inicial se atribuyen al conteo, no al reconteo', () => {
    const markup = html({
      motivo_diferencia: 'Transferencia',
      observacion_diferencia: 'Se trasladaron doce unidades',
    })
    expect(markup).toContain('Conteo inicial')
    expect(markup).toContain('Transferencia')
    expect(markup).toContain('Se trasladaron doce unidades')
    expect(markup).not.toContain('<h4>Reconteo</h4>')
  })

  test('dos explicaciones permanecen separadas, con el mismo motivo', () => {
    const markup = html({
      motivo_diferencia: 'Dañado',
      observacion_diferencia: 'Se encontraron cajas dañadas',
      observacion_reconteo: 'Se confirmó el daño al revisar',
    })
    expect(markup).toContain('Conteo inicial')
    expect(markup).toContain('<h4>Reconteo</h4>')
    expect(markup).toContain('Se encontraron cajas dañadas')
    expect(markup).toContain('Se confirmó el daño al revisar')
    expect(markup.match(/Dañado/g)).toHaveLength(1)
  })

  test('motivo incorporado solo en reconteo no se atribuye a la observación original', () => {
    const markup = html({
      motivo_diferencia: 'Otro motivo',
      observacion_diferencia: null,
      observacion_reconteo: 'Error detectado durante la venta',
    })
    expect(markup).not.toContain('Conteo inicial')
    expect(markup).toContain('Motivo registrado durante el reconteo')
    expect(markup).toContain('Otro motivo')
    expect(markup).toContain('Error detectado durante la venta')
  })

  test('motivo incorporado sin texto adicional es visible como dato del reconteo', () => {
    const markup = html({
      motivo_diferencia: 'Venta por mayor',
      observacion_diferencia: null,
      observacion_reconteo: null,
    })
    expect(markup).toContain('Motivo registrado durante el reconteo')
    expect(markup).not.toContain('Conteo inicial')
    expect(markup).toContain('Venta por mayor')
  })

  test('reconteo físicamente coincidente admite Resuelto sin motivo previo', () => {
    const fixture = detail({ observacion_reconteo: 'Resuelto' }, 12)
    const c = parseDetailsResponse('detail', fixture).case
    const markup = renderToStaticMarkup(createElement(DetailsCaseObservations, { caseData: c }))
    expect(markup).toContain('Resuelto')
    expect(markup).toContain('<h4>Reconteo</h4>')
    expect(markup).not.toContain('Conteo inicial')
  })

  test('parser rechaza claves ausentes, motivos inválidos y notas incoherentes', () => {
    const valid = detail({ motivo_diferencia: 'Otro motivo', observacion_diferencia: 'Rotura observada' })
    expect(parseDetailsResponse('detail', valid).case.observacion_diferencia).toBe('Rotura observada')

    const missing = detail()
    delete (missing.case as Record<string, unknown>).observacion_reconteo
    expect(() => parseDetailsResponse('detail', missing)).toThrow()

    expect(() => parseDetailsResponse('detail', detail({ motivo_diferencia: 'No definido' }))).toThrow()
    expect(() => parseDetailsResponse('detail', detail({ motivo_diferencia: 'Dañado', observacion_diferencia: ' \t  ' }))).toThrow()
    expect(() => parseDetailsResponse('detail', detail({ motivo_diferencia: null, observacion_diferencia: 'Texto válido' }))).toThrow()
    expect(() => parseDetailsResponse('detail', detail({ motivo_diferencia: null, observacion_reconteo: 'Observación sin causa' }))).toThrow()
    expect(() => parseDetailsResponse('detail', detail({ observacion_reconteo: 'Resuelto' }, 15))).toThrow()
  })
})
