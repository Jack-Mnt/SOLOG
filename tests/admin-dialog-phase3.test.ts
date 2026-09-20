import { describe, expect, test } from 'bun:test'

const dialogConsumerPaths = [
  'src/features/solog/admin/admin.valuation-dialog.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v3.tsx',
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
  test('mantiene los 19 consumidores base y añade 2 confirmaciones nested con Footer explícito', async () => {
    const sources = await Promise.all(dialogConsumerPaths.map(source))
    const totalDialogs = sources.reduce(
      (total, current) => total + (current.match(/<AdminDialog\b/g)?.length ?? 0),
      0,
    )
    const explicitFooters = sources.reduce(
      (total, current) => total + (current.match(/\bfooter=\{/g)?.length ?? 0),
      0,
    )

    expect(totalDialogs).toBe(21)
    expect(explicitFooters).toBe(18)
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
      /title=\{`Cronología de \$\{name\}`\}[\s\S]*?variant="drawer"/,
    )
    expect(control).toContain('className="admin-control-chronology"')
    expect(control).not.toContain('actualButton')
    expect(control).not.toContain("closest('[role=\"dialog\"]')")

    expect(incidents).toMatch(
      /title=\{`Repeticiones · \$\{typeLabels\[family\.tipo\]\}`\}[\s\S]*?variant="drawer"/,
    )
    expect(dashboard).toMatch(
      /title=\{`Detalle diario · \$\{siteName\}`\}[\s\S]*?variant="drawer"/,
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
    expect(dashboard).toContain(
      'className="admin-dialog__footer-navigation"',
    )
  })

  test('Configurar producto vuelve a default y conserva submit nativo desde Footer', async () => {
    const setup = await source(
      'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
    )

    expect(setup).not.toContain('variant="wide"')
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
