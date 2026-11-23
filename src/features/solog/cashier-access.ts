import { detailsRpc, type DetailsSummary } from './detalles/detalles.v2'

export type CashierAccessDestination = '/cajero' | '/detalles'

type ReadDeviceSummary = (deviceToken: string) => Promise<Pick<DetailsSummary, 'access'>>

/** El servidor sigue siendo la autoridad: no inferir autorización desde el rol o el token. */
export function cashierDestinationForAccess(access: DetailsSummary['access']): CashierAccessDestination {
  return access.current_device_state === 'autorizado' && access.current_device_matches_site
    ? '/cajero'
    : '/detalles'
}

/** Un navegador sin token previo debe ir a Detalles para iniciar la solicitud. */
export async function resolveCashierDestination(
  deviceToken: string | null,
  readSummary: ReadDeviceSummary = (token) => detailsRpc('summary', { device_token: token }),
): Promise<CashierAccessDestination> {
  if (!deviceToken) return '/detalles'
  const summary = await readSummary(deviceToken)
  return cashierDestinationForAccess(summary.access)
}
