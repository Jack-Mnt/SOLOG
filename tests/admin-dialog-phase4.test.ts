import { describe, expect, test } from 'bun:test'

async function source(path: string) {
  return Bun.file(path).text()
}

describe('AdminDialog Fase 4 — confirmaciones', () => {
  test('Ignorar 30 días usa contexto compacto y conserva CTA Primary', async () => {
    const incidents = await source(
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
    )
    expect(incidents).toContain('Ignorar incidencia durante 30 días')
    expect(incidents).toContain('<dt>Alcance</dt>')
    expect(incidents).toContain('<dd>Todas las sedes</dd>')
    expect(incidents).toContain('<dt>Duración</dt>')
    expect(incidents).toContain('<dd>30 días</dd>')
    expect(incidents).toContain('Ignorar no resuelve ni elimina la incidencia.')
    expect(incidents).toContain('className="button button--primary"')
  })

  test('eliminación manual comunica aprobación y mantiene tono Danger', async () => {
    const incidents = await source(
      'src/features/solog/admin/incidencias/admin.incidencias.v2.tsx',
    )
    expect(incidents).toContain('title="Aprobar eliminación"')
    expect(incidents).toContain(
      'El cambio quedará aprobado y listo para incluirse en la próxima publicación del Catálogo.',
    )
    expect(incidents).toContain('<dt>Producto</dt>')
    expect(incidents).toContain('<dt>C. interno</dt>')
    expect(incidents).toContain('<dt>Detectado en</dt>')
    expect(incidents).toContain('<AdminNotice tone="info">')
    expect(incidents).toContain(
      'El producto no se eliminará hasta publicar el Catálogo.',
    )
    expect(incidents).toContain('className="button button--danger"')
    expect(incidents).toContain('<CircleOff size={16} aria-hidden="true" />')
  })

  test('Productos autoaprueba estado manual, elimina Modalidad y diferencia tonos', async () => {
    const products = await source(
      'src/features/solog/admin/productos/admin.productos.v1.tsx',
    )
    const store = await source(
      'src/features/solog/admin/catalogo/admin.catalogo.store.ts',
    )

    expect(products).toContain('"Aprobar exclusión"')
    expect(products).toContain('"Aprobar reincorporación"')
    expect(products).not.toContain('<dt>Modalidad</dt>')
    expect(products).toContain(
      'action === "exclude" ? "button button--danger" : "button"',
    )
    expect(products).toContain('className="admin-dialog-context"')
    expect(products).toContain('<AdminNotice tone="info">')
    expect(store).toContain("status: 'aprobado'")
    expect(store).toContain("tipo: 'reincorporar_producto'")
  })

  test('notice informativo de confirmación usa tipografía compacta sin alterar notices globales', async () => {
    const css = await source('src/features/solog/admin/admin.css')
    expect(css).toContain('.admin-dialog-confirmation > .admin-notice--info .admin-notice__message')
    expect(css).toContain('font-size: 0.8125rem')
  })

  test('Dispositivos no ofrece reemplazo ni muestra UUID en el Dialog', async () => {
    const devices = await source(
      'src/features/solog/admin/dispositivos/admin.dispositivos.v2.tsx',
    )
    expect(devices).not.toContain('| "replace"')
    expect(devices).not.toContain('Reemplazar tablet')
    expect(devices).not.toContain(
      '{confirmation.device.site} · {confirmation.device.id}',
    )
    expect(devices).toContain('"Autorizar dispositivo"')
    expect(devices).toContain('"Revocar dispositivo"')
    expect(devices).toContain('"Rechazar solicitud"')
    expect(devices).toContain(
      'La sede quedará disponible para una nueva solicitud de acceso.',
    )
    expect(devices).toContain('"button button--danger"')
  })
})
