import { describe, expect, test } from 'bun:test'

const dialogConsumerPaths = [
  'src/features/solog/admin/admin.valuation-dialog.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
  'src/features/solog/admin/control/admin.control.v2.export-dialog.tsx',
  'src/features/solog/admin/control/admin.control.v2.tsx',
  'src/features/solog/admin/dashboard/admin.dashboard.v2.tsx',
  'src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx',
  'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
  'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
  'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
  'src/features/solog/admin/productos/admin.productos.v1.tsx',
]

async function source(path: string) {
  return Bun.file(path).text()
}

describe('AdminDialog Fase 3 — normalización estructural de consumidores', () => {
  test('mantiene 22 diálogos y permite Footers opcionales', async () => {
    const sources = await Promise.all(dialogConsumerPaths.map(source))
    const totalDialogs = sources.reduce(
      (total, current) => total + (current.match(/<AdminDialog\b/g)?.length ?? 0),
      0,
    )
    const explicitFooters = sources.reduce(
      (total, current) => total + (current.match(/\bfooter=\{/g)?.length ?? 0),
      0,
    )

    expect(totalDialogs).toBe(22)
    expect(explicitFooters).toBe(20)
  })

  test('los drill-down principales usan drawer y Cronología ya no implementa trap local', async () => {
    const control = await source(
      'src/features/solog/admin/control/admin.control.v2.tsx',
    )
    const incidents = await source(
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
    )
    const dashboard = await source(
      'src/features/solog/admin/dashboard/admin.dashboard.v2.tsx',
    )

    expect(control).toMatch(
      /title=\{`Cronología por producto · \$\{siteName\}`\}[\s\S]*?format="drawer"/,
    )
    expect(control).toContain('className="admin-control-chronology"')
    expect(control).not.toContain('actualButton')
    expect(control).not.toContain("closest('[role=\"dialog\"]')")

    expect(incidents).toMatch(
      /title=\{`Repeticiones · \$\{typeLabels\[family\.tipo\]\}`\}[\s\S]*?format="drawer"/,
    )
    expect(dashboard).toMatch(
      /title=\{`Detalle diario · \$\{siteName\}`\}[\s\S]*?format="drawer"/,
    )
  })

  test('la navegación global de Drawers vive en Footer', async () => {
    const control = await source(
      'src/features/solog/admin/control/admin.control.v2.tsx',
    )
    const incidents = await source(
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
    )
    const dashboard = await source(
      'src/features/solog/admin/dashboard/admin.dashboard.v2.tsx',
    )

    expect(control).not.toContain('admin-control-chronology__toolbar')
    expect(incidents).not.toContain('admin-v2-toolbar')
    expect(dashboard).toContain('admin-dashboard-daily__footer')
    expect(control).toContain('admin-control-chronology__footer-toggle')
    expect(incidents).toContain('admin-incidents__detail-actions')
  })

  test('Configurar producto vuelve a default y conserva submit nativo desde Footer', async () => {
    const setup = await source(
      'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
    )

    expect(setup).not.toContain('size="wide"')
    expect(setup).toContain('id="admin-product-setup-form"')
    expect(setup).toContain('form="admin-product-setup-form"')
    expect(setup).toContain('type="submit"')
  })

  test('Crear y Editar grupo conservan submit de formulario desde Footer', async () => {
    const groups = await source(
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
    )

    expect(groups).toContain('id="admin-create-group-form"')
    expect(groups).toContain('form="admin-create-group-form"')
    expect(groups).toContain('id="admin-edit-group-form"')
    expect(groups).toContain('form="admin-edit-group-form"')
  })
})
