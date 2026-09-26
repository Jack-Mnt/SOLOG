import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('AdminDialog Fase 10 — cleanup estructural', () => {
  test('10.1 retira CSS muerto y aliases históricos confirmados', async () => {
    const css = await source('src/features/solog/admin/admin.css')

    for (const token of [
      'admin-catalog__proposal-context',
      'admin-export-dialog__fields',
      'admin-v2-kpis',
      'admin-v2-json',
      'admin-v2-data',
    ]) {
      expect(css).not.toContain(token)
    }

    expect(css).toContain(':where(.admin-toolbar)')
    expect(css).toContain('.admin-v2-actions')
    expect(css).toContain('.admin-v2-form')
    expect(css).toContain('.admin-v2-picker')
  })

  test('10.2 retira clases JSX huérfanas y conserva contratos compartidos', async () => {
    const [categories, control, incidents, catalog, products, devices] =
      await Promise.all([
        source('src/features/solog/admin/grupos/admin.categories.dialog.tsx'),
        source('src/features/solog/admin/control/admin.control.v2.tsx'),
        source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx'),
        source('src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx'),
        source('src/features/solog/admin/productos/admin.productos.v1.tsx'),
        source('src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx'),
      ])

    expect(categories).not.toContain('admin-categories__row--editing')
    expect(categories).toContain('className="admin-categories__row"')
    expect(categories).toContain('const isEditing = editing === category.id')

    expect(control).not.toContain('admin-control__tone--')
    expect(control).toContain('admin-status-badge--${tone}')
    expect(control).toContain('admin-status-badge--${stateTone[row.state]}')

    expect(incidents).not.toContain('admin-incidents__state')
    expect(incidents).toContain('admin-status-badge')

    expect(catalog).not.toContain('admin-catalog__proposal-change-section')
    expect(catalog).toContain('className="admin-catalog__dialog-section"')

    expect(products).not.toContain('admin-products__section')
    expect(products).not.toContain('admin-products"')
    expect(products).toContain('<section className="admin-catalog">')
    expect(products).toContain('admin-products__group')

    expect(devices).not.toContain('admin-device-badge')
    expect(devices).toContain('admin-device-card')
    expect(devices).toContain('admin-device-card__person')
  })

  test('10.3 retira la clase base huérfana de AdminSort y conserva el estado activo', async () => {
    const primitives = await source(
      'src/features/solog/admin/admin.primitives.tsx',
    )

    expect(primitives).not.toContain("'admin-sort__trigger'")
    expect(primitives).toContain(
      "className={active ? 'admin-sort__trigger--active' : undefined}",
    )
    expect(primitives).toContain('aria-label="Ordenar resultados"')
    expect(primitives).toContain('aria-haspopup="menu"')
  })

  test('conserva estructuras activas excluidas explícitamente del cleanup', async () => {
    const [css, app, theme] = await Promise.all([
      source('src/features/solog/admin/admin.css'),
      source('src/features/solog/admin/admin.v2.app.tsx'),
      source('src/features/theme/palette-switcher.tsx'),
    ])

    expect(css).toContain('.admin-appearance')
    expect(theme).toContain('admin-appearance')
    expect(app).toContain('<PaletteSwitcher')
    expect(css).toContain('.admin-dialog--kind-confirmation')
    expect(css).toContain('.admin-dialog--kind-task')
    expect(css).toContain('.admin-dialog--kind-management')
  })
})
