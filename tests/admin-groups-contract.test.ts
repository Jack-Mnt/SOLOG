import { describe, expect, test } from 'bun:test'

describe('A4 contrato maestro V6', () => {
  test('lecturas y mutaciones separadas; ningún transporte Admin legacy', async () => {
    const api = await Bun.file('src/features/solog/api.ts').text()
    const adapter = await Bun.file('src/features/solog/admin/admin.management.v2.ts').text()
    expect(api).not.toMatch(/rpc_solog_admin'|rpc_solog_catalog'/)
    expect(adapter).toContain('rpc_solog_admin_master_read_v2')
    expect(adapter).toContain('rpc_solog_admin_master_v2')
    expect(adapter).not.toContain('.from(')
  })
  test('Grupos guarda y clasifica con revisión, sin workflow local de propuestas', async () => {
    const ui = await Bun.file('src/features/solog/admin/grupos/admin.grupos.v2.tsx').text()
    expect(ui).toContain("store.mutation('group_change_save'")
    expect(ui).toContain('reference.data.revisions.groups')
    expect(ui).toContain('member_codes: members')
    expect(ui).not.toMatch(/Guardar propuesta|Proponer edición|Proponer clasificación/)
  })
  test('los siete tipos y dos ámbitos vienen del contrato maestro V6', async () => {
    const adapter = await Bun.file('src/features/solog/admin/admin.management.v2.ts').text()
    const ui = await Bun.file('src/features/solog/admin/catalogo/admin.catalogo.v2.tsx').text()
    expect(adapter).toContain("'clasificacion_producto' | 'definicion_grupo'")
    expect(adapter).toContain("ambito: 'producto' | 'grupo'")
    expect(ui).toContain("useManagementQuery('catalog_changes', filters)")
    expect(ui).not.toContain('page_size')
  })
  test('publicación solo Edge v4 con UUID, sin artefactos del cliente', async () => {
    const api = await Bun.file('src/features/solog/admin/admin.management.v2.ts').text()
    expect(api).toContain("'conexion-admin', { body: { action: 'publish_catalog', operation_id: operationId } }")
    expect(api).not.toMatch(/storage\.from|prepared_at|generado_at|upsert|SHA-256/)
  })
})
