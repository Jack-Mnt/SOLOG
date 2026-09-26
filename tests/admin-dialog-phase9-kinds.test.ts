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

const taskConsumers = [
  'src/features/solog/admin/control/admin.control.v2.export-dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
  'src/features/solog/admin/admin.valuation-dialog.tsx',
  'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
]

describe('AdminDialog Fase 9.5 — kinds', () => {
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

  test('clasifica los ocho call sites congelados de Task', async () => {
    const sources = await Promise.all(taskConsumers.map(source))
    const total = sources.reduce(
      (count, current) =>
        count + (current.match(/kind="task"/g)?.length ?? 0),
      0,
    )

    expect(total).toBe(8)
  })

  test('Task absorbe el ritmo base sin retirar aún el helper usado por Management', async () => {
    const sources = await Promise.all(taskConsumers.map(source))
    const css = await source('src/features/solog/admin/admin.css')

    for (const current of sources) {
      expect(current).not.toContain('admin-dialog-task')
    }

    expect(css).toContain('.admin-dialog--kind-task .admin-dialog__body {')
    expect(css).toContain('.admin-dialog-task {')

    const start = css.indexOf('.admin-dialog--kind-task .admin-dialog__body {')
    const block = css.slice(start, css.indexOf('}', start) + 1)
    expect(block).toContain('display: grid')
    expect(block).toContain('gap: 16px')
  })

  test('Task conserva las geometrías default y wide congeladas', async () => {
    const groups = await source(
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
    )
    const catalog = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )

    expect(groups).toMatch(
      /title="Crear grupo"[\s\S]*?kind="task"[\s\S]*?size="wide"/,
    )
    expect(groups).toMatch(
      /title="Editar grupo"[\s\S]*?kind="task"/,
    )
    expect(catalog.match(/title="Resolver precio"/g)?.length).toBe(2)
    expect(catalog.match(/kind="task"/g)?.length).toBe(3)
    expect(catalog.match(/size="wide"/g)?.length).toBeGreaterThanOrEqual(3)
    expect(catalog).toMatch(
      /title="Publicar catálogo"[\s\S]*?kind="task"[\s\S]*?size="wide"/,
    )
  })
})
