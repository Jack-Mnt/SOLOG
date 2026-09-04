// Entry point preserved; Dashboard now consumes the V5 deployment / API v2.
import { expect, test } from 'bun:test'
test('Dashboard no conserva RPC ni KPI globales legacy', async () => {
  const api = await Bun.file('src/features/solog/api.ts').text()
  expect(api).not.toContain('rpc_solog_dashboard')
  const page = await Bun.file('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx').text()
  expect(page).toContain("useAdminQuery('dashboard_cards', {})")
  expect(page).toContain("useAdminQuery('shift_grid', { site_id: site, period })")
  expect(page).toContain('data.data.totals.map')
  expect(page).not.toContain('.reduce(')
})
