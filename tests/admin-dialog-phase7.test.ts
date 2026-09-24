import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('AdminDialog Fase 7 — Catálogo + nesting', () => {
  test('Detalle de propuesta usa jerarquía vertical de Drawer y humaniza estados de publicación', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )
    const css = await source('src/features/solog/admin/admin.css')
    const detail = ui.slice(
      ui.indexOf('function ProposalDetail({'),
      ui.indexOf('function PriceResolutionDialog'),
    )

    expect(ui).toContain('function ProposalDetailChange')
    expect(ui).toContain('<h3>Cambio propuesto</h3>')
    expect(ui).toContain('proposalStatusLabels')
    expect(ui).toContain('proposalStatusTones')
    expect(detail).toContain('description={`C. interno ${proposal.c_interno}`}')
    expect(detail).toContain('className="admin-catalog__proposal-detail-state"')
    expect(detail).toContain('className="admin-attribute-badge"')
    expect(detail).toContain('admin-status-badge--${proposalStatusTones[proposal.estado]}')
    expect(detail).toContain('<h3>Evidencia</h3>')
    expect(detail).not.toContain('<h3>Contexto</h3>')
    expect(detail).not.toContain('<dt>C. interno</dt>')
    expect(ui).toContain('admin-catalog__proposal-change-card')
    expect(ui).toContain('admin-catalog__proposal-change-arrow')
    expect(css).toContain('.admin-catalog__proposal-detail')
    expect(css).toContain('.admin-catalog__proposal-change-card')
    expect(css).toContain('gap: 24px')
    expect(ui).toContain('blockReasonLabels')
    expect(ui).toContain('configuracion_requerida:')
    expect(ui).toContain('resolucion_precio_requerida:')
    expect(ui).toContain('<AdminNotice tone="warning">')
    expect(ui).toContain('<AdminNotice tone="success">')
    expect(ui).not.toContain('<dt>Sección</dt>')
    expect(ui).not.toContain('No publicable:')
  })

  test('Configurar producto recibe el precio propuesto y nunca usa cero silencioso', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )

    expect(ui).toContain(
      'const proposed = finiteNumber(proposal.datos["precio"]);',
    )
    expect(ui).toContain(
      'if (proposal.tipo === "agregar_producto") return proposed;',
    )
    expect(ui).toContain('const setupPrice = canSetup ? proposalSetupPrice(proposal) : null;')
    expect(ui).toContain('precio: setupPrice')
    expect(ui).toContain(
      'La propuesta no contiene un precio válido para configurar el',
    )
    expect(ui).not.toContain('proposal.catalogo_actual.precio ?? 0')
  })

  test('Resolver precio usa selección binaria explícita y auto keep_structure', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )
    const primitive = await source(
      'src/features/solog/admin/admin.primitives.tsx',
    )

    expect(ui).toContain('label: "Actualizar grupo"')
    expect(ui).toContain('label: "Separar producto"')
    expect(ui).toContain('label="Resolución"')
    expect(ui).toContain(': ""')
    expect(ui).toContain(
      'options.options.length === 1 && options.options[0] === "keep_structure"',
    )
    expect(ui).toContain(
      'El producto es el único integrante del grupo; se conservará su',
    )
    expect(primitive).toContain("value: T | ''")
    expect(primitive).toContain('selectedIndex < 0 && index === 0')
  })

  test('Resolver precio usa jerarquía compacta y valorizado sin caja adicional', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )
    const css = await source('src/features/solog/admin/admin.css')

    expect(ui).toContain('<h3>Resumen del cambio</h3>')
    expect(ui).toContain('className="admin-catalog__price-summary"')
    expect(ui).toContain('className="admin-catalog__price-flow"')
    expect(ui).toContain('<h3>Integrantes afectados · {options.members.length}</h3>')
    expect(ui).toContain('admin-catalog__valuation-section')
    expect(ui).toContain('admin-catalog__valuation-actions')
    expect(ui).toContain('Configurar')
    expect(ui).toContain(
      'El precio se aplicará al publicar; el valorizado del grupo se actualiza al confirmar esta resolución.',
    )
    expect(ui).not.toContain('admin-catalog__valuation-decision')
    expect(ui).not.toContain('Configurar valorizado')
    expect(css).toContain('.admin-catalog__price-summary')
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(css).toContain('.admin-catalog__valuation-actions')
    expect(css).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.admin-catalog__price-summary \{[\s\S]*?grid-template-columns: 1fr/,
    )
  })

  test('Resolver precio restaura prepared_resolution y bloquea guardado sin cambios', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )

    expect(ui).toContain('query.data.prepared_resolution')
    expect(ui).toContain('const preparedResolution')
    expect(ui).toContain('const preparedPackageAction')
    expect(ui).toContain('const initialPreparedValuation')
    expect(ui).toContain('const preparedComparable')
    expect(ui).toContain('const hasChanges =')
    expect(ui).toContain('!hasChanges')
    expect(ui).toContain('Guardar resolución')
    expect(ui).not.toContain('Preparar resolución')
    expect(ui).not.toContain('Existe staging preparado')
  })

  test('Valorizado nested aplica la resolución con CTA contextual', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )
    const valuation = await source(
      'src/features/solog/admin/admin.valuation-dialog.tsx',
    )

    expect(ui).toContain('confirmLabel="Aplicar"')
    expect(ui).toContain(
      'El valorizado se aplicará inmediatamente al grupo al confirmar.',
    )
    expect(ui).toContain('onConfirm={chooseValuation}')
    expect(ui).toContain(
      'executeResolution(nextPackageAction, nextValuation, setValuationError)',
    )
    expect(valuation).toContain("confirmLabel = 'Guardar valorizado'")
    expect(valuation).toContain("{pending ? 'Guardando…' : confirmLabel}")
  })

  test('Publicar catálogo muestra resumen operativo y conflictos estructurados', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )
    const css = await source('src/features/solog/admin/admin.css')

    expect(ui).toContain(
      'description="Revisa los cambios antes de publicar una nueva versión."',
    )
    expect(ui).toContain('<dt>Versión</dt>')
    expect(ui).toContain('<dt>Cambios</dt>')
    expect(ui).toContain('<dt>SKU</dt>')
    expect(ui).toContain('.filter(([, count]) => count > 0)')
    expect(ui).toContain('<h3>Cambios incluidos</h3>')
    expect(ui).toContain('No se puede publicar todavía.')
    expect(ui).toContain('className="admin-catalog__conflicts"')
    expect(ui).toContain('C. interno ${entityId}')
    expect(ui).not.toContain('JSON.stringify(conflict)')
    expect(css).toContain('.admin-catalog__publication-changes')
    expect(css).toContain('.admin-catalog__conflict')
  })

  test('Moderador no recibe CTA imposible y publicación completada queda solo en cierre', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )

    expect(ui).toContain('const completed = receipt.result?.completion_recorded === true;')
    expect(ui).toContain('const recoverable = !!receipt.operationId && !completed;')
    expect(ui).toContain('const footer = completed || !admin ? (')
    expect(ui).toContain(
      'Puedes revisar esta publicación, pero solo un administrador puede',
    )
    expect(ui).toContain('Catálogo publicado · versión {receipt.result.version}.')
    expect(ui).toContain('Recuperar publicación')
    expect(ui).toContain(
      'reutilizará la misma operación sin duplicar los cambios.',
    )
    expect(ui).not.toContain('Confirmar publicación')
  })

  test('mantiene nesting de dos y tres niveles sin traps locales', async () => {
    const ui = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )

    expect(ui).toContain('<ProductSetupDialog')
    expect(ui).toContain('<PriceResolutionDialog')
    expect(ui).toContain('<ValuationDialog')
    expect(ui).toContain('onClose={() => setSetup(false)}')
    expect(ui).toContain('onClose={() => setPrice(false)}')
    expect(ui).toContain('onClose={() => setValuation(false)}')
    expect(ui).not.toContain("closest('[role=\"dialog\"]')")
    expect(ui).not.toContain('focusTrap')
  })
})
