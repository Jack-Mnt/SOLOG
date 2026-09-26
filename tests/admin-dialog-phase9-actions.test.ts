import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

const cancelConsumers = [
  'src/features/solog/admin/admin.valuation-dialog.tsx',
  'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
  'src/features/solog/admin/control/admin.control.v2.export-dialog.tsx',
  'src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx',
  'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
  'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
  'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
  'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
  'src/features/solog/admin/productos/admin.productos.v1.tsx',
]

function buttonsWithLabel(text: string, label: string) {
  return (text.match(/<button[\s\S]*?<\/button>/g) ?? []).filter((button) =>
    new RegExp(`>\\s*(?:<[^>]+>\\s*)*${label}\\s*<\\/button>`).test(button),
  )
}

describe('AdminDialog Fase 9.6 — Buttons, IconButtons y Footer', () => {
  test('Cancelar conserva Button textual y usa icono X', async () => {
    const sources = await Promise.all(cancelConsumers.map(source))
    const cancelButtons = sources.flatMap((current) =>
      buttonsWithLabel(current, 'Cancelar'),
    )

    expect(cancelButtons.length).toBeGreaterThan(0)
    for (const button of cancelButtons) {
      expect(button).toContain('<X size={16} aria-hidden="true" />')
    }
  })

  test('retira Cerrar estructural y deja Footer solo cuando hay acción global', async () => {
    const catalog = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )
    const categories = await source(
      'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
    )
    const products = await source(
      'src/features/solog/admin/productos/admin.productos.v1.tsx',
    )

    expect(catalog).not.toMatch(/>\s*Cerrar\s*<\/button>/)
    expect(categories).not.toMatch(/>\s*Cerrar\s*<\/button>/)
    expect(products).not.toMatch(/>\s*Cerrar\s*<\/button>/)

    expect(catalog).toContain('const hasOperationalFooter =')
    expect(catalog).toContain('completed || !admin ? undefined : recoverable')
    expect(categories).toContain('hasCurrentOrderDraft ? (')

    const pendingTag = products.match(
      /<AdminDialog\s+title="Configuración pendiente"[\s\S]*?>/,
    )?.[0]
    expect(pendingTag).toBeDefined()
    expect(pendingTag).not.toContain('footer=')
  })

  test('acciones secundarias especiales también conservan icono + texto', async () => {
    const categories = await source(
      'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
    )

    const continueEditing = buttonsWithLabel(categories, 'Continuar editando')[0]
    const discardAndClose = buttonsWithLabel(categories, 'Descartar y cerrar')[0]

    expect(continueEditing).toContain('<Pencil size={16} aria-hidden="true" />')
    expect(discardAndClose).toContain('<X size={16} aria-hidden="true" />')
  })

  test('reintentos de Incidencias usan icono de retry y no el de la acción original', async () => {
    const incidents = await source(
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
    )

    expect(incidents).toMatch(
      /retryable \? \([\s\S]*?<RotateCcw size=\{16\} aria-hidden="true" \/>[\s\S]*?: \([\s\S]*?<AlarmClockOff/,
    )
    expect(incidents).toMatch(
      /retryable \? \([\s\S]*?<RotateCcw size=\{16\} aria-hidden="true" \/>[\s\S]*?: \([\s\S]*?<CircleOff/,
    )
  })

  test('copy operativo de Catálogo respeta el límite breve aprobado', async () => {
    const catalog = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.page.v4.tsx',
    )

    expect(catalog).toContain('Actualizar resolución')
    expect(catalog).not.toContain('Actualizar resolución de precio')
  })
})
