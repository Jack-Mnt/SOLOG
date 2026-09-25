import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

const confirmationConsumers = [
  'src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx',
  'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
  'src/features/solog/admin/productos/admin.productos.v1.tsx',
  'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
]

describe('AdminDialog Fase 9.5A — Confirmation', () => {
  test('clasifica los siete call sites congelados como confirmation', async () => {
    const sources = await Promise.all(confirmationConsumers.map(source))
    const total = sources.reduce(
      (count, current) =>
        count + (current.match(/kind="confirmation"/g)?.length ?? 0),
      0,
    )

    expect(total).toBe(7)
  })

  test('retira wrappers manuales y traslada la composición al kind', async () => {
    const sources = await Promise.all(confirmationConsumers.map(source))
    const css = await source('src/features/solog/admin/admin.css')

    for (const current of sources) {
      expect(current).not.toContain('admin-dialog-confirmation')
    }

    expect(css).not.toContain('.admin-dialog-confirmation')
    expect(css).toContain(
      '.admin-dialog--kind-confirmation .admin-dialog__body {',
    )
    expect(css).toContain(
      '.admin-dialog--kind-confirmation .admin-dialog__body > p {',
    )
    expect(css).toContain(
      '.admin-dialog--kind-confirmation .admin-dialog__body > .admin-notice--info .admin-notice__message {',
    )
  })

  test('preserva el ritmo compacto aprobado de confirmation', async () => {
    const css = await source('src/features/solog/admin/admin.css')
    const start = css.indexOf(
      '.admin-dialog--kind-confirmation .admin-dialog__body {',
    )
    const block = css.slice(start, css.indexOf('}', start) + 1)

    expect(block).toContain('display: grid')
    expect(block).toContain('gap: 12px')
  })
})
