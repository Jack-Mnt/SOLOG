import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CajeroProductosDialog } from '../src/features/solog/cajero/cajero.productos.dialog'
import { CajeroObservacionDialog } from '../src/features/solog/cajero/cajero.observacion.dialog'
import { formatCajeroCurrency } from '../src/features/solog/cajero/cajero.utils'
import type { CashierV4Group } from '../src/features/solog/cajero/cajero.v4'
import { cashierV4Group } from './fixtures/cashier-v4.mjs'

const group = () => cashierV4Group('coverage') as CashierV4Group
const render = (value: CashierV4Group) => renderToStaticMarkup(
  createElement(CajeroProductosDialog, { group: value, onClose: () => {} }),
)

describe('Cajero — detalle local de productos y composición de observaciones', () => {
  test('un SKU: precio individual, código y sin inventar configuración por paquete', () => {
    const value = group()
    const html = render(value)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Productos incluidos')
    expect(html).toContain('1 producto')
    expect(html).toContain('Código #123')
    expect(html).toContain(formatCajeroCurrency(value.productos[0].precio))
    expect(html).not.toContain('Configuración de paquete del grupo')
    expect(html).not.toContain(' · null')
    expect(html).toContain('Detalle de productos incluidos')
    expect(html).toContain('aria-label="Cerrar productos incluidos"')
  })

  test('varios SKU: mantiene marca y precio por SKU, sin asignarles precio de paquete', () => {
    const value = group()
    value.productos = [
      { c_interno: 22001, producto: 'BEBIDA CON NOMBRE EXTRAORDINARIAMENTE LARGO QUE NECESITA SALTO DE LÍNEA',
        marca: 'Marca Uno', precio: 5.5 },
      { c_interno: 22002, producto: 'BEBIDA DE OTRA PRESENTACIÓN', marca: null, precio: 6.5 },
    ]
    value.unidades_por_paquete = 12
    value.precio_paquete = 60
    const html = render(value)
    expect(html).toContain('2 productos')
    expect(html).toContain('Marca Uno')
    expect(html).toContain('Código #22002')
    expect(html).toContain(formatCajeroCurrency(5.5))
    expect(html).toContain(formatCajeroCurrency(6.5))
    expect(html).toContain('Configuración de paquete del grupo')
    expect(html).toContain('Unidades por paquete')
    expect(html).toContain('Precio por paquete')
    expect(html).toContain(formatCajeroCurrency(60))
    expect((html.match(/cajero-productos-dialog__price/g) ?? [])).toHaveLength(2)
  })

  test('configuración parcial: no fabrica campos ausentes', () => {
    const value = group()
    value.precio_paquete = 45
    expect(render(value)).not.toContain('Unidades por paquete')
    expect(render(value)).toContain('Precio por paquete')
    value.precio_paquete = null
    value.unidades_por_paquete = 6
    expect(render(value)).toContain('Unidades por paquete')
    expect(render(value)).not.toContain('Precio por paquete')
  })

  test('lista numerosa o vacía: detalle desplazable y estado de ausencia explícito', () => {
    const value = group()
    value.productos = Array.from({ length: 32 }, (_, index) => ({
      c_interno: 23000 + index, producto: `SKU ${index + 1}`, marca: null, precio: 1,
    }))
    const html = render(value)
    expect(html).toContain('32 productos')
    expect((html.match(/cajero-productos-dialog__identity/g) ?? [])).toHaveLength(32)
    value.productos = []
    expect(render(value)).toContain('No hay productos incluidos.')
  })

  test('observación visual preserva motivos sin selección inicial, motivo bloqueado y acciones', () => {
    const props = {
      initialReason: null, initialText: null, priorReason: null, priorText: null,
      isRecount: false, isResolved: false, mandatory: false,
      onApply: () => {}, onCancel: () => {}, onClear: () => {}, onOmit: () => {},
    }
    const voluntary = renderToStaticMarkup(createElement(CajeroObservacionDialog, props))
    expect((voluntary.match(/type="radio"/g) ?? [])).toHaveLength(5)
    expect(voluntary).not.toContain('is-selected')
    expect(voluntary).toContain('Limpiar')
    expect(voluntary).toContain('Cancelar')
    expect(voluntary).toContain('disabled=""')
    const recount = renderToStaticMarkup(createElement(CajeroObservacionDialog, {
      ...props, isRecount: true, initialReason: 'Dañado' as const, priorReason: 'Dañado' as const,
      priorText: 'Paquete con daños', mandatory: true,
    }))
    expect(recount).toContain('is-selected is-locked')
    expect(recount).toContain('Omitir producto')
    expect(recount).not.toContain('>Limpiar<')
    expect(recount).toContain('Paquete con daños')
  })
})
