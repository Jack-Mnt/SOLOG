/* global process, fetch */
import { test, expect } from '@playwright/test'

// Este caso modifica una sesión real: requiere fixture aislada y opt-in explícito.
// No utiliza el proyecto productivo ni crea sesiones mediante SQL.
const enabled = process.env.SOLOG_E2E_ALLOW_MUTATION === '1'
  && process.env.SOLOG_E2E_ENV === 'isolated'
  && !!process.env.SOLOG_E2E_SUPABASE_URL
  && !!process.env.SOLOG_E2E_SUPABASE_ANON_KEY
  && !!process.env.SOLOG_E2E_ACCESS_TOKEN
  && !!process.env.SOLOG_E2E_DEVICE_TOKEN
  && !!process.env.SOLOG_E2E_RECOVERY_ID

test('Supabase aislado: cierre real de recovery sin scope y lectura posterior', async ({ page }) => {
  test.skip(!enabled, 'Requiere una sesión recovery propia ya preparada en Supabase aislado y opt-in.')
  await page.goto('/tests/browser/recovery-harness.html')
  const apiUrl = process.env.SOLOG_E2E_SUPABASE_URL
  const apiKey = process.env.SOLOG_E2E_SUPABASE_ANON_KEY
  const accessToken = process.env.SOLOG_E2E_ACCESS_TOKEN
  const deviceToken = process.env.SOLOG_E2E_DEVICE_TOKEN
  const recoveryId = process.env.SOLOG_E2E_RECOVERY_ID
  const result = await page.evaluate(async ({ apiUrl, apiKey, accessToken, deviceToken, recoveryId }) => {
    async function rpc(name, payload) {
      const response = await fetch(apiUrl + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
          Authorization: 'Bearer ' + accessToken,
        },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(name + ': HTTP ' + response.status + ' ' + JSON.stringify(body))
      return body
    }
    const before = await rpc('rpc_solog_cashier_bootstrap_v4', { p_payload: { device_token: deviceToken } })
    if (before.identity?.rol !== 'cajero' ||
        !before.recovery_sessions?.some(session => session.id === recoveryId) ||
        !before.device?.autorizado) {
      throw new Error('Fixture no válida: falta recovery propia o dispositivo autorizado.')
    }
    const finish = await rpc('rpc_solog_cashier_orphan_finish_v1', {
      p_payload: { conteo_id: recoveryId, operation_id: recoveryId, device_token: deviceToken },
    })
    const after = await rpc('rpc_solog_cashier_bootstrap_v4', { p_payload: { device_token: deviceToken } })
    return {
      status: finish.status,
      action: finish.action,
      id: finish.conteo_id,
      stillPresent: after.recovery_sessions?.some(session => session.id === recoveryId),
    }
  }, { apiUrl, apiKey, accessToken, deviceToken, recoveryId })
  expect(result).toEqual({
    status: 'finalizado',
    action: 'finish',
    id: recoveryId,
    stillPresent: false,
  })
})
