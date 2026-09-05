import type { CashierPanel } from './cajero.v2'
import type { CajeroStockType } from './cajero.types'

export function initialCajeroStockType(search: string): CajeroStockType | null {
  const stock = new URLSearchParams(search).get('stock')
  return stock === 'zero' || stock === 'negative' ? stock : null
}

/** Visual progress only; the backend remains authoritative for period completion. */
export function deriveCajeroProgress(
  panel: Pick<CashierPanel, 'groups' | 'count_queue' | 'kpis'>,
  drafts: readonly { grupo_id: string }[],
) {
  const queued = new Set(panel.count_queue)
  const captured = new Set(drafts.map((draft) => draft.grupo_id))
  const groups = panel.groups.filter((group) => queued.has(group.grupo_id))
  const coverageCount = Math.min(panel.kpis.groups_total, panel.kpis.coverage_counted +
    groups.filter((group) => !group.cobertura_periodo && captured.has(group.grupo_id)).length)
  return {
    coverageCount,
    coveragePercent: panel.kpis.groups_total > 0 ? Math.round(coverageCount / panel.kpis.groups_total * 100) : 0,
    select(type: CajeroStockType, categoryId?: string) {
      const selected = groups.filter((group) =>
        (categoryId === undefined || group.categoria_id === categoryId) &&
        (type === 'positive' ? group.stock_teorico > 0 : type === 'zero' ? group.stock_teorico === 0 : group.stock_teorico < 0))
      return { ids: new Set(selected.map((group) => group.grupo_id)), total: selected.length,
        completed: selected.filter((group) => captured.has(group.grupo_id)).length }
    },
  }
}
