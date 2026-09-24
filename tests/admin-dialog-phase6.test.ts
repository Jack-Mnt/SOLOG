import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('AdminDialog Fase 6 — gestión wide', () => {
  test('GroupCandidatePicker busca antes de renderizar y limita a 50 resultados', async () => {
    const members = await source(
      'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
    )

    expect(members).toContain('const CANDIDATE_LIMIT = 50')
    expect(members).toContain('if (term.length < 2) return []')
    expect(members).toContain(
      'const candidates = matchedCandidates.slice(0, CANDIDATE_LIMIT)',
    )
    expect(members).toContain(
      'Busca por código, producto, marca o grupo.',
    )
    expect(members).toContain(
      'Mostrando 50 resultados. Refina la búsqueda.',
    )
    expect(members).toContain(
      'checked={selectedCodes.has(product.c_interno)}',
    )
    expect(members).toContain('C. interno {product.c_interno}')
  })

  test('Crear grupo usa layout wide compacto e informa movimientos y categoría', async () => {
    const groups = await source(
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
    )

    expect(groups).toContain('title="Crear grupo"')
    expect(groups).toContain('size="wide"')
    expect(groups).toContain('className="admin-group-create__fields"')
    expect(groups).toContain('<h3>Integrantes</h3>')
    expect(groups).toContain(
      'Crea un grupo de conteo con dos o más SKU del mismo precio.',
    )
    expect(groups).toContain(
      'Los SKU seleccionados pasarán al nuevo grupo. Si pertenecen a otro',
    )
    expect(groups).toContain(
      'Su categoría operativa cambiará a ${selectedCategory.nombre}.',
    )
    expect(groups).not.toContain(
      'El precio unitario se toma del Catálogo y el backend confirma la',
    )
  })

  test('Categorías usa edición inline, IconButton y protege el borrador de orden', async () => {
    const categories = await source(
      'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
    )

    expect(categories).toContain('className="admin-categories__rename-inline"')
    expect(categories).toContain('<IconButton')
    expect(categories).toContain('title="Subir categoría"')
    expect(categories).toContain('title="Bajar categoría"')
    expect(categories).toContain('title="Renombrar categoría"')
    expect(categories).toContain('hasCurrentOrderDraft')
    expect(categories).toContain(
      'Guarda o descarta el nuevo orden antes de realizar otros',
    )
    expect(categories).toContain('Guardar orden')
    expect(categories).not.toContain('Guardar orden completo')
    expect(categories).not.toContain('admin-categories__counts')
  })

  test('Cerrar Categorías con orden pendiente abre confirmación nested', async () => {
    const categories = await source(
      'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
    )

    expect(categories).toContain('const [discardConfirm, setDiscardConfirm]')
    expect(categories).toContain('const requestClose = () =>')
    expect(categories).toContain('setDiscardConfirm(true)')
    expect(categories).toContain('title="Descartar cambios de orden"')
    expect(categories).toContain('Continuar editando')
    expect(categories).toContain('Descartar y cerrar')
    expect(categories).toContain('className="button button--danger"')
  })

  test('Integrantes confirma Unlink en nested antes de make_unique', async () => {
    const members = await source(
      'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
    )

    expect(members).toContain('<IconButton')
    expect(members).toContain('setSeparating(member)')
    expect(members).toContain('title="Separar producto"')
    expect(members).toContain(
      'description="El producto dejará el grupo y quedará como Único."',
    )
    expect(members).toContain('<dt>Grupo nuevo</dt>')
    expect(members).toContain('<dd>{separating.producto}</dd>')
    expect(members).toContain(
      "await store.mutation('make_unique', {",
    )
    expect(members).toContain('closeDisabled={!!intent}')
    expect(members).toMatch(/onClick=\{\(\) => void separate\(\)\}[\s\S]*?>[\s\S]*?<Unlink[\s\S]*?Separar\s*<\/button>/)
  })

  test('Integrantes simplifica el movimiento y Fase 6 elimina notices legacy locales', async () => {
    const members = await source(
      'src/features/solog/admin/grupos/admin.grupos.members-dialog.tsx',
    )
    const categories = await source(
      'src/features/solog/admin/grupos/admin.categories.dialog.tsx',
    )
    const groups = await source(
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
    )
    const css = await source('src/features/solog/admin/admin.css')

    expect(members).toContain('Agregar al grupo')
    expect(members).toContain('Buscar SKU compatible')
    expect(members).not.toContain('Sin SKU seleccionados')
    expect(members).not.toContain('Los SKU seleccionados pasarán a este grupo.')
    expect(members).not.toContain('admin-groups-members__context')
    expect(members).not.toContain('Agregar o mover SKU seleccionados')
    expect(members).not.toContain('El movimiento es atómico')
    expect(members).toContain('<AdminNotice tone="info">')
    expect(members).not.toContain('className="notice')
    expect(categories).not.toContain('className="notice')
    expect(groups).not.toContain('className="notice')
    expect(css).toContain('.admin-group-create__fields')
    expect(css).toContain('.admin-groups__candidate-list')
    expect(css).toContain('.admin-categories__rename-inline')
    expect(css).toContain('min-height: 48px')
    expect(css).toMatch(/\.admin-categories__row \{[^}]*border-bottom: 1px solid var\(--color-border\)/)
    expect(css).not.toMatch(/\.admin-categories__row \{[^}]*border-radius:/)
    expect(css).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.admin-group-create__fields,[\s\S]*?\.admin-categories__rename-inline/,
    )
  })
})
