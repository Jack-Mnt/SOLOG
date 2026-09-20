import { describe, expect, test } from 'bun:test'

const source = (path: string) => Bun.file(path).text()

describe('AdminDialog Fase 5 — formularios y tareas', () => {
  test('AdminBinarySwitch representa selección binaria accesible y responsive', async () => {
    const primitive = await source('src/features/solog/admin/admin.primitives.tsx')
    const css = await source('src/features/solog/admin/admin.css')

    expect(primitive).toContain('export function AdminBinarySwitch')
    expect(primitive).toContain('role="radiogroup"')
    expect(primitive).toContain('role="radio"')
    expect(primitive).toContain('aria-checked={value === option.value}')
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      expect(primitive).toContain(key)
    }
    expect(css).toContain('.admin-binary-switch')
    expect(css).toContain('height: 36px')
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.admin-binary-switch \{[\s\S]*?height: 32px/)
  })

  test('Descargar ajuste usa sede contextual y switch binario de quincena', async () => {
    const dialog = await source(
      'src/features/solog/admin/control/admin.control.v2.export-dialog.tsx',
    )

    expect(dialog).toContain('title="Descargar ajuste"')
    expect(dialog).toContain('label="Quincena"')
    expect(dialog).toContain("label: 'Anterior'")
    expect(dialog).toContain("label: 'Actual'")
    expect(dialog).toContain("site_id: siteId")
    expect(dialog).not.toContain('Sede de exportación')
    expect(dialog).not.toContain('allowed_sites.map')
    expect(dialog).not.toContain('Período de exportación')
    expect(dialog).toContain('Las fechas se calculan con horario de Lima.')
    expect(dialog).toContain('<AdminNotice tone="error">{error}</AdminNotice>')
  })

  test('Editar grupo elimina ruido y solo permite guardar cambios efectivos', async () => {
    const groups = await source(
      'src/features/solog/admin/grupos/admin.grupos.v2.tsx',
    )

    expect(groups).toContain('title="Editar grupo"')
    expect(groups).toContain('const hasChanges = nameChanged || categoryChanged;')
    expect(groups).toContain('!hasChanges')
    expect(groups).not.toContain('La nombre operativa')
    expect(groups).not.toContain('Precio unitario: <Value value={group.precio}')
    expect(groups).toContain(
      'La categoría se aplicará a todos los integrantes del grupo.',
    )
    expect(groups).toContain('<AdminNotice tone="info">')
  })

  test('Valorizado usa selector binario, step 0.1 y bloquea guardado sin cambios', async () => {
    const valuation = await source(
      'src/features/solog/admin/admin.valuation-dialog.tsx',
    )

    expect(valuation).toContain("label: 'Unitario'")
    expect(valuation).toContain("label: 'Por paquete'")
    expect(valuation).toContain('label="Valorización"')
    expect(valuation).toContain('className="admin-dialog-context"')
    expect(valuation).toContain('step="0.1"')
    expect(valuation).not.toContain('Referencia sugerida')
    expect(valuation).toContain('disabled={pending || !hasChanges}')
    expect(valuation).toContain("Guardar valorizado")
    expect(valuation).toContain('<AdminNotice tone="error" action={retryAction}>')
  })

  test('Configurar producto usa destino binario y solo ofrece grupos compatibles', async () => {
    const setup = await source(
      'src/features/solog/admin/productos/admin.product-setup.dialog.tsx',
    )

    expect(setup).toContain('label="Destino"')
    expect(setup).toContain("label: 'Grupo existente'")
    expect(setup).toContain("label: 'Grupo unitario'")
    expect(setup).toMatch(
      /masterData\.snapshot\?\.groups\.filter\(\(group\) => group\.precio === target\.precio\)/,
    )
    expect(setup).toContain('<dt>Precio</dt>')
    expect(setup).toContain(
      'La configuración quedará preparada y se aplicará al publicar el Catálogo.',
    )
    expect(setup).not.toContain('staging')
    expect(setup).toContain('Guardar configuración')
    expect(setup.indexOf('label="Destino"')).toBeLessThan(
      setup.indexOf('Marca opcional'),
    )
  })

  test('Configuración pendiente prioriza el tipo y no agrega precio', async () => {
    const products = await source(
      'src/features/solog/admin/productos/admin.productos.v1.tsx',
    )

    expect(products).toContain('"Reincorporación"')
    expect(products).toContain('"Nuevo producto"')
    expect(products).toContain('· C. interno {item.c_interno}')
    expect(products).not.toContain('item.precio')
  })
})
