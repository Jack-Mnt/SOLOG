import { describe, expect, test } from 'bun:test'
import { SologApiError, getSologErrorMessageFromUnknown } from '../src/features/solog/errors'
import { getCashierV4ErrorPolicy } from '../src/features/solog/cajero/cajero.v4.errors'

describe('Cajero V4: política de errores aislada', () => {
  test.each([
    ['SOLOG_DEVICE_UNAUTHORIZED', false, true, true],
    ['SOLOG_CONFIRMED_SNAPSHOT_INCOMPLETE', false, true, false],
    ['SOLOG_SESSION_DELIVERY_NOT_ALLOWED', false, true, true],
    ['SOLOG_SESSION_PRIORITY_CONFLICT', false, true, false],
    ['SOLOG_GROUP_ALREADY_COUNTED', false, true, false],
    ['SOLOG_NORMAL_COUNT_ALREADY_IN_SHIFT', false, true, false],
    ['SOLOG_RECOUNT_REQUIRES_PHYSICAL_RECOUNT', false, false, false],
    ['SOLOG_IDEMPOTENCY_CONFLICT', false, false, false],
    ['SOLOG_OPERATION_IN_PROGRESS', true, false, false],
    ['SOLOG_SESSION_CONFLICT', false, true, false],
    ['SOLOG_STOCK_EXPIRED', false, true, false],
    ['SOLOG_STOCK_TOO_CLOSE_TO_EXPIRY', false, true, false],
    ['SOLOG_SESSION_WINDOW_CLOSED', false, true, false],
    ['SOLOG_GROUPS_REVISION_CONFLICT', false, true, false],
  ] as const)('%s tiene clasificación y mensaje específico', (code, retryable, requiresRefresh, sessionInvalid) => {
    const policy = getCashierV4ErrorPolicy(new SologApiError(code))
    expect(policy).toMatchObject({ code, retryable, requiresRefresh, sessionInvalid, userFeedback: true, regenerateOperationId: false })
    expect(policy.message).not.toBe('No se pudo completar la operación en SOLOG.')
  })
  test('idempotency conflict no genera otro UUID ni habilita retry automático', () => {
    expect(getCashierV4ErrorPolicy(new SologApiError('SOLOG_IDEMPOTENCY_CONFLICT'))).toMatchObject({
      regenerateOperationId: false, retryable: false, requiresRefresh: false,
    })
    expect(getCashierV4ErrorPolicy(new SologApiError('SOLOG_OPERATION_IN_PROGRESS')).message).toContain('misma operación')
  })
  test('mensajes compartidos Admin/V3 permanecen intactos; desconocidos no inventan recovery', () => {
    const device = new SologApiError('SOLOG_DEVICE_UNAUTHORIZED')
    const before = getSologErrorMessageFromUnknown(device)
    expect(getCashierV4ErrorPolicy(device).message).not.toContain('se han eliminado')
    expect(getSologErrorMessageFromUnknown(device)).toBe(before)
    const admin = new SologApiError('SOLOG_ADMIN_ROLE_REQUIRED')
    expect(getCashierV4ErrorPolicy(admin).message).toBe(admin.message)
    expect(getCashierV4ErrorPolicy(new Error('respuesta incierta'))).toMatchObject({
      code: null, message: 'respuesta incierta', retryable: false, requiresRefresh: false,
      sessionInvalid: false, regenerateOperationId: false,
    })
  })
})
