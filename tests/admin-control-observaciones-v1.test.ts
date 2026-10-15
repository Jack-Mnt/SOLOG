import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'
import { validateAdminResponse } from '../src/features/solog/admin/admin.v2'
import {
  ChronologyTimeline,
  ChronologyObservationDetails,
} from '../src/features/solog/admin/control/admin.control.v2'
// @ts-expect-error Los fixtures compartidos de navegador son JavaScript.
import { responseFixture } from './fixtures/admin-v2.mjs'

const payload = { site_id: 'site-a', group_id: 'group-0', period: 'current_biweekly' }
const response = () => structuredClone(responseFixture('control_chronology_view', payload))

describe('Admin Control — observaciones de la cronología', () => {
  test('acepta nulos, nota inicial, nota de reconteo y ambas notas, sin alterar eventos', () => {
    const fixture = response()
    const before = structuredClone(fixture)
    const parsed = validateAdminResponse('control_chronology_view', fixture)
    expect(parsed.chronology.map(item => item.state)).toEqual([
      'Inconsistente', 'Confirmada', 'Recontado', 'Coincide',
    ])
    expect(parsed.chronology[0].observaciones.inicial).toBeNull()
    expect(parsed.chronology[1].observaciones).toEqual({ inicial: null, reconteo: null })
    expect(parsed.chronology[2].observaciones.inicial?.motivo).toBe('Transferencia')
    expect(parsed.chronology[3].observaciones.inicial?.texto).toContain('captura original')
    expect(parsed.chronology[3].observaciones.reconteo?.texto).toBe('Resuelto')
    expect(fixture).toEqual(before)
  })

  test('solo se ofrece información en eventos con anotaciones humanas', () => {
    const data = validateAdminResponse('control_chronology_view', response())
    const markup = renderToStaticMarkup(createElement(ChronologyTimeline, { rows: data.chronology }))
    expect((markup.match(/admin-control-chronology__event"/g) ?? [])).toHaveLength(4)
    expect((markup.match(/admin-control-chronology__observation-trigger/g) ?? [])).toHaveLength(3)
    expect(markup).not.toContain('admin-control-chronology__observation-popover')
  })

  test('popup muestra un motivo y dos explicaciones asociadas a fechas distintas', () => {
    const data = validateAdminResponse('control_chronology_view', response())
    const notes = data.chronology[3].observaciones
    const markup = renderToStaticMarkup(createElement(ChronologyObservationDetails, {
      observations: notes,
      onClose: () => {},
    }))
    expect(markup).toContain('Motivo y observaciones')
    expect(markup).toContain('Conteo inicial')
    expect(markup).toContain('Reconteo')
    expect(markup).toContain('Resuelto')
    expect(markup).toContain('2026')
    expect(markup).toContain('Se observó una diferencia en la captura original')
    expect((markup.match(/Otro motivo/g) ?? [])).toHaveLength(1)
    expect(markup).toContain('aria-label="Cerrar observaciones"')
  })

  test('sin motivo disponible no inventa una causa para una resolución', () => {
    const markup = renderToStaticMarkup(createElement(ChronologyObservationDetails, {
      observations: {
        inicial: null,
        reconteo: { motivo: null, texto: 'Resuelto', registrada_at: '2026-09-03T22:30:00Z' },
      },
      onClose: () => {},
    }))
    expect(markup).toContain('Resuelto')
    expect(markup).not.toContain('<span>Motivo</span>')
    expect(markup).not.toContain('Conteo inicial')
  })

  test('rechaza contrato incompleto, texto inválido y motivos contradictorios', () => {
    const invalids: Array<(fixture: ReturnType<typeof response>) => void> = [
      f => { delete f.chronology[0].observaciones },
      f => { delete f.chronology[0].observaciones.inicial },
      f => { f.chronology[0].observaciones.reconteo.texto = '  ' },
      f => { f.chronology[2].observaciones.inicial.motivo = null },
      f => { f.chronology[0].observaciones.reconteo.motivo = 'No permitido' },
      f => { f.chronology[3].observaciones.reconteo.motivo = 'Dañado' },
      f => { f.chronology[3].observaciones.inicial.registrada_at = 'fecha inexistente' },
      f => { f.chronology[0].observaciones.reconteo.texto = 'Resuelto' },
    ]
    for (const mutate of invalids) {
      const fixture = response()
      mutate(fixture)
      expect(() => validateAdminResponse('control_chronology_view', fixture)).toThrow()
    }
  })

  test('snapshot automático nunca hereda anotaciones humanas', () => {
    const fixture = response()
    fixture.chronology[1].row_id = 'sample:coincide-snapshot'
    fixture.chronology[1].state = 'Coincide'
    fixture.chronology[1].stock = 12
    delete fixture.chronology[1].difference
    delete fixture.chronology[1].valued_difference
    expect(() => validateAdminResponse('control_chronology_view', fixture)).not.toThrow()
    fixture.chronology[1].observaciones.inicial = {
      motivo: 'Otro motivo', texto: 'No pertenece a snapshot', registrada_at: '2026-09-16T22:30:00Z',
    }
    expect(() => validateAdminResponse('control_chronology_view', fixture)).toThrow()
  })
})
