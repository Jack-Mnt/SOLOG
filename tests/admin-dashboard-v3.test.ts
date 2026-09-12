// Entry point preserved; Dashboard now consumes the V5 deployment / API v2.
import { expect, test } from 'bun:test'
test('Dashboard no conserva RPC ni KPI globales legacy', async () => {
  const api = await Bun.file('src/features/solog/api.ts').text()
  expect(api).not.toContain('rpc_solog_dashboard')
  const page = await Bun.file('src/features/solog/admin/dashboard/admin.dashboard.v2.tsx').text()
  expect(page).toMatch(/useAdminQuery\(["']dashboard_cards["'],\s*\{\}\)/)
  expect(page).toMatch(/useAdminQuery\(["']shift_grid["'],\s*\{\s*site_id:\s*site,\s*period\s*\}\)/)
  expect(page).toContain('data.data.totals.map')
  expect(page).not.toContain('.reduce(')
})
