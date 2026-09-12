import { SologApiError } from '../errors'
import type { CashierV3Panel, CashierV3PanelDelta } from './cajero.v3'

function invalid(): never {
  throw new SologApiError('SOLOG_INVALID_CONTRACT_RESPONSE')
}

// Reducer puro: patch/remoción por identidad y reemplazo autoritativo de KPI.
export function applyCashierV3PanelDelta(panel: CashierV3Panel, delta: CashierV3PanelDelta): CashierV3Panel {
  const groupIds = new Set(panel.groups.map((group) => group.grupo_id))
  const patches = new Map(delta.groups_patch.map((patch) => [patch.grupo_id, patch]))
  if (patches.size !== delta.groups_patch.length || [...patches.keys()].some((id) => !groupIds.has(id))) invalid()
  if (new Set(delta.count_queue_remove).size !== delta.count_queue_remove.length ||
    delta.count_queue_remove.some((id) => !groupIds.has(id))) invalid()
  if (new Set(delta.review_queue_remove).size !== delta.review_queue_remove.length) invalid()

  const countRemove = new Set(delta.count_queue_remove)
  const reviewRemove = new Set(delta.review_queue_remove)
  return {
    ...panel,
    groups: panel.groups.map((group) => {
      const patch = patches.get(group.grupo_id)
      return patch ? { ...group, ...patch } : group
    }),
    count_queue: panel.count_queue.filter((id) => !countRemove.has(id)),
    review_queue: panel.review_queue.filter((item) => !reviewRemove.has(item.detalle_id)),
    kpis: { ...delta.kpis },
  }
}
