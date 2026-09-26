import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

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

describe('AdminDialog Fase 12 — cierre global', () => {
  test('inventario runtime final queda en 22 instancias: 18 Dialogs con kind + 4 Drawers', async () => {
    const sources = await Promise.all(dialogConsumerPaths.map(source))

    const totalDialogs = sources.reduce(
      (count, current) =>
        count + (current.match(/<AdminDialog\b/g)?.length ?? 0),
      0,
    )
    const totalKinds = sources.reduce(
      (count, current) =>
        count +
        (current.match(/kind="(?:confirmation|task|management)"/g)?.length ?? 0),
      0,
    )
    const totalDrawers = sources.reduce(
      (count, current) =>
        count + (current.match(/format="drawer"/g)?.length ?? 0),
      0,
    )

    expect(totalDialogs).toBe(22)
    expect(totalKinds).toBe(18)
    expect(totalDrawers).toBe(4)
  })

  test('ningún consumidor conserva variant legacy', async () => {
    const sources = await Promise.all(dialogConsumerPaths.map(source))

    for (const current of sources) {
      const blocks = current.match(/<AdminDialog[\s\S]{0,1000}?>/g) ?? []
      for (const block of blocks) expect(block).not.toContain('variant=')
    }
  })

  test('revisión global conserva las dos correcciones aprobadas', async () => {
    const [devices, members] = await Promise.all([
      source('src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx'),
      source('src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx'),
    ])

    expect(devices).toContain(
      '{error && <AdminNotice tone="error">{error}</AdminNotice>}',
    )
    expect(devices).not.toContain('<p role="alert">{error}</p>')

    expect(members).toContain('<dt>Grupo nuevo</dt>')
    expect(members).toContain('<dd>{separating.producto}</dd>')
  })

  test('V2 es la fuente global vigente y V1 queda histórica', async () => {
    const [v1, v2, plan] = await Promise.all([
      source('docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V1.md'),
      source('docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_V2.md'),
      source('docs/SOLOG_UI_Admin_Dialogs_Modals_Drawers_Plan_V1.md'),
    ])

    expect(v1).toContain('HISTÓRICO — REEMPLAZADO GLOBALMENTE POR V2')
    expect(v2).toContain('fuente primaria global vigente')
    expect(v2).toContain('22 instancias JSX de `AdminDialog`')
    expect(v2).toContain('18 Dialogs con kind')
    expect(v2).toContain('4 Drawers')
    expect(v2).toContain('**Estado:** VIGENTE — BLOQUE CERRADO.')
    expect(plan).toContain('22 instancias de AdminDialog — 18 Dialogs con kind + 4 Drawers')
    expect(plan).toContain('12. Validación + documentación + cierre  ✅')
  })
})
