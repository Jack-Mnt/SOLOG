import {
  Play,
  Send,
  type LucideIcon,
} from 'lucide-react'
import type { CajeroSessionController } from './cajero.session'

export interface CajeroSelectionGridItem {
  id: string
  name: string
  count: number
  completed?: number
  total?: number
  icon: LucideIcon
}

export function CajeroStartEmptyState({
  session,
  title,
  detail,
  buttonLabel,
}: {
  session: CajeroSessionController
  title: string
  detail: string
  buttonLabel: string
}) {
  return (
    <div className="cajero-empty-state cajero-start-empty-state" role="status">
      <Play aria-hidden="true" size={28} />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
        <button
          className="button"
          disabled={session.starting}
          onClick={() => void session.startSession()}
          type="button"
        >
          <Play aria-hidden="true" size={18} />
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}

export function CajeroSelectionGrid({
  items,
  disabled = false,
  selectedId,
  onSelect,
  label,
}: {
  items: CajeroSelectionGridItem[]
  disabled?: boolean
  selectedId?: string | null
  onSelect: (id: string) => void
  label: string
}) {
  return (
    <div className="cajero-selection-grid" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon
        const selected = selectedId === item.id
        return (
          <button
            aria-pressed={selected}
            className={selected ? 'is-active' : undefined}
            disabled={disabled || item.count === 0}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <Icon aria-hidden="true" size={23} />
            <span>
              <strong>{item.name}</strong>
              <small>
                {item.completed !== undefined && item.total !== undefined
                  ? `${item.completed}/${item.total} contados`
                  : `${item.count} ${item.count === 1 ? 'pendiente' : 'pendientes'}`}
              </small>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function CajeroSendBar({
  session,
  compact = false,
}: {
  session: CajeroSessionController
  compact?: boolean
}) {
  const pending = session.normalPendingCount
  const expectedAction = 'save_batch'
  return (
    <section
      className={`cajero-send-bar${compact ? ' cajero-send-bar--compact' : ''}`}
      aria-label="Enviar conteos pendientes"
    >
      <button
        className="button button--secondary"
        disabled={!session.canDeliver || pending === 0 || session.sending || Boolean(session.pendingAction && session.pendingAction !== expectedAction)}
        onClick={() => void session.sendPending()}
        type="button"
      >
        <Send aria-hidden="true" size={18} />
        {session.sending ? 'Enviando…' : 'Enviar conteo'}
      </button>
    </section>
  )
}
