import { expect, test } from 'bun:test'
test('Control retiró llamadas legacy y comparte modal de exportación', async () => {
  const api = await Bun.file('src/features/solog/api.ts').text()
  expect(api).not.toMatch(/rpc_solog_control(?:'|_detalle'|_export')/)
  for (const path of ['dashboard/admin.dashboard.v2.tsx','control/admin.control.v2.tsx']) {
    expect(await Bun.file('src/features/solog/admin/'+path).text()).toContain('AdminExportDialog')
  }
})
