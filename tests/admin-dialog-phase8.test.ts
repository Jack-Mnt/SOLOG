import { describe, expect, test } from 'bun:test'

async function source(path: string) {
  return Bun.file(path).text()
}

describe('AdminDialog Fase 8 — Drawers', () => {
  test('AdminDialog controla el ancho de drawer sin crear variantes nuevas', async () => {
    const dialog = await source('src/features/solog/admin/admin.dialog.tsx')
    const css = await source('src/features/solog/admin/admin.css')

    expect(dialog).toContain("export type AdminDialogVariant = 'default' | 'wide' | 'drawer'")
    expect(dialog).toContain('drawerMaxWidth?: number')
    expect(dialog).toContain('--admin-dialog-drawer-max-width')
    expect(css).toContain('width: min(calc(100% - 48px), var(--admin-dialog-drawer-max-width, 960px));')
    expect(css).toContain('.admin-dialog--wide,\n  .admin-dialog--drawer {\n    width: 100%;')
  })

  test('Detalle diario separa Stock positivo/Stock 0 y usa StateViews', async () => {
    const dashboard = await source('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx')
    const contract = await source('src/features/solog/admin/admin.v2.ts')
    const migration = await source('supabase/migrations/20260920211755_solog_admin_drawers_phase8_daily_stock_class_v1.sql')

    expect(dashboard).toContain('drawerMaxWidth={720}')
    expect(dashboard).toContain('Stock positivo')
    expect(dashboard).toContain('Stock 0')
    expect(dashboard).toContain('role="tablist"')
    expect(dashboard).toContain('{ state: "Coincide", label: "Coincide" }')
    expect(contract).toContain("stock_class?: 'positive' | 'zero'")
    expect(dashboard).toContain('item.stock_class ?? (item.physical === 0 ? "zero" : "positive")')
    expect(migration).toContain("'stock_class'")
  })

  test('Cronología usa timeline y carga la quincena anterior solo al activar el switch', async () => {
    const control = await source('src/features/solog/admin/control/admin.control.v2.tsx')
    const context = await source('src/features/solog/admin/admin.v2.context.tsx')
    const css = await source('src/features/solog/admin/admin.css')

    expect(control).toContain('className="admin-control-chronology__timeline"')
    expect(control).toContain('role="switch"')
    expect(control).toContain('{ enabled: showPrevious }')
    expect(control).toContain('drawerMaxWidth={720}')
    expect(control).not.toContain('admin-control-chronology__table')
    expect(context).toContain('options: { enabled?: boolean } = {}')
    expect(css).not.toContain('max-height: 60vh')
  })

  test('Repeticiones consume detalle agregado por sede sin paginación ni tabla', async () => {
    const incidents = await source('src/features/solog/admin/incidencias/admin.incidencias.v2.tsx')
    const management = await source('src/features/solog/admin/admin.management.v2.ts')
    const migration = await source('supabase/migrations/20260920211759_solog_admin_drawers_phase8_incident_detail_sites_v1.sql')

    expect(incidents).toContain('useManagementQuery("detail_sites"')
    expect(incidents).toContain('drawerMaxWidth={640}')
    expect(incidents).toContain('className="admin-incidents__site-repetitions"')
    expect(incidents).toContain('useManagementQuery(\n    "detail"')
    expect(incidents).toContain('legacyFallback')
    expect(incidents).not.toContain('admin-incidents__detail-table')
    expect(management).toContain('detail_sites:')
    expect(migration).toContain("p_action='detail_sites'")
  })
})
