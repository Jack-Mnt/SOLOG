export const DETAILS_STOCK_STALE_LIMIT_MS = 2 * 60 * 60 * 1000

export function isDetailsStockStale(
  confirmedAt: string | null,
  serverNow: string,
): boolean {
  if (!confirmedAt) return false
  const confirmedAtMs = Date.parse(confirmedAt)
  const serverNowMs = Date.parse(serverNow)
  if (!Number.isFinite(confirmedAtMs) || !Number.isFinite(serverNowMs)) return false
  return Math.max(0, serverNowMs - confirmedAtMs) >= DETAILS_STOCK_STALE_LIMIT_MS
}
