import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

function cssBlock(css: string, selector: string) {
  const start = css.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = css.indexOf('}', start)
  expect(end).toBeGreaterThan(start)
  return css.slice(start, end + 1)
}

describe('AdminDialog Fase 9.7 — consolidación visual transversal', () => {
  test('preserva los ritmos estructurales aprobados por kind y Proposal Drawer', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(cssBlock(css, '.admin-dialog--kind-confirmation .admin-dialog__body {'))
      .toContain('gap: 12px')
    expect(cssBlock(css, '.admin-dialog--kind-task .admin-dialog__body {'))
      .toContain('gap: 16px')
    expect(cssBlock(css, '.admin-dialog--kind-management .admin-dialog__body {'))
      .toContain('gap: 16px')
    expect(cssBlock(css, '.admin-catalog__proposal-detail {'))
      .toContain('gap: 24px')
  })

  test('Footer tolera wrapping sin alterar el contrato mobile existente', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(css).toContain(
      '.admin-dialog__footer {\n  flex-wrap: wrap;',
    )
    expect(cssBlock(css, '.admin-dialog__footer-actions {'))
      .toContain('flex-wrap: wrap')
    expect(css).toContain(
      '.admin-dialog__footer {\n    display: grid;\n    grid-template-columns: 1fr;',
    )
    expect(css).toContain('.admin-dialog__footer .button {\n    width: 100%;')
  })

  test('normaliza microtipografía de contextos de Catálogo y labels de forms solo dentro de Dialog', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    expect(cssBlock(css, '.admin-catalog__proposal-summary dd {'))
      .toContain('font-size: 0.875rem')
    expect(cssBlock(css, '.admin-catalog__price-summary dd {'))
      .toContain('font-size: 0.875rem')
    expect(css).not.toContain('font-size: 0.88rem')

    expect(cssBlock(css, '.admin-v2-form > label {'))
      .toContain('gap: 0.4rem')
    expect(cssBlock(css, '.admin-dialog .admin-v2-form > label {'))
      .toContain('gap: 4px')
  })

  test('AdminNotice apila su acción en Mobile solo dentro de AdminDialog', async () => {
    const css = await source('src/features/solog/admin/admin.css')
    const noticeStart = css.indexOf('.admin-dialog .admin-notice {')
    const mobileStart = css.lastIndexOf('@media (max-width: 767px) {', noticeStart)
    const nextMedia = css.indexOf('@media ', noticeStart)
    const mobileEnd = nextMedia === -1 ? css.length : nextMedia
    const mobileDialogCss = css.slice(mobileStart, mobileEnd)

    expect(noticeStart).toBeGreaterThanOrEqual(0)
    expect(mobileStart).toBeGreaterThanOrEqual(0)
    expect(mobileEnd).toBeGreaterThan(noticeStart)
    expect(mobileDialogCss).toContain(
      '.admin-dialog .admin-notice {\n    display: grid;\n    grid-template-columns: minmax(0, 1fr) auto;\n    align-items: start;',
    )
    expect(mobileDialogCss).toContain(
      '.admin-dialog .admin-notice__action {\n    width: 100%;\n    grid-column: 1 / -1;\n    grid-row: 2;\n    margin-left: 0;',
    )
    expect(mobileDialogCss).toContain(
      '.admin-dialog .admin-notice__action .button {\n    width: 100%;',
    )
    expect(mobileDialogCss).toContain(
      '.admin-dialog .admin-notice__close {\n    grid-column: 2;\n    grid-row: 1;',
    )

    expect(css).toContain('.admin-notice {\n  display: flex;')
  })

  test('no introduce una primitive nueva para secciones internas', async () => {
    const primitives = await source(
      'src/features/solog/admin/admin.primitives.tsx',
    )

    expect(primitives).not.toContain('AdminDialogSection')
  })
})
